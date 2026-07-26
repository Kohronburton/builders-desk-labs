import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateSlaState,
  makeRequest,
  nextStatus,
  summarize
} from './engine.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

const initialInputs = [
  {
    residentName: 'Ana Torres', property: 'Bayline Residences', unit: '4B', category: 'Plumbing',
    description: 'Active leak under the kitchen sink is spreading across the cabinet.'
  },
  {
    residentName: 'Marcus Lee', property: 'Palm Court', unit: '12A', category: 'HVAC',
    description: 'No AC since last night and the apartment is getting very hot.'
  },
  {
    residentName: 'Sophia Grant', property: 'Harbor Point', unit: '2C', category: 'Safety',
    description: 'Smoke and sparking coming from an outlet near the bedroom.'
  },
  {
    residentName: 'Diego Ruiz', property: 'Bayline Residences', unit: '7D', category: 'General',
    description: 'Closet door is off the track and needs adjustment.'
  }
];

let sequence = 1004;
let requests = initialInputs.map((input, index) => {
  const now = new Date(Date.now() - (index + 1) * 17 * 60_000);
  return makeRequest(input, `MR-${1001 + index}`, now);
});
requests[0].status = 'vendor_assigned';
requests[0].estimateAmount = 285;
requests[1].status = 'scheduled';
requests[3].status = 'completed';

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
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

function validateInput(input) {
  const required = ['residentName', 'property', 'unit', 'category', 'description'];
  const missing = required.filter((field) => !String(input[field] ?? '').trim());
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

function withDerived(item) {
  return { ...item, slaState: calculateSlaState(item) };
}

function dashboard() {
  return {
    summary: summarize(requests),
    requests: requests.map(withDerived).sort((a, b) => {
      const priority = { emergency: 0, urgent: 1, routine: 2 };
      return priority[a.priority] - priority[b.priority] || new Date(a.dueAt) - new Date(b.dueAt);
    })
  };
}

async function serveStatic(pathname, res) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const data = await readFile(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
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
      return json(res, 200, { status: 'ok', service: 'property-management-automation', timestamp: new Date().toISOString() });
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      return json(res, 200, dashboard());
    }
    if (req.method === 'POST' && url.pathname === '/api/requests') {
      const input = await readJson(req);
      validateInput(input);
      sequence += 1;
      const request = makeRequest(input, `MR-${sequence}`);
      requests.unshift(request);
      return json(res, 201, withDerived(request));
    }
    const advanceMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/advance$/);
    if (req.method === 'POST' && advanceMatch) {
      const request = requests.find((item) => item.id === advanceMatch[1]);
      if (!request) return json(res, 404, { error: 'Request not found' });
      const previous = request.status;
      request.status = nextStatus(request.status);
      request.updatedAt = new Date().toISOString();
      if (request.status !== previous) {
        request.timeline.push({ at: request.updatedAt, label: `Status advanced to ${request.status.replaceAll('_', ' ')}` });
      }
      return json(res, 200, withDerived(request));
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      sequence = 1004;
      requests = initialInputs.map((input, index) => makeRequest(input, `MR-${1001 + index}`, new Date(Date.now() - (index + 1) * 17 * 60_000)));
      return json(res, 200, dashboard());
    }
    if (req.method === 'GET' && await serveStatic(url.pathname, res)) return;
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error.message || 'Request failed' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => {
    console.log(`Property automation demo listening on http://localhost:${port}`);
  });
}
