require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { montarSystemPrompt } = require('./prompt');
const { lerHistorico, salvarHistorico, lerFlyer, lerCalendarioTexto } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Detecta se o cliente está perguntando sobre programação do fim de semana atual
function detectarPerguntaProgramacao(mensagem) {
  const msg = mensagem.toLowerCase();

  // Palavras que indicam pergunta de VALOR/ENTRADA — não deve enviar flyer de programação
  const termosValor = ['valor', 'preço', 'preco', 'quanto', 'ingresso', 'entrada', 'pagar', 'custa'];
  if (termosValor.some(t => msg.includes(t))) return null;

  // Palavras que indicam pergunta de CALENDÁRIO/DATA FUTURA — não deve enviar flyer
  const termosCalendario = ['mês', 'mes', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'calendário', 'calendario', 'próximo', 'proximo', 'dia '];
  if (termosCalendario.some(t => msg.includes(t))) return null;

  // Palavras que indicam pergunta de PROGRAMAÇÃO do fim de semana
  const termosGerais = ['programação', 'programacao', 'o que vai ter', 'o que tem', 'quem toca', 'quem canta', 'line up', 'lineup', 'atração', 'atracao', 'show'];
  const termosSexta = ['sexta', 'sex', '6ª', 'friday'];
  const termosSabado = ['sábado', 'sabado', 'sab', '7ª', 'saturday'];

  const temTermoGeral = termosGerais.some(t => msg.includes(t));
  const temSexta = termosSexta.some(t => msg.includes(t));
  const temSabado = termosSabado.some(t => msg.includes(t));

  if (temTermoGeral && temSexta) return 'programacao_sexta';
  if (temTermoGeral && temSabado) return 'programacao_sabado';
  if (temTermoGeral) return null;

  return null;
}

// Detecta se o cliente está perguntando sobre calendário ou datas futuras
function detectarPerguntaCalendario(mensagem) {
  const msg = mensagem.toLowerCase();

  const termosCalendario = [
    'calendário', 'calendario', 'mês', 'mes',
    'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro', 'janeiro',
    'fevereiro', 'março', 'marco', 'abril',
    'próximo', 'proximo', 'próximas semanas',
    'tem show no dia', 'o que tem no dia', 'dia ',
    'atração', 'atracao', 'atrações', 'atracoes',
    'agenda', 'futura', 'futuras'
  ];

  return termosCalendario.some(t => msg.includes(t));
}

async function perguntarParaClaude(telefone, mensagemDoCliente) {
  let historico = [];
  try {
    historico = await lerHistorico(telefone) || [];
  } catch (erro) {
    historico = [];
  }

  // Verifica se é pergunta de programação do fim de semana
  const tipoProgramacao = detectarPerguntaProgramacao(mensagemDoCliente);
  if (tipoProgramacao) {
    const urlFlyer = await lerFlyer(tipoProgramacao);
    if (urlFlyer) {
      console.log(`🎯 Pergunta de programação detectada: ${tipoProgramacao}`);
      return { tipo: 'flyer', url: urlFlyer, tipoFlyer: tipoProgramacao };
    }
  }

  // Verifica se é pergunta sobre calendário ou datas futuras
  const ehPerguntaCalendario = detectarPerguntaCalendario(mensagemDoCliente);
  if (ehPerguntaCalendario) {
    const calendarioTexto = await lerCalendarioTexto();
    if (calendarioTexto) {
      console.log(`📅 Pergunta de calendário detectada`);
      return { tipo: 'texto', mensagem: calendarioTexto };
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