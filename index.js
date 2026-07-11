require('dotenv').config();

// ===== BLINDAGEM: nao deixar o processo morrer por erro nao tratado =====
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const webhook = require('./src/webhook');
const painel = require('./src/painel');
const { iniciarAgendamento } = require('./src/relatorio');
const { iniciarDisparos } = require('./src/disparos');
const zapi = require('./src/zapi');

const app = express();
const PORTA = process.env.PORT || 3000;

app.use(bodyParser.json());

// Serve os arquivos estáticos do painel
app.use('/painel', express.static(path.join(__dirname, 'painel')));

// Rotas da API do painel (login, flyers, cérebro, etc.)
app.use('/painel/api', painel);

// ============================================================================
// ROTA DE VERIFICAÇÃO
// ============================================================================
app.get('/', (req, res) => {
  res.send('Le Club - Gusthavo IA está online 🟢 | Painel: /painel');
});

// ============================================================================
// ROTA DO WEBHOOK
// ============================================================================
app.post('/webhook', async (req, res) => {
  webhook.processarMensagem(req.body);
  res.status(200).send('OK');
});

// ===== ALERTAS DE CONEXAO (Z-API "Ao desconectar" / "Ao conectar") =====
app.all('/desconectou', (req, res) => {
  res.status(200).send('OK'); // responde JA para nao dar timeout no teste da Z-API
  console.log('Z-API status (desconectou):', JSON.stringify(req.body || {}));
  zapi.enviarAlertaAdmin('⚠️ GIA DESCONECTOU do WhatsApp. O bot esta sem receber mensagens — reconecte na Z-API o quanto antes.').catch(() => {});
});
app.all('/conectou', (req, res) => {
  res.status(200).send('OK');
  zapi.enviarAlertaAdmin('✅ GIA reconectou ao WhatsApp. Voltou a receber mensagens normalmente.').catch(() => {});
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

  iniciarAgendamento();
  iniciarDisparos();
});