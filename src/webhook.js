// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================
// Este arquivo é responsável por:
// 1. Receber a mensagem do cliente (via Z-API)
// 2. Acumular mensagens no buffer (debounce de 25 segundos)
// 3. Chamar a Claude pra pensar a resposta quando o timer expira
// 4. Analisar a resposta procurando comandos especiais
// 5. Executar as ações: enviar texto, flyers, alertas
// ============================================================================

const claude = require('./claude');
const zapi = require('./zapi');
const { processarComandoAdmin } = require('./admin');
const { lerCerebroDoGusthavo } = require('./firebase');
const NUMERO_ADMIN = process.env.NUMERO_GUSTHAVO_PESSOAL;

// ============================================================================
// MAPA DOS FLYERS
// ============================================================================

const FLYERS = {
  entrada: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/entrada.jpeg',
  camarotes: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/camarotes.jpeg',
  aniversario: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/aniversario.jpeg',
};

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
      console.log('👥 Mensagem de grupo ignorada (atendemos só clientes diretos).');
      return;
    }

    // Se foi enviada por nós mesmos, ignorar (evita loop)
    if (enviadaPorNos) {
      console.log('↩️  Mensagem enviada por nós mesmos, ignorando.');
      return;
    }

    // Se não tem texto (foto, áudio, etc), ignorar por enquanto
    if (!textoRecebido) {
      console.log('📎 Mensagem sem texto recebida, ignorando por enquanto.');
      return;
    }

    console.log(`📥 Mensagem recebida de ${telefoneCliente}: "${textoRecebido}"`);

    // Adicionar mensagem ao buffer do cliente
    if (!buffersDeMensagens[telefoneCliente]) {
      buffersDeMensagens[telefoneCliente] = [];
    }
    buffersDeMensagens[telefoneCliente].push(textoRecebido);

    // Cancelar timers anteriores (resetar)
    if (timersDeEspera[telefoneCliente]) {
      clearTimeout(timersDeEspera[telefoneCliente]);
    }
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
    }

    // Mostrar "digitando..." pro cliente
    zapi.mostrarDigitando(telefoneCliente);

    // Renovar "digitando..." a cada 7 segundos
    timersDeDigitando[telefoneCliente] = setInterval(() => {
      zapi.mostrarDigitando(telefoneCliente);
    }, RENOVAR_DIGITANDO_MS);

    // Criar timer de 25 segundos
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
    // Para o "digitando..."
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
      delete timersDeDigitando[telefoneCliente];
    }

    // Pega e limpa o buffer
    const mensagensAcumuladas = buffersDeMensagens[telefoneCliente] || [];
    delete buffersDeMensagens[telefoneCliente];
    delete timersDeEspera[telefoneCliente];

    if (mensagensAcumuladas.length === 0) return;

    // Junta todas as mensagens
    const textoFinal = mensagensAcumuladas.join('\n');

    console.log(
      `🎯 Processando ${mensagensAcumuladas.length} mensagem(ns) de ${telefoneCliente}`,
    );

    // Verifica se é o admin ou cliente normal
    let respostaDaClaude;
    const telefoneAdmin = NUMERO_ADMIN ? NUMERO_ADMIN.replace(/\D/g, '') : '';
    const telefoneClean = telefoneCliente.replace(/\D/g, '');

    if (telefoneAdmin && telefoneClean.includes(telefoneAdmin.slice(-8))) {
      console.log('👑 Modo Admin ativado');
      const cerebroAtual = await lerCerebroDoGusthavo();
      respostaDaClaude = await processarComandoAdmin(textoFinal, cerebroAtual);
    } else {
      respostaDaClaude = await claude.perguntarParaClaude(telefoneCliente, textoFinal);
    }
    console.log(`🤖 Claude respondeu: "${respostaDaClaude}"`);

    // Analisa comandos especiais
    const flyersSolicitados = [];
    let precisaAlertar = false;
    let textoLimpo = respostaDaClaude;

    const regexFlyer = /\[ENVIAR_FLYER:(entrada|camarotes|aniversario)\]/g;
    let matchFlyer;
    while ((matchFlyer = regexFlyer.exec(respostaDaClaude)) !== null) {
      flyersSolicitados.push(matchFlyer[1]);
    }
    textoLimpo = textoLimpo.replace(regexFlyer, '').trim();

    if (textoLimpo.includes('[ALERTAR_GUSTHAVO]')) {
      precisaAlertar = true;
      textoLimpo = textoLimpo.replace(/\[ALERTAR_GUSTHAVO\]/g, '').trim();
    }

    textoLimpo = textoLimpo.replace(/\n{3,}/g, '\n\n').trim();

    // Envia as mensagens de texto (quebradas por linha vazia)
    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');
    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      await esperar(1500);
    }

    // Envia flyers
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = FLYERS[nomeFlyer];
      if (urlFlyer && !urlFlyer.startsWith('COLOCAR_URL')) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        await esperar(1000);
      } else {
        console.log(`⚠️  URL do flyer "${nomeFlyer}" ainda não configurada.`);
      }
    }

    // Alerta o dono se necessário
    if (precisaAlertar) {
      await zapi.alertarDono(telefoneCliente, textoFinal);
    }

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
