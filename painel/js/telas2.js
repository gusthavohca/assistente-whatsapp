// ============================================================
// TELAS 2 — agenda, links, disparos, perguntas
// ============================================================

// ---------- AGENDA ----------
async function telaAgenda(){
  carregando();
  try{
    const d = await API.calendario();
    const ev = d.eventos || [];
    el().innerHTML =
      '<div class="card"><h3>Adicionar data</h3>' +
      '<div class="field-row"><input id="a-dia" placeholder="DD/MM" maxlength="5"><input id="a-desc" placeholder="Ex: Cat Dealers">' +
      '<button class="btn" onclick="addEvento()">Adicionar</button></div></div>' +
      '<div class="sec-title">Programação cadastrada</div><div class="card">' +
      (ev.length ? ev.map(e =>
        '<div class="row"><div><div class="t">' + esc(e.dia || e.data || '') + '</div><div class="s">' + esc(e.descricao || '') + '</div></div>' +
        '<button class="btn ghost sm" onclick="delEvento(\'' + esc(e.dia || e.data) + '\')">Remover</button></div>').join('')
        : '<div class="empty">Nenhuma data cadastrada.</div>') + '</div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar agenda.</div>'; }
}
async function addEvento(){
  const dia = document.getElementById('a-dia').value.trim();
  const desc = document.getElementById('a-desc').value.trim();
  if (!dia || !desc) return toast('Preencha data e descrição', 'erro');
  try{ await API.salvarEvento(dia, desc); toast('Data adicionada'); telaAgenda(); }
  catch(e){ toast('Erro ao salvar', 'erro'); }
}
async function delEvento(dia){
  if (!confirm('Remover ' + dia + '?')) return;
  try{ await API.apagarEvento(dia); toast('Removido'); telaAgenda(); }
  catch(e){ toast('Erro', 'erro'); }
}

// ---------- LINKS ----------
async function telaLinks(){
  carregando();
  try{
    const d = await API.links();
    const ev = d.eventos || [];
    el().innerHTML =
      '<div class="card"><h3>Novo link do Sympla</h3>' +
      '<div class="field-row"><input id="l-data" placeholder="DD/MM"><input id="l-atr" placeholder="Atração"><input id="l-url" placeholder="https://sympla..."></div>' +
      '<button class="btn" style="margin-top:12px" onclick="addLink()">Adicionar</button></div>' +
      '<div class="sec-title">Links cadastrados</div><div class="card">' +
      (ev.length ? ev.map(e =>
        '<div class="row"><div><div class="t">' + esc(e.data) + ' — ' + esc(e.atracao) + '</div>' +
        '<div class="s" style="word-break:break-all">' + esc(e.url) + '</div></div>' +
        '<button class="btn ghost sm" onclick="delLink(\'' + esc(e.id) + '\')">Remover</button></div>').join('')
        : '<div class="empty">Nenhum link cadastrado.</div>') + '</div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar links.</div>'; }
}
async function addLink(){
  const data = document.getElementById('l-data').value.trim();
  const atr = document.getElementById('l-atr').value.trim();
  const url = document.getElementById('l-url').value.trim();
  if (!data || !atr || !url) return toast('Preencha tudo', 'erro');
  try{ await API.salvarLink(data, atr, url); toast('Link adicionado'); telaLinks(); }
  catch(e){ toast('Erro ao salvar', 'erro'); }
}
async function delLink(id){
  if (!confirm('Remover esse link?')) return;
  try{ await API.apagarLink(id); toast('Removido'); telaLinks(); }
  catch(e){ toast('Erro', 'erro'); }
}

// ---------- DISPAROS ----------
const DIAS_D = [['segunda','Segunda'],['terca','Terça'],['quarta','Quarta'],['quinta','Quinta'],['sexta','Sexta'],['sabado','Sábado']];
let CFG_DISP = null;

async function telaDisparos(){
  carregando();
  try{
    CFG_DISP = await API.disparos();
    const g = CFG_DISP.grupos || [];
    el().innerHTML =
      '<div class="card"><h3>Configuração</h3>' +
        '<label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13.5px;color:var(--text-primary)"><input type="checkbox" id="d-ativo" style="width:auto" ' + (CFG_DISP.ativo ? 'checked' : '') + '> Disparos ativados</label>' +
        '<label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13.5px;color:var(--text-primary)"><input type="checkbox" id="d-men" style="width:auto" ' + (CFG_DISP.mencionarTodos ? 'checked' : '') + '> Mencionar todos (@todos)</label>' +
        '<label>Grupos (IDs @g.us)</label>' +
        '<input id="d-g1" placeholder="Grupo 1" value="' + esc(g[0] || '') + '" style="margin-bottom:8px">' +
        '<input id="d-g2" placeholder="Grupo 2" value="' + esc(g[1] || '') + '" style="margin-bottom:8px">' +
        '<input id="d-g3" placeholder="Grupo 3" value="' + esc(g[2] || '') + '">' +
        '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="salvarDisparos()">Salvar</button>' +
          '<button class="btn ghost" onclick="testarDisparo(false)">Testar sem @todos</button>' +
          '<button class="btn ghost" onclick="testarDisparo(true)">Testar com @todos</button>' +
        '</div></div>' +
      '<div class="sec-title">Horários por dia</div>' +
      '<div class="card"><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.9">' +
        'Seg 14h · 16h · 18h<br>Ter–Qua 11h · 18h<br>Qui 11h · 19h<br>Sex 12h · 17h · 21h<br>Sáb 12h · 18h · 21h' +
        '<br><br>Os disparos saem no minuto :07. Mensagens por horário são configuradas no Firebase.</div></div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar disparos.</div>'; }
}
async function salvarDisparos(){
  const grupos = ['d-g1','d-g2','d-g3'].map(i => document.getElementById(i).value.trim()).filter(Boolean);
  try{
    await API.salvarDisparos({
      ativo: document.getElementById('d-ativo').checked,
      mencionarTodos: document.getElementById('d-men').checked,
      grupos,
      dias: CFG_DISP.dias || {},
    });
    toast('Disparos salvos');
  } catch(e){ toast('Erro ao salvar', 'erro'); }
}
async function testarDisparo(comMencao){
  toast('Enviando teste...');
  try{ const r = await API.testarDisparo(comMencao); toast(r.ok ? 'Teste enviado' : (r.erro || 'Falhou'), r.ok ? '' : 'erro'); }
  catch(e){ toast('Erro no teste', 'erro'); }
}

// ---------- PERGUNTAS ----------
async function telaPerguntas(){
  carregando();
  try{
    const d = await API.perguntas();
    const p = d.perguntas || [];
    el().innerHTML = '<div class="card"><h3>Perguntas sem resposta</h3>' +
      '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:10px">O que o CBP não soube responder. Revise e ensine a ele.</div>' +
      (p.length ? p.map(x =>
        '<div class="row"><div><div class="t">' + esc(x.pergunta || '') + '</div><div class="s">' + esc(x.telefone || '') + '</div></div>' +
        '<button class="btn ghost sm" onclick="delPergunta(\'' + esc(x.id) + '\')">Resolvida</button></div>').join('')
        : '<div class="empty">Nenhuma pendência. Ótimo.</div>') + '</div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar.</div>'; }
}
async function delPergunta(id){
  try{ await API.apagarPergunta(id); toast('Marcada como resolvida'); telaPerguntas(); }
  catch(e){ toast('Erro', 'erro'); }
}
