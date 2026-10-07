import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSurfaces,analyzeLampBase,recommendPlacement,tableObstacles,SUPPORT_POLICY } from '../web/support/geometry.js';
import { createSupportController,localAnchorToWorld,worldAnchorToLocal } from '../web/support/controller.js';

function rectangle(x0,z0,x1,z1,y=.75,down=false){
  const a=[x0,y,z0],b=[x0,y,z1],c=[x1,y,z1],d=[x1,y,z0];
  return down?[{a,b:c,c:b},{a,b:d,c}]:[{a,b,c},{a,b:c,c:d}];
}
function prepared(){
  const lampTriangles=[...rectangle(-.04,-.04,.04,.04,0,true),...rectangle(-.04,-.04,.04,.04,.5)];
  const base=analyzeLampBase(lampTriangles).base;
  const lamp={asset:{id:'lamp',sourceFingerprint:'lamp-sha',modelPath:'lamp.gltf'},base,
    mesh:{triangles:lampTriangles,normalization:{targetDesignHeightMeters:.5},bounds:base.bounds}};
  const meshes=[rectangle(-.5,-.5,.5,.5),[...rectangle(-.5,-.5,-.015,.5),...rectangle(.015,-.5,.5,.5),...rectangle(-.015,-.5,.015,-.015),...rectangle(-.015,.015,.015,.5)],
    [...rectangle(-.5,-.5,.5,.5),...rectangle(-.01,-.01,.01,.01,.9)]];
  const tables=meshes.map((triangles,index)=>{
    const analysis=analyzeSurfaces(triangles);
    return {...analysis,asset:{id:'table-'+index,sourceFingerprint:'table-sha-'+index,modelPath:'table-'+index+'.gltf'},
      mesh:{triangles,normalization:{targetDesignHeightMeters:.75},bounds:{min:[-.5,0,-.5],max:[.5,.9,.5]}},
      surfaces:analysis.surfaces.map(s=>({...s,recommendation:recommendPlacement(s,base,{obstacles:tableObstacles(triangles,s)})}))};
  });
  return {policy:SUPPORT_POLICY.version,lamp,tables};
}
function ready(index=0){
  const p=prepared(),controller=createSupportController(p);
  controller.dispatch('selectAsset',{assetId:'table-'+index});
  const usable=p.tables[index].surfaces.find(s=>s.recommendation.valid);
  const result=controller.dispatch('selectSurface',{surfaceId:usable.id});
  assert.equal(result.ok,true);
  return {controller,p,result};
}
const shifted=(state,x,z)=>{const next=structuredClone(state);next.attachment.localAnchor={x,z};return next;};

test('initial analysis waits for explicit candidate selection and exposes source overlays without full source mesh',()=>{
  const p=prepared(),controller=createSupportController(p),result=controller.dispatch('init');
  assert.equal(result.state,null);assert.equal(result.activeAssetId,'table-0');assert.equal(result.status.pendingSurfaceChoice,true);
  assert.equal(controller.dispatch('export').ok,false);
  const publicData=controller.publicAnalysis();
  assert.equal(publicData.tables[0].surfaces[0].triangles.length,2);
  assert.equal(Object.hasOwn(publicData.tables[0],'mesh'),false);
  publicData.tables[0].surfaces[0].height=999;
  assert.equal(controller.publicAnalysis().tables[0].surfaces[0].height,.75);
});
test('pending model choice preserves old scheme and undo restores it without consuming history',()=>{
  const {controller,result}=ready();
  const moved=shifted(result.state,.1,0);
  assert.equal(controller.dispatch('apply',{state:moved,detail:{label:'move',sweep:true}}).ok,true);
  const pending=controller.dispatch('selectAsset',{assetId:'table-1'});
  assert.equal(pending.state,null);assert.equal(pending.status.canUndo,true);
  const back=controller.dispatch('undo');assert.deepEqual(back.state,moved);assert.equal(back.status.canUndo,true);
  const history=controller.dispatch('undo');assert.deepEqual(history.state,result.state);
});
test('explicit selection never falls back from an unusable small candidate to another face',()=>{
  const {controller,p,result}=ready();
  controller.dispatch('selectAsset',{assetId:'table-2'});
  const unusable=p.tables[2].surfaces.find(s=>!s.recommendation.valid);
  assert.ok(unusable);
  const denied=controller.dispatch('selectSurface',{surfaceId:unusable.id});
  assert.equal(denied.ok,false);assert.equal(denied.state,null);assert.equal(denied.activeAssetId,'table-2');
  assert.deepEqual(controller.dispatch('undo').state,result.state);
});
test('switching tables commits the whole new relation and undo/redo restores both assets and anchors',()=>{
  const {controller,p,result}=ready();
  controller.dispatch('selectAsset',{assetId:'table-1'});
  const selected=controller.dispatch('selectSurface',{surfaceId:p.tables[1].surfaces[0].id});
  assert.equal(selected.ok,true);assert.equal(selected.state.table.assetId,'table-1');assert.equal(selected.status.canUndo,true);
  assert.deepEqual(controller.dispatch('undo').state,result.state);
  assert.deepEqual(controller.dispatch('redo').state,selected.state);
});
test('the controller proves translation sweep rather than trusting legal endpoints across a hole',()=>{
  const {controller,result}=ready(1);
  const left=shifted(result.state,-.2,0),right=shifted(result.state,.2,0);
  assert.equal(controller.dispatch('apply',{state:left}).ok,true);
  assert.equal(controller.dispatch('begin',{label:'slide'}).ok,true);
  const denied=controller.dispatch('update',{state:right});
  assert.equal(denied.ok,false);assert.equal(denied.reason,'sweep-uncovered');assert.deepEqual(denied.state,left);
  assert.ok(denied.worldPose);assert.equal(denied.status.invalidPending,true);
  const released=controller.dispatch('commit');assert.equal(released.rolledBack,true);assert.deepEqual(released.state,left);
});
test('failed discrete table scaling preserves its lamp size and full old relation',()=>{
  const {controller,result}=ready();
  const next=structuredClone(result.state);next.table.transform.scale.x=.05;
  const denied=controller.dispatch('apply',{state:next});assert.equal(denied.ok,false);
  assert.deepEqual(denied.state,result.state);assert.equal(denied.worldPose.scale,1);
});
test('common table/lamp planar translation preserves local anchor without sweeping against its own moving obstacles',()=>{
  const {controller,result}=ready();
  const next=structuredClone(result.state);next.table.transform.x=1;next.table.transform.z=-.8;
  controller.dispatch('begin');const moved=controller.dispatch('update',{state:next});
  assert.equal(moved.ok,true);assert.deepEqual(moved.state.attachment,result.state.attachment);
  assert.equal(moved.worldPose.x,1);assert.equal(moved.worldPose.z,-.8);
  assert.equal(controller.dispatch('commit').ok,true);
});
test('table rotation rejects continuous update but is allowed as explicit endpoint submit',()=>{
  const {controller,result}=ready();
  const next=structuredClone(result.state);next.table.transform.yaw=.2;
  controller.dispatch('begin');const denied=controller.dispatch('update',{state:next});
  assert.equal(denied.ok,false);assert.match(denied.reason,/离散提交/);
  controller.dispatch('cancel');const submitted=controller.dispatch('apply',{state:next,detail:{label:'turn',sweep:false}});
  assert.equal(submitted.ok,true);assert.equal(submitted.worldPose.yaw,.2);
});
test('export cancels a preview and serializes its stable baseline; same bytes reopen with full geometry revalidation',()=>{
  const {controller,p,result}=ready();
  controller.dispatch('begin');controller.dispatch('update',{state:shifted(result.state,.1,0)});
  const exported=controller.dispatch('export');assert.equal(exported.ok,true);
  assert.deepEqual(exported.state,result.state);assert.equal(exported.status.transactionActive,false);
  const fresh=createSupportController(p,{savedRaw:exported.rawText}),restored=fresh.dispatch('init');
  assert.deepEqual(restored.state,result.state);assert.deepEqual(restored.worldPose,result.worldPose);
});
test('backup fingerprint, candidate and malformed text rejection retain the current valid scheme',()=>{
  const {controller,result}=ready(),exported=controller.dispatch('export');
  for(const raw of ['{"draft":',JSON.stringify({...JSON.parse(exported.rawText),state:{...result.state,table:{...result.state.table,sha256:'different'}}}),
    JSON.stringify({...JSON.parse(exported.rawText),state:{...result.state,table:{...result.state.table,surfaceId:'unknown'}}})]){
    assert.equal(controller.dispatch('checkBackup',{rawText:raw}).ok,false);
    const denied=controller.dispatch('restore',{rawText:raw});assert.equal(denied.ok,false);assert.deepEqual(denied.state,result.state);assert.ok(denied.worldPose);
  }
});
test('an invalid saved scheme starts pending with its error instead of pretending to restore a default',()=>{
  const controller=createSupportController(prepared(),{savedRaw:'{"draft":'}),result=controller.dispatch('init');
  assert.equal(result.ok,true);assert.equal(result.state,null);assert.ok(result.savedRejected);assert.match(result.reason,/未采用/);
});
test('a table asset cannot masquerade as the lamp even when its registered fingerprint matches',()=>{
  const {controller,result}=ready(),envelope=JSON.parse(controller.dispatch('export').rawText);
  envelope.state.lamp.assetId='table-1';envelope.state.lamp.sha256='table-sha-1';
  const restored=controller.dispatch('restore',{rawText:JSON.stringify(envelope)});
  assert.equal(restored.ok,false);assert.match(restored.reason,/独立底座灯/);assert.deepEqual(restored.state,result.state);
});
test('a valid opened backup ends pending model choice and preserves exact relation',()=>{
  const {controller,result}=ready(),rawText=controller.dispatch('export').rawText;
  controller.dispatch('selectAsset',{assetId:'table-1'});
  const restored=controller.dispatch('restore',{rawText});
  assert.equal(restored.ok,true);assert.deepEqual(restored.state,result.state);assert.equal(restored.activeAssetId,'table-0');
});
test('world/local anchor inversion includes nonuniform table scale and yaw while preserving lamp scale',()=>{
  const transform={x:1,y:.1,z:-.4,yaw:.7,scale:{x:1.4,y:1,z:.6}},local={x:.13,z:-.22};
  const world=localAnchorToWorld(local,transform),inverse=worldAnchorToLocal(world,transform);
  assert.ok(Math.abs(inverse.x-local.x)<1e-12);assert.ok(Math.abs(inverse.z-local.z)<1e-12);
  const {controller,result}=ready(),next=structuredClone(result.state);next.table.transform=transform;next.attachment.localAnchor={x:.1,z:0};next.lamp.scale=.8;
  const submitted=controller.dispatch('apply',{state:next});assert.equal(submitted.ok,true);assert.equal(submitted.worldPose.scale,.8);
  assert.deepEqual([submitted.worldPose.x,submitted.worldPose.z],localAnchorToWorld(next.attachment.localAnchor,transform));
});
