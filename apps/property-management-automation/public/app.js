const state = { requests: [], filter: 'all' };

const elements = {
  list: document.querySelector('#requestList'),
  form: document.querySelector('#requestForm'),
  dialog: document.querySelector('#detailDialog'),
  detail: document.querySelector('#detailContent')
};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
})[char]);

function formatStatus(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function renderMetrics(summary) {
  document.querySelector('#metricActive').textContent = summary.active;
  document.querySelector('#metricEmergency').textContent = summary.emergencies;
  document.querySelector('#metricRisk').textContent = summary.atRisk;
  document.querySelector('#metricConfidence').textContent = `${summary.avgAutomationConfidence}%`;
}

function renderRequests() {
  const visible = state.requests.filter((item) => state.filter === 'all' || item.priority === state.filter);
  elements.list.innerHTML = visible.length ? visible.map((item) => `
    <article class="request-card" data-id="${escapeHtml(item.id)}">
      <div>
        <div><span class="badge ${item.priority}">${formatStatus(item.priority)}</span><span class="sla ${item.slaState}">${formatStatus(item.slaState)}</span></div>
        <h3>${escapeHtml(item.property)} · Unit ${escapeHtml(item.unit)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="meta">${escapeHtml(item.id)} · ${escapeHtml(item.assignedTeam)} · ${formatStatus(item.status)}</div>
      </div>
      <div class="request-actions">
        <button type="button" data-action="details">Details</button>
        ${item.status !== 'completed' ? '<button type="button" data-action="advance">Advance</button>' : ''}
      </div>
    </article>
  `).join('') : '<p>No requests match this filter.</p>';
}

function showDetails(item) {
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
  renderMetrics(data.summary);
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
  toast(`Request ${data.id} triaged as ${data.priority}`);
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
  setTimeout(() => node.remove(), 2400);
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = elements.form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Running automation…';
  try { await createRequest(new FormData(elements.form)); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = 'Run AI triage'; }
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
