require('dotenv').config();
const { salvarCerebroDoGusthavo, salvarAtracao } = require('./firebase');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_ADMIN = `Você interpreta comandos do dono da Le Club e retorna APENAS um JSON válido, sem texto extra, sem markdown, sem explicações.

AÇÕES:
1. atualizar_atracao: quando falar de DJ, horário, programação
   {"acao":"atualizar_atracao","dia":"sexta","dj":"nome do DJ","horario":"22:30"}

2. atualizar_cerebro: quando quiser mudar comportamento do GIA
   {"acao":"atualizar_cerebro","instrucao":"o que mudar"}

3. responder: qualquer outra coisa
   {"acao":"responder","mensagem":"resposta aqui"}

Responda SOMENTE com o JSON. Nada mais.`;

async function processarComandoAdmin(mensagem) {
  try {
    const resposta = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: PROMPT_ADMIN,
      messages: [{ role: 'user', content: mensagem }],
    });

    let texto = resposta.content[0].text.trim();
    texto = texto.replace(/```json|```/g, '').trim();

    const json = JSON.parse(texto);

    if (json.acao === 'atualizar_atracao') {
      await salvarAtracao(json.dia, {
        dj: json.dj,
        horario: json.horario,
        ativo: true,
      });
      return `Beleza! ${json.dia} atualizado: ${json.dj} às ${json.horario}`;
    }

    if (json.acao === 'atualizar_cerebro') {
      const { lerCerebroDoGusthavo } = require('./firebase');
      const cerebroAtual = await lerCerebroDoGusthavo();
      const novoCerebro = cerebroAtual + `\n\n[ATUALIZAÇÃO]: ${json.instrucao}`;
      await salvarCerebroDoGusthavo(novoCerebro);
      return `Feito! GIA atualizado.`;
    }

    if (json.acao === 'responder') {
      return json.mensagem;
    }

    return 'Comando não reconhecido.';
  } catch (erro) {
    console.log('Erro no admin:', erro.message);
    return 'Erro ao processar. Tenta de novo.';
  }
}

module.exports = { processarComandoAdmin };