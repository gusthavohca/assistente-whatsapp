// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================

const claude = require('./claude');
const zapi = require('./zapi');
const { processarComandoAdmin } = require('./admin');
const { lerCerebroDoGusthavo, lerFlyers, lerStatusGia, registrarPedido, registrarAtendimento, salvarPerguntaSemResposta, salvarExemploTom, salvarClienteMeta, lerClienteMeta, salvarRelayPendente, lerRelayPorAlerta, lerRelaysPendentes, deletarRelayPendente } = require('./firebase');
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
const RENOVAR_DIGITANDO_MS = 7000;
const buffersDeMensagens = {};
const timersDeEspera = {};
const timersDeDigitando = {};

// Nomes de clientes ja capturados nesta execucao (evita gravacoes repetidas)
const nomesCapturados = new Set();

// ===== MODO PONTE (relay admin <-> cliente) =====
const COMANDOS_ADMIN = ['gia pausar','pausar gia','desativar gia','gia desativar','gia ativar','ativar gia','ligar gia','gia ligar','ajuda','help','comandos'];
function pareceComandoAdmin(texto) {
  const t = (texto || '').toLowerCase().trim();
  return COMANDOS_ADMIN.some((c) => t.includes(c));
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
  claude.pausarClientePorNaoSaber(clientePhone);
}

// ============================================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA
// ============================================================================

async function processarMensagem(dadosDoWebhook) {
  try {
    const telefoneCliente = dadosDoWebhook.phone;
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

    // Verifica se é admin
    const telefoneAdminLimpo = NUMERO_ADMIN ? NUMERO_ADMIN.replace(/\D/g, '') : '';
    const telefoneClienteLimpo = telefoneCliente.replace(/\D/g, '');
    const ehAdmin = telefoneAdminLimpo && telefoneClienteLimpo.includes(telefoneAdminLimpo.slice(-8));

    // Se foi enviada por nós mesmos (fromMe)
    if (enviadaPorNos) {
      // 1) Se foi o PRÓPRIO BOT que enviou, ignora — não é intervenção manual.
      //    (Necessário porque, com "Notificar as enviadas por mim" ligado na Z-API,
      //     os envios automáticos do GIA também voltam como fromMe.)
      const idMensagem = dadosDoWebhook.messageId || dadosDoWebhook.id;
      if (zapi.foiEnviadoPeloBot(idMensagem)) {
        return;
      }

      // 2) Caso contrário, é uma RESPOSTA MANUAL do Gusthavo pelo WhatsApp da casa.
      if (!ehAdmin) {
        // Cancela qualquer timer pendente — evita que o GIA responda por cima da intervenção manual
        if (timersDeEspera[telefoneCliente]) {
          clearTimeout(timersDeEspera[telefoneCliente]);
          delete timersDeEspera[telefoneCliente];
        }
        if (timersDeDigitando[telefoneCliente]) {
          clearInterval(timersDeDigitando[telefoneCliente]);
          delete timersDeDigitando[telefoneCliente];
        }
        delete buffersDeMensagens[telefoneCliente];

        // Pausa o GIA por 30min — e reinicia a contagem a cada nova mensagem manual
        claude.registrarRespostaManual(telefoneCliente);

        if (textoRecebido && textoRecebido.trim()) {
          // Aprender o tom do Gusthavo
          salvarExemploTom(textoRecebido.trim()).catch(() => {});
          // Salvar a fala manual no histórico → GIA volta no contexto certo depois dos 30min
          claude.registrarMensagemManualNoHistorico(telefoneCliente, textoRecebido.trim()).catch(() => {});
        }
        console.log(`✍️ Resposta manual para ${telefoneCliente} — GIA pausado 30min, contexto salvo`);
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

    // Se não é admin, verifica se o GIA está ativo
    if (!ehAdmin) {
      const giaAtivo = await lerStatusGia();
      if (!giaAtivo) {
        console.log('⏸️ GIA pausado, ignorando mensagem de cliente.');
        return;
      }
    }

    // Se não tem texto, ignorar
    if (!textoRecebido) return;

    console.log(`📥 Mensagem recebida de ${telefoneCliente}: "${textoRecebido}"`);

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

    // Se retornou null, GIA está em pausa manual — não responde
    if (!resposta) {
      console.log(`🔇 GIA em pausa manual — sem resposta para ${telefoneCliente}`);
      return;
    }

    console.log(`🤖 Resposta tipo: "${resposta.tipo}"`);

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

    // Detectar [NAO_SEI] — GIA nao soube: entra em MODO PONTE (encaminha pro admin)
    if (textoLimpo.includes('[NAO_SEI]')) {
      textoLimpo = textoLimpo.replace(/\[NAO_SEI\]/g, '').trim();
      const holding = textoLimpo || 'Deixa eu confirmar isso rapidinho e ja te respondo, beleza?';
      await iniciarRelay(telefoneCliente, textoFinal, holding);
      await salvarPerguntaSemResposta(telefoneCliente, textoFinal);
      console.log('[NAO_SEI] -> MODO PONTE para ' + telefoneCliente);
      return;
    }

    // Detectar [MUITOS_CONVIDADOS] — grupo grande, notificar admin SEM responder o cliente
    if (textoLimpo.includes('[MUITOS_CONVIDADOS]')) {
      // NÃO envia nada ao cliente — só alerta o admin e pausa o GIA
      await zapi.alertarDono(telefoneCliente,
        `👥 Cliente quer trazer MUITOS convidados:\n"${textoFinal}"\n\nResponda manualmente — GIA aguarda.`
      );
      claude.pausarClientePorNaoSaber(telefoneCliente);
      console.log(`👥 [MUITOS_CONVIDADOS] — admin notificado, GIA pausado para ${telefoneCliente}`);
      return;
    }

    // Detectar flyers solicitados pela GIA
    const regexFlyer = /\[ENVIAR_FLYER:(programacao_sexta|programacao_sabado|entrada_sexta|entrada_sabado|camarote_sexta|camarote_sabado|aniversario_sexta|aniversario_sabado)\]/g;
    let matchFlyer;
    while ((matchFlyer = regexFlyer.exec(respostaDaClaude)) !== null) {
      flyersSolicitados.push(matchFlyer[1]);
    }
    textoLimpo = textoLimpo.replace(regexFlyer, '').trim();

    // Detectar alerta
    if (textoLimpo.includes('[ALERTAR_GUSTHAVO]')) {
      precisaAlertar = true;
      textoLimpo = textoLimpo.replace(/\[ALERTAR_GUSTHAVO\]/g, '').trim();
    }

    // Detectar [NOME:xxx] — cliente informou o nome; salva no CRM
    const matchNome = textoLimpo.match(/\[NOME:([^\]]+)\]/);
    if (matchNome && matchNome[1].trim()) {
      salvarClienteMeta(telefoneCliente, { nomeInformado: matchNome[1].trim() }).catch(() => {});
    }
    textoLimpo = textoLimpo.replace(/\[NOME:[^\]]+\]/g, '').trim();

    textoLimpo = textoLimpo.replace(/\n{3,}/g, '\n\n').trim();

    // Enviar texto em pedaços
    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');
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
        await esperar(1500);

        // Enviar mensagem de fechamento se houver para este tipo de flyer
        const mensagemFechamento = MENSAGENS_FECHAMENTO[nomeFlyer];
        if (mensagemFechamento) {
          await zapi.enviarTexto(telefoneCliente, mensagemFechamento);
          await esperar(1000);
        }
      }
    }

    // Alertar admin se necessário
    if (precisaAlertar) {
      await zapi.alertarDono(telefoneCliente, textoFinal);
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