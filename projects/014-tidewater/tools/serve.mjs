import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = await realpath(fileURLToPath(new URL('../web/', import.meta.url)));
const port = Number(process.env.TIDEWATER_PORT || 4196);
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.bin':'application/octet-stream','.glb':'model/gltf-binary','.ogg':'audio/ogg','.md':'text/plain; charset=utf-8' };
const within = p => { const r = path.relative(root,p); return r === '' || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`)); };
const server = http.createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url,'http://localhost');
    let p = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!within(p)) { res.writeHead(403); res.end(); return; }
    let info = await stat(p);
    if (info.isDirectory()) { p = path.join(p,'index.html'); info = await stat(p); }
    p = await realpath(p);
    if (!within(p) || !info.isFile()) { res.writeHead(403); res.end(); return; }
    res.writeHead(200,{'Content-Type':mime[path.extname(p)] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') res.end(); else createReadStream(p).pipe(res);
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 400); res.end('Not found'); }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(port,'127.0.0.1',() => console.log(`Tidewater 工作台 http://127.0.0.1:${port}/`));
