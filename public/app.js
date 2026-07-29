const $ = (id) => document.getElementById(id);
const randomId = () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function setRequestId() { $('request-id').value = randomId(); }
setRequestId();

async function checkHealth() {
  try {
    const response = await fetch('/health');
    const data = await response.json();
    $('health-dot').classList.toggle('ok', response.ok);
    $('health-text').textContent = response.ok ? `Healthy · ${data.aiMode}` : 'Unhealthy';
  } catch { $('health-text').textContent = 'Unavailable'; }
}

function renderResult(data) {
  $('empty-result').hidden = true;
  $('result').hidden = false;
  $('result-badge').textContent = data.duplicate ? 'Duplicate cached' : data.status.replace('_', ' ');
  $('result-badge').className = `badge ${data.status === 'resolved' ? 'good' : 'bad'}`;
  $('category').textContent = data.category;
  $('severity').textContent = data.severity;
  $('confidence').textContent = `${Math.round(data.confidence * 100)}%`;
  $('summary').textContent = data.summary;
  $('cause').textContent = data.probableCause;
  $('actions').replaceChildren(...data.recommendedActions.map((action) => { const li = document.createElement('li'); li.textContent = action; return li; }));
  $('diag-attempts').textContent = `Diagnostics: ${data.telemetry.diagnosticsAttempts} attempt(s)`;
  $('ai-attempts').textContent = `AI: ${data.telemetry.aiAttempts} attempt(s)`;
  $('duration').textContent = `Duration: ${data.telemetry.durationMs} ms`;
  $('mode').textContent = `Mode: ${data.telemetry.aiMode}`;
  $('raw').textContent = JSON.stringify(data, null, 2);
}

async function refreshExecutions() {
  const tbody = $('execution-body');
  try {
    const response = await fetch('/v1/executions?limit=20');
    const { executions } = await response.json();
    if (!executions.length) return;
    tbody.replaceChildren(...executions.map((item) => {
      const tr = document.createElement('tr');
      const attempts = item.result ? `${item.result.telemetry.diagnosticsAttempts}/${item.result.telemetry.aiAttempts}` : '—';
      [new Date(item.updatedAt).toLocaleTimeString(), item.requestId, item.scenario, item.status, attempts].forEach((value) => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); });
      return tr;
    }));
  } catch { tbody.innerHTML = '<tr><td colspan="5">Unable to load executions.</td></tr>'; }
}

async function runWorkflow() {
  const button = $('run');
  button.disabled = true;
  $('form-status').textContent = 'Running validation, diagnostics, retries, and AI schema enforcement…';
  const payload = {
    requestId: $('request-id').value,
    sessionId: $('session-id').value,
    scenario: $('scenario').value,
    message: $('message').value,
    metadata: { source: 'browser-demo' },
  };
  try {
    const response = await fetch('/v1/workflows/support-triage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Workflow failed');
    renderResult(data);
    $('form-status').textContent = data.duplicate ? 'Duplicate request returned the persisted result without re-running downstream work.' : 'Workflow completed and the execution was persisted.';
  } catch (error) {
    $('result-badge').textContent = 'Failed';
    $('result-badge').className = 'badge bad';
    $('form-status').textContent = error.message;
  } finally {
    button.disabled = false;
    await refreshExecutions();
  }
}

$('new-id').addEventListener('click', setRequestId);
$('run').addEventListener('click', runWorkflow);
$('refresh').addEventListener('click', refreshExecutions);
await checkHealth();
await refreshExecutions();
