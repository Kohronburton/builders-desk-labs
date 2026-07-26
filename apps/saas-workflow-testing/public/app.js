const state = { workflows: [], runs: [], selected: null, providerStatus: null };
const q = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const time = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function providerClass(provider) {
  if (!provider) return 'local';
  if (provider.tier === 'paid' || provider.tier === 'paid-simulated') return 'premium';
  if (provider.tier === 'free') return 'free';
  return 'local';
}

function formatMoney(value) {
  if (value === null || value === undefined) return 'Metered';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(value);
}

function metrics(summary) {
  q('#score').textContent = `${summary.latestScore}%`;
  q('#passRate').textContent = `${summary.passRate}%`;
  q('#critical').textContent = summary.criticalFindings;
  q('#openFindings').textContent = summary.openFindings;
}

function renderProviderHealth() {
  const status = state.providerStatus;
  if (!status) return;
  q('#providerHealth').innerHTML = `
    <span class="provider-pill premium">Premium simulation ready</span>
    <span class="provider-pill ${status.freeConfigured ? 'free' : 'muted'}">Free review API ${status.freeConfigured ? 'connected' : 'optional'}</span>
    <span class="provider-pill local">Local review ready</span>
  `;
}

function workflowOptions() {
  q('#workflowSelect').innerHTML = state.workflows.map((workflow) => `<option value="${workflow.id}">${escapeHtml(workflow.name)}</option>`).join('');
  renderMap();
}

function renderMap() {
  const workflow = state.workflows.find((item) => item.id === q('#workflowSelect').value) || state.workflows[0];
  q('#workflowMap').innerHTML = workflow ? workflow.nodes.map((node, index) => `${index ? '<span class="arrow">→</span>' : ''}<span class="node">${escapeHtml(node)}</span>`).join('') : '';
}

function renderRuns() {
  q('#runList').innerHTML = state.runs.length ? state.runs.map((run) => `
    <article class="run-card" data-run="${run.id}">
      <div class="run-meta"><strong>${escapeHtml(run.workflowName)}</strong><span class="chip ${run.status}">${run.score}%</span></div>
      <small>${escapeHtml(run.tenantId)} · ${title(run.fault)} · ${time(run.startedAt)}</small>
      <div class="run-provider"><span class="provider-pill ${providerClass(run.aiProvider)}">${escapeHtml(run.aiProvider?.label || 'Local Review')}</span></div>
    </article>
  `).join('') : '<div class="empty">No test runs yet.</div>';
}

function decisionClass(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('block')) return 'blocked';
  if (text.includes('review')) return 'review';
  if (text.includes('monitor')) return 'monitor';
  if (text.includes('ready') || text.includes('ship')) return 'ready';
  return 'neutral';
}

function renderAIReview(run) {
  const review = run.aiReview;
  const provider = run.aiProvider;
  if (!review) {
    q('#reviewBody').innerHTML = '<div class="empty">No AI review is attached to this run.</div>';
    return;
  }
  q('#reviewTitle').textContent = `${run.id} · Engineering decision`;
  q('#releaseDecision').textContent = review.releaseDecision;
  q('#releaseDecision').className = `decision ${decisionClass(review.releaseDecision)}`;
  q('#reviewProvider').innerHTML = `
    <div class="provider-summary ${providerClass(provider)}">
      <div><span class="provider-pill ${providerClass(provider)}">${escapeHtml(provider?.label || 'Local Review')}</span><small>${provider?.live ? 'Live API' : provider?.tier === 'paid-simulated' ? 'Paid-provider simulation' : 'Offline fallback'} · ${escapeHtml(provider?.model || 'deterministic')}</small></div>
      <div class="telemetry"><span>${provider?.latencyMs ?? 0} ms</span><span>${provider?.promptTokens ?? 0} + ${provider?.completionTokens ?? 0} tokens</span><span>${formatMoney(provider?.estimatedCostUsd)}</span></div>
      ${provider?.fallbackUsed ? `<div class="fallback-note"><strong>Fallback path:</strong> ${escapeHtml((provider.attempts || []).join(' → ') || 'upstream unavailable')}</div>` : ''}
    </div>
  `;
  q('#reviewBody').innerHTML = `
    <article class="review-main"><span>Executive summary</span><h3>${escapeHtml(review.executiveSummary)}</h3><p class="talking-point">${escapeHtml(review.clientTalkingPoint)}</p></article>
    <article><span>Business risk</span><p>${escapeHtml(review.businessRisk)}</p></article>
    <article><span>Root-cause hypothesis</span><p>${escapeHtml(review.rootCauseHypothesis)}</p></article>
    <article class="remediation-card"><span>Prioritized repair plan</span><ol>${(review.remediationPlan || []).map((item) => `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.action)}</p></li>`).join('') || '<li>No remediation required.</li>'}</ol></article>
  `;
}

function showRun(run) {
  state.selected = run;
  q('#resultTitle').textContent = `${run.id} · ${run.workflowName}`;
  q('#runStatus').className = `chip ${run.status}`;
  q('#runStatus').textContent = title(run.status);
  q('#resultSummary').innerHTML = `
    <div><small>Reliability score</small><strong>${run.score}%</strong></div>
    <div><small>Passed</small><strong>${run.summary.passed}/${run.summary.total}</strong></div>
    <div><small>Warnings</small><strong>${run.summary.warnings}</strong></div>
    <div><small>Failed</small><strong>${run.summary.failed}</strong></div>
  `;
  q('#testResults').innerHTML = run.tests.map((test) => `
    <article class="test-card">
      <div class="test-head"><strong>${escapeHtml(test.name)}</strong><span class="status-mark ${test.status}">${test.status === 'passed' ? '✓' : test.status === 'warning' ? '!' : '×'}</span></div>
      <p>${escapeHtml(test.evidence)}</p><small>${escapeHtml(test.category)} · ${test.durationMs} ms</small>
    </article>
  `).join('');
  q('#findingList').innerHTML = run.findings.length ? run.findings.map((finding) => `
    <article class="finding ${finding.severity}"><h3>${title(finding.severity)} · ${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.evidence)}</p><p class="recommend"><strong>Fix:</strong> ${escapeHtml(finding.recommendation)}</p></article>
  `).join('') : '<div class="empty">No findings. The suite passed cleanly.</div>';
  q('#traceList').innerHTML = run.trace.map((item) => `<div class="trace"><span class="trace-dot ${item.status}"></span><div><strong>${escapeHtml(item.node)}</strong><p>${escapeHtml(item.message)} · ${time(item.at)}</p></div></div>`).join('');
  renderAIReview(run);
}

async function load() {
  const response = await fetch('/api/overview');
  if (!response.ok) throw new Error('Unable to load overview');
  const data = await response.json();
  state.workflows = data.workflows;
  state.runs = data.runs;
  state.providerStatus = data.providerStatus;
  metrics(data.summary);
  workflowOptions();
  renderProviderHealth();
  renderRuns();
  if (state.runs[0]) showRun(state.runs[0]);
}

async function execute(formData) {
  const response = await fetch('/api/test-runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(formData)) });
  const run = await response.json();
  if (!response.ok) throw new Error(run.error || 'Test run failed');
  await load();
  showRun(run);
  const fallback = run.aiProvider?.fallbackUsed ? ' with fallback resilience' : '';
  toast(`${run.id} completed at ${run.score}% and reviewed by ${run.aiProvider?.label || 'local engine'}${fallback}`);
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 3000);
}

q('#workflowSelect').addEventListener('change', renderMap);
q('#runForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  button.textContent = 'Executing suite + provider chain…';
  try { await execute(new FormData(event.currentTarget)); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = 'Run suite + generate AI review'; }
});
q('#runList').addEventListener('click', (event) => {
  const card = event.target.closest('[data-run]');
  if (!card) return;
  const run = state.runs.find((item) => item.id === card.dataset.run);
  if (run) showRun(run);
});
q('#reset').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  await load();
  q('#resultTitle').textContent = 'Select or run a suite';
  q('#testResults').innerHTML = '';
  q('#findingList').innerHTML = '<div class="empty">No findings.</div>';
  q('#traceList').innerHTML = '';
  q('#reviewTitle').textContent = 'Select or run a suite';
  q('#releaseDecision').className = 'decision neutral';
  q('#releaseDecision').textContent = 'Awaiting evidence';
  q('#reviewProvider').innerHTML = '';
  q('#reviewBody').innerHTML = '<div class="empty">Run a suite to generate an executive review.</div>';
  toast('Test history cleared');
});
load().catch((error) => toast(error.message));
