// Fasce orarie di lavoro per le operatrici (fuso Europe/Rome)
// Formato settimana: { lun: [["09:00","13:00"],["14:00","19:00"]], ..., dom: [] }
// Piu' fasce nello stesso giorno = pausa tra una e l'altra. Array vuoto = giorno non lavorativo.
const db = require('./db');

function nowRome() {
  const t = new Date().toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour12: false });
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function dayRome() {
  const d = new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short' }).toLowerCase();
  return d.slice(0, 3); // lun, mar, mer, gio, ven, sab, dom
}
function toMin(s) {
  if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function uniforme(dal, al) {
  const giorni = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  const o = {};
  giorni.forEach(g => o[g] = [[dal, al]]);
  return o;
}
function getSchedule(user) {
  // 1. settimana personalizzata utente
  try { if (user.orario_settimana) return JSON.parse(user.orario_settimana); } catch {}
  // 2. legacy utente (dal/al tutti i giorni)
  if (user.orario_dal && user.orario_al) return uniforme(user.orario_dal, user.orario_al);
  // 3. impostazioni generali
  const g = Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE key IN ('orario_settimana','orario_dal','orario_al')").all().map(r => [r.key, r.value]));
  try { if (g.orario_settimana) return JSON.parse(g.orario_settimana); } catch {}
  if (g.orario_dal && g.orario_al) return uniforme(g.orario_dal, g.orario_al);
  return null; // nessun limite
}
// Ritorna null se l'accesso e' consentito, altrimenti il messaggio di blocco
function checkOrario(user) {
  if (!user || user.ruolo !== 'operatore') return null;
  const sched = getSchedule(user);
  if (!sched) return null;
  const day = dayRome();
  const slots = (sched[day] || []).filter(s => Array.isArray(s) && toMin(s[0]) != null && toMin(s[1]) != null);
  if (!slots.length) return 'Oggi non è previsto orario di lavoro';
  const n = nowRome();
  for (const [dal, al] of slots) {
    const d = toMin(dal), a = toMin(al);
    const dentro = d <= a ? (n >= d && n <= a) : (n >= d || n <= a);
    if (dentro) return null;
  }
  return `Fuori orario di lavoro (oggi: ${slots.map(s => s[0] + '–' + s[1]).join(', ')})`;
}
module.exports = { checkOrario };
