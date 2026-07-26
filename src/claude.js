// ============================================================================
// CLAUDE.JS - Motor de IA do CBP (Chico Bento Promoter)
// ============================================================================

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { montarSystemPrompt } = require('./prompt');
const {
  lerHistorico, salvarHistorico, lerFlyer, lerCalendario, lerLinksEventos,
  lerClienteMeta, salvarClienteMeta,
} = require('./firebase');
const zapi = require('./zapi');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================================================
// ALERTA DE FALHA DA IA (limitado a 1 a cada 10 min)
// ============================================================================
let ultimoAlertaIA = 0;
function alertarFalhaIA(msg) {
  const agora = Date.now();
  if (agora - ultimoAlertaIA < 10 * 60 * 1000) return;
  ultimoAlertaIA = agora;
  zapi.enviarAlertaAdmin('⚠️ A IA do CBP FALHOU (Anthropic): ' + (msg || 'erro') +
    '. Verifique credito/chave. O bot esta acionando o modo ponte com os clientes.').catch(() => {});
}

// ============================================================================
// PAUSA (persistida no Firebase — sobrevive a reinicios)
// ============================================================================
const PAUSA_APOS_MANUAL_MS = 30 * 60 * 1000;   // 30 min apos resposta manual
const PAUSA_NAO_SEI_MS = 6 * 60 * 60 * 1000;   // 6h ate o Gusthavo responder

async function registrarRespostaManual(telefone) {
  try {
    await salvarClienteMeta(telefone, { pausadoAte: Date.now() + PAUSA_APOS_MANUAL_MS });
    console.log(`⏸️ Pausa de 30min (resposta manual) para ${telefone}`);
  } catch (e) { console.log('Erro ao pausar (manual):', e.message); }
}

async function pausarClientePorNaoSaber(telefone) {
  try {
    await salvarClienteMeta(telefone, { pausadoAte: Date.now() + PAUSA_NAO_SEI_MS });
    console.log(`⏸️ Pausa (modo ponte) para ${telefone}`);
  } catch (e) { console.log('Erro ao pausar (nao_sei):', e.message); }
}

async function liberarCliente(telefone) {
  try { await salvarClienteMeta(telefone, { pausadoAte: 0 }); } catch (e) {}
}

async function estaEmPausaManual(telefone) {
  try {
    const m = await lerClienteMeta(telefone);
    const ate = (m && m.pausadoAte) ? m.pausadoAte : 0;
    if (ate && ate > Date.now()) {
      console.log(`⏸️ CBP em pausa para ${telefone}. Restam ~${Math.ceil((ate - Date.now()) / 60000)} min`);
      return true;
    }
    return false;
  } catch (e) { return false; }
}

// ============================================================================
// HISTORICO — salva resposta manual do Gusthavo como fala do assistente
// ============================================================================
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
    console.log(`🧠 Resposta manual salva no historico de ${telefone}`);
  } catch (erro) {
    console.log('⚠️ Erro ao salvar resposta manual no historico:', erro.message);
  }
}

// ============================================================================
// ANTI-DUPLICACAO — o que ja foi enviado para este cliente
// ============================================================================
// Janela: 12h. Depois disso pode reenviar (nova conversa, evento novo).
const JANELA_DUPLICIDADE_MS = 12 * 60 * 60 * 1000;

function montarJaEnviou(meta) {
  const envios = (meta && meta.envios) || {};
  const agora = Date.now();
  const recente = (ts) => !!ts && (agora - ts) < JANELA_DUPLICIDADE_MS;
  const flyersRecentes = Object.keys(envios)
    .filter((k) => k.startsWith('flyer_') && recente(envios[k]))
    .map((k) => k.replace('flyer_', ''));
  return {
    links: recente(envios.links),
    calendario: recente(envios.calendario),
    flyers: flyersRecentes,
  };
}

async function registrarEnvio(telefone, chave) {
  try {
    const meta = await lerClienteMeta(telefone);
    const envios = (meta && meta.envios) || {};
    envios[chave] = Date.now();
    await salvarClienteMeta(telefone, { envios });
  } catch (e) { /* nao bloqueia o atendimento */ }
}

// ============================================================================
// AJUDA — links de eventos em texto
// ============================================================================
function montarTextoLinks(eventos) {
  if (!eventos || eventos.length === 0) return null;
  const linhas = eventos.map(ev => `${ev.data} — ${ev.atracao}\n${ev.url}`);
  return `Segue o link para comprar o ingresso antecipado:\n\n${linhas.join('\n\n')}`;
}

// ============================================================================
// FUNCAO PRINCIPAL
// ============================================================================
// Os atalhos por palavra-chave foram REMOVIDOS. Eles disparavam antes da IA e
// causavam envio duplicado de links/calendario e resposta fora de contexto.
// Agora quem decide e a IA, com o contexto completo da conversa.

async function perguntarParaClaude(telefone, mensagemDoCliente) {
  if (await estaEmPausaManual(telefone)) {
    console.log(`🔇 Mensagem ignorada — CBP em pausa para ${telefone}`);
    return null;
  }

  // Contexto persistente do cliente (nome, se ja perguntou, o que ja enviou)
  let meta = {};
  try { meta = (await lerClienteMeta(telefone)) || {}; } catch (e) { meta = {}; }

  const ctx = {
    nomeCliente: meta.nome || meta.nomeInformado || '',
    jaPerguntouNome: meta.jaPerguntouNome === true,
    jaVisitou: meta.jaVisitou,
    jaEnviou: montarJaEnviou(meta),
  };

  let historico = [];
  try { historico = (await lerHistorico(telefone)) || []; } catch (erro) { historico = []; }

  const cerebro = await montarSystemPrompt(ctx);

  historico.push({ role: 'user', content: mensagemDoCliente });

  let resposta;
  try {
    resposta = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: cerebro,
      messages: historico,
    });
  } catch (erroIA) {
    console.log('❌ Erro na IA (Anthropic):', erroIA.message);
    alertarFalhaIA(erroIA.message);
    return { tipo: 'falha_ia', pergunta: mensagemDoCliente };
  }

  const textoResposta = resposta.content[0].text;

  historico.push({ role: 'assistant', content: textoResposta });
  try { await salvarHistorico(telefone, historico.slice(-20)); }
  catch (erro) { console.log('⚠️ Erro ao salvar historico.'); }

  return { tipo: 'texto', mensagem: textoResposta };
}

module.exports = {
  perguntarParaClaude,
  registrarRespostaManual,
  pausarClientePorNaoSaber,
  estaEmPausaManual,
  registrarMensagemManualNoHistorico,
  liberarCliente,
  registrarEnvio,
  montarTextoLinks,
};
