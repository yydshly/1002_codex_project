import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECORDS, MAX_PATH_POINTS, MAX_FILE_BYTES, FISH_RADIUS, SWIM_Y, WATER_BOUNDS, CENTER_BOUNDS, INITIAL_FISH, REEFS,
  VIEWS, initialState, validateState, cameraForView, canMove, appendDrag, resetFish, setView, setCamera,
  serializeState, parseState, History,
} from '../web/underwater/core.js';

const p0 = () => [...INITIAL_FISH.position];
const direct = state => appendDrag(state, [state.fish.position, [-.6, 1.35]]);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const alternations = count => {
  let state = initialState();
  for (let i = 0; i < count; i++) state = appendDrag(state, [state.fish.position, i % 2 ? p0() : [-.6, 1.35]]);
  return state;
};

test('registered geometry has a fixed swim layer and protects the full fish envelope at the water boundary', () => {
  assert.equal(SWIM_Y, .95); assert.equal(FISH_RADIUS, .3); assert.equal(REEFS.length, 3);
  assert.ok(Object.isFrozen(REEFS)); assert.ok(Object.isFrozen(REEFS[0].position));
  assert.equal(CENTER_BOUNDS.minX, WATER_BOUNDS.minX + FISH_RADIUS);
  assert.equal(canMove([-2.35, 1.45], [-2.35, -1.45]).valid, true);
  assert.equal(canMove([-2.35000001, 1], [-2.35, 1]).valid, false);
  assert.equal(canMove(p0(), [0, 1.45000001]).valid, false);
  assert.deepEqual(validateState(initialState()), initialState());
  for (const id of Object.keys(VIEWS)) assert.deepEqual(setView(initialState(), id).camera, cameraForView(id));
});

test('swept collision rejects a jump across a reef even with valid endpoints; tangency is allowed', () => {
  assert.equal(canMove([-1.9, -.45], [-1.9, -.45]).valid, true);
  assert.equal(canMove([.1, -.45], [.1, -.45]).valid, true);
  assert.equal(canMove([-1.9, -.45], [.1, -.45]).valid, false);
  assert.equal(canMove([-.8, -.45], p0()).valid, false);
  const radius = REEFS[0].radius + FISH_RADIUS;
  assert.equal(canMove([-1.9, -.45 + radius], [.1, -.45 + radius]).valid, true);
  assert.equal(canMove([-1.9, -.45 + radius - 1e-6], [.1, -.45 + radius - 1e-6]).valid, false);
  assert.equal(canMove(p0(), [NaN, 1]).valid, false); assert.equal(canMove(p0(), [Infinity, 1]).valid, false);
});

test('a valid curved drag preserves the exact requested endpoint, every turning point and derived heading', () => {
  const baseline = initialState();
  const path = [p0(), [-1.7, 1.35], [-.3, 1.35], [.85, 1.4], [2.1, 1.4]];
  const state = appendDrag(baseline, path);
  assert.deepEqual(state.records, [{ id: 1, path }]); assert.equal(state.nextId, 2);
  assert.deepEqual(state.fish.position, [2.1, 1.4]); assert.equal(state.fish.heading, 0);
  assert.deepEqual(baseline, initialState()); assert.deepEqual(parseState(serializeState(state)), state);
  path.at(-1)[0] = 0; assert.deepEqual(state.fish.position, [2.1, 1.4]);
  const south = appendDrag(initialState(), [p0(), [-1.85, .2]]);
  near(south.fish.heading, Math.PI / 2);
});

test('invalid preview segments are pure and releasing an illegal complete path leaves the full prior state unchanged', () => {
  const state = setView(direct(initialState()), 'top'), baseline = structuredClone(state);
  const path = [state.fish.position, [-1.9, .4], [-1.9, -.45], [.1, -.45]];
  assert.equal(canMove(path[2], path[3]).valid, false);
  assert.throws(() => appendDrag(state, path), /路径穿过礁石/);
  assert.deepEqual(state, baseline);
  assert.throws(() => appendDrag(state, [p0(), [-2, 1]]), /起点必须/); assert.deepEqual(state, baseline);
});

test('zero final displacement consumes neither a record nor an ID, including a valid out-and-back gesture', () => {
  const state = initialState();
  assert.deepEqual(appendDrag(state, [p0(), p0()]), state);
  assert.deepEqual(appendDrag(state, [p0(), [-1.8, 1.2], p0()]), state);
  const exhausted = { ...state, nextId: 1_000_000 };
  assert.deepEqual(appendDrag(exhausted, [p0(), p0()]), exhausted);
  assert.throws(() => appendDrag(exhausted, [p0(), [-1.8, 1.2]]), /编号已达到上限/);
  const finalId = appendDrag({ ...state, nextId: 999_999 }, [p0(), [-1.8, 1.2]]);
  assert.equal(finalId.records[0].id, 999_999); assert.equal(finalId.nextId, 1_000_000);
});

test('bounded records never discard old paths; reset preserves monotonically increasing IDs and is fully undoable', () => {
  const full = alternations(MAX_RECORDS), baseline = structuredClone(full);
  assert.equal(full.records.length, 40); assert.equal(full.nextId, 41);
  assert.throws(() => direct(full), /已满 40 条/); assert.deepEqual(full, baseline);
  const history = new History(full); history.edit('重置', resetFish);
  assert.deepEqual(history.current.fish, { position: p0(), heading: 0 }); assert.deepEqual(history.current.records, []);
  assert.equal(history.current.nextId, 41); history.undo(); assert.deepEqual(history.current, baseline);
  history.redo(); history.edit('新拖动', direct); assert.equal(history.current.records[0].id, 41);
});

test('complete path imports reject mismatched chains, endpoints, headings, IDs, boundary violations and hidden crossings', () => {
  const correct = direct(initialState());
  const rejects = [];
  const wrongEnd = structuredClone(correct); wrongEnd.fish.position = p0(); rejects.push(wrongEnd);
  const wrongHeading = structuredClone(correct); wrongHeading.fish.heading = 0; rejects.push(wrongHeading);
  const wrongStart = structuredClone(correct); wrongStart.records[0].path[0] = [-2, .9]; rejects.push(wrongStart);
  const wrongId = structuredClone(correct); wrongId.nextId = 1; rejects.push(wrongId);
  const outOfBounds = structuredClone(correct); outOfBounds.records[0].path[1] = [2.5, 1.35]; rejects.push(outOfBounds);
  const crossing = structuredClone(correct); crossing.records[0].path = [p0(), [-1.9, .4], [-1.9, -.45], [.1, -.45]];
  crossing.fish.position = [.1, -.45]; crossing.fish.heading = 0; rejects.push(crossing);
  const repeated = appendDrag(correct, [correct.fish.position, p0()]); repeated.records[1].id = 1; rejects.push(repeated);
  const initialTamper = initialState(); initialTamper.fish.position = [-2, 1]; rejects.push(initialTamper);
  for (const state of rejects) assert.throws(() => parseState(JSON.stringify(state)));
  assert.deepEqual(parseState(JSON.stringify(correct)), correct);
});

test('cross-engine atan2 rounding preserves the imported heading exactly while rejecting a meaningful mismatch', () => {
  const state = appendDrag(initialState(), [p0(), [-2, .75]]), derived = state.fish.heading;
  const oneUlp = new Float64Array([derived]), bits = new BigUint64Array(oneUlp.buffer);
  bits[0] += 1n;
  assert.notEqual(oneUlp[0], derived); assert.ok(Math.abs(oneUlp[0] - derived) < 1e-12);
  state.fish.heading = oneUlp[0];
  const serialized = JSON.stringify(state), restored = parseState(serialized);
  assert.equal(restored.fish.heading, oneUlp[0]); assert.deepEqual(restored, state);
  assert.equal(serializeState(restored), serialized);
  state.fish.heading = derived + 5e-13;
  assert.equal(parseState(JSON.stringify(state)).fish.heading, state.fish.heading);
  state.fish.heading = derived + 2e-12;
  assert.throws(() => parseState(JSON.stringify(state)), /方向与完整拖动记录不一致/);
  state.fish.heading = derived + .01;
  assert.throws(() => parseState(JSON.stringify(state)), /方向与完整拖动记录不一致/);
});

test('strict imports and path limits reject sparse arrays, executable getters, extra fields and overlarge input atomically', () => {
  const correct = initialState();
  assert.throws(() => validateState({ ...correct, diver: {} }));
  assert.throws(() => validateState({ ...correct, fish: { ...correct.fish, y: SWIM_Y } }));
  assert.throws(() => validateState({ ...correct, camera: { ...correct.camera, zoom: 1 } }));
  let getterCalled = false; const accessors = { ...correct };
  Object.defineProperty(accessors, 'version', { enumerable: true, get() { getterCalled = true; return 1; } });
  assert.throws(() => validateState(accessors)); assert.equal(getterCalled, false);
  assert.throws(() => appendDrag(correct, new Array(3)));
  const addedField = [p0(), [-1.8, 1.2]]; addedField.note = 'unexpected'; assert.throws(() => appendDrag(correct, addedField));
  assert.throws(() => appendDrag(correct, Array.from({ length: MAX_PATH_POINTS + 1 }, p0)), /2 至 64/);
  assert.throws(() => parseState(' '.repeat(MAX_FILE_BYTES) + JSON.stringify(correct)), /64 KiB/);
  assert.throws(() => parseState('坏'.repeat(MAX_FILE_BYTES / 3 + 1)), /64 KiB/);
  assert.throws(() => parseState('{"version":1}'));
  assert.throws(() => parseState('{invalid}'), /无法解析/);
});

test('each committed drag is one whole transaction; Escape, undo and redo restore exact JSON including the camera and records', () => {
  const history = new History(setView(initialState(), 'front')), before = serializeState(history.current);
  history.begin('一次拖动'); history.current = direct(history.current); assert.equal(history.past.length, 0);
  history.cancel(); assert.equal(serializeState(history.current), before); assert.equal(history.future.length, 0);
  history.begin('一次拖动'); history.current = direct(history.current); assert.equal(history.commit(), true);
  const after = serializeState(history.current); assert.equal(history.past.length, 1);
  history.undo(); assert.equal(serializeState(history.current), before); history.redo(); assert.equal(serializeState(history.current), after);
  history.begin('未完成'); history.current = resetFish(history.current); history.undo(); assert.equal(serializeState(history.current), after);
  history.begin('未完成'); history.current = resetFish(history.current); history.redo(); assert.equal(serializeState(history.current), after);
});

test('bad imports and invalid commits preserve the pending baseline and redo; a valid replacement clears all history', () => {
  const history = new History(); history.edit('拖动', direct); history.undo();
  const before = serializeState(history.current); assert.equal(history.future.length, 1);
  assert.throws(() => history.edit('伪造方向', state => { state.fish.heading = 1; }));
  assert.equal(serializeState(history.current), before); assert.equal(history.future.length, 1);
  assert.equal(history.edit('无变更', state => appendDrag(state, [p0(), p0()])), false); assert.equal(history.future.length, 1);
  history.begin('尚未结束'); assert.throws(() => history.replace({ ...initialState(), nextId: 0 }));
  assert.ok(history.pending); history.cancel(); history.redo(); const complete = serializeState(history.current);
  history.begin('非法提交'); history.current.fish.position = p0(); assert.throws(() => history.commit());
  assert.equal(serializeState(history.current), complete); assert.equal(history.pending, null);
  history.replace(parseState(complete)); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
});

test('view/camera edits keep fish input untouched and camera limits reject malformed imported perspectives', () => {
  const moved = direct(initialState()), camera = { position: [4.5, 3.8, 6], target: [.2, .7, 0] };
  const custom = setCamera(moved, camera); assert.equal(custom.view, 'custom'); assert.deepEqual(custom.camera, camera);
  assert.deepEqual(custom.fish, moved.fish); assert.deepEqual(custom.records, moved.records);
  assert.throws(() => setCamera(moved, { position: [0, .5, 0], target: [0, .65, 0] }));
  assert.throws(() => setCamera(moved, { position: [20, 4, 5], target: [0, .65, 0] }));
  assert.throws(() => setView(moved, 'diver')); assert.deepEqual(moved, direct(initialState()));
});
