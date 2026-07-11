// ============================================================================
// ZAPI.JS - Comunicacao com o WhatsApp via Z-API
// ============================================================================

require('dotenv').config();
const axios = require('axios');

const ZAPI_INSTANCE_ID  = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const NUMERO_GUSTHAVO   = process.env.NUMERO_GUSTHAVO_PESSOAL;

const URL_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

const HEADERS = {
  'Content-Type': 'application/json',
  'Client-Token': ZAPI_CLIENT_TOKEN,
};

// ---- Rastreio de mensagens enviadas pelo proprio bot ----
const idsEnviadosPeloBot = new Set();
const MAX_IDS_GUARDADOS = 1500;
function registrarIdEnviado(id) {
  if (!id) return;
  idsEnviadosPeloBot.add(String(id));
  if (idsEnviadosPeloBot.size > MAX_IDS_GUARDADOS) {
    const arr = Array.from(idsEnviadosPeloBot).slice(-MAX_IDS_GUARDADOS);
    idsEnviadosPeloBot.clear();
    arr.forEach((x) => idsEnviadosPeloBot.add(x));
  }
}
function foiEnviadoPeloBot(id) { return !!id && idsEnviadosPeloBot.has(String(id)); }
function extrairIdDaResposta(data) {
  if (!data) return null;
  return data.messageId || data.id || data.zaapId || null;
}

async function enviarTexto(telefoneCliente, textoMensagem, mencionarTodos = false) {
  try {
    let mensagem = textoMensagem;
    const body = { phone: telefoneCliente };
    if (mencionarTodos) {
      if (!mensagem.includes('@all')) mensagem = mensagem + '\n@all';
      body.mentionAll = true;
    }
    body.message = mensagem;
    const resp = await axios.post(`${URL_BASE}/send-text`, body, { headers: HEADERS });
    registrarIdEnviado(extrairIdDaResposta(resp.data));
    console.log(`Texto enviado para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`Erro ao enviar texto para ${telefoneCliente}:`, erro.response?.data || erro.message);
  }
}

async function enviarImagem(telefoneCliente, urlImagem, legenda = '') {
  try {
    const body = { phone: telefoneCliente, image: urlImagem, caption: legenda };
    const resp = await axios.post(`${URL_BASE}/send-image`, body, { headers: HEADERS });
    registrarIdEnviado(extrairIdDaResposta(resp.data));
    console.log(`Imagem enviada para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`Erro ao enviar imagem para ${telefoneCliente}:`, erro.response?.data || erro.message);
  }
}

async function enviarVideo(telefoneCliente, urlVideo, legenda = '') {
  try {
    const body = { phone: telefoneCliente, video: urlVideo, caption: legenda };
    const resp = await axios.post(`${URL_BASE}/send-video`, body, { headers: HEADERS });
    registrarIdEnviado(extrairIdDaResposta(resp.data));
    console.log(`Video enviado para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`Erro ao enviar video para ${telefoneCliente}:`, erro.response?.data || erro.message);
  }
}

async function alertarDono(telefoneCliente, ultimaMensagemDoCliente) {
  const mensagemAlerta =
    `🚨 *Le Club - Atencao!*\n\n` +
    `Um cliente precisa de voce:\n` +
    `Numero: ${telefoneCliente}\n` +
    `Ultima mensagem: "${ultimaMensagemDoCliente}"\n\n` +
    `Abre o WhatsApp da casa pra dar sequencia.`;
  try {
    await axios.post(`${URL_BASE}/send-text`, { phone: NUMERO_GUSTHAVO, message: mensagemAlerta }, { headers: HEADERS });
    console.log(`Alerta enviado pro Gusthavo sobre ${telefoneCliente}`);
  } catch (erro) {
    console.log(`Erro ao alertar Gusthavo:`, erro.response?.data || erro.message);
  }
}

async function mostrarDigitando(telefoneCliente) {
  try {
    await axios.post(`${URL_BASE}/send-chat-state`, { phone: telefoneCliente, chatState: 'composing' }, { headers: HEADERS });
  } catch (erro) { /* cosmetico */ }
}

// FUNCAO: buscar nome do contato (CRM)
async function buscarNomeContato(telefone) {
  try {
    const tel = String(telefone).replace(/\D/g, '');
    if (!tel) return '';
    const resp = await axios.get(`${URL_BASE}/contacts/${tel}`, { headers: HEADERS });
    const d = resp.data || {};
    const nome = d.name || d.short || d.vname || d.notify || '';
    return /[a-zA-ZÀ-ÿ]/.test(nome) ? nome.trim() : '';
  } catch (erro) { return ''; }
}

// FUNCAO: alerta de RELAY (retorna o messageId para vincular a resposta do admin)
async function enviarAlertaRelay(nomeCliente, telefoneCliente, pergunta) {
  const msg =
    `🔔 *Le Club — responder cliente*\n\n` +
    `Cliente: ${nomeCliente || telefoneCliente}\n` +
    `Perguntou: "${pergunta}"\n\n` +
    `➡️ *Responda ESTA mensagem* (toque em "Responder") que eu encaminho pro cliente.`;
  try {
    const resp = await axios.post(`${URL_BASE}/send-text`, { phone: NUMERO_GUSTHAVO, message: msg }, { headers: HEADERS });
    const id = extrairIdDaResposta(resp.data);
    registrarIdEnviado(id);
    return id;
  } catch (erro) {
    console.log('Erro ao enviar alerta de relay:', erro.response?.data || erro.message);
    return null;
  }
}

async function enviarAlertaAdmin(texto) {
  try {
    await axios.post(`${URL_BASE}/send-text`, { phone: NUMERO_GUSTHAVO, message: texto }, { headers: HEADERS });
  } catch (erro) {
    console.log('Erro ao enviar alerta admin:', erro.response?.data || erro.message);
  }
}

module.exports = {
  enviarTexto,
  enviarImagem,
  enviarVideo,
  alertarDono,
  mostrarDigitando,
  foiEnviadoPeloBot,
  buscarNomeContato,
  enviarAlertaRelay,
  enviarAlertaAdmin,
};
