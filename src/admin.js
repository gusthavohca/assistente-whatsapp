// ============================================================================
// ADMIN.JS - Comandos do WhatsApp Admin (simplificado)
// ============================================================================
// Agora o painel web é o centro de controle.
// Aqui ficam apenas: pausar/ativar GIA e alertas.
// ============================================================================

require('dotenv').config();
const { salvarStatusGia } = require('./firebase');

async function processarComandoAdmin(mensagem) {
  try {
    const texto = mensagem.toLowerCase().trim();

    // ── PAUSAR GIA ──
    if (
      texto.includes('gia pausar') ||
      texto.includes('pausar gia') ||
      texto.includes('desativar gia') ||
      texto.includes('gia desativar')
    ) {
      await salvarStatusGia(false);
      return 'GIA pausado. Clientes não receberão resposta até você ativar novamente.';
    }

    // ── ATIVAR GIA ──
    if (
      texto.includes('gia ativar') ||
      texto.includes('ativar gia') ||
      texto.includes('ligar gia') ||
      texto.includes('gia ligar')
    ) {
      await salvarStatusGia(true);
      return 'GIA ativado. Voltando a atender normalmente.';
    }

    // ── AJUDA ──
    if (
      texto.includes('ajuda') ||
      texto.includes('help') ||
      texto.includes('comandos')
    ) {
      return `Comandos disponíveis via WhatsApp:

CONTROLE:
- GIA pausar
- GIA ativar

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