// ============================================================================
// INDEX.JS - Servidor principal da Le Club IA
// ============================================================================
// Este é o arquivo PRINCIPAL do projeto. Quando você roda "node index.js",
// ele liga o servidor que fica escutando mensagens do WhatsApp 24/7.
//
// Como tudo funciona em conjunto:
//   1. Z-API recebe mensagem do cliente
//   2. Z-API "bate" na porta do nosso servidor (webhook)
//   3. Servidor passa pro webhook.js processar
//   4. webhook.js chama claude.js + zapi.js pra resolver
//   5. Resposta volta pro cliente no WhatsApp
// ============================================================================

// Carrega as variáveis do .env ANTES de qualquer coisa
require('dotenv').config();

// Importa o Express (framework de servidor) e o body-parser (leitor de JSON)
const express = require('express');
const bodyParser = require('body-parser');

// Importa o webhook (que sabe processar mensagens recebidas)
const webhook = require('./src/webhook');

// ============================================================================
// CONFIGURAÇÃO DO SERVIDOR
// ============================================================================

// Cria uma instância do Express (nosso servidor)
const app = express();

// Configura pra entender mensagens em formato JSON (que é como a Z-API envia)
app.use(bodyParser.json());

// Porta em que o servidor vai escutar
// 3000 é um padrão pra desenvolvimento local
const PORTA = 3000;

// ============================================================================
// ROTA DE VERIFICAÇÃO - Só pra confirmar que o servidor tá no ar
// ============================================================================
// Quando você acessar http://localhost:3000/ no navegador,
// vai ver "Le Club - Gusthavo IA está online 🟢"

app.get('/', (requisicao, resposta) => {
  resposta.send('Le Club - Gusthavo IA está online 🟢');
});

// ============================================================================
// ROTA DO WEBHOOK - Aqui a Z-API bate quando chega mensagem
// ============================================================================
// A URL completa vai ser: http://seu-servidor/webhook
// Toda vez que a Z-API receber uma mensagem no WhatsApp da Le Club,
// ela faz um POST pra essa URL, trazendo os dados da mensagem no corpo.

app.post('/webhook', async (requisicao, resposta) => {
  // Pega os dados que a Z-API enviou
  const dadosRecebidos = requisicao.body;

  // Passa pro webhook.js processar (mas NÃO ESPERA terminar)
  // Isso é importante: a Z-API espera resposta rápida, então respondemos OK
  // imediatamente e processamos em segundo plano
  webhook.processarMensagem(dadosRecebidos);

  // Responde pra Z-API que recebemos a mensagem com sucesso
  resposta.status(200).send('OK');
});

// ============================================================================
// LIGAR O SERVIDOR
// ============================================================================

app.listen(PORTA, () => {
  console.log('');
  console.log('========================================');
  console.log('  🥂 LE CLUB - Gusthavo IA');
  console.log('========================================');
  console.log(`  🟢 Servidor online na porta ${PORTA}`);
  console.log(`  🔗 URL local: http://localhost:${PORTA}`);
  console.log(`  🎯 Webhook: http://localhost:${PORTA}/webhook`);
  console.log('========================================');
  console.log('  Aguardando mensagens do WhatsApp...');
  console.log('');
});