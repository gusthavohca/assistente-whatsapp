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

// Caminho pro arquivo de credenciais
const serviceAccount = require(
  path.join(__dirname, '..', 'config', 'firebase.json')
);

// Inicializa o Firebase (só uma vez)
if (!admin.apps.length) {
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

module.exports = {
  db,
  lerCerebroDoGusthavo,
  lerAtracoes,
  salvarCerebroDoGusthavo,
  salvarAtracao,
};