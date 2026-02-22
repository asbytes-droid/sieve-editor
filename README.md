# Sieve Editor (Vue 3 + Node.js)

Eine kleine App, um Sieve-Regeln bei mailbox.org zu laden, visuell zu ergänzen und wieder hochzuladen.

![Screenshot](screenshot.png?raw=true "Screenshot")


## Warum kein Shell-Befehl?
Die App verwendet **keine Shell-Execs** (`sieve-connect` etc.).
Stattdessen spricht das Node-Backend direkt mit ManageSieve.

## TLS/STARTTLS (wichtig)
Die App unterstützt explizit:
- `STARTTLS` (empfohlen)
- `TLS direkt` (implicit TLS)
- `keine TLS-Verschlüsselung` (nur für Tests)

Empfohlen für mailbox.org: **Port 4190 + STARTTLS**.

## Features
- Verbindungseingaben:
  - Host (Default: `imap.mailbox.org`)
  - Port (Default: `4190`)
  - Sicherheit (STARTTLS/TLS direkt/none)
  - E-Mail-Adresse
  - Passwort / App-Passwort
- Button **"Lade Sieve-Datei"**
- Anzeige erkannter Regeln
- Regel-Builder mit Vorlagen-Dropdown
- Upload mit serverseitiger Validierung via `CHECKSCRIPT`

## Start
```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
