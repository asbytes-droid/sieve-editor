import express from 'express';
import cors from 'cors';
import { loadActiveScript, validateAndSaveScript } from './sieveClient.js';

const app = express();
app.use(cors());
app.use(express.json());

process.on('unhandledRejection', (reason) => {
  console.error('[server] UnhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[server] UncaughtException:', error);
});

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });
  next();
});

function parseConnection(body) {
  const host = body.host || 'imap.mailbox.org';
  const port = Number(body.port || 4190);
  const security = body.security || 'starttls';
  const username = body.username;
  const password = body.password;
  if (!username || !password) throw new Error('Bitte E-Mail-Adresse und Passwort angeben.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Port.');
  if (!['starttls', 'tls', 'none'].includes(security)) throw new Error('Ungültiger Sicherheitsmodus.');
  return { host, port, security, username, password };
}

app.post('/api/sieve/load', async (req, res) => {
  try {
    const connection = parseConnection(req.body);
    const data = await loadActiveScript(connection);
    res.json(data);
  } catch (error) {
    console.error('[api] /api/sieve/load failed:', error);
    res.status(400).json({ error: error.message || 'Unbekannter Fehler beim Laden.' });
  }
});

app.post('/api/sieve/save', async (req, res) => {
  try {
    const connection = parseConnection(req.body);
    if (!req.body.script) throw new Error('Kein Script übergeben.');
    const result = await validateAndSaveScript(connection, req.body.script);
    res.json(result);
  } catch (error) {
    console.error('[api] /api/sieve/save failed:', error);
    res.status(400).json({ error: error.message || 'Unbekannter Fehler beim Speichern.' });
  }
});

app.listen(3000, () => {
  console.log('[server] Sieve backend listening on http://localhost:3000');
});
