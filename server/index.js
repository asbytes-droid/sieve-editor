import express from 'express';
import cors from 'cors';
import { loadActiveScript, validateAndSaveScript } from './sieveClient.js';

const app = express();
app.use(cors());
app.use(express.json());

function parseConnection(body) {
  const host = body.host || 'imap.mailbox.org';
  const username = body.username;
  const password = body.password;
  if (!username || !password) throw new Error('Bitte E-Mail-Adresse und Passwort angeben.');
  return { host, username, password };
}

app.post('/api/sieve/load', async (req, res) => {
  try {
    const connection = parseConnection(req.body);
    const data = await loadActiveScript(connection);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sieve/save', async (req, res) => {
  try {
    const connection = parseConnection(req.body);
    if (!req.body.script) throw new Error('Kein Script übergeben.');
    const result = await validateAndSaveScript(connection, req.body.script);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Sieve backend listening on http://localhost:3000');
});
