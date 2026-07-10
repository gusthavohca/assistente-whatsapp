// ============================================================================
// FIREBASE.JS - Conexão com o banco de dados Firebase
// ============================================================================

const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  let serviceAccount;

  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    serviceAccount = require(
      path.join(__dirname, '..', 'config', 'firebase.json')
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  host: 'southamerica-east1-firestore.googleapis.com',
  ssl: true
});

// ============================================================================
// CÉREBRO DO GUSTHAVO
// ============================================================================

async function lerCerebroDoGusthavo() {
  try {
    const doc = await db.collection('configuracoes').doc('gusthavo').get();
    if (!doc.exists) return null;
    const dados = doc.data();
    return dados.systemPrompt || null;
  } catch (erro) {
    console.log('❌ Erro ao ler cérebro do Firebase:', erro.message);
    return null;
  }
}

async function salvarCerebroDoGusthavo(systemPrompt) {
  try {
    await db.collection('configuracoes').doc('gusthavo').set({
      systemPrompt,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Cérebro do Gusthavo atualizado no Firebase');
    return true;
  } catch (erro) {
    console.log('❌ Erro ao salvar cérebro:', erro.message);
    return false;
  }
}

// ============================================================================
// ATRAÇÕES
// ============================================================================

async function lerAtracoes() {
  try {
    const [docSexta, docSabado] = await Promise.all([
      db.collection('atracoes').doc('sexta').get(),
      db.collection('atracoes').doc('sabado').get(),
    ]);
    return {
      sexta: docSexta.exists ? docSexta.data() : null,
      sabado: docSabado.exists ? docSabado.data() : null,
    };
  } catch (erro) {
    console.log('❌ Erro ao ler atrações do Firebase:', erro.message);
    return { sexta: null, sabado: null };
  }
}

async function salvarAtracao(dia, dados) {
  try {
    await db.collection('atracoes').doc(dia).set({
      ...dados,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Atração de ${dia} atualizada no Firebase`);
    return true;
  } catch (erro) {
    console.log(`❌ Erro ao salvar atração de ${dia}:`, erro.message);
    return false;
  }
}

// ============================================================================
// HISTÓRICO
// ============================================================================

async function lerHistorico(telefone) {
  try {
    const doc = await db.collection('historicos').doc(telefone).get();
    if (!doc.exists) return [];
    return doc.data().mensagens || [];
  } catch (erro) {
    console.log('⚠️ Erro ao ler histórico:', erro.message);
    return [];
  }
}

async function salvarHistorico(telefone, mensagens) {
  try {
    await db.collection('historicos').doc(telefone).set({
      mensagens,
      atualizadoEm: new Date()
    });
    console.log(`💾 Histórico salvo para ${telefone}`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar histórico:', erro.message);
    return false;
  }
}

// ============================================================================
// FLYERS
// ============================================================================

async function salvarFlyer(tipo, url) {
  try {
    await db.collection('flyers').doc(tipo).set({
      url,
      atualizadoEm: new Date()
    });
    console.log(`✅ Flyer "${tipo}" atualizado no Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar flyer:', erro.message);
    return false;
  }
}

async function lerFlyer(tipo) {
  try {
    const doc = await db.collection('flyers').doc(tipo).get();
    if (!doc.exists) return null;
    return doc.data().url || null;
  } catch (erro) {
    console.log('⚠️ Erro ao ler flyer:', erro.message);
    return null;
  }
}

async function lerFlyers() {
  try {
    const snapshot = await db.collection('flyers').get();
    const flyers = {};
    snapshot.forEach(doc => {
      flyers[doc.id] = doc.data().url;
    });
    return flyers;
  } catch (erro) {
    console.log('⚠️ Erro ao ler flyers:', erro.message);
    return {};
  }
}

async function deletarFlyer(tipo) {
  try {
    await db.collection('flyers').doc(tipo).delete();
    console.log(`✅ Flyer "${tipo}" deletado do Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao deletar flyer:', erro.message);
    return false;
  }
}

// ============================================================================
// INFOS
// ============================================================================

async function salvarInfo(tipo, conteudo) {
  try {
    await db.collection('infos').doc(tipo).set({
      conteudo,
      atualizadoEm: new Date()
    });
    console.log(`✅ Info "${tipo}" atualizada no Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar info:', erro.message);
    return false;
  }
}

async function lerInfos() {
  try {
    const snapshot = await db.collection('infos').get();
    const infos = {};
    snapshot.forEach(doc => {
      infos[doc.id] = doc.data().conteudo;
    });
    return infos;
  } catch (erro) {
    console.log('⚠️ Erro ao ler infos:', erro.message);
    return {};
  }
}

// ============================================================================
// STATUS DA GIA
// ============================================================================

async function salvarStatusGia(status) {
  try {
    await db.collection('configuracoes').doc('status').set({
      ativo: status,
      atualizadoEm: new Date()
    });
    console.log(`✅ GIA ${status ? 'ativado' : 'pausado'}`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar status:', erro.message);
    return false;
  }
}

async function lerStatusGia() {
  try {
    const doc = await db.collection('configuracoes').doc('status').get();
    if (!doc.exists) return true;
    return doc.data().ativo !== false;
  } catch (erro) {
    return true;
  }
}

// ============================================================================
// RELATÓRIOS
// ============================================================================

async function registrarPedido(tipo) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const ref = db.collection('relatorios').doc(hoje);
    const doc = await ref.get();
    const dados = doc.exists ? doc.data() : {
      atendimentos: 0, lista: 0, camarote: 0, aniversario: 0, perguntas: {}
    };
    dados[tipo] = (dados[tipo] || 0) + 1;
    await ref.set(dados);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao registrar pedido:', erro.message);
    return false;
  }
}

async function registrarAtendimento(pergunta) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const ref = db.collection('relatorios').doc(hoje);
    const doc = await ref.get();
    const dados = doc.exists ? doc.data() : {
      atendimentos: 0, lista: 0, camarote: 0, aniversario: 0, perguntas: {}
    };
    dados.atendimentos = (dados.atendimentos || 0) + 1;
    dados.perguntas = dados.perguntas || {};
    dados.perguntas[pergunta] = (dados.perguntas[pergunta] || 0) + 1;
    await ref.set(dados);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao registrar atendimento:', erro.message);
    return false;
  }
}

async function lerRelatorioSemana() {
  try {
    const hoje = new Date();
    const relatorio = {
      atendimentos: 0, lista: 0, camarote: 0, aniversario: 0, perguntas: {}
    };
    for (let i = 0; i < 7; i++) {
      const data = new Date(hoje);
      data.setDate(hoje.getDate() - i);
      const chave = data.toISOString().split('T')[0];
      const doc = await db.collection('relatorios').doc(chave).get();
      if (doc.exists) {
        const d = doc.data();
        relatorio.atendimentos += d.atendimentos || 0;
        relatorio.lista += d.lista || 0;
        relatorio.camarote += d.camarote || 0;
        relatorio.aniversario += d.aniversario || 0;
        Object.entries(d.perguntas || {}).forEach(([p, n]) => {
          relatorio.perguntas[p] = (relatorio.perguntas[p] || 0) + n;
        });
      }
    }
    return relatorio;
  } catch (erro) {
    console.log('⚠️ Erro ao ler relatório:', erro.message);
    return null;
  }
}

// ============================================================================
// CALENDÁRIO
// ============================================================================

async function salvarCalendario(dia, descricao) {
  try {
    await db.collection('calendario').doc(dia).set({
      descricao,
      atualizadoEm: new Date()
    });
    console.log(`✅ Calendário dia ${dia} salvo no Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar calendário:', erro.message);
    return false;
  }
}

async function deletarCalendario(dia) {
  try {
    await db.collection('calendario').doc(dia).delete();
    console.log(`✅ Evento do dia ${dia} deletado do calendário`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao deletar evento do calendário:', erro.message);
    return false;
  }
}

async function lerCalendario() {
  try {
    const snapshot = await db.collection('calendario').get();
    if (snapshot.empty) return null;
    const dias = [];
    snapshot.forEach(doc => {
      dias.push({ dia: doc.id, descricao: doc.data().descricao });
    });
    dias.sort((a, b) => {
      const [dA, mA] = a.dia.split('/').map(Number);
      const [dB, mB] = b.dia.split('/').map(Number);
      return mA !== mB ? mA - mB : dA - dB;
    });
    return dias.map(d => `${d.dia} - ${d.descricao}`).join('\n');
  } catch (erro) {
    console.log('⚠️ Erro ao ler calendário:', erro.message);
    return null;
  }
}

async function lerCalendarioCompleto() {
  try {
    const snapshot = await db.collection('calendario').get();
    if (snapshot.empty) return [];
    const dias = [];
    snapshot.forEach(doc => {
      dias.push({ dia: doc.id, descricao: doc.data().descricao });
    });
    dias.sort((a, b) => {
      const [dA, mA] = a.dia.split('/').map(Number);
      const [dB, mB] = b.dia.split('/').map(Number);
      return mA !== mB ? mA - mB : dA - dB;
    });
    return dias;
  } catch (erro) {
    console.log('⚠️ Erro ao ler calendário completo:', erro.message);
    return [];
  }
}

// ============================================================================
// DISPAROS
// ============================================================================

async function lerDisparos() {
  try {
    const doc = await db.collection('configuracoes').doc('disparos').get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (erro) {
    console.log('⚠️ Erro ao ler disparos:', erro.message);
    return null;
  }
}

async function salvarDisparos(dados) {
  try {
    await db.collection('configuracoes').doc('disparos').set({
      ...dados,
      atualizadoEm: new Date()
    });
    console.log('✅ Disparos atualizados no Firebase');
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar disparos:', erro.message);
    return false;
  }
}

// ============================================================================
// DEDUPLICAÇÃO DE DISPAROS (anti double-fire entre reinícios/deploys)
// ============================================================================
// Usa ref.create() — operação ATÔMICA do Firestore. Se dois processos tentam
// criar o mesmo documento ao mesmo tempo, apenas UM consegue. O outro recebe
// ALREADY_EXISTS e sabe que não deve disparar. Mais confiável que transaction
// porque elimina qualquer race condition de leitura simultânea.

function _dataSP() {
  const agora = new Date();
  const agoraSP = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return `${agoraSP.getUTCFullYear()}-${String(agoraSP.getUTCMonth()+1).padStart(2,'0')}-${String(agoraSP.getUTCDate()).padStart(2,'0')}`;
}

async function verificarEMarcarSlotDisparado(hora) {
  const chave = `${_dataSP()}_${hora}h`;
  try {
    const ref = db.collection('disparos_log').doc(chave);
    // create() é atômico: lança erro ALREADY_EXISTS se o doc já existe.
    // Garante que EXATAMENTE UMA instância dispara, sem race condition.
    await ref.create({ firedAt: new Date() });
    return true; // criou com sucesso → esta instância é a responsável
  } catch (erro) {
    // Código 6 = ALREADY_EXISTS (gRPC) — outro processo já marcou este slot
    if (erro.code === 6 || (erro.message || '').includes('ALREADY_EXISTS')) {
      console.log(`🔒 Slot ${chave} já disparado por outra instância — ignorado`);
      return false;
    }
    // Qualquer outro erro: não dispara (mais seguro do que arriscar duplicata)
    console.log('⚠️ Erro ao verificar slot de disparo:', erro.code, erro.message);
    return false;
  }
}

async function limparLogsDisparos() {
  try {
    const limite = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const snapshot = await db.collection('disparos_log').where('firedAt', '<', limite).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`🧹 ${snapshot.size} log(s) de disparo antigos removidos`);
  } catch (erro) {
    console.log('⚠️ Erro ao limpar logs de disparo:', erro.message);
  }
}

// ============================================================================
// PERGUNTAS SEM RESPOSTA
// ============================================================================

async function salvarPerguntaSemResposta(telefone, pergunta) {
  try {
    const id = `${Date.now()}_${telefone.replace(/\D/g, '').slice(-8)}`;
    await db.collection('perguntas_sem_resposta').doc(id).set({
      telefone,
      pergunta,
      criadoEm: new Date(),
      resolvido: false,
    });
    console.log(`📝 Pergunta sem resposta salva: "${pergunta}" de ${telefone}`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar pergunta sem resposta:', erro.message);
    return false;
  }
}

async function lerPerguntasSemResposta() {
  try {
    const snapshot = await db.collection('perguntas_sem_resposta')
      .orderBy('criadoEm', 'desc')
      .get();
    const perguntas = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      perguntas.push({
        id: doc.id,
        telefone: d.telefone,
        pergunta: d.pergunta,
        criadoEm: d.criadoEm ? d.criadoEm.toDate().toISOString() : null,
        resolvido: d.resolvido || false,
      });
    });
    return perguntas;
  } catch (erro) {
    console.log('⚠️ Erro ao ler perguntas sem resposta:', erro.message);
    return [];
  }
}

async function deletarPerguntaSemResposta(id) {
  try {
    await db.collection('perguntas_sem_resposta').doc(id).delete();
    console.log(`✅ Pergunta "${id}" deletada`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao deletar pergunta:', erro.message);
    return false;
  }
}

// ============================================================================
// LINKS (Data + Atração + URL Sympla)
// ============================================================================

async function salvarLinkEvento(id, data, atracao, url) {
  try {
    await db.collection('links_eventos').doc(id).set({
      data,
      atracao,
      url,
      atualizadoEm: new Date()
    });
    console.log(`✅ Link evento "${id}" salvo no Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar link evento:', erro.message);
    return false;
  }
}

async function deletarLinkEvento(id) {
  try {
    await db.collection('links_eventos').doc(id).delete();
    console.log(`✅ Link evento "${id}" deletado do Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao deletar link evento:', erro.message);
    return false;
  }
}

async function lerLinksEventos() {
  try {
    const snapshot = await db.collection('links_eventos').get();
    if (snapshot.empty) return [];
    const eventos = [];
    snapshot.forEach(doc => {
      eventos.push({ id: doc.id, ...doc.data() });
    });
    eventos.sort((a, b) => {
      const [dA, mA] = a.data.split('/').map(Number);
      const [dB, mB] = b.data.split('/').map(Number);
      return mA !== mB ? mA - mB : dA - dB;
    });
    return eventos;
  } catch (erro) {
    console.log('⚠️ Erro ao ler links eventos:', erro.message);
    return [];
  }
}

// ============================================================================
// EXEMPLOS DE TOM (respostas manuais do admin — base para o GIA aprender o estilo)
// ============================================================================
// Toda vez que Gusthavo responde um cliente manualmente, o texto é salvo aqui.
// O prompt carrega os últimos 15 exemplos para que o GIA adapte seu tom.

async function salvarExemploTom(mensagem) {
  try {
    if (!mensagem || mensagem.trim().length < 5) return false; // ignora textos muito curtos
    const id = String(Date.now());
    await db.collection('tom_exemplos').doc(id).set({
      mensagem: mensagem.trim(),
      criadoEm: new Date()
    });
    console.log(`💬 Exemplo de tom salvo: "${mensagem.substring(0, 60)}"`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar exemplo de tom:', erro.message);
    return false;
  }
}

async function lerExemplosTom() {
  try {
    const snapshot = await db.collection('tom_exemplos')
      .orderBy('criadoEm', 'desc')
      .limit(15)
      .get();
    const exemplos = [];
    snapshot.forEach(doc => {
      exemplos.push(doc.data().mensagem);
    });
    return exemplos.reverse(); // ordem cronológica (mais antigo primeiro)
  } catch (erro) {
    console.log('⚠️ Erro ao ler exemplos de tom:', erro.message);
    return [];
  }
}

// ============================================================================
// CRM - CLIENTES (v1: derivado da colecao "historicos" + metadados editaveis)
// ============================================================================

// Le TODOS os historicos de conversa (cada doc = um telefone que a GIA atendeu).
async function lerTodosHistoricos() {
  try {
    const snap = await db.collection('historicos').get();
    return snap.docs.map((d) => {
      const dados = d.data() || {};
      let ultimaMs = 0;
      if (dados.atualizadoEm) {
        ultimaMs = typeof dados.atualizadoEm.toMillis === 'function'
          ? dados.atualizadoEm.toMillis()
          : new Date(dados.atualizadoEm).getTime() || 0;
      }
      return {
        telefone: d.id,
        mensagens: dados.mensagens || [],
        ultimaInteracaoMs: ultimaMs,
      };
    });
  } catch (erro) {
    console.log('Erro ao ler todos os historicos:', erro.message);
    return [];
  }
}

// Metadados editaveis do cliente (nome, nota, status manual, converteu) - colecao separada.
async function lerClientesMeta() {
  try {
    const snap = await db.collection('clientes_meta').get();
    const meta = {};
    snap.docs.forEach((d) => { meta[d.id] = d.data() || {}; });
    return meta;
  } catch (erro) {
    console.log('Erro ao ler metadados de clientes:', erro.message);
    return {};
  }
}

async function salvarClienteMeta(telefone, dados) {
  try {
    await db.collection('clientes_meta').doc(telefone).set(
      { ...dados, atualizadoEm: new Date() },
      { merge: true }
    );
    return true;
  } catch (erro) {
    console.log('Erro ao salvar metadados do cliente:', erro.message);
    return false;
  }
}

async function lerClienteMeta(telefone) {
  try {
    const doc = await db.collection('clientes_meta').doc(telefone).get();
    return doc.exists ? (doc.data() || {}) : {};
  } catch (erro) {
    return {};
  }
}

async function salvarRelayPendente(alertId, dados) {
  try { await db.collection('relay_pendente').doc(String(alertId)).set({ ...dados }); return true; }
  catch (erro) { console.log('Erro ao salvar relay:', erro.message); return false; }
}

async function lerRelayPorAlerta(alertId) {
  try { const d = await db.collection('relay_pendente').doc(String(alertId)).get(); return d.exists ? (d.data() || null) : null; }
  catch (erro) { return null; }
}

async function lerRelaysPendentes() {
  try { const s = await db.collection('relay_pendente').get(); return s.docs.map((d) => ({ id: d.id, dados: d.data() || {} })); }
  catch (erro) { return []; }
}

async function deletarRelayPendente(alertId) {
  try { await db.collection('relay_pendente').doc(String(alertId)).delete(); return true; }
  catch (erro) { return false; }
}

// ============================================================================
// EXPORTACAO
// ============================================================================

module.exports = {
  lerCerebroDoGusthavo,
  salvarCerebroDoGusthavo,
  lerAtracoes,
  salvarAtracao,
  lerHistorico,
  salvarHistorico,
  salvarFlyer,
  lerFlyer,
  lerFlyers,
  deletarFlyer,
  salvarInfo,
  lerInfos,
  salvarStatusGia,
  lerStatusGia,
  registrarPedido,
  registrarAtendimento,
  lerRelatorioSemana,
  salvarCalendario,
  deletarCalendario,
  lerCalendario,
  lerCalendarioCompleto,
  lerDisparos,
  salvarDisparos,
  verificarEMarcarSlotDisparado,
  limparLogsDisparos,
  salvarPerguntaSemResposta,
  lerPerguntasSemResposta,
  deletarPerguntaSemResposta,
  salvarLinkEvento,
  deletarLinkEvento,
  lerLinksEventos,
  salvarExemploTom,
  lerExemplosTom,
  lerTodosHistoricos,
  lerClientesMeta,
  lerClienteMeta,
  salvarClienteMeta,
  salvarRelayPendente,
  lerRelayPorAlerta,
  lerRelaysPendentes,
  deletarRelayPendente,
};
