import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fineGeometrySchema, validateFineGeometry, FINE_ASSET_KINDS, FINE_GEOMETRY_FORMAT } from '../web/fine-geometry-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { TREATMENTS } from '../web/scene-completion-core.js';

const plan = JSON.parse(await readFile(new URL('../assets/world-generation-source-plan.json', import.meta.url), 'utf8'));
const targets = source => source.entities.filter(entity => !entity.locked && FINE_ASSET_KINDS.includes(entity.kind));
const base = source => ({ format: 'tidewater-scene-completion.v1', sourceFingerprint: fingerprintPlan(source), title: '确认场景', summary: '保留空间与朝向。', environment: { lighting: 'day', waterColor: '#95d2c4', groundTint: '#ccccb5', sandTint: '#fff4dd', rockTint: '#ccc5b9', exposure: 1, fog: .001, sunAzimuth: 20, sunElevation: 45, seed: 1 }, objects: source.entities.map(entity => ({ id: entity.id, kind: entity.kind, treatment: entity.locked ? 'preserve' : TREATMENTS[entity.kind][0], materialColor: '#ccccb5', accentColor: '#8b6349', roughness: .8, rotationDeg: 0, density: .5, relief: .4, note: '原对象保持。' })) });
const part = (id = 'wall') => ({ id, primitive: 'box', material: 'plaster', center: [0, .5, 0], size: [.8, .8, .8], rotationDeg: [0, 0, 0], points: [], indices: [], repeat: { count: 1, step: [0, 0, 0], turnDeg: [0, 0, 0] }, segments: 12 });
const fixture = (source = plan) => ({ format: FINE_GEOMETRY_FORMAT, sourceFingerprint: fingerprintPlan(source), title: '真实部件候选', summary: '模型自定义形态，待视觉验收。', materials: [{ id: 'plaster', label: '风化灰泥', color: '#eeeecc', roughness: .8, metalness: 0, texture: 'plaster', opacity: 1, emissive: '#000000' }], templates: [{ id: 'shared', label: '测试模板', parts: [part()] }], instances: targets(source).map(entity => ({ entityId: entity.id, templateId: 'shared', rotationDeg: 0 })) });

test('all original eligible IDs are covered and shared templates stay one definition', () => {
  const before = JSON.stringify(plan), result = validateFineGeometry(fixture(), plan, { baseRecipe: base(plan) });
  assert.equal(result.instances.length, targets(plan).length); assert.equal(result.templates.length, 1); assert.equal(JSON.stringify(plan), before);
  const reversed = fixture(); reversed.instances.reverse(); assert.deepEqual(validateFineGeometry(reversed, plan).instances, result.instances);
});
test('schema binds exact source, eligibility and existing instance angles', () => {
  const source = structuredClone(plan); source.entities.find(entity => entity.kind === 'cabin').locked = true;
  const recipe = base(source); recipe.objects.find(object => object.kind === 'lighthouse').rotationDeg = 35;
  const schema = fineGeometrySchema(source, recipe);
  assert.equal(schema.properties.sourceFingerprint.const, fingerprintPlan(source));
  assert.equal(schema.properties.instances.maxItems, targets(source).length);
  assert.equal(schema.properties.instances.items.anyOf.find(item => item.properties.entityId.const === recipe.objects.find(object => object.kind === 'lighthouse').id).properties.rotationDeg.const, 35);
});
test('stale layout and changed confirmed instance angle are rejected', () => {
  const changed = structuredClone(plan); changed.entities.find(entity => entity.kind === 'cabin').points[0].x += .01;
  assert.throws(() => validateFineGeometry(fixture(), changed), /布局已经变化/);
  const value = fixture(); value.instances[0].rotationDeg = 1;
  assert.throws(() => validateFineGeometry(value, plan, { baseRecipe: base(plan) }), /已确认场景朝向/);
});
test('unknown, repeated, omitted and locked source instances are rejected', () => {
  for (const mutation of [value => value.instances.pop(), value => value.instances[1].entityId = value.instances[0].entityId, value => value.instances[0].entityId = plan.entities.find(entity => entity.kind === 'land').id, value => value.instances[0].entityId = 'invented']) {
    const value = fixture(); mutation(value); assert.throws(() => validateFineGeometry(value, plan));
  }
  const locked = structuredClone(plan); locked.entities.find(entity => entity.id === fixture().instances[0].entityId).locked = true;
  const value = fixture(); value.sourceFingerprint = fingerprintPlan(locked); assert.throws(() => validateFineGeometry(value, locked));
});
test('references and duplicated template/material/part IDs cannot create hidden objects', () => {
  for (const mutation of [value => value.instances[0].templateId = 'unknown', value => value.templates[0].parts[0].material = 'remote', value => value.materials.push(structuredClone(value.materials[0])), value => value.templates.push(structuredClone(value.templates[0])), value => value.templates[0].parts.push(structuredClone(value.templates[0].parts[0])), value => value.templates.push({ ...structuredClone(value.templates[0]), id: 'unused' })]) {
    const value = fixture(); mutation(value); assert.throws(() => validateFineGeometry(value, plan));
  }
});
test('expanded budget counts repetitions for every instance of reused templates', () => {
  const value = fixture(), count = Math.ceil(2501 / (value.instances.length * 64));
  value.templates[0].parts = Array.from({ length: count }, (_, index) => ({ ...part(`detail-${index}`), repeat: { count: 64, step: [0, 0, 0], turnDeg: [0, 0, 0] } }));
  assert.throws(() => validateFineGeometry(value, plan), /2500/);
});
test('outlying repeated centers, invalid sizes, non-finite values and unsupported primitives fail', () => {
  for (const mutation of [value => value.templates[0].parts[0].repeat = { count: 20, step: [.1, 0, 0], turnDeg: [0, 0, 0] }, value => value.templates[0].parts[0].size[0] = 0, value => value.templates[0].parts[0].center[1] = -.3, value => value.templates[0].parts[0].rotationDeg[1] = Infinity, value => value.templates[0].parts[0].primitive = 'execute-code', value => value.templates[0].parts[0].segments = 49, value => value.templates[0].parts[0].repeat.count = 1.5]) {
    const value = fixture(); mutation(value); assert.throws(() => validateFineGeometry(value, plan));
  }
});
test('custom meshes require real complete non-degenerate triangles and valid indices', () => {
  const value = fixture(), mesh = value.templates[0].parts[0]; mesh.primitive = 'mesh'; mesh.points = [[-.5, 0, 0], [.5, 0, 0], [0, 1, 0]]; mesh.indices = [0, 1, 2];
  assert.equal(validateFineGeometry(value, plan).templates[0].parts[0].primitive, 'mesh');
  for (const indices of [[0, 1], [0, 1, 3], [0, 0, 2]]) { const next = structuredClone(value); next.templates[0].parts[0].indices = indices; assert.throws(() => validateFineGeometry(next, plan)); }
  const flat = structuredClone(value); flat.templates[0].parts[0].points[2] = [0, 0, 0]; assert.throws(() => validateFineGeometry(flat, plan), /退化/);
});
test('curve, leaf and lathe inputs reject degeneracy and unusable profile semantics', () => {
  for (const primitive of ['curved-tube', 'leaf', 'lathe']) {
    const value = fixture(); value.templates[0].parts[0].primitive = primitive; assert.throws(() => validateFineGeometry(value, plan));
  }
  const value = fixture(), shape = value.templates[0].parts[0]; shape.primitive = 'lathe'; shape.points = [[.2, -.5, 0], [.4, .5, 0]]; assert.doesNotThrow(() => validateFineGeometry(value, plan));
  shape.points[0][0] = -.2; assert.throws(() => validateFineGeometry(value, plan), /非负半径/);
  shape.primitive = 'leaf'; shape.points = [[0, 0, 0], [.4, .5, 0], [0, .8, 0]]; assert.doesNotThrow(() => validateFineGeometry(value, plan));
});
test('malicious getters, cycles, extra URLs and sparse arrays fail without invoking values', () => {
  let calls = 0; const getter = fixture(); Object.defineProperty(getter.templates[0].parts[0], 'code', { enumerable: true, get() { calls++; return 'alert(1)'; } });
  assert.throws(() => validateFineGeometry(getter, plan)); assert.equal(calls, 0);
  const cycle = fixture(); cycle.templates[0].parts[0].points.push(cycle); assert.throws(() => validateFineGeometry(cycle, plan));
  const url = fixture(); url.materials[0].textureUrl = 'https://untrusted.invalid/x'; assert.throws(() => validateFineGeometry(url, plan), /未知/);
  const sparse = fixture(); sparse.templates[0].parts[0].center = Array(3); assert.throws(() => validateFineGeometry(sparse, plan), /连续数组/);
});
test('point counts and texture kinds are bounded, and source containing only locked objects stops', () => {
  const value = fixture(); value.templates[0].parts[0].points = Array.from({ length: 257 }, () => [0, 0, 0]); assert.throws(() => validateFineGeometry(value, plan), /预算/);
  value.templates[0].parts[0].points = []; value.materials[0].texture = 'remote-image'; assert.throws(() => validateFineGeometry(value, plan), /纹理/);
  const locked = structuredClone(plan); locked.entities.forEach(entity => { entity.locked = true; }); assert.throws(() => fineGeometrySchema(locked), /未锁定物体/);
});
