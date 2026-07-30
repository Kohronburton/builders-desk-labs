const defaultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ticketId', 'category', 'priority', 'summary', 'requiresHuman'],
  properties: {
    ticketId: { type: 'string', pattern: '^TKT-[0-9]{4}$' },
    category: { type: 'string', enum: ['authentication', 'billing', 'bug', 'other'] },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string', minLength: 12 },
    requiresHuman: { type: 'boolean' }
  }
};

const $ = (id) => document.getElementById(id);
let currentMode = 'prompt-only';
const errorEntries = [];
$('schema').value = JSON.stringify(defaultSchema, null, 2);

function getPayload() {
  const schema = JSON.parse($('schema').value);
  return { prompt: $('prompt').value.trim(), schema };
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = busy ? 'Running…' : label;
}

function validateEditor() {
  try {
    JSON.parse($('schema').value);
    $('schemaState').textContent = 'Schema ready';
    $('schemaState').className = 'schema-state valid';
    return true;
  } catch (error) {
    $('schemaState').textContent = `Invalid JSON: ${error.message}`;
    $('schemaState').className = 'schema-state invalid';
    return false;
  }
}

function addError(scope, message) {
  errorEntries.unshift({ time: new Date().toLocaleTimeString(), scope, message });
  $('errorLog').innerHTML = errorEntries.slice(0, 20).map((item) =>
    `<div><time>${item.time}</time><strong>${item.scope}</strong><span>${escapeHtml(item.message)}</span></div>`
  ).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderSingle(result) {
  $('responseViewer').textContent = result.rawText || JSON.stringify(result.parsed, null, 2) || '(empty response)';
  $('latency').textContent = `${result.latencyMs ?? 0} ms`;
  $('validationBadge').textContent = result.valid ? 'Schema valid' : 'Schema invalid';
  $('validationBadge').className = `badge ${result.valid ? 'valid' : 'invalid'}`;
  $('validationDetails').textContent = result.valid
    ? 'No validation errors.'
    : JSON.stringify(result.validationErrors || [{ message: result.error || 'Unknown failure' }], null, 2);
}

function renderRun(target, result) {
  target.classList.remove('empty');
  target.innerHTML = result.results.map((item, index) =>
    `<span class="request-chip ${item.valid ? 'pass' : 'fail'}" title="Request ${index + 1}: ${item.valid ? 'valid' : escapeHtml(item.error || 'invalid')}">${index + 1}</span>`
  ).join('');
}

async function runMode(mode, count) {
  const payload = getPayload();
  return post('/api/test-run', { ...payload, mode, count });
}

$('schema').addEventListener('input', validateEditor);
$('resetSchema').addEventListener('click', () => {
  $('schema').value = JSON.stringify(defaultSchema, null, 2);
  validateEditor();
});

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    currentMode = button.dataset.mode;
    document.querySelectorAll('.mode-button').forEach((item) => item.classList.toggle('active', item === button));
  });
});

$('runOnce').addEventListener('click', async () => {
  if (!validateEditor()) return;
  setBusy($('runOnce'), true, 'Run single request');
  try {
    const result = await post('/api/run', { ...getPayload(), mode: currentMode });
    renderSingle(result);
    if (!result.valid) addError(currentMode, 'Response failed schema validation.');
  } catch (error) {
    addError(currentMode, error.message);
    $('responseViewer').textContent = error.message;
  } finally {
    setBusy($('runOnce'), false, 'Run single request');
  }
});

$('runComparison').addEventListener('click', async () => {
  if (!validateEditor()) return;
  const count = Number($('testCount').value);
  setBusy($('runComparison'), true, 'Run both modes');
  $('progress').style.width = '8%';
  try {
    const promptOnly = await runMode('prompt-only', count);
    $('progress').style.width = '52%';
    renderRun($('promptLog'), promptOnly);
    $('promptRate').textContent = `${promptOnly.successRate}%`;

    const strict = await runMode('strict', count);
    $('progress').style.width = '100%';
    renderRun($('strictLog'), strict);
    $('strictRate').textContent = `${strict.successRate}%`;

    const total = promptOnly.total + strict.total;
    const valid = promptOnly.validCount + strict.validCount;
    $('totalRequests').textContent = total;
    $('validResponses').textContent = valid;
    $('failedResponses').textContent = total - valid;
    $('averageLatency').textContent = `${Math.round((promptOnly.averageLatencyMs + strict.averageLatencyMs) / 2)} ms`;

    [...promptOnly.results, ...strict.results].filter((item) => !item.valid).slice(0, 10).forEach((item) =>
      addError(item.mode, item.error || item.validationErrors?.[0]?.message || 'Schema validation failed')
    );
  } catch (error) {
    addError('comparison', error.message);
  } finally {
    setBusy($('runComparison'), false, 'Run both modes');
    setTimeout(() => { $('progress').style.width = '0'; }, 900);
  }
});

fetch('/api/health').then((response) => response.json()).then((health) => {
  $('healthDot').classList.add(health.apiKeyConfigured ? 'online' : 'warning');
  $('healthTitle').textContent = health.apiKeyConfigured ? 'API ready' : 'API key required';
  $('healthDetail').textContent = health.apiKeyConfigured ? `Model: ${health.model}` : 'Add OPENAI_API_KEY to .env';
}).catch(() => {
  $('healthTitle').textContent = 'Server unavailable';
  $('healthDetail').textContent = 'Start the Node server to run the demo.';
});

validateEditor();
