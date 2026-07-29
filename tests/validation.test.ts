import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentDecision, parseWorkflowInput, ValidationError } from '../src/validation.ts';

test('parseWorkflowInput applies the default scenario', () => {
  const result = parseWorkflowInput({ requestId: 'req-1', sessionId: 'session-1', message: 'Webhook delivery is failing.' });
  assert.equal(result.scenario, 'success');
});

test('parseWorkflowInput rejects malformed requests', () => {
  assert.throws(() => parseWorkflowInput({ requestId: 'x', sessionId: '', message: 'bad' }), ValidationError);
});

test('parseAgentDecision accepts valid structured output', () => {
  const result = parseAgentDecision({
    category: 'api', severity: 'high', summary: 'The API is failing intermittently.', probableCause: 'Upstream timeout.',
    recommendedActions: ['Retry with idempotency.'], requiresHuman: false, confidence: 0.9,
  });
  assert.equal(result.category, 'api');
});

test('parseAgentDecision rejects invalid JSON', () => {
  assert.throws(() => parseAgentDecision('{bad json'), /not valid JSON/);
});
