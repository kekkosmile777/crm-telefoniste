/* ============ CRM TELEFONISTE - app frontend ============ */
'use strict';

let TOKEN = localStorage.getItem('crm_token') || null;
let USER = null;
let CURRENT_VIEW = null;
let HEARTBEAT_TIMER = null;
let REFRESH_TIMER = null;

const ESITI_LABEL = {
  da_chiamare: 'Da chiamare', in_chiamata: 'In chiamata', appuntamento_fissato: 'Appuntamento fissato',
  richiamo: 'Richiamo', non_interessato: 'Non interessato', non_risponde: 'Non risponde',
  segreteria: 'Segreteria', occupato: 'Occupato', numero_errato: 'Numero errato',
  gia_fatto: 'Già fatto', blacklist: 'Black list', irraggiungibile: 'Irraggiungibile', fuori_zona: 'Fuori zona'
};
const ESITI_COLOR = {
  appuntamento_fissato: 'green', richiamo: 'orange', non_interessato: 'red', blacklist: 'red',
  numero_errato: 'red', da_chiamare: 'gray', in_chiamata: 'orange'
};
const ESITI_CHIAMATA = ['appuntamento_fissato','richiamo','non_interessato','non_risponde','segreteria','occupato','numero_errato','gia_fatto','blacklist','irraggiungibile','fuori_zona'];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag = (e) => `<span class="tag ${ESITI_COLOR[e] || ''}">${esc(ESITI_LABEL[e] || e || '—')}</span>`;
const fmtDur = s => { s = s || 0; const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; };
const fmtDT = d => d ? new Date(d.replace(' ', 'T')).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = d => d ? new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—';
const nomeCompleto = c => `${c.nome || ''} ${c.cognome || ''}`.trim();

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { logout(false); throw new Error('Sessione scaduta'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore server');
  return data;
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

function openModal(title, bodyHtml) {
  $('#modal-title').innerHTML = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
window.closeModal = closeModal;

/* ---------- auth ---------- */
async function boot() {
  if (!TOKEN) return showLogin();
  try {
    USER = await api('/me');
    showApp();
  } catch { showLogin(); }
}

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function logout(callApi = true) {
  TOKEN = null; USER = null;
  localStorage.removeItem('crm_token');
  clearInterval(HEARTBEAT_TIMER); clearInterval(REFRESH_TIMER);
  showLogin();
}
$('#logout-btn').onclick = () => logout();

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  $('#login-error').classList.add('hidden');
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Errore');
    TOKEN = data.token; USER = data.user;
    localStorage.setItem('crm_token', TOKEN);
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').classList.remove('hidden');
  }
};

/* ---------- shell ---------- */
const NAV_ADMIN = [
  { sect: 'Principale' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'monitor', icon: '📡', label: 'Monitor live' },
  { id: 'campagne', icon: '🚀', label: 'Campagne' },
  { id: 'registro', icon: '📞', label: 'Registro chiamate' },
  { id: 'telefono', icon: '🔢', label: 'Telefono' },
  { sect: 'Gestione' },
  { id: 'contatti', icon: '👤', label: 'Contatti' },
  { id: 'richiami', icon: '🔄', label: 'Richiami' },
  { id: 'appuntamenti', icon: '📅', label: 'Appuntamenti' },
  { id: 'report', icon: '📈', label: 'Report' },
  { sect: 'Amministrazione' },
  { id: 'operatrici', icon: '👥', label: 'Utenti' },
  { id: 'agenti', icon: '🧑‍💼', label: 'Agenti' },
  { id: 'impostazioni', icon: '⚙️', label: 'Impostazioni' },
];
const NAV_OP = [
  { sect: 'Lavoro' },
  { id: 'postazione', icon: '☎️', label: 'Postazione' },
  { id: 'campagne-op', icon: '🚀', label: 'Campagne' },
  { id: 'telefono', icon: '🔢', label: 'Telefono' },
  { id: 'richiami-op', icon: '🔄', label: 'I miei richiami' },
  { id: 'chiamate-op', icon: '📞', label: 'Le mie chiamate' },
  { id: 'appuntamenti-op', icon: '📅', label: 'I miei appuntamenti' },
  { sect: 'Gestione' },
  { id: 'contatti', icon: '👤', label: 'Contatti' },
];

const FEATURES_ADMIN = [
  ['dashboard', 'Dashboard'], ['monitor', 'Monitor live'], ['campagne', 'Campagne'], ['registro', 'Registro chiamate'],
  ['telefono', 'Telefono'], ['contatti', 'Contatti'], ['richiami', 'Richiami'], ['appuntamenti', 'Appuntamenti'],
  ['report', 'Report'], ['operatrici', 'Utenti'], ['agenti', 'Agenti'], ['impostazioni', 'Impostazioni']
];
const FEATURES_OP = [
  ['postazione', 'Postazione'], ['campagne-op', 'Campagne'], ['telefono', 'Telefono'],
  ['richiami-op', 'I miei richiami'], ['chiamate-op', 'Le mie chiamate'], ['appuntamenti-op', 'I miei appuntamenti'], ['contatti', 'Contatti']
];
function hasPerm(id) { return !USER?.permessi || USER.permessi.includes(id); }

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-name').textContent = USER.nome;
  $('#user-role').textContent = USER.ruolo === 'admin' ? 'Admin' : 'Operatrice';
  const items = (USER.ruolo === 'admin' ? NAV_ADMIN : NAV_OP).filter(n => n.sect || hasPerm(n.id));
  const cleaned = items.filter((n, i) => !n.sect || (items[i + 1] && !items[i + 1].sect));
  $('#nav').innerHTML = cleaned.map(n => n.sect
    ? `<div class="nav-section">${n.sect}</div>`
    : `<a href="#" data-view="${n.id}">${n.icon} <span class="txt">${n.label}</span></a>`).join('');
  $('#nav').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.view); });
  if (USER.ruolo === 'operatore') startHeartbeat();
  const first = cleaned.find(n => !n.sect);
  if (first) go(first.id);
  else $('#view').innerHTML = '<p class="muted" style="padding:30px">Nessuna funzione abilitata per il tuo utente: contatta l\'amministratore.</p>';
}

function go(view) {
  if (!hasPerm(view)) { toast('Funzione non abilitata per il tuo utente', true); return; }
  CURRENT_VIEW = view;
  clearInterval(REFRESH_TIMER);
  $('#nav').querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  const fn = VIEWS[view];
  if (fn) fn();
}

/* ================================================================
   VISTE ADMIN
================================================================ */
async function viewDashboard() {
  const d = await api('/admin/dashboard');
  $('#view').innerHTML = `
    <h2 class="page-title">Dashboard <em>Operativa</em></h2>
    <div class="cards-row">
      <div class="stat-card"><div class="num">${d.chiamateOggi}</div><div class="lbl">Chiamate oggi</div></div>
      <div class="stat-card"><div class="num">${d.operatoriOnline}</div><div class="lbl">Operatrici online</div></div>
      <div class="stat-card"><div class="num">${d.appOggi}</div><div class="lbl">Appuntamenti oggi</div></div>
      <div class="stat-card"><div class="num">${d.appDomani}</div><div class="lbl">Appuntamenti domani</div></div>
      <div class="stat-card"><div class="num" style="color:${d.richiamiScaduti > 0 ? 'var(--red)' : 'inherit'}">${d.richiamiScaduti}</div><div class="lbl">Richiami scaduti</div></div>
    </div>
    <div class="card">
      <b>Campagne attive</b>
      <div style="margin-top:10px">${d.campagneAttive.length ? d.campagneAttive.map(c => `<span class="tag green">${esc(c.nome)}</span> `).join('') : '<span class="muted">Nessuna campagna attiva</span>'}</div>
    </div>
    <div class="card">
      <b>Ultime chiamate</b>
      <div class="table-wrap" style="margin-top:10px"><table>
        <tr><th>Quando</th><th>Contatto</th><th>Operatrice</th><th>Durata</th><th>Esito</th></tr>
        ${d.ultimeChiamate.map(c => `<tr><td>${fmtDT(c.started_at)}</td><td>${esc(c.contatto)}</td><td>${esc(c.operatore)}</td><td>${fmtDur(c.durata)}</td><td>${tag(c.esito)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessuna chiamata</td></tr>'}
      </table></div>
    </div>`;
  REFRESH_TIMER = setInterval(() => { if (CURRENT_VIEW === 'dashboard') viewDashboard(); }, 15000);
}

/* ---------- MONITOR ---------- */
async function viewMonitor() {
  const rows = await api('/admin/monitor');
  $('#view').innerHTML = `
    <h2 class="page-title">Monitor <em>Live</em></h2>
    <div class="monitor-grid">
      ${rows.map(o => {
        const inCall = o.stato === 'in_chiamata';
        const stato = !o.online ? '<span class="dot off"></span>Offline'
          : inCall ? '<span class="dot call"></span>In chiamata'
          : o.stato === 'in_esito' ? '<span class="dot on"></span>Compila esito'
          : '<span class="dot on"></span>Disponibile';
        return `<div class="op-card ${inCall ? 'oncall' : ''}">
          <b>${esc(o.nome)}</b>
          <div style="margin:8px 0">${stato}</div>
          ${o.contact ? `<div class="muted">📞 ${esc(o.contact.nome || '')} — ${esc(o.contact.telefono || '')}</div>` : ''}
          ${o.since && o.online ? `<div class="muted" style="font-size:12px">da ${fmtDT(o.since)}</div>` : ''}
          <div style="margin-top:8px; font-size:13px">Oggi: <b>${o.chiamate_oggi}</b> chiamate · ${o.minuti_oggi} min</div>
        </div>`;
      }).join('') || '<p class="muted">Nessuna operatrice registrata.</p>'}
    </div>`;
  REFRESH_TIMER = setInterval(() => { if (CURRENT_VIEW === 'monitor') viewMonitor(); }, 8000);
}

/* ---------- CAMPAGNE ---------- */
async function viewCampagne() {
  const rows = await api('/admin/campaigns');
  const stTag = s => ({ bozza: 'gray', attiva: 'green', in_pausa: 'orange', completata: '', archiviata: 'gray' }[s] || '');
  $('#view').innerHTML = `
    <h2 class="page-title">Gestione <em>Campagne</em></h2>
    <div class="toolbar">
      <button class="btn primary" id="btn-new-camp">+ Nuova campagna</button>
    </div>
    <div class="table-wrap"><table>
      <tr><th>Nome</th><th>Stato</th><th>Tipo</th><th>Tot</th><th>Fatti</th><th>Da fare</th><th>App.</th><th>Creata</th><th>Azioni</th></tr>
      ${rows.map(c => `<tr>
        <td><b>${esc(c.nome)}</b><br><span class="muted" style="font-size:12px">${esc(c.descrizione || '')}</span></td>
        <td><span class="tag ${stTag(c.stato)}">${esc(c.stato.replace('_', ' '))}</span></td>
        <td>${{manuale:'Manuale',predictive:'\u26A1 Predictive',geo:'\uD83D\uDCCD Geo ' + (c.raggio_km||25) + 'km'}[c.tipo] || 'Manuale'}<br><span class="muted" style="font-size:11px">${c.modalita === 'coda' ? 'coda automatica' : 'liste assegnate'}</span></td>
        <td>${c.tot}</td><td>${c.fatti}</td><td>${c.da_fare}</td><td>${c.appuntamenti}</td>
        <td>${fmtDT(c.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="btn" data-open="${c.id}">👥 Contatti</button>
          <button class="btn" data-map="${c.id}" title="Mappa contatti da chiamare">🗺</button>
          <button class="btn" data-edit="${c.id}">✏️</button>
          ${c.stato === 'attiva'
            ? `<button class="btn" data-stato="${c.id}|in_pausa">⏸</button>`
            : c.stato !== 'archiviata' ? `<button class="btn success" data-stato="${c.id}|attiva">▶</button>` : ''}
          <button class="btn danger" data-del="${c.id}">🗑</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted">Nessuna campagna</td></tr>'}
    </table></div>`;

  $('#btn-new-camp').onclick = () => campaignForm();
  $('#view').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => campaignForm(rows.find(c => c.id == b.dataset.edit)));
  $('#view').querySelectorAll('[data-open]').forEach(b => b.onclick = () => campaignContacts(rows.find(c => c.id == b.dataset.open)));
  $('#view').querySelectorAll('[data-map]').forEach(b => b.onclick = () => {
    const c = rows.find(x => x.id == b.dataset.map);
    openMapAdmin(c.id, c.nome);
  });
  $('#view').querySelectorAll('[data-stato]').forEach(b => b.onclick = async () => {
    const [id, stato] = b.dataset.stato.split('|');
    await api(`/admin/campaigns/${id}`, { method: 'PUT', body: { stato } });
    toast(stato === 'attiva' ? 'Campagna avviata' : 'Campagna in pausa'); viewCampagne();
  });
  $('#view').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare la campagna? I contatti NON verranno eliminati.')) return;
    await api(`/admin/campaigns/${b.dataset.del}`, { method: 'DELETE' });
    toast('Campagna eliminata'); viewCampagne();
  });
}

function campaignForm(c = null) {
  openModal(c ? 'Modifica campagna' : 'Nuova campagna', `
    <label>Nome *</label><input id="cf-nome" style="width:100%" value="${esc(c?.nome || '')}">
    <label>Descrizione</label><textarea id="cf-desc">${esc(c?.descrizione || '')}</textarea>
    <label>Note operative (visibili alle operatrici)</label><textarea id="cf-note">${esc(c?.note || '')}</textarea>
    <div class="form-grid">
      <div class="full"><label>Tipo di campagna</label>
        <select id="cf-tipo" style="width:100%">
          <option value="manuale" ${!c || c.tipo === 'manuale' ? 'selected' : ''}>Manuale — l'operatrice avvia ogni chiamata</option>
          <option value="predictive" ${c?.tipo === 'predictive' ? 'selected' : ''}>Predictive — dopo l'esito parte subito la chiamata successiva</option>
          <option value="geo" ${c?.tipo === 'geo' ? 'selected' : ''}>Geolocalizzata — mappa e coda per vicinanza</option>
        </select></div>
      <div id="cf-raggio-wrap" class="${c?.tipo === 'geo' ? '' : 'hidden'}"><label>Raggio zona (km)</label><input id="cf-raggio" type="number" min="1" max="200" style="width:100%" value="${c?.raggio_km || 25}"></div>
      <div><label>Modalità distribuzione</label>
        <select id="cf-mod" style="width:100%">
          <option value="coda" ${c?.modalita !== 'assegnata' ? 'selected' : ''}>Coda automatica</option>
          <option value="assegnata" ${c?.modalita === 'assegnata' ? 'selected' : ''}>Liste assegnate dall'admin</option>
        </select></div>
      <div><label>Max tentativi (non risponde/occupato)</label><input id="cf-max" type="number" min="1" max="10" style="width:100%" value="${c?.max_tentativi || 3}"></div>
      <div><label>Obiettivo appuntamenti (0 = illimitato)</label><input id="cf-ob" type="number" min="0" style="width:100%" value="${c?.obiettivo_app || 0}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="cf-save">💾 Salva</button>
    </div>`);
  $('#cf-tipo').onchange = () => $('#cf-raggio-wrap').classList.toggle('hidden', $('#cf-tipo').value !== 'geo');
  $('#cf-save').onclick = async () => {
    const body = { nome: $('#cf-nome').value.trim(), descrizione: $('#cf-desc').value, note: $('#cf-note').value, modalita: $('#cf-mod').value, max_tentativi: $('#cf-max').value, obiettivo_app: $('#cf-ob').value, tipo: $('#cf-tipo').value, raggio_km: $('#cf-raggio').value };
    if (!body.nome) return toast('Nome obbligatorio', true);
    try {
      if (c) await api(`/admin/campaigns/${c.id}`, { method: 'PUT', body });
      else await api('/admin/campaigns', { method: 'POST', body });
      closeModal(); toast('Campagna salvata'); viewCampagne();
    } catch (e) { toast(e.message, true); }
  };
}

/* Gestione contatti dentro una campagna */
async function campaignContacts(camp, soloNonGeo = false) {
  const [inCampAll, users] = await Promise.all([
    api(`/admin/campaigns/${camp.id}/contacts`),
    api('/admin/users')
  ]);
  const nonGeoCount = inCampAll.filter(r => r.lat == null).length;
  const inCamp = soloNonGeo ? inCampAll.filter(r => r.lat == null) : inCampAll;
  const ops = users.filter(u => u.ruolo === 'operatore' && u.attivo);
  $('#view').innerHTML = `
    <h2 class="page-title">Campagna: <em>${esc(camp.nome)}</em></h2>
    <div class="toolbar">
      <button class="btn" id="back-camp">← Campagne</button>
      <button class="btn primary" id="btn-add-cc">➕ Aggiungi contatti</button>
      <span class="muted">${inCamp.length} contatti · <b>${camp.modalita === 'coda' ? 'coda automatica' : 'liste assegnate'}</b></span>
      <button class="btn ${soloNonGeo ? 'danger' : ''}" id="btn-nongeo">⚠ Non geolocalizzati (${nonGeoCount})${soloNonGeo ? ' ✕' : ''}</button>
      <span class="spacer"></span>
      <span id="cc-selinfo" class="muted">0 selezionati</span>
      ${camp.modalita === 'assegnata' ? `
        <select id="cc-assign-user"><option value="">— assegna a —</option>${ops.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select>
        <button class="btn" id="btn-assign">Assegna</button>` : ''}
      <button class="btn primary" id="btn-bulk-edit">✏️ Modifica selezionati</button>
      <button class="btn" id="btn-requeue">↩ Rimetti in coda</button>
      <button class="btn danger" id="btn-remove-cc">➖ Rimuovi</button>
    </div>
    <div class="table-wrap"><table>
      <tr><th class="checkbox-cell"><input type="checkbox" id="cc-all"></th><th>Nome</th><th>Telefono</th><th>Comune</th><th>Prov</th><th>CAP</th><th>Posizione</th><th>Stato coda</th><th>Esito</th><th>Tent.</th><th>Assegnato a</th></tr>
      ${inCamp.map(r => `<tr>
        <td><input type="checkbox" class="cc-check" value="${r.id}"></td>
        <td>${esc(nomeCompleto(r))}</td><td>${esc(r.telefono)}</td><td>${esc(r.comune || '')}</td>
        <td>${esc(r.provincia || '')}</td><td>${esc(r.cap || '')}</td>
        <td>${r.lat != null ? '<span class="tag green">✓</span>' : '<span class="tag red">⚠ no geo</span>'}</td>
        <td><span class="tag ${r.cc_stato === 'da_chiamare' ? 'gray' : r.cc_stato === 'lavorato' ? 'green' : 'orange'}">${r.cc_stato.replace('_', ' ')}</span></td>
        <td>${r.cc_esito ? tag(r.cc_esito) : '—'}</td><td>${r.tentativi}</td>
        <td>${esc(r.assegnato_a || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="11" class="muted">Nessun contatto</td></tr>'}
    </table></div>`;

  const selected = () => [...$('#view').querySelectorAll('.cc-check:checked')].map(c => parseInt(c.value));
  const updateSel = () => $('#cc-selinfo').textContent = `${selected().length} selezionati`;
  $('#view').querySelectorAll('.cc-check').forEach(c => c.onchange = updateSel);
  $('#cc-all').onchange = e => { $('#view').querySelectorAll('.cc-check').forEach(c => c.checked = e.target.checked); updateSel(); };
  $('#back-camp').onclick = () => viewCampagne();
  $('#btn-nongeo').onclick = () => campaignContacts(camp, !soloNonGeo);
  $('#btn-bulk-edit').onclick = () => {
    const ids = selected(); if (!ids.length) return toast('Seleziona dei contatti', true);
    openModal(`Modifica ${ids.length} contatti insieme`, `
      <p class="muted">Compila solo i campi da cambiare: verranno applicati a tutti i selezionati e la posizione verrà ricalcolata da comune + provincia + CAP.</p>
      <div class="form-grid">
        <div class="full"><label>Comune</label><input id="be-comune" style="width:100%" placeholder="(invariato)"></div>
        <div><label>Provincia (sigla)</label><input id="be-prov" maxlength="2" style="width:100%" placeholder="(invariata)"></div>
        <div><label>CAP</label><input id="be-cap" maxlength="5" style="width:100%" placeholder="(invariato)"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Annulla</button>
        <button class="btn primary" id="be-save">💾 Applica a ${ids.length} contatti</button>
      </div>`);
    $('#be-save').onclick = async () => {
      const fields = { comune: $('#be-comune').value.trim(), provincia: $('#be-prov').value.trim(), cap: $('#be-cap').value.trim() };
      if (!fields.comune && !fields.provincia && !fields.cap) return toast('Compila almeno un campo', true);
      try {
        const r = await api('/contacts/bulk-update', { method: 'POST', body: { ids, fields } });
        closeModal();
        toast(`${r.aggiornati} aggiornati: ${r.geolocalizzati} geolocalizzati, ${r.non_geolocalizzati} ancora senza posizione`);
        campaignContacts(camp, soloNonGeo);
      } catch (e) { toast(e.message, true); }
    };
  };
  $('#btn-add-cc').onclick = () => addContactsToCampaign(camp);
  $('#btn-remove-cc').onclick = async () => {
    const ids = selected(); if (!ids.length) return toast('Seleziona dei contatti', true);
    await api(`/admin/campaigns/${camp.id}/contacts/remove`, { method: 'POST', body: { contact_ids: ids } });
    toast('Contatti rimossi'); campaignContacts(camp, soloNonGeo);
  };
  $('#btn-requeue').onclick = async () => {
    const ids = selected(); if (!ids.length) return toast('Seleziona dei contatti', true);
    await api(`/admin/campaigns/${camp.id}/requeue`, { method: 'POST', body: { contact_ids: ids } });
    toast('Rimessi in coda'); campaignContacts(camp, soloNonGeo);
  };
  const ba = $('#btn-assign');
  if (ba) ba.onclick = async () => {
    const ids = selected(); if (!ids.length) return toast('Seleziona dei contatti', true);
    const uid = $('#cc-assign-user').value || null;
    await api(`/admin/campaigns/${camp.id}/assign`, { method: 'POST', body: { contact_ids: ids, user_id: uid ? parseInt(uid) : null } });
    toast(uid ? 'Contatti assegnati' : 'Assegnazione rimossa'); campaignContacts(camp, soloNonGeo);
  };
}

async function addContactsToCampaign(camp) {
  const data = await api('/contacts?per=200');
  const comuni = await api('/contacts/comuni');
  openModal(`Aggiungi contatti a "${esc(camp.nome)}"`, `
    <div class="toolbar">
      <input id="ac-search" placeholder="🔍 cerca..." style="flex:1">
      <select id="ac-esito"><option value="">Tutti gli esiti</option>${Object.entries(ESITI_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select id="ac-comune"><option value="">Tutti i comuni</option>${comuni.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="table-wrap" style="max-height:320px"><table id="ac-table"></table></div>
    <div class="modal-actions">
      <button class="btn" id="ac-selall">✓ Seleziona visibili</button>
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="ac-add">➕ Aggiungi selezionati</button>
    </div>`);

  async function render() {
    const q = new URLSearchParams({ search: $('#ac-search').value, esito: $('#ac-esito').value, comune: $('#ac-comune').value, per: 200 });
    const d = await api('/contacts?' + q);
    $('#ac-table').innerHTML = `<tr><th class="checkbox-cell"></th><th>Nome</th><th>Telefono</th><th>Comune</th><th>Esito</th></tr>` +
      d.rows.map(c => `<tr><td><input type="checkbox" class="ac-check" value="${c.id}"></td><td>${esc(nomeCompleto(c))}</td><td>${esc(c.telefono)}</td><td>${esc(c.comune || '')}</td><td>${tag(c.esito)}</td></tr>`).join('');
  }
  ['ac-search', 'ac-esito', 'ac-comune'].forEach(id => $('#' + id).oninput = render);
  $('#ac-selall').onclick = () => $('#ac-table').querySelectorAll('.ac-check').forEach(c => c.checked = true);
  $('#ac-add').onclick = async () => {
    const ids = [...$('#ac-table').querySelectorAll('.ac-check:checked')].map(c => parseInt(c.value));
    if (!ids.length) return toast('Nessun contatto selezionato', true);
    const r = await api(`/admin/campaigns/${camp.id}/contacts`, { method: 'POST', body: { contact_ids: ids } });
    closeModal(); toast(`${r.aggiunti} contatti aggiunti`); campaignContacts(camp);
  };
  render();
}

/* ---------- CONTATTI (admin + operatore) ---------- */
let contactsPage = 1;
async function viewContatti() {
  const isAdmin = USER.ruolo === 'admin';
  $('#view').innerHTML = `
    <h2 class="page-title">Gestione <em>Contatti</em></h2>
    <div class="toolbar">
      <input id="ct-search" placeholder="🔍 nome o telefono..." style="width:220px">
      <select id="ct-esito"><option value="">Tutti gli esiti</option>${Object.entries(ESITI_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select id="ct-comune"><option value="">Tutti i comuni</option></select>
      <span class="spacer"></span>
      ${isAdmin ? `<button class="btn" id="ct-import">⬆ Importa CSV</button>
      <a class="btn" id="ct-export" href="#">⬇ Esporta CSV</a>` : ''}
      <button class="btn primary" id="ct-new">+ Nuovo</button>
    </div>
    <div id="ct-table-wrap"></div>`;

  api('/contacts/comuni').then(cs => $('#ct-comune').innerHTML += cs.map(c => `<option>${esc(c)}</option>`).join(''));

  async function render() {
    const q = new URLSearchParams({ search: $('#ct-search').value, esito: $('#ct-esito').value, comune: $('#ct-comune').value, page: contactsPage, per: 50 });
    const d = await api('/contacts?' + q);
    const pages = Math.max(Math.ceil(d.total / d.per), 1);
    $('#ct-table-wrap').innerHTML = `
      <div class="table-wrap"><table>
        <tr><th>Nome</th><th>Telefono</th><th>Comune</th><th>Offerto da</th><th>Parentela</th><th>Esito</th><th>Azioni</th></tr>
        ${d.rows.map(c => `<tr>
          <td><b>${esc(nomeCompleto(c))}</b></td><td>${esc(c.telefono)}</td><td>${esc(c.comune || '')}</td>
          <td>${esc(c.offerto_da || '')}</td><td>${esc(c.parentela || '')}</td><td>${tag(c.esito)}${c.lat == null ? ' <span class="tag red" title="Non geolocalizzato">⚠</span>' : ''}</td>
          <td style="white-space:nowrap">
            <button class="btn" data-view-ct="${c.id}">👁</button>
            <button class="btn" data-edit-ct="${c.id}">✏️</button>
            ${isAdmin ? `<button class="btn danger" data-del-ct="${c.id}">🗑</button>` : ''}
          </td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nessun contatto</td></tr>'}
      </table></div>
      <div class="pagination">
        <button class="btn" id="pg-prev" ${contactsPage <= 1 ? 'disabled' : ''}>← Prec</button>
        <span>${contactsPage} / ${pages} — ${d.total} contatti</span>
        <button class="btn" id="pg-next" ${contactsPage >= pages ? 'disabled' : ''}>Succ →</button>
      </div>`;
    $('#pg-prev').onclick = () => { contactsPage--; render(); };
    $('#pg-next').onclick = () => { contactsPage++; render(); };
    $('#ct-table-wrap').querySelectorAll('[data-edit-ct]').forEach(b => b.onclick = () => contactForm(d.rows.find(c => c.id == b.dataset.editCt), render));
    $('#ct-table-wrap').querySelectorAll('[data-view-ct]').forEach(b => b.onclick = () => contactDetail(b.dataset.viewCt));
    $('#ct-table-wrap').querySelectorAll('[data-del-ct]').forEach(b => b.onclick = async () => {
      if (!confirm('Eliminare il contatto e tutto il suo storico?')) return;
      await api('/contacts/' + b.dataset.delCt, { method: 'DELETE' }); toast('Contatto eliminato'); render();
    });
  }
  ['ct-search', 'ct-esito', 'ct-comune'].forEach(id => $('#' + id).oninput = () => { contactsPage = 1; render(); });
  $('#ct-new').onclick = () => contactForm(null, render);
  if (isAdmin) {
    $('#ct-import').onclick = () => importCsv(render);
    $('#ct-export').onclick = async e => {
      e.preventDefault();
      const res = await fetch('/api/contacts-export.csv', { headers: { Authorization: 'Bearer ' + TOKEN } });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'contatti.csv'; a.click();
    };
  }
  render();
}

function contactForm(c, onSave) {
  openModal(c ? 'Modifica contatto' : 'Nuovo contatto', `
    <div class="form-grid">
      <div><label>Nome *</label><input id="cf2-nome" style="width:100%" value="${esc(c?.nome || '')}"></div>
      <div><label>Cognome</label><input id="cf2-cognome" style="width:100%" value="${esc(c?.cognome || '')}"></div>
      <div><label>Telefono *</label><input id="cf2-tel" style="width:100%" value="${esc(c?.telefono || '')}"></div>
      <div><label>Comune</label><input id="cf2-comune" style="width:100%" value="${esc(c?.comune || '')}"></div>
      <div><label>Provincia (sigla)</label><input id="cf2-prov" maxlength="2" style="width:100%" value="${esc(c?.provincia || '')}"></div>
      <div><label>CAP</label><input id="cf2-cap" maxlength="5" style="width:100%" value="${esc(c?.cap || '')}"></div>
      <div><label>Offerto da</label><input id="cf2-off" style="width:100%" value="${esc(c?.offerto_da || '')}"></div>
      <div><label>Parentela</label><input id="cf2-par" style="width:100%" value="${esc(c?.parentela || '')}"></div>
      <div class="full"><label>Esito</label>
        <select id="cf2-esito" style="width:100%">${Object.entries(ESITI_LABEL).map(([k, v]) => `<option value="${k}" ${c?.esito === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="full"><label>Note</label><textarea id="cf2-note">${esc(c?.note || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="cf2-save">💾 Salva</button>
    </div>`);
  $('#cf2-save').onclick = async () => {
    const body = { nome: $('#cf2-nome').value.trim(), cognome: $('#cf2-cognome').value.trim(), telefono: $('#cf2-tel').value.trim(), comune: $('#cf2-comune').value.trim(), provincia: $('#cf2-prov').value.trim(), cap: $('#cf2-cap').value.trim(), offerto_da: $('#cf2-off').value.trim(), parentela: $('#cf2-par').value.trim(), esito: $('#cf2-esito').value, note: $('#cf2-note').value };
    if (!body.nome || !body.telefono) return toast('Nome e telefono obbligatori', true);
    try {
      if (c) await api('/contacts/' + c.id, { method: 'PUT', body });
      else await api('/contacts', { method: 'POST', body });
      closeModal(); toast('Contatto salvato'); onSave && onSave();
    } catch (e) { toast(e.message, true); }
  };
}

async function contactDetail(id) {
  const c = await api('/contacts/' + id);
  openModal(esc(nomeCompleto(c)), `
    <p><b>📞 ${esc(c.telefono)}</b> · ${esc(c.comune || '—')} · ${tag(c.esito)}</p>
    <p class="muted">Offerto da: ${esc(c.offerto_da || '—')} · Parentela: ${esc(c.parentela || '—')}</p>
    ${c.note ? `<p style="margin-top:8px">📝 ${esc(c.note)}</p>` : ''}
    <h4 style="margin:14px 0 6px">Storico chiamate</h4>
    <div class="table-wrap" style="max-height:200px"><table>
      ${c.storico_chiamate.map(k => `<tr><td>${fmtDT(k.started_at)}</td><td>${esc(k.operatore)}</td><td>${fmtDur(k.durata)}</td><td>${tag(k.esito)}</td><td>${esc(k.note || '')}</td></tr>`).join('') || '<tr><td class="muted">Nessuna chiamata</td></tr>'}
    </table></div>
    ${c.richiami.length ? `<h4 style="margin:14px 0 6px">Richiami pendenti</h4>${c.richiami.map(r => `<div>🔄 ${fmtDT(r.richiamo_at)} ${esc(r.note || '')}</div>`).join('')}` : ''}
    ${c.appuntamenti.length ? `<h4 style="margin:14px 0 6px">Appuntamenti</h4>${c.appuntamenti.map(a => `<div>📅 ${a.data} ${a.ora || ''} — ${esc(a.indirizzo || '')} (${a.stato})</div>`).join('')}` : ''}
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Chiudi</button></div>`);
}

function parseCsvText(text) {
  const firstLine = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length);
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length && firstLine.includes(';') ? ';' : ',';
  const out = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v.trim() !== '')) out.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some(v => v.trim() !== '')) out.push(row); }
  return out;
}

// sinonimi di intestazione riconosciuti (in ordine di priorita')
const CSV_HEADER_MAP = {
  nome: ['nome', 'nome anagrafica', 'first name', 'name'],
  cognome: ['cognome', 'cognome anagrafica', 'last name'],
  telefono: ['telefono', 'telefono fisso anagrafica', 'cellulare', 'telefono mobile anagrafica', 'altro telefono anagrafica', 'tel', 'phone', 'numero'],
  comune: ['comune', 'comune codice istat anagrafica', 'città', 'citta', 'city'],
  offerto_da: ['offerto_da', 'offerto da'],
  parentela: ['parentela', 'grado parentela'],
  provincia: ['provincia', 'provincia anagrafica', 'prov', 'sigla provincia'],
  cap: ['cap', 'cap anagrafica', 'codice postale', 'postal code']
};

function importCsv(onDone) {
  openModal('Importa contatti CSV', `
    <p class="muted">Riconosco automaticamente separatore (, o ;) e intestazioni come <b>nome, cognome, telefono, comune, offerto_da, parentela</b> — anche nei formati dei gestionali (es. "Nome Anagrafica", "Telefono Fisso Anagrafica", "Cellulare").</p>
    <input type="file" id="csv-file" accept=".csv,text/csv" style="margin:14px 0; width:100%">
    <div id="csv-preview"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="csv-go" disabled>⬆ Importa</button>
    </div>`);
  let rows = [];
  $('#csv-file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const table = parseCsvText(reader.result);
      if (table.length < 2) { $('#csv-preview').innerHTML = '<p class="error">File vuoto o non leggibile.</p>'; return; }
      const head = table[0].map(h => h.trim().toLowerCase());
      // mappa campo -> lista di indici colonna (in ordine di priorita')
      const colIdx = {};
      for (const [field, names] of Object.entries(CSV_HEADER_MAP)) {
        colIdx[field] = [];
        for (const n of names) head.forEach((h, i) => { if (h === n) colIdx[field].push(i); });
      }
      if (!colIdx.telefono.length || (!colIdx.nome.length && !colIdx.cognome.length)) {
        $('#csv-preview').innerHTML = `<p class="error">⚠ Non trovo le colonne nome/telefono. Intestazioni presenti nel file:<br><span class="muted">${head.filter(Boolean).slice(0, 20).map(esc).join(' · ')}...</span></p>`;
        $('#csv-go').disabled = true;
        return;
      }
      const pick = (r, field) => {
        for (const i of colIdx[field]) { const v = (r[i] || '').trim(); if (v) return v; }
        return '';
      };
      rows = [];
      let scartate = 0;
      for (const r of table.slice(1)) {
        const nome = pick(r, 'nome'), cognome = pick(r, 'cognome');
        let tel = pick(r, 'telefono').replace(/[^+0-9]/g, '');
        if (!tel || (!nome && !cognome)) { scartate++; continue; }
        rows.push({ nome: nome || cognome, cognome: nome ? cognome : '', telefono: tel, comune: pick(r, 'comune'), offerto_da: pick(r, 'offerto_da'), parentela: pick(r, 'parentela'), provincia: pick(r, 'provincia'), cap: pick(r, 'cap') });
      }
      $('#csv-preview').innerHTML = `<p><b>${rows.length}</b> contatti pronti${scartate ? ` (<b>${scartate}</b> righe scartate: senza telefono o nome)` : ''}. Anteprima:</p>
        <div class="table-wrap" style="max-height:180px"><table>
        <tr><th>Nome</th><th>Cognome</th><th>Telefono</th><th>Comune</th></tr>
        ${rows.slice(0, 8).map(r => `<tr><td>${esc(r.nome)}</td><td>${esc(r.cognome)}</td><td>${esc(r.telefono)}</td><td>${esc(r.comune)}</td></tr>`).join('')}
        </table></div>`;
      $('#csv-go').disabled = rows.length === 0;
    };
    reader.readAsText(f);
  };
  $('#csv-go').onclick = async () => {
    $('#csv-go').disabled = true;
    const r = await api('/contacts/import', { method: 'POST', body: { rows } });
    closeModal(); toast(`Importati ${r.inseriti} contatti: ${r.geolocalizzati ?? 0} geolocalizzati, ${r.non_geolocalizzati ?? 0} non geolocalizzati (${r.saltati} già presenti o scartati)`); onDone && onDone();
  };
}

/* ---------- REGISTRO CHIAMATE (admin) ---------- */
async function viewRegistro() {
  const [users, camps] = await Promise.all([api('/admin/users'), api('/admin/campaigns')]);
  $('#view').innerHTML = `
    <h2 class="page-title">Registro <em>Chiamate</em></h2>
    <div class="toolbar">
      <select id="rg-esito"><option value="">Tutti gli esiti</option>${ESITI_CHIAMATA.map(k => `<option value="${k}">${ESITI_LABEL[k]}</option>`).join('')}</select>
      <select id="rg-user"><option value="">Tutte le operatrici</option>${users.filter(u => u.ruolo === 'operatore').map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select>
      <select id="rg-camp"><option value="">Tutte le campagne</option>${camps.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select>
      <input type="date" id="rg-from"> <input type="date" id="rg-to">
    </div>
    <div id="rg-table"></div>`;
  async function render() {
    const q = new URLSearchParams({ esito: $('#rg-esito').value, user_id: $('#rg-user').value, campaign_id: $('#rg-camp').value, from: $('#rg-from').value, to: $('#rg-to').value, per: 100 });
    const d = await api('/admin/calls?' + q);
    $('#rg-table').innerHTML = `<p class="muted" style="margin-bottom:8px">${d.total} chiamate</p>
      <div class="table-wrap"><table>
      <tr><th>Data e ora</th><th>Contatto</th><th>Numero</th><th>Operatrice</th><th>Campagna</th><th>Durata</th><th>Esito</th><th>Note</th></tr>
      ${d.rows.map(c => `<tr><td>${fmtDT(c.started_at)}</td><td>${esc((c.contatto_nome || '') + ' ' + (c.contatto_cognome || ''))}</td>
        <td>${esc(c.contatto_telefono)}</td><td>${esc(c.operatore)}</td><td>${esc(c.campagna || '—')}</td>
        <td>${fmtDur(c.durata)}</td><td>${tag(c.esito)}</td><td>${esc(c.note || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nessuna chiamata</td></tr>'}
      </table></div>`;
  }
  ['rg-esito', 'rg-user', 'rg-camp', 'rg-from', 'rg-to'].forEach(id => $('#' + id).onchange = render);
  render();
}

/* ---------- RICHIAMI (admin) ---------- */
async function viewRichiami() {
  const rows = await api('/admin/callbacks');
  const scaduto = r => new Date(r.richiamo_at.replace(' ', 'T')) <= new Date();
  $('#view').innerHTML = `
    <h2 class="page-title">Richiami <em>Programmati</em></h2>
    <div class="table-wrap"><table>
      <tr><th>Presa il</th><th>Da richiamare</th><th>Contatto</th><th>Telefono</th><th>Campagna</th><th>Operatrice</th><th>Note</th><th>Azioni</th></tr>
      ${rows.map(r => `<tr>
        <td>${fmtDT(r.presa_at)}</td>
        <td>${scaduto(r) ? `<span class="tag red">${fmtDT(r.richiamo_at)}</span>` : fmtDT(r.richiamo_at)}</td>
        <td>${esc((r.contatto_nome || '') + ' ' + (r.contatto_cognome || ''))}</td><td>${esc(r.telefono)}</td>
        <td>${esc(r.campagna || '—')}</td><td>${esc(r.operatore || 'chiunque')}</td><td>${esc(r.note || '')}</td>
        <td style="white-space:nowrap">
          <button class="btn" data-edit-cb="${r.id}">✏️</button>
          <button class="btn danger" data-del-cb="${r.id}">🗑</button>
        </td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nessun richiamo pendente</td></tr>'}
    </table></div>`;
  $('#view').querySelectorAll('[data-del-cb]').forEach(b => b.onclick = async () => {
    await api('/admin/callbacks/' + b.dataset.delCb, { method: 'DELETE' }); toast('Richiamo annullato'); viewRichiami();
  });
  $('#view').querySelectorAll('[data-edit-cb]').forEach(b => b.onclick = () => {
    const r = rows.find(x => x.id == b.dataset.editCb);
    const dt = r.richiamo_at.replace(' ', 'T').slice(0, 16);
    openModal('Modifica richiamo', `
      <p><b>${esc((r.contatto_nome || '') + ' ' + (r.contatto_cognome || ''))}</b> — ${esc(r.telefono)}</p>
      <label>Nuova data/ora *</label><input type="datetime-local" id="cb-dt" value="${dt}" style="width:100%">
      <label>Note</label><textarea id="cb-note">${esc(r.note || '')}</textarea>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" id="cb-save">💾 Salva</button></div>`);
    $('#cb-save').onclick = async () => {
      await api('/admin/callbacks/' + r.id, { method: 'PUT', body: { richiamo_at: $('#cb-dt').value.replace('T', ' '), note: $('#cb-note').value } });
      closeModal(); toast('Richiamo aggiornato'); viewRichiami();
    };
  });
}

/* ---------- APPUNTAMENTI (admin: calendario + lista) ---------- */
let calMonth = new Date();
async function viewAppuntamenti() {
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
  const iso = d => d.toISOString().slice(0, 10);
  const [apps, agents] = await Promise.all([
    api(`/admin/appointments?from=${iso(new Date(first - 6 * 864e5))}&to=${iso(new Date(+last + 6 * 864e5))}`),
    api('/admin/agents')
  ]);
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  // celle calendario (lun-dom)
  let start = new Date(first); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells = [];
  for (let i = 0; i < 42; i++) { cells.push(new Date(start)); start.setDate(start.getDate() + 1); }
  const todayIso = iso(new Date());

  $('#view').innerHTML = `
    <h2 class="page-title">Calendario <em>Appuntamenti</em></h2>
    <div class="toolbar">
      <button class="btn" id="cal-prev">← Prec.</button>
      <b style="min-width:150px;text-align:center">${mesi[calMonth.getMonth()]} ${calMonth.getFullYear()}</b>
      <button class="btn" id="cal-next">Succ. →</button>
      <button class="btn" id="cal-today">Oggi</button>
      <span class="spacer"></span>
      <button class="btn primary" id="app-new">+ Nuovo appuntamento</button>
    </div>
    <div class="cal-grid" style="margin-bottom:6px">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d => `<div class="cal-head">${d}</div>`).join('')}</div>
    <div class="cal-grid">
      ${cells.map(d => {
        const dIso = iso(d);
        const dayApps = apps.filter(a => a.data === dIso && a.stato !== 'annullato');
        return `<div class="cal-cell ${dIso === todayIso ? 'today' : ''} ${d.getMonth() !== calMonth.getMonth() ? 'other' : ''}" data-day="${dIso}">
          <div class="day-num">${d.getDate()}</div>
          ${dayApps.slice(0, 3).map(a => `<div class="cal-app">${a.ora || ''} ${esc(a.contatto_nome || '?')}</div>`).join('')}
          ${dayApps.length > 3 ? `<div class="muted">+${dayApps.length - 3}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="card" style="margin-top:16px">
      <b>Prossimi appuntamenti</b>
      <div class="table-wrap" style="margin-top:10px"><table>
        <tr><th>Data</th><th>Ora</th><th>Contatto</th><th>Telefono</th><th>Agente</th><th>Indirizzo</th><th>Presa da</th><th>Stato</th><th></th></tr>
        ${apps.filter(a => a.data >= todayIso).map(a => appRow(a)).join('') || '<tr><td colspan="9" class="muted">Nessun appuntamento</td></tr>'}
      </table></div>
    </div>`;

  function appRow(a) {
    return `<tr><td>${fmtD(a.data)}</td><td>${a.ora || '—'}</td>
      <td>${esc((a.contatto_nome || '') + ' ' + (a.contatto_cognome || '')) || '—'}</td><td>${esc(a.telefono || '')}</td>
      <td>${esc(a.agente || '—')}</td><td>${esc(a.indirizzo || '')}</td><td>${esc(a.operatore || '—')}</td>
      <td><span class="tag ${a.stato === 'confermato' ? 'green' : a.stato === 'annullato' ? 'red' : ''}">${a.stato}</span></td>
      <td style="white-space:nowrap"><button class="btn" data-edit-app="${a.id}">✏️</button> <button class="btn danger" data-del-app="${a.id}">🗑</button></td></tr>`;
  }

  $('#cal-prev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); viewAppuntamenti(); };
  $('#cal-next').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); viewAppuntamenti(); };
  $('#cal-today').onclick = () => { calMonth = new Date(); viewAppuntamenti(); };
  $('#app-new').onclick = () => appointmentForm(null, agents, () => viewAppuntamenti());
  $('#view').querySelectorAll('[data-edit-app]').forEach(b => b.onclick = () => appointmentForm(apps.find(a => a.id == b.dataset.editApp), agents, () => viewAppuntamenti()));
  $('#view').querySelectorAll('[data-del-app]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare appuntamento?')) return;
    await api('/admin/appointments/' + b.dataset.delApp, { method: 'DELETE' }); toast('Eliminato'); viewAppuntamenti();
  });
  $('#view').querySelectorAll('.cal-cell').forEach(c => c.onclick = () => {
    const day = c.dataset.day;
    const dayApps = apps.filter(a => a.data === day);
    openModal('Appuntamenti del ' + fmtD(day), dayApps.length
      ? `<div class="table-wrap"><table>${dayApps.map(a => `<tr><td>${a.ora || '—'}</td><td>${esc(a.contatto_nome || '')}</td><td>${esc(a.indirizzo || '')}</td><td>${esc(a.agente || '—')}</td><td><span class="tag">${a.stato}</span></td></tr>`).join('')}</table></div>`
      : '<p class="muted">Nessun appuntamento in questo giorno.</p>');
  });
}

function appointmentForm(a, agents, onSave) {
  openModal(a ? 'Modifica appuntamento' : 'Nuovo appuntamento', `
    ${a?.contatto_nome ? `<p><b>${esc(a.contatto_nome + ' ' + (a.contatto_cognome || ''))}</b> — ${esc(a.telefono || '')}</p>` : ''}
    <div class="form-grid">
      <div><label>Data *</label><input type="date" id="ap-data" style="width:100%" value="${a?.data || ''}"></div>
      <div><label>Ora</label><input type="time" id="ap-ora" style="width:100%" value="${a?.ora || ''}"></div>
      <div class="full"><label>Indirizzo</label><input id="ap-ind" style="width:100%" value="${esc(a?.indirizzo || '')}"></div>
      <div><label>Agente</label><select id="ap-agente" style="width:100%"><option value="">— Nessuno —</option>${agents.map(g => `<option value="${g.id}" ${a?.agent_id == g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select></div>
      <div><label>Stato</label><select id="ap-stato" style="width:100%">${['confermato','fatto','annullato'].map(s => `<option ${a?.stato === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="full"><label>Note</label><textarea id="ap-note">${esc(a?.note || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="ap-save">💾 Salva</button>
    </div>`);
  $('#ap-save').onclick = async () => {
    const body = { data: $('#ap-data').value, ora: $('#ap-ora').value, indirizzo: $('#ap-ind').value, agent_id: $('#ap-agente').value ? parseInt($('#ap-agente').value) : null, stato: $('#ap-stato').value, note: $('#ap-note').value };
    if (!body.data) return toast('Data obbligatoria', true);
    try {
      if (a) await api('/admin/appointments/' + a.id, { method: 'PUT', body });
      else await api('/admin/appointments', { method: 'POST', body });
      closeModal(); toast('Appuntamento salvato'); onSave && onSave();
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------- REPORT ---------- */
async function viewReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  $('#view').innerHTML = `
    <h2 class="page-title">Report e <em>Statistiche</em></h2>
    <div class="toolbar">
      <label style="margin:0">Dal</label><input type="date" id="rp-from" value="${monthAgo}">
      <label style="margin:0">Al</label><input type="date" id="rp-to" value="${today}">
    </div>
    <div id="rp-body"></div>`;
  async function render() {
    const d = await api(`/admin/reports/summary?from=${$('#rp-from').value}&to=${$('#rp-to').value}`);
    const conv = d.totali.chiamate ? (100 * d.totali.appuntamenti / d.totali.chiamate).toFixed(1) : 0;
    const maxG = Math.max(...d.perGiorno.map(g => g.chiamate), 1);
    const maxE = Math.max(...d.perEsito.map(e => e.n), 1);
    $('#rp-body').innerHTML = `
      <div class="cards-row">
        <div class="stat-card"><div class="num">${d.totali.chiamate}</div><div class="lbl">Chiamate totali</div></div>
        <div class="stat-card"><div class="num">${d.totali.appuntamenti || 0}</div><div class="lbl">Appuntamenti presi</div></div>
        <div class="stat-card"><div class="num">${conv}%</div><div class="lbl">Conversione</div></div>
        <div class="stat-card"><div class="num">${fmtDur(Math.round(d.totali.avg_sec))}</div><div class="lbl">Durata media</div></div>
        <div class="stat-card"><div class="num">${Math.round(d.totali.sec / 3600 * 10) / 10}h</div><div class="lbl">Ore al telefono</div></div>
      </div>
      <div class="card"><b>Andamento giornaliero</b><div style="margin-top:12px">
        ${d.perGiorno.map(g => `<div class="bar-row"><div class="bar-label">${fmtD(g.giorno)}</div><div class="bar" style="width:${(g.chiamate / maxG * 100).toFixed(0)}%"></div><div class="bar-val">${g.chiamate} (${g.appuntamenti} app.)</div></div>`).join('') || '<span class="muted">Nessun dato</span>'}
      </div></div>
      <div class="card"><b>Esiti</b><div style="margin-top:12px">
        ${d.perEsito.map(e => `<div class="bar-row"><div class="bar-label">${ESITI_LABEL[e.esito] || e.esito}</div><div class="bar ${e.esito === 'appuntamento_fissato' ? 'g' : ''}" style="width:${(e.n / maxE * 100).toFixed(0)}%"></div><div class="bar-val">${e.n}</div></div>`).join('') || '<span class="muted">Nessun dato</span>'}
      </div></div>
      <div class="card"><b>Per operatrice</b>
        <div class="table-wrap" style="margin-top:10px"><table>
          <tr><th>Operatrice</th><th>Chiamate</th><th>Ore</th><th>Appuntamenti</th><th>Richiami</th><th>Non interessati</th><th>Conversione</th></tr>
          ${d.perOperatore.map(o => `<tr><td>${esc(o.nome)}</td><td>${o.chiamate}</td><td>${Math.round((o.sec || 0) / 3600 * 10) / 10}</td><td>${o.appuntamenti}</td><td>${o.richiami}</td><td>${o.non_interessati}</td><td>${o.chiamate ? (100 * o.appuntamenti / o.chiamate).toFixed(1) : 0}%</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nessun dato</td></tr>'}
        </table></div></div>
      <div class="card"><b>Per campagna</b>
        <div class="table-wrap" style="margin-top:10px"><table>
          <tr><th>Campagna</th><th>Chiamate</th><th>Appuntamenti</th><th>Conversione</th></tr>
          ${d.perCampagna.map(c => `<tr><td>${esc(c.campagna)}</td><td>${c.chiamate}</td><td>${c.appuntamenti}</td><td>${c.chiamate ? (100 * c.appuntamenti / c.chiamate).toFixed(1) : 0}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nessun dato</td></tr>'}
        </table></div></div>`;
  }
  ['rp-from', 'rp-to'].forEach(id => $('#' + id).onchange = render);
  render();
}

/* ---------- UTENTI ---------- */
async function viewOperatrici() {
  const rows = await api('/admin/users');
  $('#view').innerHTML = `
    <h2 class="page-title">Gestione <em>Utenti</em></h2>
    <div class="toolbar"><button class="btn primary" id="u-new">+ Nuovo utente</button></div>
    <div class="table-wrap"><table>
      <tr><th>Nome</th><th>Username</th><th>Ruolo</th><th>Funzioni</th><th>Stato</th><th>Creato</th><th>Azioni</th></tr>
      ${rows.map(u => `<tr>
        <td><b>${esc(u.nome)}</b></td><td>${esc(u.username)}</td>
        <td><span class="tag ${u.ruolo === 'admin' ? '' : 'green'}">${u.ruolo === 'admin' ? 'Admin' : 'Operatrice'}</span></td>
        <td>${u.permessi ? `<span class="tag orange">${u.permessi.length} abilitate</span>` : '<span class="tag green">tutte</span>'}</td>
        <td>${u.attivo ? '<span class="tag green">attivo</span>' : '<span class="tag red">disattivato</span>'}</td>
        <td>${fmtDT(u.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="btn" data-edit-u="${u.id}">✏️</button>
          ${u.id !== USER.id ? `<button class="btn ${u.attivo ? 'danger' : 'success'}" data-tog-u="${u.id}|${u.attivo ? 0 : 1}">${u.attivo ? 'Disattiva' : 'Riattiva'}</button>` : ''}
        </td></tr>`).join('')}
    </table></div>`;
  $('#u-new').onclick = () => userForm(null);
  $('#view').querySelectorAll('[data-edit-u]').forEach(b => b.onclick = () => userForm(rows.find(u => u.id == b.dataset.editU)));
  $('#view').querySelectorAll('[data-tog-u]').forEach(b => b.onclick = async () => {
    const [id, attivo] = b.dataset.togU.split('|');
    await api('/admin/users/' + id, { method: 'PUT', body: { attivo: parseInt(attivo) } });
    toast('Utente aggiornato'); viewOperatrici();
  });
}

function userForm(u) {
  openModal(u ? 'Modifica utente' : 'Nuovo utente', `
    <div class="form-grid">
      <div><label>Nome e cognome *</label><input id="uf-nome" style="width:100%" value="${esc(u?.nome || '')}"></div>
      <div><label>Username *</label><input id="uf-user" style="width:100%" value="${esc(u?.username || '')}" ${u ? 'disabled' : ''}></div>
      <div><label>${u ? 'Nuova password (vuoto = invariata)' : 'Password *'}</label><input id="uf-pass" type="password" style="width:100%"></div>
      <div><label>Ruolo</label><select id="uf-ruolo" style="width:100%">
        <option value="operatore" ${u?.ruolo !== 'admin' ? 'selected' : ''}>Operatrice</option>
        <option value="admin" ${u?.ruolo === 'admin' ? 'selected' : ''}>Amministratore</option>
      </select></div>
    </div>
    <label style="margin-top:14px">Funzioni abilitate</label>
    <div class="toolbar" style="margin-bottom:6px">
      <button class="btn" id="uf-all" type="button">✓ Tutte</button>
      <button class="btn" id="uf-none" type="button">✗ Nessuna</button>
    </div>
    <div id="uf-perms" class="perms-grid"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="uf-save">💾 Salva</button>
    </div>`);

  const isSelf = u && u.id === USER.id;
  function renderPerms() {
    const ruolo = $('#uf-ruolo').value;
    const feats = ruolo === 'admin' ? FEATURES_ADMIN : FEATURES_OP;
    const cur = (u && u.ruolo === ruolo) ? u.permessi : null;
    $('#uf-perms').innerHTML = feats.map(([k, lbl]) => {
      const lock = isSelf && ruolo === 'admin' && k === 'operatrici';
      return `<label class="perm-item">
        <input type="checkbox" class="uf-perm" value="${k}" ${!cur || cur.includes(k) ? 'checked' : ''} ${lock ? 'disabled checked' : ''}> ${lbl}${lock ? ' 🔒' : ''}
      </label>`;
    }).join('');
  }
  $('#uf-ruolo').onchange = renderPerms;
  $('#uf-all').onclick = () => $('#uf-perms').querySelectorAll('.uf-perm:not(:disabled)').forEach(c => c.checked = true);
  $('#uf-none').onclick = () => $('#uf-perms').querySelectorAll('.uf-perm:not(:disabled)').forEach(c => c.checked = false);
  renderPerms();

  $('#uf-save').onclick = async () => {
    const permessi = [...$('#uf-perms').querySelectorAll('.uf-perm:checked')].map(c => c.value);
    if (isSelf && $('#uf-ruolo').value === 'admin' && !permessi.includes('operatrici')) permessi.push('operatrici');
    if (!permessi.length) return toast('Abilita almeno una funzione', true);
    try {
      if (u) {
        const body = { nome: $('#uf-nome').value, ruolo: $('#uf-ruolo').value, permessi };
        if ($('#uf-pass').value) body.password = $('#uf-pass').value;
        await api('/admin/users/' + u.id, { method: 'PUT', body });
        if (isSelf) { USER.permessi = permessi; }
      } else {
        await api('/admin/users', { method: 'POST', body: { nome: $('#uf-nome').value, username: $('#uf-user').value, password: $('#uf-pass').value, ruolo: $('#uf-ruolo').value, permessi } });
      }
      closeModal(); toast('Utente salvato'); viewOperatrici();
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------- AGENTI ---------- */
async function viewAgenti() {
  const rows = await api('/admin/agents');
  $('#view').innerHTML = `
    <h2 class="page-title">Agenti sul <em>territorio</em></h2>
    <div class="toolbar"><button class="btn primary" id="ag-new">+ Nuovo agente</button></div>
    <div class="table-wrap"><table>
      <tr><th>Nome</th><th>Telefono</th><th>Zone</th><th>Stato</th><th>Azioni</th></tr>
      ${rows.map(a => `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(a.telefono || '')}</td><td>${esc(a.zone || '')}</td>
        <td>${a.attivo ? '<span class="tag green">attivo</span>' : '<span class="tag gray">non attivo</span>'}</td>
        <td style="white-space:nowrap"><button class="btn" data-edit-ag="${a.id}">✏️</button> <button class="btn danger" data-del-ag="${a.id}">🗑</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessun agente</td></tr>'}
    </table></div>`;
  $('#ag-new').onclick = () => agentForm(null);
  $('#view').querySelectorAll('[data-edit-ag]').forEach(b => b.onclick = () => agentForm(rows.find(a => a.id == b.dataset.editAg)));
  $('#view').querySelectorAll('[data-del-ag]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare agente?')) return;
    await api('/admin/agents/' + b.dataset.delAg, { method: 'DELETE' }); toast('Agente eliminato'); viewAgenti();
  });
}

function agentForm(a) {
  openModal(a ? 'Modifica agente' : 'Nuovo agente', `
    <label>Nome e cognome *</label><input id="agf-nome" style="width:100%" value="${esc(a?.nome || '')}">
    <label>Telefono</label><input id="agf-tel" style="width:100%" value="${esc(a?.telefono || '')}">
    <label>Zone di competenza</label><input id="agf-zone" style="width:100%" value="${esc(a?.zone || '')}">
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Annulla</button>
      <button class="btn primary" id="agf-save">💾 Salva</button>
    </div>`);
  $('#agf-save').onclick = async () => {
    const body = { nome: $('#agf-nome').value.trim(), telefono: $('#agf-tel').value, zone: $('#agf-zone').value };
    if (!body.nome) return toast('Nome obbligatorio', true);
    if (a) await api('/admin/agents/' + a.id, { method: 'PUT', body });
    else await api('/admin/agents', { method: 'POST', body });
    closeModal(); toast('Agente salvato'); viewAgenti();
  };
}

/* ---------- IMPOSTAZIONI ---------- */
async function viewImpostazioni() {
  const [s, tw] = await Promise.all([api('/admin/settings'), api('/twilio/config')]);
  $('#view').innerHTML = `
    <h2 class="page-title">Impostazioni <em>Sistema</em></h2>
    <div class="card">
      <b>☎️ Telefonia (Twilio)</b>
      <p style="margin-top:8px">${tw.twilio_ok
        ? (tw.configured
          ? `<span class="tag green">softphone attivo</span> Numero in uscita: <b>${esc(tw.caller_id)}</b>`
          : `<span class="tag orange">quasi pronto</span> Twilio è collegato: <b>seleziona il numero in uscita</b> qui sotto per attivare il softphone.`)
        : `<span class="tag red">non configurato</span> Il CRM funziona in <b>modalità manuale</b>. Imposta le variabili d'ambiente <code>TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID</code> e riavvia.`}</p>
      ${tw.twilio_ok ? `
      <label>📞 Numero in uscita (caller ID)</label>
      <div class="toolbar" style="margin-bottom:0">
        <select id="set-callerid" style="min-width:260px"><option value="">— Nessuno (softphone disattivo) —</option></select>
        <button class="btn primary" id="set-callerid-save">💾 Imposta numero</button>
      </div>` : ''}
    </div>
    <div class="card">
      <b>📝 Note e promemoria</b>
      <textarea id="set-note" style="margin-top:10px; min-height:120px">${esc(s.note || '')}</textarea>
      <div style="margin-top:10px"><button class="btn primary" id="set-save">💾 Salva</button></div>
    </div>
    <div class="card">
      <b>🔒 Sicurezza</b>
      <p class="muted" style="margin-top:8px">Cambia la tua password dalla sezione Utenti. Ricorda di cambiare la password admin predefinita al primo accesso.</p>
    </div>`;
  $('#set-save').onclick = async () => { await api('/admin/settings', { method: 'PUT', body: { note: $('#set-note').value } }); toast('Salvato'); };

  if (tw.twilio_ok) {
    api('/twilio/numbers').then(nums => {
      $('#set-callerid').innerHTML = '<option value="">— Nessuno (softphone disattivo) —</option>' +
        nums.map(n => `<option value="${esc(n.numero)}" ${tw.caller_id === n.numero ? 'selected' : ''}>${esc(n.numero)}</option>`).join('');
    }).catch(e => toast(e.message, true));
    $('#set-callerid-save').onclick = async () => {
      await api('/twilio/caller-id', { method: 'PUT', body: { caller_id: $('#set-callerid').value } });
      toast($('#set-callerid').value ? 'Numero in uscita impostato' : 'Softphone disattivato');
      viewImpostazioni();
    };
  }
}

/* ================================================================
   POSTAZIONE OPERATRICE
================================================================ */
const WS = { // stato postazione
  device: null, twilioReady: false, connection: null,
  current: null,       // { tipo, contact, cc_id, callback_id, campaign_id }
  callId: null, callStart: null, timer: null, mode: 'manuale',
  selectedCampaign: null, presence: 'idle'
};

function startHeartbeat() {
  clearInterval(HEARTBEAT_TIMER);
  const send = () => api('/op/heartbeat', { method: 'POST', body: {
    stato: WS.presence,
    contact: WS.current ? { id: WS.current.contact.id, nome: nomeCompleto(WS.current.contact), telefono: WS.current.contact.telefono } : null,
    campaign_id: WS.current?.campaign_id || null
  } }).catch(() => {});
  send();
  HEARTBEAT_TIMER = setInterval(send, 10000);
}

async function initTwilio() {
  if (WS.device || WS.twilioInit) return;
  WS.twilioInit = true;
  try {
    const cfg = await api('/twilio/config');
    if (!cfg.configured || typeof Twilio === 'undefined') { WS.mode = 'manuale'; return; }
    const { token } = await api('/twilio/token');
    WS.device = new Twilio.Device(token, { logLevel: 'error', codecPreferences: ['opus', 'pcmu'], maxAverageBitrate: 40000 });
    WS.device.on('registered', () => { WS.twilioReady = true; WS.mode = 'twilio'; updateCallUI(); });
    WS.device.on('error', e => { console.error('Twilio:', e); toast('Errore telefonia: ' + e.message, true); });
    WS.device.on('tokenWillExpire', async () => {
      const { token } = await api('/twilio/token');
      WS.device.updateToken(token);
    });
    await WS.device.register();
  } catch (e) { console.warn('Twilio non disponibile:', e.message); toast('Softphone non disponibile: ' + e.message, true); WS.mode = 'manuale'; }
}

async function viewPostazione() {
  await initTwilio();
  const [camps, stats] = await Promise.all([api('/op/campaigns'), api('/op/mystats')]);
  WS.campsCache = camps;
  $('#view').innerHTML = `
    <h2 class="page-title">Postazione <em>Chiamate</em></h2>
    <div class="cards-row">
      <div class="stat-card"><div class="num">${stats.chiamate}</div><div class="lbl">Chiamate oggi</div></div>
      <div class="stat-card"><div class="num">${stats.appuntamenti || 0}</div><div class="lbl">Appuntamenti oggi</div></div>
      <div class="stat-card"><div class="num">${stats.richiami || 0}</div><div class="lbl">Richiami presi</div></div>
      <div class="stat-card"><div class="num">${fmtDur(stats.sec)}</div><div class="lbl">Tempo al telefono</div></div>
    </div>
    <div class="workstation">
      <div>
        <div class="card contact-card" id="ws-contact">
          <p class="muted">Seleziona una campagna e premi <b>Prossima chiamata</b></p>
        </div>
        <div class="card" id="ws-controls">
          <div class="toolbar" style="margin-bottom:0">
            <select id="ws-campaign" style="flex:1">
              <option value="">— Seleziona campagna —</option>
              ${camps.map(c => `<option value="${c.id}" ${WS.selectedCampaign == c.id ? 'selected' : ''}>${esc(c.nome)} (${c.da_fare} da fare)</option>`).join('')}
            </select>
            <button class="btn primary big" id="ws-next">▶ Prossima chiamata</button>
          </div>
          <div id="ws-geo-bar" class="toolbar hidden" style="margin:10px 0 0">
            <button class="btn" id="ws-geo-btn">\uD83D\uDCCD Scegli posizione</button>
            <span id="ws-geo-label" class="muted"></span>
          </div>
          ${camps.length === 0 ? '<p class="muted" style="margin-top:10px">Nessuna campagna attiva con contatti per te. Chiedi all\'amministratore.</p>' : ''}
        </div>
      </div>
      <div>
        <div class="card" id="ws-esito-card">
          <b>Esito chiamata</b>
          <p class="muted" id="ws-esito-hint" style="margin:6px 0 10px">Disponibile dopo la chiamata</p>
          <div id="ws-esito-body"></div>
        </div>
      </div>
    </div>`;
  function refreshGeoBar() {
    const camp = (WS.campsCache || []).find(c => c.id == WS.selectedCampaign);
    const isGeo = camp?.tipo === 'geo';
    $('#ws-geo-bar').classList.toggle('hidden', !isGeo);
    if (isGeo) $('#ws-geo-label').textContent = WS.geoCenter ? `Zona attiva: ${WS.geoCenter.label} (raggio ${camp.raggio_km || 25} km)` : 'Nessuna posizione scelta';
  }
  $('#ws-campaign').onchange = e => {
    WS.selectedCampaign = e.target.value || null;
    if (!WS.geoCenter || WS.geoCenter.campaign != WS.selectedCampaign) WS.geoCenter = null;
    refreshGeoBar();
  };
  $('#ws-geo-btn').onclick = () => openGeoMap();
  refreshGeoBar();
  $('#ws-next').onclick = nextContact;
  if (WS.autoNext) { WS.autoNext = false; nextContact().then(() => { if (WS.current) startCall(); }); }
  if (WS.current) renderContact(); // ripristina se si torna sulla vista
}

async function nextContact() {
  if (WS.callId) return toast('Chiudi prima la chiamata in corso', true);
  try {
    const body = { campaign_id: WS.selectedCampaign ? parseInt(WS.selectedCampaign) : null };
    if (WS.geoCenter && WS.geoCenter.campaign == WS.selectedCampaign) { body.lat = WS.geoCenter.lat; body.lng = WS.geoCenter.lng; }
    const r = await api('/op/next', { method: 'POST', body });
    if (r.tipo === 'geo_select') { toast(r.motivo); openGeoMap(); return; }
    if (r.tipo === 'geo_esaurita') { WS.geoCenter = null; toast(r.motivo, true); openGeoMap(); return; }
    if (r.tipo === 'vuoto') { toast(r.motivo, true); return; }
    WS.current = r;
    WS.presence = 'idle';
    renderContact();
  } catch (e) { toast(e.message, true); }
}

/* ---------- mappa geolocalizzata (Leaflet) ---------- */
async function loadLeaflet() {
  if (window.L) return;
  await new Promise((ok, err) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    s.onload = ok; s.onerror = () => err(new Error('Mappa non caricabile'));
    document.body.appendChild(s);
  });
}

async function openGeoMap() {
  if (!WS.selectedCampaign) return toast('Seleziona prima una campagna', true);
  const camp = (WS.campsCache || []).find(c => c.id == WS.selectedCampaign);
  const raggio = camp?.raggio_km || 25;
  try {
    await loadLeaflet();
    const d = await api(`/op/campaigns/${WS.selectedCampaign}/geo-points`);
    openModal('\uD83D\uDCCD Scegli la posizione di partenza', `
      <p class="muted" style="margin-bottom:8px">${d.points.length} contatti da chiamare${d.senza_posizione ? ` (+${d.senza_posizione} senza posizione, esclusi)` : ''}.
      Ogni cerchio è una zona con il <b>numero di contatti</b>: cliccane uno e la coda proseguirà per vicinanza entro <b>${raggio} km</b>.</p>
      <div id="geo-map" style="height:440px; border-radius:10px"></div>
      <div class="modal-actions">
        <span id="geo-sel" class="muted" style="margin-right:auto">Nessun punto selezionato</span>
        <button class="btn" onclick="closeModal()">Annulla</button>
        <button class="btn primary" id="geo-start" disabled>▶ Inizia da qui</button>
      </div>`);
    if (!d.points.length) { $('#geo-map').innerHTML = '<p class="muted" style="padding:20px">Nessun contatto con posizione in questa campagna.</p>'; return; }
    setTimeout(() => {
      const map = L.map('geo-map');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
      // raggruppo per zona (stesse coordinate = stesso comune): una bolla col conteggio
      const groups = new Map();
      d.points.forEach(p => {
        const k = p.lat.toFixed(4) + ',' + p.lng.toFixed(4);
        if (!groups.has(k)) groups.set(k, { lat: p.lat, lng: p.lng, comune: p.comune || '', n: 0 });
        const g = groups.get(k);
        g.n++;
        if (!g.comune && p.comune) g.comune = p.comune;
      });
      const bounds = [];
      let sel = null, circle = null;
      for (const g of groups.values()) {
        bounds.push([g.lat, g.lng]);
        const size = Math.round(Math.max(28, Math.min(54, 22 + Math.sqrt(g.n) * 3.5)));
        const icon = L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="geo-bubble" style="width:${size}px;height:${size}px;line-height:${size - 4}px">${g.n}</div>` });
        const m = L.marker([g.lat, g.lng], { icon });
        m.addTo(map).bindTooltip(`${esc(g.comune || 'Zona')} — ${g.n} contatt${g.n === 1 ? 'o' : 'i'}`);
        m.on('click', () => {
          sel = g;
          if (circle) circle.remove();
          circle = L.circle([g.lat, g.lng], { radius: raggio * 1000, color: '#22a35c', fillOpacity: .08 }).addTo(map);
          $('#geo-sel').textContent = `Partenza: ${g.comune || 'zona'} (${g.n} contatti nella zona)`;
          $('#geo-start').disabled = false;
        });
      }
      map.fitBounds(bounds, { padding: [30, 30] });
      $('#geo-start').onclick = () => {
        if (!sel) return;
        WS.geoCenter = { lat: sel.lat, lng: sel.lng, label: sel.comune || 'zona scelta', campaign: WS.selectedCampaign };
        closeModal();
        toast(`Zona impostata: ${WS.geoCenter.label} — raggio ${raggio} km`);
        const bar = $('#ws-geo-label'); if (bar) bar.textContent = `Zona attiva: ${WS.geoCenter.label} (raggio ${raggio} km)`;
        nextContact();
      };
    }, 60);
  } catch (e) { toast(e.message, true); }
}

function renderContact() {
  const c = WS.current.contact;
  const isRichiamo = WS.current.tipo === 'richiamo';
  $('#ws-contact').innerHTML = `
    ${isRichiamo ? `<div class="tag orange" style="margin-bottom:8px">🔄 RICHIAMO ${fmtDT(WS.current.richiamo_at)} ${esc(WS.current.richiamo_note || '')}</div>` : ''}
    <div class="cname">${esc(nomeCompleto(c))}</div>
    <div class="contact-meta">
      ${c.comune ? `<span class="tag">📍 ${esc(c.comune)}</span>` : ''}
      ${c.offerto_da ? `<span class="tag gray">🤝 ${esc(c.offerto_da)}</span>` : ''}
      ${c.parentela ? `<span class="tag gray">👥 ${esc(c.parentela)}</span>` : ''}
      ${WS.current.tentativi ? `<span class="tag gray">tent. ${WS.current.tentativi}</span>` : ''}
      ${WS.current.dist_km != null ? `<span class="tag green">\uD83D\uDCCD ${WS.current.dist_km} km</span>` : ''}
    </div>
    <div class="cphone">${esc(c.telefono)}</div>
    ${c.note ? `<p class="muted">📝 ${esc(c.note)}</p>` : ''}
    <div class="call-status" id="ws-status"></div>
    <div class="call-timer hidden" id="ws-timer">00:00</div>
    <div class="call-buttons" id="ws-buttons"></div>`;
  updateCallUI();
}


/* Controlli audio in chiamata */
function setSpeakerVolume(v) {
  WS.volume = v;
  document.querySelectorAll('audio').forEach(el => { try { el.volume = v / 100; } catch {} });
}
async function setMicAGC(on) {
  WS.agc = on;
  try {
    await WS.device.audio.setAudioConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: on });
    toast(on ? 'Sensibilita\u0300 microfono: automatica' : 'Sensibilita\u0300 microfono: fissa');
  } catch (e) { toast('Impossibile applicare: ' + e.message, true); }
}
function toggleMute() {
  if (!WS.connection) return;
  const m = !WS.connection.isMuted();
  WS.connection.mute(m);
  const b = $('#ws-mute');
  if (b) { b.textContent = m ? '\uD83C\uDF99 Riattiva' : '\uD83D\uDD07 Muto'; b.classList.toggle('danger', m); }
  toast(m ? 'Microfono in muto' : 'Microfono riattivato');
}

function updateCallUI() {
  const btns = $('#ws-buttons');
  if (!btns || !WS.current) return;
  const status = $('#ws-status');
  if (WS.callId) {
    status.innerHTML = WS.mode === 'twilio' ? '🔴 <b>In chiamata (softphone)</b>' : '📱 <b>In chiamata (dal tuo telefono)</b>';
    $('#ws-timer').classList.remove('hidden');
    btns.innerHTML = `
      <button class="btn danger big" id="ws-hangup">📵 Chiudi chiamata</button>
      ${WS.connection ? `<button class="btn" id="ws-mute">${WS.connection.isMuted() ? '🎙 Riattiva' : '🔇 Muto'}</button>
      <div class="audio-controls">
        🔊 <input type="range" id="ws-vol" min="0" max="100" value="${WS.volume ?? 100}" title="Volume cuffie">
        <label class="agc-label"><input type="checkbox" id="ws-agc" ${WS.agc !== false ? 'checked' : ''}> mic auto</label>
      </div>` : ''}`;
    $('#ws-hangup').onclick = hangup;
    const mb = $('#ws-mute');
    if (mb) mb.onclick = toggleMute;
    const vs = $('#ws-vol');
    if (vs) vs.oninput = () => setSpeakerVolume(parseInt(vs.value));
    const ag = $('#ws-agc');
    if (ag) ag.onchange = () => setMicAGC(ag.checked);
  } else {
    status.innerHTML = WS.twilioReady ? '<span class="tag green">softphone pronto</span>' : '<span class="tag gray">modalità manuale — chiama dal tuo telefono</span>';
    $('#ws-timer').classList.add('hidden');
    btns.innerHTML = `
      <button class="btn success big" id="ws-call">📞 ${WS.twilioReady ? 'Chiama' : 'Ho chiamato / sto chiamando'}</button>
      <button class="btn" id="ws-skip">⏭ Salta</button>`;
    $('#ws-call').onclick = startCall;
    $('#ws-skip').onclick = skipContact;
  }
}

async function skipContact() {
  if (WS.current?.cc_id) await api('/op/skip', { method: 'POST', body: { cc_id: WS.current.cc_id } });
  WS.current = null;
  $('#ws-contact').innerHTML = '<p class="muted">Contatto saltato. Premi <b>Prossima chiamata</b></p>';
  clearEsito();
}

async function startCall() {
  const c = WS.current.contact;
  try {
    const r = await api('/op/calls/start', { method: 'POST', body: { contact_id: c.id, campaign_id: WS.current.campaign_id, mode: WS.twilioReady ? 'twilio' : 'manuale' } });
    WS.callId = r.call_id;
    WS.callStart = Date.now();
    WS.presence = 'in_chiamata';
    WS.timer = setInterval(() => {
      const s = Math.floor((Date.now() - WS.callStart) / 1000);
      const t = $('#ws-timer');
      if (t) t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);

    if (WS.twilioReady) {
      WS.connection = await WS.device.connect({ params: { To: c.telefono } });
      WS.connection.on('accept', () => { setSpeakerVolume(WS.volume ?? 100); updateCallUI(); });
      WS.connection.on('disconnect', () => { if (WS.callId) onCallEnded(); });
      WS.connection.on('error', e => toast('Errore chiamata: ' + e.message, true));
    }
    updateCallUI();
    renderEsitoForm(); // esito compilabile già durante la chiamata
  } catch (e) { toast(e.message, true); }
}

function hangup() {
  if (WS.connection) { try { WS.connection.disconnect(); } catch {} WS.connection = null; }
  onCallEnded();
}

function onCallEnded() {
  clearInterval(WS.timer);
  WS.presence = 'in_esito';
  WS.durata = Math.floor((Date.now() - WS.callStart) / 1000);
  WS.connection = null;
  const status = $('#ws-status');
  if (status) status.innerHTML = '☑️ Chiamata terminata — <b>registra l\'esito</b>';
  const btns = $('#ws-buttons');
  if (btns) btns.innerHTML = '';
  toast('Chiamata terminata: seleziona l\'esito');
}

function clearEsito() {
  $('#ws-esito-body').innerHTML = '';
  $('#ws-esito-hint').classList.remove('hidden');
}

function renderEsitoForm() {
  $('#ws-esito-hint').classList.add('hidden');
  const domani = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  api('/op/agents').then(agents => {
    $('#ws-esito-body').innerHTML = `
      <div class="esiti-grid">
        ${ESITI_CHIAMATA.map(e => `<button class="esito-btn" data-esito="${e}">${ESITI_LABEL[e]}</button>`).join('')}
      </div>
      <div id="ws-extra" style="margin-top:12px"></div>
      <label>Note chiamata</label><textarea id="ws-note"></textarea>
      <button class="btn primary big block" style="margin-top:12px" id="ws-save-esito" disabled>💾 Salva esito</button>`;

    let esito = null;
    $('#ws-esito-body').querySelectorAll('.esito-btn').forEach(b => b.onclick = () => {
      $('#ws-esito-body').querySelectorAll('.esito-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      esito = b.dataset.esito;
      $('#ws-save-esito').disabled = false;
      const extra = $('#ws-extra');
      if (esito === 'richiamo') {
        const dt = new Date(Date.now() + 3600e3);
        const val = `${dt.toISOString().slice(0, 10)}T${String(dt.getHours()).padStart(2, '0')}:00`;
        extra.innerHTML = `<label>📅 Quando richiamare *</label><input type="datetime-local" id="ws-cb-dt" value="${val}" style="width:100%">
          <label>Note richiamo</label><input id="ws-cb-note" style="width:100%" placeholder="es. preferisce il pomeriggio">`;
      } else if (esito === 'appuntamento_fissato') {
        extra.innerHTML = `
          <div class="form-grid">
            <div><label>📅 Data appuntamento *</label><input type="date" id="ws-ap-data" value="${domani}" style="width:100%"></div>
            <div><label>Ora</label><input type="time" id="ws-ap-ora" style="width:100%"></div>
            <div class="full"><label>Indirizzo</label><input id="ws-ap-ind" style="width:100%"></div>
            <div class="full"><label>Agente</label><select id="ws-ap-agente" style="width:100%"><option value="">— da assegnare —</option>${agents.map(a => `<option value="${a.id}">${esc(a.nome)}${a.zone ? ' (' + esc(a.zone) + ')' : ''}</option>`).join('')}</select></div>
          </div>`;
      } else extra.innerHTML = '';
    });

    $('#ws-save-esito').onclick = async () => {
      if (!esito) return;
      // se la chiamata è ancora aperta chiudila
      if (WS.connection) { try { WS.connection.disconnect(); } catch {} WS.connection = null; clearInterval(WS.timer); }
      const durata = WS.durata ?? Math.floor((Date.now() - WS.callStart) / 1000);
      const body = {
        esito, note: $('#ws-note').value, durata,
        cc_id: WS.current.cc_id || null, callback_id: WS.current.callback_id || null
      };
      if (esito === 'richiamo') {
        body.richiamo_at = $('#ws-cb-dt')?.value;
        body.richiamo_note = $('#ws-cb-note')?.value;
        if (!body.richiamo_at) return toast('Imposta data e ora del richiamo', true);
      }
      if (esito === 'appuntamento_fissato') {
        body.appuntamento = { data: $('#ws-ap-data')?.value, ora: $('#ws-ap-ora')?.value, indirizzo: $('#ws-ap-ind')?.value, agent_id: $('#ws-ap-agente')?.value ? parseInt($('#ws-ap-agente').value) : null };
        if (!body.appuntamento.data) return toast('Imposta la data dell\'appuntamento', true);
      }
      try {
        await api(`/op/calls/${WS.callId}/end`, { method: 'POST', body });
        WS.callId = null; WS.callStart = null; WS.durata = null; WS.current = null; WS.presence = 'idle';
        const camp = (WS.campsCache || []).find(c => c.id == WS.selectedCampaign);
        if (camp?.tipo === 'predictive' && CURRENT_VIEW === 'postazione') {
          WS.autoNext = true;
          toast('Esito salvato ✓ — parte la prossima chiamata...');
        } else {
          toast('Esito salvato ✓');
        }
        if (CURRENT_VIEW === 'postazione') viewPostazione();
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------- viste secondarie operatrice ---------- */
async function viewRichiamiOp() {
  const rows = await api('/op/callbacks');
  const scaduto = r => new Date(r.richiamo_at.replace(' ', 'T')) <= new Date();
  $('#view').innerHTML = `
    <h2 class="page-title">I miei <em>Richiami</em></h2>
    <p class="muted" style="margin-bottom:12px">I richiami scaduti ti vengono proposti automaticamente in Postazione con "Prossima chiamata".</p>
    <div class="table-wrap"><table>
      <tr><th>Da richiamare</th><th>Contatto</th><th>Telefono</th><th>Campagna</th><th>Note</th></tr>
      ${rows.map(r => `<tr>
        <td>${scaduto(r) ? `<span class="tag red">${fmtDT(r.richiamo_at)}</span>` : fmtDT(r.richiamo_at)}</td>
        <td>${esc((r.contatto_nome || '') + ' ' + (r.contatto_cognome || ''))}</td>
        <td>${esc(r.telefono)}</td><td>${esc(r.campagna || '—')}</td><td>${esc(r.note || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessun richiamo</td></tr>'}
    </table></div>`;
}

async function viewChiamateOp() {
  const rows = await api('/op/calls');
  $('#view').innerHTML = `
    <h2 class="page-title">Le mie <em>Chiamate</em></h2>
    <div class="table-wrap"><table>
      <tr><th>Data e ora</th><th>Contatto</th><th>Numero</th><th>Campagna</th><th>Durata</th><th>Esito</th><th>Note</th></tr>
      ${rows.map(c => `<tr><td>${fmtDT(c.started_at)}</td>
        <td>${esc((c.contatto_nome || '') + ' ' + (c.contatto_cognome || ''))}</td>
        <td>${esc(c.contatto_telefono)}</td><td>${esc(c.campagna || '—')}</td>
        <td>${fmtDur(c.durata)}</td><td>${tag(c.esito)}</td><td>${esc(c.note || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nessuna chiamata</td></tr>'}
    </table></div>`;
}

async function viewAppuntamentiOp() {
  const rows = await api('/op/appointments');
  $('#view').innerHTML = `
    <h2 class="page-title">I miei <em>Appuntamenti</em></h2>
    <div class="table-wrap"><table>
      <tr><th>Data</th><th>Ora</th><th>Contatto</th><th>Telefono</th><th>Agente</th><th>Indirizzo</th><th>Stato</th></tr>
      ${rows.map(a => `<tr><td>${fmtD(a.data)}</td><td>${a.ora || '—'}</td>
        <td>${esc((a.contatto_nome || '') + ' ' + (a.contatto_cognome || ''))}</td><td>${esc(a.telefono || '')}</td>
        <td>${esc(a.agente || '—')}</td><td>${esc(a.indirizzo || '')}</td>
        <td><span class="tag ${a.stato === 'confermato' ? 'green' : a.stato === 'annullato' ? 'red' : ''}">${a.stato}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nessun appuntamento</td></tr>'}
    </table></div>`;
}


/* ---------- TELEFONO DIRETTO (tastierino) ---------- */
async function viewTelefono() {
  await initTwilio();
  $('#view').innerHTML = `
    <h2 class="page-title">Telefono <em>Diretto</em></h2>
    <div class="workstation">
      <div>
        <div class="card" style="text-align:center">
          <label>Numero da chiamare</label>
          <input id="dial-num" style="width:100%; max-width:280px; font-size:22px; text-align:center; margin:4px auto 12px; display:block" placeholder="+39...">
          <div class="dialpad">
            ${['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => `<button class="dial-key" data-k="${k}">${k}</button>`).join('')}
          </div>
          <div class="call-buttons" style="margin-top:10px">
            <button class="btn" id="dial-back">\u232B</button>
            <button class="btn" id="dial-clear">\u2715 Azzera</button>
          </div>
        </div>
        <div class="card contact-card" id="ws-contact">
          <p class="muted">Digita un numero e premi Chiama</p>
          <div class="call-status" id="ws-status">${WS.twilioReady ? '<span class="tag green">softphone pronto</span>' : '<span class="tag gray">modalit\u00E0 manuale \u2014 chiama dal tuo telefono</span>'}</div>
          <div class="call-timer hidden" id="ws-timer">00:00</div>
          <div class="call-buttons" id="ws-buttons">
            <button class="btn success big" id="dial-call">\uD83D\uDCDE Chiama</button>
          </div>
        </div>
      </div>
      <div>
        <div class="card" id="ws-esito-card">
          <b>Esito chiamata</b>
          <p class="muted" id="ws-esito-hint" style="margin:6px 0 10px">Disponibile dopo la chiamata</p>
          <div id="ws-esito-body"></div>
        </div>
      </div>
    </div>`;

  const input = $('#dial-num');
  $('#view').querySelectorAll('.dial-key').forEach(b => b.onclick = () => { input.value += b.dataset.k; });
  $('#dial-back').onclick = () => { input.value = input.value.slice(0, -1); };
  $('#dial-clear').onclick = () => { input.value = ''; };
  $('#dial-call').onclick = async () => {
    const tel = input.value.trim();
    if (!tel) return toast('Digita un numero', true);
    if (!WS.twilioReady) return toast('Softphone non attivo: ricarica la pagina e controlla che il microfono sia consentito. Se il problema persiste avvisa l\'amministratore.', true);
    try {
      const c = await api('/op/resolve-number', { method: 'POST', body: { telefono: tel } });
      WS.current = { tipo: 'manuale', campaign_id: null, contact: c };
      renderContact();
      await startCall();
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------- CAMPAGNE (lato operatrice) ---------- */
async function viewCampagneOp() {
  const camps = await api('/op/campaigns?all=1');
  WS.campsCache = camps;
  const tipoTag = c => ({ manuale: '<span class="tag gray">Manuale</span>',
    predictive: '<span class="tag orange">\u26A1 Predictive</span>',
    geo: `<span class="tag green">\uD83D\uDCCD Geo ${c.raggio_km || 25} km</span>` }[c.tipo] || '');
  $('#view').innerHTML = `
    <h2 class="page-title">Le mie <em>Campagne</em></h2>
    ${camps.length === 0 ? '<p class="muted">Nessuna campagna attiva al momento. Chiedi all\'amministratore.</p>' : ''}
    <div class="monitor-grid">
      ${camps.map(c => {
        const pct = c.tot ? Math.round(100 * c.fatti_tot / c.tot) : 0;
        return `<div class="op-card">
          <b>${esc(c.nome)}</b> ${tipoTag(c)}
          ${c.descrizione ? `<div class="muted" style="margin-top:4px">${esc(c.descrizione)}</div>` : ''}
          ${c.note ? `<div style="margin-top:6px; font-size:13px">\uD83D\uDCDD ${esc(c.note)}</div>` : ''}
          <div style="margin:10px 0 4px; font-size:13px">
            Da chiamare${c.modalita === 'assegnata' ? ' (assegnati a te)' : ''}: <b>${c.da_fare}</b><br>
            Fatte da te: <b>${c.miei_fatti}</b> · Avanzamento totale: <b>${pct}%</b> (${c.fatti_tot}/${c.tot})
          </div>
          <div style="background:#efeef4; border-radius:6px; height:8px; margin:6px 0 12px"><div style="background:var(--accent); height:8px; border-radius:6px; width:${pct}%"></div></div>
          ${c.modalita === 'assegnata' && !c.assegnati_a_me ? '<p class="muted" style="font-size:12px">Nessun contatto assegnato a te in questa campagna.</p>'
            : `<button class="btn primary block" data-work="${c.id}">▶ Lavora questa campagna</button>`}
        </div>`;
      }).join('')}
    </div>`;
  $('#view').querySelectorAll('[data-work]').forEach(b => b.onclick = () => {
    WS.selectedCampaign = b.dataset.work;
    if (!WS.geoCenter || WS.geoCenter.campaign != WS.selectedCampaign) WS.geoCenter = null;
    go('postazione');
  });
}

/* ---------- MAPPA CAMPAGNA (admin, sola visualizzazione) ---------- */
async function openMapAdmin(campId, nomeCampagna) {
  try {
    await loadLeaflet();
    const d = await api(`/op/campaigns/${campId}/geo-points`);
    const groups = new Map();
    d.points.forEach(p => {
      const k = p.lat.toFixed(4) + ',' + p.lng.toFixed(4);
      if (!groups.has(k)) groups.set(k, { lat: p.lat, lng: p.lng, comune: p.comune || '', n: 0 });
      const g = groups.get(k);
      g.n++;
      if (!g.comune && p.comune) g.comune = p.comune;
    });
    openModal(`\uD83D\uDDFA Mappa — ${esc(nomeCampagna)}`, `
      <p class="muted" style="margin-bottom:8px"><b>${d.points.length}</b> contatti da chiamare in <b>${groups.size}</b> zone${d.senza_posizione ? ` · <span class="tag red">\u26A0 ${d.senza_posizione} senza posizione</span>` : ''}</p>
      <div id="geo-map" style="height:460px; border-radius:10px"></div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Chiudi</button></div>`);
    if (!d.points.length) { $('#geo-map').innerHTML = '<p class="muted" style="padding:20px">Nessun contatto geolocalizzato da chiamare in questa campagna.</p>'; return; }
    setTimeout(() => {
      const map = L.map('geo-map');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
      const bounds = [];
      for (const g of groups.values()) {
        bounds.push([g.lat, g.lng]);
        const size = Math.round(Math.max(28, Math.min(54, 22 + Math.sqrt(g.n) * 3.5)));
        const icon = L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div class="geo-bubble" style="width:${size}px;height:${size}px;line-height:${size - 4}px">${g.n}</div>` });
        L.marker([g.lat, g.lng], { icon }).addTo(map)
          .bindTooltip(`${esc(g.comune || 'Zona')} — ${g.n} contatt${g.n === 1 ? 'o' : 'i'}`);
      }
      map.fitBounds(bounds, { padding: [30, 30] });
    }, 60);
  } catch (e) { toast(e.message, true); }
}

/* ---------- registry ---------- */
const VIEWS = {
  dashboard: viewDashboard, monitor: viewMonitor, campagne: viewCampagne, contatti: viewContatti,
  registro: viewRegistro, richiami: viewRichiami, appuntamenti: viewAppuntamenti, report: viewReport,
  operatrici: viewOperatrici, agenti: viewAgenti, impostazioni: viewImpostazioni,
  postazione: viewPostazione, 'campagne-op': viewCampagneOp, telefono: viewTelefono, 'richiami-op': viewRichiamiOp, 'chiamate-op': viewChiamateOp, 'appuntamenti-op': viewAppuntamentiOp
};

boot();
