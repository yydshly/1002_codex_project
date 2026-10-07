import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, MAX_TRIALS, HEIGHT_MIN, HEIGHT_MAX, GRAVITY, PREPARATION_SECONDS, LANDING_SECONDS,
  VIEWS, initialState, validateState, validateCamera, cameraForView, setView, setHeight,
  gesture, createTrial, appendTrial, findTrial, selectTrial, jumpDuration, sampleJump, History,
} from '../web/skate/core.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const drag = (rise = 92, duration = 400) => gesture(rise, 0, duration);
const trialState = (count = 1) => {
  let state = initialState();
  for (let i = 0; i < count; i++) state = appendTrial(state, drag(24 + i % 137, 300 + i));
  return state;
};

test('workspace round trips with independent cameras, immutable presets and reproducible trial parameters', () => {
  const state = initialState(), before = JSON.stringify(state), copy = validateState(JSON.parse(before));
  assert.equal(state.version, VERSION); assert.equal(copy.view, 'hero'); assert.equal(copy.height, .7);
  assert.deepEqual(copy.camera, cameraForView('hero')); assert.deepEqual(copy.trials, []);
  assert.equal(copy.nextId, 1); assert.equal(copy.selectedTrial, null);
  for (const id of Object.keys(VIEWS)) {
    const camera = cameraForView(id);
    assert.deepEqual(validateCamera(camera), camera);
    assert.equal(setView(state, id).view, id);
    assert.deepEqual(setView(state, id).camera, camera);
    assert.ok(Object.isFrozen(VIEWS[id])); assert.ok(Object.isFrozen(VIEWS[id].position));
  }
  copy.camera.position[0] = -5; copy.trials.push(createTrial(state, drag()));
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => cameraForView('constructor'));
  assert.throws(() => setView(state, 'custom'));
  assert.equal(setHeight(state, HEIGHT_MIN).height, HEIGHT_MIN);
  assert.equal(setHeight(state, HEIGHT_MAX).height, HEIGHT_MAX);
  assert.throws(() => setHeight(state, HEIGHT_MAX + .01));
});

test('only a valid final upward gesture launches; distance controls height independently of speed', () => {
  assert.equal(gesture(23.999, 0, 100), null);
  assert.equal(gesture(-80, 0, 100), null);
  assert.equal(gesture(0, 0, 100), null);
  assert.equal(gesture(92, 100.01, 100), null);
  assert.equal(gesture(92, -100.01, 100), null);
  const minimum = gesture(24, 100, 1), maximum = gesture(160, -100, 60_000), clamped = gesture(240, 0, 900);
  assert.equal(minimum.height, HEIGHT_MIN); assert.equal(maximum.height, HEIGHT_MAX);
  assert.equal(clamped.rise, 240); assert.equal(clamped.height, HEIGHT_MAX);
  assert.equal(gesture(4096, 0, 400).height, HEIGHT_MAX); assert.equal(gesture(4096.01, 0, 400), null);
  const slow = gesture(92, 0, 1000), quick = gesture(92, 0, 100);
  near(slow.height, .7); assert.equal(slow.height, quick.height);
  assert.equal(slow.speed, 92); assert.equal(quick.speed, 920);
  // A large preview followed by a retreat is evaluated from the final displacement, not the peak.
  assert.ok(gesture(160, 0, 250)); assert.equal(gesture(8, 0, 600), null);
  for (const input of [
    [NaN, 0, 100], [Infinity, 0, 100], ['92', 0, 100], [92, NaN, 100],
    [92, 0, 0], [92, 0, -1], [92, 0, 60_001], [92, 0, Infinity], [92, 0, '100'],
  ]) assert.equal(gesture(...input), null);
});

test('completion adds exactly one trial without changing the camera, view or height preset', () => {
  const state = setView(setHeight(initialState(), .3), 'side'), original = JSON.stringify(state);
  const input = drag(160, 250), trial = createTrial(state, input);
  assert.deepEqual(trial, { id: 1, rise: 160, durationMs: 250, height: 1.1 });
  assert.equal(JSON.stringify(state), original);
  const next = appendTrial(state, input);
  assert.deepEqual(next.trials, [trial]); assert.equal(next.nextId, 2); assert.equal(next.selectedTrial, 1);
  assert.equal(next.view, 'side'); assert.equal(next.height, .3); assert.deepEqual(next.camera, state.camera);
  assert.equal(JSON.stringify(state), original); assert.deepEqual(input, drag(160, 250));
  assert.deepEqual(findTrial(next, 1), trial);
  findTrial(next, 1).rise = 1;
  assert.equal(next.trials[0].rise, 160);
  assert.throws(() => createTrial(state, { ...input, speed: input.speed + 1 }));
  assert.throws(() => appendTrial(state, { ...input, height: .3 }));
  assert.throws(() => createTrial(state, { ...input, extra: true }));
  assert.throws(() => createTrial(state, null));
  assert.equal(JSON.stringify(state), original);
});

test('the forty-trial window retains chronological IDs and selects the latest valid entry', () => {
  const state = trialState(45);
  assert.equal(state.trials.length, MAX_TRIALS); assert.equal(state.nextId, 46); assert.equal(state.selectedTrial, 45);
  assert.deepEqual(state.trials.map(item => item.id), Array.from({ length: 40 }, (_, i) => i + 6));
  const earlier = selectTrial(state, 6), original = JSON.stringify(earlier), next = appendTrial(earlier, drag());
  assert.equal(next.trials[0].id, 7); assert.equal(next.selectedTrial, 46); assert.equal(next.nextId, 47);
  assert.equal(JSON.stringify(earlier), original);
  assert.equal(selectTrial(state, null).selectedTrial, null);
  assert.throws(() => selectTrial(state, 5)); assert.throws(() => findTrial(state, 5));
  const exhausted = { ...initialState(), nextId: 1_000_000 };
  assert.deepEqual(validateState(exhausted), exhausted); assert.throws(() => appendTrial(exhausted, drag()), /上限/);
});

test('a recorded jump can be sampled repeatedly without adding records or altering stable state', () => {
  const state = trialState(3), original = JSON.stringify(state), trial = findTrial(state, 2);
  const times = [0, .1, .28, .5, .7, 1, jumpDuration(trial.height), 20];
  const first = times.map(time => sampleJump(time, trial.height));
  const second = times.map(time => sampleJump(time, findTrial(state, 2).height));
  assert.deepEqual(second, first); assert.equal(JSON.stringify(state), original);
  assert.equal(state.trials.length, 3); assert.equal(state.nextId, 4);
});

test('height-derived projectile trajectories peak at the requested height and land at zero', () => {
  for (const height of [.3, .7, 1.1]) {
    const air = 2 * Math.sqrt(2 * height / GRAVITY), duration = jumpDuration(height);
    near(duration, PREPARATION_SECONDS + air + LANDING_SECONDS);
    const launch = sampleJump(PREPARATION_SECONDS, height), apex = sampleJump(PREPARATION_SECONDS + air / 2, height);
    assert.equal(launch.phase, 'air'); assert.equal(launch.boardY, 0); near(launch.verticalSpeed, Math.sqrt(2 * height * GRAVITY));
    near(apex.boardY, height); near(apex.verticalSpeed, 0);
    for (const part of [.1, .2, .4]) {
      near(sampleJump(PREPARATION_SECONDS + air * part, height).boardY,
        sampleJump(PREPARATION_SECONDS + air * (1 - part), height).boardY);
    }
    const landed = sampleJump(PREPARATION_SECONDS + air, height), done = sampleJump(duration, height);
    assert.equal(landed.phase, 'landing'); assert.equal(landed.boardY, 0);
    assert.equal(done.phase, 'done'); assert.equal(done.boardY, 0); assert.equal(done.crouch, 0); assert.equal(done.hipLower, 0);
    assert.equal(done.arm, 0); assert.equal(done.progress, 1); assert.equal(done.verticalSpeed, 0);
    assert.deepEqual(sampleJump(duration + 100, height), done);
  }
});

test('pose and carrier samples are continuous across phase boundaries and never penetrate the ground', () => {
  for (const height of [0, .3, .7, 1.1]) {
    const air = 2 * Math.sqrt(2 * height / GRAVITY), duration = jumpDuration(height);
    for (const boundary of [PREPARATION_SECONDS, PREPARATION_SECONDS + air, duration]) {
      const before = sampleJump(boundary - 1e-8, height), after = sampleJump(boundary + 1e-8, height);
      near(before.boardY, after.boardY, 1e-7); near(before.crouch, after.crouch, 1e-7);
      near(before.hipLower, after.hipLower, 1e-7); near(before.arm, after.arm, 1e-7);
    }
    let maximum = 0;
    for (let step = 0; step <= 1000; step++) {
      const sample = sampleJump(duration * step / 1000, height);
      assert.ok(sample.boardY >= 0 && sample.boardY <= height + 1e-9);
      assert.ok(sample.crouch >= 0 && sample.crouch <= 1); assert.ok(sample.hipLower >= 0 && sample.hipLower <= .24);
      assert.ok(Object.values(sample).filter(value => typeof value === 'number').every(Number.isFinite));
      maximum = Math.max(maximum, sample.boardY);
    }
    if (height) assert.ok(maximum >= height - 1e-5);
    else assert.equal(maximum, 0);
  }
  assert.deepEqual(sampleJump(-5, .7), sampleJump(0, .7));
  for (const height of [-.1, Infinity, NaN, 1.1001, '.7']) {
    assert.throws(() => jumpDuration(height)); assert.throws(() => sampleJump(.5, height));
  }
  for (const time of [NaN, Infinity, '0']) assert.throws(() => sampleJump(time, .7));
});

test('damaged state rejects malformed IDs, inconsistent gesture records and invalid camera envelopes atomically', () => {
  const good = trialState(2), original = JSON.stringify(good);
  const bad = [
    { ...good, version: 2 }, { ...good, height: .29 }, { ...good, height: NaN },
    { ...good, view: 'constructor' }, { ...good, view: './outside.html' },
    { ...good, nextId: 2 }, { ...good, nextId: 3.5 }, { ...good, nextId: 1_000_001 },
    { ...good, selectedTrial: 3 }, { ...good, selectedTrial: '1' },
    { ...good, trials: [good.trials[1], good.trials[0]] },
    { ...good, trials: [good.trials[0], good.trials[0]] },
    { ...good, trials: [{ ...good.trials[0], id: 0 }] },
    { ...good, trials: [{ ...good.trials[0], rise: 0 }] },
    { ...good, trials: [{ ...good.trials[0], durationMs: 0 }] },
    { ...good, trials: [{ ...good.trials[0], height: 1.1 }] },
    { ...good, trials: [{ ...good.trials[0], direction: 'up' }] },
    { ...good, camera: { position: [0, 1, 0], target: [0, 0, 0] } },
    { ...good, camera: { position: [0, 2, 20], target: [0, .7, 0] } },
    { ...good, camera: { position: [0, 1, 3], target: [0, 2, 0] } },
    { ...good, camera: { position: [0, 5, 0], target: [0, .7, 0] } },
    { ...good, camera: { position: [0, 2, 5], target: [4, .7, 0] } },
    { ...good, camera: { position: [0, 2, 5], target: [0, .7, 0], fov: 30 } },
    { ...good, pose: 'air' }, { ...good, trials: new Array(2) },
    Object.assign(Object.create({ inherited: true }), good),
  ];
  const extraList = structuredClone(good); extraList.trials.extra = true; bad.push(extraList);
  const extraVector = structuredClone(good); extraVector.camera.position.extra = true; bad.push(extraVector);
  const sparseVector = structuredClone(good); delete sparseVector.camera.position[1]; bad.push(sparseVector);
  const customList = structuredClone(good); Object.setPrototypeOf(customList.trials, Object.create(Array.prototype)); bad.push(customList);
  const symbolic = structuredClone(good); symbolic[Symbol('hidden')] = true; bad.push(symbolic);
  const polluted = JSON.parse(original); polluted.__proto__ = { malicious: true }; bad.push(polluted);
  for (const item of bad) assert.throws(() => validateState(item));
  assert.equal(JSON.stringify(good), original); assert.deepEqual(validateState(JSON.parse(original)), good);
  assert.deepEqual(validateState({ ...good, view: 'custom' }).camera, good.camera);
});

test('state validation never executes accessors on objects, nested trials or vector arrays', () => {
  let reads = 0;
  const object = initialState(); Object.defineProperty(object, 'height', { enumerable: true, get() { reads++; return .7; } });
  const camera = initialState(); Object.defineProperty(camera.camera, 'target', { enumerable: true, get() { reads++; return [0, .7, 0]; } });
  const trial = trialState(); Object.defineProperty(trial.trials[0], 'rise', { enumerable: true, get() { reads++; return 24; } });
  const vector = initialState(); Object.defineProperty(vector.camera.position, '1', { enumerable: true, get() { reads++; return 3.6; } });
  const array = trialState(); Object.defineProperty(array.trials, '0', { enumerable: true, get() { reads++; return {}; } });
  for (const value of [object, camera, trial, vector, array]) assert.throws(() => validateState(value));
  assert.equal(reads, 0);
});

test('pending gesture cancellation leaves older completed trials intact and commits once after completion', () => {
  const history = new History(); history.edit('完成第一次起跳', state => appendTrial(state, drag()));
  const stable = structuredClone(history.current);
  history.begin('上拖预览'); assert.equal(history.begin('重复开始'), false);
  history.current.height = .3;
  assert.equal(history.undo(), true); assert.deepEqual(history.current, stable);
  assert.equal(history.pending, null); assert.equal(history.past.length, 1);
  history.begin('第二次动作'); history.current = appendTrial(history.current, drag(140, 700));
  assert.equal(history.commit(), true); assert.equal(history.commit(), false);
  const completed = structuredClone(history.current);
  assert.equal(completed.trials.length, 2); assert.equal(history.past.length, 2);
  history.undo(); assert.deepEqual(history.current, stable);
  history.redo(); assert.deepEqual(history.current, completed);
  history.begin('未完成动作'); history.current = appendTrial(history.current, drag(30, 250));
  history.redo(); assert.deepEqual(history.current, completed); assert.equal(history.pending, null);
  assert.equal(history.state, history.current);
});

test('invalid edits or imports roll back atomically; no-op preserves redo and history retains forty operations', () => {
  const history = new History(); history.edit('观察侧面', state => setView(state, 'side')); history.undo();
  const before = structuredClone(history.current);
  assert.throws(() => history.edit('损坏记录', state => { state.trials.push({ id: 1 }); }));
  assert.deepEqual(history.current, before); assert.equal(history.pending, null); assert.equal(history.future.length, 1);
  assert.equal(history.edit('无变更', () => undefined), false); assert.equal(history.future.length, 1);
  assert.throws(() => history.edit('业务异常', state => { state.height = 1.1; throw new Error('failed'); }), /failed/);
  assert.deepEqual(history.current, before); assert.equal(history.future.length, 1);
  history.begin('未完成'); history.current.height = 1.1;
  assert.throws(() => history.replace({ ...initialState(), nextId: -1 }));
  assert.equal(history.pending.label, '未完成'); history.cancel();
  history.redo(); assert.equal(history.current.view, 'side');
  history.replace(initialState());
  for (let i = 0; i < 45; i++) history.edit('改变预设', state => setHeight(state, i % 2 ? .3 : 1.1));
  assert.equal(history.past.length, 40);
  let undone = 0; while (history.undo()) undone++;
  assert.equal(undone, 40); assert.equal(history.current.height, 1.1);
  history.edit('分支', state => setView(state, 'front')); assert.equal(history.canRedo, false);
  assert.throws(() => new History(initialState(), 41));
});
