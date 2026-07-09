# CRM Telefoniste — Manuale completo

**Indirizzo:** https://crm-telefoniste.onrender.com
**Ruoli:** Amministratore (gestisce tutto) · Operatrice (chiama e registra esiti)

---

## 1. Panoramica

CRM per telemarketing con operatrici umane. L'admin prepara i contatti e le campagne; le operatrici lavorano da una postazione con softphone integrato nel browser (chiamano con le cuffie, senza telefono fisico). Ogni chiamata termina obbligatoriamente con un esito, che aggiorna automaticamente contatti, richiami, appuntamenti e statistiche.

**Telefonia:** Twilio, su subaccount dedicato (separato dagli altri progetti). Numeri in uscita: +39 0968 1888077 e +39 0968 1888078, selezionabili da Impostazioni.

---

## 2. Accesso e sicurezza

| Funzione | Come funziona |
|---|---|
| Login | Username + password. Dopo 8 tentativi falliti l'accesso è bloccato 15 minuti (anti forzatura) |
| Sessione | Dura 12 ore, poi serve nuovo login |
| Permessi per utente | L'admin decide quali voci di menu ogni utente può usare (spunte nella scheda utente). Voce non abilitata = invisibile |
| Orario di lavoro | Planning settimanale (per giorno: fascia + pausa). Fuori orario le operatrici non entrano e chi è dentro viene scollegata. Gli admin non hanno limiti |
| Fuso orario | Tutti gli orari sono sull'ora italiana |

---

## 3. Lato AMMINISTRATORE

### 3.1 Dashboard
Quadro della giornata: chiamate di oggi, operatrici online, appuntamenti oggi/domani, richiami scaduti, campagne attive, ultime 10 chiamate. Si aggiorna da sola ogni 15 secondi.

### 3.2 Monitor live
Una scheda per operatrice in tempo reale: 🟢 Disponibile · 🔴 In chiamata (con nome e numero del cliente) · Compila esito · ☕ In pausa · ⚪ Offline. Più chiamate e minuti di oggi. Aggiornamento ogni 8 secondi.

### 3.3 Campagne

**Stati campagna:**

| Stato | Significato |
|---|---|
| Bozza | Appena creata, invisibile alle operatrici. Qui si aggiungono i contatti |
| Attiva ▶ | Le operatrici la vedono e possono lavorarla |
| In pausa ⏸ | Sospesa temporaneamente, sparisce alle operatrici |
| Completata | Chiusa |
| Archiviata | Storico |

**Tipi di campagna:**

| Tipo | Comportamento |
|---|---|
| Manuale | L'operatrice preme "Prossima chiamata" per ogni contatto |
| ⚡ Predictive | Dopo aver salvato l'esito, il sistema aggancia il contatto successivo e avvia la chiamata da solo (zero tempi morti) |
| 📍 Geolocalizzata | L'operatrice sceglie una zona sulla mappa (bolle con numero di contatti per comune) e la coda prosegue per vicinanza entro il raggio impostato (default 25 km). Zona esaurita → sceglie un'altra zona |

**Modalità di distribuzione:** Coda automatica (chiunque pesca il prossimo contatto libero, senza doppioni) oppure Liste assegnate (l'admin assegna i contatti alle singole operatrici).

**Altre impostazioni campagna:** descrizione, note operative (visibili all'operatrice), 📜 copione di chiamata (mostrato in chiamata, con segnaposto {nome} {cognome} {comune}), max tentativi per i "non risponde" (default 3), obiettivo appuntamenti, raggio km (solo geo).

**Gestione contatti in campagna (👥):** aggiunta con filtri, rimozione, assegnazione alle operatrici, "rimetti in coda" i lavorati, filtro **⚠ Non geolocalizzati** e **✏️ Modifica selezionati** (comune/provincia/CAP a più contatti insieme, con ricalcolo posizione).

**🗺 Mappa:** bolle per zona con il numero di contatti ancora da chiamare — fotografia dell'avanzamento sul territorio.

**Flusso corretto:** + Nuova → 👥 aggiungi contatti → ▶ Avvia.

### 3.4 Contatti
Anagrafica completa: nome, cognome, telefono, comune, provincia, CAP, offerto da, parentela, esito, note, posizione.

- **Import CSV:** riconosce da solo separatore (`,` o `;`), virgolette e intestazioni anche dei gestionali ("Nome Anagrafica", "Telefono Fisso Anagrafica", "Cellulare"...). Scarta righe senza telefono e doppioni. A fine import dice quanti sono geolocalizzati
- **Geolocalizzazione:** calcolata da comune + provincia + CAP sul database ufficiale dei 7.904 comuni italiani (le coordinate nei file vengono ignorate). Chi non viene agganciato è marcato ⚠ e si sistema anche in blocco
- **Filtri:** ricerca nome/telefono, esito, comune, provincia, CAP (anche prefisso), offerto da, parentela, geolocalizzato sì/no + reset
- **Azioni per riga:** 📞 chiama subito · 👁 scheda con storico chiamate/richiami/appuntamenti · ✏️ modifica · 🗑 elimina
- **Azioni massive (solo admin):** export CSV, eliminazione

### 3.5 Registro chiamate
Tutte le chiamate di tutte le operatrici con filtri (esito, operatrice, campagna, date). Colonna 🔊 con **▶ per riascoltare le chiamate registrate**. **📊 Export Excel** dell'elenco.

### 3.6 Richiami
Tutti i richiami pendenti: quando è stata presa la nota e quando va richiamato (rosso se scaduto). Modificabili e annullabili. I richiami scaduti vengono proposti automaticamente alle operatrici prima della coda normale.

### 3.7 Appuntamenti
Calendario mensile + lista. Ogni esito "Appuntamento fissato" ne crea uno automaticamente con data, ora, indirizzo e agente sul territorio. Stati: confermato / fatto / annullato.

### 3.8 Report
Filtrabile per periodo: totali (chiamate, appuntamenti, conversione %, durata media, ore al telefono), andamento giornaliero, esiti, tabella per operatrice, tabella per campagna e **⏱ Produttività** (tempo Disponibile / In chiamata / Post-chiamata / In pausa per operatrice + **chiamate/ora** sul tempo effettivo di lavoro). **📊 Export Excel**.

### 3.9 Utenti
Creazione e gestione account. Per ogni utente: ruolo (Admin/Operatrice), **funzioni abilitate** (spunte), **orario di lavoro** (generale o planning personalizzato), attiva/disattiva, reset password. Non puoi toglierti da solo la gestione utenti 🔒.

### 3.10 Agenti
Anagrafica degli agenti sul territorio (nome, telefono, zone) che vanno agli appuntamenti. Selezionabili quando si fissa un appuntamento.

### 3.11 Impostazioni
- **Telefonia:** stato Twilio, 🔴 registrazione chiamate on/off, numero in uscita a scelta tra quelli del subaccount
- **🕐 Orario generale:** planning settimanale (giorno per giorno, con pausa) valido per tutte le operatrici senza orario personalizzato
- **🔒 Sicurezza e backup:** 💾 scarica il backup completo del database (consigliato: settimanale)
- **📝 Note** interne

---

## 4. Lato OPERATRICE

### 4.1 Postazione (cuore del lavoro)
1. Seleziona la campagna → **▶ Prossima chiamata**
2. Il sistema propone il contatto: **prima i richiami scaduti**, poi la coda (per le geo: il più vicino nella zona scelta, con distanza in km)
3. **📞 Chiama** → softphone nel browser. In chiamata: **🔇 Muto**, **🔊 volume**, sensibilità microfono, timer
4. **📜 Copione** della campagna già personalizzato col nome del cliente
5. A fine chiamata **esito obbligatorio** (pannello a destra) + note
6. **☕ Vai in pausa / ▶ Riprendi** — in pausa le chiamate sono sospese e il tempo viene tracciato
7. **⏭ Salta** rimette il contatto in coda

In alto: contatore personale di oggi (chiamate, appuntamenti, richiami, tempo al telefono). **⏰ Avviso automatico** quando un richiamo scade entro 5 minuti.

### 4.2 Campagne
Schede delle campagne attive con tipo, note dell'admin, contatti da fare, avanzamento e "▶ Lavora questa campagna".

### 4.3 Telefono
Tastierino per chiamate libere fuori campagna (il +39 si aggiunge da solo). Il numero chiamato viene salvato come contatto e la chiamata nel registro, con esito.

### 4.4 I miei richiami / Le mie chiamate / I miei appuntamenti
Le proprie liste personali (con riascolto delle proprie registrazioni).

### 4.5 Contatti
Consultazione e modifica anagrafica, cornetta 📞 per chiamata immediata. Niente eliminazione né import (riservati all'admin).

---

## 5. Gli ESITI di chiamata (13)

| Esito | Significato | Cosa succede dopo |
|---|---|---|
| Da chiamare | Non ancora lavorato | In coda |
| In chiamata | Telefonata in corso | Stato temporaneo |
| ✅ Appuntamento fissato | Obiettivo raggiunto | Chiede data/ora/indirizzo/agente e crea l'appuntamento in calendario |
| 🔄 Richiamo | Da risentire | Chiede data/ora e tipo: **Privato** (torna solo all'operatrice che l'ha preso) o **Pubblico** (può prenderlo qualsiasi operatrice). Il contatto ricompare in coda al momento giusto. L'admin può cambiare il tipo dalla sezione Richiami |
| ❌ Non interessato | Rifiuto | Chiuso in campagna |
| Non risponde | Nessuna risposta | **Torna in coda** fino a "max tentativi", poi chiuso |
| Segreteria | Risponde la segreteria | Come "non risponde" (ritenta) |
| Occupato | Linea occupata | Come "non risponde" (ritenta) |
| Irraggiungibile | Non raggiungibile | Come "non risponde" (ritenta) |
| Numero errato | Numero sbagliato | Chiuso |
| Già fatto | Già contattato/cliente | Chiuso |
| ⛔ Black list | Non vuole essere richiamato | **Escluso per sempre da tutte le code**, anche se inserito in nuove campagne |
| Fuori zona | Fuori dall'area di interesse | Chiuso |

**Stati del contatto dentro una campagna:** da chiamare → in chiamata (bloccato per un'operatrice, si sblocca da solo dopo 15 min se resta appeso) → lavorato (con esito e conteggio tentativi).

---

## 6. Stati operatrice (tracciati per la produttività)

| Stato | Quando |
|---|---|
| 🟢 Disponibile | Collegata, non in chiamata |
| 🔴 In chiamata | Telefonata in corso |
| 🟠 Post-chiamata | Sta compilando l'esito |
| ☕ In pausa | Pausa manuale |
| ⚪ Offline | Non collegata |

Ogni passaggio viene registrato con i tempi → Report → Produttività (chiamate/ora calcolate escludendo le pause).

---

## 7. Telefonia in dettaglio

- **Softphone** nel browser (Twilio Voice, codec Opus per la qualità migliore) — servono solo cuffie e permesso microfono
- **Numero in uscita** selezionabile dall'admin (Impostazioni)
- **Numeri senza prefisso** → +39 aggiunto in automatico; chiamate consentite solo verso l'Italia
- **Registrazione** (se attiva): doppio canale, riascolto dal Registro (admin: tutte; operatrice: le proprie). ⚠ Ricordare l'informativa al cliente. Costo Twilio ≈ $0.0025/min + storage
- **Costi chiamata** ≈ pochi centesimi/min verso fissi e mobili italiani, addebitati sul subaccount Twilio "CRM Telefoniste"

---

## 8. Dati, hosting e manutenzione

| Voce | Dettaglio |
|---|---|
| Hosting | Render.com, piano Starter (~$7/mese) + disco persistente 1 GB — i dati NON si perdono mai |
| Database | SQLite su disco persistente |
| Backup | Manuale da Impostazioni (scarica file .db) — consigliato settimanale |
| Codice | github.com/kekkosmile777/crm-telefoniste (ogni modifica passa da lì) |
| Monitoraggio | https://crm-telefoniste.onrender.com/healthz (collegabile a UptimeRobot gratuito) |
| Telefonia | Subaccount Twilio "CRM Telefoniste", isolato dagli altri progetti |

---

*Documento aggiornato al 10/07/2026 — chiedi a Claude per modifiche o nuove funzioni.*
