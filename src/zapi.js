// ============================================================================
// ZAPI.JS - Comunicação com o WhatsApp via Z-API
// ============================================================================
// Este arquivo é responsável por:
// 1. Enviar mensagens de texto pro cliente
// 2. Enviar imagens (flyers) pro cliente
// 3. Enviar alertas pro WhatsApp pessoal do dono (Gusthavo)
// ============================================================================

require('dotenv').config();
const axios = require('axios');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

// Dados de acesso à Z-API (vêm do .env)
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

// Número pessoal do dono pra receber os alertas
const NUMERO_GUSTHAVO = process.env.NUMERO_GUSTHAVO_PESSOAL;

// URL base da Z-API (todos os comandos partem daqui)
const URL_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// Cabeçalho obrigatório da Z-API (pra autenticar as requisições)
const HEADERS = {
  'Content-Type': 'application/json',
  'Client-Token': ZAPI_CLIENT_TOKEN,
};

// ============================================================================
// FUNÇÃO 1: ENVIAR MENSAGEM DE TEXTO
// ============================================================================
// Envia uma mensagem de texto simples pro cliente via WhatsApp

async function enviarTexto(telefoneCliente, textoMensagem) {
  try {
    await axios.post(
      `${URL_BASE}/send-text`,
      {
        phone: telefoneCliente,
        message: textoMensagem,
      },
      { headers: HEADERS }
    );
    console.log(`✅ Texto enviado para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao enviar texto para ${telefoneCliente}:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 2: ENVIAR IMAGEM (FLYER)
// ============================================================================
// Envia uma imagem hospedada publicamente na internet pro cliente
// A Z-API precisa de uma URL pública da imagem (não aceita caminho local)

async function enviarImagem(telefoneCliente, urlImagem, legenda = '') {
  try {
    await axios.post(
      `${URL_BASE}/send-image`,
      {
        phone: telefoneCliente,
        image: urlImagem,
        caption: legenda,
      },
      { headers: HEADERS }
    );
    console.log(`✅ Imagem enviada para ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao enviar imagem para ${telefoneCliente}:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// FUNÇÃO 3: ENVIAR ALERTA PRO WHATSAPP PESSOAL DO DONO
// ============================================================================
// Quando o Gusthavo IA detectar [ALERTAR_GUSTHAVO], essa função dispara
// um aviso pro teu número pessoal com o contexto do cliente

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
      {
        phone: NUMERO_GUSTHAVO,
        message: mensagemAlerta,
      },
      { headers: HEADERS }
    );
    console.log(`🔔 Alerta enviado pro Gusthavo sobre ${telefoneCliente}`);
  } catch (erro) {
    console.log(`❌ Erro ao alertar Gusthavo:`);
    console.log(erro.response?.data || erro.message);
  }
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  enviarTexto,
  enviarImagem,
  alertarDono,
};