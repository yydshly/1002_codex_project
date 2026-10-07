import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3, Ray, Box3 } from '../web/studio/vendor/three.module.js';

// Reads binary buffers and evaluates skinning independently of the renderer/Blender.
const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const base = path.join(project, 'web', 'fitting', 'footwear');
const frozenBase = path.join(project, 'web', 'fitting', 'assets');
const archive = path.join(project, 'assets');
const geometryOnly=process.argv.includes('--geometry-only');
const manifest=geometryOnly?null:JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const results = [];
function check(name, fn) { fn(); results.push(name); }
function registered(file) {
  const root = file.path ? base : project;
  const absolute = path.resolve(root, file.path || file.repositoryPath);
  assert.ok(absolute.startsWith((file.path ? base : archive) + path.sep)||(!file.path&&absolute.startsWith(frozenBase+path.sep)));
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

function nodeGeometry(asset,nodes,nodeIndex){
 const {json,accessors}=asset,n=json.nodes[nodeIndex],skin=json.skins[n.skin];
 const mats=skin.joints.map((j,i)=>new Matrix4().multiplyMatrices(nodes[j].matrixWorld,new Matrix4().fromArray(accessors[skin.inverseBindMatrices][i])));
 const result=[];
 for(const p of json.meshes[n.mesh].primitives){
  const positions=accessors[p.attributes.POSITION],joints=accessors[p.attributes.JOINTS_0],weights=accessors[p.attributes.WEIGHTS_0];
  const points=positions.map((v,i)=>{const pt=new Vector3().fromArray(v),out=new Vector3();for(let k=0;k<4;k++)if(weights[i][k])out.addScaledVector(pt.clone().applyMatrix4(mats[joints[i][k]]),weights[i][k]);return out;});
  result.push({positions,points,indices:accessors[p.indices].map(v=>v[0])});
 }
 return result;
}
function bvh(triangles){
 const box=new Box3();for(const t of triangles)for(const p of t)box.expandByPoint(p);
 if(triangles.length<=18)return {box,triangles};
 const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
 triangles.sort((a,b)=>(a[0][axis]+a[1][axis]+a[2][axis])-(b[0][axis]+b[1][axis]+b[2][axis]));
 const middle=Math.floor(triangles.length/2);return {box,left:bvh(triangles.slice(0,middle)),right:bvh(triangles.slice(middle))};
}
function intersect(tree,ray,best=Infinity){
 const hit=ray.intersectBox(tree.box,new Vector3());if(!hit||(!tree.box.containsPoint(ray.origin)&&ray.origin.distanceTo(hit)>best))return best;
 if(tree.triangles){for(const [a,b,c]of tree.triangles){const p=ray.intersectTriangle(a,b,c,false,new Vector3());if(p){const d=ray.origin.distanceTo(p);if(d>1e-6&&d<best)best=d;}}return best;}
 best=intersect(tree.left,ray,best);return intersect(tree.right,ray,best);
}
function outerCoverage(tree,ray,maximum){
 if(!ray.intersectBox(tree.box,new Vector3()))return -Infinity;
 if(tree.triangles){let outer=-Infinity;for(const [a,b,c]of tree.triangles){const p=ray.intersectTriangle(a,b,c,false,new Vector3());if(p){const d=ray.origin.distanceTo(p);if(d>1e-6&&d<=maximum)outer=Math.max(outer,d);}}return outer;}
 return Math.max(outerCoverage(tree.left,ray,maximum),outerCoverage(tree.right,ray,maximum));
}
function rigidGeometry(asset,nodes,index){
 const n=asset.json.nodes[index];assert.equal(n.skin,undefined);return asset.json.meshes[n.mesh].primitives.map(p=>({points:asset.accessors[p.attributes.POSITION].map(v=>new Vector3().fromArray(v).applyMatrix4(nodes[index].matrixWorld)),indices:asset.accessors[p.indices].map(v=>v[0])}));
}
function triangles(primitives){return primitives.flatMap(p=>{const out=[];for(let i=0;i<p.indices.length;i+=3)out.push(p.indices.slice(i,i+3).map(n=>p.points[n]));return out;});}
const avatar=parseGlb(path.join(frozenBase,'avatar.glb'));
const shoes=Object.fromEntries(['court.glb','ridge.glb'].map(f=>[f,parseGlb(path.join(base,f))]));
const registration=JSON.parse(fs.readFileSync(path.join(base,'fit-registration.json'),'utf8'));
const reports=[];let fullFootSamples;
check('frozen C17 avatar and both garments remain byte-for-byte unchanged',()=>{
 const expected={'avatar.glb':'9b236207c5256cb79e699d451c8345b7790717c2a06f151fe9e2814aa57be631','core-tee.glb':'79b645eb26a89f3c755d7dc25ed26c15129e905381d8e47b3f89b144638d1d15','field-jacket.glb':'72b28ac1219ba2f848fb3000374680d12b02738d8672e7152e7ca557dcf7fade'};
 for(const[f,h]of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(frozenBase,f))).digest('hex'),h);
});
check('original complete 53-bone avatar and all 13,743 body triangles retained; shoes have no body copy or mask',()=>{
 assert.equal(avatar.json.skins[0].joints.length,53);assert.equal(avatar.json.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+avatar.accessors[p.indices].length/3,0),13743);
 for(const a of Object.values(shoes)){assert.equal(a.json.skins?.length||0,0);assert.equal(a.json.animations?.length||0,0);assert.ok(!a.json.meshes.some(m=>m.name==='Mannequin'));assert.ok(a.json.nodes.every(n=>!n.name?.includes('Avatar')));}
});
check('independent packed skin evaluation confirms original feet stationary in both constant registered poses',()=>{
 const neutral=avatar.json.animations.find(c=>c.name==='Fitting_Neutral'),reach=avatar.json.animations.find(c=>c.name==='Fitting_Reach');assert.ok(neutral&&reach);
 const pn=vertices(avatar,pose(avatar,neutral,0)),pr=vertices(avatar,pose(avatar,reach,0));assert.equal(pn.length,pr.length);
 const seen=new Set();fullFootSamples=[];
 pn.forEach((p,i)=>{if(p.y<.155){assert.ok(p.distanceTo(pr[i])<2e-6);const k=p.toArray().map(n=>Math.round(n*1e6)).join(',');if(!seen.has(k)){seen.add(k);fullFootSamples.push(p);}}});
 assert.ok(fullFootSamples.length>150);assert.ok(Math.abs(Math.min(...pn.map(p=>p.y)))<2e-6);assert.ok(Math.abs(Math.max(...pn.map(p=>p.y))-1.78)<2e-6);
 for(const side of ['L','R']){const nodes=pose(avatar,neutral,0),foot=nodes[avatar.json.nodes.findIndex(n=>n.name==='DEF-foot.'+side)],toe=nodes[avatar.json.nodes.findIndex(n=>n.name==='DEF-toe.'+side)];assert.ok(toe.getWorldPosition(new Vector3()).z>foot.getWorldPosition(new Vector3()).z+.1);}
});
check('both local rigid pairs have complete independently shaped left/right upper, sole, tongue, collar, lace and hardware',()=>{
 for(const[file,a]of Object.entries(shoes)){
  const sku=file==='court.glb'?'court-01':'boot-01',nodeNames=a.json.nodes.map(n=>n.name||'');
  for(const side of ['L','R'])for(const suffix of ['UpperComplete','OutsoleComplete','ToeCap','TongueComplete','LaceBridge_0','HeelCounter'])assert.ok(nodeNames.includes(sku+'_'+side+'_'+suffix),suffix);
  assert.ok(nodeNames.some(n=>n.includes('PaddedCollarRim')||n.includes('PaddedShaftRim')));assert.ok(nodeNames.some(n=>n.includes('Eyelet_CompletePair')));
  assert.ok(a.json.meshes.length>=60);assert.equal(a.json.materials.filter(m=>m.name==='Fitting_ShoeUpper').length,1);
  for(const m of a.json.materials){assert.ok(m.pbrMetallicRoughness);assert.ok(m.pbrMetallicRoughness.baseColorFactor.every(Number.isFinite));}
  assert.ok(a.json.materials.find(m=>m.name==='Fitting_ShoeHardware').pbrMetallicRoughness.metallicFactor>.5);
 }
});
check('registered roots remain zero with unit scale, soles touch y=0 and shape extents fit fixed foot interaction registration',()=>{
 assert.equal(registration.up,'+Y');assert.equal(registration.front,'+Z');assert.equal(registration.outerScale,1);assert.equal(registration.gaitSupported,false);assert.equal(registration.realSizePrediction,false);
 for(const[file,a]of Object.entries(shoes)){
  const nodes=pose(a,null,0),points=vertices(a,nodes),box=new Box3().setFromPoints(points);assert.ok(Math.abs(box.min.y)<2e-6);assert.ok(box.min.x>-.20&&box.max.x<.20);assert.ok(box.min.z>-.18&&box.max.z<.34);
  assert.ok(box.max.y>(file==='court.glb'?.18:.30));const root=a.json.nodes.findIndex(n=>n.name?.startsWith('Footwear_Pair_'));assert.ok(root>=0);assert.deepEqual(nodes[root].position.toArray(),[0,0,0]);assert.deepEqual(nodes[root].scale.toArray(),[1,1,1]);
 }
});
check('finite ground projection and non-portal upper-ray coverage of every registered original foot sample',()=>{
 for(const[file,a]of Object.entries(shoes)){
  const nodes=pose(a,null,0);let ground=0,upper=0,portal=0;const failures=[];
  for(const side of ['L','R']){
   const sign=side==='L'?1:-1,sku=file==='court.glb'?'court-01':'boot-01';
   const upperNode=a.json.nodes.findIndex(n=>n.name===sku+'_'+side+'_UpperComplete'),soleNode=a.json.nodes.findIndex(n=>n.name===sku+'_'+side+'_OutsoleComplete');
   const upperTree=bvh(triangles(rigidGeometry(a,nodes,upperNode))),soleTree=bvh(triangles(rigidGeometry(a,nodes,soleNode)));
   for(const p of fullFootSamples.filter(p=>p.x*sign>0)){
    const groundRay=new Ray(new Vector3(p.x,.4,p.z),new Vector3(0,-1,0));const distance=intersect(soleTree,groundRay);if(!Number.isFinite(distance))failures.push({type:'ground',point:p.toArray()});else ground++;
    const q=((p.x-sign*.086629)/.050)**2+((p.z+.034)/.059)**2;
    if(q<=1.0){portal++;continue;}
    const d=intersect(upperTree,new Ray(p.clone(),new Vector3(0,1,0)));if(!Number.isFinite(d))failures.push({type:'upper',point:p.toArray(),portalDistance:q});else upper++;
   }
  }
  const points=vertices(a,nodes),box=new Box3().setFromPoints(points);
  reports.push({file,originalFootSamples:fullFootSamples.length,groundProjectionHits:ground,nonPortalUpwardHits:upper,declaredOpenAnklePortalSamples:portal,failures,bounds:{min:box.min.toArray(),max:box.max.toArray()},meshCount:a.json.meshes.length,triangles:a.json.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+a.accessors[p.indices].length/3,0)});
  // Every miss is recorded, never silently removed to make a passing result.
  assert.equal(failures.length,0,JSON.stringify({file,failures}));assert.equal(ground,fullFootSamples.length);assert.equal(upper+portal,fullFootSamples.length);
 }
});
check('short boot quarter encloses all sampled original lower-shin vertices in its declared shaft-height domain',()=>{
 const a=shoes['ridge.glb'],nodes=pose(a,null,0),avNodes=pose(avatar,avatar.json.animations.find(c=>c.name==='Fitting_Neutral'),0),body=vertices(avatar,avNodes);
 const bodyTriangles=avatar.json.nodes.flatMap((n,i)=>Number.isInteger(n.mesh)?triangles(nodeGeometry(avatar,avNodes,i)):[]);
 for(const t of bodyTriangles){if(Math.min(...t.map(p=>p.y))>.284||Math.max(...t.map(p=>p.y))<.155)continue;for(let i=0;i<=8;i++)for(let j=0;j<=8-i;j++)body.push(t[0].clone().multiplyScalar(i/8).addScaledVector(t[1],j/8).addScaledVector(t[2],1-(i+j)/8));}
 let sampled=0,covered=0;const misses=[],seen=new Set();
 for(const side of ['L','R']){
  const sign=side==='L'?1:-1,tree=bvh(triangles(rigidGeometry(a,nodes,a.json.nodes.findIndex(n=>n.name==='boot-01_'+side+'_AnkleQuarterComplete'))));
  for(const p of body){if(p.x*sign<=0||p.y<.155||p.y>.284)continue;const key=p.toArray().map(n=>Math.round(n*1e6)).join(',');if(seen.has(key))continue;seen.add(key);sampled++;
   const center=new Vector3(sign*.086629,p.y,-.040),direction=p.clone().sub(center).setY(0),distance=direction.length();assert.ok(distance>1e-6);const outer=outerCoverage(tree,new Ray(center,direction.normalize()),.2);
   if(Number.isFinite(outer)&&distance<=outer+2e-6)covered++;else misses.push({point:p.toArray(),distance,outer});
  }
 }
 reports.find(r=>r.file==='ridge.glb').shaftSampling={heightDomain:[.155,.284],source:'all original lower-shin vertices plus 8th-order barycentric original-body-triangle surface samples crossing the height domain',sampled,covered,misses};assert.equal(misses.length,0,JSON.stringify(misses));assert.ok(sampled>20);
});
check('independent closed paired sole topology and contact plane retained without body masking',()=>{
 for(const[file,a]of Object.entries(shoes)){
  const sku=file==='court.glb'?'court-01':'boot-01',nodes=pose(a,null,0);
  for(const side of ['L','R']){
   const data=rigidGeometry(a,nodes,a.json.nodes.findIndex(n=>n.name===sku+'_'+side+'_OutsoleComplete')),edges=new Map();
   for(const t of triangles(data)){const keys=t.map(p=>p.toArray().map(n=>Math.round(n*1e6)).join(','));for(let i=0;i<3;i++){const key=[keys[i],keys[(i+1)%3]].sort().join(';');edges.set(key,(edges.get(key)||0)+1);}}
   assert.ok([...edges.values()].every(count=>count===2));
  }
 }
});
if(!geometryOnly){
 check('original editable pair recipe, license, 18 real-avatar views and runtime hashes registered and match',()=>{
  assert.equal(manifest.runtime.bodyMasks,false);assert.equal(manifest.runtime.virtualReferenceHeight,1.78);assert.equal(manifest.authoredAdditions.externalFootwearAssets,false);
  for(const f of manifest.files){const b=fs.readFileSync(registered(f));assert.equal(b.length,f.byteLength);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}
  assert.equal(manifest.files.filter(f=>f.role==='actual-avatar-view').length,18);
 });
}
console.log(JSON.stringify({checks:results.length,passed:results.length,results,status:reports.some(r=>r.failures.length)?'review-required':'passed-with-finite-foot-domain',scope:'Fixed 1.78 virtual reference avatar only; both poses have stationary feet. All foot ground projections and outside-ankle-portal upward rays sampled. Open ankle portal deliberately remains open. This is not a volumetric collision certificate or real-world sizing/sole-padding simulation.',reports},null,2));
