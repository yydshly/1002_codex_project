import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_POLICY, analyzeSurfaces, analyzeLampBase, transformSurface, transformTriangles,
  checkPlacement, checkTranslationSweep, checkRotationSweep, tableObstacles, recommendPlacement } from '../web/support/geometry.js';

// X/Z rectangles are generated with upward or downward geometric winding.
function rectangle(x0,z0,x1,z1,y=0.75,down=false){
  const a=[x0,y,z0],b=[x0,y,z1],c=[x1,y,z1],d=[x1,y,z0];
  return down?[{a,b:c,c:b},{a,b:d,c}]:[{a,b,c},{a,b:c,c:d}];
}
function lamp(x0=-0.05,z0=-0.05,x1=0.05,z1=0.05){
  const triangles=rectangle(x0,z0,x1,z1,0,true);
  triangles.push(...rectangle(x0,z0,x1,z1,0.5));
  return analyzeLampBase(triangles).base;
}
const base=lamp();
const surface=triangles=>analyzeSurfaces(triangles).surfaces[0];
const place=(s,anchor=[0,0],extra={})=>checkPlacement(s,base,{anchor,...extra});
function hole(){return [
  ...rectangle(-0.5,-0.5,-0.012,0.5),...rectangle(0.012,-0.5,0.5,0.5),
  ...rectangle(-0.012,-0.5,0.012,-0.012),...rectangle(-0.012,0.012,0.012,0.5),
];}

test('a square lamp bottom and source height produce an independent world pose',()=>{
  assert.equal(base.polygon.length,4);
  const result=place(surface(rectangle(-0.5,-0.5,0.5,0.5)));
  assert.equal(result.valid,true);assert.equal(result.worldPose.y,0.75);
  assert.equal(result.worldPose.scale,1);assert.equal(result.evidence.coverage,'exact-rational-triangle-union');
});
test('a small hole completely enclosed by the lamp bottom is not missed by corners or center sampling',()=>{
  // Move the hole away from the lamp center: all four corners and the center
  // are supported while a small enclosed area is not.
  const h=hole().map(t=>Object.fromEntries(['a','b','c'].map(k=>[k,[t[k][0]+0.025,t[k][1],t[k][2]+0.025]])));
  const result=place(surface(h));assert.equal(result.valid,false);assert.equal(result.reason,'footprint-uncovered');
  assert.ok(result.evidence.remainingFragments>0);
});
test('a concave table notch crossing the footprint is rejected',()=>{
  const s=surface([...rectangle(-0.5,-0.5,0.5,-0.02),...rectangle(-0.5,-0.02,-0.02,0.5)]);
  assert.equal(place(s,[-0.04,-0.04]).valid,false);
  assert.equal(place(s,[-0.2,-0.2]).valid,true);
});
test('a submicron enclosed hole is retained rather than ignored by area threshold',()=>{
  const e=1e-8;
  const s=surface([...rectangle(-0.5,-0.5,-e,0.5),...rectangle(e,-0.5,0.5,0.5),...rectangle(-e,-0.5,e,-e),...rectangle(-e,e,e,0.5)]);
  assert.equal(place(s).valid,false);
});
test('separated coplanar table pieces remain separate candidates',()=>{
  const result=analyzeSurfaces([...rectangle(-0.5,-0.2,-0.1,0.2),...rectangle(0.1,-0.2,0.5,0.2)]);
  assert.equal(result.valid,true);assert.equal(result.status,'ambiguous');assert.equal(result.surfaces.length,2);
  assert.ok(result.surfaces.every(s=>place(s).valid===false));
});
test('surface IDs are stable under triangle order and cyclic vertex reordering',()=>{
  const mesh=rectangle(-0.5,-0.5,0.5,0.5),a=analyzeSurfaces(mesh);
  const shuffled=mesh.toReversed().map(t=>({a:t.b,b:t.c,c:t.a})),b=analyzeSurfaces(shuffled);
  assert.equal(a.surfaces[0].id,b.surfaces[0].id);
});
test('upward normals and multiple height layers are distinguished, not highest-box-selected',()=>{
  const result=analyzeSurfaces([...rectangle(-0.5,-0.5,0.5,0.5),...rectangle(-0.2,-0.2,0.2,0.2,0.9),...rectangle(-1,-1,1,1,1,true)]);
  assert.equal(result.surfaces.length,2);assert.equal(result.status,'ambiguous');
  assert.deepEqual(result.surfaces.map(s=>s.height),[0.9,0.75]);
});
test('safety margin rejects a footprint touching the outside edge',()=>{
  const s=surface(rectangle(-0.5,-0.5,0.5,0.5));
  assert.equal(place(s,[0.45,0]).valid,false);
  assert.equal(place(s,[0.447,0]).valid,true);
});
test('offset lamp contact bottom is preserved rather than assumed centered at its root',()=>{
  const off=lamp(0.15,-0.05,0.25,0.05),s=surface(rectangle(-0.5,-0.5,0.5,0.5));
  assert.deepEqual(off.contactOffset,[0.2,0]);
  assert.equal(checkPlacement(s,off,{anchor:[0.25,0]}).valid,false);
  assert.equal(checkPlacement(s,off,{anchor:[0,0]}).valid,true);
  const recommendation=recommendPlacement(s,off);assert.equal(recommendation.valid,true);
  assert.deepEqual(recommendation.anchor,[-0.2,0]);
});
test('a nonconvex contact base and separated lamp feet are rejected',()=>{
  const separated=analyzeLampBase([...rectangle(-0.2,-0.05,-0.1,0.05,0,true),...rectangle(0.1,-0.05,0.2,0.05,0,true)]);
  assert.equal(separated.reason,'base-nonconvex-or-separated');
  const concave=analyzeLampBase([...rectangle(-0.1,-0.1,0.1,-0.02,0,true),...rectangle(-0.1,-0.02,-0.02,0.1,0,true)]);
  assert.equal(concave.reason,'base-nonconvex-or-separated');
});
test('a lamp contact hole is rejected despite a convex exterior',()=>{
  const bottom=hole().map(t=>({a:[...t.a],b:[...t.c],c:[...t.b]}));
  for(const t of bottom)for(const p of [t.a,t.b,t.c])p[1]=0;
  assert.equal(analyzeLampBase(bottom).reason,'base-nonconvex-or-separated');
});
test('legal translation endpoints cannot slide through a hole between mouse events',()=>{
  const s=surface(hole()),a={anchor:[-0.2,0]},b={anchor:[0.2,0]};
  assert.equal(checkPlacement(s,base,a).valid,true);assert.equal(checkPlacement(s,base,b).valid,true);
  assert.equal(checkTranslationSweep(s,base,a,b).reason,'sweep-uncovered');
  assert.equal(checkTranslationSweep(s,base,{anchor:[-0.2,0.2]},{anchor:[0.2,0.2]}).valid,true);
});
test('translation interface refuses rotation or scale changes instead of testing wrong sweep',()=>{
  const s=surface(rectangle(-0.5,-0.5,0.5,0.5));
  assert.equal(checkTranslationSweep(s,base,{anchor:[0,0]},{anchor:[0.1,0],yaw:0.1}).reason,'translation-changes-orientation-or-scale');
});
test('continuous rotation uses an explicit conservative circle envelope',()=>{
  const long=lamp(-0.15,-0.02,0.15,0.02),large=surface(rectangle(-0.5,-0.5,0.5,0.5));
  const result=checkRotationSweep(large,long,{anchor:[0,0]},{anchor:[0,0],yaw:Math.PI/2});
  assert.equal(result.valid,true);assert.equal(result.evidence.sweep,'full-circle-conservative');
  const narrow=surface(rectangle(-0.16,-0.03,0.16,0.03));
  assert.equal(checkPlacement(narrow,long,{anchor:[0,0]}).valid,true);
  assert.equal(checkPlacement(narrow,long,{anchor:[0,0],yaw:0.01}).valid,true);
  assert.equal(checkRotationSweep(narrow,long,{anchor:[0,0]},{anchor:[0,0],yaw:0.01}).reason,'rotation-envelope-uncovered');
});
test('a rotation cannot cross an enclosed off-axis hole when both endpoint orientations are legal',()=>{
  const long=lamp(-0.15,-0.02,0.15,0.02);
  const shifted=hole().map(t=>Object.fromEntries(['a','b','c'].map(k=>[k,[t[k][0]+0.08,t[k][1],t[k][2]+0.08]])));
  const s=surface(shifted),a={anchor:[0,0]},b={anchor:[0,0],yaw:Math.PI/2};
  assert.equal(checkPlacement(s,long,a).valid,true);assert.equal(checkPlacement(s,long,b).valid,true);
  assert.equal(checkRotationSweep(s,long,a,b).reason,'rotation-envelope-uncovered');
});
test('a tilted contact bottom beyond the frozen flatness limit is refused',()=>{
  const bottom=rectangle(-0.1,-0.1,0.1,0.1,0,true);
  for(const t of bottom)for(const p of [t.a,t.b,t.c])if(p[0]>0)p[1]=0.005;
  assert.equal(analyzeLampBase(bottom).reason,'no-planar-lamp-base');
});
test('axis scaling the table does not scale the independent lamp',()=>{
  const source=surface(rectangle(-0.5,-0.5,0.5,0.5));
  const world=transformSurface(source,{x:1,y:0.1,z:-1,yaw:Math.PI/4,scale:{x:2,y:1.2,z:0.7}});
  const result=checkPlacement(world,base,{anchor:[1,-1],scale:0.8});
  assert.equal(result.valid,true);assert.equal(result.worldPose.scale,0.8);assert.ok(Math.abs(result.worldPose.y-1)<1e-12);
  assert.equal(world.id,source.id);
});
test('scaling a near-horizontal source cannot exceed the frozen world contact tolerance',()=>{
  const mesh=rectangle(-0.5,-0.5,0.5,0.5);
  for(const t of mesh)for(const p of [t.a,t.b,t.c])if(p[0]>0)p[1]=0.7504;
  const s=surface(mesh);assert.equal(place(s).valid,true);
  const stretched=transformSurface(s,{scale:{x:1,y:2,z:1}});
  assert.equal(place(stretched).reason,'contact-height-mismatch');
});
test('full lamp body AABB blocks obstacles above the contact base, including solid containment',()=>{
  const s=surface(rectangle(-0.5,-0.5,0.5,0.5)),obstacle={id:'box',min:[-0.5,0.8,-0.5],max:[0.5,1.4,0.5]};
  const result=place(s,[0,0],{obstacles:[obstacle]});
  assert.equal(result.reason,'conservative-aabb-collision');assert.equal(result.evidence.collision,'box');
});
test('translation lamp-body sweep catches an obstacle between legal endpoints',()=>{
  const s=surface(rectangle(-0.5,-0.5,0.5,0.5)),obstacles=[{id:'post',min:[-0.015,0.85,-0.015],max:[0.015,1.2,0.015]}];
  const a={anchor:[-0.2,0],obstacles},b={anchor:[0.2,0],obstacles};
  assert.equal(checkPlacement(s,base,a).valid,true);assert.equal(checkPlacement(s,base,b).valid,true);
  assert.equal(checkTranslationSweep(s,base,a,b).reason,'conservative-aabb-sweep-collision');
});
test('table obstacle extraction excludes contact plane but retains an above-surface rim',()=>{
  const table=rectangle(-0.5,-0.5,0.5,0.5),s=surface(table);
  assert.equal(tableObstacles(table,s).length,0);
  const rim={a:[-0.02,0.75,-0.1],b:[0.02,0.9,-0.1],c:[0.02,0.9,0.1]};
  const obstacles=tableObstacles([...table,rim],s);assert.equal(obstacles.length,1);
  assert.equal(place(s,[0,0],{obstacles}).reason,'conservative-aabb-collision');
});
test('nonfinite, degenerate and out-of-range geometry is explicitly refused',()=>{
  const t=rectangle(-0.5,-0.5,0.5,0.5)[0];
  assert.equal(analyzeSurfaces([{...t,a:[NaN,0,0]}]).reason,'non-finite-or-out-of-range');
  assert.equal(analyzeLampBase([{...t,b:[Infinity,0,0]}]).reason,'non-finite-or-out-of-range');
  assert.equal(analyzeSurfaces([{a:[0,0,0],b:[1,0,0],c:[2,0,0]}]).reason,'degenerate-triangle');
  assert.equal(analyzeSurfaces([{...t,a:[101,0,0]}]).reason,'non-finite-or-out-of-range');
});
test('unsupported transforms and invalid obstacles cannot silently pass',()=>{
  const s=surface(rectangle(-0.5,-0.5,0.5,0.5));
  assert.equal(place(s,[0,0],{scale:0}).reason,'unsupported-transform');
  assert.equal(place(s,[0,0],{obstacles:[{min:[NaN,0,0],max:[1,1,1]}]}).reason,'invalid-obstacle');
  assert.throws(()=>transformTriangles(rectangle(-0.5,-0.5,0.5,0.5),{scale:{x:-1,y:1,z:1}}));
});
test('resource limits reject an oversized input without pretending to inspect it',()=>{
  const t=rectangle(-0.5,-0.5,0.5,0.5)[0];
  assert.equal(analyzeSurfaces(Array(SUPPORT_POLICY.maxTriangles+1).fill(t)).reason,'resource-limit');
});
