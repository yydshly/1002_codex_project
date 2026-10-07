import test from 'node:test';
import assert from 'node:assert/strict';
import { History, initialState, validateState, imageToScreen, screenToImage, fitView, zoomAt, panView, imagePoint, measurementLength, calibrate, moveEndpoint } from '../web/imaging/core.js';

const clone = value => structuredClone(value);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
const ruler = { id: 'measure-1', a: { x: 120, y: 180 }, b: { x: 420, y: 580 } };

test('fitting an image keeps its aspect ratio and centres the padded viewport', () => {
  const fitted = fitView(1000, 500, 800, 600, 40);
  assert.deepEqual(fitted, { scale: .72, offsetX: 40, offsetY: 120 });
  assert.deepEqual(imageToScreen(fitted, { x: 1000, y: 500 }), { x: 760, y: 480 });
  assert.equal(fitView(8192, 8192, 100, 100).scale, .04);
  assert.equal(fitView(1, 1, 1000, 1000).scale, 16);
});

test('cursor-anchored zoom preserves the same image point at normal and clamped scales', () => {
  const viewport = { scale: .5, offsetX: -40, offsetY: 30 }, pointer = { x: 210, y: 180 };
  const expectedImagePoint = { x: 500, y: 300 };
  assert.deepEqual(screenToImage(viewport, pointer), expectedImagePoint);
  for (const factor of [2, 1000, .00001]) {
    const next = zoomAt(viewport, pointer, factor), anchor = screenToImage(next, pointer);
    near(anchor.x, 500); near(anchor.y, 300);
    assert.ok(next.scale >= .04 && next.scale <= 16);
  }
  assert.deepEqual(viewport, { scale: .5, offsetX: -40, offsetY: 30 });
});

test('zoom attempts at either scale limit preserve the exact view and create no undo entry', () => {
  for (const scale of [.04, 16]) {
    const history = new History(initialState(1000, 800));
    history.current.view = { scale, offsetX: 35.2, offsetY: -16.7 };
    const before = clone(history.current);
    const changed = history.edit('边界缩放', state => { state.view = zoomAt(state.view, { x: 123.4, y: 567.8 }, scale === 16 ? 2 : .5); });
    assert.equal(changed, false);
    assert.equal(history.past.length, 0);
    assert.deepEqual(history.current, before);
  }
});

test('a diagonal image-space length stays invariant after viewport zoom and pan', () => {
  let state = initialState(1000, 800);
  state.measurements.push(clone(ruler));
  assert.deepEqual(measurementLength(state, ruler), { value: 500, unit: 'px' });
  state = calibrate(state, { x: 100, y: 100 }, { x: 300, y: 100 }, 40);
  assert.deepEqual(measurementLength(state, ruler), { value: 100, unit: 'mm' });
  state.view = panView(zoomAt(state.view, { x: 275, y: 275 }, 4), -650, 190);
  assert.deepEqual(measurementLength(state, state.measurements[0]), { value: 100, unit: 'mm' });
  assert.deepEqual(state.measurements[0], ruler);
  const screenEnd = imageToScreen(state.view, ruler.b);
  assert.deepEqual(imagePoint(state.view, screenEnd, state.image), ruler.b);
});

test('manual calibration uses Euclidean reference length for a diagonal ruler', () => {
  const state = calibrate(initialState(600, 600), { x: 10, y: 20 }, { x: 70, y: 100 }, 25);
  const measured = measurementLength(state, { a: { x: 0, y: 0 }, b: { x: 300, y: 400 } });
  assert.deepEqual(measured, { value: 125, unit: 'mm' });
  assert.throws(() => calibrate(state, { x: 5, y: 5 }, { x: 5.1, y: 5.1 }, 10), /至少/);
  assert.throws(() => calibrate(state, { x: 10, y: 20 }, { x: 70, y: 100 }, 0), /参考长度/);
});

test('an uncalibrated uploaded image reports pixels and never infers physical scale', () => {
  const state = initialState(1600, 900, 'upload-1');
  assert.equal(state.calibration, null);
  assert.deepEqual(measurementLength(state, { a: { x: 2, y: 4 }, b: { x: 5, y: 8 } }), { value: 5, unit: 'px' });
  const wrongLabel = clone(state); wrongLabel.calibration = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, lengthMm: '100' };
  assert.throws(() => validateState(wrongLabel), /参考长度/);
});

test('image coordinates clamp to the actual image bounds and endpoint edits preserve the other anchor', () => {
  const state = initialState(1000, 800); state.measurements.push(clone(ruler));
  const viewport = { scale: 2, offsetX: 50, offsetY: -100 };
  assert.deepEqual(imagePoint(viewport, { x: -20, y: 2000 }, state.image), { x: 0, y: 800 });
  assert.throws(() => imagePoint(viewport, { x: -20, y: 2000 }, state.image, false), /超出/);
  const next = moveEndpoint(state, 'measure-1', 'b', { x: 1500, y: -50 });
  assert.deepEqual(next.measurements[0], { id: 'measure-1', a: ruler.a, b: { x: 1000, y: 0 } });
  assert.deepEqual(state.measurements[0], ruler);
  assert.throws(() => moveEndpoint(state, 'measure-1', 'b', { x: 1001, y: 5 }, false), /超出/);
  assert.throws(() => moveEndpoint(state, 'missing', 'b', { x: 5, y: 5 }), /不存在/);
});

test('a continuous endpoint drag commits one history entry and a cancelled drag restores it', () => {
  const state = initialState(1000, 800); state.measurements.push(clone(ruler));
  const history = new History(state), original = clone(history.current);
  history.begin('移动测量端点');
  for (const y of [500, 450, 400]) history.current = moveEndpoint(history.current, 'measure-1', 'b', { x: 420, y });
  assert.equal(history.commit(), true); assert.equal(history.past.length, 1);
  const edited = clone(history.current);
  history.begin('取消拖动'); history.current = moveEndpoint(history.current, 'measure-1', 'a', { x: 200, y: 200 });
  assert.equal(history.cancel(), true); assert.deepEqual(history.current, edited); assert.equal(history.past.length, 1);
  history.undo(); assert.deepEqual(history.current, original);
  history.redo(); assert.deepEqual(history.current, edited);
});

test('two original images keep calibration, measurement history and pending drags independent', () => {
  const hand = new History(initialState(1000, 800, 'hand'));
  const foot = new History(initialState(800, 1000, 'foot'));
  hand.edit('手动校准', state => calibrate(state, { x: 0, y: 0 }, { x: 100, y: 0 }, 20));
  hand.edit('新增测量', state => { state.measurements.push(clone(ruler)); });
  assert.deepEqual(measurementLength(hand.current, ruler), { value: 100, unit: 'mm' });
  assert.equal(foot.current.calibration, null); assert.equal(foot.current.measurements.length, 0); assert.equal(foot.past.length, 0);
  hand.begin('未完成拖动'); hand.current.view = panView(hand.current.view, 150, 75);
  assert.deepEqual(hand.pending.state.view, { scale: 1, offsetX: 0, offsetY: 0 });
  foot.edit('反相', state => { state.appearance.invert = true; });
  hand.cancel(); hand.undo();
  assert.equal(hand.current.measurements.length, 0); assert.ok(hand.current.calibration);
  assert.equal(foot.current.appearance.invert, true); assert.equal(foot.past.length, 1);
  foot.undo(); assert.equal(foot.current.appearance.invert, false);
  hand.redo(); assert.equal(hand.current.measurements.length, 1);
});

test('failed edits and invalid drag commits roll back every partial change', () => {
  const history = new History(initialState(600, 500)), original = clone(history.current);
  assert.throws(() => history.edit('无效校准', state => {
    state.appearance.invert = true;
    state.calibration = { a: { x: 1, y: 1 }, b: { x: 1, y: 1 }, lengthMm: 10 };
  }), /至少/);
  assert.deepEqual(history.current, original); assert.equal(history.past.length, 0); assert.equal(history.pending, null);
  history.begin('无效平移'); history.current.view.offsetX = Infinity;
  assert.throws(() => history.commit(), /平移/);
  assert.deepEqual(history.current, original); assert.equal(history.pending, null);
  assert.equal(history.edit('没有变化', () => {}), false); assert.equal(history.past.length, 0);
});

test('state-returning edits, history limits and replacement preserve undo semantics', () => {
  const history = new History(initialState(600, 500), 2);
  history.edit('校准', state => calibrate(state, { x: 0, y: 0 }, { x: 100, y: 0 }, 20));
  history.edit('亮度', state => { state.appearance.brightness = .2; });
  history.edit('对比度', state => { state.appearance.contrast = 2; });
  assert.equal(history.past.length, 2);
  history.undo(); history.undo(); assert.equal(history.undo(), false);
  assert.ok(history.current.calibration); assert.equal(history.current.appearance.brightness, 0);
  history.edit('反相', state => { state.appearance.invert = true; }); assert.equal(history.redo(), false);
  const invalid = clone(history.current); invalid.measurements.push({ id: 'measure-1', a: { x: -1, y: 0 }, b: { x: 10, y: 0 } });
  const previous = clone(history.current); assert.throws(() => history.replace(invalid)); assert.deepEqual(history.current, previous);
  history.replace(initialState(300, 200, 'replacement')); assert.equal(history.current.imageId, 'replacement'); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
});

test('backup validation round trips known fields and rejects unknown, duplicate and malformed fields', () => {
  const valid = calibrate(initialState(1000, 800), { x: 0, y: 0 }, { x: 200, y: 0 }, 50); valid.measurements.push(clone(ruler));
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(valid))), valid);
  const cases = [
    state => { state.remoteUrl = 'https://invalid.test/image.jpg'; },
    state => { state.imageId = '../sample'; },
    state => { state.image.width = 1000.5; },
    state => { state.image.height = 8193; },
    state => { state.view.scale = 0; },
    state => { state.view.offsetY = NaN; },
    state => { state.appearance.contrast = Infinity; },
    state => { state.appearance.invert = 1; },
    state => { state.calibration.unit = 'cm'; },
    state => { state.measurements.push(clone(ruler)); },
    state => { state.measurements[0].a.x = -1; },
    state => { state.measurements[0].extra = true; },
    state => { state.measurements = new Array(1); },
    state => { state.measurements.extra = true; },
    state => { delete state.image; },
  ];
  for (const corrupt of cases) { const state = clone(valid); corrupt(state); assert.throws(() => validateState(state)); }
  const inherited = Object.assign(Object.create({ hidden: true }), valid); assert.throws(() => validateState(inherited));
  const tooMany = initialState(10, 10); tooMany.measurements = Array.from({ length: 101 }, (_, i) => ({ id: `measure-${i + 1}`, a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }));
  assert.throws(() => validateState(tooMany), /100/);
});

test('invalid geometry arguments fail explicitly instead of creating non-finite viewport state', () => {
  const viewport = initialState(100, 100).view;
  for (const factor of [0, -1, NaN, Infinity]) assert.throws(() => zoomAt(viewport, { x: 10, y: 10 }, factor));
  assert.throws(() => panView(viewport, Infinity, 0));
  assert.throws(() => fitView(100, 100, 0, 100));
  assert.throws(() => fitView(100, 100, 100, 100, -1));
  assert.throws(() => initialState(0, 100));
  assert.throws(() => new History(initialState(100, 100), 0));
  assert.throws(() => new History(initialState(100, 100), 41));
});
