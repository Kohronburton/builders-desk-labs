const state = { requests: [], filter: 'all', providerStatus: null };

const elements = {
  list: document.querySelector('#requestList'),
  form: document.querySelector('#requestForm'),
  dialog: document.querySelector('#detailDialog'),
  detail: document.querySelector('#detailContent'),
  providerHealth: document.querySelector('#providerHealth')
};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
})[char]);

function formatStatus(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatMoney(value) {
  if (value === null || value === undefined) return 'Metered by provider';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(value);
}

function providerClass(provider) {
  if (!provider) return 'local';
  if (provider.tier === 'paid' || provider.tier === 'paid-simulated') return 'premium';
  if (provider.tier === 'free') return 'free';
  return 'local';
}

function renderMetrics(summary) {
  document.querySelector('#metricActive').textContent = summary.active;
  document.querySelector('#metricEmergency').textContent = summary.emergencies;
  document.querySelector('#metricRisk').textContent = summary.atRisk;
  document.querySelector('#metricConfidence').textContent = `${summary.avgAutomationConfidence}%`;
}

function renderProviderHealth() {
  const status = state.providerStatus;
  if (!status) return;
  elements.providerHealth.innerHTML = `
    <span class="provider-pill premium">Premium simulation ready</span>
    <span class="provider-pill ${status.freeConfigured ? 'free' : 'muted'}">Free API ${status.freeConfigured ? 'connected' : 'optional'}</span>
    <span class="provider-pill local">Local fallback ready</span>
  `;
}

function renderRequests() {
  const visible = state.requests.filter((item) => state.filter === 'all' || item.priority === state.filter);
  elements.list.innerHTML = visible.length ? visible.map((item) => `
    <article class="request-card" data-id="${escapeHtml(item.id)}">
      <div>
        <div class="request-badges">
          <span class="badge ${item.priority}">${formatStatus(item.priority)}</span>
          <span class="sla ${item.slaState}">${formatStatus(item.slaState)}</span>
          <span class="provider-pill ${providerClass(item.aiProvider)}">${escapeHtml(item.aiProvider?.label || 'Local Engine')}</span>
        </div>
        <h3>${escapeHtml(item.property)} · Unit ${escapeHtml(item.unit)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="meta">${escapeHtml(item.id)} · ${escapeHtml(item.assignedTeam)} · ${formatStatus(item.status)} · ${item.aiProvider?.latencyMs ?? 0} ms</div>
      </div>
      <div class="request-actions">
        <button type="button" data-action="details">Inspect automation</button>
        ${item.status !== 'completed' ? '<button type="button" data-action="advance">Advance</button>' : ''}
      </div>
    </article>
  `).join('') : '<p>No requests match this filter.</p>';
}

function showDetails(item) {
  const provider = item.aiProvider || { label: 'Local Engine', tier: 'local', model: 'deterministic-v1', latencyMs: 1, estimatedCostUsd: 0 };
  elements.detail.innerHTML = `
    <p class="eyebrow">${escapeHtml(item.id)}</p>
    <h2>${escapeHtml(item.property)} · Unit ${escapeHtml(item.unit)}</h2>
    <p>${escapeHtml(item.description)}</p>
    <div class="detail-grid">
      <div><small>AI priority</small><strong>${formatStatus(item.priority)} · ${Math.round(item.confidence * 100)}%</strong></div>
      <div><small>Assigned team</small><strong>${escapeHtml(item.assignedTeam)}</strong></div>
      <div><small>SLA deadline</small><strong>${formatTime(item.dueAt)}</strong></div>
      <div><small>Status</small><strong>${formatStatus(item.status)}</strong></div>
    </div>
    <div class="provider-card ${providerClass(provider)}">
      <div>
        <p class="eyebrow">AI PROVIDER TELEMETRY</p>
        <h3>${escapeHtml(provider.label)}</h3>
        <p>${provider.live ? 'Live compatible API call' : provider.tier === 'paid-simulated' ? 'Realistic paid-provider simulation' : 'Offline deterministic execution'}</p>
      </div>
      <div class="provider-stats">
        <span><small>Model</small><strong>${escapeHtml(provider.model || '—')}</strong></span>
        <span><small>Latency</small><strong>${provider.latencyMs ?? 0} ms</strong></span>
        <span><small>Tokens</small><strong>${provider.promptTokens ?? 0} + ${provider.completionTokens ?? 0}</strong></span>
        <span><small>Estimated cost</small><strong>${formatMoney(provider.estimatedCostUsd)}</strong></span>
      </div>
      ${provider.fallbackUsed ? `<div class="fallback-note"><strong>Fallback activated:</strong> ${escapeHtml((provider.attempts || []).join(' → ') || 'Upstream provider unavailable')}</div>` : ''}
    </div>
    <h3>Automation rationale</h3><p>${escapeHtml(item.rationale)}</p>
    <h3>Resident update</h3><p>${escapeHtml(item.residentMessage)}</p>
    <h3>Workflow timeline</h3>
    <ol class="timeline">${item.timeline.map((event) => `<li><strong>${escapeHtml(event.label)}</strong><br><small>${formatTime(event.at)}</small></li>`).join('')}</ol>
  `;
  elements.dialog.showModal();
}

async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error('Unable to load dashboard');
  const data = await response.json();
  state.requests = data.requests;
  state.providerStatus = data.providerStatus;
  renderMetrics(data.summary);
  renderProviderHealth();
  renderRequests();
}

async function createRequest(formData) {
  const response = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData))
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to create request');
  await loadDashboard();
  showDetails(data);
  const fallbackText = data.aiProvider?.fallbackUsed ? ' using fallback resilience' : '';
  toast(`Request ${data.id} triaged by ${data.aiProvider?.label || 'local engine'}${fallbackText}`);
}

async function advanceRequest(id) {
  const response = await fetch(`/api/requests/${encodeURIComponent(id)}/advance`, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to advance request');
  await loadDashboard();
  toast(`${id} advanced to ${formatStatus(data.status)}`);
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = elements.form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Calling provider chain…';
  try { await createRequest(new FormData(elements.form)); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = 'Run resilient AI triage'; }
});

elements.list.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  const card = event.target.closest('[data-id]');
  if (!button || !card) return;
  const item = state.requests.find((request) => request.id === card.dataset.id);
  if (button.dataset.action === 'details') showDetails(item);
  if (button.dataset.action === 'advance') await advanceRequest(item.id);
});

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  state.filter = button.dataset.filter;
  renderRequests();
}));

document.querySelector('#closeDialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#resetButton').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  await loadDashboard();
  toast('Demo data reset');
});

loadDashboard().catch((error) => {
  elements.list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
});
