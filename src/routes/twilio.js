// Integrazione Twilio Voice: softphone nel browser (WebRTC)
// Variabili d'ambiente richieste:
//   TWILIO_ACCOUNT_SID   - Account SID (ACxxxx)
//   TWILIO_API_KEY       - API Key SID (SKxxxx)
//   TWILIO_API_SECRET    - API Key Secret
//   TWILIO_TWIML_APP_SID - TwiML App SID (APxxxx) con Voice URL -> POST /api/twilio/voice
//   TWILIO_CALLER_ID     - Numero Twilio verificato (es. +39xxxxxxxxxx)
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');

const {
  TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID, TWILIO_CALLER_ID
} = process.env;

const configured = !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY && TWILIO_API_SECRET && TWILIO_TWIML_APP_SID && TWILIO_CALLER_ID);

let twilio = null;
if (configured) twilio = require('twilio');

// Il frontend chiede se il softphone è disponibile
router.get('/config', requireAuth, (req, res) => {
  res.json({ configured, caller_id: configured ? TWILIO_CALLER_ID : null });
});

// Access token per il Voice SDK nel browser
router.get('/token', requireAuth, (req, res) => {
  if (!configured) return res.status(503).json({ error: 'Twilio non configurato: il CRM funziona in modalità manuale' });
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
  res.type('text/xml');
  if (!to) {
    return res.send('<Response><Say language="it-IT">Numero non valido</Say></Response>');
  }
  const escaped = to.replace(/[^+0-9]/g, '');
  res.send(`<Response><Dial callerId="${TWILIO_CALLER_ID}" answerOnBridge="true"><Number>${escaped}</Number></Dial></Response>`);
});

module.exports = router;
