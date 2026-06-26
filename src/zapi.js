// ============================================================================
// ZAPI.JS - Comunicação com o WhatsApp via Z-API
// ============================================================================

require('dotenv').config();
const axios = require('axios');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const ZAPI_INSTANCE_ID  = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const NUMERO_GUSTHAVO   = process.env.NUMERO_GUSTHAVO_PESSOAL;

const URL_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

const HEADERS = {
  'Content-Type': 'application/json',
  'Client-Token': ZAPI_CLIENT_TOKEN,
};

// ============================================================================
// FUNÇÃO 1: ENVIAR MENSAGEM DE TEXTO
// ============================================================================
// mencionarTodos = true → usa mentionAll + adiciona @all ao texto.
// Z-API exige: parâmetro "mentionAll: true" E "@all" no corpo da mensagem
// para que a menção apareça em verde no WhatsApp e quebre o silêncio.

async function enviarTexto(telefoneCliente, textoMensagem, mencionarTodos = false) {
  try {
    let mensagem = textoMensagem;
    const body = { phone: telefoneCliente };

    if (mencionarTodos) {
      // Adiciona @all ao final do texto (obrigatório para a menção aparecer no WhatsApp)
      if (!mensagem.includes('@all')) mensagem = mensagem + '\n@all';
      body.mentionAll = true;
    }

    body.message = mensagem;
    await axios.post(`${URL_BASE}/send-text`, body, { headers: HEADERS });
    console.log(`✅ Texto enviado para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao enviar texto para ${telefoneCliente}:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 2: ENVIAR IMAGEM (FLYER)
// ============================================================================
// Z-API não suporta mentionAll em send-image. O disparo trata isso
// enviando o texto com @all primeiro, depois a imagem separada.

async function enviarImagem(telefoneCliente, urlImagem, legenda = '') {
  try {
    const body = { phone: telefoneCliente, image: urlImagem, caption: legenda };
    await axios.post(`${URL_BASE}/send-image`, body, { headers: HEADERS });
    console.log(`✅ Imagem enviada para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao enviar imagem para ${telefoneCliente}:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 3: ENVIAR VÍDEO
// ============================================================================
// Z-API não suporta mentionAll em send-video. O disparo trata isso
// enviando o texto com @all primeiro, depois o vídeo separado.

async function enviarVideo(telefoneCliente, urlVideo, legenda = '') {
  try {
    const body = { phone: telefoneCliente, video: urlVideo, caption: legenda };
    await axios.post(`${URL_BASE}/send-video`, body, { headers: HEADERS });
    console.log(`✅ Vídeo enviado para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao enviar vídeo para ${telefoneCliente}:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 4: ENVIAR ALERTA PRO WHATSAPP PESSOAL DO DONO
// ============================================================================

async function alertarDono(telefoneCliente, ultimaMensagemDoCliente) {
  const mensagemAlerta =
    `🚨 *Le Club - Atenção!*\n\n` +
    `Um cliente precisa de você:\n` +
    `📱 Número: ${telefoneCliente}\n` +
    `💬 Última mensagem: "${ultimaMensagemDoCliente}"\n\n` +
    `Abre o WhatsApp da casa pra dar sequência.`;

  try {
    await axios.post(
      `${URL_BASE}/send-text`,
      { phone: NUMERO_GUSTHAVO, message: mensagemAlerta },
      { headers: HEADERS }
    );
    console.log(`🔔 Alerta enviado pro Gusthavo sobre ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao alertar Gusthavo:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 5: MOSTRAR "DIGITANDO..." PRO CLIENTE
// ============================================================================

async function mostrarDigitando(telefoneCliente) {
  try {
    await axios.post(
      `${URL_BASE}/send-chat-state`,
      { phone: telefoneCliente, chatState: 'composing' },
      { headers: HEADERS }
    );
  } catch (erro) {
    // Status cosmético — não loga erro
  }
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  enviarTexto,
  enviarImagem,
  enviarVideo,
  alertarDono,
  mostrarDigitando,
};
