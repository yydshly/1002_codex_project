import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlan, validatePlan } from '../web/creation-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { createAssetJob, validateAssetJob, transitionAssetJob, bindingMatchesSource, assertAssetApplicable, fitAssetBounds } from '../web/asset-generation-core.js';

const copy = value => structuredClone(value);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function source(kind = 'cabin') {
  const plan = createDemoPlan();
  plan.entities.push({ id: 'asset-support', kind: 'land', points: [{ x: .55, y: .5 }, { x: .7, y: .5 }, { x: .7, y: .65 }, { x: .55, y: .65 }], height: 3, locked: false });
  plan.entities.push({ id: 'asset-subject', kind, points: [{ x: .6, y: .55 }], height: { cabin: 7, lighthouse: 18, palm: 12, boat: 2 }[kind], locked: false });
  return validatePlan(plan);
}
function job(kind = 'cabin') { return createAssetJob(source(kind), 'asset-subject', { id: 'asset-request-1', appearanceBrief: '南方海岸，真实旧木和自然磨损' }); }
function output(input) { return { method: 'neural-3d', provider: 'Provider from actual response', model: 'Actual model version', taskId: 'provider-task-123', glbUrl: '/api/asset/provider-task-123.glb', license: 'As returned by provider terms', prompt: input.prompt }; }
function success(input = job()) { return transitionAssetJob(transitionAssetJob(input, 'running'), 'succeeded', { output: output(input) }); }

test('one request snapshots one authored object without mutating the plan or options', () => {
  const plan = freeze(source()), before = copy(plan), options = freeze({ id: 'request-1', appearanceBrief: '  white plaster  ', referenceImage: 'data:image/png;base64,YQ==' });
  const request = createAssetJob(plan, 'asset-subject', options);
  assert.deepEqual(plan, before); assert.equal(request.appearanceBrief, 'white plaster');
  assert.equal(request.binding.sourceFingerprint, fingerprintPlan(plan));
  assert.deepEqual(request.spec.anchor, { x: (.6 - .5) * plan.world.width, y: 3, z: (.55 - .5) * plan.world.depth });
  assert.equal(request.spec.height, 7); assert.equal(request.status, 'pending');
  request.sourcePlan.entities[0].height = 9; assert.equal(plan.entities[0].height, before.entities[0].height);
  assert.equal(options.appearanceBrief, '  white plaster  ');
});

test('each asset semantic has its own isolated-object prompt and physical envelope', () => {
  const expected = { cabin: /single-storey coastal cabin/, lighthouse: /coastal lighthouse/, palm: /mature tropical palm/, boat: /small coastal boat/ };
  const prompts = new Set();
  for (const kind of Object.keys(expected)) {
    const request = job(kind); prompts.add(request.prompt);
    assert.match(request.prompt, expected[kind]); assert.match(request.prompt, /exactly ONE isolated photorealistic/);
    assert.match(request.prompt, /Do not generate an entire scene/); assert.match(request.prompt, /PBR/);
    assert.equal(request.binding.kind, kind); assert.equal(validateAssetJob(request).prompt, request.prompt);
  }
  assert.equal(prompts.size, 4);
});

test('locked, deleted or nonasset objects cannot request neural replacement', () => {
  const plan = source(); plan.entities.at(-1).locked = true;
  assert.throws(() => createAssetJob(plan, 'asset-subject'), /锁定/);
  assert.throws(() => createAssetJob(source(), 'missing'), /不存在/);
  assert.throws(() => createAssetJob(source(), source().entities.find(item => item.kind === 'land').id), /只支持/);
});

test('state advances only through real pending-running-success events with provenance', () => {
  const pending = freeze(job()), running = transitionAssetJob(pending, 'running');
  assert.equal(pending.status, 'pending'); assert.equal(running.status, 'running');
  assert.throws(() => transitionAssetJob(pending, 'succeeded', { output: output(pending) }), /不能/);
  assert.throws(() => transitionAssetJob(running, 'succeeded'), /必须/);
  const succeeded = transitionAssetJob(running, 'succeeded', { output: output(running) });
  assert.equal(succeeded.output.taskId, 'provider-task-123'); assert.equal(succeeded.output.method, 'neural-3d');
  assert.throws(() => transitionAssetJob(succeeded, 'running'), /不能/);
  assert.equal(assertAssetApplicable(succeeded, source()).status, 'succeeded');
});

test('failed and cancelled jobs retain truthful terminal states and cannot apply', () => {
  const pending = job(), failed = transitionAssetJob(pending, 'failed', { error: 'Provider quota exhausted' });
  assert.equal(failed.output, null); assert.equal(failed.error, 'Provider quota exhausted');
  const cancelled = transitionAssetJob(transitionAssetJob(pending, 'running'), 'cancelled');
  assert.equal(cancelled.output, null); assert.equal(cancelled.error, null);
  assert.throws(() => assertAssetApplicable(cancelled, source()), /尚未成功/);
  assert.throws(() => transitionAssetJob(failed, 'running'), /不能/);
  assert.throws(() => transitionAssetJob(pending, 'cancelled', { output: output(pending) }), /不能附带/);
});

test('full source drift, deleted target and lock are rejected before apply', () => {
  const complete = success(), original = source(); assert.equal(bindingMatchesSource(complete, original), true);
  for (const change of [
    plan => { plan.entities.at(-1).points[0].x = .7; },
    plan => { plan.entities.at(-1).height += 1; },
    plan => { plan.entities[0].height += 1; },
    plan => { plan.intent = 'unrelated source edit still needs explicit regeneration'; },
  ]) {
    const modified = source(); change(modified); assert.equal(bindingMatchesSource(complete, modified), false);
    assert.throws(() => assertAssetApplicable(complete, modified), /源布局已改变/);
  }
  const deleted = source(); deleted.entities.pop(); assert.equal(bindingMatchesSource(complete, deleted), false);
  assert.throws(() => assertAssetApplicable(complete, deleted), /已删除/);
  const locked = source(); locked.entities.at(-1).locked = true; assert.equal(bindingMatchesSource(complete, locked), false);
  assert.throws(() => assertAssetApplicable(complete, locked), /锁定/);
});

test('stored jobs reject edited IDs, bindings, coordinates, prompts and hidden executable fields', () => {
  for (const change of [
    input => { input.binding.entityId = 'missing'; }, input => { input.binding.sourceFingerprint = 'fake'; },
    input => { input.binding.kind = 'boat'; }, input => { input.spec.anchor.x += 1; },
    input => { input.spec.height += 1; }, input => { input.prompt = 'generate entire world'; },
    input => { input.code = 'eval(payload)'; }, input => { input.spec.code = 'eval(payload)'; },
    input => { input.id = '../unsafe'; }, input => { input.status = '99% complete'; },
  ]) { const input = job(); change(input); assert.throws(() => validateAssetJob(input)); }
  let accessed = false; const input = job(); Object.defineProperty(input.binding, 'entityId', { enumerable: true, get() { accessed = true; return 'asset-subject'; } });
  assert.throws(() => validateAssetJob(input), /普通可序列化/); assert.equal(accessed, false);
});

test('coding model results and incomplete or redirected provenance cannot claim neural success', () => {
  const running = transitionAssetJob(job(), 'running');
  for (const mutate of [
    result => { result.method = 'coding-model'; }, result => { result.method = 'asset-assembly'; },
    result => { result.provider = ''; }, result => { result.taskId = ''; }, result => { result.license = ''; },
    result => { result.prompt = 'another request'; }, result => { result.glbUrl = 'javascript:alert(1)'; },
    result => { result.glbUrl = '//other-host/model.glb'; }, result => { result.glbUrl = 'https://user:password@example.org/model.glb'; },
    result => { result.code = 'execute()'; },
  ]) { const result = output(running); mutate(result); assert.throws(() => transitionAssetJob(running, 'succeeded', { output: result })); }
  const result = output(running); result.glbUrl = 'https://example.org/signed-model?token=download';
  assert.equal(transitionAssetJob(running, 'succeeded', { output: result }).output.glbUrl, result.glbUrl);
});

test('references are bounded raster data or HTTPS/local locations, never scripts', () => {
  for (const referenceImage of ['javascript:alert(1)', 'data:text/html;base64,YQ==', 'data:image/svg+xml;base64,YQ==', 'file:///private/image.png', '//example.org/image.png', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => createAssetJob(source(), 'asset-subject', { referenceImage }));
  }
  assert.equal(createAssetJob(source(), 'asset-subject', { referenceImage: 'https://example.org/image.png' }).referenceImage, 'https://example.org/image.png');
});

test('uniform GLB fit centres arbitrary offsets, grounds the feet, preserves proportions and caps footprint', () => {
  const spec = freeze(job().spec), bounds = freeze({ min: [-3, -4, 10], max: [17, 6, 40] });
  const result = fitAssetBounds(bounds, spec);
  assert.equal(result.scale, 7 / 30); assert.deepEqual(result.offset, [-7, 4, -25]);
  assert.deepEqual(result.position, [spec.anchor.x, spec.anchor.y, spec.anchor.z]); assert.equal(result.rotationY, 0);
  assert.ok(result.dimensions.width <= 8); assert.ok(result.dimensions.height <= 7); assert.ok(result.dimensions.depth <= 7);
  assert.equal(result.dimensions.width / result.dimensions.height, 2);
  assert.equal((bounds.min[1] + result.offset[1]) * result.scale, 0);
  assert.deepEqual(bounds.min, [-3, -4, 10]);
});

test('zero authored height uses explicit fallback instead of producing a collapsed GLB', () => {
  const plan = source(); plan.entities.at(-1).height = 0;
  const request = createAssetJob(plan, 'asset-subject'); assert.equal(request.spec.height, 0);
  const fitted = fitAssetBounds({ min: [0, 0, 0], max: [1, 2, 1] }, request.spec);
  assert.equal(fitted.scale, 3.5); assert.equal(fitted.dimensions.height, 7);
  assert.match(request.prompt, /height at most 7 m/);
});

test('invalid, degenerate, nonfinite and pathological GLB bounds are rejected', () => {
  for (const bounds of [
    { min: [1, 0, 0], max: [0, 2, 1] }, { min: [0, 0, 0], max: [0, 2, 1] },
    { min: [0, 0, 0], max: [1, Infinity, 1] }, { min: [0, 0, 0], max: [1, NaN, 1] },
    { min: [0, 0, 0], max: [1, 2, 2000000] }, { min: [0, 0], max: [1, 2, 1] },
    { min: [0, 0, 0], max: [1, 2, 1], code: 'execute()' },
  ]) assert.throws(() => fitAssetBounds(bounds, job().spec));
  let accessed = false; const min = [0, 0, 0]; Object.defineProperty(min, '0', { get() { accessed = true; return 0; }, enumerable: true });
  assert.throws(() => fitAssetBounds({ min, max: [1, 2, 1] }, job().spec)); assert.equal(accessed, false);
});
