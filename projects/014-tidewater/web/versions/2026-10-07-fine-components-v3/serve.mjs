import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.jpg':'image/jpeg','.hdr':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const decoded=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),relative=decoded==='/'?'index.html':decoded.slice(1);
  if(relative.split('/').some(part=>part==='..'||part==='.')||relative.includes('\\')||relative.includes('\0')){res.writeHead(400);res.end();return;}
  const file=path.resolve(root,relative);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
}catch{res.writeHead(404);res.end('File not found');}});
const port=Number(process.env.PORT||4200);server.listen(port,'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+port+'/'));
