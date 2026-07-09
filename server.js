const express = require('express');
const path = require('path');
require('./src/db'); // inizializza DB + seed admin

const { login, requireAuth, requireAdmin } = require('./src/auth');
const shared = require('./src/routes/shared');
const adminRoutes = require('./src/routes/admin');
const operatorRoutes = require('./src/routes/operator');
const twilioRoutes = require('./src/routes/twilio');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true })); // per i webhook Twilio

// ---- Healthcheck (per monitoraggio uptime) ----
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---- Auth (con protezione anti brute-force) ----
const loginAttempts = new Map(); // ip|username -> { count, reset }
setInterval(() => { const now = Date.now(); for (const [k, v] of loginAttempts) if (now > v.reset) loginAttempts.delete(k); }, 10 * 60000).unref();

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username e password obbligatori' });
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const key = ip + '|' + username.trim().toLowerCase();
  const now = Date.now();
  let rec = loginAttempts.get(key);
  if (!rec || now > rec.reset) rec = { count: 0, reset: now + 15 * 60000 };
  if (rec.count >= 8) return res.status(429).json({ error: 'Troppi tentativi falliti: riprova tra 15 minuti' });
  const result = login(username.trim().toLowerCase(), password);
  if (!result) {
    rec.count++; loginAttempts.set(key, rec);
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  if (result.error) return res.status(403).json({ error: result.error });
  loginAttempts.delete(key);
  res.json(result);
});

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

// ---- API ----
app.use('/api/twilio', twilioRoutes);                                 // token protetto internamente, webhook pubblico
app.use('/api', requireAuth, shared.router);                          // contatti (admin + operatore)
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);        // solo admin
app.use('/api/op', requireAuth, operatorRoutes);                      // postazione operatrice

// ---- Frontend ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM Telefoniste avviato su http://localhost:${PORT}`));
