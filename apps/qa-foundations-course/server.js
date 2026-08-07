import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
const port = Number(process.env.PORT || 3001);
const json = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };

async function serve(pathname, res) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const target = join(publicDir, safe);
  if (!target.startsWith(publicDir)) return false;
  try {
    const content = await readFile(target);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream' });
    res.end(content); return true;
  } catch { return false; }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'qa-foundations-course' });
  if (req.method === 'GET' && await serve(url.pathname, res)) return;
  return json(res, 404, { error: 'Not found' });
});
if (process.env.NODE_ENV !== 'test') server.listen(port, () => console.log(`QA course listening on http://localhost:${port}`));
