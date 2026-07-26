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
