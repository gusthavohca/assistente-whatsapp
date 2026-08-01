// ============================================================
// TELA 3 — Situações (CRM ativo: etiquetas por conversa + mensagem automática)
// ============================================================

let SITUACOES_ATUAIS = [];

async function telaSituacoes(){
  carregando();
  try{
    const d = await API.situacoes();
    SITUACOES_ATUAIS = d.situacoes || [];
    el().innerHTML =
      '<div class="card" style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">' +
        'O CBP classifica a conversa sozinho (sem depender de check-in/comanda) e marca a situação do cliente. ' +
        'Toda <b>segunda-feira às 10h</b>, cada situação ativa manda a mensagem configurada pros clientes marcados — ' +
        'até 3 tentativas, respeitando um intervalo mínimo, e nunca pra quem já converteu.' +
        '</div></div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">' +
        '<button class="btn" onclick="abrirNovaSituacao()">+ Nova situação</button></div>' +
      (SITUACOES_ATUAIS.length
        ? SITUACOES_ATUAIS.map(cardSituacao).join('')
        : '<div class="empty">Nenhuma situação cadastrada ainda.</div>');
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar situações.</div>'; }
}

function cardSituacao(s){
  return '<div class="card" style="margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
      '<div>' +
        '<h3 style="margin-bottom:2px">' + esc(s.rotulo || s.chave) +
          '<span class="tag ' + (s.ativo === false ? 'no">pausada' : 'ok">ativa') + '" style="margin-left:8px"></span></h3>' +
        '<div style="font-size:12px;color:var(--text-muted)">chave: ' + esc(s.chave) + ' · ' + (s.totalClientes || 0) + ' cliente(s) marcado(s)</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0">' +
        "<button class=\"btn ghost sm\" onclick=\"verClientesSituacao('" + esc(s.chave) + "')\">Ver clientes</button>" +
        "<button class=\"btn ghost sm\" onclick=\"editarSituacao('" + esc(s.chave) + "')\">Editar</button>" +
        "<button class=\"btn ghost sm\" onclick=\"apagarSituacao('" + esc(s.chave) + "')\">Excluir</button>" +
      '</div>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:13px;color:var(--text-secondary)"><b>Quando marcar (a IA lê isso):</b> ' + esc(s.descricaoIA || '') + '</div>' +
    '<div style="margin-top:6px;font-size:13px;color:var(--text-primary);white-space:pre-wrap">' + esc(s.mensagem || '') + '</div>' +
  '</div>';
}

function formSituacao(s){
  s = s || {};
  return '<h3>' + (s.chave ? 'Editar situação' : 'Nova situação') + '</h3>' +
    '<label>Chave (sem espaço, usada internamente)</label>' +
    '<input id="sit-chave" placeholder="ex: nome_na_lista" value="' + esc(s.chave || '') + '" ' + (s.chave ? 'disabled' : '') + '>' +
    '<label>Rótulo (nome que você vê)</label>' +
    '<input id="sit-rotulo" placeholder="ex: Nome na lista" value="' + esc(s.rotulo || '') + '">' +
    '<label>Quando a IA deve marcar (descrição em texto livre)</label>' +
    '<textarea id="sit-descricao" rows="2" placeholder="ex: cliente pediu pra colocar o nome na lista em algum momento da conversa">' + esc(s.descricaoIA || '') + '</textarea>' +
    '<label>Mensagem automática (enviada toda segunda às 10h)</label>' +
    '<textarea id="sit-mensagem" rows="4" placeholder="Texto que o cliente vai receber">' + esc(s.mensagem || '') + '</textarea>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;text-transform:none;font-size:13.5px;color:var(--text-primary)">' +
      '<input type="checkbox" id="sit-ativo" style="width:auto" ' + (s.ativo === false ? '' : 'checked') + '> Situação ativa (envia automaticamente)</label>' +
    '<div style="display:flex;gap:10px;margin-top:18px">' +
      '<button class="btn" onclick="salvarSituacaoForm()">Salvar</button>' +
      '<button class="btn ghost" onclick="fecharModal()">Cancelar</button>' +
    '</div>';
}

function abrirNovaSituacao(){ abrirModal(formSituacao()); }
function editarSituacao(chave){
  const s = SITUACOES_ATUAIS.find(x => x.chave === chave);
  if (!s) return;
  abrirModal(formSituacao(s));
}

async function salvarSituacaoForm(){
  const chave = document.getElementById('sit-chave').value.trim();
  const rotulo = document.getElementById('sit-rotulo').value.trim();
  const descricaoIA = document.getElementById('sit-descricao').value.trim();
  const mensagem = document.getElementById('sit-mensagem').value.trim();
  const ativo = document.getElementById('sit-ativo').checked;
  if (!chave || !rotulo || !mensagem) return toast('Preencha chave, rótulo e mensagem', 'erro');
  try{
    await API.salvarSituacao({ chave, rotulo, descricaoIA, mensagem, ativo });
    fecharModal(); toast('Situação salva'); telaSituacoes();
  } catch(e){ toast('Erro ao salvar', 'erro'); }
}

async function apagarSituacao(chave){
  if (!confirm('Excluir a situação "' + chave + '"? Os clientes já marcados perdem essa etiqueta.')) return;
  try{ await API.apagarSituacao(chave); toast('Situação removida'); telaSituacoes(); }
  catch(e){ toast('Erro ao remover', 'erro'); }
}

async function verClientesSituacao(chave){
  abrirModal('<h3>Carregando...</h3>');
  try{
    const d = await API.clientesDaSituacao(chave);
    const cs = d.clientes || [];
    abrirModal(
      '<h3>Clientes — ' + esc(chave) + '</h3>' +
      '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:10px">' + cs.length + ' cliente(s) marcado(s)</div>' +
      (cs.length ? cs.map(c =>
        '<div class="row"><div><div class="t">' + esc(c.nome || c.telefone) + '</div>' +
        '<div class="s">' + esc(c.telefone) + ' · ' + c.tentativas + ' tentativa(s)' + (c.converteu ? ' · já converteu' : '') + '</div></div></div>'
      ).join('') : '<div class="empty">Ninguém marcado ainda.</div>') +
      '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn ghost" onclick="fecharModal()">Fechar</button></div>'
    );
  } catch(e){ abrirModal('<h3>Erro</h3><p>Não deu pra carregar os clientes.</p><button class="btn ghost" onclick="fecharModal()">Fechar</button>'); }
}
