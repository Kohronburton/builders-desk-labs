import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';

test('server exposes health, workflow, execution, and MCP endpoints', async () => {
  const app = await createApp({ port: 0, host: '127.0.0.1', dbPath: ':memory:', env: { ...process.env, AI_MODE: 'deterministic' } });
  const address = await app.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const payload = { requestId: 'req-http-1', sessionId: 'session-http', message: 'Webhook automation stopped and the API times out.', scenario: 'invalid-ai-once' };
    const response = await fetch(`${base}/v1/workflows/support-triage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.telemetry.aiAttempts, 2);

    const persisted = await fetch(`${base}/v1/executions/req-http-1`);
    assert.equal(persisted.status, 200);

    const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    const mcpBody = await mcp.json();
    assert.equal(mcpBody.result.tools.length, 2);
  } finally {
    await app.stop();
  }
});
