require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { montarSystemPrompt } = require('./prompt');
const { lerHistorico, salvarHistorico, lerFlyer } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Detecta se o cliente está perguntando sobre programação
function detectarPerguntaProgramacao(mensagem) {
  const msg = mensagem.toLowerCase();

  const termosGerais = ['programação', 'programacao', 'programaçao', 'o que vai ter', 'o que tem', 'quem toca', 'quem canta', 'line up', 'lineup', 'atração', 'atracao'];
  const termosSexta = ['sexta', 'sex', '6ª', 'friday'];
  const termosSabado = ['sábado', 'sabado', 'sab', '7ª', 'saturday'];

  const temTermoGeral = termosGerais.some(t => msg.includes(t));
  const temSexta = termosSexta.some(t => msg.includes(t));
  const temSabado = termosSabado.some(t => msg.includes(t));

  if (temTermoGeral && temSexta) return 'programacao_sexta';
  if (temTermoGeral && temSabado) return 'programacao_sabado';
  if (temSexta) return 'programacao_sexta';
  if (temSabado) return 'programacao_sabado';

  return null;
}

async function perguntarParaClaude(telefone, mensagemDoCliente) {
  let historico = [];
  try {
    historico = await lerHistorico(telefone) || [];
  } catch (erro) {
    historico = [];
  }

  // Verifica se o cliente está perguntando sobre programação
  const tipoProgramacao = detectarPerguntaProgramacao(mensagemDoCliente);
  if (tipoProgramacao) {
    const urlFlyer = await lerFlyer(tipoProgramacao);
    if (urlFlyer) {
      console.log(`🎯 Pergunta de programação detectada: ${tipoProgramacao}`);
      return { tipo: 'flyer', url: urlFlyer };
    }
  }

  const cerebro = await montarSystemPrompt();

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

  const historicoReduzido = historico.slice(-20);
  try {
    await salvarHistorico(telefone, historicoReduzido);
  } catch (erro) {
    console.log('⚠️ Erro ao salvar histórico.');
  }

  return { tipo: 'texto', mensagem: textoResposta };
}

module.exports = { perguntarParaClaude };