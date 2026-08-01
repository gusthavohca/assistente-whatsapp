// ============================================================================
// ADMIN.JS - Comandos do WhatsApp Admin
// ============================================================================
// Comandos disponíveis:
//
// CONTROLE CBP:
//   CBP pausar / CBP ativar
//
// PENSA NO EVENTO:
//   LISTA Nome Sobrenome +N [masc]   → adiciona na lista (default: feminino)
//   RESERVA C3 Nome Sobrenome N      → cria reserva de camarote (N = pax)
//   ANIV Nome Sobrenome              → cria lista especial de aniversário
//   PNE EVENTO 105212                → define o evento ativo
//   PNE COOKIES phpSESSID=xxx...     → atualiza cookies da sessão
//   PNE STATUS                       → mostra evento ativo e status da sessão
//
// AJUDA:
//   ajuda / help / comandos
// ============================================================================

require('dotenv').config();
const { salvarStatusGia } = require('./firebase');
const pne = require('./pne');

// ============================================================================
// PARSER DE COMANDOS PNE
// ============================================================================

// LISTA Maria Silva +2
// LISTA Maria Silva +2 masc
function parseLista(texto) {
  // Regex: LISTA <nome com espaços e acentos> +<N> [masc|fem]
  const m = texto.match(/^lista\s+(.+?)\s+\+(\d+)(?:\s+(masc|fem|masculino|feminino))?$/i);
  if (!m) return null;
  return {
    nome: m[1].trim(),
    acompanhantes: parseInt(m[2], 10),
    tipo: m[3] ? m[3].toLowerCase() : 'fem',
  };
}

// RESERVA C3 Maria Silva 4
// RESERVA C3 Maria Silva       (pax padrão = 1)
function parseReserva(texto) {
  const m = texto.match(/^reserva\s+([a-z0-9]+)\s+(.+?)(?:\s+(\d+))?$/i);
  if (!m) return null;
  return {
    camarote: m[1].trim().toUpperCase(),
    nome: m[2].trim(),
    pax: m[3] ? parseInt(m[3], 10) : 1,
  };
}

// ANIV Maria Silva [obs]
function parseAniv(texto) {
  const m = texto.match(/^aniv(?:ers[aá]rio)?\s+(.+?)(?:\s*[-–]\s*(.+))?$/i);
  if (!m) return null;
  return {
    nome: m[1].trim(),
    obs: m[2] ? m[2].trim() : '',
  };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

async function processarComandoAdmin(mensagem) {
  try {
    const texto = mensagem.toLowerCase().trim();
    // Mantemos o original para capturar nomes com capitalização correta
    const original = mensagem.trim();

    // ── PAUSAR CBP ──────────────────────────────────────────────────────────
    const PAUSAR = [
      'cbp pausar','pausar cbp','desativar cbp','cbp desativar',
      'gia pausar','pausar gia','desativar gia','gia desativar',
    ];
    if (PAUSAR.some((c) => texto.includes(c))) {
      await salvarStatusGia(false);
      return 'CBP pausado. Clientes não receberão resposta até você ativar novamente.';
    }

    // ── ATIVAR CBP ───────────────────────────────────────────────────────────
    const ATIVAR = [
      'cbp ativar','ativar cbp','ligar cbp','cbp ligar',
      'gia ativar','ativar gia','ligar gia','gia ligar',
    ];
    if (ATIVAR.some((c) => texto.includes(c))) {
      await salvarStatusGia(true);
      return 'CBP ativado. Voltando a atender normalmente.';
    }

    // ── PNE EVENTO ───────────────────────────────────────────────────────────
    if (texto.startsWith('pne evento')) {
      const id = texto.replace('pne evento', '').trim();
      if (!id || !/^\d+$/.test(id)) {
        return 'Formato: PNE EVENTO [id]\nExemplo: PNE EVENTO 105212';
      }
      await pne.setEventoAtivo(id);
      return `✅ Evento ativo definido: ${id}`;
    }

    // ── PNE COOKIES ──────────────────────────────────────────────────────────
    if (texto.startsWith('pne cookies')) {
      // Usar original para não perder case da string de cookie
      const cookieStr = original.slice('pne cookies'.length).trim();
      if (!cookieStr) {
        return 'Formato: PNE COOKIES [string dos cookies]\nCopie de: DevTools → Application → Cookies → copia todos como string.';
      }
      await pne.setCookies(cookieStr);
      return '✅ Cookies salvos. Use PNE STATUS para verificar se a sessão está válida.';
    }

    // ── PNE STATUS ───────────────────────────────────────────────────────────
    if (texto.startsWith('pne status') || texto === 'pne') {
      const eventoId = await pne.getEventoAtivo();
      const sessao   = await pne.testarSessao();
      return (
        `📊 *Status PNE*\n` +
        `Evento ativo: ${eventoId || '❌ não definido'}\n` +
        `Sessão: ${sessao.ok ? '✅ válida' : `❌ ${sessao.motivo}`}`
      );
    }

    // ── LISTA ─────────────────────────────────────────────────────────────────
    if (texto.startsWith('lista ')) {
      const dados = parseLista(original);
      if (!dados) {
        return (
          '❌ Formato: LISTA Nome +N [masc]\n' +
          'Exemplos:\n' +
          '  LISTA Maria Silva +1\n' +
          '  LISTA João Costa +0 masc'
        );
      }

      const eventoId = await pne.getEventoAtivo();
      if (!eventoId) {
        return '❌ Evento não definido. Use: PNE EVENTO [id]';
      }

      try {
        await pne.adicionarNaLista(eventoId, dados.nome, dados.tipo, dados.acompanhantes);
        const tipoLabel = dados.tipo.startsWith('masc') ? 'Masculino' : 'Feminino';
        const acompMsg  = dados.acompanhantes > 0 ? ` (+${dados.acompanhantes})` : '';
        return `✅ Lista | ${dados.nome}${acompMsg} | ${tipoLabel} | Evento ${eventoId}`;
      } catch (e) {
        console.log('❌ PNE adicionarNaLista:', e.message);
        return `❌ Erro ao adicionar na lista:\n${e.message}`;
      }
    }

    // ── RESERVA ───────────────────────────────────────────────────────────────
    if (texto.startsWith('reserva ')) {
      const dados = parseReserva(original);
      if (!dados) {
        return (
          '❌ Formato: RESERVA [camarote] [nome] [pax]\n' +
          'Exemplos:\n' +
          '  RESERVA C3 Maria Silva 4\n' +
          '  RESERVA S1 João Costa 2'
        );
      }

      try {
        await pne.criarReserva(dados.camarote, dados.nome, dados.pax, '');
        return `✅ Reserva | ${dados.camarote} | ${dados.nome} | ${dados.pax} pax`;
      } catch (e) {
        console.log('❌ PNE criarReserva:', e.message);
        return `❌ Erro ao criar reserva:\n${e.message}`;
      }
    }

    // ── ANIVERSÁRIO ───────────────────────────────────────────────────────────
    if (texto.startsWith('aniv')) {
      const dados = parseAniv(original);
      if (!dados) {
        return '❌ Formato: ANIV Nome Sobrenome\nExemplo: ANIV Maria Silva';
      }

      const eventoId = await pne.getEventoAtivo();
      if (!eventoId) {
        return '❌ Evento não definido. Use: PNE EVENTO [id]';
      }

      try {
        await pne.criarListaAniversario(eventoId, dados.nome, dados.obs);
        return `✅ Lista aniversário | ${dados.nome}`;
      } catch (e) {
        console.log('❌ PNE criarListaAniversario:', e.message);
        return `❌ ${e.message}`;
      }
    }

    // ── AJUDA ─────────────────────────────────────────────────────────────────
    if (texto.includes('ajuda') || texto.includes('help') || texto.includes('comandos')) {
      return `*Comandos CBP — WhatsApp Admin*

🎛️ *CONTROLE:*
  CBP pausar
  CBP ativar

🎫 *LISTA:*
  LISTA Nome +N
  LISTA Nome +N masc

🥂 *RESERVA:*
  RESERVA C3 Nome 4

🎂 *ANIVERSÁRIO:*
  ANIV Nome

⚙️ *CONFIG PNE:*
  PNE EVENTO 105212
  PNE COOKIES [string]
  PNE STATUS

📱 Painel web:
https://assistente-whatsapp-production-d909.up.railway.app/painel`;
    }

    // ── FALLBACK ──────────────────────────────────────────────────────────────
    return `Comando não reconhecido.\nUse "ajuda" para ver os comandos disponíveis.`;

  } catch (erro) {
    console.log('❌ Erro no admin:', erro.message);
    return 'Erro interno. Tenta de novo.';
  }
}

module.exports = { processarComandoAdmin };
