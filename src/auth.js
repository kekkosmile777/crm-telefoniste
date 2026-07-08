const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { checkOrario } = require('./orario');

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-questo-segreto-in-produzione';

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND attivo = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  const bloccoOrario = checkOrario(user);
  if (bloccoOrario) return { error: 'Accesso non consentito: ' + bloccoOrario };
  const token = jwt.sign({ id: user.id, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '12h' });
  return { token, user: publicUser(user) };
}

function publicUser(u) {
  let permessi = null;
  try { if (u.permessi) permessi = JSON.parse(u.permessi); } catch {}
  let orario_settimana = null;
  try { if (u.orario_settimana) orario_settimana = JSON.parse(u.orario_settimana); } catch {}
  return { id: u.id, username: u.username, nome: u.nome, ruolo: u.ruolo, attivo: u.attivo, permessi, orario_dal: u.orario_dal || null, orario_al: u.orario_al || null, orario_settimana };
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autenticato' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND attivo = 1').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Utente non valido' });
    const bloccoOrario = checkOrario(user);
    if (bloccoOrario) return res.status(401).json({ error: bloccoOrario + ' — sessione terminata' });
    req.user = publicUser(user);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token scaduto o non valido' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.ruolo !== 'admin') return res.status(403).json({ error: 'Riservato agli amministratori' });
  next();
}

module.exports = { login, requireAuth, requireAdmin, publicUser };
