// Popola il DB con dati di prova: operatrice demo, agente, contatti e una campagna attiva
const db = require('../src/db');
const bcrypt = require('bcryptjs');

const opExists = db.prepare("SELECT id FROM users WHERE username='operatrice'").get();
if (!opExists) {
  db.prepare("INSERT INTO users (username, password_hash, nome, ruolo) VALUES ('operatrice', ?, 'Maria Rossi', 'operatore')")
    .run(bcrypt.hashSync('demo123', 10));
  console.log('Operatrice demo creata: operatrice / demo123');
}

if (!db.prepare('SELECT id FROM agents LIMIT 1').get()) {
  db.prepare("INSERT INTO agents (nome, telefono, zone) VALUES ('Luca Bianchi', '+390000000000', 'Napoli e provincia')").run();
  console.log('Agente demo creato');
}

const nContacts = db.prepare('SELECT COUNT(*) n FROM contacts').get().n;
if (nContacts === 0) {
  const demo = [
    ['Giuseppe', 'Esposito', '+393331111111', 'Napoli', 'Sig.ra Anna', 'fratello'],
    ['Maria', 'Russo', '+393332222222', 'Caserta', 'Sig. Paolo', 'cugina'],
    ['Antonio', 'Ferrara', '+393333333333', 'Salerno', '', ''],
    ['Lucia', 'Romano', '+393334444444', 'Napoli', 'Sig.ra Anna', 'amica'],
    ['Francesco', 'Ricci', '+393335555555', 'Aversa', '', ''],
    ['Anna', 'Marino', '+393336666666', 'Napoli', 'Sig. Marco', 'sorella'],
    ['Salvatore', 'Greco', '+393337777777', 'Portici', '', ''],
    ['Carmela', 'Bruno', '+393338888888', 'Torre del Greco', 'Sig.ra Rita', 'madre'],
    ['Vincenzo', 'Gallo', '+393339999999', 'Pozzuoli', '', ''],
    ['Rosa', 'Conti', '+393330000000', 'Napoli', '', '']
  ];
  const ins = db.prepare('INSERT INTO contacts (nome, cognome, telefono, comune, offerto_da, parentela) VALUES (?,?,?,?,?,?)');
  demo.forEach(d => ins.run(...d));
  console.log(`${demo.length} contatti demo creati`);

  const camp = db.prepare("INSERT INTO campaigns (nome, descrizione, stato, modalita) VALUES ('Campagna Demo', 'Campagna di prova con contatti demo', 'attiva', 'coda')").run();
  const ids = db.prepare('SELECT id FROM contacts').all();
  const cc = db.prepare('INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES (?,?)');
  ids.forEach(r => cc.run(camp.lastInsertRowid, r.id));
  console.log('Campagna demo attiva creata con tutti i contatti');
}

console.log('Seed demo completato.');
