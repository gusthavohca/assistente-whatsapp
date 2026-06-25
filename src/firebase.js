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
// EXPORTAÇÃO
// ============================================================================

module.exports = {
  lerCerebroDoGusthavo,
  salvarCerebroDoGusthavo,
  lerDisparos,
  salvarDisparos,
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
  salvarLinkEvento,
  deletarLinkEvento,
  lerLinksEventos,
};