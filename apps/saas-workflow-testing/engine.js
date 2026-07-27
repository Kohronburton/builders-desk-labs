export const workflowDefinitions = [
  {
    id: 'support-intake',
    name: 'Support Intake & Escalation',
    trigger: 'ticket.created',
    slaMinutes: 30,
    retries: 3,
    nodes: ['Trigger', 'Validate tenant', 'Classify issue', 'Priority branch', 'Assign team', 'Start SLA', 'Notify'],
    branches: ['critical', 'standard', 'billing'],
    integrations: ['LLM classifier', 'Email', 'Slack']
  },
  {
    id: 'invoice-approval',
    name: 'Invoice Approval',
    trigger: 'invoice.submitted',
    slaMinutes: 240,
    retries: 2,
    nodes: ['Trigger', 'Validate tenant', 'Amount branch', 'Manager approval', 'Finance approval', 'ERP sync'],
    branches: ['under_5000', 'over_5000', 'rejected'],
    integrations: ['ERP', 'Email']
  },
  {
    id: 'resident-maintenance',
    name: 'Resident Maintenance Routing',
    trigger: 'maintenance.requested',
    slaMinutes: 120,
    retries: 4,
    nodes: ['Trigger', 'Validate tenant', 'Classify urgency', 'Trade branch', 'Vendor dispatch', 'SLA monitor', 'Resident update'],
    branches: ['emergency', 'urgent', 'routine'],
    integrations: ['Property system', 'SMS', 'Vendor API']
  }
];

const baseChecks = [
  ['workflow_schema', 'Workflow schema validates', 'architecture'],
  ['trigger_contract', 'Trigger contract accepts valid events', 'api'],
  ['branch_coverage', 'All decision branches produce expected state', 'workflow'],
  ['action_outputs', 'Actions persist expected outputs', 'workflow'],
  ['sla_timer', 'SLA timer starts once and expires correctly', 'reliability'],
  ['retry_policy', 'Transient failures retry with bounded backoff', 'reliability'],
  ['idempotency', 'Duplicate events do not duplicate actions', 'reliability'],
  ['tenant_isolation', 'Cross-tenant access is blocked', 'security'],
  ['permission_scope', 'Role permissions are enforced', 'security'],
  ['audit_context', 'Logs include tenant, workflow, run, and correlation IDs', 'observability']
];

const faultImpact = {
  none: {},
  'webhook-timeout': {
    retry_policy: ['failed', 'Webhook retries stop after the second attempt instead of honoring the configured policy.'],
    action_outputs: ['failed', 'Downstream notification output is missing after timeout.']
  },
  'tenant-scope-bypass': {
    tenant_isolation: ['failed', 'A forged tenant header returns another tenant’s workflow state.'],
    audit_context: ['warning', 'The authorization denial log omits the requested tenant ID.']
  },
  'duplicate-event': {
    idempotency: ['failed', 'The same event ID creates two downstream actions and two SLA timers.'],
    sla_timer: ['warning', 'Duplicate delivery creates competing SLA deadlines.']
  },
  'database-latency': {
    sla_timer: ['warning', 'Timer persistence exceeds the 500 ms reliability budget.'],
    action_outputs: ['warning', 'Output persistence is slow but remains consistent.']
  },
  'branch-regression': {
    branch_coverage: ['failed', 'The high-value branch routes directly to the ERP without finance approval.'],
    permission_scope: ['failed', 'A manager role reaches a finance-only action on the regressed branch.']
  }
};

export function getWorkflow(id) {
  return workflowDefinitions.find((item) => item.id === id) ?? workflowDefinitions[0];
}

export function severityFor(checkId, status) {
  if (status === 'passed') return 'none';
  if (checkId === 'tenant_isolation' || checkId === 'permission_scope') return 'critical';
  if (['idempotency', 'retry_policy', 'branch_coverage'].includes(checkId) && status === 'failed') return 'high';
  return status === 'failed' ? 'medium' : 'low';
}

export function runWorkflowSuite({ workflowId, tenantId, fault = 'none' }, runNumber = 1, now = new Date()) {
  const workflow = getWorkflow(workflowId);
  const impact = faultImpact[fault] ?? {};
  const tests = baseChecks.map(([id, name, category], index) => {
    const injected = impact[id];
    const status = injected?.[0] ?? 'passed';
    const message = injected?.[1] ?? successEvidence(id, workflow, tenantId);
    return {
      id,
      name,
      category,
      status,
      severity: severityFor(id, status),
      durationMs: 18 + ((index * 23 + runNumber * 11) % 140),
      evidence: message
    };
  });
  const passed = tests.filter((item) => item.status === 'passed').length;
  const warnings = tests.filter((item) => item.status === 'warning').length;
  const failed = tests.filter((item) => item.status === 'failed').length;
  const score = Math.max(0, Math.round(((passed + warnings * 0.5) / tests.length) * 100));
  const id = `RUN-${String(runNumber).padStart(4, '0')}`;
  return {
    id,
    workflowId: workflow.id,
    workflowName: workflow.name,
    tenantId,
    fault,
    status: failed ? 'failed' : warnings ? 'warning' : 'passed',
    score,
    startedAt: now.toISOString(),
    durationMs: tests.reduce((sum, item) => sum + item.durationMs, 0),
    summary: { total: tests.length, passed, warnings, failed },
    tests,
    findings: tests.filter((item) => item.status !== 'passed').map((item, index) => ({
      id: `F-${runNumber}-${index + 1}`,
      title: item.name,
      severity: item.severity,
      category: item.category,
      evidence: item.evidence,
      recommendation: recommendationFor(item.id)
    })),
    trace: buildTrace(workflow, tenantId, fault, now)
  };
}

function successEvidence(id, workflow, tenantId) {
  const evidence = {
    workflow_schema: `${workflow.nodes.length} nodes and ${workflow.branches.length} branches validated against the workflow schema.`,
    trigger_contract: `${workflow.trigger} accepted with tenant ${tenantId} and a valid correlation ID.`,
    branch_coverage: `${workflow.branches.join(', ')} branches reached expected terminal states.`,
    action_outputs: 'UI state, API response, and persisted output match the expected fixture.',
    sla_timer: `One ${workflow.slaMinutes}-minute SLA timer was created and cancelled on completion.`,
    retry_policy: `${workflow.retries} bounded retries use exponential backoff and preserve correlation context.`,
    idempotency: 'Repeated event ID returned the existing run without duplicating side effects.',
    tenant_isolation: 'Tenant-scoped token could not read or mutate another tenant’s workflow data.',
    permission_scope: 'Viewer, operator, manager, and admin fixtures matched the authorization matrix.',
    audit_context: 'Structured logs contain tenant_id, workflow_id, run_id, actor_id, and correlation_id.'
  };
  return evidence[id];
}

function recommendationFor(id) {
  const recommendations = {
    tenant_isolation: 'Derive tenant scope from the verified session, reject client-supplied tenant overrides, and add cross-tenant integration tests.',
    permission_scope: 'Move authorization checks into the service boundary and test every action against the role matrix.',
    idempotency: 'Persist an idempotency key before side effects and enforce a unique tenant/event constraint.',
    retry_policy: 'Centralize retry policy, classify transient errors, and add dead-letter handling with alerts.',
    branch_coverage: 'Add contract fixtures for every branch and require branch coverage in CI before deployment.',
    sla_timer: 'Use one durable timer record per workflow instance and guard creation with an idempotent transaction.',
    action_outputs: 'Wrap state mutation and outbox creation in one transaction, then reconcile asynchronous delivery.',
    audit_context: 'Adopt a structured logger that injects tenant and correlation context at request entry.'
  };
  return recommendations[id] ?? 'Add a regression test and a measurable reliability acceptance criterion.';
}

function buildTrace(workflow, tenantId, fault, now) {
  return workflow.nodes.map((node, index) => ({
    at: new Date(now.getTime() + index * 47).toISOString(),
    node,
    status: fault === 'branch-regression' && node.toLowerCase().includes('branch') ? 'error' : 'ok',
    message: `${node} executed for ${tenantId}`
  }));
}

export function summarizeRuns(runs) {
  const latest = runs[0];
  const findings = runs.flatMap((run) => run.findings);
  return {
    totalRuns: runs.length,
    latestScore: latest?.score ?? 100,
    passRate: runs.length ? Math.round((runs.filter((run) => run.status === 'passed').length / runs.length) * 100) : 100,
    criticalFindings: findings.filter((item) => item.severity === 'critical').length,
    openFindings: findings.length
  };
}
