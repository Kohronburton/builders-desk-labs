const DEFAULT_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(value = '') {
  return String(value).trim().replace(/\/$/, '');
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Provider did not return JSON');
  return JSON.parse(fenced.slice(start, end + 1));
}

function releaseDecision(run) {
  if (run.findings.some((item) => item.severity === 'critical')) return 'BLOCK RELEASE';
  if (run.findings.some((item) => ['high', 'medium'].includes(item.severity))) return 'REVIEW REQUIRED';
  if (run.findings.length) return 'SHIP WITH MONITORING';
  return 'READY TO SHIP';
}

function localNarrative(run) {
  const critical = run.findings.filter((item) => item.severity === 'critical');
  const high = run.findings.filter((item) => item.severity === 'high');
  const failedNames = run.tests.filter((item) => item.status === 'failed').map((item) => item.name);
  const summary = run.status === 'passed'
    ? `${run.workflowName} passed all ${run.summary.total} reliability checks for ${run.tenantId}. The workflow is ready for a controlled release with normal production monitoring.`
    : `${run.workflowName} scored ${run.score}% for ${run.tenantId}. ${run.summary.failed} check(s) failed and ${run.summary.warnings} warning(s) require attention before broad rollout.`;
  return {
    executiveSummary: summary,
    releaseDecision: releaseDecision(run),
    businessRisk: critical.length
      ? 'Cross-tenant data exposure or authorization bypass could create severe privacy, contractual, and reputational impact.'
      : high.length
        ? 'Reliability defects may duplicate actions, skip approvals, or leave customer workflows incomplete.'
        : run.findings.length
          ? 'The workflow remains functional, but degraded timing or observability may slow incident response.'
          : 'No material business risk was detected in the exercised scenarios.',
    rootCauseHypothesis: failedNames.length
      ? `Most likely concentration: ${failedNames.join('; ')}. Validate service-boundary controls, idempotency records, and durable timer creation.`
      : 'No failed control requires root-cause analysis in this run.',
    remediationPlan: run.findings.slice(0, 3).map((item, index) => ({
      priority: index + 1,
      title: item.title,
      action: item.recommendation
    })),
    clientTalkingPoint: run.status === 'passed'
      ? 'The suite proves the workflow can survive duplicate delivery, enforce tenant scope, and preserve traceability before production deployment.'
      : 'The demo does not just show a red test—it converts the failure into severity, evidence, business impact, and a concrete repair sequence.'
  };
}

function validateNarrative(value, fallback) {
  return {
    executiveSummary: String(value?.executiveSummary || fallback.executiveSummary).slice(0, 1200),
    releaseDecision: String(value?.releaseDecision || fallback.releaseDecision).slice(0, 80),
    businessRisk: String(value?.businessRisk || fallback.businessRisk).slice(0, 900),
    rootCauseHypothesis: String(value?.rootCauseHypothesis || fallback.rootCauseHypothesis).slice(0, 900),
    remediationPlan: Array.isArray(value?.remediationPlan)
      ? value.remediationPlan.slice(0, 5).map((item, index) => ({
          priority: Number(item?.priority) || index + 1,
          title: String(item?.title || `Remediation ${index + 1}`).slice(0, 160),
          action: String(item?.action || '').slice(0, 700)
        }))
      : fallback.remediationPlan,
    clientTalkingPoint: String(value?.clientTalkingPoint || fallback.clientTalkingPoint).slice(0, 900)
  };
}

export function getReviewProviderStatus(env = process.env) {
  return {
    defaultMode: env.REVIEW_PROVIDER_MODE || 'simulated-paid',
    paidConfigured: Boolean(env.PAID_AI_API_KEY && env.PAID_AI_BASE_URL && env.PAID_AI_MODEL),
    freeConfigured: Boolean(env.FREE_AI_API_KEY && env.FREE_AI_BASE_URL && env.FREE_AI_MODEL),
    localAvailable: true,
    modes: [
      { id: 'simulated-paid', label: 'Premium code-review simulation' },
      { id: 'auto', label: 'Live paid → free → local' },
      { id: 'free-first', label: 'Free → paid → local' },
      { id: 'local', label: 'Local deterministic review' }
    ]
  };
}

export function createSimulatedPaidReview(run) {
  const fallback = localNarrative(run);
  const promptTokens = 680 + run.tests.length * 38 + run.findings.length * 72;
  const completionTokens = 260 + run.findings.length * 54;
  return {
    narrative: fallback,
    provider: {
      id: 'premium-review-sim',
      label: 'Premium Engineering Review Simulation',
      tier: 'paid-simulated',
      model: 'enterprise-reviewer-v3',
      latencyMs: 880 + run.findings.length * 117,
      promptTokens,
      completionTokens,
      estimatedCostUsd: Number(((promptTokens + completionTokens) * 0.000004).toFixed(6)),
      fallbackUsed: false,
      live: false
    }
  };
}

async function callCompatibleProvider({ run, baseUrl, apiKey, model, label, tier, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a senior SaaS code-review lead. Return JSON only with executiveSummary, releaseDecision, businessRisk, rootCauseHypothesis, remediationPlan (array of priority,title,action), and clientTalkingPoint. Be precise, evidence-based, and concise.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              workflow: run.workflowName,
              tenant: run.tenantId,
              score: run.score,
              summary: run.summary,
              findings: run.findings,
              failedTests: run.tests.filter((item) => item.status !== 'passed')
            })
          }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    const payload = await response.json();
    return {
      parsed: extractJson(payload?.choices?.[0]?.message?.content),
      provider: {
        id: tier === 'paid' ? 'paid-review-live' : 'free-review-live',
        label,
        tier,
        model,
        latencyMs: Date.now() - started,
        promptTokens: payload?.usage?.prompt_tokens ?? null,
        completionTokens: payload?.usage?.completion_tokens ?? null,
        estimatedCostUsd: tier === 'free' ? 0 : null,
        fallbackUsed: false,
        live: true
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateReviewWithFallback(run, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const mode = options.mode || env.REVIEW_PROVIDER_MODE || 'simulated-paid';
  const timeoutMs = Number(env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const fallback = localNarrative(run);

  if (mode === 'simulated-paid') return createSimulatedPaidReview(run);
  if (mode === 'local') {
    return {
      narrative: fallback,
      provider: {
        id: 'local-review', label: 'Local Review Engine', tier: 'local', model: 'deterministic-review-v1',
        latencyMs: 2, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, fallbackUsed: false, live: false
      }
    };
  }

  const paid = {
    baseUrl: env.PAID_AI_BASE_URL,
    apiKey: env.PAID_AI_API_KEY,
    model: env.PAID_AI_MODEL,
    label: env.PAID_AI_LABEL || 'Paid OpenAI-Compatible Review API',
    tier: 'paid'
  };
  const free = {
    baseUrl: env.FREE_AI_BASE_URL,
    apiKey: env.FREE_AI_API_KEY,
    model: env.FREE_AI_MODEL,
    label: env.FREE_AI_LABEL || 'Free-Tier OpenAI-Compatible Review API',
    tier: 'free'
  };
  const configured = (provider) => Boolean(provider.baseUrl && provider.apiKey && provider.model);
  const order = mode === 'free-first' ? [free, paid] : [paid, free];
  const attempts = [];

  for (const provider of order) {
    if (!configured(provider)) {
      attempts.push(`${provider.tier}:not-configured`);
      continue;
    }
    try {
      const result = await callCompatibleProvider({ ...provider, run, timeoutMs, fetchImpl });
      return {
        narrative: validateNarrative(result.parsed, fallback),
        provider: { ...result.provider, fallbackUsed: attempts.length > 0, attempts }
      };
    } catch (error) {
      attempts.push(`${provider.tier}:${error.name === 'AbortError' ? 'timeout' : error.message}`);
    }
  }

  return {
    narrative: fallback,
    provider: {
      id: 'local-review-fallback',
      label: 'Local Review Fallback',
      tier: 'local',
      model: 'deterministic-review-v1',
      latencyMs: 2,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      fallbackUsed: true,
      live: false,
      attempts
    }
  };
}
