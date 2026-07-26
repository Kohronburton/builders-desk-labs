const emergencyTerms = [
  'fire', 'smoke', 'gas', 'flood', 'burst pipe', 'sparking', 'electrical fire',
  'carbon monoxide', 'ceiling collapse', 'no heat with infant', 'active break-in'
];

const urgentTerms = [
  'leak', 'no ac', 'air conditioning', 'no heat', 'lockout', 'broken lock',
  'toilet overflow', 'sewage', 'electrical', 'refrigerator', 'water heater',
  'mold', 'pest', 'roof'
];

const routingRules = [
  { team: 'Emergency Response', terms: emergencyTerms },
  { team: 'Plumbing', terms: ['leak', 'pipe', 'toilet', 'sink', 'water', 'sewage', 'drain'] },
  { team: 'HVAC', terms: ['ac', 'air conditioning', 'heat', 'thermostat', 'vent'] },
  { team: 'Electrical', terms: ['power', 'outlet', 'sparking', 'electrical', 'breaker', 'light'] },
  { team: 'Access & Security', terms: ['lock', 'key', 'door', 'break-in', 'gate'] },
  { team: 'Appliance', terms: ['refrigerator', 'oven', 'washer', 'dryer', 'dishwasher'] },
  { team: 'General Maintenance', terms: [] }
];

export const statusFlow = ['triaged', 'vendor_assigned', 'scheduled', 'in_progress', 'completed'];

export function normalizeText(value = '') {
  return String(value).trim().toLowerCase();
}

export function classifyRequest(input) {
  const text = normalizeText(`${input.category ?? ''} ${input.description ?? ''}`);
  if (emergencyTerms.some((term) => text.includes(term))) {
    return {
      priority: 'emergency',
      confidence: 0.98,
      slaMinutes: 15,
      rationale: 'Emergency language indicates immediate life-safety or major property risk.'
    };
  }
  if (urgentTerms.some((term) => text.includes(term))) {
    return {
      priority: 'urgent',
      confidence: 0.9,
      slaMinutes: 120,
      rationale: 'The issue affects habitability, security, water, HVAC, or essential equipment.'
    };
  }
  return {
    priority: 'routine',
    confidence: 0.82,
    slaMinutes: 1440,
    rationale: 'No emergency or habitability indicators were detected.'
  };
}

export function routeRequest(input) {
  const text = normalizeText(`${input.category ?? ''} ${input.description ?? ''}`);
  return routingRules.find((rule) => rule.terms.length === 0 || rule.terms.some((term) => text.includes(term))).team;
}

export function nextStatus(currentStatus) {
  const index = statusFlow.indexOf(currentStatus);
  if (index < 0 || index === statusFlow.length - 1) return currentStatus;
  return statusFlow[index + 1];
}

export function createResidentMessage(request) {
  const windows = {
    emergency: 'A response team is being contacted now. Please move to a safe location if needed.',
    urgent: 'A vendor is being assigned with a target response within two hours.',
    routine: 'Your request has been logged and is targeted for review within one business day.'
  };
  return `Hi ${request.residentName}, we received request ${request.id} for ${request.property}. ${windows[request.priority]}`;
}

export function makeRequest(input, id, now = new Date()) {
  const classification = classifyRequest(input);
  const assignedTeam = routeRequest(input);
  const createdAt = now.toISOString();
  const dueAt = new Date(now.getTime() + classification.slaMinutes * 60_000).toISOString();
  const request = {
    id,
    residentName: input.residentName.trim(),
    property: input.property.trim(),
    unit: input.unit.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    priority: classification.priority,
    confidence: classification.confidence,
    rationale: classification.rationale,
    slaMinutes: classification.slaMinutes,
    dueAt,
    assignedTeam,
    status: 'triaged',
    estimateAmount: null,
    ownerApprovalRequired: classification.priority !== 'emergency',
    createdAt,
    updatedAt: createdAt,
    timeline: [
      { at: createdAt, label: 'Request received' },
      { at: createdAt, label: `AI triage: ${classification.priority}` },
      { at: createdAt, label: `Routed to ${assignedTeam}` }
    ]
  };
  request.residentMessage = createResidentMessage(request);
  return request;
}

export function calculateSlaState(request, now = new Date()) {
  if (request.status === 'completed') return 'met';
  const due = new Date(request.dueAt).getTime();
  const remaining = due - now.getTime();
  if (remaining < 0) return 'breached';
  if (remaining <= 30 * 60_000) return 'at_risk';
  return 'on_track';
}

export function summarize(requests, now = new Date()) {
  const active = requests.filter((item) => item.status !== 'completed');
  return {
    total: requests.length,
    active: active.length,
    emergencies: active.filter((item) => item.priority === 'emergency').length,
    atRisk: active.filter((item) => ['at_risk', 'breached'].includes(calculateSlaState(item, now))).length,
    completed: requests.filter((item) => item.status === 'completed').length,
    avgAutomationConfidence: requests.length
      ? Math.round((requests.reduce((sum, item) => sum + item.confidence, 0) / requests.length) * 100)
      : 0
  };
}
