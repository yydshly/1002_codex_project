import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDemoPlan, validatePlan } from '../web/creation-core.js';
import { makeRefinement } from '../web/creation-refinement.js';
import { buildModelGeometry, MODEL_VERTEX_STRIDE, MODEL_TRIANGLE_BUDGET } from '../web/model-scene-assets.js';
const candidate = JSON.parse(await readFile(new URL('../web/model-scene-candidate.json',import.meta.url),'utf8'));
const fixture = () => createDemoPlan();
function slice(geometry,id) {
 const record=geometry.records.get(id);return Array.from(geometry.data.subarray(record.start*MODEL_VERTEX_STRIDE,record.end*MODEL_VERTEX_STRIDE));
}
function fields(geometry,id,offset,count) {
 const record=geometry.records.get(id),result=[];
 for(let v=record.start;v<record.end;v++)result.push(...geometry.data.subarray(v*MODEL_VERTEX_STRIDE+offset,v*MODEL_VERTEX_STRIDE+offset+count));
 return result;
}
test('authored kit makes genuine extra triangles while leaving its source plan unchanged',()=>{
 const plan=fixture(),before=JSON.stringify(plan),coarse=buildModelGeometry(plan),rich=buildModelGeometry(plan,candidate);
 assert.equal(JSON.stringify(plan),before);assert.deepEqual([...rich.records.keys()],[...coarse.records.keys()]);
 assert.ok(rich.data.length>coarse.data.length*8);assert.equal(rich.data.length%(MODEL_VERTEX_STRIDE*3),0);
 for(const value of rich.data)assert.ok(Number.isFinite(value));
});
test('locked refined land and locked markers are exactly their existing coarse mesh and colors',()=>{
 const plan=fixture();plan.entities[0].locked=true;plan.entities[0].refinement=makeRefinement('tropical',3,17);
 for(const entity of plan.entities)if(['cabin','lighthouse','palm','boat'].includes(entity.kind))entity.locked=true;
 const a=buildModelGeometry(plan),b=buildModelGeometry(plan,candidate);
 for(const entity of plan.entities.filter(entity=>entity.locked))assert.deepEqual(slice(a,entity.id),slice(b,entity.id));
});
test('lake geometry uses the exact coarse water support elevation and all its original vertices',()=>{
 const plan=fixture();plan.entities.push({id:'lake',kind:'water',height:0,locked:false,points:[{x:.2,y:.35},{x:.3,y:.35},{x:.29,y:.42},{x:.2,y:.43}]});
 const valid=validatePlan(plan),a=buildModelGeometry(valid),b=buildModelGeometry(valid,candidate);
 assert.deepEqual(fields(a,'lake',0,3),fields(b,'lake',0,3));assert.ok(b.records.get('lake').bounds.min.y>3);
});
test('original road vertices and marker centres remain fixed',()=>{
 const plan=fixture(),a=buildModelGeometry(plan),b=buildModelGeometry(plan,candidate);
 assert.deepEqual(fields(a,'bridge-road',0,3),fields(b,'bridge-road',0,3));
 for(const e of plan.entities.filter(e=>['cabin','lighthouse','palm','boat'].includes(e.kind))){
  const r=b.records.get(e.id),x=(e.points[0].x-.5)*plan.world.width,z=(e.points[0].y-.5)*plan.world.depth;
  assert.ok(r.bounds.min.x<x&&r.bounds.max.x>x);assert.ok(r.bounds.min.z<z&&r.bounds.max.z>z);
 }
});
test('crafted assets fit the circular authored safety footprints',()=>{
 const plan=fixture(),rich=buildModelGeometry(plan,candidate),radii={cabin:6.3,lighthouse:2.55,palm:5.3,boat:4.4};
 for(const e of plan.entities.filter(e=>radii[e.kind])){
  const record=rich.records.get(e.id),x=(e.points[0].x-.5)*plan.world.width,z=(e.points[0].y-.5)*plan.world.depth;
  for(let v=record.start;v<record.end;v++){const i=v*MODEL_VERTEX_STRIDE;assert.ok(Math.hypot(rich.data[i]-x,rich.data[i+2]-z)<=radii[e.kind]+1e-5,`${e.kind} footprint`);}
 }
});
test('lighthouse highest point stays at its configured absolute height',()=>{
 const plan=fixture(),rich=buildModelGeometry(plan,candidate),entity=plan.entities.find(e=>e.kind==='lighthouse');
 assert.ok(Math.abs(rich.records.get(entity.id).bounds.max.y-(entity.height+3))<1e-5);
});
test('seed recipe is deterministic and every retained normal has a valid direction',()=>{
 const plan=fixture(),a=buildModelGeometry(plan,candidate),b=buildModelGeometry(plan,candidate);
 assert.deepEqual(a.data,b.data);for(let i=0;i<a.data.length;i+=MODEL_VERTEX_STRIDE)assert.ok(Math.hypot(...a.data.subarray(i+3,i+6))>.99);
});
test('existing refined-land decoration count is retained in the crafted candidate',()=>{
 const plan=fixture();plan.entities[0].refinement=makeRefinement('tropical',3,1);
 const a=buildModelGeometry(plan),b=buildModelGeometry(plan,candidate);
 assert.equal(b.records.get(plan.entities[0].id).decorations,a.records.get(plan.entities[0].id).decorations);
});
test('large authored scene fails atomically with a stated triangle budget',()=>{
 const plan=fixture();const lighthouse=plan.entities.find(e=>e.kind==='lighthouse');
 plan.entities=Array.from({length:100},(_,i)=>({...structuredClone(lighthouse),id:`tower-${i}`}));
 assert.throws(()=>buildModelGeometry(validatePlan(plan),candidate),/120,000/);assert.equal(MODEL_TRIANGLE_BUDGET,120000);
});
