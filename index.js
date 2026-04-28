require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const webhook = require('./src/webhook');
const { lerAtracoes, lerCerebroDoGusthavo, salvarAtracao, salvarCerebroDoGusthavo } = require('./src/firebase');
const { SYSTEM_PROMPT } = require('./src/prompt');

const app = express();
const PORTA = 3000;

app.use(bodyParser.json());

// Serve os arquivos do painel
app.use('/painel', express.static(path.join(__dirname, 'painel')));

// ============================================================================
// ROTA DE VERIFICAÇÃO
// ============================================================================
app.get('/', (req, res) => {
  res.send('Le Club - Gusthavo IA está online 🟢 | Painel: /painel');
});

// ============================================================================
// ROTAS DO PAINEL ADMIN
// ============================================================================

// Carrega todos os dados pro painel
app.get('/api/dados', async (req, res) => {
  const [atracoes, cerebro] = await Promise.all([
    lerAtracoes(),
    lerCerebroDoGusthavo(),
  ]);
  res.json({
    atracoes,
    cerebro: cerebro || SYSTEM_PROMPT,
  });
});

// Salva atração (sexta ou sábado)
app.post('/api/salvar-atracao', async (req, res) => {
  const { dia, dados } = req.body;
  const ok = await salvarAtracao(dia, dados);
  res.json({ ok });
});

// Salva o cérebro do Gusthavo
app.post('/api/salvar-cerebro', async (req, res) => {
  const { cerebro } = req.body;
  const ok = await salvarCerebroDoGusthavo(cerebro);
  res.json({ ok });
});

// ============================================================================
// ROTA DO WEBHOOK
// ============================================================================
app.post('/webhook', async (req, res) => {
  webhook.processarMensagem(req.body);
  res.status(200).send('OK');
});

// ============================================================================
// LIGAR O SERVIDOR
// ============================================================================
app.listen(PORTA, () => {
  console.log('');
  console.log('========================================');
  console.log('  LE CLUB - Gusthavo IA');
  console.log('========================================');
  console.log(`  Servidor online na porta ${PORTA}`);
  console.log(`  URL local: http://localhost:${PORTA}`);
  console.log(`  Painel: http://localhost:${PORTA}/painel`);
  console.log(`  Webhook: http://localhost:${PORTA}/webhook`);
  console.log('========================================');
  console.log('  Aguardando mensagens do WhatsApp...');
  console.log('');
});