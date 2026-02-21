import net from 'node:net';
import tls from 'node:tls';

function escapeQuoted(value) {
  return String(value).replaceAll('"', '\\"');
}

function parseStringToken(token) {
  if (!token) return '';
  const quoted = token.match(/^"(.*)"$/);
  if (quoted) return quoted[1].replaceAll('\\"', '"');
  return token;
}

function createLineReader(socket) {
  socket.setEncoding('utf8');
  let buffer = '';
  const lines = [];
  const waiters = [];

  socket.on('data', (chunk) => {
    buffer += chunk;
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (waiters.length > 0) {
        waiters.shift()(line);
      } else {
        lines.push(line);
      }
      idx = buffer.indexOf('\n');
    }
  });

  return {
    nextLine() {
      return new Promise((resolve) => {
        if (lines.length > 0) {
          resolve(lines.shift());
          return;
        }
        waiters.push(resolve);
      });
    }
  };
}

async function readResponse(nextLine) {
  const lines = [];
  while (true) {
    const line = (await nextLine()).trim();
    if (!line) continue;
    lines.push(line);
    if (/^(OK|NO|BYE)(\s|$)/.test(line)) break;
  }
  return lines;
}

async function connectManageSieve({ host, port, security }) {
  const plainSocket = net.createConnection({ host, port });
  await new Promise((resolve, reject) => {
    plainSocket.once('connect', resolve);
    plainSocket.once('error', reject);
  });

  if (security === 'none') {
    return plainSocket;
  }

  if (security === 'tls') {
    plainSocket.destroy();
    const tlsSocket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    await new Promise((resolve, reject) => {
      tlsSocket.once('secureConnect', resolve);
      tlsSocket.once('error', reject);
    });
    return tlsSocket;
  }

  return plainSocket;
}

async function upgradeStartTls(socket, host, nextLine) {
  const greetOrCaps = await readResponse(nextLine);
  const supportsStartTls = greetOrCaps.some((line) => /"STARTTLS"/i.test(line) || /STARTTLS/i.test(line));
  if (!supportsStartTls) {
    throw new Error('Server bietet kein STARTTLS an. Bitte Sicherheit auf "TLS direkt" stellen.');
  }

  socket.write('STARTTLS\r\n');
  const startTlsResponse = await readResponse(nextLine);
  if (!startTlsResponse.some((line) => line.startsWith('OK'))) {
    throw new Error(`STARTTLS fehlgeschlagen: ${startTlsResponse.join(' ')}`);
  }

  const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: true });
  await new Promise((resolve, reject) => {
    tlsSocket.once('secureConnect', resolve);
    tlsSocket.once('error', reject);
  });

  return tlsSocket;
}

export async function withSieveClient(
  { host, username, password, port = 4190, security = 'starttls' },
  handler
) {
  let socket = await connectManageSieve({ host, port, security });
  let reader = createLineReader(socket);

  if (security === 'starttls') {
    socket = await upgradeStartTls(socket, host, reader.nextLine);
    reader = createLineReader(socket);
    const greeting = await readResponse(reader.nextLine);
    if (!greeting.some((line) => line.startsWith('OK'))) {
      throw new Error(`ManageSieve greeting ungültig: ${greeting.join(' ')}`);
    }
  } else {
    const greeting = await readResponse(reader.nextLine);
    if (!greeting.some((line) => line.startsWith('OK'))) {
      throw new Error(`ManageSieve greeting ungültig: ${greeting.join(' ')}`);
    }
  }

  const send = async (command) => {
    socket.write(`${command}\r\n`);
    const response = await readResponse(reader.nextLine);
    if (response.some((line) => /^(NO|BYE)(\s|$)/.test(line))) {
      throw new Error(response.join(' '));
    }
    return response;
  };

  const token = Buffer.from(`\0${username}\0${password}`).toString('base64');
  const authResponse = await send(`AUTHENTICATE "PLAIN" "${escapeQuoted(token)}"`);
  if (!authResponse.some((line) => line.startsWith('OK'))) {
    throw new Error(`Authentifizierung fehlgeschlagen: ${authResponse.join(' ')}`);
  }

  try {
    return await handler({ send });
  } finally {
    socket.end('LOGOUT\r\n');
  }
}

export async function loadActiveScript(credentials) {
  return withSieveClient(credentials, async ({ send }) => {
    const scripts = await send('LISTSCRIPTS');
    const active = scripts.find((line) => /ACTIVE/.test(line));
    if (!active) return { script: '', rules: [] };

    const scriptName = parseStringToken(active.split(' ')[0]);
    const content = await send(`GETSCRIPT "${escapeQuoted(scriptName)}"`);
    const rawScript = content.filter((line) => !line.startsWith('OK')).join('\n');

    return { scriptName, script: rawScript, rules: extractRules(rawScript) };
  });
}

export async function validateAndSaveScript(credentials, script) {
  return withSieveClient(credentials, async ({ send }) => {
    const scripts = await send('LISTSCRIPTS');
    const active = scripts.find((line) => /ACTIVE/.test(line));
    const scriptName = active ? parseStringToken(active.split(' ')[0]) : 'main';

    const escapedScript = escapeQuoted(script);
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
