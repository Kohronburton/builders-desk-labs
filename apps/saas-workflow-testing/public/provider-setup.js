const setupButton = document.querySelector('#openProviderSetup');
const setupDialog = document.querySelector('#providerSetupDialog');
const setupForm = document.querySelector('#providerSetupForm');
const setupStatus = document.querySelector('#providerSetupStatus');
const closeSetup = document.querySelector('#closeProviderSetup');
const clearSetup = document.querySelector('#clearProviderSetup');

async function fetchStatus() {
  const response = await fetch('/api/providers');
  const data = await response.json();
  renderStatus(data);
  return data;
}

function renderStatus(data) {
  const source = data.keySource === 'session-memory' ? 'Session key connected' : data.keySource === 'environment' ? 'Environment key connected' : 'No live key connected';
  setupStatus.innerHTML = `<strong>${source}</strong><small>${data.keyHint || 'Simulation and local fallback remain available.'}</small>`;
  setupButton.textContent = data.keySource === 'none' ? 'Connect AI key' : 'AI key connected';
  setupButton.classList.toggle('connected', data.keySource !== 'none');
}

setupButton?.addEventListener('click', async () => {
  await fetchStatus();
  setupDialog.showModal();
});

closeSetup?.addEventListener('click', () => setupDialog.close());

setupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = setupForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving securely…';
  try {
    const response = await fetch('/api/provider-config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(setupForm)))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save provider');
    setupForm.apiKey.value = '';
    renderStatus(data);
    const selector = document.querySelector('[name="reviewProviderMode"]');
    if (selector) selector.value = 'auto';
    setupStatus.insertAdjacentHTML('beforeend', '<em>Saved in server memory. Run the next suite to verify the live model.</em>');
  } catch (error) {
    setupStatus.innerHTML = `<strong>Connection not saved</strong><small>${error.message}</small>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Save secure session key';
  }
});

clearSetup?.addEventListener('click', async () => {
  const response = await fetch('/api/provider-config', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupToken: setupForm.setupToken.value })
  });
  const data = await response.json();
  if (!response.ok) {
    setupStatus.innerHTML = `<strong>Unable to remove key</strong><small>${data.error || 'Request failed'}</small>`;
    return;
  }
  renderStatus(data);
});

fetchStatus().catch(() => {});
