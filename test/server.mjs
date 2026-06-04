// Minimal static file server for the test harness. OpenSoul is a zero-build
// static site, so tests just serve the repo root and drive it in a real browser.
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

// Start the server on a random free port. Returns { url, close }.
export async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(req.url.split('?')[0]));
      const path = rel === '/' ? join(ROOT, 'index.html') : join(ROOT, rel);
      if (!path.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { url: `http://localhost:${port}/`, close: () => server.close() };
}
