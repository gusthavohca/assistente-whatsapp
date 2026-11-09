// ============================================================================
// BACKUP-FIREBASE.JS - Cópia SOMENTE LEITURA do Firestore do CBP
// ============================================================================
// Não grava, não altera e não apaga nada no Firebase.
// Salva tudo em arquivos JSON dentro de  backups/AAAA-MM-DD_HHMM/
// A pasta backups/ contém dados pessoais de clientes: NUNCA suba para o GitHub.
// Rode com:  node backup-firebase.js
// ============================================================================

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
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

// ----------------------------------------------------------------------------
// Converte tipos especiais do Firestore em JSON comum
// ----------------------------------------------------------------------------
function converter(valor) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor.toDate === 'function') return { __tipo: 'timestamp', valor: valor.toDate().toISOString() };
  if (typeof valor.latitude === 'number' && typeof valor.longitude === 'number' && Object.keys(valor).length <= 4) {
    return { __tipo: 'geopoint', latitude: valor.latitude, longitude: valor.longitude };
  }
  if (valor.path && valor.firestore) return { __tipo: 'referencia', valor: valor.path };
  if (Buffer.isBuffer(valor)) return { __tipo: 'bytes', valor: valor.toString('base64') };
  if (Array.isArray(valor)) return valor.map(converter);
  if (typeof valor === 'object') {
    const saida = {};
    for (const k of Object.keys(valor)) saida[k] = converter(valor[k]);
    return saida;
  }
  return valor;
}

// ----------------------------------------------------------------------------
// Lê uma coleção inteira, incluindo subcoleções
// ----------------------------------------------------------------------------
let totalDocs = 0;

async function lerColecao(colRef) {
  const snap = await colRef.get();
  const docs = [];
  for (const doc of snap.docs) {
    const item = { id: doc.id, dados: converter(doc.data()) };
    const subs = await doc.ref.listCollections();
    if (subs.length) {
      item.subcolecoes = {};
      for (const sub of subs) item.subcolecoes[sub.id] = await lerColecao(sub);
    }
    docs.push(item);
    totalDocs++;
  }
  return docs;
}

function agora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

(async () => {
  const pasta = path.join(__dirname, 'backups', agora());
  fs.mkdirSync(pasta, { recursive: true });

  console.log('Projeto:', serviceAccount.project_id);
  console.log('Salvando em:', pasta, '\n');

  const colecoes = await db.listCollections();
  const resumo = [];

  for (const col of colecoes) {
    process.stdout.write(`Lendo ${col.id} ... `);
    const docs = await lerColecao(col);
    fs.writeFileSync(path.join(pasta, `${col.id}.json`), JSON.stringify(docs, null, 2), 'utf8');
    console.log(`${docs.length} documentos`);
    resumo.push({ colecao: col.id, documentos: docs.length });
  }

  // Cérebro em texto puro, para leitura e revisão
  const cerebro = await db.collection('configuracoes').doc('gusthavo').get();
  if (cerebro.exists && cerebro.data().systemPrompt) {
    fs.writeFileSync(path.join(pasta, 'CEREBRO.txt'), cerebro.data().systemPrompt, 'utf8');
    console.log('\nCérebro salvo em CEREBRO.txt');
  }

  fs.writeFileSync(
    path.join(pasta, '_resumo.json'),
    JSON.stringify({ projeto: serviceAccount.project_id, geradoEm: new Date().toISOString(), totalDocumentos: totalDocs, colecoes: resumo }, null, 2),
    'utf8'
  );

  console.log(`\n✅ Backup concluído: ${colecoes.length} coleções, ${totalDocs} documentos.`);
  console.log('Nada foi gravado, alterado ou apagado no Firebase.\n');
  process.exit(0);
})().catch((e) => {
  console.log('\n❌ Backup interrompido:', e.message);
  process.exit(1);
});
