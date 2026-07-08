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

// ---- Auth ----
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username e password obbligatori' });
  const result = login(username.trim().toLowerCase(), password);
  if (!result) return res.status(401).json({ error: 'Credenziali non valide' });
  if (result.error) return res.status(403).json({ error: result.error });
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
