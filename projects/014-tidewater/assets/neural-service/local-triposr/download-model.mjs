import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';

const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const target=path.join(root,'model-cache','TripoSR');
await fs.mkdir(target,{recursive:true});
const meta=await (await fetch('https://huggingface.co/api/models/stabilityai/TripoSR',{signal:AbortSignal.timeout(30000)})).json();
if(!meta.sha)throw Error('Official model revision unavailable');
const receipt={provider:'Local inference',model:'stabilityai/TripoSR',revision:meta.sha,license:'MIT',startedAt:new Date().toISOString(),source:'https://huggingface.co/stabilityai/TripoSR',files:[]};
for(const filename of ['config.yaml','model.ckpt']){
  const url=`https://huggingface.co/stabilityai/TripoSR/resolve/${meta.sha}/${filename}`;
  const res=await fetch(url,{signal:AbortSignal.timeout(900000)});
  if(!res.ok)throw Error(`${filename}: HTTP ${res.status}`);
  const destination=path.join(target,filename); let bytes=0,last=0;const hash=createHash('sha256');
  const stream=Readable.fromWeb(res.body);stream.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);if(Date.now()-last>15000){console.log(JSON.stringify({filename,bytes,total:Number(res.headers.get('content-length'))||null}));last=Date.now();}});
  await pipeline(stream,createWriteStream(destination));
  receipt.files.push({filename,url,bytes,sha256:hash.digest('hex')});
  await fs.writeFile(path.join(root,'model-download.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({filename,complete:true,bytes}));
}
const tokenizerDir=path.join(root,'model-cache','dino-vitb16');await fs.mkdir(tokenizerDir,{recursive:true});
const tokenizerURL='https://huggingface.co/facebook/dino-vitb16/resolve/main/config.json';
const tokenizer=await fetch(tokenizerURL,{signal:AbortSignal.timeout(30000)});if(!tokenizer.ok)throw Error('DINO tokenizer config unavailable');
const configText=await tokenizer.text();await fs.writeFile(path.join(tokenizerDir,'config.json'),configText);
receipt.tokenizerConfig={source:tokenizerURL,sha256:createHash('sha256').update(configText).digest('hex'),note:'Only architecture configuration. Full tokenizer weights are included in official TripoSR checkpoint.'};
receipt.completedAt=new Date().toISOString();await fs.writeFile(path.join(root,'model-download.json'),JSON.stringify(receipt,null,2));
