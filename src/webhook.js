// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================
// Este arquivo é responsável por:
// 1. Receber a mensagem do cliente (via Z-API)
// 2. Chamar a Claude pra pensar a resposta
// 3. Analisar a resposta procurando comandos especiais
// 4. Executar as ações: enviar texto, flyers, alertas
// ============================================================================

// Importa os outros arquivos que criamos
const claude = require('./claude');
const zapi = require('./zapi');

// ============================================================================
// MAPA DOS FLYERS - associa o nome do comando com a URL da imagem
// ============================================================================
// IMPORTANTE: as URLs ainda estão como placeholders.
// No Sub-passo 5.7 vamos hospedar os flyers e colocar as URLs reais aqui.

const FLYERS = {
  entrada: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/entrada.jpeg',
  camarotes: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/camarotes.jpeg',
  aniversario: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/aniversario.jpeg',
};
// ============================================================================
// SISTEMA DE DEBOUNCE - Aguarda o cliente terminar de mandar mensagens
// antes de responder. Evita conversas fragmentadas.
// ============================================================================

// Tempo em milissegundos que o sistema espera antes de responder.
// Se o cliente mandar nova mensagem dentro desse tempo, o timer reseta.
const TEMPO_ESPERA_MS = 25000; // 25 segundos

// Tempo entre cada renovação do "digitando..." pro cliente
const RENOVAR_DIGITANDO_MS = 7000; // 7 segundos

// Buffer das mensagens recebidas (uma fila por cliente)
// Estrutura: { '5511999999999': ['oi', 'tudo bem?', '...'] }
const buffersDeMensagens = {};

// Timers de espera (um por cliente)
// Estrutura: { '5511999999999': <referência do timer> }
const timersDeEspera = {};

// Timers de renovação do "digitando..." (um por cliente)
const timersDeDigitando = {};

// ============================================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA
// ============================================================================
// É chamada toda vez que a Z-API avisa que chegou uma nova mensagem

async function processarMensagem(dadosDoWebhook) {
  try {
    // 1. EXTRAIR DADOS DA MENSAGEM
    const telefoneCliente = dadosDoWebhook.phone;
    const textoRecebido = dadosDoWebhook.text?.message;
    const enviadaPorNos = dadosDoWebhook.fromMe;

    // Se a mensagem veio de um GRUPO, IGNORAR
    const ehDeGrupo =
      dadosDoWebhook.isGroup === true ||
      (telefoneCliente && telefoneCliente.includes('-group'));

    if (ehDeGrupo) {
      console.log('👥 Mensagem de grupo ignorada (atendemos só clientes diretos).');
      return;
    }

    // Se foi enviada por nós mesmos, IGNORAR (evita loop)
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

    // 2. ADICIONAR A MENSAGEM AO BUFFER DO CLIENTE
    if (!buffersDeMensagens[telefoneCliente]) {
      buffersDeMensagens[telefoneCliente] = [];
    }
    buffersDeMensagens[telefoneCliente].push(textoRecebido);

    // 3. SE JÁ EXISTIA UM TIMER, CANCELAR (vamos resetar)
    if (timersDeEspera[telefoneCliente]) {
      clearTimeout(timersDeEspera[telefoneCliente]);
    }
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
    }

    // 4. MOSTRAR "DIGITANDO..." PRO CLIENTE
    zapi.mostrarDigitando(telefoneCliente);

    // 5. RENOVAR O "DIGITANDO..." A CADA 7 SEGUNDOS
    timersDeDigitando[telefoneCliente] = setInterval(() => {
      zapi.mostrarDigitando(telefoneCliente);
    }, RENOVAR_DIGITANDO_MS);

    // 6. CRIAR NOVO TIMER DE 25 SEGUNDOS
    // Quando ele disparar, processa o buffer todo de uma vez
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
// Chamada quando o timer de 25 segundos expira sem nova mensagem do cliente.
// Junta todas as mensagens, manda pra Claude, processa a resposta.

async function processarBufferDoCliente(telefoneCliente) {
  try {
    // Para de mostrar "digitando..." (vamos enviar a resposta agora)
    if (timersDeDigitando[telefoneCliente]) {
      clearInterval(timersDeDigitando[telefoneCliente]);
      delete timersDeDigitando[telefoneCliente];
    }

    // Pega as mensagens acumuladas e LIMPA o buffer
    const mensagensAcumuladas = buffersDeMensagens[telefoneCliente] || [];
    delete buffersDeMensagens[telefoneCliente];
    delete timersDeEspera[telefoneCliente];

    if (mensagensAcumuladas.length === 0) {
      return;
    }

    // Junta todas as mensagens em UMA só (separadas por linha)
    const textoFinal = mensagensAcumuladas.join('\n');

    console.log(
      `🎯 Processando ${mensagensAcumuladas.length} mensagem(ns) acumulada(s) de ${telefoneCliente}`,
    );

    // CHAMAR A CLAUDE PRA PENSAR A RESPOSTA
    const respostaDaClaude = await claude.conversar(telefoneCliente, textoFinal);
    console.log(`🤖 Claude respondeu: "${respostaDaClaude}"`);

    // ANALISAR A RESPOSTA PROCURANDO COMANDOS ESPECIAIS
    const flyersSolicitados = [];
    let precisaAlertar = false;
    let textoLimpo = respostaDaClaude;

    // Procura [ENVIAR_FLYER:xxx]
    const regexFlyer = /\[ENVIAR_FLYER:(entrada|camarotes|aniversario)\]/g;
    let matchFlyer;
    while ((matchFlyer = regexFlyer.exec(respostaDaClaude)) !== null) {
      flyersSolicitados.push(matchFlyer[1]);
    }
    textoLimpo = textoLimpo.replace(regexFlyer, '').trim();

    // Procura [ALERTAR_GUSTHAVO]
    if (textoLimpo.includes('[ALERTAR_GUSTHAVO]')) {
      precisaAlertar = true;
      textoLimpo = textoLimpo.replace(/\[ALERTAR_GUSTHAVO\]/g, '').trim();
    }

    // Limpeza final
    textoLimpo = textoLimpo.replace(/\n{3,}/g, '\n\n').trim();

    // EXECUTAR AÇÕES

    // Quebrar em mensagens separadas (por linha vazia)
    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');

    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      await esperar(1500);
    }

    // Enviar flyers solicitados
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = FLYERS[nomeFlyer];
      if (urlFlyer && !urlFlyer.startsWith('COLOCAR_URL')) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        await esperar(1000);
      } else {
        console.log(`⚠️  URL do flyer "${nomeFlyer}" ainda não configurada.`);
      }
    }

    // Alertar dono se necessário
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
// FUNÇÃO AUXILIAR: ESPERAR (pra simular humano digitando)
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