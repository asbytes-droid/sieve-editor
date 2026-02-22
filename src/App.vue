<template>
  <main class="container">
    <h1>Sieve-Editor (mailbox.org)</h1>

    <section class="card">
      <h2>Verbindung</h2>
      <div class="grid">
        <label>
          IMAP Sieve Host
          <input v-model="form.host" placeholder="imap.mailbox.org" />
        </label>
        <label>
          Port
          <input v-model.number="form.port" type="number" min="1" max="65535" />
        </label>
        <label>
          Sicherheit
          <select v-model="form.security">
            <option value="starttls">STARTTLS (empfohlen)</option>
            <option value="tls">TLS direkt (implicit)</option>
            <option value="none">Keine TLS-Verschlüsselung</option>
          </select>
        </label>
        <label>
          E-Mail-Adresse
          <input v-model="form.username" placeholder="name@mailbox.org" />
        </label>
        <label>
          Passwort / App-Passwort
          <input v-model="form.password" type="password" placeholder="••••••••" />
        </label>
        <label>&nbsp;
          <button :disabled="loading" @click="loadScript">Lade Sieve-Datei</button>
        </label>
      </div>
      <p v-if="status" class="status">{{ status }}</p>
    </section>

    <section v-if="loaded" class="card">
      <h2>Aktuelle Regeln</h2>
      <ul v-if="rules.length">
        <li v-for="(rule, idx) in rules" :key="idx">
          <strong>{{ rule.label }}</strong>
          <code>{{ rule.raw }}</code>
        </li>
      </ul>
      <p v-else>Keine erkannten Standard-Regeln. Roh-Skript bleibt erhalten.</p>

      <h3>Neue Regel hinzufügen</h3>
      <div class="grid">
        <label>
          Vorlage
          <select v-model="selectedTemplate" @change="applyTemplate">
            <option value="">-- Bitte wählen --</option>
            <option v-for="tpl in templates" :key="tpl.name" :value="tpl.name">{{ tpl.name }}</option>
          </select>
        </label>
        <label>
          Feld
          <select v-model="draft.field">
            <option value="from">Absender (from)</option>
            <option value="subject">Betreff (subject)</option>
            <option value="to">Empfänger (to)</option>
          </select>
        </label>
        <label>
          Operator
          <select v-model="draft.operator">
            <option value=":contains">enthält</option>
            <option value=":is">ist genau</option>
            <option value=":matches">passt auf Muster</option>
          </select>
        </label>
        <label>
          Suchtext
          <input v-model="draft.value" placeholder="z.B. Rechnung" />
        </label>
        <label>
          Aktion
          <select v-model="draft.action">
            <option value="fileinto">In Ordner verschieben</option>
            <option value="keep">Im Posteingang behalten</option>
            <option value="discard">Verwerfen</option>
          </select>
        </label>
        <label v-if="draft.action === 'fileinto'">
          Zielordner
          <input v-model="draft.target" placeholder="INBOX/Finanzen" />
        </label>
      </div>

      <p class="status">Vorschau: <code>{{ generatedRule }}</code></p>
      <button :disabled="!isDraftValid" @click="addRule">Regel übernehmen</button>
      <button :disabled="saving" @click="saveScript">Sieve-Datei hochladen</button>
    </section>
  </main>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';

  const form = reactive({
    host: 'imap.mailbox.org',
    port: 4190,
    security: 'starttls',
    username: '',
    password: ''
  });

  const loading = ref(false);
  const loaded = ref(false);
  const saving = ref(false);
  const status = ref('');
  const scriptText = ref('');
  const rules = ref([]);
  const selectedTemplate = ref('');

  const draft = reactive({
    field: 'from',
    operator: ':contains',
    value: '',
    action: 'fileinto',
    target: ''
  });

  const templates = [
    { name: 'Newsletter in News', field: 'from', operator: ':contains', value: 'newsletter', action: 'fileinto', target: 'INBOX/News' },
    { name: 'Rechnungen in Finanzen', field: 'subject', operator: ':contains', value: 'Rechnung', action: 'fileinto', target: 'INBOX/Finanzen' },
    { name: 'Spam verwerfen', field: 'subject', operator: ':contains', value: '[SPAM]', action: 'discard', target: '' }
  ];

  const generatedRule = computed(() => {
    const escaped = draft.value.replaceAll('"', '\\"');
    const target = draft.target.replaceAll('"', '\\"');
    let action = 'keep;';
    if (draft.action === 'fileinto') action = `fileinto "${target}";`;
    if (draft.action === 'discard') action = 'discard;';

    return `if header ${draft.operator} "${draft.field}" "${escaped}" { ${action} }`;
  });

  const isDraftValid = computed(() => {
    if (!draft.value.trim()) return false;
    if (draft.action === 'fileinto' && !draft.target.trim()) return false;
    return true;
  });


  async function parseApiResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return res.json();
    const text = await res.text();
    return { error: text || `HTTP ${res.status}` };
  }

  function toFriendlyError(error) {
    const message = String(error?.message || error || 'Unbekannter Fehler');
    if (message.includes('Failed to fetch')) {
      return 'Backend nicht erreichbar. Läuft `npm run dev:server` auf Port 3000?';
    }
    if (message.includes('ECONNRESET')) {
      return 'Verbindung wurde vom Server zurückgesetzt (ECONNRESET). Prüfe Host/Port/Sicherheit.';
    }
    return message;
  }

  function applyTemplate() {
    const tpl = templates.find((t) => t.name === selectedTemplate.value);
    if (!tpl) return;
    Object.assign(draft, tpl);
  }

  async function loadScript() {
    loading.value = true;
    status.value = '';
    try {
      const res = await fetch('/api/sieve/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Laden fehlgeschlagen');

      scriptText.value = data.script;
      rules.value = data.rules;
      loaded.value = true;
      status.value = 'Sieve-Datei erfolgreich geladen.';
    } catch (error) {
      status.value = `Fehler: ${toFriendlyError(error)}`;
      if (String(error.message).includes('packet length too long')) {
        status.value += ' → Prüfe Port/Sicherheit: meist 4190 + STARTTLS.';
      }
    } finally {
      loading.value = false;
    }
  }

  function addRule() {
    if (!isDraftValid.value) return;
    const newRule = generatedRule.value;
    scriptText.value += `\n${newRule}\n`;
    rules.value.push({ label: 'Neu', raw: newRule });
    status.value = 'Regel wurde lokal hinzugefügt. Bitte hochladen klicken.';
  }

  async function saveScript() {
    saving.value = true;
    status.value = '';
    try {
      const res = await fetch('/api/sieve/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, script: scriptText.value })
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
      status.value = 'Sieve-Datei validiert und hochgeladen.';
    } catch (error) {
      status.value = `Fehler: ${toFriendlyError(error)}`;
      if (String(error.message).includes('packet length too long')) {
        status.value += ' → Prüfe Port/Sicherheit: meist 4190 + STARTTLS.';
      }
    } finally {
      saving.value = false;
    }
  }
</script>
