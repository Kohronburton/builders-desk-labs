import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.js';

test('health endpoint identifies the course', async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'qa-foundations-course');
  await new Promise((resolve) => server.close(resolve));
});
