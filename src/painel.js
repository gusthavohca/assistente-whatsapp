// ============================================================================
// PAINEL.JS - Backend do Painel Administrativo Le Club
// ============================================================================

const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const {
  lerCerebroDoGusthavo,
  salvarCerebroDoGusthavo,
  lerFlyers,
  salvarFlyer,
  lerRelatorioSemana,
  salvarStatusGia,
  lerStatusGia,
  salvarCalendario,
  lerCalendario
} = require('./firebase');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer - armazena imagem em memória antes de enviar pro Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// Tokens de login ativos (memória)
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

// ── FLYERS ─────────────────────────────────────────────
router.get('/flyers', verificarToken, async (req, res) => {
  const flyers = await lerFlyers();
  res.json(flyers);
});

router.post('/flyer/:tipo', verificarToken, upload.single('imagem'), async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada' });

    const resultado = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'leclub-flyers', public_id: tipo, overwrite: true },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    await salvarFlyer(tipo, resultado.secure_url);
    res.json({ ok: true, url: resultado.secure_url });
  } catch (erro) {
    console.error('Erro upload flyer:', erro);
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
  const calendario = await lerCalendario();
  res.json({ calendario });
});

router.post('/calendario', verificarToken, async (req, res) => {
  const { dia, descricao } = req.body;
  const ok = await salvarCalendario(dia, descricao);
  res.json({ ok });
});

module.exports = router;