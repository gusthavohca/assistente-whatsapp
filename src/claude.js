require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompt');
const { lerAtracoes, lerCerebroDoGusthavo } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const historicos = {};

async function montarCerebro() {
  try {
    const cerebroFirebase = await lerCerebroDoGusthavo();
    return cerebroFirebase || SYSTEM_PROMPT;
  } catch (erro) {
    console.log('⚠️ Firebase indisponível, usando prompt local.');
    return SYSTEM_PROMPT;
  }
}

async function perguntarParaClaude(telefone, mensagemDoCliente) {
  if (!historicos[telefone]) {
    historicos[telefone] = [];
  }

  const cerebro = await montarCerebro();

  historicos[telefone].push({
    role: 'user',
    content: mensagemDoCliente,
  });

  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: cerebro,
    messages: historicos[telefone],
  });

  const textoResposta = resposta.content[0].text;

  historicos[telefone].push({
    role: 'assistant',
    content: textoResposta,
  });

  return textoResposta;
}

module.exports = { perguntarParaClaude };