import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCampProposal} from '../web/camp-core.js';
import {fingerprintPlan} from '../web/model-scene-core.js';

const projectRoot=fileURLToPath(new URL('../',import.meta.url)),web=path.join(projectRoot,'web'),output=path.join(projectRoot,'publish');
const original='560be513-9fa1-4ee5-b4dc-22c01e3aae8b',example='6bd01104-dfb6-4f9a-9b61-1f1172586ec0';
const history=[
  ['2026-10-05-realistic-material-v1','物理材质与扫描资源','realistic-workbench.png'],
  ['2026-10-05-neural-cabin-v1','真实模型小屋','neural-cabin-front.png'],
  ['2026-10-05-scene-assembly-v1','同场景组装与一致性探索','scene-completion-workbench-v1.png']
];
const source=validateCampProposal(JSON.parse(await fs.readFile(path.join(web,'assets/camp/original.json'),'utf8')));
const published=validateCampProposal(JSON.parse(await fs.readFile(path.join(web,'assets/camp-proposals',original,'proposal.json'),'utf8')));
assert.equal(fingerprintPlan(source.sourcePlan),'plan-v1-162afc9e3f46f3aa-22227');
assert.deepEqual(source.sourcePlan,published.sourcePlan);
assert.deepEqual(source.variants[0].candidate.geometry,published.variants[0].candidate.geometry);
assert.equal(source.objects.length,25);
assert.equal(source.variants[0].candidate.geometry.instances.length,17);
for(const id of [original,example]){const folder=path.join(web,'assets/camp-proposals',id),manifest=JSON.parse(await fs.readFile(path.join(folder,'delivery-manifest.json'),'utf8'));
  for(const file of manifest.files){assert.ok(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..'));const bytes=await fs.readFile(path.join(folder,file.path));assert.equal(bytes.length,file.bytes,`Saved project byte size: ${id}/${file.path}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`Saved project SHA-256: ${id}/${file.path}`);}
}

// Only this generated directory is replaced. Original archives remain intact.
assert.equal(path.dirname(output),path.resolve(projectRoot));
try{const stat=await fs.lstat(output);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(await fs.realpath(output),output);await fs.rm(output,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(output,{recursive:true});
function include(file){const relative=path.relative(web,file).split(path.sep).join('/');
  if(relative==='assets/fine-deliveries'||relative.startsWith('assets/fine-deliveries/'))return false;
  if(history.some(([id])=>relative===`versions/${id}`||relative.startsWith(`versions/${id}/`)))return false;
  const match=relative.match(/^assets\/camp-proposals\/([^/]+)/u);
  return !match||[original,example].includes(match[1]);
}
await fs.cp(web,output,{recursive:true,filter:include});
await fs.copyFile(path.join(projectRoot,'THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
for(const [id,title,image] of history){const folder=path.join(output,'versions',id);await fs.mkdir(folder,{recursive:true});
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 历史回顾</title><link rel="stylesheet" href="../../camp.css"></head><body><main><p class="eyebrow">已保存的探索阶段 / 2026.10.05</p><h1>${title}</h1><p>完整历史源码和输入继续保留在本地存档。公开版提供阶段截图与当前原场景回放，减少重复资源。</p><img class="archive-preview" src="../../assets/${image}" alt="${title}阶段的实际浏览器截图"><p><a href="../../release.html">当前成果与探索说明 ↗</a> · <a href="../../camp-viewer.html?proposal=${original}">浏览原海岛精修结果 ↗</a> · <a href="../2026-10-07-fine-components-v5/index.html">v5 独立存档 ↗</a></p></main></body></html>`;
  await fs.writeFile(path.join(folder,'snapshot.html'),html);await fs.writeFile(path.join(folder,'index.html'),html);
  try{await fs.copyFile(path.join(web,'versions',id,'snapshot-manifest.json'),path.join(folder,'snapshot-manifest.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
const files=[];
async function inventory(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const file=path.join(dir,entry.name);if(entry.isDirectory())await inventory(file);else{assert.ok(entry.isFile());const bytes=await fs.readFile(file);files.push({path:path.relative(output,file).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await inventory(output);files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={format:'tidewater-publication.v1',release:'2026-10-08',entry:'release.html',originalProposal:original,exampleProposal:example,sourceFingerprint:fingerprintPlan(source.sourcePlan),geometryJob:source.variants[0].candidate.geometryReceipt.id,sourceObjects:25,fineObjects:17,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),modelGeneration:'local-service-only',files};
assert.ok(manifest.totalBytes<700*1048576,'Project publication exceeds its size budget');
await fs.writeFile(path.join(output,'publication-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,files:files.length,MiB:+(manifest.totalBytes/1048576).toFixed(1),sourceFingerprint:manifest.sourceFingerprint}));
