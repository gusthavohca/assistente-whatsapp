require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { montarSystemPrompt } = require('./prompt');
const { lerHistorico, salvarHistorico, lerAtracoes, lerInfos } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function perguntarParaClaude(telefone, mensagemDoCliente) {
  let historico = [];
  try {
    historico = await lerHistorico(telefone) || [];
  } catch (erro) {
    historico = [];
  }

  // Busca dados atualizados do Firebase
  const atracoes = await lerAtracoes();
  const infos = await lerInfos();

  // Monta contexto atual obrigatório
  const djSexta = atracoes?.sexta?.dj || null;
  const horarioSexta = atracoes?.sexta?.horario || null;
  const djSabado = atracoes?.sabado?.dj || null;
  const horarioSabado = atracoes?.sabado?.horario || null;

 // Injeta contexto atual DENTRO da mensagem do usuário
  const respostaSexta = djSexta
    ? `Bhaskar toca sexta às ${horarioSexta}`
    : `a divulgação do line up sai durante a semana`;

  const respostaSabado = djSabado
    ? `${djSabado} toca sábado às ${horarioSabado}`
    : `a divulgação do line up sai durante a semana`;

  const contextoAtual = `
[INSTRUÇÃO DO SISTEMA]:
Se o cliente perguntar sobre sexta, a resposta EXATA é: "${respostaSexta}"
Se o cliente perguntar sobre sábado, a resposta EXATA é: "${respostaSabado}"
Use essas frases literalmente. Não invente, não modifique, não omita.

[MENSAGEM DO CLIENTE]: ${mensagemDoCliente}`;

  const cerebro = await montarSystemPrompt();

  historico.push({
    role: 'user',
    content: contextoAtual,
  });

  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: cerebro,
    messages: historico,
  });

  const textoResposta = resposta.content[0].text;

  // Salva no histórico só a mensagem real do cliente (sem o contexto técnico)
  historico[historico.length - 1] = {
    role: 'user',
    content: mensagemDoCliente,
  };

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

  return textoResposta;
}

module.exports = { perguntarParaClaude };