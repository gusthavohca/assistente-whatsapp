require('dotenv').config();
const { salvarCerebroDoGusthavo, salvarAtracao, salvarFlyer, salvarMensagemFlyer, lerCerebroDoGusthavo, salvarStatusGia, salvarCalendario, gerarCalendarioMes, getDataSP } = require('./firebase');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_ADMIN = `Você interpreta comandos do dono da Le Club e retorna APENAS um JSON válido, sem texto extra, sem markdown, sem explicações.

AÇÕES:
1. atualizar_atracao: quando falar de DJ ou horário
   {"acao":"atualizar_atracao","dia":"sexta","dj":"nome","horario":"22:30"}

2. atualizar_flyer: quando enviar link de imagem
   Tipos: programacao_sexta, programacao_sabado, entrada, camarote, aniversario
   {"acao":"atualizar_flyer","tipo":"entrada","url":"https://..."}

3. atualizar_mensagem_flyer: quando quiser definir texto enviado após o flyer
   Tipos: programacao_sexta, programacao_sabado, entrada, camarote, aniversario
   {"acao":"atualizar_mensagem_flyer","tipo":"entrada","mensagem":"texto da mensagem"}

4. atualizar_cerebro: quando quiser mudar comportamento do GIA
   {"acao":"atualizar_cerebro","instrucao":"o que mudar"}

5. pausar_gia: quando disser "GIA pausar", "desativar GIA", "pausar GIA"
   {"acao":"pausar_gia"}

6. ativar_gia: quando disser "GIA ativar", "ativar GIA", "ligar GIA"
   {"acao":"ativar_gia"}

7. atualizar_calendario: quando disser "Calendario: dia DD/MM ..."
   {"acao":"atualizar_calendario","dia":"09/05","descricao":"Sexta - DJ Almanac"}

8. gerar_calendario: quando disser "gerar calendario", "novo mês", "criar calendario", "preparar calendario"
   Use o mês e ano fornecidos no contexto se não especificado.
   {"acao":"gerar_calendario","mes":6,"ano":2026}

9. ajuda: quando disser "ajuda", "help", "comandos", "o que você faz"
   {"acao":"ajuda"}

10. responder: qualquer outra coisa
    {"acao":"responder","mensagem":"resposta aqui"}

Responda SOMENTE com o JSON. Nada mais.`;

async function processarComandoAdmin(mensagem) {
  try {
    const { dia, mes, ano } = getDataSP();
    const promptComData = `${PROMPT_ADMIN}\n\nData atual em São Paulo: ${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano} (dia=${dia}, mes=${mes}, ano=${ano})`;

    const resposta = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: promptComData,
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
        programacao_sexta: 'Programação Sexta',
        programacao_sabado: 'Programação Sábado',
        entrada: 'Entrada',
        camarote: 'Camarote',
        aniversario: 'Aniversário',
      };
      return `Flyer de ${nomes[json.tipo] || json.tipo} atualizado!`;
    }

    if (json.acao === 'atualizar_mensagem_flyer') {
      await salvarMensagemFlyer(json.tipo, json.mensagem);
      const nomes = {
        programacao_sexta: 'Programação Sexta',
        programacao_sabado: 'Programação Sábado',
        entrada: 'Entrada',
        camarote: 'Camarote',
        aniversario: 'Aniversário',
      };
      return `Mensagem do flyer de ${nomes[json.tipo] || json.tipo} atualizada!`;
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

    if (json.acao === 'atualizar_calendario') {
      await salvarCalendario(json.dia, json.descricao);
      return `Beleza! Calendário atualizado: dia ${json.dia} - ${json.descricao}`;
    }

    if (json.acao === 'gerar_calendario') {
      const resultado = await gerarCalendarioMes(json.mes, json.ano);
      if (!resultado) return 'Erro ao gerar calendário.';
      const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      const nomeMes = MESES[json.mes - 1];
      if (resultado.criados === 0) {
        return `Calendário de ${nomeMes}/${json.ano} já está completo (${resultado.total} datas: ${resultado.datas.join(', ')}).`;
      }
      return `Calendário de ${nomeMes}/${json.ano} gerado!\n${resultado.criados} datas criadas: ${resultado.datas.join(', ')}\n\nAgora atualize as atrações com:\nCalendario: dia DD/MM Sexta - DJ Nome`;
    }

    if (json.acao === 'ajuda') {
      return `Comandos disponíveis:

FLYERS (mande a imagem primeiro, depois o texto):
PROGRAMAÇÃO:
- programacao sexta
- programacao sabado

OUTROS:
- entrada
- camarote
- aniversario

MENSAGEM PÓS-FLYER:
- mensagem flyer entrada: [texto]
- mensagem flyer camarote: [texto]
- mensagem flyer aniversario: [texto]
- mensagem flyer programacao sexta: [texto]
- mensagem flyer programacao sabado: [texto]

CALENDÁRIO:
- Gerar calendario (cria todas as sextas/sábados do mês)
- Gerar calendario julho (para outro mês)
- Calendario: dia 06/06 Sexta - DJ Almanac (atualiza atração)

DJ DA SEMANA:
- DJ sexta: [nome] às [hora]
- DJ sabado: [nome] às [hora]

COMPORTAMENTO:
- Adiciona aí GIA que... [instrução]

CONTROLE:
- GIA pausar
- GIA ativar`;
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