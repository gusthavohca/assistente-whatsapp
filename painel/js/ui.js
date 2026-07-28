// ============================================================
// UI — helpers visuais
// ============================================================
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, tipo){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = tipo === 'erro' ? 'var(--danger)' : 'var(--text-primary)';
  t.style.color = tipo === 'erro' ? '#fff' : 'var(--surface-2)';
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 2600);
}

function abrirModal(html){
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modal-bg').classList.add('on');
}
function fecharModal(){ document.getElementById('modal-bg').classList.remove('on'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
document.addEventListener('click', (e) => { if (e.target.id === 'modal-bg') fecharModal(); });

function quando(ms){
  if (!ms) return 'sem data';
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d <= 0) {
    const h = Math.floor((Date.now() - ms) / 3600000);
    if (h <= 0) { const m = Math.max(1, Math.floor((Date.now() - ms) / 60000)); return 'há ' + m + ' min'; }
    return 'há ' + h + 'h';
  }
  if (d === 1) return 'ontem';
  return 'há ' + d + ' dias';
}

const LABEL_FLYER = {
  programacao_sexta:'Programação sexta', programacao_sabado:'Programação sábado',
  entrada_sexta:'Entrada sexta', entrada_sabado:'Entrada sábado',
  camarote_sexta:'Camarote sexta', camarote_sabado:'Camarote sábado',
  aniversario_sexta:'Aniversário sexta', aniversario_sabado:'Aniversário sábado',
};

function metric(label, valor, hint, up){
  return '<div class="metric"><div class="l">' + label + '</div><div class="v">' + valor +
         '</div><div class="h' + (up ? ' up' : '') + '">' + (hint || '') + '</div></div>';
}
