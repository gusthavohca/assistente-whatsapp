require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompt');
const { lerCerebroDoGusthavo, lerHistorico, salvarHistorico } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  // Busca histórico do Firebase
  let historico = [];
  try {
    historico = await lerHistorico(telefone) || [];
  } catch (erro) {
    console.log('⚠️ Erro ao carregar histórico, começando do zero.');
    historico = [];
  }

  const cerebro = await montarCerebro();

  historico.push({
    role: 'user',
    content: mensagemDoCliente,
  });

  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: cerebro,
    messages: historico,
  });

  const textoResposta = resposta.content[0].text;

  historico.push({
    role: 'assistant',
    content: textoResposta,
  });

  // Salva histórico atualizado no Firebase
  // Mantém apenas as últimas 20 mensagens para não ficar pesado
  const historicoReduzido = historico.slice(-20);
  try {
    await salvarHistorico(telefone, historicoReduzido);
  } catch (erro) {
    console.log('⚠️ Erro ao salvar histórico.');
  }

  return textoResposta;
}

module.exports = { perguntarParaClaude };