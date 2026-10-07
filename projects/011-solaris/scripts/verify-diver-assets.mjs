import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3 } from '../web/studio/vendor/three.module.js';

// Reads binary buffers and evaluates skinning independently of the renderer/Blender.
const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const base = path.join(project, 'web', 'underwater', 'assets', 'diver');
const archive = path.join(project, 'assets', 'diver-source-archives');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const results = [];
function check(name, fn) { fn(); results.push(name); }
function registered(file) {
  const root = file.path ? base : project;
  const absolute = path.resolve(root, file.path || file.repositoryPath);
  assert.ok(absolute.startsWith((file.path ? base : archive) + path.sep));
  return absolute;
}
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const readers = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
function parseGlb(absolute) {
  const bytes = fs.readFileSync(absolute);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= bytes.length);
    if (type === 0x4e4f534a) json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + size).toString('utf8'));
    if (type === 0x004e4942) binary = bytes.subarray(offset + 8, offset + 8 + size);
    offset += size + 8;
  }
  assert.equal(json.asset.version, '2.0'); assert.equal(json.buffers.length, 1); assert.ok(binary); assert.ok(!json.buffers[0].uri);
  assert.ok(json.buffers[0].byteLength <= binary.length);
  assert.equal(json.images?.length || 0, 0);
  const accessors = json.accessors.map(a => {
    assert.ok(!a.sparse);
    const view = json.bufferViews[a.bufferView], width = widths[a.type], size = sizes[a.componentType];
    assert.equal(view.buffer, 0); assert.ok(width && size);
    const stride = view.byteStride || width * size, start = (view.byteOffset || 0) + (a.byteOffset || 0);
    assert.ok(start + (a.count - 1) * stride + width * size <= binary.length);
    return Array.from({ length: a.count }, (_, row) => Array.from({ length: width }, (_, column) => {
      let value = binary[readers[a.componentType]](start + row * stride + column * size);
      assert.ok(Number.isFinite(value));
      if (a.normalized) {
        assert.ok([5121, 5123].includes(a.componentType));
        value /= a.componentType === 5121 ? 255 : 65535;
      }
      return value;
    }));
  });
  for (const n of json.nodes) for (const field of ['matrix', 'translation', 'rotation', 'scale']) if (n[field]) assert.ok(n[field].every(Number.isFinite));
  return { json, accessors };
}
function pose(asset, clip, time) {
  const { json, accessors } = asset;
  const nodes = json.nodes.map(n => {
    const o = new Object3D();o.position.fromArray(n.translation || [0,0,0]);o.quaternion.fromArray(n.rotation || [0,0,0,1]);o.scale.fromArray(n.scale || [1,1,1]);
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);
    return o;
  });
  json.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  if (clip) for (const channel of clip.channels) {
    const sampler=clip.samplers[channel.sampler],times=accessors[sampler.input].map(v=>v[0]),values=accessors[sampler.output];
    assert.equal(times.length,values.length);assert.ok(['LINEAR','STEP'].includes(sampler.interpolation||'LINEAR'));
    let index=0;while(index<times.length-1&&times[index+1]<=time)index++;
    let value=values[index];
    if(index<times.length-1&&(sampler.interpolation||'LINEAR')==='LINEAR'){
      const alpha=Math.max(0,Math.min(1,(time-times[index])/(times[index+1]-times[index])));
      value=channel.target.path==='rotation'?new Quaternion().fromArray(value).slerp(new Quaternion().fromArray(values[index+1]),alpha).toArray():value.map((n,j)=>n+(values[index+1][j]-n)*alpha);
    }
    const node=nodes[channel.target.node];
    if(channel.target.path==='translation')node.position.fromArray(value);
    else if(channel.target.path==='rotation')node.quaternion.fromArray(value);
    else if(channel.target.path==='scale')node.scale.fromArray(value);
    else throw Error('Unregistered channel path');
  }
  json.scenes[json.scene||0].nodes.forEach(i=>nodes[i].updateMatrixWorld(true));
  return nodes;
}
function vertices(asset,nodes){
  const {json,accessors}=asset,points=[];
  json.nodes.forEach((n,index)=>{
    if(!Number.isInteger(n.mesh))return;
    const skin=Number.isInteger(n.skin)?json.skins[n.skin]:null;
    const matrices=skin?.joints.map((joint,i)=>new Matrix4().multiplyMatrices(nodes[joint].matrixWorld,new Matrix4().fromArray(accessors[skin.inverseBindMatrices][i])));
    for(const p of json.meshes[n.mesh].primitives){
      const positions=accessors[p.attributes.POSITION],joints=skin&&accessors[p.attributes.JOINTS_0],weights=skin&&accessors[p.attributes.WEIGHTS_0];
      positions.forEach((value,i)=>{
        const point=new Vector3().fromArray(value);
        if(!skin){points.push(point.applyMatrix4(nodes[index].matrixWorld));return;}
        assert.ok(Math.abs(weights[i].reduce((a,b)=>a+b,0)-1)<3e-6);
        const result=new Vector3();
        for(let k=0;k<4;k++)if(weights[i][k]){assert.ok(matrices[joints[i][k]]);result.addScaledVector(point.clone().applyMatrix4(matrices[joints[i][k]]),weights[i][k]);}
        points.push(result);
      });
    }
  });
  return points;
}
function blendedPose(asset,a,b,time,weight){
  const nodes=pose(asset,a,time),other=pose(asset,b,time);
  nodes.forEach((n,i)=>{n.position.lerp(other[i].position,weight);n.quaternion.slerp(other[i].quaternion,weight);n.scale.lerp(other[i].scale,weight);});
  asset.json.scenes[asset.json.scene||0].nodes.forEach(i=>nodes[i].updateMatrixWorld(true));
  return nodes;
}
function bodyTriangles(asset){
  const source=asset.json.meshes.find(m=>m.name==='Mannequin');assert.ok(source);
  return source.primitives.flatMap(p=>{
    const positions=asset.accessors[p.attributes.POSITION],indices=asset.accessors[p.indices].map(v=>v[0]),triangles=[];
    for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(n=>positions[n]));
    return triangles;
  });
}
const triangleKey=t=>t.map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join(';');
const bodySourceFile=manifest.files.find(f=>f.role==='original-body-glb');
let source,diver,maxRadius=0,minY=Infinity,maxY=-Infinity,triangleReport;
check('primary author CC0 source and local authored additions are distinguished',()=>{
  assert.equal(manifest.source.author,'Quaternius');assert.equal(manifest.source.license,'CC0-1.0');
  assert.equal(manifest.source.pageUrl,'https://quaternius.com/packs/universalanimationlibrary.html');
  assert.equal(manifest.source.authorMirrorUrl,'https://opengameart.org/content/universal-animation-library');
  assert.ok(manifest.authoredAdditions.geometry&&manifest.authoredAdditions.animations);
  assert.ok(bodySourceFile);assert.ok(manifest.files.some(f=>f.role==='original-archive'));
});
check('registered original/model/recipe/license byte lengths and SHA-256 hashes match',()=>{
  for(const f of manifest.files){const b=fs.readFileSync(registered(f));assert.equal(b.length,f.byteLength,f.path||f.repositoryPath);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256,f.path||f.repositoryPath);}
});
check('original and runtime GLBs contain bounded finite embedded buffers only',()=>{
  source=parseGlb(registered(bodySourceFile));diver=parseGlb(path.join(base,'scuba-diver.glb'));
  assert.equal(diver.json.meshes.length,45);assert.equal(diver.json.skins.length,1);
});
check('all 13,743 unique original body triangles preserved; original one duplicate face deduplicated by Blender import',()=>{
  const a=bodyTriangles(source),b=bodyTriangles(diver),uniqueA=new Set(a.map(triangleKey)),uniqueB=new Set(b.map(triangleKey));
  assert.equal(a.length,13744);assert.equal(uniqueA.size,13743);assert.equal(b.length,13743);
  assert.equal(uniqueB.size,uniqueA.size);
  const imported=JSON.parse(fs.readFileSync(registered(manifest.files.find(f=>f.role==='source-topology-snapshot')),'utf8'));
  const originalPrimitives=source.json.meshes.find(m=>m.name==='Mannequin').primitives;
  let offset=0;const uniqueIndexFaces=new Set();const originalVertices=[];
  for(const p of originalPrimitives){
    const vertices=source.accessors[p.attributes.POSITION],indices=source.accessors[p.indices].map(n=>n[0]);originalVertices.push(...vertices);
    for(let i=0;i<indices.length;i+=3)uniqueIndexFaces.add(indices.slice(i,i+3).map(n=>n+offset).sort((a,b)=>a-b).join(','));
    offset+=vertices.length;
  }
  const importedFaces=new Set(imported.triangles.map(p=>p.toSorted((a,b)=>a-b).join(',')));
  assert.ok(importedFaces.size===uniqueIndexFaces.size&&[...uniqueIndexFaces].every(p=>importedFaces.has(p)),'Source unique face connectivity changed during import');
  assert.equal(imported.verticesGlTFYUp.length,originalVertices.length);
  originalVertices.forEach((v,i)=>v.forEach((n,k)=>assert.ok(Math.abs(n-imported.verticesGlTFYUp[i][k])<2e-6,'Source vertex changed on import')));
  // Exporter bakes the posed bind shape/armature scale into runtime positions.
  // Topology count and the archived unchanged Blender body mesh establish completeness;
  // posed packed geometry is evaluated independently below, not compared as rest coordinates.
  triangleReport={originalIndexedTriangles:a.length,originalUniqueTriangles:uniqueA.size,outputBodyTriangles:b.length,automaticDuplicateRemoval:1};
});
check('all 53 original bones retained including arms, hands/fingers, knees, ankles and toes',()=>{
  const names=s=>s.json.skins[0].joints.map(i=>s.json.nodes[i].name).sort();assert.deepEqual(names(diver),names(source));assert.equal(names(diver).length,53);
  for(const side of ['L','R'])for(const part of ['upper_arm','forearm','hand','thigh','shin','foot','toe'])assert.ok(names(diver).includes(`DEF-${part}.${side}`));
});
check('complete named scuba components included and attached to the full original rig',()=>{
  const meshes=diver.json.nodes.filter(n=>Number.isInteger(n.mesh));
  const expected=['Mannequin','Single compressed air tank','Tank brass neck','First stage regulator','Second stage breathing regulator','Flexible breathing hose','Low pressure inflator hose','Mask anatomical nose pocket','Mask blue glass L','Mask blue glass R','Mask adjustable head strap','Complete tapered fin blade L','Complete tapered fin blade R','Waist stainless buckle','Buoyancy vest backplate','Wrist gauge face'];
  for(const name of expected)assert.ok(meshes.some(n=>n.name===name),name);
  for(const n of meshes)assert.equal(n.skin,0,n.name);
  assert.equal(meshes.length,45);
});
check('both 1.6-second clips embedded with stationary root and seamless key endpoints',()=>{
  assert.deepEqual(diver.json.animations.map(a=>a.name).sort(),['Diver_Hover','Diver_Swim']);
  const root=diver.json.nodes.findIndex(n=>n.name==='root');
  for(const clip of diver.json.animations){
    assert.equal(clip.channels.length,159);
    assert.ok(Math.abs(Math.max(...clip.samplers.map(s=>diver.accessors[s.input].at(-1)[0]))-1.6)<1e-6);
    for(const c of clip.channels){const values=diver.accessors[clip.samplers[c.sampler].output];for(let k=0;k<values[0].length;k++)assert.ok(Math.abs(values[0][k]-values.at(-1)[k])<1e-5);}
    for(const pathName of ['translation','rotation','scale']){
      const c=clip.channels.find(c=>c.target.node===root&&c.target.path===pathName);assert.ok(c);
      const values=diver.accessors[clip.samplers[c.sampler].output];for(const value of values)assert.deepEqual(value,values[0]);
      if(pathName==='translation')assert.ok(values[0].every(v=>Math.abs(v)<1e-8));
    }
  }
});
check('hover is fully stationary; swim visibly changes both full knee/ankle leg chains',()=>{
  for(const clip of diver.json.animations){
    const changing=[];
    for(const c of clip.channels){const v=diver.accessors[clip.samplers[c.sampler].output];if(v.some(a=>a.some((n,i)=>Math.abs(n-v[0][i])>1e-5)))changing.push(diver.json.nodes[c.target.node].name);}
    if(clip.name==='Diver_Hover')assert.deepEqual(changing,[]);
    else assert.deepEqual(changing.sort(),['DEF-thigh.L','DEF-shin.L','DEF-foot.L','DEF-thigh.R','DEF-shin.R','DEF-foot.R'].sort());
  }
});
check('file default transforms exactly match horizontal hover before mixer playback',()=>{
  const hover=diver.json.animations.find(a=>a.name==='Diver_Hover');
  for(const c of hover.channels){const value=diver.accessors[hover.samplers[c.sampler].output][0];const node=diver.json.nodes[c.target.node];assert.deepEqual(node[c.target.path],value);}
});
check('complete packed body/equipment sampled at 201 times for five hover/swim blend weights stays within .40 radius',()=>{
  const hover=diver.json.animations.find(a=>a.name==='Diver_Hover'),swim=diver.json.animations.find(a=>a.name==='Diver_Swim');
  for(const weight of [0,.25,.5,.75,1])for(let i=0;i<=200;i++){
    const points=vertices(diver,blendedPose(diver,hover,swim,1.6*i/200,weight));
    for(const p of points){const radius=Math.hypot(p.x,p.z);maxRadius=Math.max(maxRadius,radius);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);assert.ok(radius<.40,`Complete model exceeds .40 at blend ${weight} sample ${i}`);}
  }
  assert.ok(maxRadius>.375&&maxRadius<.385);assert.ok(minY>-.105&&maxY<.105);
});
check('head end points along +X and knees/feet remain behind the full torso',()=>{
  const nodes=pose(diver,diver.json.animations.find(a=>a.name==='Diver_Hover'),0),get=name=>nodes[diver.json.nodes.findIndex(n=>n.name===name)].getWorldPosition(new Vector3());
  const head=get('DEF-head'),hip=get('DEF-hips');assert.ok(head.x>hip.x+.18);
  for(const side of ['L','R']){const knee=get(`DEF-shin.${side}`),ankle=get(`DEF-foot.${side}`);assert.ok(hip.x>knee.x&&knee.x>ankle.x);}
});
check('finite PBR surfaces include rubber, metal, safety markings and translucent twin lenses',()=>{
  const materials=diver.json.materials;assert.equal(materials.length,7);
  const glass=materials.find(m=>m.name==='Mask mineral blue glass');assert.equal(glass.alphaMode,'BLEND');assert.ok(glass.pbrMetallicRoughness.baseColorFactor[3]>.5&&glass.pbrMetallicRoughness.baseColorFactor[3]<.6);
  for(const m of materials){const p=m.pbrMetallicRoughness;assert.ok(p.baseColorFactor.every(Number.isFinite));assert.ok(p.roughnessFactor>=0&&p.roughnessFactor<=1);assert.ok(p.metallicFactor>=0&&p.metallicFactor<=1);}
});
console.log(JSON.stringify({status:'passed',checks:results.length,completed:results,posedSampleTimes:201,blendWeights:[0,.25,.5,.75,1],totalPosedSamples:1005,maximumPackedHorizontalRadius:maxRadius,registeredSafetyRadius:.40,verticalExtents:[minY,maxY],bodyTriangleReport:triangleReport,limitations:['Finite sampled model geometry only, not a continuous-time mathematical bound.','Source is a complete stylized mannequin; scuba equipment and two finite kick/trim clips are locally authored.','No hydraulic, pressure, biological motion, brand equipment or browser interaction/performance verification claims.']},null,2));
