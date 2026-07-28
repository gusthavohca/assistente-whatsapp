// ============================================================
// API — comunicacao com o backend
// ============================================================
let TOKEN = localStorage.getItem('cbp_token') || '';

async function api(rota, opcoes) {
  const o = opcoes || {};
  const headers = Object.assign({ Authorization: TOKEN }, o.headers || {});
  if (o.body && !(o.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch('/painel/api' + rota, {
    method: o.method || 'GET',
    headers,
    body: o.body instanceof FormData ? o.body : (o.body ? JSON.stringify(o.body) : undefined),
  });
  if (res.status === 401) { sair(); throw new Error('Sessao expirada'); }
  if (!res.ok) throw new Error('Erro ' + res.status);
  return res.json();
}

const API = {
  login:      (senha) => fetch('/painel/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ senha }) }),
  dashboard:  ()      => api('/dashboard'),
  pendencias: ()      => api('/pendencias'),
  status:     ()      => api('/status'),
  setStatus:  (ativo) => api('/status', { method:'POST', body:{ ativo } }),
  flyers:     ()      => api('/flyers'),
  subirFlyer: (tipo, file) => { const fd = new FormData(); fd.append('imagem', file); return api('/flyer/' + tipo, { method:'POST', body: fd }); },
  apagarFlyer:(tipo)  => api('/flyer/' + tipo, { method:'DELETE' }),
  clientes:   ()      => api('/clientes'),
  conversa:   (tel)   => api('/clientes/' + encodeURIComponent(tel) + '/conversa'),
  salvarCliente:(tel,d)=> api('/clientes/' + encodeURIComponent(tel), { method:'POST', body: d }),
  sincronizarNomes: () => api('/clientes/sincronizar-nomes', { method:'POST' }),
  calendario: ()      => api('/calendario'),
  salvarEvento:(dia,descricao) => api('/calendario', { method:'POST', body:{ dia, descricao } }),
  apagarEvento:(dia)  => api('/calendario/' + encodeURIComponent(dia), { method:'DELETE' }),
  links:      ()      => api('/links'),
  salvarLink: (data,atracao,url) => api('/links', { method:'POST', body:{ data, atracao, url } }),
  apagarLink: (id)    => api('/links/' + encodeURIComponent(id), { method:'DELETE' }),
  disparos:   ()      => api('/disparos'),
  salvarDisparos:(d)  => api('/disparos', { method:'POST', body: d }),
  testarDisparo:(comMencao) => api('/disparos/testar', { method:'POST', body:{ comMencao } }),
  perguntas:  ()      => api('/perguntas'),
  apagarPergunta:(id) => api('/perguntas/' + encodeURIComponent(id), { method:'DELETE' }),
  relatorio:  ()      => api('/relatorio'),
};
