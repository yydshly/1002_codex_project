import test from 'node:test';
import assert from 'node:assert/strict';
import * as old from '../web/underwater/core.js';
import {
  VERSION, MAX_FILE_BYTES, MAX_DIVER_PATH_POINTS, INITIAL_DIVER, MIN_SEPARATION,
  initialState, validateState, serializeState, parseState, appendDrag, resetFish,
  setView, setCamera, canFishPastDiver, History,
} from '../web/underwater/workspace.js';
import { canDiverMove, planFollow, advanceFollower } from '../web/underwater/follower.js';

const copy = value => structuredClone(value);
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const trackTo = (from, fish) => {
  let pose = copy(from), plan = planFollow(pose, fish), path = [[...pose.position]], settled = false;
  for (let i = 0; i < 250 && !settled; i++) {
    const frame = advanceFollower(plan, pose, .1); pose = frame.pose; plan = frame.plan; settled = frame.settled;
    if (!samePoint(path.at(-1), pose.position)) path.push([...pose.position]);
  }
  assert.equal(settled, true, 'fixture follower must settle through finite speed steps');
  assert.ok(path.length <= MAX_DIVER_PATH_POINTS);
  return { from: copy(from), to: pose, path };
};
const move = (state = initialState(), end = [-.7, 1.3]) =>
  appendDrag(state, [state.fish.position, end], trackTo(state.diver, end));

test('schema 2 registers a lawful initial pair and retains independent finite-precision diver headings', () => {
  const state = initialState();
  assert.equal(state.version, VERSION); assert.deepEqual(state.diver, INITIAL_DIVER);
  assert.ok(distance(state.fish.position, state.diver.position) >= MIN_SEPARATION);
  assert.deepEqual(validateState(state), state);
  state.diver.heading += 5e-13;
  assert.deepEqual(parseState(serializeState(state)), state);
  const setup = initialState(); setup.diver = { position: [-2.1, -.95], heading: .18273645123456789 };
  assert.deepEqual(parseState(JSON.stringify(setup)), setup);
  setup.diver.position = [...setup.fish.position]; assert.throws(() => validateState(setup), /间距保护/);
});

test('v1 migration retains every fish row, ID, camera and angle, adding only honest stationary legacy diver evidence', () => {
  let legacy = old.appendDrag(old.initialState(), [old.INITIAL_FISH.position, [-.7, 1.3]]);
  legacy = old.setCamera(legacy, { position: [4.2, 4.1, 5.9], target: [.2, .65, .1] });
  legacy.fish.heading += 5e-13;
  const source = old.serializeState(legacy), migrated = parseState(source);
  assert.equal(migrated.version, 2); assert.equal(migrated.view, legacy.view);
  assert.deepEqual(migrated.camera, legacy.camera); assert.deepEqual(migrated.fish, legacy.fish);
  assert.equal(migrated.nextId, legacy.nextId); assert.equal(migrated.records.length, legacy.records.length);
  for (let i = 0; i < legacy.records.length; i++) {
    assert.deepEqual({ id: migrated.records[i].id, path: migrated.records[i].path }, legacy.records[i]);
    assert.equal(migrated.records[i].diver.legacy, true);
    assert.deepEqual(migrated.records[i].diver.from, migrated.diver);
    assert.deepEqual(migrated.records[i].diver.to, migrated.diver);
    assert.deepEqual(migrated.records[i].diver.path, [[...migrated.diver.position]]);
  }
  assert.equal(old.serializeState(legacy), source);
  assert.deepEqual(parseState(serializeState(migrated)), migrated);
});

test('migration relocates only initialization when the retained final fish overlaps the default diver', () => {
  const legacy = old.appendDrag(old.initialState(), [old.INITIAL_FISH.position, [-1.9, .1], [-1.9, -.5], [-1.85, -.95]]);
  const migrated = parseState(old.serializeState(legacy));
  assert.deepEqual(migrated.fish, legacy.fish); assert.equal(migrated.nextId, 2);
  assert.notDeepEqual(migrated.diver.position, INITIAL_DIVER.position);
  assert.ok(Math.abs(distance(migrated.diver.position, migrated.fish.position) - 1) < 1e-12);
  assert.equal(canDiverMove(migrated.diver.position, migrated.diver.position).valid, true);
  assert.deepEqual(migrated.records[0].diver.path, [[...migrated.diver.position]]);
  assert.equal(migrated.records[0].diver.legacy, true);
  const malformed = copy(legacy); malformed.fish.heading += .1;
  assert.throws(() => parseState(JSON.stringify(malformed)), /方向与完整拖动记录不一致/);
});

test('a committed input contains the exact fish endpoint and full finite-speed diver trace, facing and pose chain', () => {
  const base = initialState(), path = [base.fish.position, [-.7, 1.3]], track = trackTo(base.diver, path.at(-1));
  const result = appendDrag(base, path, track);
  assert.equal(result.records.length, 1); assert.equal(result.nextId, 2);
  assert.deepEqual(result.records[0].path, path); assert.deepEqual(result.fish.position, path.at(-1));
  assert.deepEqual(result.records[0].diver, { ...track, legacy: false }); assert.deepEqual(result.diver, track.to);
  assert.deepEqual(base, initialState()); assert.deepEqual(parseState(serializeState(result)), result);
  const restored = parseState(serializeState(result));
  restored.diver.heading += 5e-13; restored.records[0].diver.to.heading = restored.diver.heading;
  assert.equal(parseState(serializeState(restored)).diver.heading, restored.diver.heading);
  const second = move(result, [-1.95, 1.2]);
  assert.deepEqual(second.records[1].diver.from, result.diver);
  track.to.position[0] = 0; path.at(-1)[0] = 0;
  assert.deepEqual(result.fish.position, [-.7, 1.3]); assert.notEqual(result.diver.position[0], 0);
});

test('new diver ledger rejects hidden reef crossings, mismatched path endpoints, invalid pose chains and final pair overlap', () => {
  const correct = move(), variants = [];
  const fromMismatch = copy(correct); fromMismatch.records[0].diver.path[0] = [-2.1, -.95]; variants.push(fromMismatch);
  const toMismatch = copy(correct); toMismatch.records[0].diver.path.at(-1)[0] -= .1; variants.push(toMismatch);
  const hiddenCrossing = copy(correct); hiddenCrossing.records[0].diver.path.splice(1, 0, [-1.9, -.45], [.15, -.45]); variants.push(hiddenCrossing);
  const wrongCurrent = copy(correct); wrongCurrent.diver.heading += .01; variants.push(wrongCurrent);
  const invalidHeading = copy(correct); invalidHeading.records[0].diver.to.heading = Infinity; variants.push(invalidHeading);
  const second = move(correct, [-1.95, 1.2]); second.records[1].diver.from.heading += 1e-9; variants.push(second);
  const overlap = initialState(); overlap.diver = { position: [-1.85, .9], heading: 0 }; variants.push(overlap);
  const legacyMotion = copy(correct); legacyMotion.records[0].diver.legacy = true; variants.push(legacyMotion);
  for (const variant of variants) assert.throws(() => validateState(variant));
  assert.deepEqual(parseState(serializeState(correct)), correct);
});

test('old diver trace may cross the final fish station because the two characters move concurrently', () => {
  const base = initialState(), end = [-1.85, .4];
  const track = { from: copy(base.diver), to: { position: [-1.85, 1.15], heading: Math.PI / 2 },
    path: [[-1.85, -.95], [-1.85, .4], [-1.85, 1.15]] };
  // Static constraints admit this full route; only its final pair is checked.
  assert.equal(canDiverMove(track.path[0], track.path[2]).valid, true);
  assert.equal(canDiverMove(track.path[0], track.path[2], { fish: end }).valid, false);
  const state = appendDrag(base, [base.fish.position, end], track);
  assert.deepEqual(state.records[0].diver.path, track.path);
  assert.deepEqual(parseState(serializeState(state)), state);
});

test('manual fish sweep rejects the whole diver body even when both fish endpoints remain lawful', () => {
  const diver = { position: [-1.85, .2], heading: 0 };
  const from = [-1.85, 1.1], to = [-1.85, -.8];
  assert.equal(old.canMove(from, to).valid, true);
  assert.equal(canFishPastDiver(from, from, diver).valid, true);
  assert.equal(canFishPastDiver(to, to, diver).valid, true);
  assert.equal(canFishPastDiver(from, to, diver).valid, false);
  const tangent = [-1.85 + MIN_SEPARATION, .2 + 1];
  assert.equal(canFishPastDiver(tangent, tangent, diver).valid, true);
  assert.equal(canFishPastDiver(from, [Infinity, 0], diver).valid, false);
});

test('zero fish input cancels follower preview without consuming any record or ID, including exhausted workspaces', () => {
  const base = initialState(), fake = { from: copy(base.diver), to: { position: [-2, -.95], heading: 1 },
    path: [base.diver.position, [-2, -.95]] };
  assert.deepEqual(appendDrag(base, [], fake), base);
  assert.deepEqual(appendDrag(base, [base.fish.position], fake), base);
  assert.deepEqual(appendDrag(base, [base.fish.position, [-2, 1.2], base.fish.position], fake), base);
  assert.deepEqual(appendDrag({ ...base, nextId: 1_000_000 }, [base.fish.position, base.fish.position], null), { ...base, nextId: 1_000_000 });
  assert.throws(() => appendDrag({ ...base, nextId: 1_000_000 }, [base.fish.position, [-2, 1.2]], fake), /编号已达到上限/);
  assert.deepEqual(base, initialState());
});

test('double actor cancellation and whole transaction undo/redo restore exact JSON, camera, traces and headings', () => {
  const history = new History(setView(initialState(), 'front')), before = serializeState(history.current);
  history.begin('拖鱼及跟随'); history.current = move(history.current);
  assert.equal(history.past.length, 0); history.cancel(); assert.equal(serializeState(history.current), before);
  history.begin('拖鱼及跟随'); history.current = move(history.current); assert.equal(history.commit(), true);
  const after = serializeState(history.current); assert.equal(history.past.length, 1);
  history.undo(); assert.equal(serializeState(history.current), before); history.redo(); assert.equal(serializeState(history.current), after);
  history.begin('尚未停稳'); history.current.diver.heading += .1;
  history.undo(); assert.equal(serializeState(history.current), after); assert.equal(history.future.length, 0);
  history.begin('尚未停稳'); history.current.diver.heading += .1;
  history.redo(); assert.equal(serializeState(history.current), after);
  history.edit('重置双角色', resetFish); assert.deepEqual(history.current.diver, INITIAL_DIVER);
  assert.deepEqual(history.current.records, []); assert.equal(history.current.nextId, 2);
  history.undo(); assert.equal(serializeState(history.current), after);
});

test('invalid pair edits roll back atomically and retain redo; camera and view edits keep both actor ledgers unchanged', () => {
  const history = new History(); history.edit('第一次跟随', state => move(state)); history.undo();
  const before = serializeState(history.current); assert.equal(history.future.length, 1);
  assert.throws(() => history.edit('伪造潜水员方向', state => { state.diver.heading = Infinity; }));
  assert.equal(serializeState(history.current), before); assert.equal(history.future.length, 1);
  assert.equal(history.edit('零净位移', state => appendDrag(state, [state.fish.position, state.fish.position])), false);
  assert.equal(history.future.length, 1); history.redo();
  const moved = copy(history.current), camera = { position: [4.5, 3.8, 6], target: [.2, .7, 0] };
  const custom = setCamera(moved, camera); assert.deepEqual(custom.fish, moved.fish); assert.deepEqual(custom.diver, moved.diver);
  assert.deepEqual(custom.records, moved.records); assert.deepEqual(custom.camera, camera);
  for (const view of Object.keys(old.VIEWS)) assert.deepEqual(setView(moved, view).diver, moved.diver);
  history.begin('非法提交'); history.current.diver.position = [...history.current.fish.position];
  assert.throws(() => history.commit()); assert.deepEqual(history.current, moved); assert.equal(history.pending, null);
  history.replace(custom); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
});

test('schema 2 rejects extra fields, getter execution, sparse paths and array/prototype tricks before persistence', () => {
  const base = initialState(); let getterCalled = false;
  const accessor = { ...base }; Object.defineProperty(accessor, 'diver', { enumerable: true, get() { getterCalled = true; return base.diver; } });
  assert.throws(() => validateState(accessor)); assert.equal(getterCalled, false);
  const diverAccessor = copy(base); Object.defineProperty(diverAccessor.diver, 'heading', { enumerable: true, get() { getterCalled = true; return 0; } });
  assert.throws(() => validateState(diverAccessor)); assert.equal(getterCalled, false);
  assert.throws(() => validateState({ ...base, follows: true }));
  assert.throws(() => validateState({ ...base, diver: { ...base.diver, speed: .8 } }));
  assert.throws(() => validateState(Object.assign(Object.create({ injected: true }), base)));
  const correct = move(), sparse = copy(correct); sparse.records[0].diver.path = new Array(2);
  assert.throws(() => validateState(sparse));
  const added = copy(correct); added.records[0].diver.path.note = 'hidden'; assert.throws(() => validateState(added));
  const dense = copy(correct); dense.records[0].diver.path = Array.from({ length: MAX_DIVER_PATH_POINTS + 1 }, () => [...dense.records[0].diver.from.position]);
  assert.throws(() => validateState(dense), /1 至 128/);
  const recordGetter = copy(correct); Object.defineProperty(recordGetter.records[0], 'path', { enumerable: true, get() { getterCalled = true; return []; } });
  assert.throws(() => validateState(recordGetter)); assert.equal(getterCalled, false);
});

test('overall 512 KiB raw cap and old 64 KiB source cap are separate from the retained fish canonical ledger bound', () => {
  const v2 = serializeState(initialState());
  assert.throws(() => parseState(' '.repeat(MAX_FILE_BYTES) + v2), /512 KiB/);
  assert.throws(() => parseState('坏'.repeat(MAX_FILE_BYTES / 3 + 1)), /512 KiB/);
  assert.throws(() => parseState(' '.repeat(old.MAX_FILE_BYTES) + old.serializeState(old.initialState())), /64 KiB/);
  assert.throws(() => parseState('{invalid}'), /无法解析/);
  assert.throws(() => parseState('{"version":3}'));
  assert.deepEqual(parseState(' '.repeat(old.MAX_FILE_BYTES) + v2), initialState());
  let state = old.initialState();
  for (let i = 0; i < old.MAX_RECORDS; i++) {
    const destination = i % 2 ? [-1.85, .9] : [-2, 1.2];
    state = old.appendDrag(state, [state.fish.position, destination]);
  }
  const migrated = parseState(old.serializeState(state));
  assert.equal(migrated.records.length, 40);
  assert.throws(() => move(migrated), /已满 40 条/);
  const afterReset = resetFish(migrated); assert.equal(afterReset.nextId, 41);
  assert.equal(move(afterReset).records[0].id, 41);
  const oversizedFish = initialState(); let previous = [...old.INITIAL_FISH.position];
  for (let i = 0; i < old.MAX_RECORDS; i++) {
    const end = i % 2 ? [...old.INITIAL_FISH.position] : [-2, 1.2];
    const path = [previous, ...Array.from({ length: 62 }, (_, j) =>
      [-1.8501234567890123 - j / 100000003, 1.0012345678901234 + j / 100003000]), end];
    const track = { from: copy(INITIAL_DIVER), to: copy(INITIAL_DIVER), path: [[...INITIAL_DIVER.position]], legacy: true };
    oversizedFish.records.push({ id: i + 1, path, diver: track }); previous = end;
  }
  const tail = oversizedFish.records.at(-1).path, end = tail.at(-1), prior = tail.at(-2);
  oversizedFish.fish = { position: end, heading: Math.atan2(-(end[1] - prior[1]), end[0] - prior[0]) };
  oversizedFish.nextId = 41;
  assert.ok(new TextEncoder().encode(JSON.stringify(oversizedFish)).byteLength < MAX_FILE_BYTES);
  assert.throws(() => validateState(oversizedFish), /64 KiB/);
});
