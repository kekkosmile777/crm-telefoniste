// Route per le operatrici (postazione chiamata)
const express = require('express');
const db = require('../db');
const presence = require('../presence');
const { ESITI } = require('./shared');
const router = express.Router();

/* Costruisce la scheda contatto rispettando i campi visibili dell'utente (null = tutto) */
function contactPayload(row, user) {
  const vis = user.campi_visibili;
  const has = k => !vis || vis.includes(k);
  const c = { id: row.id, nome: row.nome, cognome: row.cognome, telefono: row.telefono };
  if (has('comune')) c.comune = row.comune;
  if (has('provincia')) c.provincia = row.provincia;
  if (has('cap')) c.cap = row.cap;
  if (has('offerto_da')) c.offerto_da = row.offerto_da;
  if (has('parentela')) c.parentela = row.parentela;
  if (has('note')) c.note = row.note;
  if (has('esito_prec')) c.esito = row.esito;
  if (has('caricato_il')) c.caricato_il = row.created_at;
  if (has('storico')) c.storico = db.prepare(`
    SELECT c.started_at, c.esito, c.note, u.nome AS operatore
    FROM calls c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.contact_id = ? AND c.esito IS NOT NULL
    ORDER BY c.id DESC LIMIT 5`).all(row.id);
  return c;
}

const LOCK_TIMEOUT_MIN = 15; // sblocca contatti rimasti "in_chiamata" da troppo tempo

function releaseStaleLocks() {
  db.prepare(`UPDATE campaign_contacts SET stato='da_chiamare', locked_by=NULL, locked_at=NULL
    WHERE stato='in_chiamata' AND locked_at < datetime('now', '-${LOCK_TIMEOUT_MIN} minutes')`).run();
}

/* Campagne su cui l'operatrice può lavorare */
router.get('/campaigns', (req, res) => {
  releaseStaleLocks();
  const rows = db.prepare(`
    SELECT c.id, c.nome, c.descrizione, c.note, c.copione, c.modalita, c.tipo, c.raggio_km,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id=c.id AND cc.stato='da_chiamare'
        AND (c.modalita='coda' OR cc.assigned_to = @uid)) AS da_fare,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id=c.id AND cc.stato='lavorato'
        AND cc.lavorato_da = @uid) AS miei_fatti,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id=c.id AND cc.assigned_to = @uid) AS assegnati_a_me,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id=c.id AND cc.stato='lavorato') AS fatti_tot,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id=c.id) AS tot
    FROM campaigns c WHERE c.stato='attiva' ORDER BY c.id DESC`).all({ uid: req.user.id });
  if (req.query.all === '1') return res.json(rows);
  res.json(rows.filter(r => r.da_fare > 0 || r.miei_fatti > 0));
});

/* Prossimo contatto: prima i richiami scaduti, poi la coda campagna */
router.post('/next', (req, res) => {
  releaseStaleLocks();
  const uid = req.user.id;
  const campaignId = req.body.campaign_id || null;

  // 1. Richiamo scaduto (assegnato a me o libero)
  const cb = db.prepare(`
    SELECT cb.*, ct.nome, ct.cognome, ct.telefono, ct.comune, ct.provincia, ct.cap, ct.offerto_da, ct.parentela, ct.created_at AS ct_created, ct.note AS contatto_note, ct.esito AS contatto_esito
    FROM callbacks cb JOIN contacts ct ON ct.id = cb.contact_id
    WHERE cb.stato='pendente' AND cb.richiamo_at <= datetime('now','localtime')
      AND (cb.tipo = 'pubblico' OR cb.user_id = ?)
    ORDER BY cb.richiamo_at LIMIT 1`).get(uid);
  if (cb) {
    db.prepare('UPDATE callbacks SET user_id=? WHERE id=?').run(uid, cb.id);
    return res.json({
      tipo: 'richiamo', callback_id: cb.id, campaign_id: cb.campaign_id,
      contact: contactPayload({ id: cb.contact_id, nome: cb.nome, cognome: cb.cognome, telefono: cb.telefono, comune: cb.comune, provincia: cb.provincia, cap: cb.cap, offerto_da: cb.offerto_da, parentela: cb.parentela, note: cb.contatto_note, esito: cb.contatto_esito, created_at: cb.ct_created }, req.user),
      richiamo_at: cb.richiamo_at, richiamo_note: cb.note, richiamo_tipo: cb.tipo
    });
  }

  if (!campaignId) return res.json({ tipo: 'vuoto', motivo: 'Nessun richiamo in scadenza. Seleziona una campagna.' });

  const camp = db.prepare("SELECT * FROM campaigns WHERE id=? AND stato='attiva'").get(campaignId);
  if (!camp) return res.status(400).json({ error: 'Campagna non attiva' });

  // 2. Campagna geolocalizzata: serve una posizione di partenza
  const { lat, lng } = req.body;
  if (camp.tipo === 'geo' && (lat == null || lng == null)) {
    return res.json({ tipo: 'geo_select', motivo: 'Scegli una posizione sulla mappa per iniziare.' });
  }

  // 3. Prossimo contatto della campagna (transazione atomica)
  const tx = db.transaction(() => {
    const cond = camp.modalita === 'assegnata' ? 'AND cc.assigned_to = ?' : "AND (cc.assigned_to IS NULL OR cc.assigned_to = ?)";
    let row;
    if (camp.tipo === 'geo') {
      row = db.prepare(`
        SELECT cc.id AS cc_id, cc.tentativi, ct.*, dist_km(@lat, @lng, ct.lat, ct.lng) AS dist
        FROM campaign_contacts cc JOIN contacts ct ON ct.id = cc.contact_id
        WHERE cc.campaign_id = @cid AND cc.stato = 'da_chiamare' ${cond.replace('?', '@uid')}
          AND ct.esito != 'blacklist'
          AND ct.lat IS NOT NULL AND dist_km(@lat, @lng, ct.lat, ct.lng) <= @raggio
        ORDER BY (cc.saltato_at IS NOT NULL), dist, cc.tentativi LIMIT 1`)
        .get({ lat, lng, cid: campaignId, uid: req.user.id, raggio: camp.raggio_km || 25 });
    } else {
      row = db.prepare(`
        SELECT cc.id AS cc_id, cc.tentativi, ct.*
        FROM campaign_contacts cc JOIN contacts ct ON ct.id = cc.contact_id
        WHERE cc.campaign_id = ? AND cc.stato = 'da_chiamare' AND ct.esito != 'blacklist' ${cond}
        ORDER BY (cc.saltato_at IS NOT NULL), cc.tentativi, cc.id LIMIT 1`).get(campaignId, req.user.id);
    }
    if (!row) return null;
    db.prepare("UPDATE campaign_contacts SET stato='in_chiamata', locked_by=?, locked_at=datetime('now') WHERE id=?").run(uid, row.cc_id);
    return row;
  });
  const row = tx();
  if (!row) {
    if (camp.tipo === 'geo') return res.json({ tipo: 'geo_esaurita', motivo: `Zona esaurita (raggio ${camp.raggio_km || 25} km): scegli un'altra posizione sulla mappa.` });
    return res.json({ tipo: 'vuoto', motivo: 'Nessun contatto da chiamare in questa campagna.' });
  }

  res.json({
    tipo: 'campagna', cc_id: row.cc_id, campaign_id: parseInt(campaignId), tentativi: row.tentativi,
    dist_km: row.dist != null ? Math.round(row.dist * 10) / 10 : null,
    contact: contactPayload(row, req.user)
  });
});

/* Punti mappa per campagna geolocalizzata */
router.get('/campaigns/:id/geo-points', (req, res) => {
  releaseStaleLocks();
  const points = db.prepare(`
    SELECT ct.id, ct.nome, ct.cognome, ct.comune, ct.lat, ct.lng
    FROM campaign_contacts cc JOIN contacts ct ON ct.id = cc.contact_id
    WHERE cc.campaign_id = ? AND cc.stato = 'da_chiamare' AND ct.lat IS NOT NULL AND ct.lng IS NOT NULL
    LIMIT 5000`).all(req.params.id);
  const senza = db.prepare(`
    SELECT COUNT(*) n FROM campaign_contacts cc JOIN contacts ct ON ct.id = cc.contact_id
    WHERE cc.campaign_id = ? AND cc.stato = 'da_chiamare' AND (ct.lat IS NULL OR ct.lng IS NULL)`).get(req.params.id).n;
  res.json({ points, senza_posizione: senza });
});

/* Salta il contatto corrente (lo rimette in coda) */
router.post('/skip', (req, res) => {
  const { cc_id } = req.body;
  if (cc_id) db.prepare("UPDATE campaign_contacts SET stato='da_chiamare', locked_by=NULL, locked_at=NULL, saltato_at=datetime('now') WHERE id=? AND locked_by=?").run(cc_id, req.user.id);
  res.json({ ok: true });
});

/* Inizio chiamata */
router.post('/calls/start', (req, res) => {
  const { contact_id, campaign_id, mode } = req.body;
  const ct = db.prepare('SELECT * FROM contacts WHERE id=?').get(contact_id);
  if (!ct) return res.status(404).json({ error: 'Contatto non trovato' });
  const r = db.prepare("INSERT INTO calls (contact_id, campaign_id, user_id, mode) VALUES (?,?,?,?)")
    .run(contact_id, campaign_id || null, req.user.id, mode === 'manuale' ? 'manuale' : 'twilio');
  db.prepare("UPDATE contacts SET esito='in_chiamata', updated_at=datetime('now') WHERE id=?").run(contact_id);
  res.json({ call_id: r.lastInsertRowid });
});

/* Salva il CallSid Twilio appena la chiamata è connessa (per la registrazione) */
router.post('/calls/:id/sid', (req, res) => {
  const { twilio_sid } = req.body || {};
  if (twilio_sid) db.prepare('UPDATE calls SET twilio_sid=? WHERE id=? AND user_id=?').run(twilio_sid, req.params.id, req.user.id);
  res.json({ ok: true });
});

/* Richiami in scadenza nei prossimi minuti (per avviso) */
router.get('/callbacks/upcoming', (req, res) => {
  const rows = db.prepare(`
    SELECT cb.id, cb.richiamo_at, ct.nome, ct.cognome
    FROM callbacks cb JOIN contacts ct ON ct.id = cb.contact_id
    WHERE cb.stato='pendente' AND (cb.tipo = 'pubblico' OR cb.user_id = ?)
      AND cb.richiamo_at > datetime('now','localtime')
      AND cb.richiamo_at <= datetime('now','localtime','+5 minutes')
    ORDER BY cb.richiamo_at LIMIT 10`).all(req.user.id);
  res.json(rows);
});

/* Fine chiamata + esito (obbligatorio) */
router.post('/calls/:id/end', (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!call) return res.status(404).json({ error: 'Chiamata non trovata' });
  const { esito, note, durata, cc_id, callback_id, richiamo_at, richiamo_note, richiamo_tipo, appuntamento, twilio_sid } = req.body;
  if (!ESITI.includes(esito)) return res.status(400).json({ error: 'Esito non valido' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE calls SET ended_at=datetime('now'), durata=?, esito=?, note=?, twilio_sid=? WHERE id=?")
      .run(parseInt(durata) || 0, esito, note || '', twilio_sid || call.twilio_sid, call.id);
    db.prepare("UPDATE contacts SET esito=?, updated_at=datetime('now') WHERE id=?").run(esito, call.contact_id);

    // aggiorna riga campagna
    if (cc_id) {
      const cc = db.prepare('SELECT cc.*, c.max_tentativi FROM campaign_contacts cc JOIN campaigns c ON c.id=cc.campaign_id WHERE cc.id=?').get(cc_id);
      if (cc) {
        const retryEsiti = ['non_risponde', 'occupato', 'segreteria', 'irraggiungibile'];
        const tentativi = cc.tentativi + 1;
        if (retryEsiti.includes(esito) && tentativi < cc.max_tentativi) {
          db.prepare("UPDATE campaign_contacts SET stato='da_chiamare', tentativi=?, esito=?, locked_by=NULL, locked_at=NULL WHERE id=?").run(tentativi, esito, cc_id);
        } else {
          db.prepare("UPDATE campaign_contacts SET stato='lavorato', tentativi=?, esito=?, locked_by=NULL, locked_at=NULL, lavorato_da=?, lavorato_at=datetime('now') WHERE id=?")
            .run(tentativi, esito, req.user.id, cc_id);
        }
      }
    }

    // chiudi richiamo lavorato
    if (callback_id) db.prepare("UPDATE callbacks SET stato='fatto', done_at=datetime('now') WHERE id=?").run(callback_id);

    // nuovo richiamo
    if (esito === 'richiamo') {
      if (!richiamo_at) throw new Error('Data richiamo obbligatoria');
      const cbPub = richiamo_tipo === 'pubblico';
      db.prepare('INSERT INTO callbacks (contact_id, campaign_id, user_id, richiamo_at, note, tipo) VALUES (?,?,?,?,?,?)')
        .run(call.contact_id, call.campaign_id, cbPub ? null : req.user.id, richiamo_at.replace('T', ' '), richiamo_note || '', cbPub ? 'pubblico' : 'privato');
    }

    // nuovo appuntamento
    if (esito === 'appuntamento_fissato') {
      if (!appuntamento || !appuntamento.data) throw new Error('Data appuntamento obbligatoria');
      db.prepare('INSERT INTO appointments (contact_id, agent_id, user_id, data, ora, indirizzo, note) VALUES (?,?,?,?,?,?,?)')
        .run(call.contact_id, appuntamento.agent_id || null, req.user.id, appuntamento.data, appuntamento.ora || '', appuntamento.indirizzo || '', appuntamento.note || '');
    }
  });

  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

/* Le mie chiamate */
router.get('/calls', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono AS contatto_telefono, cp.nome AS campagna
    FROM calls c JOIN contacts ct ON ct.id=c.contact_id LEFT JOIN campaigns cp ON cp.id=c.campaign_id
    WHERE c.user_id = ? ORDER BY c.started_at DESC LIMIT 100`).all(req.user.id);
  res.json(rows);
});

/* I miei richiami */
router.get('/callbacks', (req, res) => {
  const rows = db.prepare(`
    SELECT cb.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono, cp.nome AS campagna
    FROM callbacks cb JOIN contacts ct ON ct.id=cb.contact_id LEFT JOIN campaigns cp ON cp.id=cb.campaign_id
    WHERE cb.stato='pendente' AND (cb.tipo = 'pubblico' OR cb.user_id = ?)
    ORDER BY cb.richiamo_at LIMIT 100`).all(req.user.id);
  res.json(rows);
});

/* I miei appuntamenti */
router.get('/appointments', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, ct.nome AS contatto_nome, ct.cognome AS contatto_cognome, ct.telefono, ag.nome AS agente
    FROM appointments a LEFT JOIN contacts ct ON ct.id=a.contact_id LEFT JOIN agents ag ON ag.id=a.agent_id
    WHERE a.user_id = ? AND a.data >= date('now','localtime','-7 days') ORDER BY a.data, a.ora`).all(req.user.id);
  res.json(rows);
});

/* Agenti disponibili (per fissare appuntamenti) */
router.get('/agents', (req, res) => {
  res.json(db.prepare('SELECT id, nome, zone FROM agents WHERE attivo=1 ORDER BY nome').all());
});

/* Statistiche personali di oggi */
router.get('/mystats', (req, res) => {
  const s = db.prepare(`
    SELECT COUNT(*) chiamate, COALESCE(SUM(durata),0) sec,
      SUM(CASE WHEN esito='appuntamento_fissato' THEN 1 ELSE 0 END) appuntamenti,
      SUM(CASE WHEN esito='richiamo' THEN 1 ELSE 0 END) richiami
    FROM calls WHERE user_id=? AND date(started_at)=date('now','localtime')`).get(req.user.id);
  res.json(s);
});

/* Heartbeat presenza */
router.post('/heartbeat', (req, res) => {
  presence.beat(req.user.id, req.body || {});
  res.json({ ok: true });
});

/* Risoluzione numero per chiamata manuale (tastierino) */
router.post('/resolve-number', (req, res) => {
  const tel = String((req.body || {}).telefono || '').replace(/[^+0-9]/g, '');
  if (!tel || tel.length < 3) return res.status(400).json({ error: 'Numero non valido' });
  let c = db.prepare('SELECT * FROM contacts WHERE telefono = ?').get(tel);
  if (!c) {
    const r = db.prepare("INSERT INTO contacts (nome, cognome, telefono, esito) VALUES ('Chiamata', 'manuale', ?, 'da_chiamare')").run(tel);
    c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(r.lastInsertRowid);
  }
  res.json(c);
});

module.exports = router;
