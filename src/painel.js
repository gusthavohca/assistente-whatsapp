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

module.exports = router;
