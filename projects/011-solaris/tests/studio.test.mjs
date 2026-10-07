import test from 'node:test';
import assert from 'node:assert/strict';
import { History, initialProject, updateObject, worldPosition, validateProject, parseCommand, clone, definition, dimensions, sceneObjects, resizeObject, duplicateObject, removeObject, restoreObject, replaceTable, advanceGuide } from '../web/studio/core.js';

test('a continuous drag commits one command and cancels without an entry', () => {
  const h = new History(initialProject()); const start = clone(h.current);
  h.begin('移动植物');
  for (const x of [1.9, 1.8, 1.7]) updateObject(h.current, 'plant', { x });
  assert.equal(h.commit(), true); assert.equal(h.past.length, 1);
  const edited = clone(h.current); h.undo(); assert.deepEqual(h.current, start); h.redo(); assert.deepEqual(h.current, edited);
  h.begin('缩放植物'); updateObject(h.current, 'plant', { scale: 1.4 }); h.cancel(); assert.deepEqual(h.current, edited); assert.equal(h.past.length, 1);
});
test('moving and rotating the table preserves its lamp relationship', () => {
  const p = initialProject(); updateObject(p, 'table', { x: -.5, z: .3, rotation: Math.PI / 2 }, false);
  const lamp = worldPosition(p, 'lamp'); assert.ok(Math.abs(lamp.x - (p.objects.table.x + p.objects.lamp.z)) < 1e-8);
  assert.ok(Math.abs(lamp.z - (p.objects.table.z - p.objects.lamp.x)) < 1e-8);
  updateObject(p, 'lamp', { x: 100, z: -100, y: 99 });
  const c = Math.abs(Math.cos(p.objects.lamp.rotation)), s = Math.abs(Math.sin(p.objects.lamp.rotation));
  const lampSize = definition('lamp'), table = definition('table');
  assert.equal(p.objects.lamp.x, table.width / 2 - (lampSize.width * c + lampSize.depth * s) / 2);
  assert.equal(p.objects.lamp.z, -table.depth / 2 + (lampSize.depth * c + lampSize.width * s) / 2); assert.equal(p.objects.lamp.y, .43);
});
test('room and wall constraints keep edit anchors valid', () => {
  const p = initialProject(); updateObject(p, 'art', { x: 999, y: 99, z: 5, rotation: 3, scale: 20 });
  assert.equal(p.objects.art.z, -2.42); assert.equal(p.objects.art.rotation, 0); assert.equal(p.objects.art.scale, 1.3);
  assert.ok(p.objects.art.y < 3.05); updateObject(p, 'plant', { x: -999, z: 999 }, false); assert.ok(p.objects.plant.x > -3); assert.ok(p.objects.plant.z < 2.5);
});
test('occupied positions are rejected without changing the object', () => {
  const p = initialProject(), before = clone(p.objects.chair);
  const result = updateObject(p, 'chair', { x: p.objects.sofa.x, z: p.objects.sofa.z });
  assert.equal(result.blocked, true); assert.deepEqual(p.objects.chair, before);
});
test('saved states round trip and reject remote or non-finite input', () => {
  const p = initialProject(); p.environment.hour = 18.5; p.objects.sofa.color = 'clay';
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  const bad = clone(p); bad.objects.art.customImage = 'https://remote.invalid/private.jpg'; assert.throws(() => validateProject(bad));
  const nan = clone(p); nan.objects.sofa.x = NaN; assert.throws(() => validateProject(nan));
  const broken = clone(p); delete broken.objects.plant; assert.throws(() => validateProject(broken));
});
test('limited commands are explicit, local and reject unsupported requests', () => {
  assert.deepEqual(parseCommand('沙发向右移动20厘米'), { kind: 'move', id: 'sofa', direction: '右', distance: .2 });
  assert.deepEqual(parseCommand('沙发换成苔绿'), { kind: 'color', id: 'sofa', color: 'sage' });
  assert.deepEqual(parseCommand('切换傍晚'), { kind: 'hour', hour: 18 });
  assert.throws(() => parseCommand('自动生成一套未来城市'));
});
test('failed transactions revert partial state changes', () => {
  const h = new History(initialProject()), original = clone(h.current);
  assert.throws(() => h.run('无效操作', p => { p.environment.hour = 20; updateObject(p, 'sofa', { color: 'unknown' }); }));
  assert.deepEqual(h.current, original); assert.equal(h.past.length, 0);
});

test('boundary placements survive validation before any model has loaded', () => {
  const p = initialProject();
  updateObject(p, 'plant', { x: 999, z: -999, scale: 1.6, rotation: .54 }, false);
  updateObject(p, 'lamp', { x: 999, z: 999 });
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});

test('turning the lamp near a table edge keeps every footprint corner on the surface', () => {
  const p = initialProject();
  updateObject(p, 'lamp', { x: 999, z: 999 });
  updateObject(p, 'lamp', { rotation: Math.PI / 4 });
  const v = p.objects.lamp, d = definition('lamp'), table = definition('table');
  for (const x of [-d.width / 2, d.width / 2]) for (const z of [-d.depth / 2, d.depth / 2]) {
    const px = v.x + x * Math.cos(v.rotation) + z * Math.sin(v.rotation);
    const pz = v.z - x * Math.sin(v.rotation) + z * Math.cos(v.rotation);
    assert.ok(Math.abs(px) <= table.width / 2 + 1e-10);
    assert.ok(Math.abs(pz) <= table.depth / 2 + 1e-10);
  }
});

test('seating can grow and shrink while keeping floor anchors and saved dimensions', () => {
  const h = new History(initialProject()), original = clone(h.current);
  h.run('家具尺寸', p => {
    assert.equal(updateObject(p, 'sofa', { scale: 1.2 }).changed, true);
    assert.equal(updateObject(p, 'chair', { scale: 1.4 }).changed, true);
  });
  assert.equal(h.current.objects.sofa.scale, 1.2);
  assert.equal(h.current.objects.chair.scale, 1.4);
  assert.equal(worldPosition(h.current, 'sofa').y, 0);
  assert.equal(worldPosition(h.current, 'chair').y, 0);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(h.current))), h.current);
  h.undo(); assert.deepEqual(h.current, original); h.redo();
  updateObject(h.current, 'sofa', { scale: .6 });
  assert.equal(h.current.objects.sofa.scale, .6);
});

test('growing furniture into an occupied footprint is rejected', () => {
  const p = initialProject(); updateObject(p, 'chair', { x: .7, z: .44 });
  const before = clone(p.objects.chair);
  const result = updateObject(p, 'chair', { scale: 1.6 });
  assert.equal(result.blocked, true); assert.deepEqual(p.objects.chair, before);
});

test('resizing a table preserves lamp attachment, surface height and footprint', () => {
  const p = initialProject(); updateObject(p, 'table', { scale: 1.3 });
  const table = definition('table'), lamp = definition('lamp');
  const position = worldPosition(p, 'lamp');
  assert.ok(Math.abs(position.x - (p.objects.table.x + p.objects.lamp.x * 1.3)) < 1e-10);
  assert.equal(position.y, table.height * 1.3);
  updateObject(p, 'lamp', { rotation: Math.PI / 4, scale: 1.6, x: 999, z: 999 });
  updateObject(p, 'table', { scale: .6 });
  const v = p.objects.lamp, parent = p.objects.table;
  assert.equal(worldPosition(p, 'lamp').y, table.height * .6);
  assert.ok(v.scale < 1.6);
  for (const x of [-lamp.width / 2, lamp.width / 2]) for (const z of [-lamp.depth / 2, lamp.depth / 2]) {
    const px = v.x * parent.scale + (x * Math.cos(v.rotation) + z * Math.sin(v.rotation)) * v.scale;
    const pz = v.z * parent.scale + (-x * Math.sin(v.rotation) + z * Math.cos(v.rotation)) * v.scale;
    assert.ok(Math.abs(px) <= table.width * parent.scale / 2 + 1e-10);
    assert.ok(Math.abs(pz) <= table.depth * parent.scale / 2 + 1e-10);
  }
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});

test('large rotated floor objects stay completely inside room boundaries', () => {
  const p = initialProject(); updateObject(p, 'rug', { rotation: Math.PI / 4, scale: 1.6, x: 999, z: -999 });
  const v = p.objects.rug, d = definition('rug');
  for (const x of [-d.width / 2, d.width / 2]) for (const z of [-d.depth / 2, d.depth / 2]) {
    assert.ok(Math.abs(v.x + (x * Math.cos(v.rotation) + z * Math.sin(v.rotation)) * v.scale) <= 2.87 + 1e-10);
    assert.ok(Math.abs(v.z + (-x * Math.sin(v.rotation) + z * Math.cos(v.rotation)) * v.scale) <= 2.37 + 1e-10);
  }
});

test('version one projects migrate without losing saved edits or attachments', () => {
  const old = initialProject(); old.version = 1; old.objects.chair.scale = 1.35;
  for (const value of Object.values(old.objects)) { delete value.kind; delete value.stretch; delete value.hidden; delete value.variant; }
  const migrated = validateProject(old);
  assert.equal(migrated.version, 2); assert.equal(migrated.objects.chair.scale, 1.35);
  assert.deepEqual(migrated.objects.chair.stretch, {x:1,y:1,z:1});
  assert.equal(worldPosition(migrated, 'lamp').y, dimensions(migrated, 'table').height);
});

test('independent axes change actual dimensions, retain bounds and reject occupied space', () => {
  const p = initialProject(), before = dimensions(p, 'chair');
  assert.equal(resizeObject(p, 'chair', 'y', 1.4).blocked, false);
  assert.equal(dimensions(p, 'chair').height, 1.4); assert.equal(dimensions(p, 'chair').width, before.width);
  updateObject(p, 'chair', { x:.7 }); const snapshot = clone(p.objects.chair);
  assert.equal(resizeObject(p, 'chair', 'x', 1.29).blocked, true); assert.deepEqual(p.objects.chair, snapshot);
  resizeObject(p, 'rug', 'x', 99); updateObject(p,'rug',{rotation:Math.PI/4,x:999,z:999});
  const v=p.objects.rug, size=dimensions(p,'rug');
  const hx=(size.width*Math.abs(Math.cos(v.rotation))+size.depth*Math.abs(Math.sin(v.rotation)))/2;
  assert.ok(v.x+hx<=2.87+1e-10);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});

test('nonuniform table dimensions keep lamp world position and rotated footprint valid', () => {
  const p=initialProject(); resizeObject(p,'table','x',.5); resizeObject(p,'table','y',.6); resizeObject(p,'table','z',1.6);
  updateObject(p,'table',{rotation:.7}); updateObject(p,'lamp',{rotation:.8,x:999,z:999,scale:1.6});
  assert.equal(worldPosition(p,'lamp').y,dimensions(p,'table').height);
  const v=p.objects.lamp, t=p.objects.table, d=dimensions(p,'lamp'), size=dimensions(p,'table');
  for(const x of [-d.width/2,d.width/2])for(const z of [-d.depth/2,d.depth/2]){
    const px=v.x*t.scale*t.stretch.x+x*Math.cos(v.rotation)+z*Math.sin(v.rotation);
    const pz=v.z*t.scale*t.stretch.z-x*Math.sin(v.rotation)+z*Math.cos(v.rotation);
    assert.ok(Math.abs(px)<=size.width/2+1e-10);assert.ok(Math.abs(pz)<=size.depth/2+1e-10);
  }
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});

test('duplicates have independent state, free placement, saved identity and one undo entry', () => {
  const h=new History(initialProject());let id;
  h.run('复制阅读椅',p=>id=duplicateObject(p,'chair'));
  assert.equal(id,'chair-2');assert.equal(sceneObjects(h.current).length,8);
  assert.notDeepEqual(worldPosition(h.current,id),worldPosition(h.current,'chair'));
  updateObject(h.current,id,{color:'clay'});assert.equal(h.current.objects.chair.color,'sage');
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(h.current))),h.current);
  h.undo();assert.equal(h.current.objects[id],undefined);h.redo();assert.equal(h.current.objects[id].color,'clay');
});

test('copying and removing a table includes its lamp; restoring honors parent availability', () => {
  const h=new History(initialProject());let id;
  h.run('复制茶几',p=>id=duplicateObject(p,'table'));
  const child=sceneObjects(h.current).find(d=>d.parent===id);
  assert.ok(child);assert.equal(worldPosition(h.current,child.id).y,dimensions(h.current,id).height);
  h.run('移除组合',p=>removeObject(p,id));assert.equal(h.current.objects[child.id].hidden,true);
  assert.throws(()=>h.run('错误恢复',p=>restoreObject(p,child.id)),/先恢复/);
  h.undo();assert.equal(h.current.objects[id].hidden,false);assert.equal(h.current.objects[child.id].hidden,false);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(h.current))),h.current);
});

test('hidden objects free space and restoration cannot silently overlap another object', () => {
  const h=new History(initialProject());h.run('移除沙发',p=>removeObject(p,'sofa'));
  h.run('占用原位置',p=>updateObject(p,'chair',{x:p.objects.sofa.x,z:p.objects.sofa.z}));
  const before=clone(h.current);
  assert.throws(()=>h.run('恢复沙发',p=>restoreObject(p,'sofa')),/原位置/);
  assert.deepEqual(h.current,before);
});

test('local table replacement preserves light attachment and is reversible', () => {
  const h=new History(initialProject()),pos=worldPosition(h.current,'table');
  h.run('替换茶几',p=>replaceTable(p,'table','solid'));
  assert.equal(definition('table',h.current).asset,'modern_coffee_table_02');assert.deepEqual(worldPosition(h.current,'table'),pos);
  assert.equal(worldPosition(h.current,'lamp').y,dimensions(h.current,'table').height);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(h.current))),h.current);
  h.undo();assert.equal(h.current.objects.table.variant,'glass');
});

test('project imports reject arbitrary templates, missing parents and nonfinite axis sizes', () => {
  for(const mutate of [p=>p.objects.chair.kind='unknown',p=>p.objects.chair.stretch.x=NaN,p=>p.objects.table.variant='remote',p=>p.objects.lamp.parent='table-99']){
    const p=initialProject();mutate(p);assert.throws(()=>validateProject(p));
  }
  const p=initialProject();p.objects.sofa.secret='discard-me';assert.equal(validateProject(p).objects.sofa.secret,undefined);
});

test('guided workflow persists validated progress and does not count unrelated edits', () => {
  const p=initialProject();assert.equal(advanceGuide(p,'移动对象'),false);
  p.guide.enabled=true;assert.equal(advanceGuide(p,'移动对象'),true);assert.equal(advanceGuide(p,'移动对象'),false);
  assert.equal(advanceGuide(p,'复制对象'),false);advanceGuide(p,'调整独立尺寸');advanceGuide(p,'保存方案');
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).guide,p.guide);
  p.guide.completed.push('unknown');assert.throws(()=>validateProject(p),/教程/);
});
