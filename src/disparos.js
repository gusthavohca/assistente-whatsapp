// ============================================================================
// DISPAROS.JS - Agendamento diário de mensagens para grupos do WhatsApp
// ============================================================================
// Horários fixos por dia da semana (hora cheia, fuso SP):
//   Segunda: 14h, 16h, 18h
//   Terça:   11h, 18h
//   Quarta:  11h, 18h
//   Quinta:  11h, 18h
//   Sexta:   12h, 17h, 21h
//   Sábado:  12h, 18h, 21h
//   Domingo: nenhum
//
// Para cada horário, o painel permite configurar N mensagens (texto, flyer ou vídeo).
// As mensagens são enviadas para todos os grupos cadastrados.
// ============================================================================

const { lerDisparos, lerFlyer } = require('./firebase');
const zapi = require('./zapi');

// Dias da semana — índice = getUTCDay()
const DIAS      = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DIAS_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Horários fixos por dia (hora cheia, SP)
const HORARIOS_FIXOS = {
  segunda: [14, 16, 18],
  terca:   [11, 18],
  quarta:  [11, 18],
  quinta:  [11, 18],
  sexta:   [12, 17, 21],
  sabado:  [12, 18, 21],
  domingo: [],
};

// Exportado para o painel saber quais slots existem
module.exports.HORARIOS_FIXOS = HORARIOS_FIXOS;

// ============================================================================
// TIMEZONE SP
// ============================================================================
// Railway roda em UTC. SP = UTC-3 (sem horário de verão desde 2019).

function horaAtualSP() {
  const agora   = new Date();
  const agoraSP = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return {
    hora:        agoraSP.getUTCHours(),
    minuto:      agoraSP.getUTCMinutes(),
    diaDaSemana: agoraSP.getUTCDay(), // 0=domingo ... 6=sábado
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarMensagem(grupoId, msg, mencionarTodos) {
  if (!msg || !msg.tipo) return;

  if (msg.tipo === 'video' && msg.categoria) {
    const url = await lerFlyer(msg.categoria);
    if (url) {
      await zapi.enviarVideo(grupoId, url, msg.texto || '', mencionarTodos);
    } else if (msg.texto) {
      // fallback: texto puro se o vídeo não estiver cadastrado
      await zapi.enviarTexto(grupoId, msg.texto, mencionarTodos);
    }

  } else if (msg.tipo === 'flyer' && msg.categoria) {
    const url = await lerFlyer(msg.categoria);
    if (url) {
      await zapi.enviarImagem(grupoId, url, msg.texto || '', mencionarTodos);
    } else if (msg.texto) {
      await zapi.enviarTexto(grupoId, msg.texto, mencionarTodos);
    }

  } else if (msg.tipo === 'texto' && msg.conteudo) {
    await zapi.enviarTexto(grupoId, msg.conteudo, mencionarTodos);
  }
}

// ============================================================================
// EXECUTAR DISPARO
// ============================================================================

async function executarDisparo() {
  try {
    const config = await lerDisparos();
    if (!config || !config.ativo) return;

    const { hora, minuto, diaDaSemana } = horaAtualSP();
    if (minuto !== 0) return; // só dispara na hora exata (:00)

    const nomeDia     = DIAS[diaDaSemana];
    const labelDia    = DIAS_LABEL[diaDaSemana];
    const horariosHoje = HORARIOS_FIXOS[nomeDia] || [];

    if (!horariosHoje.includes(hora)) return;

    // Pega as mensagens configuradas para esse dia/hora
    const mensagensDaHora = ((config.dias || {})[nomeDia] || {})[String(hora)] || [];

    if (mensagensDaHora.length === 0) {
      console.log(`📭 Disparo ${labelDia} ${hora}h: sem mensagens configuradas`);
      return;
    }

    const grupos       = (config.grupos || []).filter(g => g && g.trim());
    const mencionarTodos = config.mencionarTodos === true;

    if (grupos.length === 0) {
      console.log(`❌ Disparo ${labelDia} ${hora}h: nenhum grupo configurado`);
      return;
    }

    console.log(`📤 Disparo ${labelDia} ${hora}h → ${mensagensDaHora.length} msg(s) para ${grupos.length} grupo(s)`);

    for (const grupoId of grupos) {
      for (let i = 0; i < mensagensDaHora.length; i++) {
        await enviarMensagem(grupoId, mensagensDaHora[i], mencionarTodos);
        if (i < mensagensDaHora.length - 1) await sleep(2500); // pausa entre mensagens
      }
      if (grupos.length > 1) await sleep(3000); // pausa entre grupos
    }

    console.log(`✅ Disparo ${labelDia} ${hora}h concluído`);
  } catch (erro) {
    console.log('❌ Erro no disparo:', erro.message);
  }
}

// ============================================================================
// INICIAR AGENDAMENTO
// ============================================================================

function iniciarDisparos() {
  console.log('📤 Agendamento de disparos ativado (verifica a cada 1 minuto)');
  setInterval(executarDisparo, 60000);
}

module.exports = { iniciarDisparos, HORARIOS_FIXOS };
