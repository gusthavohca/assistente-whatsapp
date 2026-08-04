// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================

const claude = require('./claude');
const zapi = require('./zapi');
const { processarComandoAdmin } = require('./admin');
const { lerFlyers, lerStatusGia, registrarPedido, registrarAtendimento, salvarPerguntaSemResposta, salvarExemploTom, salvarClienteMeta, lerClienteMeta, salvarRelayPendente, lerRelayPorAlerta, lerRelaysPendentes, deletarRelayPendente, lerLinksEventos, lerCalendario, marcarSituacaoCliente } = require('./firebase');
const NUMERO_ADMIN = process.env.NUMERO_GUSTHAVO_PESSOAL;

// ============================================================================
// MENSAGENS DE FECHAMENTO POR TIPO DE FLYER
// ============================================================================

const MENSAGENS_FECHAMENTO = {
  entrada_sexta:      'O que acha? Posso deixar seu nome na lista ou prefere garantir o ingresso antecipado?',
  entrada_sabado:     'O que acha? Posso deixar seu nome na lista ou prefere garantir o ingresso antecipado?',
  camarote_sexta:     'O que acha? Quer que eu reserve uma opção para você?',
  camarote_sabado:    'O que acha? Quer que eu reserve uma opção para você?',
  aniversario_sexta:  'O que acha? Vamos comemorar na Le Club?',
  aniversario_sabado: 'O que acha? Vamos comemorar na Le Club?',
};

// ============================================================================
// BUSCAR FLYERS DO FIREBASE (somente painel)
// ============================================================================

async function obterFlyers() {
  const flyersFirebase = await lerFlyers();
  return {
    programacao_sexta:  flyersFirebase['programacao_sexta']  || null,
    programacao_sabado: flyersFirebase['programacao_sabado'] || null,
    entrada_sexta:      flyersFirebase['entrada_sexta']      || null,
    entrada_sabado:     flyersFirebase['entrada_sabado']     || null,
    camarote_sexta:     flyersFirebase['camarote_sexta']     || null,
    camarote_sabado:    flyersFirebase['camarote_sabado']    || null,
    aniversario_sexta:  flyersFirebase['aniversario_sexta']  || null,
    aniversario_sabado: flyersFirebase['aniversario_sabado'] || null,
  };
}

// ============================================================================
// SISTEMA DE DEBOUNCE
// ============================================================================

const TEMPO_ESPERA_MS = 25000;
const MAX_MENSAGENS = 3; // teto rigido: nunca envia mais que isso por resposta
const RENOVAR_DIGITANDO_MS = 7000;
const buffersDeMensagens = {};
const timersDeEspera = {};
const timersDeDigitando = {};

// Nomes de clientes ja capturados nesta execucao (evita gravacoes repetidas)
const nomesCapturados = new Set();
const idsProcessados = new Set();
const MAX_IDS_PROCESSADOS = 800;

// ===== MODO PONTE (relay admin <-> cliente) =====
const COMANDOS_ADMIN = ['cbp pausar','pausar cbp','desativar cbp','cbp desativar','cbp ativar','ativar cbp','ligar cbp','cbp ligar','gia pausar','pausar gia','desativar gia','gia desativar','gia ativar','ativar gia','ligar gia','gia ligar','ajuda','help','comandos'];
// Comandos que COMECAM com estas palavras tambem sao do admin (integracao PNE).
// SEM ISSO, o modo ponte encaminharia para o CLIENTE qualquer comando digitado
// quando existe exatamente UMA pendencia aberta — incluindo "PNE COOKIES ...",
// o que vazaria a sessao do sistema da casa para um cliente qualquer.
const PREFIXOS_ADMIN = ['pne ', 'lista ', 'reserva ', 'aniv ', 'aniversario ', 'aniversário '];

function pareceComandoAdmin(texto) {
  const t = (texto || '').toLowerCase().trim();
  if (COMANDOS_ADMIN.some((c) => t.includes(c))) return true;
  return PREFIXOS_ADMIN.some((pre) => t.startsWith(pre));
}

// Janelas de madrugada de evento (SP, UTC-3): sex 23h ate sab 4h; sab 23h ate dom 4h
function ehMadrugadaEvento() {
  const agoraSP = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dia = agoraSP.getUTCDay(); // 0=Dom 5=Sex 6=Sab
  const h = agoraSP.getUTCHours();
  return (dia === 5 && h === 23) || (dia === 6 && h < 4) || (dia === 6 && h === 23) || (dia === 0 && h < 4);
}

async function iniciarRelay(clientePhone, pergunta, holdingMsg) {
  let nome = '';
  try { const m = await lerClienteMeta(clientePhone); nome = m.nome || m.nomeInformado || m.nomeWhats || ''; } catch (e) {}
  const alertId = await zapi.enviarAlertaRelay(nome, clientePhone, pergunta);
  if (alertId) { await salvarRelayPendente(alertId, { clientePhone, pergunta, criadoEm: Date.now() }); }
  if (holdingMsg) { try { await zapi.enviarTexto(clientePhone, holdingMsg); } catch (e) {} }
  await claude.pausarClientePorNaoSaber(clientePhone);
}

// Cria uma PONTE (relay) sem holding e sem pausar — usado quando o CBP ja
// respondeu ao cliente, mas quer que o admin possa complementar/fechar a resposta.
// ===== NORMALIZACAO E SANITIZACAO DE ETIQUETAS =====
const FLYERS_VALIDOS = ['programacao_sexta','programacao_sabado','entrada_sexta','entrada_sabado','camarote_sexta','camarote_sabado','aniversario_sexta','aniversario_sabado'];

// Aceita etiqueta escrita sem o dia (ex.: "entrada") e resolve pelo dia citado
// na conversa ou pelo proximo dia de evento. Evita o bug de tag vazando como texto.
function normalizarFlyer(nomeBruto, textoConversa) {
  let n = String(nomeBruto || '').trim().toLowerCase().replace(/\s+/g, '_');
  n = n.replace('sábado', 'sabado').replace('sexta-feira', 'sexta');
  if (FLYERS_VALIDOS.includes(n)) return n;
  const base = ['programacao','entrada','camarote','aniversario'].find((b) => n.startsWith(b));
  if (!base) return null;
  let dia = null;
  if (/_sexta|sexta/.test(n)) dia = 'sexta';
  else if (/_sabado|sabado/.test(n)) dia = 'sabado';
  if (!dia) {
    const t = String(textoConversa || '').toLowerCase();
    if (t.includes('sabado') || t.includes('sábado')) dia = 'sabado';
    else if (t.includes('sexta')) dia = 'sexta';
  }
  if (!dia) {
    const agoraSP = new Date(Date.now() - 3 * 60 * 60 * 1000);
    dia = agoraSP.getUTCDay() === 6 ? 'sabado' : 'sexta';
  }
  const candidato = `${base}_${dia}`;
  return FLYERS_VALIDOS.includes(candidato) ? candidato : null;
}

// Rede de seguranca final: remove QUALQUER etiqueta [ ... ] que tenha sobrado,
// para que nunca chegue ao cliente.
function sanitizarTexto(txt) {
  return String(txt || '')
    .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function criarPontePara(clientePhone, pergunta) {
  let nome = '';
  try { const m = await lerClienteMeta(clientePhone); nome = m.nome || m.nomeInformado || m.nomeWhats || ''; } catch (e) {}
  const alertId = await zapi.enviarAlertaRelay(nome, clientePhone, pergunta);
  if (alertId) { await salvarRelayPendente(alertId, { clientePhone, pergunta, criadoEm: Date.now() }); }
}

// ============================================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA
// ============================================================================

async function processarMensagem(dadosDoWebhook) {
  try {
    // F1 (auditoria 04/08): o campo "phone" da Z-API pode, para o mesmo cliente,
    // alternar entre o numero real e um identificador de privacidade "@lid" gerado
    // pelo WhatsApp (comportamento documentado pela propria Z-API como inconsistente).
    // "chatLid" e descrito pela Z-API como o identificador mais estavel. Preferimos
    // chatLid quando presente; sem ele, caimos para phone (comportamento anterior).
    // Isso evita que o mesmo cliente vire "dois clientes sem memoria" no Firestore.
    const telefoneCliente = dadosDoWebhook.chatLid || dadosDoWebhook.phone;
    const textoRecebido = dadosDoWebhook.text?.message;
    const enviadaPorNos = dadosDoWebhook.fromMe;

    // Se veio de GRUPO, ignorar
    const ehDeGrupo =
      dadosDoWebhook.isGroup === true ||
      (telefoneCliente && telefoneCliente.includes('-group'));

    if (ehDeGrupo) {
      console.log(`👥 Mensagem de grupo ignorada. ID: ${telefoneCliente}`);
      return;
    }

    // Deduplicacao: ignora reentrega do mesmo messageId pela Z-API
    const idWebhook = dadosDoWebhook.messageId || dadosDoWebhook.id;
    if (idWebhook) {
      if (idsProcessados.has(idWebhook)) { return; }
      idsProcessados.add(idWebhook);
      if (idsProcessados.size > MAX_IDS_PROCESSADOS) {
        const arr = Array.from(idsProcessados).slice(-MAX_IDS_PROCESSADOS);
        idsProcessados.clear();
        arr.forEach((x) => idsProcessados.add(x));
      }
    }

    // Verifica se é admin
    const telefoneAdminLimpo = NUMERO_ADMIN ? NUMERO_ADMIN.replace(/\D/g, '') : '';
    const telefoneClienteLimpo = telefoneCliente.replace(/\D/g, '');
    const ehAdmin = telefoneAdminLimpo && telefoneClienteLimpo.includes(telefoneAdminLimpo.slice(-8));

    // Se foi enviada por nós mesmos (fromMe)
    if (enviadaPorNos) {
      // 1) Se foi o PRÓPRIO BOT que enviou, ignora — não é intervenção manual.
      //    (Necessário porque, com "Notificar as enviadas por mim" ligado na Z-API,
      //     os envios automáticos do CBP também voltam como fromMe.)
      const idMensagem = dadosDoWebhook.messageId || dadosDoWebhook.id;
      if (zapi.foiEnviadoPeloBot(idMensagem)) {
        return;
      }

      // REDE DE SEGURANCA: se a Z-API nao devolveu o messageId no envio (ou o
      // processo reiniciou), o rastreio por ID falha e a mensagem do PROPRIO BOT
      // seria lida como resposta manual do Gusthavo — o bot se pausaria sozinho e
      // gravaria o proprio texto como "exemplo de tom", degradando a voz dele.
      // Conferir o TEXTO enviado nos ultimos minutos elimina esse falso positivo.
      if (textoRecebido && zapi.textoFoiEnviadoPeloBot(textoRecebido)) {
        console.log('🛡️ Eco da propria mensagem do CBP ignorado (protecao de tom/pausa)');
        return;
      }

      // 2) Caso contrário, é uma RESPOSTA MANUAL do Gusthavo pelo WhatsApp da casa.
      if (!ehAdmin) {
        // Cancela qualquer timer pendente — evita que o CBP responda por cima da intervenção manual
        if (timersDeEspera[telefoneCliente]) {
          clearTimeout(timersDeEspera[telefoneCliente]);
          delete timersDeEspera[telefoneCliente];
        }
        if (timersDeDigitando[telefoneCliente]) {
          clearInterval(timersDeDigitando[telefoneCliente]);
          delete timersDeDigitando[telefoneCliente];
        }
        delete buffersDeMensagens[telefoneCliente];

        // Pausa o CBP por 30min — e reinicia a contagem a cada nova mensagem manual
        await claude.registrarRespostaManual(telefoneCliente);

        if (textoRecebido && textoRecebido.trim()) {
          // Aprender o tom do Gusthavo
          salvarExemploTom(textoRecebido.trim()).catch(() => {});
          // Salvar a fala manual no histórico → CBP volta no contexto certo depois dos 30min
          claude.registrarMensagemManualNoHistorico(telefoneCliente, textoRecebido.trim()).catch(() => {});
        }
        console.log(`✍️ Resposta manual para ${telefoneCliente} — CBP em silencio por 30min a partir de AGORA (contador reiniciado), contexto salvo`);
      }
      return;
    }

    // MODO PONTE: admin respondeu um alerta -> encaminha pro cliente
    if (ehAdmin && !enviadaPorNos && textoRecebido) {
      const refAlerta = dadosDoWebhook.referenceMessageId;
      let relay = null, refUsado = null;
      if (refAlerta) { relay = await lerRelayPorAlerta(refAlerta); refUsado = refAlerta; }
      if (!relay && !pareceComandoAdmin(textoRecebido)) {
        const pendentes = await lerRelaysPendentes();
        if (pendentes.length === 1) { relay = pendentes[0].dados; refUsado = pendentes[0].id; }
      }
      if (relay && relay.clientePhone) {
        await zapi.enviarTexto(relay.clientePhone, textoRecebido);
        claude.registrarMensagemManualNoHistorico(relay.clientePhone, textoRecebido).catch(() => {});
        if (refUsado) await deletarRelayPendente(refUsado);
        await claude.liberarCliente(relay.clientePhone);
        console.log('Relay: resposta do admin encaminhada para ' + relay.clientePhone);
        return;
      }
    }

    // -- CRM: captura o nome do cliente (do WhatsApp) para a aba Clientes --
    if (!nomesCapturados.has(telefoneCliente)) {
      const _cn = dadosDoWebhook.chatName || '';
      const _sn = dadosDoWebhook.senderName || '';
      const _temLetra = (x) => /[a-zA-ZÀ-ÿ]/.test(x);
      const nomeWhats = _temLetra(_cn) ? _cn : (_temLetra(_sn) ? _sn : '');
      if (nomeWhats) {
        nomesCapturados.add(telefoneCliente);
        salvarClienteMeta(telefoneCliente, { nomeWhats: nomeWhats.trim() }).catch(() => {});
      }
    }

    // -- CRM: detectar origem de anúncio CTWA (Click-to-WhatsApp do Meta Ads) --
    const referral = dadosDoWebhook.referral;
    if (referral && (referral.sourceType === 'ad' || referral.ctwaClid || referral.sourceId)) {
      salvarClienteMeta(telefoneCliente, {
        origemAnuncio: 'meta_ctwa',
        campanhaId:    referral.sourceId  || '',
        campanhaUrl:   referral.sourceUrl || '',
        ctwaClid:      referral.ctwaClid  || '',
        primeiraInteracaoAnuncio: Date.now(),
      }).catch(() => {});
      console.log(`📢 Lead de anúncio CTWA detectado: ${telefoneCliente} (ad: ${referral.sourceId || 'desconhecido'})`);
    }

    // Se não é admin, verifica se o CBP está ativo
    if (!ehAdmin) {
      const giaAtivo = await lerStatusGia();
      if (!giaAtivo) {
        console.log('⏸️ CBP pausado, ignorando mensagem de cliente.');
        return;
      }
    }

    // Se não tem texto, ignorar
    if (!textoRecebido) return;

    console.log(`📥 Mensagem recebida de ${telefoneCliente}: "${textoRecebido}"`);

    // PAUSA DE 30 MIN APOS RESPOSTA MANUAL — checada AQUI, antes de qualquer coisa.
    // Antes isso so era descoberto 25s depois, ja com o "digitando..." na tela do
    // cliente: ele via o CBP digitando e nada chegava. Agora o silencio e total.
    if (!ehAdmin && await claude.estaEmPausaManual(telefoneCliente)) {
      console.log(`🔇 ${telefoneCliente} em pausa manual — mensagem recebida e guardada, CBP em silencio`);
      return;
    }

    // Adicionar mensagem ao buffer do cliente
    if (!buffersDeMensagens[telefoneCliente]) {
      buffersDeMensagens[telefoneCliente] = [];
    }
    buffersDeMensagens[telefoneCliente].push(textoRecebido);

    // Cancelar timers anteriores
    if (timersDeEspera[telefoneCliente]) {
      clearTimeout(timersDeEspera[telefoneCliente]);
    }
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
    }

    // Mostrar "digitando..."
    zapi.mostrarDigitando(telefoneCliente);

    timersDeDigitando[telefoneCliente] = setInterval(() => {
      zapi.mostrarDigitando(telefoneCliente);
    }, RENOVAR_DIGITANDO_MS);

    console.log(`⏱️  Aguardando ${TEMPO_ESPERA_MS / 1000}s para responder ${telefoneCliente}...`);

    timersDeEspera[telefoneCliente] = setTimeout(() => {
      processarBufferDoCliente(telefoneCliente);
    }, TEMPO_ESPERA_MS);

  } catch (erro) {
    console.log('❌ Erro ao processar mensagem:');
    console.log(erro.message);
  }
}

// ============================================================================
// FUNÇÃO: PROCESSAR BUFFER ACUMULADO DE UM CLIENTE
// ============================================================================

async function processarBufferDoCliente(telefoneCliente) {
  try {
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
      delete timersDeDigitando[telefoneCliente];
    }

    const mensagensAcumuladas = buffersDeMensagens[telefoneCliente] || [];
    delete buffersDeMensagens[telefoneCliente];
    delete timersDeEspera[telefoneCliente];

    if (mensagensAcumuladas.length === 0) return;

    const textoFinal = mensagensAcumuladas.join('\n');

    console.log(`🔄 Processando ${mensagensAcumuladas.length} mensagem(ns) de ${telefoneCliente}`);

    const telefoneAdmin = NUMERO_ADMIN ? NUMERO_ADMIN.replace(/\D/g, '') : '';
    const telefoneClean = telefoneCliente.replace(/\D/g, '');
    const ehAdmin = telefoneAdmin && telefoneClean.includes(telefoneAdmin.slice(-8));

    // ── ADMIN ──
    // MODO PONTE: madrugada de evento (sex->sab e sab->dom, 23h-4h)
    if (!ehAdmin && ehMadrugadaEvento()) {
      await iniciarRelay(telefoneCliente, textoFinal, 'Deixa eu confirmar uma informacao rapidinho e ja te respondo, beleza?');
      console.log('MODO PONTE (madrugada) para ' + telefoneCliente);
      return;
    }

    if (ehAdmin) {
      console.log('🔑 Modo Admin ativado');
      const respostaAdmin = await processarComandoAdmin(textoFinal);
      await zapi.enviarTexto(telefoneCliente, respostaAdmin);
      return;
    }

    // ── CLIENTE ──
    const resposta = await claude.perguntarParaClaude(telefoneCliente, textoFinal);

    // Se retornou null, CBP está em pausa manual — não responde
    if (!resposta) {
      console.log(`🔇 CBP em pausa manual — sem resposta para ${telefoneCliente}`);
      return;
    }

    console.log(`🤖 Resposta tipo: "${resposta.tipo}"`);

    // Falha da IA -> MODO PONTE (voce responde no admin e o CBP encaminha)
    if (resposta.tipo === 'falha_ia') {
      await iniciarRelay(telefoneCliente, resposta.pergunta || textoFinal, 'Deixa eu confirmar isso rapidinho e ja te respondo, beleza?');
      console.log('[FALHA_IA] -> MODO PONTE para ' + telefoneCliente);
      return;
    }

    // Se for flyer direto (programação detectada pelo claude.js)
    if (resposta.tipo === 'flyer') {
      await zapi.enviarImagem(telefoneCliente, resposta.url);
      await registrarAtendimento(textoFinal.substring(0, 50));
      console.log(`✅ Flyer enviado para ${telefoneCliente}\n`);
      return;
    }

    // Se for texto normal
    const respostaDaClaude = resposta.mensagem;

    let precisaAlertar = false;
    let textoLimpo = respostaDaClaude;
    const flyersSolicitados = [];

    // Detectar [NAO_SEI] — CBP nao soube: entra em MODO PONTE (encaminha pro admin)
    if (textoLimpo.includes('[NAO_SEI]')) {
      textoLimpo = textoLimpo.replace(/\[NAO_SEI\]/g, '').trim();
      const holding = textoLimpo || 'Deixa eu confirmar isso rapidinho e ja te respondo, beleza?';
      await iniciarRelay(telefoneCliente, textoFinal, holding);
      await salvarPerguntaSemResposta(telefoneCliente, textoFinal);
      console.log('[NAO_SEI] -> MODO PONTE para ' + telefoneCliente);
      return;
    }

    // Detectar [MUITOS_CONVIDADOS] — grupo grande: entra em MODO PONTE
    if (textoLimpo.includes('[MUITOS_CONVIDADOS]')) {
      await iniciarRelay(telefoneCliente, textoFinal, 'Deixa eu confirmar a melhor condicao pra um grupo desse tamanho e ja te respondo, beleza?');
      console.log('[MUITOS_CONVIDADOS] -> MODO PONTE para ' + telefoneCliente);
      return;
    }

    // Detectar flyers solicitados — aceita qualquer nome e normaliza (anti-bug de tag vazada)
    const regexFlyer = /\[ENVIAR_FLYER:\s*([^\]]+)\]/gi;
    let matchFlyer;
    while ((matchFlyer = regexFlyer.exec(respostaDaClaude)) !== null) {
      const norm = normalizarFlyer(matchFlyer[1], textoFinal + ' ' + respostaDaClaude);
      if (norm && !flyersSolicitados.includes(norm)) flyersSolicitados.push(norm);
      else if (!norm) console.log('⚠️ Etiqueta de flyer nao reconhecida:', matchFlyer[1]);
    }
    textoLimpo = textoLimpo.replace(regexFlyer, '').trim();

    // Detectar alerta
    if (textoLimpo.includes('[ALERTAR_GUSTHAVO]')) {
      precisaAlertar = true;
      textoLimpo = textoLimpo.replace(/\[ALERTAR_GUSTHAVO\]/g, '').trim();
    }

    // Detectar [NOME:xxx] — cliente informou o nome; salva no CRM (permanente).
    // AGUARDA a gravacao (nao dispara e esquece): se o cliente mandar outra
    // mensagem rapido em seguida, a leitura do cadastro precisa ver o nome ja
    // salvo — do contrario o CBP pode perguntar o nome de novo por causa de
    // uma corrida entre a gravacao e a proxima leitura.
    // F4 (auditoria 04/08): usa flag global — se a IA emitir mais de uma etiqueta
    // [NOME:...] na mesma resposta (caso raro), a ULTIMA e considerada a valida.
    const regexNome = /\[NOME:([^\]]+)\]/g;
    let matchNome, nomeCapturado = null;
    while ((matchNome = regexNome.exec(textoLimpo)) !== null) {
      if (matchNome[1].trim()) nomeCapturado = matchNome[1].trim();
    }
    if (nomeCapturado) {
      try {
        await salvarClienteMeta(telefoneCliente, {
          nomeInformado: nomeCapturado,
          jaPerguntouNome: true,
        });
      } catch (e) { console.log('⚠️ Erro ao salvar nome do cliente:', e.message); }
    }
    textoLimpo = textoLimpo.replace(/\[NOME:[^\]]+\]/g, '').trim();

    // Detectar [SITUACAO:chave] — CRM ativo: classifica a conversa pra follow-up depois.
    // Pode vir mais de uma tag na mesma resposta.
    const regexSituacao = /\[SITUACAO:\s*([a-z0-9_]+)\s*\]/gi;
    let matchSituacao;
    while ((matchSituacao = regexSituacao.exec(respostaDaClaude)) !== null) {
      const chaveSituacao = matchSituacao[1].trim().toLowerCase();
      marcarSituacaoCliente(telefoneCliente, chaveSituacao).catch(() => {});
    }
    textoLimpo = textoLimpo.replace(regexSituacao, '').trim();

    // F2 (auditoria 04/08): a IA agora e instruida (prompt.js) a emitir a etiqueta
    // [PERGUNTOU_NOME] toda vez que perguntar o nome do cliente — deteccao
    // deterministica, nao depende de reconhecer a frase exata. A regex antiga
    // continua como REDE DE SEGURANCA (caso a etiqueta nao venha por algum motivo).
    const perguntouViaEtiqueta = /\[PERGUNTOU_NOME\]/.test(textoLimpo);
    textoLimpo = textoLimpo.replace(/\[PERGUNTOU_NOME\]/g, '').trim();
    const perguntouViaFrase = /\bqual\s+(?:e\s+)?(?:o\s+)?seu\s+nome|como\s+(?:voc[eê]\s+)?se\s+chama|me\s+(?:diz|fala|passa)\s+seu\s+nome/i.test(textoLimpo);
    if (perguntouViaEtiqueta || perguntouViaFrase) {
      try { await salvarClienteMeta(telefoneCliente, { jaPerguntouNome: true }); }
      catch (e) { console.log('⚠️ Erro ao marcar que o nome foi perguntado:', e.message); }
    }

    // SANITIZACAO FINAL — nenhuma etiqueta pode chegar ao cliente
    textoLimpo = sanitizarTexto(textoLimpo);

    // F3 (auditoria 04/08): TRAVA FINAL — recheca a pausa manual bem aqui, na borda
    // do envio. O processamento acima (chamada a IA) pode levar alguns segundos;
    // se voce respondeu manualmente ENQUANTO isso rodava, os timers foram cancelados
    // mas esta chamada ja estava em voo e nao seria interrompida sem esta checagem.
    // Sem isso, a resposta automatica podia sair por cima da sua resposta manual.
    if (await claude.estaEmPausaManual(telefoneCliente)) {
      console.log(`🛑 Pausa manual detectada na borda do envio — resposta automatica descartada para ${telefoneCliente}`);
      return;
    }

    // Enviar texto em pedaços — com TETO RIGIDO de mensagens.
    // O texto e quebrado a cada linha em branco; se passar do limite, o excedente
    // e juntado na ultima mensagem (nada de conteudo se perde).
    let pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');
    if (pedacos.length > MAX_MENSAGENS) {
      const inicio = pedacos.slice(0, MAX_MENSAGENS - 1);
      const resto = pedacos.slice(MAX_MENSAGENS - 1).join('\n');
      pedacos = inicio.concat([resto]);
      console.log(`✂️ Resposta tinha ${pedacos.length + 1} blocos — reduzida para ${MAX_MENSAGENS}`);
    }
    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      await esperar(1500);
    }

    // Enviar flyers solicitados + mensagem de fechamento
    const flyersAtuais = await obterFlyers();
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = flyersAtuais[nomeFlyer];
      if (urlFlyer) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        claude.registrarEnvio(telefoneCliente, 'flyer_' + nomeFlyer).catch(() => {});
        await esperar(1500);

        // Enviar mensagem de fechamento se houver para este tipo de flyer
        const mensagemFechamento = MENSAGENS_FECHAMENTO[nomeFlyer];
        if (mensagemFechamento) {
          await zapi.enviarTexto(telefoneCliente, mensagemFechamento);
          await esperar(1000);
        }
      }
    }

    // Alertar admin — MODO PONTE. Camarote/reserva PARA de responder ate o Gusthavo assumir.
    if (precisaAlertar) {
      const querCamarote = /camarote|reserva|sof[aá]|mapa/i.test(textoFinal + ' ' + textoLimpo);
      if (querCamarote) {
        await iniciarRelay(telefoneCliente, textoFinal, null); // ja respondeu; so alerta e pausa
        console.log('[CAMAROTE] -> MODO PONTE (pausado) para ' + telefoneCliente);
      } else {
        await criarPontePara(telefoneCliente, textoFinal);
      }
    }

    // Registrar relatório
    await registrarAtendimento(textoFinal.substring(0, 50));
    if (textoLimpo.toLowerCase().includes('lista')) await registrarPedido('lista');
    if (textoLimpo.toLowerCase().includes('camarote')) await registrarPedido('camarote');
    if (textoLimpo.toLowerCase().includes('aniversar')) await registrarPedido('aniversario');

    console.log(`✅ Atendimento concluído para ${telefoneCliente}\n`);
  } catch (erro) {
    console.log('❌ Erro ao processar buffer:');
    console.log(erro.message);
  }
}

// ============================================================================
// FUNÇÃO AUXILIAR: ESPERAR
// ============================================================================

function esperar(milissegundos) {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  processarMensagem,
};