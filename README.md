# Sieve Editor (Vue 3 + Node.js)

Eine kleine App, um Sieve-Regeln bei mailbox.org zu laden, visuell zu ergänzen und wieder hochzuladen.

## Warum kein Shell-Befehl?
Die App verwendet **keine Shell-Execs** (`sieve-connect` etc.).
Stattdessen spricht das Node-Backend direkt per TLS mit ManageSieve (Port 4190).

## Gibt es ein gutes npm-Package dafür?
Aktuell gibt es in der Praxis kein weit verbreitetes, gut gepflegtes Standard-Paket für ManageSieve wie z. B. bei IMAP/SMTP.
Deshalb ist hier ein kleiner nativer Node-Client (`node:tls`) enthalten.

## Features (MVP)
- Verbindungseingaben:
  - Host (Default: `imap.mailbox.org`)
  - E-Mail-Adresse
  - Passwort / App-Passwort
- Button **"Lade Sieve-Datei"**
- Anzeige erkannter Regeln
- Regel-Builder mit:
  - Feld (from/subject/to)
  - Operator (contains/is/matches)
  - Aktion (fileinto/keep/discard)
- Vorlagen-Dropdown (vordefinierte Filter)
- Upload mit serverseitiger Validierung via `CHECKSCRIPT`

## Start
```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## Hinweis
Der ManageSieve-Protokollteil ist bewusst als MVP gehalten.
Für Produktion sollte der Parser (Literal-Handling, Multi-Line, Quoting-Edgecases) robuster ausgebaut werden.
