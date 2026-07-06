const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-questo-segreto-in-produzione';

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND attivo = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  const token = jwt.sign({ id: user.id, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '12h' });
  return { token, user: publicUser(user) };
}

function publicUser(u) {
  return { id: u.id, username: u.username, nome: u.nome, ruolo: u.ruolo, attivo: u.attivo };
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autenticato' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND attivo = 1').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Utente non valido' });
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
