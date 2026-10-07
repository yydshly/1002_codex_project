import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, VIEWS, HOTSPOT_IDS, initialState, cameraForView, validateState, clone, History, atmosphere } from '../web/landmark/core.js';

test('registered landmark camera and context cards round trip without sharing mutable state', () => {
  const state = initialState();
  assert.equal(state.version, VERSION);
  for (const view of Object.keys(VIEWS)) for (const hotspot of [null, ...HOTSPOT_IDS]) {
    const saved = { ...state, view, hotspot, camera: cameraForView(view) };
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(saved))), saved);
  }
  const camera = cameraForView('overview');
  camera.position[0] = 0;
  assert.equal(initialState().camera.position[0], VIEWS.overview.position[0]);
  const validated = validateState(state);
  validated.camera.target[0] = 1;
  assert.equal(state.camera.target[0], 0);
  assert.throws(() => cameraForView('custom'));
  assert.throws(() => cameraForView('constructor'));
});

test('backups reject unknown fields, non-finite values and camera positions outside navigation limits', () => {
  const corruptions = [
    state => { state.version = 2; },
    state => { state.time = NaN; },
    state => { state.time = 5.99; },
    state => { state.time = 22.01; },
    state => { state.lights = 1; },
    state => { state.hotspot = 'remote-content'; },
    state => { state.view = 'constructor'; },
    state => { state.camera.position[0] = Infinity; },
    state => { state.camera.position = [0, 4, 0]; },
    state => { state.camera.position = [60, 40, 60]; },
    state => { state.camera.position = [0, 5, 0]; },
    state => { state.camera.position = [20, 1, 20]; },
    state => { state.camera.position[0] = 61; },
    state => { state.camera.position[1] = 41; },
    state => { state.camera.target[0] = 19; },
    state => { state.camera.target[1] = .4; },
    state => { state.camera.target[1] = 13; },
    state => { state.camera.position.push(1); },
    state => { delete state.camera.position[0]; },
    state => { state.camera.position.custom = 'metadata'; },
    state => { state.camera.extra = true; },
    state => { state.backend = 'https://invalid.example'; },
    state => { delete state.hotspot; },
    state => { state[Symbol('hidden')] = true; },
  ];
  for (const corrupt of corruptions) {
    const state = initialState(); corrupt(state);
    assert.throws(() => validateState(state));
  }
  assert.throws(() => validateState(Object.assign(Object.create({ remote: true }), initialState())));
  for (const time of [6, 22]) assert.equal(validateState({ ...initialState(), time }).time, time);
});

test('camera distance and angular boundaries match controls while all other bounds remain strict', () => {
  for (const distance of [4, 65]) {
    const state = initialState();
    const polar = 1.1;
    state.camera = { target: [0, .5, 0], position: [distance * Math.sin(polar), .5 + distance * Math.cos(polar), 0] };
    assert.deepEqual(validateState(state), state);
  }
  for (const polar of [.08, .485 * Math.PI]) {
    const state = initialState(), distance = 10;
    state.camera = { target: [0, 2, 0], position: [distance * Math.sin(polar), 2 + distance * Math.cos(polar), 0] };
    assert.deepEqual(validateState(state), state);
  }
  for (const [distance, polar] of [[3.999, 1.1], [65.001, 1.1], [10, .079], [10, .485 * Math.PI + .001]]) {
    const state = initialState();
    state.camera = { target: [0, 2, 0], position: [distance * Math.sin(polar), 2 + distance * Math.cos(polar), 0] };
    assert.throws(() => validateState(state));
  }
});

test('continuous time and camera gestures each create one history entry and cancel restores the starting workspace', () => {
  const history = new History(), start = clone(history.current);
  history.begin('拖动时段');
  for (const time of [16, 17.2, 18.4, 21]) history.current.time = time;
  assert.equal(history.begin('重复指针按下'), false);
  assert.equal(history.commit(), true);
  assert.equal(history.past.length, 1);
  history.undo(); assert.deepEqual(history.current, start);
  history.redo(); assert.equal(history.current.time, 21);
  const afterTime = clone(history.current);
  history.begin('转动地标');
  history.current.camera = cameraForView('facade'); history.current.view = 'custom';
  history.cancel(); assert.deepEqual(history.current, afterTime);
  history.begin('点击但未移动'); assert.equal(history.commit(), false);
  assert.equal(history.past.length, 1);
});

test('time, saved camera, illumination and selected card remain independent through undo and backup restoration', () => {
  const history = new History();
  history.edit('查看屋顶', state => { state.camera = cameraForView('roof'); state.view = 'roof'; });
  const camera = clone(history.current.camera);
  history.edit('查看博物馆说明', state => { state.hotspot = 'museum'; });
  history.edit('黄昏', state => { state.time = 18.5; state.lights = false; });
  assert.deepEqual(history.current.camera, camera);
  assert.equal(history.current.hotspot, 'museum');
  const backup = validateState(JSON.parse(JSON.stringify(history.current)));
  history.undo();
  assert.equal(history.current.time, 15); assert.equal(history.current.lights, true);
  assert.equal(history.current.hotspot, 'museum'); assert.deepEqual(history.current.camera, camera);
  history.replace(backup);
  assert.deepEqual(history.current, backup); assert.equal(history.past.length, 0);
  assert.equal(history.future.length, 0); assert.equal(history.pending, null);
});

test('invalid edits, failed imports and exceptions never destroy the previous workspace or an active gesture', () => {
  const history = new History(), start = clone(history.current);
  assert.throws(() => history.edit('失败操作', state => { state.time = 22; throw new Error('asset failed'); }));
  assert.deepEqual(history.current, start); assert.equal(history.past.length, 0);
  assert.throws(() => history.edit('越界时段', state => { state.hotspot = 'museum'; state.time = Infinity; }));
  assert.deepEqual(history.current, start); assert.equal(history.pending, null);
  history.begin('持续时段拖动'); history.current.time = 19;
  const editing = clone(history.current);
  assert.throws(() => history.edit('嵌套编辑', () => {}));
  assert.throws(() => history.replace({ ...initialState(), hotspot: 'unknown' }));
  assert.deepEqual(history.current, editing); assert.ok(history.pending);
  history.current.time = 23;
  assert.throws(() => history.commit());
  assert.deepEqual(history.current, start); assert.equal(history.pending, null);
  history.run('返回完整状态', state => ({ ...state, hotspot: 'facade' }));
  assert.equal(history.current.hotspot, 'facade');
});

test('new changes branch after undo and forty-entry history is bounded', () => {
  const history = new History();
  for (let index = 0; index < 45; index++) history.edit('调整时段', state => { state.time = index % 2 ? 18 : 21; });
  assert.equal(history.past.length, 40);
  history.undo();
  history.edit('关闭照明', state => { state.lights = false; });
  assert.equal(history.future.length, 0); assert.equal(history.redo(), false);
  assert.throws(() => new History(initialState(), 0));
  assert.throws(() => new History(initialState(), 1.5));
});

test('lighting moods interpolate continuously, remain finite, and cannot accept invented times', () => {
  for (const time of [6, 9, 15, 17, 18, 19.5, 20, 22]) {
    const mood = atmosphere(time);
    assert.ok(['day', 'sunset', 'night'].includes(mood.phase));
    assert.ok(Math.abs(Math.hypot(...mood.sunDirection) - 1) < 1e-12);
    assert.ok(mood.sunDirection[1] > 0);
    for (const key of ['sunColor', 'skyColor', 'groundColor']) assert.match(mood[key], /^#[a-f0-9]{6}$/);
    for (const key of ['directIntensity', 'ambient', 'exposure', 'practicalIntensity']) assert.ok(Number.isFinite(mood[key]) && mood[key] >= 0);
  }
  for (const anchor of [9, 15, 18, 19.5, 20]) {
    const a = atmosphere(anchor - 1e-7), b = atmosphere(anchor + 1e-7);
    for (const key of ['directIntensity', 'ambient', 'exposure', 'practicalIntensity']) assert.ok(Math.abs(a[key] - b[key]) < 1e-5);
    a.sunDirection.forEach((value, index) => assert.ok(Math.abs(value - b.sunDirection[index]) < 1e-5));
  }
  assert.ok(atmosphere(22).practicalIntensity > atmosphere(15).practicalIntensity);
  assert.ok(atmosphere(22).directIntensity < atmosphere(15).directIntensity);
  for (const invalid of [5, 23, NaN, Infinity, '18', null]) assert.throws(() => atmosphere(invalid));
});
