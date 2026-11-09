// ============================================================================
// PERFIL.JS - Historico (resumo) e nivel do cliente no CRM
// ============================================================================
// Dois caminhos alimentam o perfil:
//   1. Durante a conversa: a IA do WhatsApp emite [PERFIL:...] e [NIVEL:...]
//      (lido no webhook.js) quando aparece algo novo sobre o cliente.
//   2. Pelo painel: botao "Gerar com IA" chama gerarPerfilPorIA() sobre o
//      historico salvo (usado para clientes antigos ou para refazer o resumo).

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NIVEIS = ['bom', 'medio', 'fraco'];
const RESUMO_MAX = 400;

// Criterio unico, usado no prompt do WhatsApp e no botao do painel.
const CRITERIO_NIVEL = `- bom: intencao forte de compra — quer camarote ou pacote de aniversario, vem em grupo, ou ja pediu nome na lista e responde bem.
- medio: interesse real mas sem fechamento — pede lista, programacao ou valores e mantem a conversa.
- fraco: so perguntou preco/informacao solta, respostas curtas, sumiu ou disse que nao vai.`;

function normalizarNivel(valor) {
  const v = String(valor || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return NIVEIS.includes(v) ? v : '';
}

function limparResumo(texto) {
  return String(texto || '')
    .replace(/[\[\]<>{}]/g, ' ')
    .replace(/[\r\n]+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, RESUMO_MAX);
}

// Gera resumo + nivel a partir das mensagens salvas (role user/assistant).
async function gerarPerfilPorIA(mensagens) {
  const conversa = (mensagens || [])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => (m.role === 'user' ? 'CLIENTE: ' : 'CBP: ') +
      m.content.replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '').trim())
    .join('\n');

  if (!conversa.trim()) return { resumo: '', nivel: '' };

  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    system: `Voce resume conversas de WhatsApp de clientes de uma casa noturna (Le Club: sexta eletronica, sabado funk/open format) para o CRM.
Responda SOMENTE em JSON: {"resumo": "...", "nivel": "bom|medio|fraco"}.
resumo: so os pontos principais do perfil, curtos e separados por " / ". Ex.: "Interesse em camarote / Ja colocou nome na lista / Prefere sabado / Curte eletronico e funk / Vem em grupo de 6". Nada de saudacao ou detalhe irrelevante. Maximo ${RESUMO_MAX} caracteres. Baseie-se no que o CLIENTE disse.
nivel:
${CRITERIO_NIVEL}`,
    messages: [{ role: 'user', content: conversa }],
  });

  const texto = (resposta.content[0] && resposta.content[0].text) || '';
  const json = texto.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('IA nao devolveu JSON');
  const dados = JSON.parse(json[0]);
  return { resumo: limparResumo(dados.resumo), nivel: normalizarNivel(dados.nivel) };
}

module.exports = { gerarPerfilPorIA, normalizarNivel, limparResumo, CRITERIO_NIVEL, NIVEIS };
