// ============================================================================
// VERIFICAR-PRONTIDAO.JS - Checagem SOMENTE LEITURA do CBP
// ============================================================================
// Não grava, não altera e não apaga nada no Firebase.
// Não envia nada pelo WhatsApp e não chama a Claude.
// Rode com:  node verificar-prontidao.js
// ============================================================================

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
  serviceAccount = require(path.join(__dirname, 'config', 'firebase.json'));
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  host: 'southamerica-east1-firestore.googleapis.com',
  ssl: true,
});

const OK = '✅';
const FALHA = '❌';
const ALERTA = '⚠️';

const problemas = [];

function titulo(texto) {
  console.log('\n' + '='.repeat(60));
  console.log(texto);
  console.log('='.repeat(60));
}

async function testarUrl(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (r.status === 405 || r.status === 403) {
      r = await fetch(url, { method: 'GET', redirect: 'follow' });
    }
    return { ok: r.ok, status: r.status, tipo: r.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: 0, tipo: '', erro: e.message };
  }
}

// ----------------------------------------------------------------------------
// 1. CONEXÃO
// ----------------------------------------------------------------------------
async function verificarConexao() {
  titulo('1. CONEXÃO COM O FIREBASE');
  console.log('Projeto:', serviceAccount.project_id);
  try {
    await db.collection('configuracoes').limit(1).get();
    console.log(`${OK} Conexão com o Firestore funcionando`);
  } catch (e) {
    console.log(`${FALHA} Não conectou ao Firestore: ${e.message}`);
    problemas.push('Firestore não conecta');
    throw e;
  }
}

// ----------------------------------------------------------------------------
// 2. CÉREBRO
// ----------------------------------------------------------------------------
async function verificarCerebro() {
  titulo('2. CÉREBRO DA IA (configuracoes/gusthavo)');
  const doc = await db.collection('configuracoes').doc('gusthavo').get();
  if (!doc.exists) {
    console.log(`${FALHA} Documento do cérebro NÃO existe`);
    problemas.push('Cérebro não existe no Firebase');
    return;
  }
  const d = doc.data();
  const texto = d.systemPrompt || '';
  if (!texto) {
    console.log(`${FALHA} Documento existe, mas o campo systemPrompt está vazio`);
    problemas.push('Cérebro vazio');
    return;
  }
  console.log(`${OK} Cérebro existe`);
  console.log('   Tamanho:', texto.length, 'caracteres');
  if (d.atualizadoEm && d.atualizadoEm.toDate) {
    console.log('   Última atualização:', d.atualizadoEm.toDate().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  } else {
    console.log('   Última atualização: sem registro');
  }
  console.log('   Começo do texto:');
  console.log('   "' + texto.slice(0, 200).replace(/\s+/g, ' ') + '..."');

  // Termos que podem estar desatualizados (só avisa, não decide nada)
  const suspeitos = ['PNE', 'Pensa no Evento', 'pensanoevento'];
  const achados = suspeitos.filter((t) => texto.toLowerCase().includes(t.toLowerCase()));
  if (achados.length) {
    console.log(`${ALERTA} O cérebro menciona: ${achados.join(', ')} (Le Club está saindo do PNE, vale revisar)`);
  }
}

// ----------------------------------------------------------------------------
// 3. FLYERS E VÍDEOS
// ----------------------------------------------------------------------------
async function verificarFlyers() {
  titulo('3. FLYERS E VÍDEOS (coleção flyers + links)');
  const snap = await db.collection('flyers').get();
  if (snap.empty) {
    console.log(`${FALHA} Coleção flyers vazia`);
    problemas.push('Nenhum flyer no Firebase');
    return;
  }
  console.log('Documentos encontrados:', snap.size, '\n');

  for (const doc of snap.docs) {
    const url = (doc.data() || {}).url;
    if (!url) {
      console.log(`${FALHA} ${doc.id}: sem URL gravada`);
      problemas.push(`Flyer ${doc.id} sem URL`);
      continue;
    }
    const r = await testarUrl(url);
    if (r.ok) {
      console.log(`${OK} ${doc.id}  (${r.status}, ${r.tipo})`);
    } else {
      console.log(`${FALHA} ${doc.id}  (status ${r.status}${r.erro ? ', ' + r.erro : ''})`);
      console.log('   ' + url);
      problemas.push(`Flyer ${doc.id} com link quebrado`);
    }
  }
}

// ----------------------------------------------------------------------------
// 4. CONTAGEM DAS COLEÇÕES
// ----------------------------------------------------------------------------
async function contarColecoes() {
  titulo('4. COLEÇÕES DO FIREBASE (quantidade de documentos)');
  const colecoes = [
    'configuracoes', 'atracoes', 'historicos', 'flyers', 'infos', 'relatorios',
    'calendario', 'disparos_log', 'perguntas_sem_resposta', 'links_eventos',
    'tom_exemplos', 'clientes_meta', 'relay_pendente', 'situacoes_crm',
  ];
  for (const nome of colecoes) {
    try {
      const snap = await db.collection(nome).select().get();
      console.log(`${snap.size === 0 ? ALERTA : OK} ${nome}: ${snap.size}`);
    } catch (e) {
      console.log(`${FALHA} ${nome}: erro (${e.message})`);
      problemas.push(`Coleção ${nome} com erro de leitura`);
    }
  }

  const cfg = await db.collection('configuracoes').get();
  console.log('\nDocumentos dentro de "configuracoes":', cfg.docs.map((d) => d.id).join(', '));
}

// ----------------------------------------------------------------------------
// 5. ESTADO DO BOT
// ----------------------------------------------------------------------------
async function verificarStatus() {
  titulo('5. ESTADO DO BOT NO FIREBASE (configuracoes/status)');
  const doc = await db.collection('configuracoes').doc('status').get();
  console.log(doc.exists ? JSON.stringify(doc.data(), null, 2) : `${ALERTA} Documento de status não existe`);
}

// ----------------------------------------------------------------------------
// EXECUÇÃO
// ----------------------------------------------------------------------------
(async () => {
  try {
    await verificarConexao();
    await verificarCerebro();
    await verificarFlyers();
    await contarColecoes();
    await verificarStatus();
  } catch (e) {
    console.log(`\n${FALHA} Verificação interrompida: ${e.message}`);
  }

  titulo('RESUMO');
  if (problemas.length === 0) {
    console.log(`${OK} Nenhum problema encontrado nesta verificação.`);
  } else {
    console.log(`${FALHA} ${problemas.length} problema(s):`);
    problemas.forEach((p) => console.log('  - ' + p));
  }
  console.log('\nNada foi gravado, alterado ou enviado.\n');
  process.exit(0);
})();
