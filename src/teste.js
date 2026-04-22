// ============================================================================
// TESTE DO GUSTHAVO IA - Conversa no terminal
// ============================================================================
// Este arquivo serve pra testar o cérebro do Gusthavo antes de conectar
// no WhatsApp. Você digita, ele responde, a gente refina o comportamento.
// Rode com: node src/teste.js
// ============================================================================

// Carrega as variáveis do .env (chave da Claude, etc)
require('dotenv').config();

// Importa o SDK da Claude e o cérebro do Gusthavo
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompt');

// Importa o "readline" do Node - ferramenta pra ler o que você digita no terminal
const readline = require('readline');

// ============================================================================
// CONFIGURAÇÃO DA IA
// ============================================================================

// Cria o "cliente" da Claude usando sua API key do .env
const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Array que vai guardar o histórico da conversa (memória do Gusthavo)
const historico = [];

// ============================================================================
// FUNÇÃO QUE ENVIA A MENSAGEM PRA CLAUDE E RECEBE A RESPOSTA
// ============================================================================

async function conversarComGusthavo(mensagemDoCliente) {
  // Adiciona a mensagem do cliente no histórico
  historico.push({
    role: 'user',
    content: mensagemDoCliente,
  });

  // Chama a Claude API passando o cérebro + histórico da conversa
  const resposta = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: historico,
  });

  // Pega o texto da resposta do Gusthavo
  const textoResposta = resposta.content[0].text;

  // Adiciona a resposta no histórico pra manter memória
  historico.push({
    role: 'assistant',
    content: textoResposta,
  });

  return textoResposta;
}

// ============================================================================
// INTERFACE DE TERMINAL - Você digita, ele responde
// ============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n========================================');
console.log('  TESTE DO GUSTHAVO IA - Le Club');
console.log('========================================');
console.log('Digite "sair" pra encerrar o teste.\n');

function fazerPergunta() {
  rl.question('👤 Cliente: ', async (mensagem) => {
    // Se o cliente digitar "sair", encerra
    if (mensagem.toLowerCase().trim() === 'sair') {
      console.log('\n🥂 Teste encerrado. Até logo!\n');
      rl.close();
      return;
    }

    try {
      // Envia a mensagem pra Claude e espera a resposta
      const resposta = await conversarComGusthavo(mensagem);
      console.log(`\n🤵 Gusthavo: ${resposta}\n`);
    } catch (erro) {
      console.log('\n❌ Erro ao conversar com a Claude:');
      console.log(erro.message);
      console.log('');
    }

    // Pergunta de novo (loop)
    fazerPergunta();
  });
}

// Começa o loop
fazerPergunta();