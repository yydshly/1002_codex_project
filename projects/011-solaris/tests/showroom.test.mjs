import test from 'node:test';
import assert from 'node:assert/strict';
import { History, PAINTS, VIEWS, initialState, validateState, clone } from '../web/showroom/core.js';

test('every registered finish and preset survives a saved-state round trip', () => {
  for (const paint of PAINTS) for (const [view, pose] of Object.entries(VIEWS)) {
    const state = initialState();
    Object.assign(state, { paint: paint.id, view, camera: { position: pose.position, target: pose.target }, hood: .5 });
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  }
  const first = initialState(), second = initialState();
  first.camera.position[0] = 4;
  assert.equal(second.camera.position[0], VIEWS.hero.position[0]);
});

test('invalid backups cannot introduce arbitrary fields, finishes or non-finite camera data', () => {
  const invalid = [
    state => { state.version = 2; },
    state => { state.paint = 'remote-url'; },
    state => { state.view = 'constructor'; },
    state => { state.lights.source = 'https://remote.invalid'; },
    state => { state.camera.position[0] = NaN; },
    state => { state.camera.target = [0, Infinity, 0]; },
    state => { state.camera.position = [0, .65, 0]; },
    state => { state.camera.target[0] = 50; },
    state => { state.camera.target[0] = 6; },
    state => { state.camera.position = [0, .8, 20]; },
    state => { state.camera.position = [0, .8, .5]; },
    state => { state.camera.position = [2, .2, 2]; },
    state => { state.camera.position[1] = -.1; },
    state => { state.camera.target.push(4); },
    state => { state.hood = 1.1; },
    state => { state.lights.power = -1; },
    state => { state.lights.power = 301; },
    state => { state.lights.on = 1; },
    state => { state.backend = {}; },
    state => { delete state.hood; },
  ];
  for (const corrupt of invalid) {
    const state = initialState(); corrupt(state);
    assert.throws(() => validateState(state));
  }
  assert.throws(() => validateState(Object.assign(Object.create({ backend: true }), initialState())));
});

test('a continuous camera or hood gesture records one undo and can be cancelled', () => {
  const history = new History(), start = clone(history.current);
  history.begin('拖动前舱');
  for (const fraction of [.1, .2, .3, .7]) history.current.hood = fraction;
  assert.equal(history.begin('重复 pointerdown'), false);
  assert.equal(history.commit(), true);
  assert.equal(history.past.length, 1);
  const opened = clone(history.current);
  assert.equal(history.undo(), true); assert.deepEqual(history.current, start);
  assert.equal(history.redo(), true); assert.deepEqual(history.current, opened);
  history.begin('转动视角'); history.current.camera.position[0] = 4;
  assert.equal(history.cancel(), true);
  assert.deepEqual(history.current, opened); assert.equal(history.past.length, 1);
  history.begin('未移动的手势'); assert.equal(history.commit(), false);
  assert.equal(history.past.length, 1);
});

test('exceptions and invalid edits restore all partially changed fields', () => {
  const history = new History(), start = clone(history.current);
  assert.throws(() => history.edit('不完整操作', state => { state.paint = 'blue'; throw new Error('asset failed'); }));
  assert.deepEqual(history.current, start); assert.equal(history.past.length, 0);
  assert.throws(() => history.edit('无效灯光', state => { state.paint = 'racing'; state.lights.power = NaN; }));
  assert.deepEqual(history.current, start); assert.equal(history.pending, null);
  history.begin('滑块'); history.current.hood = .5;
  assert.throws(() => history.edit('嵌套编辑', state => { state.paint = 'pearl'; }));
  assert.equal(history.current.hood, .5); history.cancel();
  assert.deepEqual(history.current, start);
});

test('new edits branch after undo and the bounded history retains the latest gestures', () => {
  const history = new History(initialState(), 3);
  for (const power of [20, 40, 60, 80, 100]) history.edit('调整照度', state => { state.lights.power = power; });
  assert.equal(history.past.length, 3);
  history.undo(); assert.equal(history.current.lights.power, 80);
  history.edit('开启车灯', state => { state.lights.on = true; });
  assert.equal(history.future.length, 0); assert.equal(history.redo(), false);
  history.undo(); assert.equal(history.current.lights.on, false);
  history.undo(); assert.equal(history.current.lights.power, 60);
  history.undo(); assert.equal(history.current.lights.power, 40);
  assert.equal(history.undo(), false);
});

test('replacing a workspace is atomic and cancels stale gestures and history', () => {
  const history = new History();
  history.edit('换漆', state => { state.paint = 'racing'; });
  history.begin('拖动前舱'); history.current.hood = .4;
  const before = clone(history.current), bad = initialState(); bad.view = 'unknown';
  assert.throws(() => history.replace(bad));
  assert.deepEqual(history.current, before); assert.ok(history.pending);
  const restored = initialState(); restored.paint = 'pearl'; restored.view = 'custom';
  history.replace(restored);
  assert.deepEqual(history.current, restored);
  assert.equal(history.pending, null); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
});
