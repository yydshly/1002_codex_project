import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS, SOURCE_IDS, TARGETS, LIMITS, clone, initialState, validateState, sourceRectFromDrag, clientToCanvas, canvasToClient, pointInTarget, strokeSpacing, estimateStampCount, resampleStroke, makeStroke, addStroke, History } from '../web/creative/core.js';

const line = [[100, 100, .5], [250, 150, .8]];
const closePoints = (a, b) => {
  assert.equal(a.length, b.length);
  a.forEach((point, index) => point.forEach((value, axis) => assert.ok(Math.abs(value - b[index][axis]) < 1e-8)));
};

test('each stroke retains its own immutable source, crop, brush and target for exact saved replay', () => {
  const original = initialState(), first = addStroke(original, line);
  assert.equal(first.layers[0].strokes[0].id, 'stroke-1');
  assert.deepEqual(original, initialState());
  const savedStroke = clone(first.layers[0].strokes[0]);
  first.source = { id: 'wheat', rect: [.1, .2, .7, .6] };
  first.brush = { size: 110, opacity: .3 }; first.target = 'right'; first.activeLayer = 'paint';
  const second = addStroke(first, [[800, 600, 1]]);
  assert.deepEqual(second.layers[0].strokes[0], savedStroke);
  assert.equal(second.layers[1].strokes[0].source.id, 'wheat');
  assert.equal(second.layers[1].strokes[0].target, 'right');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(second))), second);
  const roundTrip = validateState(second);
  roundTrip.layers[0].strokes[0].source.rect[0] = 0;
  roundTrip.layers[0].strokes[0].points[0][0] = 0;
  assert.deepEqual(second.layers[0].strokes[0], savedStroke);
});

test('source drag geometry clamps reverse drags and near-edge clicks into a usable normalized crop', () => {
  assert.deepEqual(sourceRectFromDrag([.8, .7], [.2, .1]), [.2, .1, .6000000000000001, .6]);
  assert.deepEqual(sourceRectFromDrag([-2, -3], [4, 5]), [0, 0, 1, 1]);
  for (const point of [[0, 0], [1, 1], [.99, .999], [.5, .5]]) {
    const rect = sourceRectFromDrag(point, point), state = initialState(); state.source.rect = rect;
    assert.doesNotThrow(() => validateState(state));
    assert.equal(rect[2], LIMITS.minSourceSize); assert.equal(rect[3], LIMITS.minSourceSize);
    assert.ok(rect[0] >= 0 && rect[1] >= 0 && rect[0] + rect[2] <= 1 && rect[1] + rect[3] <= 1);
  }
  assert.throws(() => sourceRectFromDrag([NaN, 0], [1, 1]));
});

test('paper coordinates remain invariant across CSS sizes and target geometry is explicit', () => {
  const paper = [360, 270];
  for (const bounds of [{ left: 30, top: 40, width: 800, height: 600 }, { left: 10, top: 100, width: 320, height: 240 }]) {
    const client = canvasToClient(paper, bounds);
    closePoints([clientToCanvas(client, bounds)], [paper]);
    assert.deepEqual(clientToCanvas([bounds.left - 10, bounds.top - 10], bounds), [0, 0]);
    assert.ok(clientToCanvas([bounds.left - 10, bounds.top], bounds, false)[0] < 0);
  }
  assert.deepEqual(TARGETS.left, [90, 110, 380, 300]);
  assert.deepEqual(TARGETS.right, [730, 520, 380, 300]);
  assert.equal(pointInTarget('left', [90, 110]), true);
  assert.equal(pointInTarget('left', [470, 410]), true);
  assert.equal(pointInTarget('left', [471, 410]), false);
  assert.equal(pointInTarget('right', [900, 600]), true);
  assert.equal(pointInTarget('left', [900, 600]), false);
  assert.throws(() => clientToCanvas([10, 20], { left: 0, top: 0, width: 0, height: 1 }));
  assert.throws(() => pointInTarget('constructor', [0, 0]));
});

test('distance resampling is independent of event subdivision and carries interpolated pressure around corners', () => {
  const coarse = [[0, 0, .2], [100, 0, .8], [100, 80, .4]];
  const dense = [[0, 0, .2], [25, 0, .35], [50, 0, .5], [75, 0, .65], [100, 0, .8], [100, 20, .7], [100, 40, .6], [100, 60, .5], [100, 80, .4]];
  closePoints(resampleStroke(coarse, 7), resampleStroke(dense, 7));
  const sampled = resampleStroke(coarse, 30);
  assert.deepEqual(sampled[0], coarse[0]); assert.deepEqual(sampled.at(-1), coarse.at(-1));
  closePoints([sampled[4]], [[100, 20, .7]]);
  const uneven = [[.3, 20, .5], [2.7, 20, .5], [90.6, 20, .5], [120.3, 20, .5]];
  const pair = [uneven[0], uneven.at(-1)];
  closePoints(resampleStroke(uneven, 3.7), resampleStroke(pair, 3.7));
});

test('clicks and repeated points create one stamp without NaN, and hostile spacing cannot allocate unbounded stamps', () => {
  assert.deepEqual(resampleStroke([[10, 20, .5]], 4), [[10, 20, .5]]);
  assert.deepEqual(resampleStroke([[10, 20, .5], [10, 20, 0], [10, 20, .9]], 4), [[10, 20, .5]]);
  assert.deepEqual(resampleStroke([[0, 0, 1], [0, 0, 1], [10, 0, 1], [10, 0, 0]], 5), [[0, 0, 1], [5, 0, 1], [10, 0, 1]]);
  for (const spacing of [0, -1, NaN, Infinity, 1e-12]) assert.throws(() => resampleStroke([[0, 0, 1], [1200, 900, 1]], spacing));
  assert.throws(() => resampleStroke([], 4));
});

test('strict backups reject injected assets, malformed layers, ID conflicts, invalid crops and nonfinite samples', () => {
  const corruptions = [
    state => { state.version = 2; }, state => { state.assets = {}; }, state => { state.base = 'remote-image'; },
    state => { state.source.id = 'monet'; }, state => { state.source.url = 'https://invalid'; },
    state => { state.source.rect = [0, 0, .024, .4]; }, state => { state.source.rect = [.9, 0, .2, 1]; },
    state => { state.source.rect[0] = NaN; }, state => { state.brush.size = 141; }, state => { state.brush.opacity = .14; },
    state => { state.target = 'constructor'; }, state => { state.target = ['all']; }, state => { state.activeLayer = 'hidden'; },
    state => { state.layers.pop(); }, state => { state.layers[1].id = 'texture'; }, state => { state.layers[0].visible = 1; },
    state => { state.nextId = 1; }, state => { state.layers[0].strokes[0].id = 'stroke-01'; },
    state => { state.layers[0].strokes[0].mode = 'paint'; }, state => { state.layers[0].strokes[0].points[0][2] = 2; },
    state => { state.layers[0].strokes[0].points[0][0] = 1201; }, state => { state.layers[0].strokes[0].points[0][1] = Infinity; },
    state => { state.layers[0].strokes[0].points[0].extra = 1; }, state => { delete state.layers[0].strokes[0].points[0][1]; },
    state => { state.layers[0].strokes[0].points = []; }, state => { state.layers[0].strokes.custom = 1; },
    state => { state.layers[1].strokes.push({ ...clone(state.layers[0].strokes[0]), mode: 'paint' }); },
    state => { state[Symbol('hidden')] = true; },
  ];
  for (const corrupt of corruptions) {
    const state = addStroke(initialState(), line); corrupt(state);
    assert.throws(() => validateState(state));
  }
  assert.throws(() => validateState(Object.assign(Object.create({ imported: true }), initialState())));
  for (const source of SOURCE_IDS) for (const mode of ['texture', 'paint']) {
    const state = initialState(); state.source.id = source; state.activeLayer = mode;
    assert.doesNotThrow(() => addStroke(state, line));
  }
});

test('stroke and coordinate capacities reject whole additions without mutating the existing drawing', () => {
  const template = makeStroke(initialState(), [[100, 100, .5]]);
  const state = initialState();
  state.layers[0].strokes = Array.from({ length: 200 }, (_, i) => ({ ...clone(template), id: `stroke-${i + 1}` }));
  state.nextId = 201;
  assert.doesNotThrow(() => validateState(state));
  const before = clone(state);
  assert.throws(() => addStroke(state, line), /200/); assert.deepEqual(state, before);
  state.activeLayer = 'paint';
  state.layers[1].strokes = Array.from({ length: 100 }, (_, i) => ({ ...clone(template), id: `stroke-${i + 201}`, mode: 'paint' }));
  state.nextId = 301;
  assert.throws(() => addStroke(state, line), /300/);
  const manyPoints = initialState(), points = Array.from({ length: 5000 }, () => [100, 100, .5]);
  manyPoints.layers[0].strokes = Array.from({ length: 20 }, (_, i) => ({ ...clone(template), id: `stroke-${i + 1}`, points: clone(points) }));
  manyPoints.nextId = 21;
  assert.doesNotThrow(() => validateState(manyPoints));
  assert.throws(() => addStroke(manyPoints, [[0, 0, .5]]), /100000/);
  assert.throws(() => makeStroke(initialState(), [...points, [0, 0, .5]]), /5000/);
});

test('otherwise valid long zigzag JSON is rejected before replay, while repeated coordinates cost one stamp', () => {
  const state = addStroke(initialState(), line), before = clone(state);
  const hostile = clone(state), stroke = hostile.layers[0].strokes[0];
  stroke.size = 8;
  stroke.points = Array.from({ length: 5000 }, (_, i) => i % 2 ? [1200, 900, .5] : [0, 0, .5]);
  assert.throws(() => validateState(JSON.parse(JSON.stringify(hostile))), /印记/);
  assert.deepEqual(state, before);
  const history = new History(state);
  assert.throws(() => history.edit('打开过长路径', () => hostile), /印记/);
  assert.deepEqual(history.current, before); assert.equal(history.past.length, 0);
  const one = { mode: 'texture', size: 8 }, spacing = strokeSpacing(one);
  assert.equal(spacing, 1.28);
  assert.equal(estimateStampCount(Array.from({ length: 5000 }, () => [40, 50, .5]), spacing), 1);
  const replayable = [[0, 0, .5], [1200, 900, .5]];
  assert.equal(estimateStampCount(replayable, spacing), resampleStroke(replayable, spacing).length);
  const many = initialState(), sample = makeStroke(many, replayable);
  sample.size = 8;
  many.layers[0].strokes = Array.from({ length: 180 }, (_, i) => ({ ...clone(sample), id: `stroke-${i + 1}` }));
  many.nextId = 181;
  assert.throws(() => validateState(many), /全图/);
});

test('one pen gesture is one transaction; undo while pending cancels only that unfinished pen gesture', () => {
  const history = new History();
  history.edit('第一笔', state => addStroke(state, line));
  const completed = clone(history.current);
  history.begin('正在画第二笔');
  history.current = addStroke(history.current, [[300, 400, .5]]);
  history.current.layers[0].strokes.at(-1).points.push([330, 420, .7], [340, 430, .8]);
  assert.equal(history.begin('重复按下'), false);
  assert.equal(history.undo(), true); assert.deepEqual(history.current, completed);
  assert.equal(history.past.length, 1); assert.equal(history.future.length, 0);
  history.begin('完整第二笔'); history.current = addStroke(history.current, line);
  assert.equal(history.commit(), true); assert.equal(history.past.length, 2);
  const two = clone(history.current);
  history.undo(); assert.deepEqual(history.current, completed);
  history.redo(); assert.deepEqual(history.current, two);
});

test('invalid edits and imports restore every field atomically and new edits branch after undo', () => {
  const history = new History(), before = clone(history.current);
  assert.throws(() => history.edit('失败读取', state => { state.source.id = 'river'; throw new Error('decode failed'); }));
  assert.deepEqual(history.current, before);
  history.begin('未完成一笔'); history.current = addStroke(history.current, line);
  const pending = clone(history.current);
  assert.throws(() => history.replace({ ...initialState(), nextId: NaN }));
  assert.deepEqual(history.current, pending); assert.ok(history.pending);
  assert.throws(() => history.edit('嵌套操作', () => {}));
  history.current.layers[0].strokes[0].points[0][0] = NaN;
  assert.throws(() => history.commit()); assert.deepEqual(history.current, before);
  history.edit('第一笔', state => addStroke(state, line)); history.undo();
  history.edit('换底图', state => { state.base = 'paper'; }); assert.equal(history.redo(), false);
  history.replace(initialState()); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
  for (let i = 0; i < 45; i++) history.edit('工具设置', state => { state.brush.size = i % 2 ? 30 : 40; });
  assert.equal(history.past.length, 40);
});
