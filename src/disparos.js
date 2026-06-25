// ============================================================================
// DISPAROS.JS - Agendamento diário de mensagens para grupos do WhatsApp
// ============================================================================
// Horários fixos por dia da semana (fuso SP = UTC-3):
//   Segunda: 14h07, 16h07, 18h07
//   Terça:   11h07, 18h07
//   Quarta:  11h07, 18h07
//   Quinta:  11h07, 19h07
//   Sexta:   12h07, 17h07, 21h07
//   Sábado:  12h07, 18h07, 21h07
//   Domingo: nenhum
//
// O minuto :07 dá margem de 7 min caso o servidor reinicie no horário.
// A janela de disparo é de ±1 minuto (dispara entre :06 e :08).
// Um Set em memória evita disparo duplo no mesmo slot.
// O cache de flyers é carregado uma vez por disparo (menos leituras no Firebase).
// ============================================================================

const { lerDisparos, lerFlyers } = require('./firebase');
const zapi = require('./zapi');

// Dias da semana — índice = getUTCDay()
const DIAS       = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DIAS_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Horários com minuto :07 — janela de ±1 min para tolerar reinícios do servidor
const HORARIOS_FIXOS_COMPLETOS = {
  segunda: [{h:14,m:7}, {h:16,m:7}, {h:18,m:7}],
  terca:   [{h:11,m:7}, {h:18,m:7}],
  quarta:  [{h:11,m:7}, {h:18,m:7}],
  quinta:  [{h:11,m:7}, {h:19,m:7}],
  sexta:   [{h:12,m:7}, {h:17,m:7}, {h:21,m:7}],
  sabado:  [{h:12,m:7}, {h:18,m:7}, {h:21,m:7}],
  domingo: [],
};

// Versão só com horas — usada pelo painel e Firebase (chaves dos slots)
const HORARIOS_FIXOS = {
  segunda: [14, 16, 18],
  terca:   [11, 18],
  quarta:  [11, 18],
  quinta:  [11, 19],
  sexta:   [12, 17, 21],
  sabado:  [12, 18, 21],
  domingo: [],
};

// ============================================================================
// ANTI DISPARO DUPLO
// ============================================================================
// Armazena chaves dos slots já disparados nesta sessão do servidor.
// Formato: "diaDaSemana-hora" ex: "5-12" = sexta 12h
// Limpo automaticamente à meia-noite.

const _slotsDisparados = new Set();

// ============================================================================
// TIMEZONE SP
// ============================================================================

function horaAtualSP() {
  const agora   = new Date();
  const agoraSP = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return {
    hora:        agoraSP.getUTCHours(),
    minuto:      agoraSP.getUTCMinutes(),
    diaDaSemana: agoraSP.getUTCDay(),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarMensagem(grupoId, msg, mencionarTodos, cacheFlyers) {
  if (!msg || !msg.tipo) return;

  if (msg.tipo === 'video' && msg.categoria) {
    const url = cacheFlyers[msg.categoria] || null;
    if (url) {
      await zapi.enviarVideo(grupoId, url, msg.texto || '', mencionarTodos);
    } else {
      console.log(`⚠️ Vídeo "${msg.categoria}" não encontrado no Cloudinary — slot pulado`);
      if (msg.texto) await zapi.enviarTexto(grupoId, msg.texto, mencionarTodos);
    }

  } else if (msg.tipo === 'flyer' && msg.categoria) {
    const url = cacheFlyers[msg.categoria] || null;
    if (url) {
      await zapi.enviarImagem(grupoId, url, msg.texto || '', mencionarTodos);
    } else {
      console.log(`⚠️ Flyer "${msg.categoria}" não encontrado no Cloudinary — slot pulado`);
      if (msg.texto) await zapi.enviarTexto(grupoId, msg.texto, mencionarTodos);
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
    const { hora, minuto, diaDaSemana } = horaAtualSP();

    const nomeDia      = DIAS[diaDaSemana];
    const labelDia     = DIAS_LABEL[diaDaSemana];
    const horariosHoje = HORARIOS_FIXOS_COMPLETOS[nomeDia] || [];

    // Limpa slots à meia-noite para permitir disparo no dia seguinte
    if (hora === 0 && minuto <= 1) {
      if (_slotsDisparados.size > 0) {
        _slotsDisparados.clear();
        console.log('🔄 Slots de disparo resetados para o novo dia');
      }
    }

    // Verifica se o minuto atual está dentro da janela do slot (±1 min do :07)
    const slotAtual = horariosHoje.find(s => s.h === hora && Math.abs(minuto - s.m) <= 1);
    if (!slotAtual) return;

    // Evita disparo duplo no mesmo slot
    const chaveSlot = `${diaDaSemana}-${hora}`;
    if (_slotsDisparados.has(chaveSlot)) return;
    _slotsDisparados.add(chaveSlot);

    // Verifica se os disparos estão ativos
    const config = await lerDisparos();
    if (!config || !config.ativo) {
      console.log(`⏸️ Disparos desativados — slot ${labelDia} ${hora}h ignorado`);
      return;
    }

    // Pega as mensagens configuradas para esse dia/hora
    const mensagensDaHora = ((config.dias || {})[nomeDia] || {})[String(hora)] || [];
    if (mensagensDaHora.length === 0) {
      console.log(`📭 Disparo ${labelDia} ${hora}h: sem mensagens configuradas`);
      return;
    }

    const grupos = (config.grupos || []).filter(g => g && g.trim());
    if (grupos.length === 0) {
      console.log(`❌ Disparo ${labelDia} ${hora}h: nenhum grupo configurado`);
      return;
    }

    // Cache de flyers — UMA leitura do Firebase para todos os grupos e mensagens
    const cacheFlyers    = await lerFlyers();
    const mencionarTodos = config.mencionarTodos === true;

    console.log(`📤 Disparo ${labelDia} ${hora}h → ${mensagensDaHora.length} msg(s) para ${grupos.length} grupo(s)`);

    for (const grupoId of grupos) {
      for (let i = 0; i < mensagensDaHora.length; i++) {
        await enviarMensagem(grupoId, mensagensDaHora[i], mencionarTodos, cacheFlyers);
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
