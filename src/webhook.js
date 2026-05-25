// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================

const claude = require('./claude');
const zapi = require('./zapi');
const { processarComandoAdmin } = require('./admin');
const { lerCerebroDoGusthavo, lerFlyers, salvarFlyer, lerStatusGia, registrarPedido, registrarAtendimento, lerMensagemFlyer } = require('./firebase');
const NUMERO_ADMIN = process.env.NUMERO_GUSTHAVO_PESSOAL;

// Armazena a última imagem enviada pelo admin
let ultimaImagemAdmin = null;

// ============================================================================
// MAPA DOS FLYERS
// ============================================================================

const FLYERS_PADRAO = {
  entrada: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/entrada.jpeg',
  camarote: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/camarotes.jpeg',
  aniversario: 'https://raw.githubusercontent.com/gusthavohca/assistente-whatsapp/main/assets/flyers/aniversario.jpeg',
};

const MENSAGENS_PADRAO_FLYER = {
  entrada: 'Esses são nossos valores iniciais de entrada na casa.',
  camarote: 'Me diz em quantas pessoas vocês estão, que te falo a disponibilidade e se consigo negociar algo.',
  aniversario: 'Oferecemos essas cortesias aqui, o que você acha?',
};

async function obterFlyers() {
  const flyersFirebase = await lerFlyers();
  return {
    entrada: flyersFirebase['entrada'] || FLYERS_PADRAO.entrada,
    camarote: flyersFirebase['camarote'] || FLYERS_PADRAO.camarote,
    aniversario: flyersFirebase['aniversario'] || FLYERS_PADRAO.aniversario,
    programacao_sexta: flyersFirebase['programacao_sexta'] || null,
    programacao_sabado: flyersFirebase['programacao_sabado'] || null,
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

    // Se não tem texto, verifica se é imagem do admin
    if (!textoRecebido) {
      if (ehAdmin && dadosDoWebhook.image?.imageUrl) {
        ultimaImagemAdmin = dadosDoWebhook.image.imageUrl;
        console.log('📸 Imagem do admin armazenada:', ultimaImagemAdmin);
      }
      return;
    }

    // Verifica se admin mandou comando de flyer após imagem
    if (ehAdmin && ultimaImagemAdmin) {
      const texto = textoRecebido.toLowerCase().trim();
      let tipoFlyer = null;

      if (texto.includes('programacao sexta') || texto.includes('programação sexta') || texto.includes('flyer programacao sexta')) {
        tipoFlyer = 'programacao_sexta';
      } else if (texto.includes('programacao sabado') || texto.includes('programação sábado') || texto.includes('programação sabado') || texto.includes('flyer programacao sabado')) {
        tipoFlyer = 'programacao_sabado';
      } else if (texto.includes('entrada')) {
        tipoFlyer = 'entrada';
      } else if (texto.includes('camarote')) {
        tipoFlyer = 'camarote';
      } else if (texto.includes('aniversario') || texto.includes('aniversário')) {
        tipoFlyer = 'aniversario';
      }

      if (tipoFlyer) {
        await salvarFlyer(tipoFlyer, ultimaImagemAdmin);
        ultimaImagemAdmin = null;
        await zapi.enviarTexto(telefoneCliente, `Beleza! Flyer de ${tipoFlyer.replace('_', ' ')} atualizado.`);
        console.log(`✅ Flyer ${tipoFlyer} salvo no Firebase`);
        return;
      }
    }

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

    if (ehAdmin) {
      console.log('🔑 Modo Admin ativado');
      const cerebroAtual = await lerCerebroDoGusthavo();
      const respostaAdmin = await processarComandoAdmin(textoFinal, cerebroAtual);
      await zapi.enviarTexto(telefoneCliente, respostaAdmin);
      return;
    }

    // Chama o Claude — agora retorna { tipo, url } ou { tipo, mensagem }
    const resposta = await claude.perguntarParaClaude(telefoneCliente, textoFinal);

    console.log(`🤖 Resposta tipo: "${resposta.tipo}"`);

    // Se for flyer de programação
    if (resposta.tipo === 'flyer') {
      await zapi.enviarImagem(telefoneCliente, resposta.url);
      const mensagemExtraFlyer = (await lerMensagemFlyer(resposta.tipoFlyer)) || MENSAGENS_PADRAO_FLYER[resposta.tipoFlyer] || null;
      if (mensagemExtraFlyer) {
        await esperar(1000);
        await zapi.enviarTexto(telefoneCliente, mensagemExtraFlyer);
      }
      await registrarAtendimento(textoFinal.substring(0, 50));
      console.log(`✅ Flyer enviado para ${telefoneCliente}\n`);
      return;
    }

    // Se for texto normal
    const respostaDaClaude = resposta.mensagem;

    const flyersSolicitados = [];
    let precisaAlertar = false;
    let textoLimpo = respostaDaClaude;

    const regexFlyer = /\[ENVIAR_FLYER:(entrada|camarote|aniversario|programacao_sexta|programacao_sabado)\]/g;
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

    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');
    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      await esperar(1500);
    }

    const flyersAtuais = await obterFlyers();
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = flyersAtuais[nomeFlyer];
      if (urlFlyer) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        const mensagemExtraFlyer = (await lerMensagemFlyer(nomeFlyer)) || MENSAGENS_PADRAO_FLYER[nomeFlyer] || null;
        if (mensagemExtraFlyer) {
          await esperar(1000);
          await zapi.enviarTexto(telefoneCliente, mensagemExtraFlyer);
        }
        await esperar(1000);
      }
    }

    if (precisaAlertar) {
      await zapi.alertarDono(telefoneCliente, textoFinal);
    }

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