import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflowSuite, severityFor, summarizeRuns } from '../engine.js';
import { createSimulatedPaidReview, generateReviewWithFallback, getReviewProviderStatus } from '../provider.js';

test('baseline suite covers workflow and security checks', () => {
  const run = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'none' }, 1, new Date('2026-07-26T12:00:00Z'));
  assert.equal(run.tests.length, 10);
  assert.equal(run.status, 'passed');
  assert.equal(run.score, 100);
  assert.equal(run.findings.length, 0);
});

test('tenant bypass produces a critical isolation finding', () => {
  const run = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'tenant-scope-bypass' }, 2);
  const finding = run.findings.find((item) => item.title.includes('Cross-tenant'));
  assert.equal(finding.severity, 'critical');
  assert.equal(run.status, 'failed');
});

test('duplicate event exposes idempotency regression', () => {
  const run = runWorkflowSuite({ workflowId: 'resident-maintenance', tenantId: 'tenant-harbor', fault: 'duplicate-event' }, 3);
  assert.equal(run.tests.find((item) => item.id === 'idempotency').status, 'failed');
  assert.equal(run.tests.find((item) => item.id === 'sla_timer').status, 'warning');
});

test('security failures are always critical', () => {
  assert.equal(severityFor('permission_scope', 'failed'), 'critical');
  assert.equal(severityFor('tenant_isolation', 'failed'), 'critical');
});

test('run summary counts critical and open findings', () => {
  const clean = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'none' }, 1);
  const failed = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'tenant-scope-bypass' }, 2);
  const summary = summarizeRuns([failed, clean]);
  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.criticalFindings, 1);
  assert.ok(summary.openFindings >= 1);
});

test('simulated paid review creates executive release guidance without network access', () => {
  const run = runWorkflowSuite({ workflowId: 'invoice-approval', tenantId: 'tenant-nova', fault: 'branch-regression' }, 4);
  const review = createSimulatedPaidReview(run);
  assert.equal(review.provider.tier, 'paid-simulated');
  assert.equal(review.provider.live, false);
  assert.match(review.narrative.releaseDecision, /BLOCK|REVIEW/);
  assert.ok(review.provider.promptTokens > 0);
});

test('falls back to local review when no live providers are configured', async () => {
  const run = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'webhook-timeout' }, 5);
  const review = await generateReviewWithFallback(run, { mode: 'auto', env: {} });
  assert.equal(review.provider.id, 'local-review-fallback');
  assert.equal(review.provider.fallbackUsed, true);
  assert.ok(review.narrative.executiveSummary.length > 20);
});

test('uses a configured free-compatible review API and validates the response', async () => {
  const run = runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'none' }, 6);
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({
        executiveSummary: 'Free provider review fixture.',
        releaseDecision: 'READY TO SHIP',
        businessRisk: 'Low risk.',
        rootCauseHypothesis: 'No failure.',
        remediationPlan: [],
        clientTalkingPoint: 'Free provider completed the review.'
      }) } }],
      usage: { prompt_tokens: 500, completion_tokens: 160 }
    })
  });
  const review = await generateReviewWithFallback(run, {
    mode: 'free-first',
    fetchImpl: fakeFetch,
    env: { FREE_AI_BASE_URL: 'https://example.test/v1', FREE_AI_API_KEY: 'test', FREE_AI_MODEL: 'free-model' }
  });
  assert.equal(review.provider.tier, 'free');
  assert.equal(review.provider.live, true);
  assert.equal(review.narrative.releaseDecision, 'READY TO SHIP');
});

test('provider status never exposes API keys', () => {
  const status = getReviewProviderStatus({ FREE_AI_BASE_URL: 'https://example.test/v1', FREE_AI_API_KEY: 'secret', FREE_AI_MODEL: 'free-model' });
  assert.equal(status.freeConfigured, true);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});
