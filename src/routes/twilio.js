// Integrazione Twilio Voice: softphone nel browser (WebRTC)
// Variabili d'ambiente richieste:
//   TWILIO_ACCOUNT_SID   - Account SID (ACxxxx)
//   TWILIO_API_KEY       - API Key SID (SKxxxx)
//   TWILIO_API_SECRET    - API Key Secret
//   TWILIO_TWIML_APP_SID - TwiML App SID (APxxxx) con Voice URL -> POST /api/twilio/voice
// Il numero in uscita (caller ID) si seleziona dalla dashboard admin (Impostazioni)
// ed e' salvato nel database (settings.caller_id). TWILIO_CALLER_ID resta come fallback.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const {
  TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID
} = process.env;

const configured = !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY && TWILIO_API_SECRET && TWILIO_TWIML_APP_SID);

let twilio = null;
if (configured) twilio = require('twilio');

function getCallerId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'caller_id'").get();
  return (row && row.value) || process.env.TWILIO_CALLER_ID || null;
}

// Il frontend chiede se il softphone è disponibile
router.get('/config', requireAuth, (req, res) => {
  const callerId = getCallerId();
  res.json({ configured: configured && !!callerId, twilio_ok: configured, caller_id: callerId });
});

// Elenco numeri dell'account (solo admin, per scegliere il caller ID)
router.get('/numbers', requireAuth, requireAdmin, async (req, res) => {
  if (!configured) return res.status(503).json({ error: 'Twilio non configurato' });
  try {
    const client = twilio(TWILIO_API_KEY, TWILIO_API_SECRET, { accountSid: TWILIO_ACCOUNT_SID });
    const nums = await client.incomingPhoneNumbers.list({ limit: 50 });
    res.json(nums.filter(n => n.capabilities.voice).map(n => ({ numero: n.phoneNumber, nome: n.friendlyName })));
  } catch (e) {
    res.status(500).json({ error: 'Errore Twilio: ' + e.message });
  }
});

// Imposta il caller ID (solo admin)
router.put('/caller-id', requireAuth, requireAdmin, (req, res) => {
  const { caller_id } = req.body || {};
  db.prepare("INSERT INTO settings (key, value) VALUES ('caller_id', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(caller_id || '');
  res.json({ ok: true, caller_id: caller_id || null });
});

// Access token per il Voice SDK nel browser
router.get('/token', requireAuth, (req, res) => {
  if (!configured) return res.status(503).json({ error: 'Twilio non configurato: il CRM funziona in modalità manuale' });
  if (!getCallerId()) return res.status(503).json({ error: 'Nessun numero in uscita selezionato: chiedi all\'amministratore (Impostazioni)' });
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity: `operatore_${req.user.id}`,
    ttl: 3600
  });
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: TWILIO_TWIML_APP_SID }));
  res.json({ token: token.toJwt(), identity: `operatore_${req.user.id}` });
});

// Webhook TwiML: Twilio chiama questo endpoint quando il browser avvia una chiamata
router.post('/voice', (req, res) => {
  const to = (req.body.To || '').trim();
  const callerId = getCallerId();
  res.type('text/xml');
  if (!to || !callerId) {
    return res.send('<Response><Say language="it-IT">Configurazione non valida</Say></Response>');
  }
  const escaped = to.replace(/[^+0-9]/g, '');
  res.send(`<Response><Dial callerId="${callerId}" answerOnBridge="true"><Number>${escaped}</Number></Dial></Response>`);
});

module.exports = router;
