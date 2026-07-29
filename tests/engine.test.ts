import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../src/engine.ts';
import { ExecutionRepository } from '../src/repository.ts';
import type { AiProvider, DiagnosticResult, DiagnosticsProvider, WorkflowInput } from '../src/types.ts';
import { HttpError } from '../src/providers.ts';

const input: WorkflowInput = { requestId: 'req-engine-1', sessionId: 'session-1', message: 'Production webhook stopped for all users.', scenario: 'success' };
const diagnostic: DiagnosticResult = { service: 'mock', healthy: true, signal: 'healthy', latencyMs: 5, checkedAt: new Date().toISOString() };

class FakeDiagnostics implements DiagnosticsProvider {
  calls = 0;
  private readonly failOnce: boolean;
  private readonly alwaysFail: boolean;
  constructor(failOnce = false, alwaysFail = false) {
    this.failOnce = failOnce;
    this.alwaysFail = alwaysFail;
  }
  async run(): Promise<DiagnosticResult> {
    this.calls += 1;
    if (this.alwaysFail || (this.failOnce && this.calls === 1)) throw new HttpError('temporary', 503);
    return diagnostic;
  }
}

class FakeAi implements AiProvider {
  readonly mode = 'fake';
  calls = 0;
  private readonly invalidOnce: boolean;
  constructor(invalidOnce = false) {
    this.invalidOnce = invalidOnce;
  }
  async generate(): Promise<unknown> {
    this.calls += 1;
    if (this.invalidOnce && this.calls === 1) return '{bad';
    return { category: 'webhook', severity: 'critical', summary: 'The production webhook path is unavailable.', probableCause: 'A payload contract change broke the downstream branch.', recommendedActions: ['Validate the payload contract.', 'Replay one idempotent test event.'], requiresHuman: true, confidence: 0.96 };
  }
}

test('engine retries diagnostics and validates AI output', async () => {
  const repo = new ExecutionRepository(':memory:');
  const diagnostics = new FakeDiagnostics(true);
  const ai = new FakeAi(true);
  const engine = new WorkflowEngine(repo, diagnostics, ai);
  const result = await engine.execute(input);
  assert.equal(result.status, 'needs_human');
  assert.equal(result.telemetry.diagnosticsAttempts, 2);
  assert.equal(result.telemetry.aiAttempts, 2);
  assert.equal(repo.get(input.requestId)?.status, 'completed');
  repo.close();
});

test('engine returns persisted result for duplicate requestId', async () => {
  const repo = new ExecutionRepository(':memory:');
  const diagnostics = new FakeDiagnostics();
  const ai = new FakeAi();
  const engine = new WorkflowEngine(repo, diagnostics, ai);
  await engine.execute(input);
  const duplicate = await engine.execute(input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(diagnostics.calls, 1);
  repo.close();
});

test('engine persists terminal failure after retries exhaust', async () => {
  const repo = new ExecutionRepository(':memory:');
  const engine = new WorkflowEngine(repo, new FakeDiagnostics(false, true), new FakeAi());
  await assert.rejects(() => engine.execute({ ...input, requestId: 'req-fail-1' }), /retry attempts/);
  assert.equal(repo.get('req-fail-1')?.status, 'failed');
  repo.close();
});
