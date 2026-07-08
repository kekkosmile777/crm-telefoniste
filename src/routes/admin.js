// Route riservate all'amministratore
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const presence = require('../presence');
const router = express.Router();

/* ---------- UTENTI (operatrici e admin) ---------- */
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, username, nome, ruolo, attivo, created_at, permessi, orario_dal, orario_al, orario_settimana FROM users ORDER BY nome').all();
  rows.forEach(r => { try { r.orario_settimana = r.orario_settimana ? JSON.parse(r.orario_settimana) : null; } catch { r.orario_settimana = null; } });
  rows.forEach(r => { try { r.permessi = r.permessi ? JSON.parse(r.permessi) : null; } catch { r.permessi = null; } });
  res.json(rows);
});

router.post('/users', (req, res) => {
  const { username, password, nome, ruolo, permessi, orario_dal, orario_al } = req.body;
  if (!username || !password || !nome) return res.status(400).json({ error: 'Username, password e nome obbligatori' });
  if (!['admin', 'operatore'].includes(ruolo)) return res.status(400).json({ error: 'Ruolo non valido' });
  try {
    const r = db.prepare('INSERT INTO users (username, password_hash, nome, ruolo, permessi, orario_dal, orario_al) VALUES (?,?,?,?,?,?,?)')
      .run(username.trim().toLowerCase(), bcrypt.hashSync(password, 10), nome, ruolo, Array.isArray(permessi) ? JSON.stringify(permessi) : null, orario_dal || null, orario_al || null);
    res.json({ id: r.lastInsertRowid, username, nome, ruolo });
  } catch (e) {
    res.status(400).json({ error: 'Username già esistente' });
  }
});

router.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utente non trovato' });
  const { nome, ruolo, attivo, password, permessi, orario_dal, orario_al, orario_settimana } = req.body;
  db.prepare('UPDATE users SET nome=?, ruolo=?, attivo=? WHERE id=?')
    .run(nome ?? u.nome, ['admin','operatore'].includes(ruolo) ? ruolo : u.ruolo, attivo != null ? (attivo ? 1 : 0) : u.attivo, req.params.id);
  if (permessi !== undefined) db.prepare('UPDATE users SET permessi=? WHERE id=?')
    .run(Array.isArray(permessi) ? JSON.stringify(permessi) : null, req.params.id);
  if (orario_dal !== undefined || orario_al !== undefined) db.prepare('UPDATE users SET orario_dal=?, orario_al=? WHERE id=?')
    .run(orario_dal || null, orario_al || null, req.params.id);
  if (orario_settimana !== undefined) db.prepare('UPDATE users SET orario_settimana=? WHERE id=?')
    .run(orario_settimana && typeof orario_settimana === 'object' ? JSON.stringify(orario_settimana) : null, req.params.id);
  if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

/* ---------- AGENTI (sul territorio, per appuntamenti) ---------- */
router.get('/agents', (req, res) => res.json(db.prepare('SELECT * FROM agents ORDER BY nome').all()));
router.post('/agents', (req, res) => {
  const { nome, telefono, zone } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  const r = db.prepare('INSERT INTO agents (nome, telefono, zone) VALUES (?,?,?)').run(nome, telefono || '', zone || '');
  res.json({ id: r.lastInsertRowid });
});
router.put('/agents/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Agente non trovato' });
  const { nome, telefono, zone, attivo } = req.body;
  db.prepare('UPDATE agents SET nome=?, telefono=?, zone=?, attivo=? WHERE id=?')
    .run(nome ?? a.nome, telefono ?? a.telefono, zone ?? a.zone, attivo != null ? (attivo ? 1 : 0) : a.attivo, req.params.id);
  res.json({ ok: true });
});
router.delete('/agents/:id', (req, res) => {
  db.prepare('DELETE FROM agents WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- CAMPAGNE ---------- */
router.get('/campaigns', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id) AS tot,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.stato = 'lavorato') AS fatti,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.stato = 'da_chiamare') AS da_fare,
      (SELECT COUNT(*) FROM appointments a JOIN calls cl ON cl.contact_id = a.contact_id AND cl.campaign_id = c.id WHERE a.stato='confermato') AS appuntamenti
    FROM campaigns c ORDER BY c.id DESC`).all();
  res.json(rows);
});

router.post('/campaigns', (req, res) => {
  const { nome, descrizione, note, modalita, obiettivo_app, max_tentativi, tipo, raggio_km } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  const tipoOk = ['manuale', 'predictive', 'geo'].includes(tipo) ? tipo : 'manuale';
  const r = db.prepare('INSERT INTO campaigns (nome, descrizione, note, modalita, obiettivo_app, max_tentativi, tipo, raggio_km) VALUES (?,?,?,?,?,?,?,?)')
    .run(nome, descrizione || '', note || '', modalita === 'assegnata' ? 'assegnata' : 'coda', parseInt(obiettivo_app) || 0, parseInt(max_tentativi) || 3, tipoOk, parseInt(raggio_km) || 25);
  res.json({ id: r.lastInsertRowid });
});

router.put('/campaigns/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campagna non trovata' });
  const { nome, descrizione, note, modalita, obiettivo_app, max_tentativi, stato, tipo, raggio_km } = req.body;
  const stati = ['bozza','attiva','in_pausa','completata','archiviata'];
  db.prepare('UPDATE campaigns SET nome=?, descrizione=?, note=?, modalita=?, obiettivo_app=?, max_tentativi=?, stato=?, tipo=?, raggio_km=? WHERE id=?')
    .run(nome ?? c.nome, descrizione ?? c.descrizione, note ?? c.note,
         ['coda','assegnata'].includes(modalita) ? modalita : c.modalita,
         obiettivo_app != null ? parseInt(obiettivo_app) || 0 : c.obiettivo_app,
         max_tentativi != null ? parseInt(max_tentativi) || 3 : c.max_tentativi,
         stati.includes(stato) ? stato : c.stato,
         ['manuale','predictive','geo'].includes(tipo) ? tipo : c.tipo,
         raggio_km != null ? parseInt(raggio_km) || 25 : c.raggio_km, req.params.id);
  res.json({ ok: true });
});

router.delete('/campaigns/:id', (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Contatti di una campagna
router.get('/campaigns/:id/contacts', (req, res) => {
  const rows = db.prepare(`
    SELECT cc.id AS cc_id, cc.stato AS cc_stato, cc.esito AS cc_esito, cc.tentativi, cc.assigned_to,
           u.nome AS assegnato_a, ct.*
    FROM campaign_contacts cc
    JOIN contacts ct ON ct.id = cc.contact_id
    LEFT JOIN users u ON u.id = cc.assigned_to
    WHERE cc.campaign_id = ? ORDER BY cc.id`).all(req.params.id);
  res.json(rows);
});

router.post('/campaigns/:id/contacts', (req, res) => {
  const { contact_ids } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids mancante' });
  const ins = db.prepare('INSERT OR IGNORE INTO campaign_contacts (campaign_id, contact_id) VALUES (?,?)');
  let n = 0;
  const tx = db.transaction(() => contact_ids.forEach(id => { n += ins.run(req.params.id, id).changes; }));
  tx();
  res.json({ ok: true, aggiunti: n });
});

router.post('/campaigns/:id/contacts/remove', (req, res) => {
  const { contact_ids } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids mancante' });
  const del = db.prepare('DELETE FROM campaign_contacts WHERE campaign_id=? AND contact_id=?');
  const tx = db.transaction(() => contact_ids.forEach(id => del.run(req.params.id, id)));
  tx();
  res.json({ ok: true });
});

// Assegna contatti a un'operatrice (modalità assegnata)
router.post('/campaigns/:id/assign', (req, res) => {
  const { contact_ids, user_id } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids mancante' });
  const upd = db.prepare('UPDATE campaign_contacts SET assigned_to=? WHERE campaign_id=? AND contact_id=?');
  const tx = db.transaction(() => contact_ids.forEach(id => upd.run(user_id || null, req.params.id, id)));
  tx();
  res.json({ ok: true });
});

// Rimetti in coda contatti lavorati (es. non risposte)
router.post('/campaigns/:id/requeue', (req, res) => {
  const { contact_ids } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids mancante' });
  const upd = db.prepare("UPDATE campaign_contacts SET stato='da_chiamare', locked_by=NULL, locked_at=NULL WHERE campaign_id=? AND contact_id=?");
  const tx = db.transaction(() => contact_ids.forEach(id => upd.run(req.params.id, id)));
  tx();
  res.json({ ok: true });
});

/* ---------- REGISTRO CHIAMATE ---------- */
router.get('/calls', (req, res) => {
  const { esito = '', user_id = '', campaign_id = '', from = '', to = '', page = 1, per = 50 } = req.query;
  const where = []; const params = {};
  if (esito) { where.push('c.esito = @esito'); params.esito = esito; }
  if (user_id) { where.push('c.user_id = @user_id'); params.user_id = user_id; }
  if (campaign_id) { where.push('c.campaign_id = @campaign_id'); params.campaign_id = campaign_id; }
  if (from) { where.push("c.started_at >= @from"); params.from = from; }
  if (to) { where.push("c.started_at <= @to || ' 23:59:59'"); params.to = to; }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM calls c ${w}`).get(params).n;
  const perN = Math.min(parseInt(per) || 50, 200);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * perN;
  const rows = db.prepare(`
    SELECT c.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono AS contatto_telefono,
           u.nome AS operatore, cp.nome AS campagna
    FROM calls c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN campaigns cp ON cp.id = c.campaign_id
    ${w} ORDER BY c.started_at DESC LIMIT ${perN} OFFSET ${offset}`).all(params);
  res.json({ rows, total });
});

/* ---------- RICHIAMI ---------- */
router.get('/callbacks', (req, res) => {
  const rows = db.prepare(`
    SELECT cb.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono,
           u.nome AS operatore, cp.nome AS campagna
    FROM callbacks cb
    JOIN contacts ct ON ct.id = cb.contact_id
    LEFT JOIN users u ON u.id = cb.user_id
    LEFT JOIN campaigns cp ON cp.id = cb.campaign_id
    WHERE cb.stato = 'pendente' ORDER BY cb.richiamo_at`).all();
  res.json(rows);
});
router.put('/callbacks/:id', (req, res) => {
  const cb = db.prepare('SELECT * FROM callbacks WHERE id=?').get(req.params.id);
  if (!cb) return res.status(404).json({ error: 'Richiamo non trovato' });
  const { richiamo_at, note, stato, user_id } = req.body;
  db.prepare('UPDATE callbacks SET richiamo_at=?, note=?, stato=?, user_id=? WHERE id=?')
    .run(richiamo_at ?? cb.richiamo_at, note ?? cb.note, ['pendente','fatto','annullato'].includes(stato) ? stato : cb.stato, user_id !== undefined ? user_id : cb.user_id, req.params.id);
  res.json({ ok: true });
});
router.delete('/callbacks/:id', (req, res) => {
  db.prepare("UPDATE callbacks SET stato='annullato' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- APPUNTAMENTI ---------- */
router.get('/appointments', (req, res) => {
  const { from = '', to = '' } = req.query;
  const where = []; const params = {};
  if (from) { where.push('a.data >= @from'); params.from = from; }
  if (to) { where.push('a.data <= @to'); params.to = to; }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT a.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono, ct.offerto_da,
           ag.nome AS agente, u.nome AS operatore
    FROM appointments a
    LEFT JOIN contacts ct ON ct.id = a.contact_id
    LEFT JOIN agents ag ON ag.id = a.agent_id
    LEFT JOIN users u ON u.id = a.user_id
    ${w} ORDER BY a.data, a.ora`).all(params);
  res.json(rows);
});
router.post('/appointments', (req, res) => {
  const { contact_id, agent_id, data, ora, indirizzo, note } = req.body;
  if (!data) return res.status(400).json({ error: 'Data obbligatoria' });
  const r = db.prepare('INSERT INTO appointments (contact_id, agent_id, user_id, data, ora, indirizzo, note) VALUES (?,?,?,?,?,?,?)')
    .run(contact_id || null, agent_id || null, req.user.id, data, ora || '', indirizzo || '', note || '');
  res.json({ id: r.lastInsertRowid });
});
router.put('/appointments/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appuntamento non trovato' });
  const { agent_id, data, ora, indirizzo, note, stato } = req.body;
  db.prepare('UPDATE appointments SET agent_id=?, data=?, ora=?, indirizzo=?, note=?, stato=? WHERE id=?')
    .run(agent_id !== undefined ? agent_id : a.agent_id, data ?? a.data, ora ?? a.ora, indirizzo ?? a.indirizzo,
         note ?? a.note, ['confermato','annullato','fatto'].includes(stato) ? stato : a.stato, req.params.id);
  res.json({ ok: true });
});
router.delete('/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- MONITOR LIVE ---------- */
router.get('/monitor', (req, res) => {
  const users = db.prepare("SELECT id, nome FROM users WHERE ruolo='operatore' AND attivo=1").all();
  const snap = presence.snapshot();
  const out = users.map(u => {
    const s = snap.find(x => x.user_id === u.id);
    return { user_id: u.id, nome: u.nome, online: s ? s.online : false, stato: s && s.online ? s.stato : 'offline', contact: s?.contact || null, since: s?.since || null };
  });
  // chiamate di oggi per operatrice
  const oggi = db.prepare(`SELECT user_id, COUNT(*) n, SUM(durata) sec FROM calls WHERE date(started_at)=date('now','localtime') GROUP BY user_id`).all();
  out.forEach(o => { const t = oggi.find(x => x.user_id === o.user_id); o.chiamate_oggi = t?.n || 0; o.minuti_oggi = Math.round((t?.sec || 0) / 60); });
  res.json(out);
});

/* ---------- REPORT ---------- */
router.get('/reports/summary', (req, res) => {
  const { from = '', to = '' } = req.query;
  const where = []; const params = {};
  if (from) { where.push('started_at >= @from'); params.from = from; }
  if (to) { where.push("started_at <= @to || ' 23:59:59'"); params.to = to; }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const perOperatore = db.prepare(`
    SELECT u.nome, COUNT(c.id) chiamate, SUM(c.durata) sec,
      SUM(CASE WHEN c.esito='appuntamento_fissato' THEN 1 ELSE 0 END) appuntamenti,
      SUM(CASE WHEN c.esito='richiamo' THEN 1 ELSE 0 END) richiami,
      SUM(CASE WHEN c.esito='non_interessato' THEN 1 ELSE 0 END) non_interessati
    FROM calls c JOIN users u ON u.id = c.user_id ${w}
    GROUP BY c.user_id ORDER BY chiamate DESC`).all(params);

  const perEsito = db.prepare(`SELECT esito, COUNT(*) n FROM calls ${w ? w + ' AND' : 'WHERE'} esito IS NOT NULL GROUP BY esito ORDER BY n DESC`).all(params);

  const perCampagna = db.prepare(`
    SELECT COALESCE(cp.nome,'(nessuna)') campagna, COUNT(c.id) chiamate, SUM(c.durata) sec,
      SUM(CASE WHEN c.esito='appuntamento_fissato' THEN 1 ELSE 0 END) appuntamenti
    FROM calls c LEFT JOIN campaigns cp ON cp.id = c.campaign_id ${w}
    GROUP BY c.campaign_id ORDER BY chiamate DESC`).all(params);

  const perGiorno = db.prepare(`
    SELECT date(started_at) giorno, COUNT(*) chiamate,
      SUM(CASE WHEN esito='appuntamento_fissato' THEN 1 ELSE 0 END) appuntamenti
    FROM calls ${w} GROUP BY giorno ORDER BY giorno DESC LIMIT 31`).all(params);

  const totali = db.prepare(`
    SELECT COUNT(*) chiamate, COALESCE(SUM(durata),0) sec, COALESCE(AVG(durata),0) avg_sec,
      SUM(CASE WHEN esito='appuntamento_fissato' THEN 1 ELSE 0 END) appuntamenti
    FROM calls ${w}`).get(params);

  res.json({ totali, perOperatore, perEsito, perCampagna, perGiorno: perGiorno.reverse() });
});

/* ---------- DASHBOARD ---------- */
router.get('/dashboard', (req, res) => {
  const appOggi = db.prepare("SELECT COUNT(*) n FROM appointments WHERE data = date('now','localtime') AND stato='confermato'").get().n;
  const appDomani = db.prepare("SELECT COUNT(*) n FROM appointments WHERE data = date('now','localtime','+1 day') AND stato='confermato'").get().n;
  const chiamateOggi = db.prepare("SELECT COUNT(*) n FROM calls WHERE date(started_at)=date('now','localtime')").get().n;
  const operatoriOnline = presence.snapshot().filter(s => s.online).length;
  const campagneAttive = db.prepare("SELECT id, nome, stato FROM campaigns WHERE stato='attiva'").all();
  const richiamiScaduti = db.prepare("SELECT COUNT(*) n FROM callbacks WHERE stato='pendente' AND richiamo_at <= datetime('now','localtime')").get().n;
  const ultimeChiamate = db.prepare(`
    SELECT c.started_at, c.esito, c.durata, ct.nome AS contatto, u.nome AS operatore
    FROM calls c JOIN contacts ct ON ct.id=c.contact_id JOIN users u ON u.id=c.user_id
    ORDER BY c.started_at DESC LIMIT 10`).all();
  res.json({ appOggi, appDomani, chiamateOggi, operatoriOnline, campagneAttive, richiamiScaduti, ultimeChiamate });
});

/* ---------- IMPOSTAZIONI ---------- */
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});
router.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => Object.entries(req.body || {}).forEach(([k, v]) => up.run(k, String(v))));
  tx();
  res.json({ ok: true });
});

module.exports = router;
