// ============================================================================
// CLAUDE.JS - Comunicação com a API da Claude (Anthropic)
// ============================================================================
// Este arquivo é responsável por:
// 1. Enviar mensagens do cliente pra Claude pensar a resposta
// 2. Manter o histórico de conversa separado por cliente (por telefone)
// 3. Retornar a resposta do Gusthavo pra quem pediu
// ============================================================================

// Carrega as variáveis do .env (chave da Claude)
require('dotenv').config();

// Importa o SDK da Claude
const Anthropic = require('@anthropic-ai/sdk');

// Importa o cérebro do Gusthavo
const { SYSTEM_PROMPT } = require('./prompt');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

// Cria o cliente da Claude usando nossa API Key do .env
const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// "Memória" da IA: guarda o histórico de conversa de cada cliente separado
// A "chave" é o telefone do cliente, e o "valor" é o array de mensagens dele
// Exemplo: historicos['5511999999999'] = [{role: 'user', content: 'oi'}, ...]
const historicos = {};

// ============================================================================
// FUNÇÃO PRINCIPAL: CONVERSAR COM O GUSTHAVO
// ============================================================================

async function conversar(telefoneCliente, mensagemDoCliente) {
  // Se o cliente ainda não tem histórico, cria um vazio pra ele
  if (!historicos[telefoneCliente]) {
    historicos[telefoneCliente] = [];
  }

  // Pega o histórico desse cliente
  const historicoDoCliente = historicos[telefoneCliente];

  // Adiciona a mensagem nova dele no histórico
  historicoDoCliente.push({
    role: 'user',
    content: mensagemDoCliente,
  });

  // Chama a Claude API: manda o cérebro + todo histórico até agora
  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: historicoDoCliente,
  });

  // Pega o texto da resposta
  const textoResposta = resposta.content[0].text;

  // Adiciona a resposta do Gusthavo no histórico (pra ele lembrar depois)
  historicoDoCliente.push({
    role: 'assistant',
    content: textoResposta,
  });

  // Retorna a resposta pra quem chamou essa função
  return textoResposta;
}

// ============================================================================
// FUNÇÃO AUXILIAR: LIMPAR HISTÓRICO DE UM CLIENTE
// ============================================================================
// Útil pra quando quisermos "resetar" a conversa de alguém específico
// (por exemplo, se o atendente humano assumiu e quer limpar o contexto depois)

function limparHistorico(telefoneCliente) {
  delete historicos[telefoneCliente];
}

// ============================================================================
// EXPORTAÇÃO - o que outros arquivos podem usar desse arquivo
// ============================================================================

module.exports = {
  conversar,
  limparHistorico,
};