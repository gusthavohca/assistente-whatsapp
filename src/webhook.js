// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================

const claude = require('./claude');
const zapi = require('./zapi');
const { processarComandoAdmin } = require('./admin');
const { lerCerebroDoGusthavo, lerFlyers, lerStatusGia, registrarPedido, registrarAtendimento } = require('./firebase');
const NUMERO_ADMIN = process.env.NUMERO_GUSTHAVO_PESSOAL;

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
      console.log('👥 Mensagem de grupo ignorada.');
      return;
    }

    // Se foi enviada por nós mesmos, ignorar
    if (enviadaPorNos) {
      console.log('↩️  Mensagem enviada por nós mesmos, ignorando.');
      return;
    }

    // Verifica se é admin
    const telefoneAdminLimpo = NUMERO_ADMIN ? NUMERO_ADMIN.replace(/\D/g, '') : '';
    const telefoneClienteLimpo = telefoneCliente.replace(/\D/g, '');
    const ehAdmin = telefoneAdminLimpo && telefoneClienteLimpo.includes(telefoneAdminLimpo.slice(-8));

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
    if (ehAdmin) {
      console.log('🔑 Modo Admin ativado');
      const respostaAdmin = await processarComandoAdmin(textoFinal);
      await zapi.enviarTexto(telefoneCliente, respostaAdmin);
      return;
    }

    // ── CLIENTE ──
    const resposta = await claude.perguntarParaClaude(telefoneCliente, textoFinal);

    console.log(`🤖 Resposta tipo: "${resposta.tipo}"`);

    // Se for flyer de programação
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

    textoLimpo = textoLimpo.replace(/\n{3,}/g, '\n\n').trim();

    // Enviar texto em pedaços
    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');
    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      await esperar(1500);
    }

    // Enviar flyers solicitados (todos do Firebase/painel)
    const flyersAtuais = await obterFlyers();
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = flyersAtuais[nomeFlyer];
      if (urlFlyer) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        await esperar(1000);
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