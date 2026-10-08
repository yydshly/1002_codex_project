import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';

// Standard resumable public-file HTTP ranges. No credentials, inference quota,
// session spoofing, proxies, or service access-control changes are involved.
const [url,destination,totalText,expectedHash]=process.argv.slice(2);
const total=Number(totalText);if(!/^https:\/\//.test(url||'')||!destination||!Number.isSafeInteger(total)||total<=0)throw Error('URL, destination and size are required');
const partSize=8*1024*1024, count=Math.ceil(total/partSize),receiptPath=destination+'.download.json';
let receipt;
try{receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));if(receipt.url!==url||receipt.bytes!==total||receipt.partSize!==partSize)throw Error('Resume source changed');}
catch(e){if(e.code!=='ENOENT')throw e;receipt={url,bytes:total,partSize,startedAt:new Date().toISOString(),completedParts:[]};}
const complete=new Set(receipt.completedParts);const output=await fs.open(destination,complete.size?'r+':'w+');
let saved=Promise.resolve(),next=0,lastLog=0;
async function save(){receipt.completedParts=[...complete].sort((a,b)=>a-b);const text=JSON.stringify(receipt,null,2);saved=saved.then(()=>fs.writeFile(receiptPath,text));await saved;}
async function worker(){while(true){let part;while(next<count&&complete.has(next))next++;if(next>=count)return;part=next++;
 const start=part*partSize,end=Math.min(total-1,start+partSize-1),length=end-start+1;let bytes;
 for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(180000)});if(r.status!==206||r.headers.get('content-range')!==`bytes ${start}-${end}/${total}`){await r.body?.cancel();throw Error(`Range response mismatch: HTTP ${r.status} ${r.headers.get('content-range')}`);}bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==length)throw Error('Incomplete range');break;}catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}}
 let written=0;while(written<bytes.length){const r=await output.write(bytes,written,bytes.length-written,start+written);written+=r.bytesWritten;}
 complete.add(part);await save();if(Date.now()-lastLog>15000){lastLog=Date.now();console.log(JSON.stringify({complete:complete.size,totalParts:count,downloadedBytes:[...complete].reduce((s,p)=>s+Math.min(partSize,total-p*partSize),0)}));}
}}
try{await Promise.all(Array.from({length:8},worker));await output.close();const hash=createHash('sha256');for await(const chunk of createReadStream(destination))hash.update(chunk);receipt.sha256=hash.digest('hex');if(expectedHash&&receipt.sha256!==expectedHash)throw Error('Official SHA256 integrity check failed');receipt.completedAt=new Date().toISOString();receipt.integrityVerified=Boolean(expectedHash);await save();console.log(JSON.stringify({complete:true,bytes:total,sha256:receipt.sha256,integrityVerified:receipt.integrityVerified}));}
catch(error){receipt.failure={at:new Date().toISOString(),message:error.message};await save();await output.close().catch(()=>{});throw error;}
