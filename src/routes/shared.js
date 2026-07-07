// Route condivise (admin + operatore): contatti
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const router = express.Router();

const ESITI = ['da_chiamare','in_chiamata','appuntamento_fissato','richiamo','non_interessato','non_risponde','segreteria','occupato','numero_errato','gia_fatto','blacklist','irraggiungibile','fuori_zona'];

router.get('/esiti', (req, res) => res.json(ESITI));

// Lista contatti con filtri e paginazione
router.get('/contacts', (req, res) => {
  const { search = '', esito = '', comune = '', page = 1, per = 50 } = req.query;
  const where = [];
  const params = {};
  if (search) { where.push("(nome || ' ' || COALESCE(cognome,'') LIKE @s OR telefono LIKE @s)"); params.s = `%${search}%`; }
  if (esito) { where.push('esito = @esito'); params.esito = esito; }
  if (comune) { where.push('comune = @comune'); params.comune = comune; }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM contacts ${w}`).get(params).n;
  const perN = Math.min(parseInt(per) || 50, 200);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * perN;
  const rows = db.prepare(`SELECT * FROM contacts ${w} ORDER BY id DESC LIMIT ${perN} OFFSET ${offset}`).all(params);
  res.json({ rows, total, page: parseInt(page) || 1, per: perN });
});

router.get('/contacts/comuni', (req, res) => {
  res.json(db.prepare("SELECT DISTINCT comune FROM contacts WHERE comune IS NOT NULL AND comune != '' ORDER BY comune").all().map(r => r.comune));
});

router.get('/contacts/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contatto non trovato' });
  const calls = db.prepare(`SELECT c.*, u.nome AS operatore FROM calls c JOIN users u ON u.id = c.user_id WHERE c.contact_id = ? ORDER BY c.started_at DESC LIMIT 20`).all(req.params.id);
  const callbacks = db.prepare(`SELECT * FROM callbacks WHERE contact_id = ? AND stato='pendente'`).all(req.params.id);
  const appointments = db.prepare(`SELECT * FROM appointments WHERE contact_id = ? ORDER BY data DESC LIMIT 5`).all(req.params.id);
  res.json({ ...c, storico_chiamate: calls, richiami: callbacks, appuntamenti: appointments });
});

router.post('/contacts', (req, res) => {
  const { nome, cognome, telefono, comune, offerto_da, parentela, esito, note } = req.body;
  if (!nome || !telefono) return res.status(400).json({ error: 'Nome e telefono obbligatori' });
  const r = db.prepare(`INSERT INTO contacts (nome, cognome, telefono, comune, offerto_da, parentela, esito, note)
    VALUES (?,?,?,?,?,?,?,?)`).run(nome, cognome || '', telefono, comune || '', offerto_da || '', parentela || '', ESITI.includes(esito) ? esito : 'da_chiamare', note || '');
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/contacts/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contatto non trovato' });
  const { nome, cognome, telefono, comune, offerto_da, parentela, esito, note } = req.body;
  db.prepare(`UPDATE contacts SET nome=?, cognome=?, telefono=?, comune=?, offerto_da=?, parentela=?, esito=?, note=?, updated_at=datetime('now') WHERE id=?`)
    .run(nome ?? c.nome, cognome ?? c.cognome, telefono ?? c.telefono, comune ?? c.comune, offerto_da ?? c.offerto_da,
         parentela ?? c.parentela, ESITI.includes(esito) ? esito : c.esito, note ?? c.note, req.params.id);
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

// Solo admin: elimina, import, export, cambio esito massivo
router.delete('/contacts/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/contacts/bulk-esito', requireAdmin, (req, res) => {
  const { ids, esito } = req.body;
  if (!Array.isArray(ids) || !ESITI.includes(esito)) return res.status(400).json({ error: 'Parametri non validi' });
  const stmt = db.prepare("UPDATE contacts SET esito = ?, updated_at = datetime('now') WHERE id = ?");
  const tx = db.transaction(() => ids.forEach(id => stmt.run(esito, id)));
  tx();
  res.json({ ok: true, aggiornati: ids.length });
});

router.post('/contacts/import', requireAdmin, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows mancante' });
  let inseriti = 0, saltati = 0;
  const exists = db.prepare('SELECT id FROM contacts WHERE telefono = ?');
  const ins = db.prepare(`INSERT INTO contacts (nome, cognome, telefono, comune, offerto_da, parentela, lat, lng) VALUES (?,?,?,?,?,?,?,?)`);
  const num = v => { const f = parseFloat(String(v || '').replace(',', '.')); return isFinite(f) && f !== 0 ? f : null; };
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!r.nome || !r.telefono) { saltati++; continue; }
      if (exists.get(String(r.telefono).trim())) { saltati++; continue; }
      ins.run(r.nome.trim(), (r.cognome || '').trim(), String(r.telefono).trim(), (r.comune || '').trim(), (r.offerto_da || '').trim(), (r.parentela || '').trim(), num(r.lat), num(r.lng));
      inseriti++;
    }
  });
  tx();
  res.json({ ok: true, inseriti, saltati });
});

// Aggiorna coordinate in blocco (admin) - match per telefono
router.post('/contacts/bulk-geo', requireAdmin, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items mancante' });
  const upd = db.prepare('UPDATE contacts SET lat=?, lng=? WHERE telefono=?');
  let n = 0;
  const tx = db.transaction(() => items.forEach(i => {
    if (i.telefono && i.lat != null && i.lng != null) n += upd.run(i.lat, i.lng, String(i.telefono)).changes;
  }));
  tx();
  res.json({ ok: true, aggiornati: n });
});

router.get('/contacts-export.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT nome, cognome, telefono, comune, offerto_da, parentela, esito, note FROM contacts ORDER BY id').all();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['nome,cognome,telefono,comune,offerto_da,parentela,esito,note',
    ...rows.map(r => [r.nome, r.cognome, r.telefono, r.comune, r.offerto_da, r.parentela, r.esito, r.note].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contatti.csv"');
  res.send(csv);
});

module.exports = { router, ESITI };
