require('dotenv').config();
const { salvarCerebroDoGusthavo, salvarAtracao, salvarFlyer, salvarInfo, lerCerebroDoGusthavo, salvarStatusGia } = require('./firebase');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_ADMIN = `Você interpreta comandos do dono da Le Club e retorna APENAS um JSON válido, sem texto extra, sem markdown, sem explicações.

AÇÕES:
1. atualizar_atracao: quando falar de DJ ou horário
   {"acao":"atualizar_atracao","dia":"sexta","dj":"nome","horario":"22:30"}

2. atualizar_flyer: quando enviar link de imagem
   Tipos: entrada_sexta, entrada_sabado, camarote_sexta, camarote_sabado, aniversario
   {"acao":"atualizar_flyer","tipo":"entrada_sexta","url":"https://..."}

3. atualizar_info: quando falar de valores, benefícios, programação ou infos extras
   Tipos: entrada_sexta, entrada_sabado, camarote_sexta, camarote_sabado, aniversario_sexta, aniversario_sabado, programacao, extra
   {"acao":"atualizar_info","tipo":"entrada_sexta","conteudo":"R$40 até meia noite, R$60 depois"}

4. atualizar_cerebro: quando quiser mudar comportamento do GIA
   {"acao":"atualizar_cerebro","instrucao":"o que mudar"}

5. pausar_gia: quando disser "GIA pausar", "desativar GIA", "pausar GIA"
   {"acao":"pausar_gia"}

6. ativar_gia: quando disser "GIA ativar", "ativar GIA", "ligar GIA"
   {"acao":"ativar_gia"}

7. responder: qualquer outra coisa
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

    if (json.acao === 'atualizar_flyer') {
      await salvarFlyer(json.tipo, json.url);
      const nomes = {
        entrada_sexta: 'Entrada Sexta',
        entrada_sabado: 'Entrada Sábado',
        camarote_sexta: 'Camarote Sexta',
        camarote_sabado: 'Camarote Sábado',
        aniversario: 'Aniversário',
      };
      return `Flyer de ${nomes[json.tipo] || json.tipo} atualizado!`;
    }

    if (json.acao === 'atualizar_info') {
      await salvarInfo(json.tipo, json.conteudo);
      const nomes = {
        entrada_sexta: 'Entrada Sexta',
        entrada_sabado: 'Entrada Sábado',
        camarote_sexta: 'Camarote Sexta',
        camarote_sabado: 'Camarote Sábado',
        aniversario_sexta: 'Aniversário Sexta',
        aniversario_sabado: 'Aniversário Sábado',
        programacao: 'Programação',
        extra: 'Informação Extra',
      };
      return `Beleza! ${nomes[json.tipo] || json.tipo} atualizado.`;
    }

    if (json.acao === 'atualizar_cerebro') {
      const cerebroAtual = await lerCerebroDoGusthavo();
      const novoCerebro = cerebroAtual + `\n\n[ATUALIZAÇÃO]: ${json.instrucao}`;
      await salvarCerebroDoGusthavo(novoCerebro);
      return `Feito! GIA atualizado.`;
    }

    if (json.acao === 'pausar_gia') {
      await salvarStatusGia(false);
      return 'GIA pausado. Clientes não receberão resposta até você ativar novamente.';
    }

    if (json.acao === 'ativar_gia') {
      await salvarStatusGia(true);
      return 'GIA ativado. Voltando a atender normalmente.';
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