import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FINE_GEOMETRY_FORMAT, FINE_GEOMETRY_PATCH_FORMAT, FINE_ASSET_KINDS, fineGeometryPatchSchema, validateFineGeometry, validateFineScope, validateFineGeometryPatch, mergeFineGeometryPatch } from '../web/fine-geometry-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { TREATMENTS } from '../web/scene-completion-core.js';
const plan = JSON.parse(await readFile(new URL('../assets/world-generation-source-plan.json', import.meta.url), 'utf8'));
const targets = plan.entities.filter(entity => !entity.locked && FINE_ASSET_KINDS.includes(entity.kind));
const targetId = targets[0].id;
const material = (id = 'shared-material') => ({ id, label: '原材质', color: '#ddddbb', roughness: .8, metalness: 0, texture: 'wood', opacity: 1, emissive: '#000000' });
const part = (id = 'body', materialId = 'shared-material') => ({ id, primitive: 'box', material: materialId, center: [0, .5, 0], size: [.6, .6, .6], rotationDeg: [0, 0, 0], points: [], indices: [], repeat: { count: 1, step: [0, 0, 0], turnDeg: [0, 0, 0] }, segments: 8 });
const previous = () => ({ format: FINE_GEOMETRY_FORMAT, sourceFingerprint: fingerprintPlan(plan), title: '已确认原场景', summary: '原实例共享模板和材料。', materials: [material()], templates: [{ id: 'shared', label: '原共享模板', parts: [part()] }], instances: targets.map(entity => ({ entityId: entity.id, templateId: 'shared', rotationDeg: 0 })) });
const patch = () => ({ format: FINE_GEOMETRY_PATCH_FORMAT, sourceFingerprint: fingerprintPlan(plan), title: '局部精修', summary: '仅调整一个原物体。', materials: [material()], templates: [{ id: 'shared', label: '原共享模板', parts: [part()] }], instances: [{ entityId: targetId, templateId: 'shared', rotationDeg: 0 }] });
const base = () => ({ format: 'tidewater-scene-completion.v1', sourceFingerprint: fingerprintPlan(plan), title: '原外观', summary: '确认外观。', environment: { lighting: 'day', waterColor: '#95d2c4', groundTint: '#ccccb5', sandTint: '#fff4dd', rockTint: '#ccc5b9', exposure: 1, fog: .001, sunAzimuth: 20, sunElevation: 45, seed: 1 }, objects: plan.entities.map(entity => ({ id: entity.id, kind: entity.kind, treatment: entity.locked ? 'preserve' : TREATMENTS[entity.kind][0], materialColor: '#ccccb5', accentColor: '#8b6349', roughness: .8, rotationDeg: 0, density: .5, relief: .4, note: '保留。' })) });
const outside = (bundle, scope) => {
  const instances = bundle.instances.filter(instance => !scope.includes(instance.entityId)), templateIds = new Set(instances.map(instance => instance.templateId));
  const templates = bundle.templates.filter(template => templateIds.has(template.id)), materialIds = new Set(templates.flatMap(template => template.parts.map(item => item.material)));
  return { instances, templates, materials: bundle.materials.filter(item => materialIds.has(item.id)) };
};

test('local schema covers only exact eligible scope while retaining full source fingerprint', () => {
  const schema = fineGeometryPatchSchema(plan, previous(), [targetId], base());
  assert.equal(schema.properties.format.const, FINE_GEOMETRY_PATCH_FORMAT); assert.equal(schema.properties.sourceFingerprint.const, fingerprintPlan(plan));
  assert.equal(schema.properties.instances.maxItems, 1); assert.equal(schema.properties.instances.items.anyOf[0].properties.entityId.const, targetId); assert.equal(schema.properties.materials.minItems, 0);
});
test('shared template and changed shared material are isolated, with outside records strictly equal', () => {
  const old = previous(), local = patch(), before = JSON.stringify(old); local.materials[0].color = '#123456'; local.templates[0].parts[0].size[0] = .9;
  const result = mergeFineGeometryPatch(old, local, plan, [targetId], { baseRecipe: base() });
  assert.deepEqual(outside(result, [targetId]), outside(old, [targetId])); assert.equal(JSON.stringify(old), before);
  const changed = result.instances.find(instance => instance.entityId === targetId); assert.notEqual(changed.templateId, 'shared');
  const changedTemplate = result.templates.find(template => template.id === changed.templateId); assert.notEqual(changedTemplate.parts[0].material, 'shared-material');
  assert.equal(result.materials.find(item => item.id === changedTemplate.parts[0].material).color, '#123456');
});
test('unchanged shared definitions are reused and old scoped-only dependencies are removed', () => {
  const unchanged = mergeFineGeometryPatch(previous(), patch(), plan, [targetId]); assert.equal(unchanged.templates.length, 1); assert.equal(unchanged.materials.length, 1);
  const old = previous(); old.templates.push({ id: 'scope-old', label: '只属局部', parts: [part('scope-part', 'scope-material')] }); old.materials.push(material('scope-material')); old.instances[0].templateId = 'scope-old';
  const local = patch(); local.materials = []; local.templates[0].parts[0].size[0] = .9;
  const result = mergeFineGeometryPatch(old, local, plan, [targetId]); assert.ok(!result.templates.some(template => template.id === 'scope-old')); assert.ok(!result.materials.some(item => item.id === 'scope-material')); assert.deepEqual(outside(result, [targetId]), outside(old, [targetId]));
});
test('local patch can borrow verified materials but unknown references and outside objects fail', () => {
  const local = patch(); local.materials = []; assert.doesNotThrow(() => validateFineGeometryPatch(local, plan, previous(), [targetId]));
  local.templates[0].parts[0].material = 'unknown'; assert.throws(() => validateFineGeometryPatch(local, plan, previous(), [targetId]), /未知材质/);
  const wrong = patch(); wrong.instances[0].entityId = targets[1].id; assert.throws(() => validateFineGeometryPatch(wrong, plan, previous(), [targetId]), /一一对应/);
  wrong.instances[0].entityId = targetId; wrong.instances.push({ entityId: targets[1].id, templateId: 'shared', rotationDeg: 0 }); assert.throws(() => validateFineGeometryPatch(wrong, plan, previous(), [targetId]));
});
test('local selection rejects locked/region/missing/repeated entities and stale geometry', () => {
  for (const scope of [[], [targetId, targetId], [plan.entities.find(entity => entity.kind === 'land').id], ['missing']]) assert.throws(() => validateFineScope(plan, scope));
  const locked = structuredClone(plan); locked.entities.find(entity => entity.id === targetId).locked = true; assert.throws(() => validateFineScope(locked, [targetId]), /未锁定/);
  const stale = previous(); stale.sourceFingerprint += 'old'; assert.throws(() => fineGeometryPatchSchema(plan, stale, [targetId]), /布局已经变化/);
  const rotated = patch(); rotated.instances[0].rotationDeg = 45; assert.throws(() => validateFineGeometryPatch(rotated, plan, previous(), [targetId]), /朝向/);
});
test('full-scene budgets are enforced after merging even when the local patch alone fits', () => {
  const local = patch(); local.templates[0].parts = Array.from({ length: 39 }, (_, index) => ({ ...part(`many-${index}`), repeat: { count: 64, step: [0, 0, 0], turnDeg: [0, 0, 0] } }));
  assert.doesNotThrow(() => validateFineGeometryPatch(local, plan, previous(), [targetId])); assert.throws(() => mergeFineGeometryPatch(previous(), local, plan, [targetId]), /2500/);
  const old = previous(); old.materials = Array.from({ length: 16 }, (_, index) => material(`original-${index}`)); old.templates[0].parts = old.materials.map((item, index) => part(`original-part-${index}`, item.id));
  const materialPatch = patch(); materialPatch.materials = [material('extra')]; materialPatch.templates[0].parts[0].material = 'extra';
  assert.throws(() => mergeFineGeometryPatch(old, materialPatch, plan, [targetId]), /材质.*预算/);
});
test('all-object refinement remains a valid local protocol and existing stored full bundles still validate', () => {
  const local = patch(); local.instances = previous().instances; local.materials = []; local.templates[0].parts[0].size[0] = .9;
  const result = mergeFineGeometryPatch(previous(), local, plan, targets.map(entity => entity.id)); assert.equal(result.templates.length, 1); assert.equal(result.instances.length, targets.length); assert.equal(result.templates[0].parts[0].size[0], .9);
  assert.doesNotThrow(() => validateFineGeometry(previous(), plan, { baseRecipe: base() }));
});
test('ribbon is a continuous non-degenerate pair strip, not an inferred polygon or thick leaf', () => {
  const value = previous(), strip = value.templates[0].parts[0]; strip.primitive = 'ribbon'; strip.points = [[0, 0, -.1], [0, 0, .1], [.4, .1, -.15], [.4, .1, .15], [.8, -.3, -.03], [.8, -.3, .03]];
  assert.doesNotThrow(() => validateFineGeometry(value, plan)); const short = structuredClone(value); short.templates[0].parts[0].points = strip.points.slice(0, 4); assert.doesNotThrow(() => validateFineGeometry(short, plan));
  for (const mutation of [points => points.pop(), points => { points[1] = points[0]; }, points => { points[2] = points[0]; points[3] = points[1]; }, points => { points[2] = points[1]; }]) { const next = structuredClone(value); mutation(next.templates[0].parts[0].points); assert.throws(() => validateFineGeometry(next, plan), /ribbon/); }
  const bad = structuredClone(value); bad.templates[0].parts[0].indices = [0, 1, 2]; assert.throws(() => validateFineGeometry(bad, plan), /只有 mesh/);
});
