import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, POWER_W, MAX_RECORDS, MATERIAL_IDS, SAMPLES, PORTS, VIEWS, cameraForView, validateCamera,
  initialState, validateState, sample, calculateRun, appendRun, targetAt, setSource, setView,
  selectSample, resetSamples, resetSample, History,
} from '../web/materials/core.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const ledger = () => appendRun(appendRun(appendRun(initialState(), 'copper', 2), 'aluminum', 3), 'ice', 4);

test('bounded teaching samples round trip without sharing mutable state or inventing melting metals', () => {
  const state = initialState(), original = JSON.stringify(state), copy = validateState(JSON.parse(original));
  assert.equal(state.version, VERSION); assert.equal(POWER_W, 10); assert.equal(MAX_RECORDS, 40);
  assert.deepEqual(Object.keys(SAMPLES), MATERIAL_IDS); assert.deepEqual(state.energies, { copper: 0, aluminum: 0, ice: 0 });
  assert.equal(state.nextId, 1); assert.deepEqual(state.records, []); assert.deepEqual(state.source, [0, .7]);
  assert.equal(state.selected, 'copper'); assert.equal(state.view, 'hero'); assert.deepEqual(state.camera, cameraForView('hero'));
  copy.camera.position[0] = 0; copy.source[0] = 1; copy.energies.copper = 10;
  assert.equal(JSON.stringify(state), original);
  for (const id of MATERIAL_IDS) {
    assert.ok(Object.isFrozen(SAMPLES[id]));
    const cold = sample(id, 0), endpoint = sample(id, SAMPLES[id].maxEnergyJ);
    assert.equal(cold.complete, false); assert.equal(cold.progress, 0); assert.equal(endpoint.complete, true);
    if (id !== 'ice') { assert.equal(cold.temperatureC, 25); assert.equal(endpoint.temperatureC, 60); assert.equal(endpoint.phase, 'solid'); assert.equal(endpoint.meltFraction, 0); }
  }
});

test('equal absorbed heat yields greater copper temperature rise than aluminum at the given masses', () => {
  const copper = calculateRun(initialState(), 'copper', 4), aluminum = calculateRun(initialState(), 'aluminum', 4);
  assert.equal(copper.energyJ, 40); assert.equal(aluminum.energyJ, 40);
  assert.equal(copper.seconds, 4); assert.equal(aluminum.seconds, 4);
  const copperRise = copper.sample.temperatureC - 25, aluminumRise = aluminum.sample.temperatureC - 25;
  assert.ok(copperRise > aluminumRise);
  near(copperRise / aluminumRise, 897.141426132353 / 385.083479137046);
  near(.01 * 385.083479137046 * copperRise, 40);
  near(.01 * 897.141426132353 * aluminumRise, 40);
  for (const run of [copper, aluminum]) {
    assert.ok(run.sample.temperatureC < 60); assert.equal(run.sample.meltFraction, 0); assert.equal(run.sample.remainingFraction, 1);
  }
});

test('ice absorbs latent heat at zero Celsius, is half melted at half its energy and stops at full melt', () => {
  const half = sample('ice', 333.4 / 2);
  assert.equal(half.temperatureC, 0); assert.equal(half.meltFraction, .5); assert.equal(half.remainingFraction, .5);
  assert.equal(half.phase, 'melting'); assert.equal(half.complete, false); near(half.seconds, 16.67);
  const state = appendRun(initialState(), 'ice', half.seconds), run = calculateRun(state, 'ice', 1000);
  near(run.energyJ, 166.7); near(run.seconds, 16.67); near(run.totalEnergyJ, 333.4);
  assert.equal(run.sample.temperatureC, 0); assert.equal(run.sample.meltFraction, 1); assert.equal(run.sample.remainingFraction, 0);
  assert.equal(run.sample.phase, 'melted'); assert.equal(run.complete, true); assert.equal(run.remainingSeconds, 0);
  const melted = appendRun(state, 'ice', 1000), after = calculateRun(melted, 'ice', 1000);
  assert.equal(after.energyJ, 0); assert.equal(after.seconds, 0); assert.deepEqual(appendRun(melted, 'ice', 1000), melted);
  assert.equal(melted.records.length, 2); assert.equal(melted.energies.ice, 333.4);
  for (const energy of [0, 1, 120, 166.7, 300, 333.4]) assert.equal(sample('ice', energy).temperatureC, 0);
});

test('automatic limits truncate actual energy and seconds before overflow or heating past the bounded target', () => {
  const initial = initialState(), before = JSON.stringify(initial);
  const expected = { copper: 13.477921769796612, aluminum: 31.39994991463235, ice: 33.34 };
  for (const id of MATERIAL_IDS) {
    const run = calculateRun(initial, id, 1e308);
    near(run.seconds, expected[id]); near(run.energyJ, run.seconds * 10);
    assert.equal(run.totalEnergyJ, SAMPLES[id].maxEnergyJ); assert.equal(run.complete, true); assert.equal(run.remainingSeconds, 0);
    const full = appendRun(initial, id, 1e308);
    assert.equal(full.energies[id], SAMPLES[id].maxEnergyJ); assert.equal(full.records.length, 1);
    assert.equal(full.records[0].seconds, run.seconds); assert.equal(full.records[0].energyJ, run.energyJ);
    const empty = calculateRun(initial, id, 0);
    assert.equal(empty.energyJ, 0); assert.equal(empty.seconds, 0); assert.equal(empty.complete, false);
    assert.deepEqual(appendRun(initial, id, 0), initial);
  }
  assert.equal(JSON.stringify(initial), before);
  for (const seconds of [-1, NaN, Infinity, '1']) assert.throws(() => calculateRun(initial, 'copper', seconds));
  assert.throws(() => sample('copper', SAMPLES.copper.maxEnergyJ + 1e-10));
  assert.throws(() => sample('ice', 333.400000001)); assert.throws(() => sample('ice', -1));
  assert.throws(() => sample('copper', NaN)); assert.throws(() => sample('wood', 1));
});

test('partitioning time preserves physical heat and sample state even though the completed input ledger has more rows', () => {
  for (const id of MATERIAL_IDS) {
    const direct = appendRun(initialState(), id, 12.345);
    let partitioned = initialState();
    for (const seconds of [.1, .2, .345, 1.7, 5, 5]) partitioned = appendRun(partitioned, id, seconds);
    near(partitioned.energies[id], direct.energies[id]);
    near(sample(id, partitioned.energies[id]).temperatureC, sample(id, direct.energies[id]).temperatureC);
    near(sample(id, partitioned.energies[id]).meltFraction, sample(id, direct.energies[id]).meltFraction);
    const completed = appendRun(partitioned, id, 100);
    assert.equal(completed.energies[id], SAMPLES[id].maxEnergyJ);
    near(completed.records.reduce((sum, row) => sum + row.energyJ, 0), SAMPLES[id].maxEnergyJ);
    near(completed.records.reduce((sum, row) => sum + row.seconds, 0), SAMPLES[id].maxEnergyJ / POWER_W);
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(completed))), completed);
  }
});

test('the complete heat ledger matches each sample energy, preserves views and source, and refuses capacity overflow without discarding records', () => {
  const state = selectSample(setView(setSource(initialState(), [.78, 0]), 'front'), 'ice'), original = JSON.stringify(state);
  const changed = appendRun(state, 'aluminum', 2);
  assert.equal(changed.selected, 'ice'); assert.equal(changed.view, 'front'); assert.deepEqual(changed.camera, state.camera);
  assert.deepEqual(changed.source, [.78, 0]); assert.equal(changed.records[0].id, 1); assert.equal(changed.nextId, 2);
  assert.equal(changed.energies.aluminum, 20); assert.equal(JSON.stringify(state), original);
  let full = initialState();
  for (let i = 0; i < 40; i++) full = appendRun(full, MATERIAL_IDS[i % 3], .01);
  assert.equal(full.records.length, 40); assert.equal(full.nextId, 41); assert.equal(full.records[0].id, 1);
  const serialized = JSON.stringify(full);
  assert.throws(() => appendRun(full, 'ice', .01), /满 40/); assert.equal(JSON.stringify(full), serialized);
  for (const id of MATERIAL_IDS) near(full.records.filter(record => record.material === id).reduce((sum, row) => sum + row.energyJ, 0), full.energies[id]);
  assert.throws(() => appendRun({ ...initialState(), nextId: 1_000_000 }, 'ice', 1), /上限/);
});

test('source ports are bounded and only genuine port contact resolves a registered sample', () => {
  const state = initialState(), before = JSON.stringify(state);
  assert.equal(targetAt(state.source), null); assert.equal(targetAt([0, .5]), null);
  for (const port of PORTS) {
    assert.equal(targetAt(port.position), port.id);
    assert.equal(targetAt([port.position[0], port.radius]), port.id);
    assert.equal(targetAt([port.position[0], port.radius + 1e-5]), null);
    assert.ok(Object.isFrozen(port.position));
  }
  assert.deepEqual(setSource(state, [-1.15, -.3]).source, [-1.15, -.3]);
  assert.deepEqual(setSource(state, [1.15, .85]).source, [1.15, .85]);
  for (const point of [[-1.151, 0], [1.151, 0], [0, -.301], [0, .851], [0, Infinity], [0], new Array(2)]) {
    assert.throws(() => setSource(state, point));
  }
  assert.equal(targetAt([100, 100]), null);
  assert.equal(JSON.stringify(state), before); assert.deepEqual(state.energies, { copper: 0, aluminum: 0, ice: 0 });
});

test('registered camera views stay within the common envelope; malformed or impossible cameras reject', () => {
  const state = initialState();
  for (const id of Object.keys(VIEWS)) {
    const camera = cameraForView(id);
    assert.deepEqual(validateCamera(camera), camera); assert.deepEqual(setView(state, id).camera, camera);
    assert.ok(Object.isFrozen(VIEWS[id].position));
  }
  assert.ok(Math.atan(.1 / 4.4) >= .02); // The nearly vertical top view remains restorable without clamp.
  for (const camera of [
    { position: [0, 1, 0], target: [0, 0, 0] }, { position: [0, 4.5, .02], target: [0, .1, 0] },
    { position: [0, 3, 8], target: [0, .1, 0] }, { position: [0, .4, 3], target: [0, .1, 0] },
    { position: [0, 3, 3], target: [2, .1, 0] }, { position: [0, 1, 3], target: [0, 2, 0] },
    { position: [0, 3, 3], target: [0, 0, 0], fov: 40 },
  ]) assert.throws(() => validateCamera(camera));
  assert.throws(() => cameraForView('constructor')); assert.throws(() => setView(state, 'custom'));
  assert.deepEqual(validateState({ ...state, view: 'custom' }).camera, state.camera);
});

test('bad files reject inconsistent or forged ledgers, extra keys, invalid numbers, sparse arrays, prototypes and accessors', () => {
  const state = ledger(), original = JSON.stringify(state), bad = [
    { ...state, version: 2 }, { ...state, selected: 'constructor' }, { ...state, view: '../outside' },
    { ...state, nextId: 3 }, { ...state, nextId: 1.5 }, { ...state, nextId: 1_000_001 },
    { ...state, energies: { ...state.energies, copper: 19.9 } },
    { ...state, energies: { ...state.energies, copper: NaN } },
    { ...state, energies: { ...state.energies, ice: 333.4001 } },
    { ...state, energies: { ...state.energies, power: 20 } },
    { ...state, records: [] }, { ...state, records: new Array(3) },
    { ...state, records: [state.records[1], state.records[0], state.records[2]] },
    { ...state, records: [state.records[0], state.records[0], state.records[2]] },
    { ...state, records: [{ ...state.records[0], id: 0 }, ...state.records.slice(1)] },
    { ...state, records: [{ ...state.records[0], energyJ: 0 }, ...state.records.slice(1)] },
    { ...state, records: [{ ...state.records[0], seconds: 200 }, ...state.records.slice(1)] },
    { ...state, records: [{ ...state.records[0], material: 'water' }, ...state.records.slice(1)] },
    { ...state, records: [{ ...state.records[0], timeScale: 4 }, ...state.records.slice(1)] },
    { ...state, source: [NaN, 0] }, { ...state, source: [2, 0] }, { ...state, running: true },
    Object.assign(Object.create({ inherited: true }), state),
  ];
  const extraArray = structuredClone(state); extraArray.records.extra = true; bad.push(extraArray);
  const sparseVector = structuredClone(state); delete sparseVector.camera.position[0]; bad.push(sparseVector);
  const customArray = structuredClone(state); Object.setPrototypeOf(customArray.source, Object.create(Array.prototype)); bad.push(customArray);
  const symbolic = structuredClone(state); symbolic[Symbol('hidden')] = true; bad.push(symbolic);
  let reads = 0;
  const getter = structuredClone(state); Object.defineProperty(getter, 'selected', { enumerable: true, get() { reads++; return 'copper'; } }); bad.push(getter);
  const recordGetter = structuredClone(state); Object.defineProperty(recordGetter.records[0], 'energyJ', { enumerable: true, get() { reads++; return 20; } }); bad.push(recordGetter);
  const vectorGetter = structuredClone(state); Object.defineProperty(vectorGetter.source, '0', { enumerable: true, get() { reads++; return 0; } }); bad.push(vectorGetter);
  const ledgerGetter = structuredClone(state); Object.defineProperty(ledgerGetter.energies, 'ice', { enumerable: true, get() { reads++; return 40; } }); bad.push(ledgerGetter);
  for (const value of bad) assert.throws(() => validateState(value));
  assert.equal(reads, 0); assert.equal(JSON.stringify(state), original);
  assert.deepEqual(validateState(JSON.parse(original)), state);
});

test('reset clears all thermal energy and records together while preserving source, camera, selection and monotonic IDs', () => {
  const state = selectSample(setView(setSource(ledger(), [.78, 0]), 'top'), 'ice'), before = JSON.stringify(state);
  const reset = resetSamples(state);
  assert.deepEqual(reset.energies, { copper: 0, aluminum: 0, ice: 0 }); assert.deepEqual(reset.records, []);
  assert.equal(reset.nextId, state.nextId); assert.equal(reset.selected, 'ice'); assert.equal(reset.view, 'top');
  assert.deepEqual(reset.source, state.source); assert.deepEqual(reset.camera, state.camera); assert.equal(JSON.stringify(state), before);
  const heatedAgain = appendRun(reset, 'copper', 1);
  assert.equal(heatedAgain.records[0].id, state.nextId); assert.equal(heatedAgain.nextId, state.nextId + 1);
  assert.equal(heatedAgain.energies.copper, 10);
});

test('restarting one sample removes only its heat and ledger rows while preserving the complete observation context', () => {
  let state = ledger();
  for (const id of MATERIAL_IDS) state = appendRun(state, id, .5);
  state = selectSample(setView(setSource(state, [.78, 0]), 'top'), 'ice');
  const before = structuredClone(state);
  for (const id of MATERIAL_IDS) {
    const reset = resetSample(state, id);
    assert.deepEqual(reset.energies, { ...before.energies, [id]: 0 });
    assert.deepEqual(reset.records, before.records.filter(item => item.material !== id));
    assert.equal(reset.nextId, before.nextId); assert.equal(reset.selected, before.selected); assert.equal(reset.view, before.view);
    assert.deepEqual(reset.source, before.source); assert.deepEqual(reset.camera, before.camera);
    assert.deepEqual(validateState(reset), reset); assert.deepEqual(state, before);
    reset.source[0] = -.78; reset.camera.position[0] = .1; reset.records[0].seconds = 0;
    assert.deepEqual(state, before);
  }
});

test('restarting an already cold sample is idempotent and does not discard another sample ledger', () => {
  const baseline = resetSample(ledger(), 'aluminum'), second = resetSample(baseline, 'aluminum');
  assert.deepEqual(second, baseline); assert.notEqual(second, baseline);
  assert.deepEqual(second.records.map(item => item.material), ['copper', 'ice']);
  assert.deepEqual(resetSample(initialState(), 'ice'), initialState());
  const history = new History(baseline);
  assert.equal(history.edit('重复恢复铝', state => resetSample(state, 'aluminum')), false);
  assert.equal(history.past.length, 0);
});

test('restarting a sample preserves monotonic input IDs even when its latest ledger row is removed', () => {
  const baseline = appendRun(ledger(), 'copper', 1), reset = resetSample(baseline, 'copper');
  assert.deepEqual(reset.records.map(item => item.id), [2, 3]); assert.equal(reset.nextId, 5);
  const heatedAgain = appendRun(reset, 'copper', 1);
  assert.deepEqual(heatedAgain.records.map(item => item.id), [2, 3, 5]); assert.equal(heatedAgain.nextId, 6);
  assert.equal(heatedAgain.energies.copper, 10); assert.equal(heatedAgain.energies.aluminum, baseline.energies.aluminum);
  assert.equal(heatedAgain.energies.ice, baseline.energies.ice);
});

test('single-sample restart rejects unknown IDs and malformed states without mutating input', () => {
  const state = ledger(), before = structuredClone(state);
  for (const id of ['wood', 'constructor', '__proto__', '', null, 0, {}, ['copper']]) {
    assert.throws(() => resetSample(state, id), /样品编号无效/);
    assert.deepEqual(state, before);
  }
  const inconsistent = { ...state, energies: { ...state.energies, copper: 0 } }, invalidBefore = structuredClone(inconsistent);
  assert.throws(() => resetSample(inconsistent, 'copper'), /完整热输入账本不一致/);
  assert.deepEqual(inconsistent, invalidBefore);
  assert.throws(() => resetSample({ ...state, running: true }, 'ice'), /文件结构无效/);
});

test('restarting and heating one sample is one transaction whose cancel, undo and redo restore the full experiment', () => {
  const baseline = selectSample(setView(setSource(appendRun(ledger(), 'copper', 100), [.78, 0]), 'front'), 'ice');
  const history = new History(baseline);
  history.begin('重新观察铜'); history.current = resetSample(history.current, 'copper');
  history.current = selectSample(setView(setSource(history.current, [-.78, 0]), 'hero'), 'copper');
  const preview = calculateRun(history.current, 'copper', 2);
  assert.equal(preview.energyJ, 20); assert.deepEqual(history.pending.state, baseline);
  history.cancel(); assert.deepEqual(history.current, baseline); assert.equal(history.past.length, 0);
  history.begin('重新观察铜'); history.current = resetSample(history.current, 'copper');
  history.current = selectSample(setView(setSource(history.current, [-.78, 0]), 'hero'), 'copper');
  history.current = appendRun(history.current, 'copper', 2); assert.equal(history.commit(), true);
  const completed = structuredClone(history.current);
  assert.equal(history.past.length, 1); assert.equal(completed.energies.copper, 20);
  assert.deepEqual(completed.records.filter(item => item.material !== 'copper'), baseline.records.filter(item => item.material !== 'copper'));
  assert.equal(completed.records.at(-1).id, baseline.nextId); assert.equal(completed.nextId, baseline.nextId + 1);
  history.undo(); assert.deepEqual(history.current, baseline);
  history.redo(); assert.deepEqual(history.current, completed);
});

test('live calculations never enter the ledger; cancel rolls back the complete input and finishing creates one undoable transaction', () => {
  const history = new History(ledger()), baseline = structuredClone(history.current);
  history.begin('把热源拖到冰'); history.current = setSource(history.current, [.78, 0]);
  const previews = [.1, .5, 1, 4].map(seconds => calculateRun(history.current, 'ice', seconds));
  assert.equal(previews.at(-1).energyJ, 40); assert.deepEqual(history.current.records, baseline.records);
  assert.deepEqual(history.current.energies, baseline.energies);
  assert.deepEqual(history.pending.state, baseline); // Save the pending baseline, never a display frame.
  history.cancel(); assert.deepEqual(history.current, baseline); assert.equal(history.past.length, 0);
  history.begin('一次完整热输入'); history.current = setSource(history.current, [.78, 0]);
  history.current = appendRun(history.current, 'ice', 4); assert.equal(history.commit(), true);
  const completed = structuredClone(history.current);
  assert.equal(completed.records.length, baseline.records.length + 1); assert.equal(history.past.length, 1);
  history.undo(); assert.deepEqual(history.current, baseline); history.redo(); assert.deepEqual(history.current, completed);
  history.begin('新的未完成输入'); history.current = setSource(history.current, [0, .7]);
  history.undo(); assert.deepEqual(history.current, completed); assert.equal(history.past.length, 1);
});

test('invalid transactions and imports roll back without losing redo; bounded history remains separate from the complete heat ledger', () => {
  const history = new History(); history.edit('输入10J', state => appendRun(state, 'copper', 1)); history.undo();
  const before = structuredClone(history.current);
  assert.throws(() => history.edit('伪造热量', state => { state.energies.copper = 10; }));
  assert.deepEqual(history.current, before); assert.equal(history.pending, null); assert.equal(history.future.length, 1);
  assert.equal(history.edit('无变更', () => undefined), false); assert.equal(history.future.length, 1);
  history.begin('尚未完成'); history.current = setSource(history.current, [.78, 0]);
  assert.throws(() => history.replace({ ...initialState(), records: [{}] }));
  assert.equal(history.pending.label, '尚未完成'); history.cancel(); history.redo(); assert.equal(history.current.energies.copper, 10);
  const heated = structuredClone(history.current);
  history.edit('重置材料', resetSamples); assert.deepEqual(history.current.records, []);
  history.undo(); assert.deepEqual(history.current, heated); history.redo(); assert.deepEqual(history.current.records, []);
  history.replace(initialState());
  for (let i = 0; i < 45; i++) history.edit('移动热源', state => setSource(state, [i % 2 ? .78 : -.78, 0]));
  assert.equal(history.past.length, 40);
  let undone = 0; while (history.undo()) undone++;
  assert.equal(undone, 40); assert.deepEqual(history.current.records, []);
  history.edit('新分支', state => selectSample(state, 'ice')); assert.equal(history.canRedo, false);
});
