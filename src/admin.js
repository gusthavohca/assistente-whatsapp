require('dotenv').config();
const { salvarCerebroDoGusthavo, salvarAtracao, lerAtracoes } = require('./firebase');
const { SYSTEM_PROMPT } = require('./prompt');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_ADMIN = `
Você é um assistente que ajuda o dono da Le Club a gerenciar o sistema GIA pelo WhatsApp.

Você interpreta comandos em linguagem natural e retorna um JSON com a ação a executar.

AÇÕES DISPONÍVEIS:

1. atualizar_atracao — quando o dono falar sobre DJ, horário ou programação
   Exemplos: "DJ da sexta é Volkan, abre 22h", "sábado vai ter DJ Pedro às 23h"
   Retorno: {"acao": "atualizar_atracao", "dia": "sexta" ou "sabado", "dj": "nome", "horario": "22:00"}

2. atualizar_cerebro — quando o dono quiser mudar o comportamento do GIA
   Exemplos: "adiciona que temos estacionamento", "remove a parte sobre dress code"
   Retorno: {"acao": "atualizar_cerebro", "instrucao": "o que deve ser alterado"}

3. responder — quando for apenas uma pergunta ou conversa
   Exemplos: "tudo bem?", "quantos clientes atendidos hoje?"
   Retorno: {"acao": "responder", "mensagem": "sua resposta aqui"}

Responda APENAS com o JSON, sem texto extra.
`;

async function processarComandoAdmin(mensagem, cerebroAtual) {
  try {
    const resposta = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: PROMPT_ADMIN,
      messages: [{ role: 'user', content: mensagem }],
    });

    const texto = resposta.content[0].text.trim();
    const json = JSON.parse(texto);

    if (json.acao === 'atualizar_atracao') {
      await salvarAtracao(json.dia, {
        dj: json.dj,
        horario: json.horario,
        ativo: true,
      });
      return `Beleza! Atração do ${json.dia} atualizada: ${json.dj} às ${json.horario}`;
    }

    if (json.acao === 'atualizar_cerebro') {
      const novocerebro = cerebroAtual + `\n\n[ATUALIZAÇÃO]: ${json.instrucao}`;
      await salvarCerebroDoGusthavo(novocerebro);
      return `Feito! GIA atualizado com a nova instrução.`;
    }

    if (json.acao === 'responder') {
      return json.mensagem;
    }

    return 'Não entendi o comando. Tenta de novo.';
  } catch (erro) {
    console.log('Erro no admin:', erro.message);
    return 'Erro ao processar comando. Tenta de novo.';
  }
}

module.exports = { processarComandoAdmin };