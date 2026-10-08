import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { validateCompletionRecipe } from '../web/scene-completion-core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ids={full:'96f55ca7-f641-404f-9c1e-15828eb92cc5',rejected:'6bd2da35-6d9e-4897-8b00-92414f5ad714',local:'ea5f69c9-dc90-4e93-9b4b-7df76581e0b4'};
const original=await read('assets/world-generation-source-plan.json');
const checks=[];
for(const [mode,id] of Object.entries(ids)){
  const dir=`assets/control-model/jobs/${id}`,receipt=await read(`${dir}/receipt.json`),source=await read(`${dir}/source-plan.json`);
  assert.deepEqual(source,original);assert.equal(receipt.sourceFingerprint,fingerprintPlan(original));
  assert.equal(receipt.planSha256,digest(await readFile(path.join(root,dir,'source-plan.json'))));
  for(const view of receipt.images){const bytes=await readFile(path.join(root,dir,view.file));assert.equal(view.sha256,digest(bytes));assert.equal(view.bytes,bytes.length);}
  assert.equal(receipt.images.length,mode==='local'?4:3);
  assert.equal(receipt.provider,'Codex CLI / ChatGPT');assert.equal(receipt.sandbox,'read-only');assert.ok(receipt.threadId);
  assert.equal(receipt.status,mode==='rejected'?'failed':'succeeded');
  if(mode!=='rejected'){
    const recipe=await read(`${dir}/recipe.json`);validateCompletionRecipe(recipe,source);
    assert.equal(receipt.recipeSha256,digest(await readFile(path.join(root,dir,'recipe.json'))));
  }
  checks.push({check:`${mode}: exact original plan, actual image hashes and model receipt`,passed:true,id,images:receipt.images.length,status:receipt.status});
}
const full=await read(`assets/control-model/jobs/${ids.full}/recipe.json`),local=await read(`assets/control-model/jobs/${ids.local}/recipe.json`);
validateCompletionRecipe(local,original,{previousRecipe:full,scopeIds:['lighthouse-6a3ef8b5']});
assert.deepEqual(local.environment,full.environment);
const changed=local.objects.filter((look,i)=>JSON.stringify(look)!==JSON.stringify(full.objects[i])).map(look=>look.id);
assert.deepEqual(changed,['lighthouse-6a3ef8b5']);
checks.push({check:'Only lighthouse appearance record changed; other 24 and global environment identical',passed:true,changedIds:changed});
const exported=await read('assets/scene-completion-final.export.json');
assert.equal(exported.format,'tidewater-completion-export.v1');assert.deepEqual(exported.scene.sourcePlan,original);
assert.deepEqual(exported.scene.recipe,local);assert.equal(exported.scene.receipt.id,ids.local);assert.ok(exported.scene.savedAt);
assert.equal(exported.scene.views.length,4);assert.equal(exported.scene.execution.generatedNewMeshesByNeuralModel,false);
checks.push({check:'Public page export contains actual saved candidate, source, views and execution provenance',passed:true});
const result={format:'tidewater-completion-evidence-check.v1',checkedAt:new Date().toISOString(),sourceFingerprint:fingerprintPlan(original),entityCount:original.entities.length,checks,limits:['File checks verify provenance and data consistency, not image quality.','Browser observations are recorded separately.','This run had no original uploaded reference image.']};
await writeFile(path.join(root,'checks/scene-completion-evidence-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(`${checks.length}/${checks.length} scene completion evidence checks passed.`);
