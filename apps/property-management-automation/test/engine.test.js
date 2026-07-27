import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSlaState,
  classifyRequest,
  makeRequest,
  nextStatus,
  routeRequest,
  summarize
} from '../engine.js';
import { getProviderStatus, triageWithFallback } from '../provider.js';

test('classifies life-safety language as emergency', () => {
  const result = classifyRequest({ category: 'Electrical', description: 'Smoke and sparking from outlet' });
  assert.equal(result.priority, 'emergency');
  assert.equal(result.slaMinutes, 15);
});

test('routes plumbing issues to the plumbing team', () => {
  assert.equal(routeRequest({ description: 'Water leak under sink' }), 'Plumbing');
});

test('creates a request with SLA and communication artifacts', () => {
  const now = new Date('2026-07-26T12:00:00Z');
  const request = makeRequest({
    residentName: 'Jordan', property: 'Palm Court', unit: '8F', category: 'HVAC', description: 'No AC'
  }, 'MR-1', now);
  assert.equal(request.priority, 'urgent');
  assert.equal(request.assignedTeam, 'HVAC');
  assert.match(request.residentMessage, /MR-1/);
  assert.equal(request.timeline.length, 3);
});

test('accepts a provider-supplied structured classification', () => {
  const request = makeRequest({
    residentName: 'Jordan', property: 'Palm Court', unit: '8F', category: 'General', description: 'Provider override fixture'
  }, 'MR-2', new Date('2026-07-26T12:00:00Z'), {
    priority: 'urgent', confidence: 0.97, slaMinutes: 60, rationale: 'Provider fixture'
  });
  assert.equal(request.priority, 'urgent');
  assert.equal(request.slaMinutes, 60);
});

test('advances statuses without moving past completed', () => {
  assert.equal(nextStatus('triaged'), 'vendor_assigned');
  assert.equal(nextStatus('completed'), 'completed');
});

test('detects breached SLAs and summarizes portfolio state', () => {
  const request = makeRequest({
    residentName: 'Jordan', property: 'Palm Court', unit: '8F', category: 'General', description: 'Paint touch-up'
  }, 'MR-1', new Date('2026-07-25T12:00:00Z'));
  const now = new Date('2026-07-27T12:00:00Z');
  assert.equal(calculateSlaState(request, now), 'breached');
  assert.equal(summarize([request], now).atRisk, 1);
});

test('simulates a premium paid provider without a network call', async () => {
  const result = await triageWithFallback({ category: 'Safety', description: 'Smoke from an outlet' }, { mode: 'simulated-paid' });
  assert.equal(result.provider.tier, 'paid-simulated');
  assert.equal(result.provider.live, false);
  assert.equal(result.classification.priority, 'emergency');
  assert.ok(result.provider.promptTokens > 0);
});

test('falls back locally when live paid and free providers are not configured', async () => {
  const result = await triageWithFallback(
    { category: 'HVAC', description: 'No AC' },
    { mode: 'auto', env: {} }
  );
  assert.equal(result.provider.id, 'local-fallback');
  assert.equal(result.provider.fallbackUsed, true);
  assert.equal(result.classification.priority, 'urgent');
});

test('uses a configured free-compatible provider and validates JSON output', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"priority":"urgent","confidence":0.93,"slaMinutes":90,"rationale":"Free provider fixture"}' } }],
      usage: { prompt_tokens: 80, completion_tokens: 30 }
    })
  });
  const result = await triageWithFallback(
    { category: 'Plumbing', description: 'Water leak' },
    {
      mode: 'free-first',
      fetchImpl: fakeFetch,
      env: { FREE_AI_BASE_URL: 'https://example.test/v1', FREE_AI_API_KEY: 'test', FREE_AI_MODEL: 'free-model' }
    }
  );
  assert.equal(result.provider.tier, 'free');
  assert.equal(result.provider.live, true);
  assert.equal(result.classification.slaMinutes, 90);
});

test('reports provider configuration without exposing secrets', () => {
  const status = getProviderStatus({ FREE_AI_API_KEY: 'secret', FREE_AI_BASE_URL: 'https://example.test/v1', FREE_AI_MODEL: 'free-model' });
  assert.equal(status.freeConfigured, true);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});
