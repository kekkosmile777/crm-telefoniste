# CRM Telefoniste

CRM per telemarketing con **operatrici umane**, ispirato al progetto "giusy-bridge" ma ricostruito da zero, senza telefoniste IA.

## Ruoli

**Amministratore** — gestisce tutto: campagne (creazione, contatti, avvio/pausa, modalità di distribuzione), contatti (CRUD, import/export CSV), utenti e operatrici, agenti sul territorio, appuntamenti con calendario, richiami, registro chiamate completo, report e statistiche, monitor live delle operatrici.

**Operatrice** — postazione di chiamata: seleziona la campagna, preme "Prossima chiamata", il sistema le propone il contatto (prima i richiami scaduti), chiama col softphone nel browser (o manualmente) e registra l'esito obbligatorio. Vede solo i propri richiami, chiamate e appuntamenti, più la gestione contatti base.

## Flusso chiamata operatrice

1. Seleziona campagna → **▶ Prossima chiamata**
2. Il sistema propone il contatto (richiami scaduti hanno priorità; nessun doppione tra operatrici grazie al lock)
3. **📞 Chiama** → softphone Twilio nel browser, oppure modalità manuale
4. A fine chiamata seleziona l'**esito**: appuntamento fissato (con data/ora/indirizzo/agente), richiamo (con data/ora), non interessato, non risponde, ecc.
5. Esiti "non risponde / occupato / segreteria / irraggiungibile" rimettono il contatto in coda fino a *max tentativi* (configurabile per campagna)

## Modalità di distribuzione campagna

- **Coda automatica**: qualsiasi operatrice riceve il prossimo contatto libero
- **Liste assegnate**: l'admin assegna i contatti alle singole operatrici

## Avvio locale

```bash
npm install
npm run seed-demo   # opzionale: dati di prova
npm start           # http://localhost:3000
```

Credenziali iniziali: `admin / admin123` (cambiala subito). Con il seed demo: `operatrice / demo123`.

## Telefonia (Twilio Voice - softphone nel browser)

Senza configurazione il CRM funziona in **modalità manuale** (l'operatrice chiama dal proprio telefono e registra gli esiti). Per attivare il softphone:

1. Crea un account [Twilio](https://www.twilio.com) e compra un numero abilitato voice
2. Console → Account → API keys: crea una **API Key** (SID `SK...` + Secret)
3. Console → Voice → TwiML Apps: crea una TwiML App con **Voice Request URL** = `https://TUO-DOMINIO/api/twilio/voice` (POST)
4. Imposta le variabili d'ambiente:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxx
TWILIO_API_SECRET=xxxxxxxx
TWILIO_TWIML_APP_SID=APxxxxxxxx
```

5. Il **numero in uscita (caller ID)** si seleziona dalla dashboard admin → Impostazioni → Telefonia (elenco automatico dei numeri dell'account). `TWILIO_CALLER_ID` è opzionale come fallback.

Nota: per chiamare numeri italiani da trial Twilio i numeri destinatari vanno verificati; con account a pagamento serve l'abilitazione geo-permissions per l'Italia.

## Deploy su Render

1. Carica la cartella su un repo GitHub
2. Render → New Web Service → collega il repo (`npm install` / `npm start` sono già rilevati; incluso `render.yaml`)
3. Aggiungi un **Persistent Disk** montato su `/data` e imposta `DATA_DIR=/data` (altrimenti il database si azzera a ogni deploy)
4. Imposta le variabili d'ambiente: `JWT_SECRET` (stringa casuale), `ADMIN_PASSWORD` e quelle Twilio

## Variabili d'ambiente

| Variabile | Descrizione |
|---|---|
| `PORT` | Porta (default 3000) |
| `DATA_DIR` | Cartella del database SQLite (default `./data`) |
| `JWT_SECRET` | Segreto per i token di sessione — **impostalo in produzione** |
| `ADMIN_PASSWORD` | Password iniziale dell'admin al primo avvio |
| `TWILIO_*` | Vedi sezione Telefonia |

## Struttura

```
server.js              avvio Express + routing
src/db.js              schema SQLite + seed admin
src/auth.js            login JWT + middleware ruoli
src/presence.js        stato live operatrici (monitor)
src/routes/shared.js   contatti (admin + operatrice)
src/routes/admin.js    campagne, utenti, agenti, report, monitor, ecc.
src/routes/operator.js coda chiamate, esiti, richiami, heartbeat
src/routes/twilio.js   token Voice SDK + webhook TwiML
public/                frontend SPA (vanilla JS)
scripts/seed-demo.js   dati di prova
```
