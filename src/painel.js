// ============================================================================
// PAINEL.JS - Backend do Painel Administrativo CBP (Le Club)
// ============================================================================

const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const cloudinary = require('cloudinary').v2;
const {
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
  lerClienteMeta,
  salvarClienteMeta,
  lerSituacoesCRM,
  salvarSituacaoCRM,
  deletarSituacaoCRM,
  limparSituacaoCliente,
  lerConfigNegocio,
  salvarConfigNegocio,
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

// P0 (hardening 04/08): token de sessao gerado com crypto seguro (32 bytes
// aleatorios), nao com Math.random() — Math.random() nao e adequado para nada
// relacionado a seguranca porque o resultado pode ser previsivel.
function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// RATE LIMIT DE LOGIN (hardening 04/08) — protege contra tentativa de senha
// por forca bruta. Bloqueia o IP por 15min apos 5 tentativas erradas seguidas.
// Guardado em memoria (reseta se o Railway reiniciar) — suficiente pro painel
// ter uma unica senha de admin, sem precisar de banco extra so pra isso.
// ============================================================================
const MAX_TENTATIVAS_LOGIN = 5;
const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;
const LIMPEZA_APOS_MS = 24 * 60 * 60 * 1000; // remove registros parados ha 24h
const tentativasLogin = {}; // { ip: { falhas, bloqueadoAte, ultimaTentativa } }

function obterIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

function estaBloqueado(ip) {
  const r = tentativasLogin[ip];
  return !!(r && r.bloqueadoAte && r.bloqueadoAte > Date.now());
}

function registrarFalhaLogin(ip) {
  const r = tentativasLogin[ip] || { falhas: 0, bloqueadoAte: 0 };
  r.falhas += 1;
  r.ultimaTentativa = Date.now();
  if (r.falhas >= MAX_TENTATIVAS_LOGIN) {
    r.bloqueadoAte = Date.now() + JANELA_BLOQUEIO_MS;
    r.falhas = 0;
  }
  tentativasLogin[ip] = r;
}

function limparTentativasLogin(ip) {
  delete tentativasLogin[ip];
}

// Varredura periodica — evita que o objeto cresca pra sempre em memoria.
setInterval(() => {
  const agora = Date.now();
  Object.keys(tentativasLogin).forEach((ip) => {
    const r = tentativasLogin[ip];
    const semAtividadeRecente = !r.ultimaTentativa || (agora - r.ultimaTentativa) > LIMPEZA_APOS_MS;
    const naoEstaBloqueado = !r.bloqueadoAte || r.bloqueadoAte < agora;
    if (semAtividadeRecente && naoEstaBloqueado) delete tentativasLogin[ip];
  });
}, 60 * 60 * 1000);

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
  const ip = obterIP(req);

  if (estaBloqueado(ip)) {
    const restante = Math.ceil((tentativasLogin[ip].bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas erradas. Tente novamente em ${restante} min.` });
  }

  const { senha } = req.body;
  if (senha !== process.env.PAINEL_SENHA) {
    registrarFalhaLogin(ip);
    return res.status(401).json({ erro: 'Senha incorreta' });
  }

  limparTentativasLogin(ip);
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


// ── STATUS DO CBP ──────────────────────────────────────
router.get('/status', verificarToken, async (req, res) => {
  const ativo = await lerStatusGia();
  res.json({ ativo });
});

router.post('/status', verificarToken, async (req, res) => {
  const { ativo } = req.body;
  const ok = await salvarStatusGia(ativo);
  res.json({ ok });
});

// ── CONFIG DE NEGOCIO (precos, minimos e regras que o cerebro usa) ───────
// Antes fixos no codigo do prompt.js; agora editaveis aqui. Documento vazio
// (primeiro uso) = cerebro usa os valores padrao do codigo normalmente.
router.get('/config', verificarToken, async (req, res) => {
  try {
    const config = await lerConfigNegocio();
    res.json({ config });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.post('/config', verificarToken, async (req, res) => {
  try {
    const CAMPOS_TEXTO = ['abertura', 'instagram', 'contatoDireto', 'descontoAntecipado', 'aniversarioHomem', 'aniversarioMulher', 'aniversarioLimiteHora'];
    const CAMPOS_NUMERO = ['aniversarioMinConvidados', 'aniversarioGrupoGrande', 'camaroteMinPessoas', 'camaroteSugerirAPartirDe', 'sofaMaxPessoas'];
    const dados = {};
    CAMPOS_TEXTO.forEach((c) => { if (req.body[c] !== undefined && String(req.body[c]).trim() !== '') dados[c] = String(req.body[c]).trim(); });
    CAMPOS_NUMERO.forEach((c) => {
      if (req.body[c] !== undefined && String(req.body[c]).trim() !== '') {
        const n = Number(req.body[c]);
        if (!Number.isNaN(n)) dados[c] = n;
      }
    });
    const ok = await salvarConfigNegocio(dados);
    res.json({ ok });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
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
        const texto = `🧪 Teste de disparo — CBP funcionando!\n${comMencao ? '(com @todos)' : '(sem @todos)'}`;
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

// ── DASHBOARD ──────────────────────────────────────────
// Metricas da semana + estado dos flyers, tudo numa chamada.
router.get('/dashboard', verificarToken, async (req, res) => {
  try {
    const [relatorio, flyers, historicos, meta, ativo] = await Promise.all([
      lerRelatorioSemana(),
      lerFlyers(),
      lerTodosHistoricos(),
      lerClientesMeta(),
      lerStatusGia(),
    ]);

    const agora = Date.now();
    const SEMANA = 7 * 24 * 60 * 60 * 1000;

    const clientesNovos = historicos.filter((h) => {
      const m = meta[h.telefone] || {};
      const inicio = m.criadoEm || h.ultimaInteracaoMs;
      return inicio && (agora - inicio) < SEMANA;
    }).length;

    const convertidos = Object.values(meta).filter((m) => m && m.converteu === true).length;

    const r = relatorio || { atendimentos: 0, lista: 0, camarote: 0, aniversario: 0 };
    const conversao = r.atendimentos > 0 ? Math.round((r.lista / r.atendimentos) * 100) : 0;

    const ESPERADOS = ['programacao_sexta','programacao_sabado','entrada_sexta','entrada_sabado','camarote_sexta','camarote_sabado','aniversario_sexta','aniversario_sabado'];
    const statusFlyers = ESPERADOS.map((k) => ({ tipo: k, ok: !!flyers[k] }));

    res.json({
      ativo,
      metricas: {
        atendimentos: r.atendimentos || 0,
        lista: r.lista || 0,
        camarote: r.camarote || 0,
        aniversario: r.aniversario || 0,
        conversao,
        clientesNovos,
        convertidos,
        totalClientes: historicos.length,
      },
      flyers: statusFlyers,
    });
  } catch (erro) {
    console.error('Erro no dashboard:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// (18/08) Rota /pendencias REMOVIDA a pedido do Gusthavo: era so' um espelho,
// no painel, do mesmo alerta que o CBP ja manda pro WhatsApp admin quando nao
// sabe responder (modo ponte, ver webhook.js). Redundante, e o polling de 60s
// que a alimentava (iniciarVigia, removido do app.js) foi o que estourou a
// cota diaria do Firestore lendo "clientes_meta" inteira toda vez. O mecanismo
// de ponte em si (relay_pendente, alerta no WhatsApp, encaminhar resposta do
// admin pro cliente) continua ativo e intacto — so a exibicao redundante no
// painel foi removida.

// ── CRM: CLIENTES ──────────────────────────────────────────────────────────
// v1: deriva a lista de clientes a partir da coleção "historicos" (todo cliente
// que o CBP atendeu) + metadados editáveis (nome, nota, status manual, converteu).

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
        nome: m.nome || m.nomeInformado || m.nomeWhats || '',
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
    const semNome = historicos.filter(h => { const m = meta[h.telefone] || {}; return !m.nome && !m.nomeWhats; });
    const ocultos = semNome.filter(h => String(h.telefone).includes('@')).length; // @lid: numero oculto
    const alvos = semNome.filter(h => !String(h.telefone).includes('@') && /^\d{6,}$/.test(String(h.telefone).replace(/\D/g, '')));
    let atualizados = 0, i = 0;
    async function worker() {
      while (i < alvos.length) {
        const h = alvos[i++];
        const nome = await zapi.buscarNomeContato(h.telefone);
        if (nome) { await salvarClienteMeta(h.telefone, { nomeWhats: nome }); atualizados++; }
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker));
    res.json({ ok: true, atualizados, tentados: alvos.length, ocultos });
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

    // FIX (10/08): ao marcar como convertido, limpa as situacoes de CRM ativo
    // do cliente. Antes disso a marcacao ficava presa pra sempre — a trava
    // "nao manda pra quem ja converteu" ja existia, mas a tag continuava
    // aparecendo na lista de "quem precisa de acompanhamento" mesmo depois
    // de resolvido, sujando a visao do CRM Ativo.
    if (converteu === true) {
      try {
        const metaAtual = await lerClienteMeta(telefone);
        const chaves = Object.keys((metaAtual && metaAtual.situacoes) || {});
        await Promise.all(chaves.map((chave) => limparSituacaoCliente(telefone, chave)));
      } catch (e) { console.log('Erro ao limpar situações após conversão:', e.message); }
    }

    res.json({ ok });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ── CRM ATIVO: SITUACOES (etiquetas + mensagens automaticas) ──────────────
// Catalogo editavel no painel. Cada situacao tem: chave, rotulo, descricaoIA
// (o que a IA le pra saber quando marcar), mensagem (enviada toda segunda) e
// ativo (liga/desliga sem apagar).

router.get('/situacoes', verificarToken, async (req, res) => {
  try {
    const [situacoes, meta] = await Promise.all([lerSituacoesCRM(), lerClientesMeta()]);
    const comContagem = situacoes.map((s) => {
      const total = Object.values(meta).filter((m) => m && m.situacoes && m.situacoes[s.chave]).length;
      return { ...s, totalClientes: total };
    });
    res.json({ situacoes: comContagem });
  } catch (erro) {
    console.error('Erro ao listar situações:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

router.post('/situacoes', verificarToken, async (req, res) => {
  try {
    const { chave, rotulo, descricaoIA, mensagem, ativo } = req.body;
    const chaveLimpa = String(chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!chaveLimpa) return res.status(400).json({ erro: 'Chave da situação é obrigatória' });
    if (!rotulo || !mensagem) return res.status(400).json({ erro: 'Rótulo e mensagem são obrigatórios' });

    const ok = await salvarSituacaoCRM(chaveLimpa, {
      rotulo,
      descricaoIA: descricaoIA || rotulo,
      mensagem,
      ativo: ativo !== false,
    });
    res.json({ ok, chave: chaveLimpa });
  } catch (erro) {
    console.error('Erro ao salvar situação:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

router.delete('/situacoes/:chave', verificarToken, async (req, res) => {
  try {
    const ok = await deletarSituacaoCRM(req.params.chave);
    res.json({ ok });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Lista os clientes atualmente marcados com uma situação (pra revisar antes do envio)
router.get('/situacoes/:chave/clientes', verificarToken, async (req, res) => {
  try {
    const { chave } = req.params;
    const meta = await lerClientesMeta();
    const clientes = Object.entries(meta)
      .filter(([, m]) => m && m.situacoes && m.situacoes[chave])
      .map(([telefone, m]) => ({
        telefone,
        nome: m.nome || m.nomeInformado || m.nomeWhats || '',
        converteu: m.converteu === true,
        tentativas: (m.situacoes[chave] && m.situacoes[chave].tentativas) || 0,
        ultimoEnvio: (m.situacoes[chave] && m.situacoes[chave].ultimoEnvio) || 0,
        desde: (m.situacoes[chave] && m.situacoes[chave].desde) || 0,
      }));
    res.json({ clientes });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Teste manual: manda a mensagem configurada pra UM telefone especifico (nao dispara em massa)
router.post('/situacoes/:chave/testar', verificarToken, async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ erro: 'Informe um telefone de teste' });
    const situacoes = await lerSituacoesCRM();
    const situacao = situacoes.find((s) => s.chave === req.params.chave);
    if (!situacao || !situacao.mensagem) return res.status(404).json({ erro: 'Situação sem mensagem configurada' });
    await zapi.enviarTexto(telefone, situacao.mensagem);
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro no teste de situação:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
