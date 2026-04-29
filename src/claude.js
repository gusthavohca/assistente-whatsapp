require('dotenv').config();

const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompt');
const { lerAtracoes, lerCerebroDoGusthavo } = require('./firebase');

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const historicos = {};

// ============================================================================
// MONTA O CÉREBRO COM AS ATRAÇÕES DO FIREBASE
// ============================================================================
// Busca as atrações atuais e adiciona ao system prompt
// Assim o Gusthavo sabe quem toca sexta e sábado

async function montarCerebro() {
  // Tenta buscar cérebro atualizado do Firebase
  const cerebroFirebase = await lerCerebroDoGusthavo();

  // Usa o cérebro do Firebase se existir, senão usa o local
  const cerebroBase = cerebroFirebase || SYSTEM_PROMPT;

  // Busca as atrações do fim de semana
  const atracoes = await lerAtracoes();

  // Monta o bloco de informações das atrações
  let infoAtracoes = '\n\n═══════════════════════════════════════\n';
  infoAtracoes += '# PROGRAMAÇÃO DO FIM DE SEMANA (DADOS AO VIVO)\n';
  infoAtracoes += '═══════════════════════════════════════\n';
  infoAtracoes += 'Essas informações são atualizadas toda semana pelo painel admin.\n\n';

  if (atracoes.sexta && atracoes.sexta.ativo) {
    infoAtracoes += `SEXTA-FEIRA:\n`;
    infoAtracoes += `- DJ/Atração: ${atracoes.sexta.dj || 'A definir'}\n`;
    infoAtracoes += `- Horário de abertura: ${atracoes.sexta.horario || 'A definir'}\n`;
    if (atracoes.sexta.urlFlyer) {
      infoAtracoes += `- Flyer disponível: sim\n`;
    }
  } else {
    infoAtracoes += `SEXTA-FEIRA: Programação a confirmar\n`;
  }

  infoAtracoes += '\n';

  if (atracoes.sabado && atracoes.sabado.ativo) {
    infoAtracoes += `SÁBADO:\n`;
    infoAtracoes += `- DJ/Atração: ${atracoes.sabado.dj || 'A definir'}\n`;
    infoAtracoes += `- Horário de abertura: ${atracoes.sabado.horario || 'A definir'}\n`;
    if (atracoes.sabado.urlFlyer) {
      infoAtracoes += `- Flyer disponível: sim\n`;
    }
  } else {
    infoAtracoes += `SÁBADO: Programação a confirmar\n`;
  }

  infoAtracoes += '\nIMPORTANTE: Se o cliente perguntar sobre DJ ou programação, ';
  infoAtracoes += 'responda com essas informações acima. Nunca invente nomes de DJs.\n';
  infoAtracoes += '═══════════════════════════════════════\n';

  return cerebroBase + infoAtracoes;
}

// ============================================================================
// FUNÇÃO PRINCIPAL: CONVERSAR COM O GUSTHAVO
// ============================================================================

async function conversar(telefoneCliente, mensagemDoCliente) {
  if (!historicos[telefoneCliente]) {
    historicos[telefoneCliente] = [];
  }

  const historicoDoCliente = historicos[telefoneCliente];

  historicoDoCliente.push({
    role: 'user',
    content: mensagemDoCliente,
  });

  // Monta o cérebro com as atrações atualizadas
  const systemPromptAtualizado = await montarCerebro();

  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPromptAtualizado,
    messages: historicoDoCliente,
  });

  const textoResposta = resposta.content[0].text;

  historicoDoCliente.push({
    role: 'assistant',
    content: textoResposta,
  });

  return textoResposta;
}

// ============================================================================
// FUNÇÃO AUXILIAR: LIMPAR HISTÓRICO DE UM CLIENTE
// ============================================================================

function limparHistorico(telefoneCliente) {
  delete historicos[telefoneCliente];
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  conversar,
  limparHistorico,
};