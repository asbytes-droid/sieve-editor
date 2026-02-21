import tls from 'node:tls';

function tokenizeLines(buffer) {
  return buffer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeQuoted(value) {
  return value.replaceAll('"', '\\"');
}

function parseStringToken(token) {
  if (!token) return '';
  const quoted = token.match(/^"(.*)"$/);
  if (quoted) return quoted[1].replaceAll('\\"', '"');
  return token;
}

export async function withSieveClient({ host, username, password, port = 4190 }, handler) {
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setEncoding('utf8');

  let dataBuffer = '';
  const waiters = [];

  const pushData = () => {
    const lines = tokenizeLines(dataBuffer);
    if (!lines.length) return;
    dataBuffer = '';
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter(lines);
    }
  };

  const readResponse = () => new Promise((resolve) => waiters.push(resolve));

  socket.on('data', (chunk) => {
    dataBuffer += chunk;
    if (dataBuffer.includes('\nOK') || dataBuffer.includes('\nNO') || dataBuffer.includes('\nBYE')) {
      pushData();
    }
  });

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  const greeting = await readResponse();
  if (!greeting.join(' ').includes('OK')) throw new Error('ManageSieve greeting fehlgeschlagen.');

  const auth = `AUTHENTICATE "PLAIN" "${escapeQuoted(Buffer.from(`\0${username}\0${password}`).toString('base64'))}"\r\n`;
  socket.write(auth);
  const authResponse = await readResponse();
  if (authResponse.some((line) => line.startsWith('NO') || line.startsWith('BYE'))) {
    throw new Error(`Authentifizierung fehlgeschlagen: ${authResponse.join(' ')}`);
  }

  const send = async (command) => {
    socket.write(`${command}\r\n`);
    const response = await readResponse();
    if (response.some((line) => line.startsWith('NO') || line.startsWith('BYE'))) {
      throw new Error(response.join(' '));
    }
    return response;
  };

  try {
    return await handler({ send });
  } finally {
    socket.end('LOGOUT\r\n');
  }
}

export async function loadActiveScript(credentials) {
  return withSieveClient(credentials, async ({ send }) => {
    const scripts = await send('LISTSCRIPTS');
    const active = scripts.find((line) => line.includes('ACTIVE'));
    if (!active) return { script: '', rules: [] };

    const nameToken = active.split(' ')[0];
    const scriptName = parseStringToken(nameToken);
    const content = await send(`GETSCRIPT "${escapeQuoted(scriptName)}"`);

    const rawScript = content
      .filter((line) => !line.startsWith('OK'))
      .join('\n');

    const rules = extractRules(rawScript);
    return { scriptName, script: rawScript, rules };
  });
}

export async function validateAndSaveScript(credentials, script) {
  return withSieveClient(credentials, async ({ send }) => {
    const scripts = await send('LISTSCRIPTS');
    const active = scripts.find((line) => line.includes('ACTIVE'));
    const scriptName = active ? parseStringToken(active.split(' ')[0]) : 'main';

    const escapedScript = script.replaceAll('"', '\\"');
    await send(`CHECKSCRIPT "${escapedScript}"`);
    await send(`PUTSCRIPT "${escapeQuoted(scriptName)}" "${escapedScript}"`);
    await send(`SETACTIVE "${escapeQuoted(scriptName)}"`);
    return { ok: true, scriptName };
  });
}

function extractRules(script) {
  const matches = script.match(/if\s+header[^\{]+\{[^\}]+\}/gim) || [];
  return matches.map((raw) => ({
    label: raw.includes('fileinto') ? 'Verschieben' : raw.includes('discard') ? 'Verwerfen' : 'Regel',
    raw: raw.replace(/\s+/g, ' ').trim()
  }));
}
