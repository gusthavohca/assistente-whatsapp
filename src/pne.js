// ============================================================================
// PNE.JS — Integração com Pensa no Evento
// ============================================================================
// Gerencia sessão, adiciona na lista, cria reservas de camarote e
// listas especiais (aniversário) via HTTP direto no sistema PNE.
//
// Cookies são armazenados no Firebase (configuracoes/pne).
// O usuário faz login manual UMA VEZ, copia os cookies e envia via:
//   PNE COOKIES [cookie-string]
// ============================================================================

require('dotenv').config();
require('./firebase'); // garante que o firebase-admin está inicializado
const axios  = require('axios');
const admin  = require('firebase-admin');

const BASE_URL    = 'https://www.pensanoevento.com.br';
const PROMOTER_ID = '47458'; // ID do Gusthavo no PNE

// ============================================================================
// FIREBASE — config PNE (cookies + evento ativo)
// ============================================================================

function getDb() {
  return admin.firestore();
}

async function getPneConfig() {
  try {
    const doc = await getDb().collection('configuracoes').doc('pne').get();
    return doc.exists ? doc.data() : {};
  } catch (e) {
    console.log('❌ PNE Firebase leitura:', e.message);
    return {};
  }
}

async function setPneConfig(dados) {
  try {
    await getDb()
      .collection('configuracoes')
      .doc('pne')
      .set({ ...dados, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    console.log('❌ PNE Firebase escrita:', e.message);
    return false;
  }
}

async function getCookies() {
  const cfg = await getPneConfig();
  return cfg.cookies || null;
}

async function setCookies(cookieString) {
  return setPneConfig({ cookies: cookieString.trim() });
}

async function getEventoAtivo() {
  const cfg = await getPneConfig();
  return cfg.eventoId || null;
}

async function setEventoAtivo(eventoId) {
  return setPneConfig({ eventoId: String(eventoId).trim() });
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

function makeClient(cookies, referer) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Cookie: cookies,
      Referer: referer || `${BASE_URL}/sistema/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: (s) => s < 500, // não joga erro em 3xx/4xx
  });
}

// ============================================================================
// SESSÃO
// ============================================================================

async function testarSessao() {
  const cookies = await getCookies();
  if (!cookies) return { ok: false, motivo: 'Nenhum cookie salvo. Use: PNE COOKIES [string]' };

  try {
    const client = makeClient(cookies);
    const resp = await client.get('/sistema/');
    const html = String(resp.data);

    // Se a página tiver o link de "Sair" → sessão válida
    if (html.includes('Sair') || html.includes('sair') || html.includes('logout')) {
      return { ok: true };
    }
    // Se contiver campo de senha ou login → sessão expirada
    if (html.includes('type="password"') || html.includes('Entrar') || resp.status === 302) {
      return { ok: false, motivo: 'Sessão expirada. Refaça o login manual e atualize os cookies.' };
    }
    // Se chegou aqui com status 200, provavelmente está logado
    if (resp.status === 200) return { ok: true };

    return { ok: false, motivo: `Status inesperado: ${resp.status}` };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

// ============================================================================
// LISTA — buscar product IDs (mudam por evento)
// ============================================================================

async function buscarProdutosLista(eventoId, cookies) {
  const client = makeClient(cookies, `${BASE_URL}/sistema/eventos/`);
  const resp = await client.get(`/sistema/eventos/?acao=listas&id=${eventoId}`);
  const html = String(resp.data);

  if (resp.status !== 200 || html.includes('type="password"')) {
    throw new Error('Sessão inválida ou evento não encontrado ao buscar produtos da lista.');
  }

  // Extrai todos os radio buttons de "inserir_tipo_ingresso"
  // Formato típico: <input type="radio" name="inserir_tipo_ingresso" value="575892" ...> seguido de texto
  const pattern = /name="inserir_tipo_ingresso"[^>]*value="(\d+)"([\s\S]{0,300}?)<\/(?:label|div|td)/gi;
  const produtos = { feminino: null, masculino: null, raw: [] };
  let m;

  while ((m = pattern.exec(html)) !== null) {
    const id   = m[1];
    const ctx  = m[2].toLowerCase();
    produtos.raw.push(id);

    if (ctx.includes('feminina') || ctx.includes('fem') || ctx.includes('mulher')) {
      produtos.feminino = id;
    } else if (ctx.includes('masculino') || ctx.includes('masc') || ctx.includes('homem')) {
      produtos.masculino = id;
    }
  }

  // Fallback por ordem caso o regex de label não bateu
  if (!produtos.feminino  && produtos.raw[0]) produtos.feminino  = produtos.raw[0];
  if (!produtos.masculino && produtos.raw[1]) produtos.masculino = produtos.raw[1];

  return produtos;
}

// ============================================================================
// LISTA — adicionar nome
// ============================================================================

// tipo: 'fem' | 'masc'   acompanhantes: número inteiro >= 0
async function adicionarNaLista(eventoId, nome, tipo, acompanhantes) {
  const cookies = await getCookies();
  if (!cookies) throw new Error('Cookies não configurados. Use: PNE COOKIES [string]');

  const produtos = await buscarProdutosLista(eventoId, cookies);
  const tipoLower = (tipo || '').toLowerCase();
  const tipoId = tipoLower.includes('masc') ? produtos.masculino : produtos.feminino;

  if (!tipoId) {
    throw new Error(
      `Não encontrei o produto "${tipo}" para o evento ${eventoId}. ` +
      `Produtos encontrados: ${produtos.raw.join(', ') || 'nenhum'}. ` +
      'Verifique se o evento está correto com PNE STATUS.'
    );
  }

  const obs = acompanhantes > 0 ? `+${acompanhantes} acompanhante(s)` : '';
  const body = new URLSearchParams({
    inserir_tipo_ingresso: tipoId,
    inserir_nome: nome,
    inserido_por: PROMOTER_ID,
    observacao: obs,
  });

  const client = makeClient(cookies, `${BASE_URL}/sistema/eventos/?acao=listas&id=${eventoId}`);
  const resp = await client.post(`/sistema/eventos/?acao=listas&id=${eventoId}`, body.toString());

  if (resp.status !== 200) throw new Error(`Erro ao adicionar na lista: status ${resp.status}`);

  // Verificar se o nome aparece na resposta como confirmação
  const html = String(resp.data);
  if (html.includes('type="password"')) throw new Error('Sessão expirada. Atualize os cookies com PNE COOKIES.');

  return { ok: true };
}

// ============================================================================
// RESERVAS — buscar espaços (IDs mudam por evento)
// ============================================================================

async function buscarEspacos(eventoId, cookies) {
  const client = makeClient(cookies, `${BASE_URL}/sistema/eventos/`);
  const resp = await client.get(`/sistema/eventos/?acao=reservas&id=${eventoId}`);
  const html = String(resp.data);

  if (resp.status !== 200 || html.includes('type="password"')) {
    throw new Error('Sessão inválida ou evento não encontrado ao buscar espaços.');
  }

  // Extrai links: href="?acao=reservar_espaco&id=4876576" ...>C3<
  // Também pega: href="...reservar_espaco&id=4876576"
  const pattern = /href="[^"]*(?:reservar_espaco[^"]*id=|id=[^"]*reservar_espaco[^"]*)(\d+)[^"]*"[^>]*>\s*([A-Za-z0-9\s\-]+?)\s*</gi;
  const espacos = {};
  let m;

  while ((m = pattern.exec(html)) !== null) {
    const id   = m[1];
    const nome = m[2].trim().toUpperCase().replace(/\s+/g, '');
    if (nome) espacos[nome] = id;
  }

  return espacos;
}

// ============================================================================
// RESERVAS — criar reserva de camarote
// ============================================================================

// camaroteNome: 'C3', 'C4', 'S1', etc.
async function criarReserva(camaroteNome, nomeCliente, pax, observacoes) {
  const cookies = await getCookies();
  if (!cookies) throw new Error('Cookies não configurados. Use: PNE COOKIES [string]');

  const eventoId = await getEventoAtivo();
  if (!eventoId) throw new Error('Evento não definido. Use: PNE EVENTO [id]');

  const espacos = await buscarEspacos(eventoId, cookies);
  const chave   = camaroteNome.toUpperCase().replace(/\s+/g, '');
  const spaceId = espacos[chave];

  if (!spaceId) {
    const disponiveis = Object.keys(espacos).sort().join(', ') || 'nenhum encontrado';
    throw new Error(`Camarote "${camaroteNome}" não encontrado. Disponíveis: ${disponiveis}`);
  }

  const body = new URLSearchParams({
    nome: nomeCliente,
    pax: String(pax || 1),
    status: '3', // confirmado
    promoter: PROMOTER_ID,
    'tags[]': '',
    observacoes: observacoes || '',
  });

  const client = makeClient(
    cookies,
    `${BASE_URL}/sistema/eventos/?acao=reservas&id=${eventoId}`
  );
  const resp = await client.post(
    `/sistema/eventos/?acao=reservar_espaco&id=${spaceId}`,
    body.toString()
  );

  if (resp.status !== 200) throw new Error(`Erro ao criar reserva: status ${resp.status}`);
  const html = String(resp.data);
  if (html.includes('type="password"')) throw new Error('Sessão expirada. Atualize com PNE COOKIES.');

  return { ok: true, spaceId };
}

// ============================================================================
// LISTA ESPECIAL — aniversário (pendente de mapeamento)
// ============================================================================

// eslint-disable-next-line no-unused-vars
async function criarListaAniversario(eventoId, nome, obs) {
  // TODO: Navegar até aba LISTAS ESPECIAIS / ANIVERSÁRIO e mapear o form.
  // Por enquanto retorna erro orientando o usuário.
  throw new Error(
    'Lista de aniversário ainda não mapeada. ' +
    'Acesse manualmente: pensanoevento.com.br → Eventos → Listas Especiais → Aniversário. ' +
    'Me mostra o formulário para eu finalizar a integração.'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // config
  getCookies,
  setCookies,
  getEventoAtivo,
  setEventoAtivo,
  // ops
  testarSessao,
  adicionarNaLista,
  criarReserva,
  criarListaAniversario,
  buscarEspacos,
  buscarProdutosLista,
};
