// ============================================================
// TELA 4 — Config (preços, mínimos e regras que o cérebro usa)
// ============================================================
// Antes esses valores eram fixos no código do cérebro; agora dá pra editar
// aqui. Campo vazio = mantém o valor padrão do código (não obriga preencher
// tudo de uma vez).

async function telaConfig(){
  carregando();
  try{
    const d = await API.config();
    const c = d.config || {};
    el().innerHTML =
      '<div class="card" style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">' +
        'Esses valores são o que o CBP usa pra responder sobre preços, mínimos e regras. ' +
        'Deixe um campo em branco pra manter o padrão atual — não precisa preencher tudo.' +
        '</div></div>' +
      '<div class="card">' +
        '<label>Horário de abertura</label>' +
        '<input id="cfg-abertura" placeholder="ex: 22h30" value="' + esc(c.abertura || '') + '">' +

        '<label>Instagram</label>' +
        '<input id="cfg-instagram" placeholder="ex: @leclubsp" value="' + esc(c.instagram || '') + '">' +

        '<label>Contato direto (WhatsApp de encaminhamento)</label>' +
        '<input id="cfg-contatoDireto" placeholder="ex: +55 11 98944-8989" value="' + esc(c.contatoDireto || '') + '">' +

        '<label>Desconto do ingresso antecipado</label>' +
        '<input id="cfg-descontoAntecipado" placeholder="ex: 10%" value="' + esc(c.descontoAntecipado || '') + '">' +

        '<label>Valor de aniversário — homem (consumação)</label>' +
        '<input id="cfg-aniversarioHomem" placeholder="ex: R$120" value="' + esc(c.aniversarioHomem || '') + '">' +

        '<label>Valor de aniversário — mulher (consumação)</label>' +
        '<input id="cfg-aniversarioMulher" placeholder="ex: R$80" value="' + esc(c.aniversarioMulher || '') + '">' +

        '<label>Horário limite da cortesia de aniversário</label>' +
        '<input id="cfg-aniversarioLimiteHora" placeholder="ex: 00h" value="' + esc(c.aniversarioLimiteHora || '') + '">' +

        '<label>Mínimo de convidados pra cortesia de aniversário valer</label>' +
        '<input id="cfg-aniversarioMinConvidados" type="number" placeholder="ex: 3" value="' + esc(c.aniversarioMinConvidados != null ? c.aniversarioMinConvidados : '') + '">' +

        '<label>A partir de quantos convidados oferecer camarote no aniversário</label>' +
        '<input id="cfg-aniversarioGrupoGrande" type="number" placeholder="ex: 15" value="' + esc(c.aniversarioGrupoGrande != null ? c.aniversarioGrupoGrande : '') + '">' +

        '<label>Mínimo de pessoas pro camarote privativo</label>' +
        '<input id="cfg-camaroteMinPessoas" type="number" placeholder="ex: 6" value="' + esc(c.camaroteMinPessoas != null ? c.camaroteMinPessoas : '') + '">' +

        '<label>A partir de quantas pessoas sugerir camarote ativamente</label>' +
        '<input id="cfg-camaroteSugerirAPartirDe" type="number" placeholder="ex: 8" value="' + esc(c.camaroteSugerirAPartirDe != null ? c.camaroteSugerirAPartirDe : '') + '">' +

        '<label>Máximo de pessoas por sofá</label>' +
        '<input id="cfg-sofaMaxPessoas" type="number" placeholder="ex: 6" value="' + esc(c.sofaMaxPessoas != null ? c.sofaMaxPessoas : '') + '">' +

        '<div style="display:flex;gap:10px;margin-top:18px">' +
          '<button class="btn" onclick="salvarConfigForm()">Salvar</button>' +
        '</div>' +
      '</div>';
  } catch(e){ el().innerHTML = '<div class="empty">Erro ao carregar configuração.</div>'; }
}

async function salvarConfigForm(){
  const campo = (id) => document.getElementById(id).value.trim();
  const dados = {
    abertura: campo('cfg-abertura'),
    instagram: campo('cfg-instagram'),
    contatoDireto: campo('cfg-contatoDireto'),
    descontoAntecipado: campo('cfg-descontoAntecipado'),
    aniversarioHomem: campo('cfg-aniversarioHomem'),
    aniversarioMulher: campo('cfg-aniversarioMulher'),
    aniversarioLimiteHora: campo('cfg-aniversarioLimiteHora'),
    aniversarioMinConvidados: campo('cfg-aniversarioMinConvidados'),
    aniversarioGrupoGrande: campo('cfg-aniversarioGrupoGrande'),
    camaroteMinPessoas: campo('cfg-camaroteMinPessoas'),
    camaroteSugerirAPartirDe: campo('cfg-camaroteSugerirAPartirDe'),
    sofaMaxPessoas: campo('cfg-sofaMaxPessoas'),
  };
  try{
    await API.salvarConfig(dados);
    toast('Configuração salva');
    telaConfig();
  } catch(e){ toast('Erro ao salvar', 'erro'); }
}
