// ============================================================================
// FIREBASE.JS - Conexão com o banco de dados Firebase
// ============================================================================
// Este arquivo é responsável por:
// 1. Conectar ao Firebase usando as credenciais
// 2. Ler o cérebro do Gusthavo do banco
// 3. Ler as atrações da sexta e sábado do banco
// ============================================================================

const admin = require('firebase-admin');
const path = require('path');

// ============================================================================
// INICIALIZAÇÃO DO FIREBASE
// ============================================================================

// Carrega credenciais do Firebase
// No Railway usa a variável de ambiente FIREBASE_CREDENTIALS
// Localmente usa o arquivo config/firebase.json
let serviceAccount;

// Inicializa o Firebase (só uma vez)
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

// Referência ao banco de dados Firestore
const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  host: 'southamerica-east1-firestore.googleapis.com',
  ssl: true
});

// ============================================================================
// FUNÇÃO 1: LER O CÉREBRO DO GUSTHAVO
// ============================================================================
// Busca o system prompt atualizado do banco de dados.
// Assim você pode editar a persona do Gusthavo pelo painel admin
// sem precisar mexer no código.

async function lerCerebroDoGusthavo() {
  try {
    const doc = await db
      .collection('configuracoes')
      .doc('gusthavo')
      .get();

    if (!doc.exists) {
      console.log('⚠️  Documento do Gusthavo não encontrado no Firebase.');
      return null;
    }

    const dados = doc.data();

    // Retorna o campo "systemPrompt" se existir
    // (quando você editar pelo painel admin, vai salvar nesse campo)
    if (dados.systemPrompt) {
      return dados.systemPrompt;
    }

    // Se não tiver systemPrompt ainda, retorna null
    // (o sistema vai usar o prompt.js local como fallback)
    return null;
  } catch (erro) {
    console.log('❌ Erro ao ler cérebro do Firebase:', erro.message);
    return null;
  }
}

// ============================================================================
// FUNÇÃO 2: LER ATRAÇÕES DO FIM DE SEMANA
// ============================================================================
// Busca as atrações de sexta e sábado do banco.
// Você atualiza pelo painel admin toda semana.

async function lerAtracoes() {
  try {
    const [docSexta, docSabado] = await Promise.all([
      db.collection('atracoes').doc('sexta').get(),
      db.collection('atracoes').doc('sabado').get(),
    ]);

    const atracoes = {
      sexta: docSexta.exists ? docSexta.data() : null,
      sabado: docSabado.exists ? docSabado.data() : null,
    };

    return atracoes;
  } catch (erro) {
    console.log('❌ Erro ao ler atrações do Firebase:', erro.message);
    return { sexta: null, sabado: null };
  }
}

// ============================================================================
// FUNÇÃO 3: SALVAR DADOS (usada pelo painel admin)
// ============================================================================

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
// EXPORTAÇÃO
// ============================================================================
// ============================================================================
// FUNÇÃO: LER HISTÓRICO DO CLIENTE
// ============================================================================
async function lerHistorico(telefone) {
  try {
    const doc = await db
      .collection('historicos')
      .doc(telefone)
      .get();
    if (!doc.exists) return [];
    return doc.data().mensagens || [];
  } catch (erro) {
    console.log('⚠️ Erro ao ler histórico:', erro.message);
    return [];
  }
}

// ============================================================================
// FUNÇÃO: SALVAR HISTÓRICO DO CLIENTE
// ============================================================================
async function salvarHistorico(telefone, mensagens) {
  try {
    await db
      .collection('historicos')
      .doc(telefone)
      .set({ mensagens, atualizadoEm: new Date() });
    console.log(`💾 Histórico salvo para ${telefone}`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar histórico:', erro.message);
    return false;
  }
}
// ============================================================================
// FUNÇÃO: SALVAR FLYER
// ============================================================================
async function salvarFlyer(tipo, url) {
  try {
    await db.collection('flyers').doc(tipo).set({ url, atualizadoEm: new Date() });
    console.log(`✅ Flyer "${tipo}" atualizado no Firebase`);
    return true;
  } catch (erro) {
    console.log('⚠️ Erro ao salvar flyer:', erro.message);
    return false;
  }
}

// ============================================================================
// FUNÇÃO: LER FLYERS
// ============================================================================
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
// ============================================================================
// FUNÇÃO: SALVAR INFO (valores, benefícios, programação, extras)
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

// ============================================================================
// FUNÇÃO: LER INFOS
// ============================================================================
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
// FUNÇÃO: CONTROLE DO GIA (ligar/desligar)
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
    if (!doc.exists) return true; // padrão: ativo
    return doc.data().ativo !== false;
  } catch (erro) {
    return true; // se der erro, mantém ativo
  }
}

// ============================================================================
// FUNÇÃO: RASTREAR PEDIDOS (lista, camarote, aniversário)
// ============================================================================
async function registrarPedido(tipo) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const ref = db.collection('relatorios').doc(hoje);
    const doc = await ref.get();
    const dados = doc.exists ? doc.data() : {
      atendimentos: 0,
      lista: 0,
      camarote: 0,
      aniversario: 0,
      perguntas: {}
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
      atendimentos: 0,
      lista: 0,
      camarote: 0,
      aniversario: 0,
      perguntas: {}
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
      atendimentos: 0,
      lista: 0,
      camarote: 0,
      aniversario: 0,
      perguntas: {}
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
// FUNÇÃO: LER HISTÓRICO DO CLIENTE
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

// ============================================================================
// FUNÇÃO: LER UM FLYER ESPECÍFICO
// ============================================================================
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
// ============================================================================
// FUNÇÃO: SALVAR CALENDÁRIO
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

// ============================================================================
// FUNÇÃO: LER CALENDÁRIO COMPLETO
// ============================================================================
async function lerCalendario() {
  try {
    const snapshot = await db.collection('calendario').get();
    if (snapshot.empty) return null;
    
    const dias = [];
    snapshot.forEach(doc => {
      dias.push({ dia: doc.id, descricao: doc.data().descricao });
    });
    
    // Ordena por data
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
  salvarInfo,
  lerInfos,
  salvarStatusGia,
  lerStatusGia,
  registrarPedido,
  registrarAtendimento,
  lerRelatorioSemana,
  salvarCalendario,
  lerCalendario
};