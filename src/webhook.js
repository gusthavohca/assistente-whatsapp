// ============================================================================
// WEBHOOK.JS - O "cérebro decisor" entre o WhatsApp e a Claude
// ============================================================================
// Este arquivo é responsável por:
// 1. Receber a mensagem do cliente (via Z-API)
// 2. Chamar a Claude pra pensar a resposta
// 3. Analisar a resposta procurando comandos especiais
// 4. Executar as ações: enviar texto, flyers, alertas
// ============================================================================

// Importa os outros arquivos que criamos
const claude = require('./claude');
const zapi = require('./zapi');

// ============================================================================
// MAPA DOS FLYERS - associa o nome do comando com a URL da imagem
// ============================================================================
// IMPORTANTE: as URLs ainda estão como placeholders.
// No Sub-passo 5.7 vamos hospedar os flyers e colocar as URLs reais aqui.

const FLYERS = {
  entrada: 'COLOCAR_URL_DO_FLYER_ENTRADA_AQUI',
  camarotes: 'COLOCAR_URL_DO_FLYER_CAMAROTES_AQUI',
  aniversario: 'COLOCAR_URL_DO_FLYER_ANIVERSARIO_AQUI',
};

// ============================================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA
// ============================================================================
// É chamada toda vez que a Z-API avisa que chegou uma nova mensagem

async function processarMensagem(dadosDoWebhook) {
  try {
    // 1. EXTRAIR DADOS DA MENSAGEM
    // A Z-API manda um objeto gigante, a gente pega só o que importa:
    //   - phone: número do cliente
    //   - text.message: o texto da mensagem
    //   - fromMe: se a mensagem foi enviada por nós mesmos (pra ignorar)

    const telefoneCliente = dadosDoWebhook.phone;
    const textoRecebido = dadosDoWebhook.text?.message;
    const enviadaPorNos = dadosDoWebhook.fromMe;

    // Se a mensagem foi enviada pelo próprio número da Le Club, IGNORAR
    // (senão entraria em loop infinito: nossa mensagem → recebida → resposta → ...)
    if (enviadaPorNos) {
      console.log('↩️  Mensagem enviada por nós mesmos, ignorando.');
      return;
    }

    // Se não tem texto (pode ser foto, áudio, etc), ignorar por enquanto
    if (!textoRecebido) {
      console.log('📎 Mensagem sem texto recebida, ignorando por enquanto.');
      return;
    }

    console.log(`📥 Mensagem recebida de ${telefoneCliente}: "${textoRecebido}"`);

    // 2. CHAMAR A CLAUDE PRA PENSAR A RESPOSTA
    const respostaDaClaude = await claude.conversar(telefoneCliente, textoRecebido);
    console.log(`🤖 Claude respondeu: "${respostaDaClaude}"`);

    // 3. ANALISAR A RESPOSTA PROCURANDO COMANDOS ESPECIAIS
    // O cérebro do Gusthavo às vezes inclui comandos tipo:
    //   [ENVIAR_FLYER:camarotes]
    //   [ALERTAR_GUSTHAVO]
    // A gente identifica, executa a ação, e REMOVE o comando do texto final.

    const flyersSolicitados = [];
    let precisaAlertar = false;
    let textoLimpo = respostaDaClaude;

    // Procura [ENVIAR_FLYER:xxx] - pode ter mais de um
    const regexFlyer = /\[ENVIAR_FLYER:(entrada|camarotes|aniversario)\]/g;
    let matchFlyer;
    while ((matchFlyer = regexFlyer.exec(respostaDaClaude)) !== null) {
      flyersSolicitados.push(matchFlyer[1]);
    }
    textoLimpo = textoLimpo.replace(regexFlyer, '').trim();

    // Procura [ALERTAR_GUSTHAVO]
    if (textoLimpo.includes('[ALERTAR_GUSTHAVO]')) {
      precisaAlertar = true;
      textoLimpo = textoLimpo.replace(/\[ALERTAR_GUSTHAVO\]/g, '').trim();
    }

    // Limpeza final: remove linhas vazias duplicadas que sobram após os comandos
    textoLimpo = textoLimpo.replace(/\n{3,}/g, '\n\n').trim();

    // 4. EXECUTAR AÇÕES

    // 4a. QUEBRAR A RESPOSTA EM MÚLTIPLAS MENSAGENS
    // O Gusthavo foi instruído a usar LINHA VAZIA pra separar mensagens
    // (pra parecer áudio de zap picotado). A gente quebra e envia separado.
    const pedacos = textoLimpo.split(/\n\s*\n/).filter((p) => p.trim() !== '');

    for (const pedaco of pedacos) {
      await zapi.enviarTexto(telefoneCliente, pedaco.trim());
      // Espera 1.5 segundo entre mensagens pra parecer humano digitando
      await esperar(1500);
    }

    // 4b. ENVIAR FLYERS SOLICITADOS
    for (const nomeFlyer of flyersSolicitados) {
      const urlFlyer = FLYERS[nomeFlyer];
      if (urlFlyer && !urlFlyer.startsWith('COLOCAR_URL')) {
        await zapi.enviarImagem(telefoneCliente, urlFlyer);
        await esperar(1000);
      } else {
        console.log(`⚠️  URL do flyer "${nomeFlyer}" ainda não configurada.`);
      }
    }

    // 4c. ENVIAR ALERTA PRO DONO SE NECESSÁRIO
    if (precisaAlertar) {
      await zapi.alertarDono(telefoneCliente, textoRecebido);
    }

    console.log(`✅ Atendimento concluído para ${telefoneCliente}\n`);
  } catch (erro) {
    console.log('❌ Erro ao processar mensagem:');
    console.log(erro.message);
  }
}

// ============================================================================
// FUNÇÃO AUXILIAR: ESPERAR (pra simular humano digitando)
// ============================================================================

function esperar(milissegundos) {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  processarMensagem,
};