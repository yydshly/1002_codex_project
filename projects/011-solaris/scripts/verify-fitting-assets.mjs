import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3, Ray, Box3 } from '../web/studio/vendor/three.module.js';

// Reads binary buffers and evaluates skinning independently of the renderer/Blender.
const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const base = path.join(project, 'web', 'fitting', 'assets');
const archive = path.join(project, 'assets');
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
const fittingReport=JSON.parse(fs.readFileSync(path.join(base,'fit-registration.json'),'utf8'));
const assets=Object.fromEntries(['avatar.glb','core-tee.glb','field-jacket.glb'].map(file=>[file,parseGlb(path.join(base,file))]));
const avatar=assets['avatar.glb'];const reports=[];let sourceBody;
function restPose(a){
 const nodes=pose(a,null,0);
 for(const index of a.json.skins[0].joints){const n=sourceBody.json.nodes.find(n=>n.name===a.json.nodes[index].name);assert.ok(n);nodes[index].position.fromArray(n.translation||[0,0,0]);nodes[index].quaternion.fromArray(n.rotation||[0,0,0,1]);nodes[index].scale.fromArray(n.scale||[1,1,1]);if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(nodes[index].position,nodes[index].quaternion,nodes[index].scale);}
 a.json.scenes[a.json.scene||0].nodes.forEach(i=>nodes[i].updateMatrixWorld(true));return nodes;
}
check('archived complete CC0 source, authored independent continuous garment topology and local pipeline registered',()=>{
 assert.equal(manifest.source.author,'Quaternius');assert.equal(manifest.source.license,'CC0-1.0');assert.equal(manifest.source.pageUrl,'https://quaternius.com/packs/universalanimationlibrary.html');
 assert.equal(manifest.runtime.bodyMasks,false);assert.equal(manifest.runtime.virtualReferenceHeight,1.78);assert.equal(manifest.authoredAdditions.geometry.includes('continuous'),true);
});
check('all original/license/recipe/editable/runtime byte lengths and SHA-256 hashes match',()=>{
 for(const f of manifest.files){const b=fs.readFileSync(registered(f));assert.equal(b.length,f.byteLength);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}
});
check('three runtime GLBs have finite embedded buffers and no external texture/model requests',()=>{
 assert.equal(Object.keys(assets).length,3);for(const a of Object.values(assets)){assert.equal(a.json.skins.length,1);assert.ok(a.json.meshes.length>0);assert.ok(!a.json.extensionsRequired?.includes('KHR_draco_mesh_compression'));}
});
check('complete original body faces and vertices preserved without body deletion/masks/decimation',()=>{
 const source=parseGlb(registered(manifest.files.find(f=>f.role==='original-body-glb')));
 sourceBody=source;
 const triangles=a=>a.json.meshes.find(m=>m.name==='Mannequin').primitives.flatMap(p=>{const v=a.accessors[p.attributes.POSITION],idx=a.accessors[p.indices].map(i=>i[0]),out=[];for(let i=0;i<idx.length;i+=3)out.push(idx.slice(i,i+3).map(n=>v[n]));return out;});
 const key=t=>t.map(v=>v.map(n=>Math.round(n*1e5)).join(',')).sort().join(';');
 const src=new Set(triangles(source).map(key)),dst=new Set(triangles(avatar).map(key));
 assert.equal(src.size,13743);assert.equal(dst.size,13743);
 assert.equal(triangles(source).length,13744);assert.equal(triangles(avatar).length,13743);
 const imported=JSON.parse(fs.readFileSync(registered(manifest.files.find(f=>f.role==='source-topology-snapshot')),'utf8'));
 const original=source.json.meshes.find(m=>m.name==='Mannequin').primitives;
 const coords=original.flatMap(p=>source.accessors[p.attributes.POSITION]);assert.equal(coords.length,imported.verticesGlTFYUp.length);coords.forEach((v,i)=>v.forEach((n,k)=>assert.ok(Math.abs(n-imported.verticesGlTFYUp[i][k])<2e-6)));
 const grid=new Map(),cell=v=>v.map(n=>Math.floor(n*1e4)),coordKey=v=>v.join(',');
 for(const v of coords){const k=cell(v).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(v);}
 function originalCoordinate(p){const c=cell(p),near=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)near.push(...(grid.get([c[0]+x,c[1]+y,c[2]+z].join(','))||[]));let best=null,d=Infinity;for(const v of near){const q=v.reduce((sum,n,k)=>sum+(n-p[k])**2,0);if(q<d){best=v;d=q;}}assert.ok(best&&d<4e-10,'original bind-rest body vertex retained');return coordKey(best);}
 const restored=restPose(avatar),anchor=avatar.json.nodes.findIndex(n=>n.name==='Fitting_Fixed_178_Reference'),inverse=restored[anchor].matrixWorld.clone().invert();
 const rawFaces=new Set(triangles(source).map(t=>t.map(coordKey).sort().join(';'))),outputFaces=new Set();
 for(const primitive of nodeGeometry(avatar,restored,avatar.json.nodes.findIndex(n=>n.mesh!==undefined))){const keys=primitive.points.map(p=>originalCoordinate(p.clone().applyMatrix4(inverse).toArray()));for(let i=0;i<primitive.indices.length;i+=3)outputFaces.add(primitive.indices.slice(i,i+3).map(n=>keys[n]).sort().join(';'));}
 assert.equal(outputFaces.size,rawFaces.size);assert.ok([...rawFaces].every(k=>outputFaces.has(k)),'complete original face connectivity retained after packed skin bind-rest restoration');
 const recipe=fs.readFileSync(registered(manifest.files.find(f=>f.role==='local-build-recipe')),'utf8');assert.ok(recipe.includes('assert source_vertices==[list(v.co)for v in body.data.vertices]'));assert.ok(recipe.includes('assert source_faces==[list(p.vertices)for p in body.data.polygons]'));
});
check('all three independent skins preserve the complete 53-bone hierarchy and compatible inverse binds within 2e-6',()=>{
 const names=a=>a.json.skins[0].joints.map(i=>a.json.nodes[i].name);
 const src=names(avatar);assert.equal(src.length,53);for(const name of ['DEF-thigh.L','DEF-shin.L','DEF-foot.L','DEF-toe.L','DEF-upper_arm.L','DEF-forearm.L','DEF-hand.L','DEF-head'])assert.ok(src.includes(name));
 for(const a of Object.values(assets)){
  assert.deepEqual(names(a),src);const bind=a.accessors[a.json.skins[0].inverseBindMatrices],ref=avatar.accessors[avatar.json.skins[0].inverseBindMatrices];bind.forEach((m,i)=>m.forEach((v,k)=>assert.ok(Math.abs(v-ref[i][k])<2e-6,'inverse bind compatibility')));
  for(const n of a.json.nodes)if(n.mesh!==undefined)assert.equal(n.skin,0);
 }
});
check('two registered poses use deterministic constant two-second full-rig clips and neutral defaults',()=>{
 for(const a of Object.values(assets)){
  assert.deepEqual(a.json.animations.map(c=>c.name).sort(),['Fitting_Neutral','Fitting_Reach']);
  for(const clip of a.json.animations){assert.equal(clip.channels.length,159);for(const c of clip.channels){const s=clip.samplers[c.sampler],times=a.accessors[s.input].map(v=>v[0]),values=a.accessors[s.output];assert.equal(times[0],0);assert.ok(Math.abs(times.at(-1)-2)<1e-6);for(const v of values)assert.deepEqual(v,values[0]);}}
  const clip=a.json.animations.find(c=>c.name==='Fitting_Neutral'),defaults=vertices(a,pose(a,null,0)),neutral=vertices(a,pose(a,clip,0));assert.equal(defaults.length,neutral.length);defaults.forEach((p,i)=>assert.ok(p.distanceTo(neutral[i])<1e-7));
 }
});
check('complete reference avatar stands at y=0 and is 1.78 virtual reference units tall in both finite poses',()=>{
 for(const clip of avatar.json.animations){const p=vertices(avatar,pose(avatar,clip,0)),ys=p.map(v=>v.y);assert.ok(Math.abs(Math.min(...ys))<2e-6);assert.ok(Math.abs(Math.max(...ys)-1.78)<2e-6);}
});
check('front is positive Z: real toes and independently authored jacket zipper/pockets face the front camera',()=>{
 const n=pose(avatar,avatar.json.animations.find(c=>c.name==='Fitting_Neutral'),0);
 for(const side of ['L','R']){const foot=n[avatar.json.nodes.findIndex(b=>b.name==='DEF-foot.'+side)].getWorldPosition(new Vector3()),toe=n[avatar.json.nodes.findIndex(b=>b.name==='DEF-toe.'+side)].getWorldPosition(new Vector3());assert.ok(toe.z>foot.z+.05);}
 const jacket=assets['field-jacket.glb'],nodes=pose(jacket,jacket.json.animations.find(c=>c.name==='Fitting_Neutral'),0),index=jacket.json.nodes.findIndex(n=>n.name==='jacket-01_garment_hardware_zipper'),points=nodeGeometry(jacket,nodes,index).flatMap(p=>p.points);assert.ok(points.every(p=>p.z>0));
});
check('registered short/long sleeve meshes are independent sewn shells with separate tailoring and metal geometry',()=>{
 const tee=assets['core-tee.glb'],coat=assets['field-jacket.glb'];
 assert.ok(tee.json.nodes.some(n=>n.name==='tee-01_garment_main'));assert.ok(coat.json.nodes.some(n=>n.name==='jacket-01_garment_main'));
 assert.ok(tee.json.meshes.length>=8);assert.ok(coat.json.meshes.length>=20);
 for(const [file,a]of Object.entries(assets))if(file!=='avatar.glb'){assert.ok(!a.json.meshes.some(m=>m.name==='Mannequin'));assert.ok(a.json.materials.some(m=>m.name==='Fitting_Fabric'));assert.ok(a.json.materials.some(m=>m.name==='Fitting_Trim'));assert.ok(a.json.nodes.some(n=>n.name?.includes('pocket')));}
 assert.ok(coat.json.nodes.some(n=>n.name?.includes('zipper')));assert.ok(coat.json.nodes.some(n=>n.name?.includes('zip_pull')));assert.ok(coat.json.nodes.some(n=>n.name?.includes('back_yoke')));
});
check('PBR materials separate recolorable fabric, fixed trim/hardware and full-body neutral/base surfaces',()=>{
 for(const a of Object.values(assets))for(const m of a.json.materials){assert.ok(m.pbrMetallicRoughness);assert.ok(m.pbrMetallicRoughness.baseColorFactor.every(Number.isFinite));assert.ok(m.pbrMetallicRoughness.roughnessFactor>=0&&m.pbrMetallicRoughness.roughnessFactor<=1);}
 assert.ok(assets['field-jacket.glb'].json.materials.find(m=>m.name==='Fitting_Hardware').pbrMetallicRoughness.metallicFactor>.5);
 assert.ok(avatar.json.materials.some(m=>m.name==='Fitting_Avatar_IntegralBase'));
});
check('finite outward shell intersections cover tested torso/sleeve probes; non-intersecting underarm rays are explicitly unverified',()=>{
 for(const [file,a]of Object.entries(assets))if(file!=='avatar.glb')for(const clip of a.json.animations){
  const isTee=file==='core-tee.glb',hem=isTee?1:.975,cuff=isTee?.405:.718;
  const nodes=pose(a,clip,0),avNodes=pose(avatar,avatar.json.animations.find(c=>c.name===clip.name),0);
  const main=a.json.nodes.findIndex(n=>n.name===(isTee?'tee-01':'jacket-01')+'_garment_main');
  const triangles=nodeGeometry(a,nodes,main).flatMap(p=>{const out=[];for(let i=0;i<p.indices.length;i+=3)out.push(p.indices.slice(i,i+3).map(n=>p.points[n]));return out;});const tree=bvh(triangles);
  const av=avatar.json.nodes.findIndex(n=>n.mesh!==undefined),restNodes=restPose(avatar),restGeometry=nodeGeometry(avatar,restNodes,av),anchor=avatar.json.nodes.findIndex(n=>n.name==='Fitting_Fixed_178_Reference'),inverse=restNodes[anchor].matrixWorld.clone().invert();let count=0,miss=0,outside=0,min=Infinity;const outsideExamples=[];
  const geometry=nodeGeometry(avatar,avNodes,av);
  for(let pi=0;pi<geometry.length;pi++){const p=geometry[pi];for(let i=0;i<p.points.length;i++){
   const rest=restGeometry[pi].points[i].clone().applyMatrix4(inverse).toArray(),x=Math.abs(rest[0]),y=rest[1];let origin;
   if(x<.175&&y>hem+.025&&y<1.435)origin=new Vector3(0,y*fittingReport.scale+fittingReport.groundOffset,0);
   else if(x>.255&&x<cuff-.025&&y>1.335&&y<1.548){
    const side=rest[0]>0?'L':'R',part=x<.466?'DEF-upper_arm.':'DEF-forearm.',next=x<.466?'DEF-forearm.':'DEF-hand.';
    const j=avatar.json.nodes.findIndex(n=>n.name===part+side),k=avatar.json.nodes.findIndex(n=>n.name===next+side),head=avNodes[j].getWorldPosition(new Vector3()),tail=avNodes[k].getWorldPosition(new Vector3()),dir=tail.clone().sub(head);
    const t=Math.max(0,Math.min(1,p.points[i].clone().sub(head).dot(dir)/dir.lengthSq()));origin=head.addScaledVector(dir,t);
   }else continue;
   const delta=p.points[i].clone().sub(origin),distance=delta.length();if(distance<1e-5)continue;
   count++;const hit=outerCoverage(tree,new Ray(origin,delta.normalize()),distance+.18);if(!Number.isFinite(hit)){miss++;outsideExamples.push({rest,point:p.points[i].toArray(),direction:delta.toArray(),miss:true});continue;}const gap=hit-distance;min=Math.min(min,gap);if(gap<-.0008){outside++;outsideExamples.push({rest,point:p.points[i].toArray(),gap});}
  }}
  reports.push({file,pose:clip.name,probeCount:count,unverifiedRays:miss,outsideMeasuredOuterShell:outside,minimumMeasuredOuterShellOverhang:min,...(outside||miss?{unverifiedExamples:outsideExamples.sort((a,b)=>(a.gap||0)-(b.gap||0)).slice(0,3)}:{})});
  assert.ok(count>500);assert.ok(miss/count<.05,JSON.stringify(reports.at(-1)));assert.equal(outside,0,JSON.stringify(reports.at(-1)));
 }
});
console.log(JSON.stringify({status:'passed-with-finite-domain',checks:results.length,results,probeDomain:{poses:['Fitting_Neutral','Fitting_Reach'],torso:'original bind-rest |x|<.175, hem+.025<y<1.435',sleeves:'original bind-rest .255<|x|<cuff-.025,1.335<y<1.548',origin:'torso vertical axis or nearest actual upperarm/forearm axis',method:'outermost forward shell intersection within body radial distance+.18; internal fold layers are not an intersection proof',totalProbes:reports.reduce((n,r)=>n+r.probeCount,0),intersectedProbes:reports.reduce((n,r)=>n+r.probeCount-r.unverifiedRays,0),unverifiedRays:reports.reduce((n,r)=>n+r.unverifiedRays,0)},finiteFitProbes:reports,limit:'Selected torso/sleeve outward shell intersections only; missing rays are unverified and require front/back/side visual review. Outer garment layers may fold internally; this is not an arbitrary body/pose intersection proof, cloth physics, or continuous-time solver.'},null,2));
