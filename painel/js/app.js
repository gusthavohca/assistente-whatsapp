// ============================================================
// APP — navegação, login, status, notificações
// ============================================================
const TELAS = {
  inicio:    { t:'Início',    f: telaInicio },
  flyers:    { t:'Flyers',    f: telaFlyers },
  clientes:  { t:'Clientes',  f: telaClientes },
  agenda:    { t:'Agenda',    f: telaAgenda },
  links:     { t:'Links',     f: telaLinks },
  disparos:  { t:'Disparos',  f: telaDisparos },
  perguntas: { t:'Perguntas', f: telaPerguntas },
};

function irPara(nome){
  const tela = TELAS[nome];
  if (!tela) return;
  document.querySelectorAll('.nav[data-tela]').forEach(b => b.classList.toggle('on', b.dataset.tela === nome));
  document.getElementById('titulo').textContent = tela.t;
  fecharMenu();
  tela.f();
}

function abrirMenu(){ document.getElementById('side').classList.add('open'); document.getElementById('scrim').classList.add('on'); }
function fecharMenu(){ document.getElementById('side').classList.remove('open'); document.getElementById('scrim').classList.remove('on'); }

// ---------- LOGIN ----------
async function fazerLogin(){
  const senha = document.getElementById('senha').value;
  const erro = document.getElementById('login-erro');
  try{
    const res = await API.login(senha);
    if (!res.ok) { erro.textContent = 'Senha incorreta'; erro.style.display = 'block'; return; }
    const d = await res.json();
    TOKEN = d.token;
    localStorage.setItem('cbp_token', TOKEN);
    abrirPainel();
  } catch(e){ erro.textContent = 'Erro ao entrar'; erro.style.display = 'block'; }
}

function sair(){
  localStorage.removeItem('cbp_token');
  TOKEN = '';
  location.reload();
}

function abrirPainel(){
  document.getElementById('login').classList.add('hide');
  document.getElementById('app').classList.remove('hide');
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('subtitulo').textContent = hoje.charAt(0).toUpperCase() + hoje.slice(1);
  carregarStatus();
  irPara('inicio');
  iniciarVigia();
}

// ---------- STATUS ----------
async function carregarStatus(){
  try{
    const d = await API.status();
    pintarStatus(d.ativo);
  } catch(e){}
}
function pintarStatus(ativo){
  const b = document.getElementById('status');
  b.className = 'pill ' + (ativo ? 'on' : 'off');
  b.querySelector('span').textContent = ativo ? 'CBP ativo' : 'CBP pausado';
  b.dataset.ativo = ativo ? '1' : '0';
}
async function alternarCbp(){
  const b = document.getElementById('status');
  const novo = b.dataset.ativo !== '1';
  try{ await API.setStatus(novo); pintarStatus(novo); toast(novo ? 'CBP ativado' : 'CBP pausado'); }
  catch(e){ toast('Erro ao alterar', 'erro'); }
}

// ---------- SINO / NOTIFICACOES ----------
let ULTIMO_TOTAL = 0;
function atualizarSino(n){
  const b = document.getElementById('bell-n');
  b.textContent = n;
  b.classList.toggle('hide', !n);
  if (n > ULTIMO_TOTAL && ULTIMO_TOTAL !== 0) notificar(n);
  ULTIMO_TOTAL = n;
}
function notificar(n){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try{ new Notification('CBP — cliente esperando', { body: n + ' cliente(s) precisam da sua resposta.', icon:'/painel/icons/icon-192.png', tag:'cbp-pendencia' }); }
  catch(e){}
}
function iniciarVigia(){
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  setInterval(async () => {
    try{ const p = await API.pendencias(); atualizarSino(p.total); } catch(e){}
  }, 60000);
}

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/painel/sw.js').catch(() => {}));
}

// ---------- BOOT ----------
if (TOKEN) {
  API.status().then(() => abrirPainel()).catch(() => { localStorage.removeItem('cbp_token'); TOKEN = ''; });
}
