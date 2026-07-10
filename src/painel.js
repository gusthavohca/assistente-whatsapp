// ============================================================================
// PAINEL.JS - Backend do Painel Administrativo Le Club
// ============================================================================

const express = require('express');
const multer  = require('multer');
const cloudinary = require('cloudinary').v2;
const {
  lerCerebroDoGusthavo,
  salvarCerebroDoGusthavo,
  lerFlyers,
  salvarFlyer,
  deletarFlyer,
  lerRelatorioSemana,
  salvarStatusGia,
  lerStatusGia,
  salvarCalendario,
  deletarCalendario,
  lerCalendarioCompleto,
  salvarLinkEvento,
  deletarLinkEvento,
  lerLinksEventos,
  lerDisparos,
  salvarDisparos,
  lerPerguntasSemResposta,
  deletarPerguntaSemResposta,
  lerTodosHistoricos,
  lerClientesMeta,
  salvarClienteMeta,
} = require('./firebase');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Aceita imagens E vídeos
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Use imagem ou vídeo.'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB para vídeos
});

const tokensAtivos = new Set();

function gerarToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function verificarToken(req, res, next) {
  const token = req.headers['authorization'] || req.query.token;
  if (!token || !tokensAtivos.has(token)) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  next();
}

const router = express.Router();

// ── LOGIN ──────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { senha } = req.body;
  if (senha !== process.env.PAINEL_SENHA) {
    return res.status(401).json({ erro: 'Senha incorreta' });
  }
  const token = gerarToken();
  tokensAtivos.add(token);
  res.json({ token });
});

router.post('/logout', verificarToken, (req, res) => {
  const token = req.headers['authorization'];
  tokensAtivos.delete(token);
  res.json({ ok: true });
});

// ── FLYERS E VÍDEOS ────────────────────────────────────
// A coleção "flyers" no Firebase armazena tanto imagens quanto vídeos.
// O tipo de mídia (imagem/vídeo) é detectado pelo mimetype no upload.

router.get('/flyers', verificarToken, async (req, res) => {
  const flyers = await lerFlyers();
  res.json(flyers);
});

router.post('/flyer/:tipo', verificarToken, upload.single('imagem'), async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

    const isVideo    = req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const resultado = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'leclub-flyers', public_id: tipo, overwrite: true, resource_type: resourceType },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    await salvarFlyer(tipo, resultado.secure_url);
    res.json({ ok: true, url: resultado.secure_url, isVideo });
  } catch (erro) {
    console.error('Erro upload flyer/vídeo:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

router.delete('/flyer/:tipo', verificarToken, async (req, res) => {
  try {
    const { tipo } = req.params;
    // Tenta deletar como imagem; se falhar, tenta como vídeo
    try {
      await cloudinary.uploader.destroy(`leclub-flyers/${tipo}`);
    } catch {
      await cloudinary.uploader.destroy(`leclub-flyers/${tipo}`, { resource_type: 'video' });
    }
    await deletarFlyer(tipo);
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao deletar flyer/vídeo:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// ── CÉREBRO DA GIA ─────────────────────────────────────
router.get('/cerebro', verificarToken, async (req, res) => {
  const cerebro = await lerCerebroDoGusthavo();
  res.json({ cerebro });
});

router.post('/cerebro', verificarToken, async (req, res) => {
  const { cerebro } = req.body;
  const ok = await salvarCerebroDoGusthavo(cerebro);
  res.json({ ok });
});

// ── STATUS DA GIA ──────────────────────────────────────
router.get('/status', verificarToken, async (req, res) => {
  const ativo = await lerStatusGia();
  res.json({ ativo });
});

router.post('/status', verificarToken, async (req, res) => {
  const { ativo } = req.body;
  const ok = await salvarStatusGia(ativo);
  res.json({ ok });
});

// ── RELATÓRIO ──────────────────────────────────────────
router.get('/relatorio', verificarToken, async (req, res) => {
  const relatorio = await lerRelatorioSemana();
  res.json(relatorio);
});

// ── CALENDÁRIO ─────────────────────────────────────────
router.get('/calendario', verificarToken, async (req, res) => {
  const eventos = await lerCalendarioCompleto();
  res.json({ eventos });
});

router.post('/calendario', verificarToken, async (req, res) => {
  const { dia, descricao } = req.body;
  const ok = await salvarCalendario(dia, descricao);
  res.json({ ok });
});

router.delete('/calendario/:dia', verificarToken, async (req, res) => {
  try {
    const dia = decodeURIComponent(req.params.dia);
    const ok = await deletarCalendario(dia);
    res.json({ ok });
  } catch (erro) {
    console.error('Erro ao deletar evento:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// ── LINKS DE EVENTOS ───────────────────────────────────
router.get('/links', verificarToken, async (req, res) => {
  try {
    const eventos = await lerLinksEventos();
    res.json({ eventos });
  } catch (erro) {
    console.error('Erro ao ler links:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

router.post('/links', verificarToken, async (req, res) => {
  try {
    const { data, atracao, url } = req.body;
    if (!data || !atracao || !url) {
      return res.status(400).json({ erro: 'Data, atração e URL são obrigatórios' });
    }
    const id = `${data.replace(/\//g, '-')}_${Date.now()}`;
    const ok = await salvarLinkEvento(id, data, atracao, url);
    res.json({ ok });
  } catch (erro) {
    console.error('Erro ao salvar link:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

router.delete('/links/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deletarLinkEvento(id);
    res.json({ ok });
  } catch (erro) {
    console.error('Erro ao deletar link:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// ── DISPAROS ───────────────────────────────────────────
// Estrutura Firebase esperada:
// {
//   ativo: bool,
//   mencionarTodos: bool,
//   grupos: ["id1@g.us", "id2@g.us", "id3@g.us"],
//   dias: {
//     segunda: { "14": [{tipo,categoria,texto}], "16": [...], "18": [...] },
//     terca:   { "11": [...], "18": [...] },
//     quarta:  { "11": [...], "18": [...] },
//     quinta:  { "11": [...], "18": [...] },
//     sexta:   { "12": [...], "17": [...], "21": [...] },
//     sabado:  { "12": [...], "18": [...], "21": [...] },
//     domingo: {}
//   }
// }

const DEFAULT_DISPAROS = {
  ativo: false,
  mencionarTodos: true,
  grupos: [],
  dias: {
    segunda: { '14': [], '16': [], '18': [] },
    terca:   { '11': [], '18': [] },
    quarta:  { '11': [], '18': [] },
    quinta:  { '11': [], '19': [] },
    sexta:   { '12': [], '17': [], '21': [] },
    sabado:  { '12': [], '18': [], '21': [] },
    domingo: {},
  }
};

router.get('/disparos', verificarToken, async (req, res) => {
  const config = await lerDisparos();
  res.json(config || DEFAULT_DISPAROS);
});

router.post('/disparos', verificarToken, async (req, res) => {
  const { ativo, mencionarTodos, grupos, dias } = req.body;
  const ok = await salvarDisparos({ ativo, mencionarTodos, grupos, dias });
  res.json({ ok });
});

// ── PERGUNTAS SEM RESPOSTA ─────────────────────────────────────────────────

router.get('/perguntas', verificarToken, async (req, res) => {
  try {
    const perguntas = await lerPerguntasSemResposta();
    res.json({ perguntas });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.delete('/perguntas/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deletarPerguntaSemResposta(id);
    res.json({ ok });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ── TESTE DE DISPARO MANUAL ────────────────────────────────────────────────
// Envia uma mensagem de texto simples para todos os grupos configurados.
// Útil para diagnosticar problemas sem depender de horário fixo.

const zapi = require('./zapi');

router.post('/disparos/testar', verificarToken, async (req, res) => {
  try {
    const config = await lerDisparos();
    if (!config) return res.json({ ok: false, erro: 'Nenhuma configuração de disparo encontrada' });

    // Deduplicação: remove IDs de grupo repetidos
    const grupos = [...new Set((config.grupos || []).filter(g => g && g.trim()))];
    if (grupos.length === 0) return res.json({ ok: false, erro: 'Nenhum grupo configurado' });

    const { comMencao } = req.body; // true = testa com @todos, false = sem
    const resultados = [];

    for (const grupoId of grupos) {
      try {
        const texto = `🧪 Teste de disparo — GIA funcionando!\n${comMencao ? '(com @todos)' : '(sem @todos)'}`;
        await zapi.enviarTexto(grupoId, texto, comMencao === true);
        resultados.push({ grupo: grupoId, ok: true });
      } catch (e) {
        resultados.push({ grupo: grupoId, ok: false, erro: e.message });
      }
    }

    console.log('🧪 Teste de disparo manual:', resultados);
    res.json({ ok: true, resultados });
  } catch (erro) {
    console.error('Erro no teste de disparo:', erro);
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// ── CRM: CLIENTES ──────────────────────────────────────────────────────────
// v1: deriva a lista de clientes a partir da coleção "historicos" (todo cliente
// que a GIA atendeu) + metadados editáveis (nome, nota, status manual, converteu).

const DIAS_SUMIDO = 14; // sem interação há mais de 14 dias = "sumido"

function derivarInteresse(mensagens) {
  // Olha só as falas do CLIENTE (role: 'user') para detectar interesse real.
  const textoCliente = (mensagens || [])
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content.toLowerCase())
    .join(' ');
  return {
    lista:      /\blista\b|nome na lista|colocar o nome/.test(textoCliente),
    camarote:   /camarote|reserva|mesa|area vip|área vip/.test(textoCliente),
    aniversario:/anivers[aá]rio|aniversariante|comemora/.test(textoCliente),
  };
}

router.get('/clientes', verificarToken, async (req, res) => {
  try {
    const [historicos, meta] = await Promise.all([
      lerTodosHistoricos(),
      lerClientesMeta(),
    ]);

    const agora = Date.now();
    const clientes = historicos.map((h) => {
      const m = meta[h.telefone] || {};
      const totalMensagens = (h.mensagens || []).length;
      const diasDesde = h.ultimaInteracaoMs
        ? Math.floor((agora - h.ultimaInteracaoMs) / 86400000)
        : null;

      // Status automático (proxy — refinado depois com comandas/check-in):
      // sumido = sem interação há >14 dias; recorrente = conversa longa/engajada;
      // novo = interação recente e curta.
      let statusAuto;
      if (diasDesde === null)               statusAuto = 'novo';
      else if (diasDesde > DIAS_SUMIDO)     statusAuto = 'sumido';
      else if (totalMensagens > 6)          statusAuto = 'recorrente';
      else                                  statusAuto = 'novo';

      return {
        telefone: h.telefone,
        nome: m.nome || m.nomeWhats || '',
        nota: m.nota || '',
        totalMensagens,
        ultimaInteracaoMs: h.ultimaInteracaoMs || 0,
        diasDesde,
        interesse: derivarInteresse(h.mensagens),
        converteu: m.converteu === true, // "colocou nome na lista" — confirmado manualmente
        status: m.statusManual || statusAuto,
        statusManual: m.statusManual || '',
      };
    });

    // Mais recentes primeiro
    clientes.sort((a, b) => b.ultimaInteracaoMs - a.ultimaInteracaoMs);

    // Resumo pra os contadores do topo
    const resumo = {
      total: clientes.length,
      ativos: clientes.filter((c) => c.status !== 'sumido').length,
      sumidos: clientes.filter((c) => c.status === 'sumido').length,
      convertidos: clientes.filter((c) => c.converteu).length,
    };

    res.json({ clientes, resumo });
  } catch (erro) {
    console.error('Erro ao listar clientes:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// Retorna a conversa completa de UM cliente (pra ver o histórico no painel)
router.get('/clientes/:telefone/conversa', verificarToken, async (req, res) => {
  try {
    const telefone = req.params.telefone;
    const historicos = await lerTodosHistoricos();
    const cliente = historicos.find((h) => h.telefone === telefone);
    res.json({ mensagens: cliente ? cliente.mensagens : [] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Sincroniza nomes: puxa do WhatsApp (Z-API) o nome salvo dos clientes "sem nome".
// IMPORTANTE: esta rota precisa vir ANTES de POST /clientes/:telefone.
router.post('/clientes/sincronizar-nomes', verificarToken, async (req, res) => {
  try {
    const [historicos, meta] = await Promise.all([lerTodosHistoricos(), lerClientesMeta()]);
    let atualizados = 0, tentados = 0;
    for (const h of historicos) {
      const m = meta[h.telefone] || {};
      if (m.nome || m.nomeWhats) continue;
      if (!/^\d{6,}$/.test(String(h.telefone).replace(/\D/g, ''))) continue;
      tentados++;
      const nome = await zapi.buscarNomeContato(h.telefone);
      if (nome) { await salvarClienteMeta(h.telefone, { nomeWhats: nome }); atualizados++; }
    }
    res.json({ ok: true, atualizados, tentados });
  } catch (erro) {
    console.error('Erro ao sincronizar nomes:', erro);
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// Salva/edita metadados do cliente (nome, nota, status manual, converteu)
router.post('/clientes/:telefone', verificarToken, async (req, res) => {
  try {
    const telefone = req.params.telefone;
    const { nome, nota, statusManual, converteu } = req.body;
    const dados = {};
    if (nome !== undefined)         dados.nome = nome;
    if (nota !== undefined)         dados.nota = nota;
    if (statusManual !== undefined) dados.statusManual = statusManual;
    if (converteu !== undefined)    dados.converteu = converteu === true;
    const ok = await salvarClienteMeta(telefone, dados);
    res.json({ ok });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
