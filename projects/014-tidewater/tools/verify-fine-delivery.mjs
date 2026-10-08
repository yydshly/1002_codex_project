import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// No renderer, browser or model service: reopen the real ZIP and decode the
// GLB accessor bytes independently of the exporter's manifest claims.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, ...flags] = process.argv.slice(2);
assert.match(id || '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u, 'Expected a delivery UUID');
const option = (name, fallback) => { const index=flags.indexOf(name);return index<0?fallback:flags[index+1]; };
const output = path.resolve(project, option('--output', `checks/fine-delivery-${id.slice(0,8)}-disk-results.json`));
const extraction = path.resolve(project, option('--extract', `.runtime/fine-project-verify-${id.slice(0,8)}`));
assert.ok(output.startsWith(`${path.join(project,'checks')}${path.sep}`), 'Check output must remain in project checks');
const source = path.join(project,'web','assets','fine-deliveries',id);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalBytes = value => `${JSON.stringify(value,null,2)}\n`;
const jsonFile = async file => JSON.parse(await fs.readFile(file,'utf8'));
const result = { format:'tidewater-fine-delivery-disk-checks.v1', deliveryId:id, checkedAt:new Date().toISOString(),
  passed:false, source, extraction, verification:'actual-disk-archive / no-browser / no-model-service', visualQuality:'needs-review' };

function decodeGLB(bytes, requiredIds, lockedIds, expected) {
  assert.ok(bytes.length>=28);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),bytes.length);
  let offset=12,json,bin;
  while(offset<bytes.length){assert.ok(offset+8<=bytes.length);const size=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);assert.equal(size%4,0);assert.ok(offset+8+size<=bytes.length);
    if(kind===0x4e4f534a){assert.equal(offset,12);assert.ok(!json);json=JSON.parse(bytes.subarray(offset+8,offset+8+size).toString('utf8'));}
    else if(kind===0x004e4942){assert.ok(json&&!bin);bin=bytes.subarray(offset+8,offset+8+size);}else assert.fail('Unknown GLB chunk');offset+=8+size;}
  assert.equal(json.asset.version,'2.0');assert.ok(bin);assert.equal(json.buffers.length,1);assert.ok(!json.buffers[0].uri);assert.ok(json.buffers[0].byteLength<=bin.length);
  const binary=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),types={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},cache=new Map();
  for(const bufferView of json.bufferViews??[]){assert.equal(bufferView.buffer,0);assert.ok(Number.isSafeInteger(bufferView.byteLength)&&bufferView.byteLength>0);assert.ok((bufferView.byteOffset??0)>=0);assert.ok((bufferView.byteOffset??0)+bufferView.byteLength<=json.buffers[0].byteLength);}
  function accessor(index){
    assert.ok(Number.isInteger(index)&&index>=0&&index<json.accessors.length);if(cache.has(index))return cache.get(index);const item=json.accessors[index];assert.ok(!item.sparse,'Sparse accessors not emitted by this exporter');
    const bufferView=json.bufferViews[item.bufferView],format=types[item.componentType],components=sizes[item.type];assert.ok(bufferView&&format&&components);assert.ok(Number.isSafeInteger(item.count)&&item.count>0);
    const [getter,width]=format,stride=bufferView.byteStride??components*width,start=(bufferView.byteOffset??0)+(item.byteOffset??0);assert.ok(stride>=components*width);assert.ok((item.byteOffset??0)>=0);assert.ok((item.byteOffset??0)+(item.count-1)*stride+components*width<=bufferView.byteLength);
    assert.ok(!item.type.startsWith('MAT')||width===4,'Narrow matrix alignment unsupported');let minimum=Infinity,maximum=-Infinity;
    for(let element=0;element<item.count;element++)for(let component=0;component<components;component++){const value=binary[getter](start+element*stride+component*width,true);assert.ok(Number.isFinite(value),`Non-finite accessor ${index}`);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
    for(const bounds of [item.min,item.max])if(bounds)assert.ok(bounds.length===components&&bounds.every(Number.isFinite));
    const decoded={count:item.count,type:item.type,componentType:item.componentType,normalized:item.normalized??false,minimum,maximum};cache.set(index,decoded);return decoded;
  }
  const meshStats=json.meshes.map(mesh=>{
    assert.ok(mesh.primitives?.length);let triangles=0,vertices=0;
    for(const primitive of mesh.primitives){assert.equal(primitive.mode??4,4);const positions=accessor(primitive.attributes.POSITION);assert.equal(positions.type,'VEC3');vertices+=positions.count;
      for(const index of Object.values(primitive.attributes))assert.equal(accessor(index).count,positions.count);
      const indices=primitive.indices===undefined?null:accessor(primitive.indices);if(indices){assert.equal(indices.type,'SCALAR');assert.ok([5121,5123,5125].includes(indices.componentType));assert.equal(indices.normalized,false);assert.ok(indices.minimum>=0&&indices.maximum<positions.count);}
      const count=indices?.count??positions.count;assert.equal(count%3,0);triangles+=count/3;assert.ok(Number.isInteger(primitive.material)&&json.materials[primitive.material]);
    }return {triangles,vertices,primitives:mesh.primitives.length};
  });
  for(const material of json.materials){const values=[...(material.pbrMetallicRoughness?.baseColorFactor??[]),material.pbrMetallicRoughness?.metallicFactor,material.pbrMetallicRoughness?.roughnessFactor,...(material.emissiveFactor??[])].filter(value=>value!==undefined);assert.ok(values.every(Number.isFinite));}
  for(const image of json.images??[]){assert.ok(!image.uri,'GLB image must be embedded in BIN');assert.ok(json.bufferViews[image.bufferView]&&['image/png','image/jpeg','image/webp'].includes(image.mimeType));}
  const visited=new Set(),active=new Set(),sourceIds=new Set();let triangles=0,vertices=0,meshNodes=0,primitiveInstances=0;
  function visit(index){assert.ok(Number.isInteger(index)&&json.nodes[index]);assert.ok(!active.has(index),'Cyclic GLB nodes');assert.ok(!visited.has(index),'GLB node has multiple parents');active.add(index);visited.add(index);const node=json.nodes[index];
    for(const transform of [node.matrix,node.translation,node.rotation,node.scale])if(transform)assert.ok(Array.isArray(transform)&&transform.every(Number.isFinite));
    for(const marker of [node.extras?.sourceId,node.extras?.sourceEntityId])if(marker)sourceIds.add(marker);
    if(node.mesh!==undefined){assert.ok(meshStats[node.mesh]);const stats=meshStats[node.mesh];meshNodes++;triangles+=stats.triangles;vertices+=stats.vertices;primitiveInstances+=stats.primitives;}
    for(const child of node.children??[])visit(child);active.delete(index);
  }
  assert.ok(json.scenes[json.scene??0]?.nodes);for(const root of json.scenes[json.scene??0].nodes)visit(root);
  for(const entityId of requiredIds)assert.ok(sourceIds.has(entityId),`Missing authored source ID ${entityId}`);
  for(const entityId of lockedIds)assert.ok(sourceIds.has(entityId),`Missing locked source ID ${entityId}`);
  assert.equal(triangles,expected.triangles,'Disk GLB triangles differ from independent browser reload record');
  return {passed:true,method:'independent-GLB-JSON/BIN-accessor-decoder',bytes:bytes.length,sha256:sha256(bytes),nodes:visited.size,
    meshNodes,primitiveInstances,vertices,triangles,uniqueMeshes:json.meshes.length,accessorsChecked:cache.size,sourceIds:[...sourceIds],
    authoredSourceCount:requiredIds.length,lockedIdsPreserved:lockedIds,finiteAttributes:true,validIndexBounds:true,embeddedImages:true,triangleCountMatchesRecordedReload:true};
}

try {
  const python=process.env.TIDEWATER_TEST_PYTHON||'C:/Users/yun68/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const zipCheck=spawnSync(python,[path.join(project,'tools','verify-fine-delivery.py'),source,extraction,project],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
  assert.equal(zipCheck.status,0,zipCheck.stderr||zipCheck.error?.message);result.zip=JSON.parse(zipCheck.stdout);
  const manifest=await jsonFile(path.join(extraction,'delivery-manifest.json')),scene=await jsonFile(path.join(extraction,'scene.json'));
  const archived=await jsonFile(path.join(source,'scene.export.json'));
  const {validatePlan}=await import(pathToFileURL(path.join(extraction,'creation-core.js')));
  const {fingerprintPlan}=await import(pathToFileURL(path.join(extraction,'model-scene-core.js')));
  const {validateCompletionRecipe}=await import(pathToFileURL(path.join(extraction,'scene-completion-core.js')));
  const {validateFineGeometry}=await import(pathToFileURL(path.join(extraction,'fine-geometry-core.js')));
  const {assertFineRefinementPreserved}=await import(pathToFileURL(path.join(extraction,'fine-refinement-core.js')));
  const plan=validatePlan(scene.sourcePlan),recipe=validateCompletionRecipe(scene.recipe,plan),geometry=validateFineGeometry(scene.geometry,plan,{baseRecipe:recipe}),fingerprint=fingerprintPlan(plan);
  assert.equal(manifest.sourceFingerprint,fingerprint);assert.deepEqual(archived.scene.sourcePlan,plan);assert.deepEqual(archived.scene.recipe,recipe);assert.deepEqual(archived.scene.geometry,geometry);assert.deepEqual(archived.scene.delivery.manifest,manifest);
  const files=new Set(manifest.files.map(file=>file.path));
  function localDependency(from,specifier){
    assert.ok(!/^[a-z]+:/iu.test(specifier),'External runtime dependency');
    const resolved=specifier==='three'?'realistic/vendor/three.module.js':specifier.startsWith('three/addons/')?`realistic/vendor/addons/${specifier.slice(13)}`:specifier.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier)):null;
    assert.ok(resolved&&files.has(resolved),`Missing runtime dependency ${from} -> ${specifier}`);return resolved;
  }
  let importsChecked=0,modelResourcesChecked=0;
  for(const file of files){
    if(file.endsWith('.js')){const code=(await fs.readFile(path.join(extraction,file),'utf8')).replace(/\/\*[\s\S]*?\*\//gu,'').replace(/^\s*\/\/.*$/gmu,'');
      for(const match of code.matchAll(/^\s*import(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gmu)){localDependency(file,match[1]);importsChecked++;}}
    if(file.endsWith('.gltf')){const gltf=await jsonFile(path.join(extraction,file));for(const resource of [...gltf.buffers??[],...gltf.images??[]])if(resource.uri&&!resource.uri.startsWith('data:')){localDependency(file,`./${resource.uri}`);modelResourcesChecked++;}}
  }
  result.runtime={passed:true,localStaticImportsChecked:importsChecked,localGLTFResourcesChecked:modelResourcesChecked,packagedCoreModulesExecutableInNode:true,modelServiceStarted:false,browserStarted:false};
  const inputChecks=[];
  async function verifyInputs(kind,views,receipt){
    assert.ok(receipt&&receipt.status==='succeeded');assert.equal(receipt.sourceFingerprint,fingerprint);assert.equal(receipt.planSha256,sha256(canonicalBytes(plan)));assert.ok(Array.isArray(views)&&views.length===receipt.images.length);
    for(const [index,view]of views.entries()){const expected=receipt.images[index],bytes=await fs.readFile(path.join(extraction,view.path));assert.ok(files.has(view.path));assert.equal(view.label,expected.label);assert.equal(bytes.length,expected.bytes);assert.equal(sha256(bytes),expected.sha256);}
    const check={kind,taskId:receipt.id,views:views.length,sourceFingerprint:fingerprint,imageBytesAndSHA256:true};inputChecks.push(check);return check;
  }
  await verifyInputs('recipe',scene.inputViews,scene.receipt);assert.equal(scene.receipt.recipeSha256,sha256(canonicalBytes(recipe)));
  const versions=[];
  for(const [index,iteration]of scene.geometryIterations.entries()){
    const valid=validateFineGeometry(iteration.geometry,plan,{baseRecipe:recipe});await verifyInputs(`geometry-history-${index+1}`,iteration.views,iteration.receipt);
    assert.equal(iteration.receipt.baseRecipeSha256,sha256(canonicalBytes(recipe)));assert.equal(iteration.receipt.geometrySha256,sha256(canonicalBytes(valid)));assert.deepEqual(archived.scene.geometryIterations[index].geometry,valid);
    if(iteration.fineEdit){assert.ok(index>0);const checked=assertFineRefinementPreserved(versions[index-1],valid,plan,iteration.fineEdit.scopeIds,{baseRecipe:recipe});assert.deepEqual(checked,iteration.fineEdit);assert.deepEqual(iteration.receipt.scopeIds,checked.scopeIds);assert.equal(iteration.receipt.previousGeometrySha256,sha256(canonicalBytes(versions[index-1])));}
    versions.push(valid);
  }
  await verifyInputs('geometry-final',scene.geometryViews,scene.geometryReceipt);assert.equal(scene.geometryReceipt.baseRecipeSha256,sha256(canonicalBytes(recipe)));assert.equal(scene.geometryReceipt.geometrySha256,sha256(canonicalBytes(geometry)));
  result.provenance={passed:true,sourceFingerprint:fingerprint,recipeJob:scene.receipt.id,finalGeometryJob:scene.geometryReceipt.id,completeGeometryVersions:versions.length+1,inputs:inputChecks,allImageSHA256:true,allGeometrySHA256:true};
  if(scene.fineEdit){assert.ok(versions.length);const checked=assertFineRefinementPreserved(versions.at(-1),geometry,plan,scene.fineEdit.scopeIds,{baseRecipe:recipe});assert.deepEqual(checked,scene.fineEdit);assert.deepEqual(scene.geometryReceipt.scopeIds,checked.scopeIds);assert.equal(scene.geometryReceipt.previousGeometrySha256,sha256(canonicalBytes(versions.at(-1))));result.fineEdit={passed:true,...checked};}
  else result.fineEdit={applicable:false};
  result.glb=decodeGLB(await fs.readFile(path.join(extraction,'scene.glb')),plan.entities.map(entity=>entity.id),plan.entities.filter(entity=>entity.locked).map(entity=>entity.id),manifest.checks.reopened);
  assert.equal(result.glb.sha256,result.zip.glbSHA256);result.geometry={instances:geometry.instances.length,templates:geometry.templates.length,expandedParts:geometry.instances.reduce((n,instance)=>n+geometry.templates.find(template=>template.id===instance.templateId).parts.reduce((n,part)=>n+part.repeat.count,0),0)};
  result.passed=true;
} catch(error) {result.error={message:error.message,stack:error.stack};process.exitCode=1;}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,canonicalBytes(result));
console.log(JSON.stringify({passed:result.passed,deliveryId:id,output,extraction,glb:result.glb,geometry:result.geometry,fineEdit:result.fineEdit,error:result.error?.message},null,2));
