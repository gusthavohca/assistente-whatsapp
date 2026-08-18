// ============================================================
// TELAS — cada tela renderiza dentro de #telas
// ============================================================
const el = () => document.getElementById('telas');
const carregando = () => { el().innerHTML = '<div class="empty">Carregando...</div>'; };

// ---------- INICIO (painel de controle) ----------
// Botao grande de ligar/desligar + numeros da semana. E a primeira coisa que o
// Gusthavo ve: estado do CBP em um olhar, e acao em um clique.

const ICO_INTERESSE = {
  camarote:    '<path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6"/><path d="M3 18h18M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3"/>',
  lista:       '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  aniversario: '<path d="M4 15v6h16v-6"/><path d="M3 11h18v4H3z"/><path d="M12 7V3M9 5l3-2 3 2"/>',
};

function linhaInteresse(chave, titulo, legenda, valor, maximo){
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return '<div class="interesse">' +
      '<div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">' + ICO_INTERESSE[chave] + '</svg></div>' +
      '<div class="nm"><b>' + titulo + '</b><span>' + legenda + '</span>' +
        '<div class="barra"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="qt">' + valor + '</div>' +
    '</div>';
}

async function telaInicio(){
  carregando();
  try{
    const d = await API.dashboard();
    const m = d.metricas;
    ESTADO_CBP = d.ativo === true;

    const interesses = [
      { k:'camarote',    t:'Camarote',    l:'maior ticket da casa',       v: m.camarote || 0 },
      { k:'lista',       t:'Nome na lista', l:'entrada mais procurada',    v: m.lista || 0 },
      { k:'aniversario', t:'Aniversário', l:'grupos e comemorações',      v: m.aniversario || 0 },
    ].sort((a, b) => b.v - a.v);
    const topo = interesses[0] ? interesses[0].v : 0;

    const flyOk = d.flyers.filter(f => f.ok).length;

    el().innerHTML =
      '<div class="controle">' +
        '<div class="rotulo">Atendimento automático</div>' +
        '<button class="power" id="power" onclick="alternarPower()" aria-label="Ligar ou desligar o CBP"></button>' +
        '<div class="power-estado" id="power-estado"></div>' +
        '<div class="power-dica" id="power-dica"></div>' +
      '</div>' +

      '<div class="sec-title">Últimos 7 dias</div>' +
      '<div class="grid g4">' +
        metric('Clientes atendidos', m.atendimentos, 'na semana') +
        metric('Nomes na lista', m.lista, m.conversao + '% de conversão', m.conversao >= 30) +
        metric('Clientes novos', m.clientesNovos, 'de ' + m.totalClientes + ' na base') +
        metric('Flyers no ar', flyOk + '/' + d.flyers.length, flyOk === d.flyers.length ? 'tudo publicado' : 'faltam alguns', flyOk === d.flyers.length) +
      '</div>' +

      '<div class="sec-title">Maiores interesses</div>' +
      '<div class="card">' +
        interesses.map(i => linhaInteresse(i.k, i.t, i.l, i.v, topo)).join('') +
      '</div>';

    pintarPower();
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar o painel de controle.</div>'; }
}

// Estado e desenho do botao grande
let ESTADO_CBP = false;
const SVG_POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 11-12.77.04"/></svg>';

function pintarPower(){
  const b = document.getElementById('power');
  if (!b) return;
  const est = document.getElementById('power-estado');
  const dica = document.getElementById('power-dica');
  b.className = 'power ' + (ESTADO_CBP ? 'on' : 'off');
  b.innerHTML = SVG_POWER;
  b.disabled = false;
  est.className = 'power-estado ' + (ESTADO_CBP ? 'on' : 'off');
  est.textContent = ESTADO_CBP ? 'CBP ligado' : 'CBP desligado';
  dica.textContent = ESTADO_CBP
    ? 'Respondendo os clientes no WhatsApp automaticamente. Clique para desligar.'
    : 'Nenhum cliente está sendo respondido. Clique para ligar.';
  pintarStatus(ESTADO_CBP);
}

async function alternarPower(){
  const b = document.getElementById('power');
  const novo = !ESTADO_CBP;
  if (b) b.disabled = true;
  try{
    await API.setStatus(novo);
    // Confirma no servidor em vez de confiar no clique — se não gravou, não mente pro usuário.
    const conf = await API.status();
    ESTADO_CBP = conf.ativo === true;
    pintarPower();
    toast(ESTADO_CBP === novo
      ? (ESTADO_CBP ? 'CBP ligado' : 'CBP desligado')
      : 'O servidor não confirmou a mudança', ESTADO_CBP === novo ? '' : 'erro');
  } catch(e){
    if (b) b.disabled = false;
    toast('Erro ao alterar o estado', 'erro');
  }
}

// ---------- FLYERS ----------
let FLYERS_ATUAIS = {};

function cardFlyer(t, url, custom){
  const isVid = url && /\.(mp4|mov|webm)/i.test(url);
  const preview = url
    ? (isVid ? '<div class="none">video no ar</div>' : '<img src="' + esc(url) + '" alt="">')
    : '<div class="none">sem flyer</div>';
  return '<div class="fly">' +
    '<div class="img">' + preview + '</div>' +
    '<div class="bar"><b>' + labelFlyer(t) + '</b><span class="tag ' + (url ? 'ok">no ar' : 'no">falta') + '</span></div>' +
    '<div class="acts">' +
      '<button class="btn sm" onclick="escolherArquivo(\'' + t + '\')">Trocar</button>' +
      (url ? '<button class="btn sm ghost" onclick="apagarFlyer(\'' + t + '\')">Remover</button>' : '') +
    '</div></div>';
}

async function telaFlyers(){
  carregando();
  try{
    const f = await API.flyers();
    FLYERS_ATUAIS = f;
    const custom = Object.keys(f).filter((k) => !FLYERS_FIXOS.includes(k)).sort();
    const grade = (lista, isCustom) => '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">' +
      lista.map((t) => cardFlyer(t, f[t], isCustom)).join('') + '</div>';

    el().innerHTML =
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">' +
        '<button class="btn" onclick="abrirNovoFlyer()">+ Novo flyer</button></div>' +
      grade(FLYERS_FIXOS, false) +
      (custom.length ? '<div class="sec-title">Flyers personalizados</div>' + grade(custom, true) : '') +
      '<div class="sec-title">Envio rápido</div>' +
      '<div class="drop" id="drop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>' +
      '<div class="t">Arraste o flyer aqui</div><div class="s">e escolha a categoria depois</div></div>' +
      '<input type="file" id="file-input" accept="image/*,video/*" style="display:none">';
    ligarDropzone();
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar flyers.</div>'; }
}

// Todas as categorias disponiveis: fixas + extras + personalizadas do Firebase
function todasCategorias(){
  const custom = Object.keys(FLYERS_ATUAIS || {});
  const set = [];
  FLYERS_FIXOS.concat(FLYERS_EXTRAS).concat(custom).forEach((k) => { if (!set.includes(k)) set.push(k); });
  return set;
}
function opcoesCategoria(sel){
  return todasCategorias().map((t) => '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + labelFlyer(t) + '</option>').join('');
}

function escolherArquivo(tipo){
  const inp = document.getElementById('file-input');
  inp.onchange = () => { if (inp.files[0]) enviarFlyer(tipo, inp.files[0]); inp.value = ''; };
  inp.click();
}

async function enviarFlyer(tipo, file){
  toast('Enviando ' + labelFlyer(tipo) + '...');
  try{ await API.subirFlyer(tipo, file); toast('Flyer atualizado'); telaFlyers(); }
  catch(e){ toast('Erro ao enviar', 'erro'); }
}

async function apagarFlyer(tipo){
  if (!confirm('Remover ' + labelFlyer(tipo) + '?')) return;
  try{ await API.apagarFlyer(tipo); toast('Flyer removido'); telaFlyers(); }
  catch(e){ toast('Erro ao remover', 'erro'); }
}

function ligarDropzone(){
  const d = document.getElementById('drop');
  if (!d) return;
  ['dragenter','dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('over'); }));
  d.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) perguntarCategoria(f); });
  d.addEventListener('click', () => {
    const inp = document.getElementById('file-input');
    inp.onchange = () => { if (inp.files[0]) perguntarCategoria(inp.files[0]); inp.value = ''; };
    inp.click();
  });
}

function perguntarCategoria(file){
  abrirModal('<h3>Qual flyer é esse?</h3><p style="font-size:13px;color:var(--text-secondary)">' + esc(file.name) + '</p>' +
    '<label>Categoria</label><select id="cat">' + opcoesCategoria() + '</select>' +
    '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn" onclick="confirmarCategoria()">Enviar</button>' +
    '<button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>');
  window._arquivoPendente = file;
}
function confirmarCategoria(){
  const tipo = document.getElementById('cat').value;
  const f = window._arquivoPendente;
  fecharModal();
  if (f) enviarFlyer(tipo, f);
}

// ---- Novo flyer personalizado (nome livre) ----
function abrirNovoFlyer(){
  abrirModal('<h3>Novo flyer</h3><p style="font-size:13px;color:var(--text-secondary)">Crie uma categoria própria (ex.: video sexta, disparo lista).</p>' +
    '<label>Nome</label><input id="nf-nome" placeholder="Ex: video sexta">' +
    '<label>Arquivo</label><input type="file" id="nf-file" accept="image/*,video/*">' +
    '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn" onclick="salvarNovoFlyer()">Salvar</button>' +
    '<button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>');
}
async function salvarNovoFlyer(){
  const nome = (document.getElementById('nf-nome').value || '').trim().toLowerCase()
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  const file = document.getElementById('nf-file').files[0];
  if (!nome) return toast('Digite um nome', 'erro');
  if (!file) return toast('Escolha um arquivo', 'erro');
  toast('Enviando...');
  try{ await API.subirFlyer(nome, file); fecharModal(); toast('Flyer "' + nome.replace(/_/g,' ') + '" criado'); telaFlyers(); }
  catch(e){ toast('Erro ao criar flyer', 'erro'); }
}

// ---------- CLIENTES ----------
let CLIENTES = [];
async function telaClientes(){
  carregando();
  try{
    const d = await API.clientes();
    CLIENTES = d.clientes || [];
    const r = d.resumo || {};
    el().innerHTML =
      '<div class="grid g4" style="margin-bottom:18px">' +
        metric('Total', r.total || 0, 'na base') +
        metric('Ativos', r.ativos || 0, 'falaram recente') +
        metric('Sumidos', r.sumidos || 0, 'reativar') +
        metric('Na lista', r.convertidos || 0, 'convertidos') +
      '</div>' +
      '<div class="filters">' +
        '<input id="busca" placeholder="Buscar por nome ou telefone..." oninput="renderClientes()">' +
        '<select id="f-status" onchange="renderClientes()"><option value="">Todos os status</option><option value="novo">Novos</option><option value="recorrente">Recorrentes</option><option value="sumido">Sumidos</option></select>' +
        '<select id="f-int" onchange="renderClientes()"><option value="">Todos interesses</option><option value="lista">Lista</option><option value="camarote">Camarote</option><option value="aniversario">Aniversário</option><option value="conv">Só convertidos</option></select>' +
        '<button class="btn ghost" onclick="sincronizarNomes()">Sincronizar nomes</button>' +
      '</div><div id="lista-cli"></div>';
    renderClientes();
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar clientes.</div>'; }
}

function renderClientes(){
  const b = (document.getElementById('busca').value || '').toLowerCase().trim();
  const fs = document.getElementById('f-status').value;
  const fi = document.getElementById('f-int').value;
  const arr = CLIENTES.filter(c => {
    if (b && !((c.nome || '').toLowerCase().includes(b) || c.telefone.includes(b))) return false;
    if (fs && c.status !== fs) return false;
    if (fi === 'conv' && !c.converteu) return false;
    if (fi && fi !== 'conv' && !(c.interesse && c.interesse[fi])) return false;
    return true;
  });
  const box = document.getElementById('lista-cli');
  if (!arr.length) { box.innerHTML = '<div class="empty">Nenhum cliente encontrado.</div>'; return; }
  box.innerHTML = arr.map(c => {
    const tags = [];
    if (c.interesse && c.interesse.lista) tags.push('<span>Lista</span>');
    if (c.interesse && c.interesse.camarote) tags.push('<span>Camarote</span>');
    if (c.interesse && c.interesse.aniversario) tags.push('<span>Aniversário</span>');
    if (c.converteu) tags.push('<span style="border-color:var(--success);color:var(--text-success)">Na lista</span>');
    return '<div class="cli">' +
      '<div><div class="nm">' + esc(c.nome || 'Sem nome') + '</div><div class="ph">' + esc(c.telefone) + '</div></div>' +
      '<div><span class="badge ' + c.status + '">' + c.status + '</span></div>' +
      '<div class="ph">' + quando(c.ultimaInteracaoMs) + '<br>' + c.totalMensagens + ' msgs</div>' +
      '<div class="tags">' + (tags.join('') || '<span style="border:none;color:var(--text-muted)">—</span>') + '</div>' +
      '<button class="btn ghost sm" onclick="verCliente(\'' + c.telefone + '\')">Ver</button></div>';
  }).join('');
}

async function verCliente(tel){
  const c = CLIENTES.find(x => x.telefone === tel);
  if (!c) return;
  window._cliAtual = tel;
  abrirModal('<h3>' + esc(c.nome || 'Sem nome') + '</h3><p style="font-size:12.5px;color:var(--text-secondary)">' + esc(tel) + '</p>' +
    '<label>Nome</label><input id="c-nome" value="' + esc(c.nome) + '">' +
    '<label>Status</label><select id="c-status"><option value="">Automático</option><option value="novo">Novo</option><option value="recorrente">Recorrente</option><option value="sumido">Sumido</option></select>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-top:14px;text-transform:none;font-size:13.5px;color:var(--text-primary)"><input type="checkbox" id="c-conv" style="width:auto" ' + (c.converteu ? 'checked' : '') + '> Colocou o nome na lista</label>' +
    '<label>Nota</label><textarea id="c-nota" rows="3">' + esc(c.nota) + '</textarea>' +
    '<label>Conversa</label><div class="chat" id="c-chat">Carregando...</div>' +
    '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn" onclick="salvarCliente()">Salvar</button>' +
    '<button class="btn ghost" onclick="fecharModal()">Fechar</button></div>');
  document.getElementById('c-status').value = c.statusManual || '';
  try{
    const d = await API.conversa(tel);
    const msgs = d.mensagens || [];
    document.getElementById('c-chat').innerHTML = msgs.length
      ? msgs.map(m => '<div class="msg ' + (m.role === 'user' ? 'user' : 'assistant') + '"><span class="who">' +
          (m.role === 'user' ? 'Cliente' : 'CBP') + '</span><span class="tx">' + esc(m.content) + '</span></div>').join('')
      : '<div class="empty">Sem conversa registrada.</div>';
  } catch(e){ document.getElementById('c-chat').innerHTML = '<div class="empty">Erro ao carregar.</div>'; }
}

async function salvarCliente(){
  const tel = window._cliAtual;
  if (!tel) return;
  try{
    await API.salvarCliente(tel, {
      nome: document.getElementById('c-nome').value.trim(),
      nota: document.getElementById('c-nota').value.trim(),
      statusManual: document.getElementById('c-status').value,
      converteu: document.getElementById('c-conv').checked,
    });
    toast('Cliente salvo'); fecharModal(); telaClientes();
  } catch(e){ toast('Erro ao salvar', 'erro'); }
}

async function sincronizarNomes(){
  toast('Sincronizando nomes...');
  try{
    const d = await API.sincronizarNomes();
    let m = (d.atualizados || 0) + ' de ' + (d.tentados || 0) + ' nomes encontrados';
    if (d.ocultos) m += ' · ' + d.ocultos + ' com número oculto';
    toast(m); telaClientes();
  } catch(e){ toast('Erro ao sincronizar', 'erro'); }
}
