// ============================================================================
// ADMIN.JS - Comandos do WhatsApp Admin (simplificado)
// ============================================================================
// Agora o painel web é o centro de controle.
// Aqui ficam apenas: pausar/ativar CBP e alertas.
// ============================================================================

require('dotenv').config();
const { salvarStatusGia } = require('./firebase');

async function processarComandoAdmin(mensagem) {
  try {
    const texto = mensagem.toLowerCase().trim();

    // ── PAUSAR CBP ── (aceita "cbp" e o antigo "gia")
    const PAUSAR = ['cbp pausar','pausar cbp','desativar cbp','cbp desativar',
                    'gia pausar','pausar gia','desativar gia','gia desativar'];
    if (PAUSAR.some((c) => texto.includes(c))) {
      await salvarStatusGia(false);
      return 'CBP pausado. Clientes não receberão resposta até você ativar novamente.';
    }

    // ── ATIVAR CBP ── (aceita "cbp" e o antigo "gia")
    const ATIVAR = ['cbp ativar','ativar cbp','ligar cbp','cbp ligar',
                    'gia ativar','ativar gia','ligar gia','gia ligar'];
    if (ATIVAR.some((c) => texto.includes(c))) {
      await salvarStatusGia(true);
      return 'CBP ativado. Voltando a atender normalmente.';
    }

    // ── AJUDA ──
    if (
      texto.includes('ajuda') ||
      texto.includes('help') ||
      texto.includes('comandos')
    ) {
      return `Comandos disponíveis via WhatsApp:

CONTROLE:
- CBP pausar
- CBP ativar

Tudo mais (flyers, cérebro, calendário, relatórios) é gerenciado pelo painel:
https://assistente-whatsapp-production-d909.up.railway.app/painel`;
    }

    // ── FALLBACK ──
    return `Comando não reconhecido.

Use "ajuda" para ver os comandos disponíveis, ou acesse o painel:
https://assistente-whatsapp-production-d909.up.railway.app/painel`;

  } catch (erro) {
    console.log('Erro no admin:', erro.message);
    return 'Erro ao processar. Tenta de novo.';
  }
}

module.exports = { processarComandoAdmin };