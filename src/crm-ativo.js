// ============================================================================
// CRM-ATIVO.JS - Reengajamento semanal automatico por situacao (segunda-feira)
// ============================================================================
// Toda segunda, para cada situacao ativa cadastrada no painel, manda a
// mensagem configurada para os clientes classificados naquela situacao.
// A classificacao (quem tem qual situacao) vem do webhook.js, que le a tag
// [SITUACAO:chave] que a propria IA marca com base na conversa.
//
// GUARDRAILS (evitam spam e insistencia infinita):
// - Nunca manda pra quem ja converteu (converteu === true no CRM).
// - Respeita um intervalo minimo entre envios pra mesma situacao/cliente.
// - Teto de tentativas: para de insistir sozinho depois de N envios sem resposta.
// ============================================================================

const { lerSituacoesCRM, lerClientesMeta, registrarEnvioSituacao, verificarEMarcarSlotDisparado } = require('./firebase');
const zapi = require('./zapi');

const HORA_ENVIO = 10;                 // segunda as 10h (janela de +-1 min)
const LIMITE_TENTATIVAS = 3;           // para de insistir sozinho apos isso
const INTERVALO_MINIMO_MS = 6 * 24 * 60 * 60 * 1000; // nao reenvia antes de ~6 dias
const STARTUP_DELAY_MS = 90 * 1000;    // mesmo raciocinio do disparos.js: evita duplo envio em deploy

const _bootTime = Date.now();
let _jaRodouHoje = false;

function horaAtualSP() {
  const agora = new Date();
  const agoraSP = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return { hora: agoraSP.getUTCHours(), minuto: agoraSP.getUTCMinutes(), diaDaSemana: agoraSP.getUTCDay() };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function executarCrmAtivo() {
  try {
    if (Date.now() - _bootTime < STARTUP_DELAY_MS) return;

    const { hora, minuto, diaDaSemana } = horaAtualSP();

    if (diaDaSemana !== 1) { _jaRodouHoje = false; return; } // so roda segunda; reseta a trava fora do dia
    if (hora !== HORA_ENVIO || minuto > 1) return;
    if (_jaRodouHoje) return;

    // Dedup atomico no Firebase — sobrevive a reinicio/deploy e multiplas instancias
    const podeRodar = await verificarEMarcarSlotDisparado('crm_semanal');
    if (!podeRodar) { _jaRodouHoje = true; return; }
    _jaRodouHoje = true;

    const [situacoes, meta] = await Promise.all([lerSituacoesCRM(), lerClientesMeta()]);
    const ativas = (situacoes || []).filter((s) => s.ativo !== false && s.mensagem);

    if (ativas.length === 0) {
      console.log('📭 CRM ativo: nenhuma situação ativa com mensagem configurada.');
      return;
    }

    console.log(`📨 CRM ativo: iniciando envio semanal (${ativas.length} situação(ões) ativa(s))`);

    for (const situacao of ativas) {
      const chave = situacao.chave;
      const clientesDaSituacao = Object.entries(meta).filter(
        ([, m]) => m && m.situacoes && m.situacoes[chave]
      );

      let enviados = 0;
      for (const [telefone, m] of clientesDaSituacao) {
        if (m.converteu === true) continue; // ja converteu — nao insiste mais

        const s = m.situacoes[chave] || {};
        const tentativas = s.tentativas || 0;
        const ultimoEnvio = s.ultimoEnvio || 0;

        if (tentativas >= LIMITE_TENTATIVAS) continue;
        if (ultimoEnvio && (Date.now() - ultimoEnvio) < INTERVALO_MINIMO_MS) continue;

        await zapi.enviarTexto(telefone, situacao.mensagem);
        await registrarEnvioSituacao(telefone, chave);
        enviados++;
        await sleep(2000); // espaça os envios, evita rajada no WhatsApp
      }
      console.log(`✅ CRM ativo — "${chave}": ${enviados} mensagem(ns) enviada(s)`);
    }
  } catch (erro) {
    console.log('❌ Erro no CRM ativo:', erro.message);
  }
}

function iniciarCrmAtivo() {
  console.log('📨 CRM ativo agendado (segundas às 10h, verifica a cada 1 min)');
  setInterval(executarCrmAtivo, 60000);
}

module.exports = { iniciarCrmAtivo, executarCrmAtivo };
