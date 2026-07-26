import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflowSuite, summarizeRuns, workflowDefinitions } from './engine.js';
import { createSimulatedPaidReview, generateReviewWithFallback, getReviewProviderStatus } from './provider.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

function attachSeedReview(run, providerOverride = null) {
  const review = createSimulatedPaidReview(run);
  run.aiReview = review.narrative;
  run.aiProvider = providerOverride || review.provider;
  return run;
}

let sequence = 3;
let runs = [
  attachSeedReview(runWorkflowSuite({ workflowId: 'resident-maintenance', tenantId: 'tenant-harbor', fault: 'none' }, 3, new Date(Date.now() - 20 * 60_000))),
  attachSeedReview(runWorkflowSuite({ workflowId: 'invoice-approval', tenantId: 'tenant-nova', fault: 'database-latency' }, 2, new Date(Date.now() - 74 * 60_000)), {
    id: 'free-review-live', label: 'Free-Tier Review API', tier: 'free', model: 'community-review-model', latencyMs: 904,
    promptTokens: 1120, completionTokens: 322, estimatedCostUsd: 0, fallbackUsed: true, live: true, attempts: ['paid:not-configured']
  }),
  attachSeedReview(runWorkflowSuite({ workflowId: 'support-intake', tenantId: 'tenant-acme', fault: 'tenant-scope-bypass' }, 1, new Date(Date.now() - 142 * 60_000)), {
    id: 'local-review-fallback', label: 'Local Review Fallback', tier: 'local', model: 'deterministic-review-v1', latencyMs: 2,
    promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, fallbackUsed: true, live: false,
    attempts: ['paid:timeout', 'free:quota-exceeded']
  })
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Payload too large');
  }
  return body ? JSON.parse(body) : {};
}

function overview() {
  return {
    summary: summarizeRuns(runs),
    providerStatus: getReviewProviderStatus(),
    workflows: workflowDefinitions,
    runs: runs.slice(0, 8)
  };
}

async function serveStatic(pathname, res) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const data = await readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        service: 'saas-workflow-testing',
        providers: getReviewProviderStatus(),
        timestamp: new Date().toISOString()
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/providers') {
      return json(res, 200, getReviewProviderStatus());
    }
    if (req.method === 'GET' && url.pathname === '/api/overview') {
      return json(res, 200, overview());
    }
    if (req.method === 'POST' && url.pathname === '/api/test-runs') {
      const input = await readJson(req);
      if (!input.workflowId || !input.tenantId) throw new Error('workflowId and tenantId are required');
      sequence += 1;
      const run = runWorkflowSuite(input, sequence);
      const review = await generateReviewWithFallback(run, { mode: input.reviewProviderMode });
      run.aiReview = review.narrative;
      run.aiProvider = review.provider;
      runs.unshift(run);
      return json(res, 201, run);
    }
    const match = url.pathname.match(/^\/api\/test-runs\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const run = runs.find((item) => item.id === match[1]);
      return run ? json(res, 200, run) : json(res, 404, { error: 'Run not found' });
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      sequence = 0;
      runs = [];
      return json(res, 200, overview());
    }
    if (req.method === 'GET' && await serveStatic(url.pathname, res)) return;
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error.message || 'Request failed' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => console.log(`Workflow testing demo listening on http://localhost:${port}`));
}
