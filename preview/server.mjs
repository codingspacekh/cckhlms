// preview.cckh.dev for development and tests (ADR 0001). Production serves the same files from a
// small static container behind the Cloudflare Tunnel.
// Serves the frame with its own permissive CSP, only embeddable by the LMS, and never sets cookies.
import { readFile } from 'node:fs/promises';
import http from 'node:http';

const LMS = process.env.LMS_ORIGIN ?? 'http://lms.localhost:3300';
const PORT = Number(process.env.PREVIEW_PORT ?? 3102);
const dir = new URL('.', import.meta.url);
const FRAME_CSP = `default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors ${LMS}`;

const routes = {
  '/frame': { file: 'frame.html', type: 'text/html; charset=utf-8', csp: FRAME_CSP },
  '/frame.js': { file: 'frame.js', type: 'text/javascript; charset=utf-8' },
  '/preview-doc.mjs': { file: 'preview-doc.mjs', type: 'text/javascript; charset=utf-8' },
};

http
  .createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    const r = routes[path];
    if (!r) {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = await readFile(new URL(r.file, dir), 'utf8');
    if (r.file === 'frame.html') body = body.replace('__LMS_ORIGIN__', LMS);
    res.writeHead(200, {
      'content-type': r.type,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      ...(r.csp ? { 'content-security-policy': r.csp } : {}),
    });
    res.end(body);
  })
  .listen(PORT, () => console.log(`preview on :${PORT} (LMS ${LMS})`));
