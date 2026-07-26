import { classifyRequest } from './engine.js';

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

function validateClassification(value, fallback) {
  const allowed = new Set(['emergency', 'urgent', 'routine']);
  const priority = allowed.has(value?.priority) ? value.priority : fallback.priority;
  const slaByPriority = { emergency: 15, urgent: 120, routine: 1440 };
  return {
    priority,
    confidence: Math.min(0.99, Math.max(0.5, Number(value?.confidence) || fallback.confidence)),
    slaMinutes: Number(value?.slaMinutes) > 0 ? Number(value.slaMinutes) : slaByPriority[priority],
    rationale: String(value?.rationale || fallback.rationale).slice(0, 500)
  };
}

function providerSnapshot(env = process.env) {
  return {
    defaultMode: env.AI_PROVIDER_MODE || 'simulated-paid',
    paidConfigured: Boolean(env.PAID_AI_API_KEY && env.PAID_AI_BASE_URL && env.PAID_AI_MODEL),
    freeConfigured: Boolean(env.FREE_AI_API_KEY && env.FREE_AI_BASE_URL && env.FREE_AI_MODEL),
    localAvailable: true,
    modes: [
      { id: 'simulated-paid', label: 'Premium AI simulation', available: true },
      { id: 'auto', label: 'Live API with free fallback', available: true },
      { id: 'free-first', label: 'Free-tier API first', available: true },
      { id: 'local', label: 'Deterministic local engine', available: true }
    ]
  };
}

export function getProviderStatus(env = process.env) {
  return providerSnapshot(env);
}

function simulatedPaid(input, fallback) {
  const textLength = `${input.category ?? ''} ${input.description ?? ''}`.trim().length;
  const promptTokens = Math.max(58, Math.round(textLength / 3.5) + 74);
  const completionTokens = 56;
  return {
    classification: { ...fallback, confidence: Math.max(fallback.confidence, 0.96) },
    provider: {
      id: 'premium-sim',
      label: 'Premium AI Simulation',
      tier: 'paid-simulated',
      model: 'enterprise-triage-v2',
      latencyMs: 420 + (textLength % 180),
      promptTokens,
      completionTokens,
      estimatedCostUsd: Number(((promptTokens + completionTokens) * 0.0000025).toFixed(6)),
      fallbackUsed: false,
      live: false
    }
  };
}

async function callCompatibleProvider({ input, baseUrl, apiKey, model, label, tier, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Classify a property maintenance request. Return JSON only with priority (emergency|urgent|routine), confidence (0-1), slaMinutes, and rationale. Emergency means life-safety or major active property damage. Urgent means habitability, access, water, HVAC, sewage, or essential equipment. Otherwise routine.'
          },
          {
            role: 'user',
            content: JSON.stringify({ category: input.category, description: input.description })
          }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    return {
      parsed,
      provider: {
        id: tier === 'paid' ? 'paid-live' : 'free-live',
        label,
        tier,
        model,
        latencyMs: Date.now() - started,
        promptTokens: payload?.usage?.prompt_tokens ?? null,
        completionTokens: payload?.usage?.completion_tokens ?? null,
        estimatedCostUsd: tier === 'paid' ? null : 0,
        fallbackUsed: false,
        live: true
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function triageWithFallback(input, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const fallback = classifyRequest(input);
  const mode = options.mode || env.AI_PROVIDER_MODE || 'simulated-paid';
  const timeoutMs = Number(env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (mode === 'simulated-paid') return simulatedPaid(input, fallback);
  if (mode === 'local') {
    return {
      classification: fallback,
      provider: {
        id: 'local-rules', label: 'Local Rules Engine', tier: 'local', model: 'deterministic-v1',
        latencyMs: 1, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, fallbackUsed: false, live: false
      }
    };
  }

  const paid = {
    baseUrl: env.PAID_AI_BASE_URL,
    apiKey: env.PAID_AI_API_KEY,
    model: env.PAID_AI_MODEL,
    label: env.PAID_AI_LABEL || 'Paid OpenAI-Compatible API',
    tier: 'paid'
  };
  const free = {
    baseUrl: env.FREE_AI_BASE_URL,
    apiKey: env.FREE_AI_API_KEY,
    model: env.FREE_AI_MODEL,
    label: env.FREE_AI_LABEL || 'Free-Tier OpenAI-Compatible API',
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
      const result = await callCompatibleProvider({ ...provider, input, timeoutMs, fetchImpl });
      return {
        classification: validateClassification(result.parsed, fallback),
        provider: { ...result.provider, fallbackUsed: attempts.length > 0, attempts }
      };
    } catch (error) {
      attempts.push(`${provider.tier}:${error.name === 'AbortError' ? 'timeout' : error.message}`);
    }
  }

  return {
    classification: fallback,
    provider: {
      id: 'local-fallback',
      label: 'Local Fallback Engine',
      tier: 'local',
      model: 'deterministic-v1',
      latencyMs: 1,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      fallbackUsed: true,
      live: false,
      attempts
    }
  };
}
