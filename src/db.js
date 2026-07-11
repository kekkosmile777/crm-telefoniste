// Database SQLite (better-sqlite3). Su Render: montare un disco persistente su ./data
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'crm.db'));
try { db.pragma('journal_mode = WAL'); } catch { /* alcuni filesystem non supportano WAL */ }
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  ruolo TEXT NOT NULL CHECK (ruolo IN ('admin','operatore')),
  attivo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefono TEXT,
  zone TEXT,
  attivo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cognome TEXT,
  telefono TEXT NOT NULL,
  comune TEXT,
  offerto_da TEXT,
  parentela TEXT,
  esito TEXT NOT NULL DEFAULT 'da_chiamare',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_esito ON contacts(esito);
CREATE INDEX IF NOT EXISTS idx_contacts_comune ON contacts(comune);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descrizione TEXT,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','attiva','in_pausa','completata','archiviata')),
  modalita TEXT NOT NULL DEFAULT 'coda' CHECK (modalita IN ('coda','assegnata')),
  obiettivo_app INTEGER NOT NULL DEFAULT 0,
  max_tentativi INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stato TEXT NOT NULL DEFAULT 'da_chiamare' CHECK (stato IN ('da_chiamare','in_chiamata','lavorato')),
  esito TEXT,
  tentativi INTEGER NOT NULL DEFAULT 0,
  locked_by INTEGER,
  locked_at TEXT,
  lavorato_da INTEGER,
  lavorato_at TEXT,
  UNIQUE(campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_cc_campaign ON campaign_contacts(campaign_id, stato);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  durata INTEGER NOT NULL DEFAULT 0,
  esito TEXT,
  note TEXT,
  mode TEXT NOT NULL DEFAULT 'twilio',
  twilio_sid TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_calls_campaign ON calls(campaign_id);

CREATE TABLE IF NOT EXISTS callbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  presa_at TEXT NOT NULL DEFAULT (datetime('now')),
  richiamo_at TEXT NOT NULL,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'pendente' CHECK (stato IN ('pendente','fatto','annullato')),
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_callbacks_due ON callbacks(stato, richiamo_at);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  ora TEXT,
  indirizzo TEXT,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'confermato' CHECK (stato IN ('confermato','annullato','fatto')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_data ON appointments(data);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Migrazioni additive (ignora errori se la colonna esiste già)
for (const sql of [
  "ALTER TABLE contacts ADD COLUMN lat REAL",
  "ALTER TABLE contacts ADD COLUMN lng REAL",
  "ALTER TABLE contacts ADD COLUMN provincia TEXT",
  "ALTER TABLE contacts ADD COLUMN cap TEXT",
  "ALTER TABLE campaigns ADD COLUMN tipo TEXT NOT NULL DEFAULT 'manuale'",
  "ALTER TABLE campaigns ADD COLUMN raggio_km INTEGER NOT NULL DEFAULT 25",
  "ALTER TABLE users ADD COLUMN permessi TEXT",
  "ALTER TABLE users ADD COLUMN orario_dal TEXT",
  "ALTER TABLE users ADD COLUMN orario_al TEXT",
  "ALTER TABLE users ADD COLUMN orario_settimana TEXT",
  "ALTER TABLE campaigns ADD COLUMN copione TEXT",
  "ALTER TABLE calls ADD COLUMN recording_sid TEXT",
  "ALTER TABLE calls ADD COLUMN recording_dur INTEGER",
  "ALTER TABLE callbacks ADD COLUMN tipo TEXT NOT NULL DEFAULT 'privato'",
  "ALTER TABLE campaign_contacts ADD COLUMN saltato_at TEXT",
  "ALTER TABLE users ADD COLUMN campi_visibili TEXT",
  "ALTER TABLE contacts ADD COLUMN extra TEXT",
  "ALTER TABLE appointments ADD COLUMN civico TEXT",
  "ALTER TABLE appointments ADD COLUMN citta TEXT",
  "ALTER TABLE appointments ADD COLUMN igienizzazione TEXT",
  "ALTER TABLE appointments ADD COLUMN lavoro_mm TEXT",
  "ALTER TABLE appointments ADD COLUMN flag_we INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE appointments ADD COLUMN flag_pers INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE appointments ADD COLUMN ck TEXT",
  "ALTER TABLE appointments ADD COLUMN preso_il TEXT",
  `CREATE TABLE IF NOT EXISTS user_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stato TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    last_beat TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_usl_user ON user_status_log(user_id, started_at)"
]) { try { db.exec(sql); } catch {} }

// Distanza haversine in km, usabile nelle query SQL
db.function('dist_km', (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
});

// Seed admin se non esiste nessun utente
const nUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (nUsers === 0) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.prepare("INSERT INTO users (username, password_hash, nome, ruolo) VALUES ('admin', ?, 'Amministratore', 'admin')").run(hash);
  console.log("Creato utente admin (password: " + (process.env.ADMIN_PASSWORD ? '[ADMIN_PASSWORD]' : 'admin123') + ")");
}

module.exports = db;
