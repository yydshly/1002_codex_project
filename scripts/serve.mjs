import http from 'node:http';
import path from 'node:path';
import { stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_site');
const { values } = parseArgs({ options: { port: { type: 'string', default: '4173' } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口需为 1024–65535 的整数。');
const actualRoot = await realpath(root);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const inside = target => { const relative = path.relative(actualRoot, target); return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)); };

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let target = path.resolve(actualRoot, `.${pathname}`);
    if (!inside(target)) { response.writeHead(403); response.end('Forbidden'); return; }
    let info = await stat(target);
    if (info.isDirectory()) {
      if (!pathname.endsWith('/')) { response.writeHead(301, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
      target = path.join(target, 'index.html');
      info = await stat(target);
    }
    const actualTarget = await realpath(target);
    if (!info.isFile() || !inside(actualTarget)) { response.writeHead(403); response.end('Forbidden'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else { const stream = createReadStream(actualTarget); stream.on('error', () => response.destroy()); stream.pipe(response); }
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400);
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Bad request');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，可运行 node scripts/serve.mjs --port ${port + 1}。` : `预览服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`研究库预览：http://localhost:${port}/\nCult UI：http://localhost:${port}/projects/001-cult-ui/`));
