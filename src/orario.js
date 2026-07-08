// Fasce orarie di lavoro per le operatrici (fuso Europe/Rome)
const db = require('./db');

function nowRome() {
  const t = new Date().toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour12: false });
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function toMin(s) {
  if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
// Ritorna null se l'accesso è consentito, altrimenti il messaggio di blocco
function checkOrario(user) {
  if (!user || user.ruolo !== 'operatore') return null;
  let dal = user.orario_dal, al = user.orario_al;
  if (!dal && !al) {
    const g = Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE key IN ('orario_dal','orario_al')").all().map(r => [r.key, r.value]));
    dal = g.orario_dal; al = g.orario_al;
  }
  const d = toMin(dal), a = toMin(al);
  if (d == null || a == null) return null; // nessun limite configurato
  const n = nowRome();
  const dentro = d <= a ? (n >= d && n <= a) : (n >= d || n <= a); // supporta fasce a cavallo di mezzanotte
  return dentro ? null : `Fuori orario di lavoro (consentito ${dal}–${al})`;
}
module.exports = { checkOrario };
