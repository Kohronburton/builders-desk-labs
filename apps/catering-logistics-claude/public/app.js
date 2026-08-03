const state = { selected: ['chicken', 'pasta', 'salad'], package: null };
const $ = (id) => document.getElementById(id);

async function loadRecipes() {
  const response = await fetch('/api/recipes');
  const recipes = await response.json();
  $('menuChips').innerHTML = recipes.map(recipe => `<button class="chip selected" data-id="${recipe.id}">${recipe.name}</button>`).join('');
  document.querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.id;
    state.selected = state.selected.includes(id) ? state.selected.filter(item => item !== id) : [...state.selected, id];
    button.classList.toggle('selected');
    generatePackage();
  }));
}

function payload() {
  return {
    guests: Number($('guests').value || 1),
    buffer: Number($('buffer').value || 0),
    selected: state.selected
  };
}

async function generatePackage() {
  $('generateBtn').disabled = true;
  $('generateBtn').textContent = 'Generating…';
  const response = await fetch('/api/operations-package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload())
  });
  state.package = await response.json();
  render(state.package);
  $('generateBtn').disabled = false;
  $('generateBtn').textContent = 'Generate package';
}

function render(data) {
  $('metricGuests').textContent = data.inputs.guests;
  $('metricProduction').textContent = data.inputs.production_count;
  $('metricBuffer').textContent = `${data.inputs.buffer_percent}% buffer included`;
  $('metricLines').textContent = data.prep_rows.length;
  $('metricWarnings').textContent = data.warnings.length;
  $('healthScore').textContent = `${data.health.score}%`;
  $('generatedAt').textContent = `Generated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} from normalized workspace data`;

  $('prepRows').innerHTML = data.prep_rows.map(row => `<tr><td>${row.dish}</td><td>${row.ingredient}</td><td>${row.quantity}</td><td>${row.unit}</td></tr>`).join('');
  $('assemblyRows').innerHTML = data.assembly.map(item => `<div><span>${String(item.step).padStart(2, '0')}</span><p><strong>${item.title}.</strong> ${item.instruction}</p></div>`).join('');
  $('timelineRows').innerHTML = data.timeline.map(item => `<div><span class="timeline-dot ${item.status.toLowerCase()}"></span><div><strong>${item.name}</strong><p>${item.owner} · ${item.start}</p></div><em>${item.status}</em></div>`).join('');
  $('warnings').innerHTML = data.warnings.map((warning, index) => `<div class="warning"><span>${index + 1}</span><p>${warning}</p></div>`).join('');
  $('healthRows').innerHTML = Object.entries(data.health).filter(([key]) => key !== 'score').map(([key, value]) => `<div class="health-row"><span>${key.replaceAll('_', ' ')}</span><b>${value}</b></div>`).join('');
  $('sourceRows').innerHTML = data.sources.map(source => `<div class="source-row"><div><strong>${source.kind}</strong><span>${source.source}</span><small>${source.purpose}</small></div><div><b>${source.status}</b><small>${source.records} records</small></div></div>`).join('');
}

async function exportPrep() {
  const response = await fetch('/api/export/prep.csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload())
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'catering-prep-list.csv';
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  $(`${button.dataset.tab}Tab`).classList.add('active');
}));

$('guests').addEventListener('change', generatePackage);
$('buffer').addEventListener('change', generatePackage);
$('generateBtn').addEventListener('click', generatePackage);
$('exportBtn').addEventListener('click', exportPrep);

loadRecipes().then(generatePackage).catch(error => {
  console.error(error);
  $('generatedAt').textContent = 'Unable to load workspace data';
});
