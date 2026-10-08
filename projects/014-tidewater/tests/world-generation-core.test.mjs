import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlan } from '../web/creation-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { createAssetJob, transitionAssetJob } from '../web/asset-generation-core.js';
import { createWorldRecipe, validateWorldRecipe, transitionWorldTask, worldBindingMatchesSource, assertWorldApplicable, summarizeWorldRecipe, confirmedAssetChecksum } from '../web/world-generation-core.js';

const copy = value => structuredClone(value);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const asset = (kind = 'cabin', method = 'neural-3d') => ({
  id: `verified-${kind}`, kind, method, url: `/assets/neural/${kind}-generated.glb`, referenceUrl: `/assets/neural/${kind}-reference.png`,
  rotationY: Math.PI / 2, bytes: 4859472, sha256: 'c27086b4b585e3a9a90f969cb51d6df570526f8e720c4d696fa937c650bcc435',
  provenance: { provider: 'Official provider from receipt', model: 'Actual model version', taskId: method === 'neural-3d' ? 'actual-task-id' : null, license: 'Model MIT; output provenance recorded', source: 'https://example.org/official-provider' },
});
function output(task) { return { entityId: task.entityId, method: task.source.method, assetId: task.source.assetId, triangles: task.source.method === 'procedural-geometry' ? null : 98320 }; }
function finish(recipe) {
  let result = copy(recipe);
  for (const original of recipe.tasks.filter(task => task.status === 'pending')) {
    result = transitionWorldTask(result, original.entityId, 'running');
    result = transitionWorldTask(result, original.entityId, 'succeeded', { output: output(original) });
  }
  return result;
}

test('the recipe preserves every authored entity, polygon, height, world coordinate and lock without modifying its inputs', () => {
  const plan = freeze(createDemoPlan()), catalog = freeze([asset()]), planBefore = copy(plan), catalogBefore = copy(catalog);
  const recipe = createWorldRecipe(plan, catalog);
  assert.deepEqual(plan, planBefore); assert.deepEqual(catalog, catalogBefore);
  assert.equal(recipe.sourceFingerprint, fingerprintPlan(plan)); assert.deepEqual(recipe.sourcePlan, plan);
  assert.deepEqual(recipe.tasks.map(task => task.sourceEntity), plan.entities);
  for (const task of recipe.tasks) {
    assert.equal(task.entityId, task.sourceEntity.id); assert.equal(task.placement.height, task.sourceEntity.height);
    assert.deepEqual(task.placement.points, task.sourceEntity.points.map(point => ({ x: (point.x - .5) * plan.world.width, z: (point.y - .5) * plan.world.depth })));
  }
  recipe.sourcePlan.entities[0].height = 9; assert.equal(plan.entities[0].height, planBefore.entities[0].height);
});

test('one explicit generated kind asset can serve multiple objects without claiming multiple model executions', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]), summary = summarizeWorldRecipe(recipe);
  const cabins = recipe.tasks.filter(task => task.kind === 'cabin');
  assert.equal(cabins.length, 2); assert.equal(new Set(cabins.map(task => task.source.assetId)).size, 1);
  assert.equal(summary.neuralBound, 2); assert.equal(summary.neuralReady, 0);
  assert.equal(summary.uniqueAssets, 1); assert.equal(summary.reusableInstances, 2);
  assert.equal(cabins[0].source.provenance.taskId, cabins[1].source.provenance.taskId);
  for (const cabin of cabins) assert.deepEqual(cabin.placement.spec, createAssetJob(recipe.sourcePlan, cabin.entityId, { id: 'world-spec' }).spec);
});

test('missing fine assets remain a truthful capability gap and keep the previous program geometry', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]);
  const summary = summarizeWorldRecipe(recipe);
  assert.equal(summary.awaitingAsset, 4); assert.equal(summary.capabilityGaps.length, 3);
  for (const task of recipe.tasks.filter(task => task.status === 'awaiting-asset')) {
    assert.equal(task.source.method, 'procedural-geometry'); assert.equal(task.output, null);
    assert.throws(() => transitionWorldTask(recipe, task.entityId, 'running'), /不能/);
    assert.throws(() => transitionWorldTask(recipe, task.entityId, 'succeeded', { output: output(task) }), /不能/);
  }
});

test('all four asset kinds receive distinct references and source provenance', () => {
  const catalog = ['cabin', 'lighthouse', 'palm', 'boat'].map(kind => asset(kind));
  const recipe = createWorldRecipe(createDemoPlan(), catalog);
  assert.equal(recipe.capabilityGaps.length, 0);
  for (const task of recipe.tasks.filter(task => task.placement.spec)) {
    assert.equal(task.source.method, 'neural-3d'); assert.equal(task.source.assetId, `verified-${task.kind}`);
    assert.equal(task.source.url, `/assets/neural/${task.kind}-generated.glb`);
  }
});

test('locked objects stay preserved even when a generated asset is available for their kind', () => {
  const plan = createDemoPlan(); plan.entities.find(entity => entity.id === 'cabin-west').locked = true;
  const recipe = createWorldRecipe(plan, [asset()]), task = recipe.tasks.find(item => item.entityId === 'cabin-west');
  assert.equal(task.status, 'preserved'); assert.equal(task.source.method, 'coarse-preserved'); assert.equal(task.placement.spec, null);
  assert.equal(summarizeWorldRecipe(recipe).locked, 1);
  assert.throws(() => transitionWorldTask(recipe, task.entityId, 'running'), /不能/);
  const modified = copy(recipe); modified.tasks.find(item => item.entityId === task.entityId).status = 'succeeded';
  assert.throws(() => validateWorldRecipe(modified), /锁定或缺少/);
});

test('real scan sources remain distinct from neural assets in readiness counts', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset('palm', 'scanned-asset')]);
  const complete = finish(recipe), summary = summarizeWorldRecipe(complete);
  assert.equal(summary.scannedBound, 2); assert.equal(summary.scannedReady, 2);
  assert.equal(summary.neuralReady, 0); assert.equal(summary.neuralBound, 0);
  assert.equal(complete.tasks.find(task => task.kind === 'palm').source.provenance.taskId, null);
});

test('successful neural imports require an actual nonempty mesh receipt tied to the correct entity and asset', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]), task = recipe.tasks.find(item => item.kind === 'cabin');
  assert.throws(() => transitionWorldTask(recipe, task.entityId, 'succeeded', { output: output(task) }), /不能/);
  const running = transitionWorldTask(recipe, task.entityId, 'running');
  assert.throws(() => transitionWorldTask(running, task.entityId, 'succeeded'), /实际载入/);
  for (const change of [
    value => { value.triangles = 0; }, value => { delete value.triangles; }, value => { value.triangles = Infinity; },
    value => { value.entityId = 'cabin-east'; }, value => { value.assetId = 'fake'; }, value => { value.method = 'procedural-geometry'; },
  ]) { const receipt = output(task); change(receipt); assert.throws(() => transitionWorldTask(running, task.entityId, 'succeeded', { output: receipt })); }
  const succeeded = transitionWorldTask(running, task.entityId, 'succeeded', { output: output(task) });
  assert.equal(summarizeWorldRecipe(succeeded).neuralReady, 1);
  assert.equal(recipe.tasks.find(item => item.entityId === task.entityId).status, 'pending');
});

test('failure remains visible and retry requires a new real running event', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]), task = recipe.tasks.find(item => item.kind === 'cabin');
  const failed = transitionWorldTask(transitionWorldTask(recipe, task.entityId, 'running'), task.entityId, 'failed', { error: 'GLB texture fetch failed' });
  assert.equal(summarizeWorldRecipe(failed).failed, 1); assert.equal(failed.tasks.find(item => item.entityId === task.entityId).error, 'GLB texture fetch failed');
  assert.throws(() => assertWorldApplicable(failed, recipe.sourcePlan), /待处理或失败/);
  const retry = transitionWorldTask(failed, task.entityId, 'running');
  assert.equal(retry.tasks.find(item => item.entityId === task.entityId).error, null);
  assert.throws(() => transitionWorldTask(failed, task.entityId, 'succeeded', { output: output(task) }), /不能/);
});

test('confirmation requires matching source and actual completion while explicit gaps retain old geometry', () => {
  const plan = createDemoPlan(), recipe = createWorldRecipe(plan, [asset()]);
  assert.throws(() => assertWorldApplicable(recipe, plan), /待处理/);
  const ready = finish(recipe); assert.equal(assertWorldApplicable(ready, plan).sourceFingerprint, recipe.sourceFingerprint);
  assert.equal(summarizeWorldRecipe(ready).awaitingAsset, 4);
  for (const change of [
    source => { source.entities[0].points[0].x += .01; }, source => { source.entities[3].height += 1; },
    source => { source.entities[3].locked = true; }, source => { source.entities.pop(); }, source => { source.intent = 'new requirement'; },
  ]) { const modified = copy(plan); change(modified); assert.equal(worldBindingMatchesSource(ready, modified), false); assert.throws(() => assertWorldApplicable(ready, modified), /源布局已改变/); }
  const locked = copy(plan); locked.entities.forEach(entity => { entity.locked = true; });
  assert.throws(() => assertWorldApplicable(createWorldRecipe(locked, [asset()]), locked), /没有可以确认/);
});

test('stored recipes reject tampered locks, coordinates, dimensions, provenance and omitted objects', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]);
  for (const change of [
    value => { value.tasks[0].sourceEntity.height += 1; }, value => { value.tasks[0].placement.points[0].x += 1; },
    value => { value.tasks[3].placement.spec.anchor.x += 1; }, value => { value.tasks[3].source.provenance.taskId = 'fake'; },
    value => { value.tasks[3].locked = true; }, value => { value.tasks.pop(); }, value => { value.capabilityGaps = []; },
    value => { value.tasks[0].status = '90%'; }, value => { value.sourceFingerprint = 'fake'; }, value => { value.code = 'eval(input)'; },
  ]) { const modified = copy(recipe); change(modified); assert.throws(() => validateWorldRecipe(modified)); }
});

test('asset metadata requires real provenance, safe locations and unambiguous per-kind bindings', () => {
  for (const change of [
    item => { item.method = 'coding-model'; }, item => { item.provenance.taskId = ''; }, item => { item.provenance.license = ''; },
    item => { item.url = 'javascript:alert(1)'; }, item => { item.url = '//example.org/model.glb'; },
    item => { item.referenceUrl = 'data:text/html,code'; }, item => { item.sha256 = 'fake'; }, item => { item.bytes = 80 * 1024 * 1024; },
    item => { item.rotationY = NaN; }, item => { item.execute = 'run()'; },
  ]) { const item = asset(); change(item); assert.throws(() => createWorldRecipe(createDemoPlan(), [item])); }
  assert.throws(() => createWorldRecipe(createDemoPlan(), [asset(), asset()]), /重复/);
  const second = asset(); second.id = 'another-cabin'; assert.throws(() => createWorldRecipe(createDemoPlan(), [asset(), second]), /每种对象/);
});

test('hidden accessors, cycles and executable fields are rejected without evaluating them', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset()]); let accessed = false;
  const dangerous = copy(recipe); Object.defineProperty(dangerous.tasks[0].sourceEntity, 'height', { enumerable: true, get() { accessed = true; return 3; } });
  assert.throws(() => validateWorldRecipe(dangerous), /隐藏字段或访问器/); assert.equal(accessed, false);
  const cyclic = copy(recipe); cyclic.capabilityGaps[0].back = cyclic; assert.throws(() => validateWorldRecipe(cyclic), /循环/);
  const executable = copy(recipe); executable.tasks[0].sourceEntity.toJSON = () => { accessed = true; return {}; };
  assert.throws(() => validateWorldRecipe(executable), /函数/); assert.equal(accessed, false);
});

test('a confirmed object asset overrides only its exact entity while other kind instances keep the shared asset', () => {
  const plan = createDemoPlan();
  plan.entities.push({ id: 'boat-north', kind: 'boat', points: [{ x: .6, y: .1 }], height: 2, locked: false });
  plan.entities.push({ id: 'boat-west', kind: 'boat', points: [{ x: .1, y: .1 }], height: 3, locked: false });
  const before = copy(plan), shared = asset('boat'), exact = { ...asset('boat'), id: 'confirmed-boat-south', entityId: 'boat-south', rotationY: Math.PI, provenance: { ...asset('boat').provenance, taskId: 'new-user-confirmed-task' } };
  const recipe = createWorldRecipe(plan, [shared, exact]);
  assert.equal(recipe.tasks.find(task => task.entityId === 'boat-south').source.assetId, exact.id);
  assert.equal(recipe.tasks.find(task => task.entityId === 'boat-south').source.provenance.taskId, 'new-user-confirmed-task');
  for (const entityId of ['boat-north', 'boat-west']) assert.equal(recipe.tasks.find(task => task.entityId === entityId).source.assetId, shared.id);
  assert.deepEqual(plan, before); assert.deepEqual(recipe.tasks.map(task => task.sourceEntity), plan.entities);
  assert.equal(summarizeWorldRecipe(recipe).uniqueAssets, 2);
  assert.equal(summarizeWorldRecipe(recipe).reusableInstances, 3);
});

test('an exact asset cannot leak into another object when no shared kind asset is available', () => {
  const plan = createDemoPlan(), exact = { ...asset(), id: 'confirmed-one-cabin', entityId: 'cabin-west' };
  const recipe = createWorldRecipe(plan, [exact]);
  assert.equal(recipe.tasks.find(task => task.entityId === 'cabin-west').source.assetId, exact.id);
  assert.equal(recipe.tasks.find(task => task.entityId === 'cabin-east').status, 'awaiting-asset');
  assert.equal(recipe.tasks.find(task => task.entityId === 'cabin-east').source.assetId, null);
  assert.equal(summarizeWorldRecipe(recipe).neuralBound, 1);
});

test('precise bindings reject deleted, wrong-kind, locked and duplicate entity targets', () => {
  for (const entityId of ['missing-object', 'boat-south', 'island-west']) {
    assert.throws(() => createWorldRecipe(createDemoPlan(), [{ ...asset(), entityId }]), /存在、类型匹配/);
  }
  const locked = createDemoPlan(); locked.entities.find(entity => entity.id === 'cabin-west').locked = true;
  assert.throws(() => createWorldRecipe(locked, [{ ...asset(), entityId: 'cabin-west' }]), /未锁定/);
  assert.throws(() => createWorldRecipe(createDemoPlan(), [{ ...asset(), entityId: 'cabin-west' }, { ...asset(), id: 'another-exact-cabin', entityId: 'cabin-west' }]), /精确对象不能重复/);
});

test('used asset counts exclude a shared asset shadowed by confirmed per-object assets', () => {
  const plan = createDemoPlan(), common = asset();
  const exact = ['cabin-west', 'cabin-east'].map(entityId => ({ ...asset(), id: `confirmed-${entityId}`, entityId }));
  const recipe = createWorldRecipe(plan, [common, ...exact]), summary = summarizeWorldRecipe(recipe);
  assert.equal(recipe.catalog.length, 3); assert.equal(summary.uniqueAssets, 2); assert.equal(summary.reusableInstances, 2);
  assert(recipe.tasks.filter(task => task.kind === 'cabin').every(task => task.source.assetId !== common.id));
  const complete = finish(recipe); assert.equal(assertWorldApplicable(complete, plan).sourceFingerprint, recipe.sourceFingerprint);
});

test('stored exact bindings cannot be moved to another existing same-kind entity', () => {
  const recipe = createWorldRecipe(createDemoPlan(), [asset(), { ...asset(), id: 'confirmed-cabin-west', entityId: 'cabin-west' }]);
  const tampered = copy(recipe); tampered.catalog.find(item => item.entityId).entityId = 'cabin-east';
  assert.throws(() => validateWorldRecipe(tampered), /来源被修改/);
  const drift = copy(recipe.sourcePlan); drift.entities.find(entity => entity.id === 'cabin-west').points[0].x += .01;
  assert.equal(worldBindingMatchesSource(recipe, drift), false);
});

test('previous saved recipes without optional entity scope keep their existing source binding and tasks', () => {
  const ready = finish(createWorldRecipe(createDemoPlan(), [asset()]));
  const old = copy(ready); old.catalog.forEach(item => { delete item.entityId; });
  const restored = validateWorldRecipe(old);
  assert.equal(restored.sourceFingerprint, ready.sourceFingerprint); assert.deepEqual(restored.tasks, ready.tasks);
  assert(restored.catalog.every(item => item.entityId === null));
  assert.equal(assertWorldApplicable(restored, createDemoPlan()).sourceFingerprint, old.sourceFingerprint);
});

function confirmedJob(known = asset()) {
  const pending = createAssetJob(createDemoPlan(), 'cabin-west', { id: 'confirmed-checksum-job' });
  return transitionAssetJob(transitionAssetJob(pending, 'running'), 'succeeded', { output: {
    method: 'neural-3d', provider: known.provenance.provider, model: known.provenance.model, taskId: known.provenance.taskId,
    glbUrl: known.url, license: known.provenance.license, prompt: pending.prompt,
  } });
}

test('confirmed model receipts recover nested output checksum before top-level fields', () => {
  const known = asset(), job = confirmedJob(known);
  assert.deepEqual(confirmedAssetChecksum(job, { output: { bytes: known.bytes, sha256: known.sha256 }, bytes: 20, sha256: '0'.repeat(64) }), { bytes: known.bytes, sha256: known.sha256, verificationSource: 'confirmed-receipt' });
  assert.deepEqual(confirmedAssetChecksum(job, { bytes: known.bytes, sha256: known.sha256 }), { bytes: known.bytes, sha256: known.sha256, verificationSource: 'confirmed-receipt' });
});

test('legacy builtin confirmation uses a matching published URL, model and actual task checksum', () => {
  const known = asset(), job = confirmedJob(known);
  const receipt = { provider: known.provenance.provider, generationTaskId: known.provenance.taskId };
  assert.deepEqual(confirmedAssetChecksum(job, receipt, [known]), { bytes: known.bytes, sha256: known.sha256, verificationSource: 'matching-published-manifest' });
  for (const change of [item => { item.url = '/assets/neural/other.glb'; }, item => { item.provenance.taskId = 'another-task'; }, item => { item.provenance.model = 'another-model'; }, item => { item.kind = 'boat'; }]) {
    const incorrect = copy(known); change(incorrect);
    assert.throws(() => confirmedAssetChecksum(job, receipt, [incorrect]), /缺少可核对/);
  }
});

test('missing or invalid real output checksum cannot be replaced by recomputing an untrusted saved Blob hash', () => {
  const known = asset(), job = confirmedJob(known);
  assert.throws(() => confirmedAssetChecksum(job, {}, []), /缺少可核对/);
  assert.throws(() => confirmedAssetChecksum(job, { output: { bytes: known.bytes } }, []), /缺少可核对/);
  assert.throws(() => confirmedAssetChecksum(job, { output: { bytes: 0, sha256: known.sha256 } }, [known]), /文件大小无效/);
  assert.throws(() => confirmedAssetChecksum(job, { output: { bytes: known.bytes, sha256: 'not-sha256' } }, [known]), /SHA-256 无效/);
  assert.throws(() => confirmedAssetChecksum(job, { output: { bytes: known.bytes + 4 } }, [known]), /校验不一致/);
});

test('receipt checksum helpers reject hidden accessors without running them', () => {
  const job = confirmedJob(), receipt = {}; let accessed = false;
  Object.defineProperty(receipt, 'output', { enumerable: true, get() { accessed = true; return {}; } });
  assert.throws(() => confirmedAssetChecksum(job, receipt), /隐藏字段或访问器/); assert.equal(accessed, false);
});
