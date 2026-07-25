import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WorkflowEngine, DuplicateInProgressError } from './engine.ts';
import { handleMcp } from './mcp.ts';
import { HttpDiagnosticsProvider, createAiProvider } from './providers.ts';
import { ExecutionRepository } from './repository.ts';
import { parseWorkflowInput, ValidationError } from './validation.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');

export interface AppOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  diagnosticsUrl?: string;
  diagnosticsTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

async function readJson(req: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new ValidationError('request body exceeds 1 MB');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('request body must contain valid JSON');
  }
}

function mimeType(path: string): string {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream';
}

async function serveStatic(urlPath: string, res: ServerResponse): Promise<boolean> {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'content-type': mimeType(filePath), 'content-length': content.length });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

export async function createApp(options: AppOptions = {}): Promise<{
  server: Server;
  repository: ExecutionRepository;
  engine: WorkflowEngine;
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
}> {
  const env = options.env ?? process.env;
  const port = options.port ?? Number(env.PORT ?? 3000);
  const host = options.host ?? env.HOST ?? '0.0.0.0';
  const dbPath = options.dbPath ?? env.DB_PATH ?? join(rootDir, 'data', 'workflow-demo.sqlite');
  const repository = new ExecutionRepository(dbPath);
  const ai = createAiProvider(env);
  let runtimePort = port;
  const diagnostics = new HttpDiagnosticsProvider(
    () => options.diagnosticsUrl ?? env.DIAGNOSTICS_URL ?? `http://127.0.0.1:${runtimePort}/v1/mock/diagnostics`,
    options.diagnosticsTimeoutMs ?? Number(env.DIAGNOSTICS_TIMEOUT_MS ?? 800),
  );
  const engine = new WorkflowEngine(repository, diagnostics, ai);
  const diagnosticAttempts = new Map<string, number>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'ok', service: 'workflow-reliability-demo', aiMode: ai.mode, time: new Date().toISOString() });
      }
      if (req.method === 'GET' && url.pathname === '/v1/executions') {
        return sendJson(res, 200, { executions: repository.list(Number(url.searchParams.get('limit') ?? 20)) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/executions/')) {
        const id = decodeURIComponent(url.pathname.slice('/v1/executions/'.length));
        const record = repository.get(id);
        return record ? sendJson(res, 200, record) : sendJson(res, 404, { error: 'execution not found' });
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        const counts = repository.counts();
        const lines = [
          '# HELP workflow_started_total Total workflow executions started',
          '# TYPE workflow_started_total counter',
          `workflow_started_total ${engine.metrics.started}`,
          '# HELP workflow_completed_total Total workflow executions completed',
          '# TYPE workflow_completed_total counter',
          `workflow_completed_total ${engine.metrics.completed}`,
          `workflow_failed_total ${engine.metrics.failed}`,
          `workflow_duplicates_total ${engine.metrics.duplicates}`,
          `workflow_retries_total ${engine.metrics.retries}`,
          `workflow_persisted_processing ${counts.processing ?? 0}`,
          `workflow_persisted_completed ${counts.completed ?? 0}`,
          `workflow_persisted_failed ${counts.failed ?? 0}`,
        ];
        return sendText(res, 200, `${lines.join('\n')}\n`, 'text/plain; version=0.0.4; charset=utf-8');
      }
      if (req.method === 'POST' && url.pathname === '/v1/workflows/support-triage') {
        const input = parseWorkflowInput(await readJson(req));
        const output = await engine.execute(input);
        return sendJson(res, 200, output);
      }
      if (req.method === 'POST' && url.pathname === '/v1/mock/diagnostics') {
        const body = await readJson(req) as Record<string, unknown>;
        const requestId = String(body.requestId ?? 'unknown');
        const scenario = String(body.scenario ?? 'success');
        const count = (diagnosticAttempts.get(requestId) ?? 0) + 1;
        diagnosticAttempts.set(requestId, count);
        const started = Date.now();
        if (scenario === 'timeout-once' && count === 1) {
          await new Promise((resolve) => setTimeout(resolve, Number(env.MOCK_TIMEOUT_MS ?? 1200)));
        }
        if (scenario === 'rate-limit-once' && count === 1) return sendJson(res, 429, { error: 'simulated upstream rate limit' });
        if (scenario === 'permanent-failure') return sendJson(res, 503, { error: 'simulated permanent upstream outage' });
        return sendJson(res, 200, {
          service: 'campaign-dispatch-api',
          healthy: true,
          signal: count > 1 ? 'recovered-after-retry' : 'healthy',
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
        });
      }
      if (req.method === 'POST' && url.pathname === '/v1/events/n8n-error') {
        const id = repository.logExternalFailure(await readJson(req) as Record<string, unknown>);
        return sendJson(res, 202, { accepted: true, requestId: id });
      }
      if (req.method === 'POST' && url.pathname === '/mcp') {
        const body = await readJson(req) as Parameters<typeof handleMcp>[0];
        return sendJson(res, 200, await handleMcp(body, engine, repository));
      }
      if (req.method === 'GET' && await serveStatic(url.pathname, res)) return;
      sendJson(res, 404, { error: 'route not found' });
    } catch (error) {
      if (error instanceof ValidationError) return sendJson(res, 400, { error: error.message, code: error.code });
      if (error instanceof DuplicateInProgressError) return sendJson(res, 409, { error: error.message, code: error.code });
      const message = error instanceof Error ? error.message : 'internal server error';
      console.error(JSON.stringify({ level: 'error', message, path: url.pathname, stack: error instanceof Error ? error.stack : undefined }));
      sendJson(res, 500, { error: message, code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'INTERNAL_ERROR' });
    }
  });

  return {
    server,
    repository,
    engine,
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        const address = server.address();
        runtimePort = typeof address === 'object' && address ? address.port : port;
        resolve({ port: runtimePort, host });
      });
    }),
    stop: () => new Promise((resolve, reject) => server.close((error) => {
      repository.close();
      error ? reject(error) : resolve();
    })),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const app = await createApp();
  const address = await app.start();
  console.log(JSON.stringify({ level: 'info', message: 'workflow reliability demo started', ...address }));
  const shutdown = async () => {
    await app.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
