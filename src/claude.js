require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { montarSystemPrompt } = require('./prompt');
const { lerHistorico, salvarHistorico, lerFlyer, lerCalendario, lerLinksEventos, lerClienteMeta, salvarClienteMeta } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================================
// CONTROLE DE PAUSA POR RESPOSTA MANUAL DO ADMIN
// ============================================================================

const PAUSA_APOS_MANUAL_MS = 30 * 60 * 1000;       // 30 min apos resposta manual
const PAUSA_NAO_SEI_MS = 6 * 60 * 60 * 1000;       // 6h quando GIA nao soube (ate o Gusthavo responder)

// A pausa agora e gravada no FIREBASE (clientes_meta.pausadoAte) para sobreviver
// a reinicios do Railway. Antes ficava so na memoria e era perdida a cada restart.
async function registrarRespostaManual(telefone) {
  try {
    await salvarClienteMeta(telefone, { pausadoAte: Date.now() + PAUSA_APOS_MANUAL_MS });
    console.log(`⏸️ Pausa de 30min (resposta manual) para ${telefone}`);
  } catch (e) { console.log('Erro ao pausar (manual):', e.message); }
}

async function pausarClientePorNaoSaber(telefone) {
  try {
    await salvarClienteMeta(telefone, { pausadoAte: Date.now() + PAUSA_NAO_SEI_MS });
    console.log(`⏸️ Pausa (GIA nao soube / modo ponte) para ${telefone}`);
  } catch (e) { console.log('Erro ao pausar (nao_sei):', e.message); }
}

// Libera o cliente (ex.: depois que o admin respondeu via modo ponte)
async function liberarCliente(telefone) {
  try { await salvarClienteMeta(telefone, { pausadoAte: 0 }); } catch (e) {}
}

// Salva a resposta MANUAL do Gusthavo no histórico da conversa, como se fosse
// uma fala do assistente. Assim, quando o GIA voltar a atender (após os 30min),
// ele enxerga o que o Gusthavo já respondeu e continua de onde parou, no contexto.
// Se a última entrada já for do assistente, concatena (a API exige alternância
// de papéis user/assistant e não aceita dois 'assistant' seguidos).
async function registrarMensagemManualNoHistorico(telefone, texto) {
  try {
    let historico = (await lerHistorico(telefone)) || [];
    const ultima = historico[historico.length - 1];
    if (ultima && ultima.role === 'assistant') {
      ultima.content = `${ultima.content}\n${texto}`;
    } else {
      historico.push({ role: 'assistant', content: texto });
    }
    historico = historico.slice(-20);
    await salvarHistorico(telefone, historico);
    console.log(`🧠 Resposta manual salva no histórico de ${telefone} (contexto preservado)`);
  } catch (erro) {
    console.log('⚠️ Erro ao salvar resposta manual no histórico:', erro.message);
  }
}

async function estaEmPausaManual(telefone) {
  try {
    const m = await lerClienteMeta(telefone);
    const ate = (m && m.pausadoAte) ? m.pausadoAte : 0;
    if (ate && ate > Date.now()) {
      console.log(`⏸️ GIA em pausa para ${telefone}. Restam ~${Math.ceil((ate - Date.now()) / 60000)} min`);
      return true;
    }
    return false;
  } catch (e) { return false; }
}

// ============================================================================
// DETECTAR PERGUNTA DE PROGRAMAÇÃO DO FIM DE SEMANA
// ============================================================================

function detectarPerguntaProgramacao(mensagem) {
  const msg = mensagem.toLowerCase();

  const termosValor = ['valor', 'preço', 'preco', 'quanto', 'ingresso', 'entrada', 'pagar', 'custa'];
  if (termosValor.some(t => msg.includes(t))) return null;

  const termosCalendario = [
    'calendário', 'calendario',
    'próximas semanas',
    'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro', 'janeiro',
    'fevereiro', 'março', 'marco', 'abril',
    'tem show no dia', 'o que tem no dia'
  ];
  if (termosCalendario.some(t => msg.includes(t))) return null;

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

// ============================================================================
// DETECTAR PERGUNTA DE CALENDÁRIO
// ============================================================================

function detectarPerguntaCalendario(mensagem) {
  const msg = mensagem.toLowerCase();

  const termosCalendario = [
    'calendário', 'calendario',
    'próximas semanas',
    'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro', 'janeiro',
    'fevereiro', 'março', 'marco', 'abril',
    'tem show no dia', 'o que tem no dia'
  ];

  return termosCalendario.some(t => msg.includes(t));
}

// ============================================================================
// DETECTAR PERGUNTA DE INGRESSO ANTECIPADO
// ============================================================================

function detectarPerguntaIngresso(mensagem) {
  const msg = mensagem.toLowerCase();

  const termosIngresso = [
    'ingresso', 'antecipado', 'comprar ingresso',
    'ingresso online', 'sympla', 'link do ingresso',
    'link para comprar', 'onde compro', 'como compro',
    'comprar online', 'ingresso antecipado'
  ];

  return termosIngresso.some(t => msg.includes(t));
}

// ============================================================================
// MONTAR TEXTO DOS LINKS DE EVENTOS
// ============================================================================

function montarTextoLinks(eventos) {
  if (!eventos || eventos.length === 0) return null;
  const linhas = eventos.map(ev => `${ev.data} — ${ev.atracao}\n${ev.url}`);
  return `Segue o link para comprar o ingresso antecipado:\n\n${linhas.join('\n\n')}`;
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function perguntarParaClaude(telefone, mensagemDoCliente) {

  if (await estaEmPausaManual(telefone)) {
    console.log(`🔇 Mensagem ignorada — GIA em pausa manual para ${telefone}`);
    return null;
  }

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
      return { tipo: 'flyer', url: urlFlyer };
    }
  }

  // Verifica se é pergunta sobre calendário ou datas futuras
  const ehPerguntaCalendario = detectarPerguntaCalendario(mensagemDoCliente);
  if (ehPerguntaCalendario) {
    const calendarioCompleto = await lerCalendario();
    if (calendarioCompleto) {
      console.log(`📅 Pergunta de calendário detectada`);
      return { tipo: 'texto', mensagem: `Segue a programação do mês:\n\n${calendarioCompleto}` };
    }
  }

  // Verifica se é pergunta sobre ingresso antecipado
  const ehPerguntaIngresso = detectarPerguntaIngresso(mensagemDoCliente);
  if (ehPerguntaIngresso) {
    const eventos = await lerLinksEventos();
    const textoLinks = montarTextoLinks(eventos);
    if (textoLinks) {
      console.log(`🎟️ Pergunta de ingresso detectada — enviando links dos eventos`);
      return { tipo: 'texto', mensagem: textoLinks };
    }
  }

  let nomeCliente = '';
  try {
    const meta = await lerClienteMeta(telefone);
    nomeCliente = meta.nome || meta.nomeInformado || '';
  } catch (e) {}
  const cerebro = await montarSystemPrompt(nomeCliente);

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

module.exports = { perguntarParaClaude, registrarRespostaManual, pausarClientePorNaoSaber, estaEmPausaManual, registrarMensagemManualNoHistorico, liberarCliente };