// ============================================================
// TELAS — cada tela renderiza dentro de #telas
// ============================================================
const el = () => document.getElementById('telas');
const carregando = () => { el().innerHTML = '<div class="empty">Carregando...</div>'; };

// ---------- INICIO (dashboard) ----------
async function telaInicio(){
  carregando();
  try{
    const [d, p] = await Promise.all([API.dashboard(), API.pendencias()]);
    const m = d.metricas;
    atualizarSino(p.total);

    const pend = p.pendencias.length
      ? p.pendencias.map(x =>
          '<div class="row"><div><div class="t">' + esc(x.nome || x.telefone) + '</div><div class="s">' +
          esc((x.pergunta || '').slice(0, 70)) + '</div></div><div class="m">' + quando(x.criadoEm) + '</div></div>'
        ).join('')
      : '<div class="empty">Ninguém esperando. Tudo em dia.</div>';

    const flyOk = d.flyers.filter(f => f.ok).length;
    const flyLista = d.flyers.map(f =>
      '<div class="row"><div class="t" style="font-size:12.5px;color:var(--text-secondary)">' + LABEL_FLYER[f.tipo] +
      '</div><span class="tag ' + (f.ok ? 'ok">no ar' : 'no">falta') + '</span></div>').join('');

    el().innerHTML =
      '<div class="grid g4">' +
        metric('Atendimentos', m.atendimentos, 'últimos 7 dias') +
        metric('Nomes na lista', m.lista, m.conversao + '% de conversão', m.conversao >= 30) +
        metric('Camarotes', m.camarote, 'maior ticket') +
        metric('Clientes novos', m.clientesNovos, 'de ' + m.totalClientes + ' no total') +
      '</div>' +
      '<div class="sec-title">Precisam de você</div>' +
      '<div class="card" style="' + (p.total ? 'border-color:var(--danger)' : '') + '">' + pend + '</div>' +
      '<div class="sec-title">Flyers</div>' +
      '<div class="grid g2">' +
        '<div class="card"><h3>' + flyOk + ' de ' + d.flyers.length + ' no ar</h3>' + flyLista + '</div>' +
        '<div class="card" style="display:flex;flex-direction:column;justify-content:center;gap:10px">' +
          '<div style="font-size:13px;color:var(--text-secondary)">Suba ou troque os flyers da semana.</div>' +
          '<button class="btn" onclick="irPara(\'flyers\')">Gerenciar flyers</button>' +
        '</div>' +
      '</div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar o início.</div>'; }
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
