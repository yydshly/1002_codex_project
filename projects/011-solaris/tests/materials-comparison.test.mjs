import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POWER_W, SAMPLES, initialState, validateState, sample, appendRun, setSource,
  setView, selectSample, History,
} from '../web/materials/core.js';
import {
  COMPARISON_DOSES, prepareComparison, calculateDoseRun, appendDoseRun,
} from '../web/materials/comparison.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const baseline = () => selectSample(setView(setSource(
  appendRun(appendRun(appendRun(initialState(), 'copper', 100), 'ice', 3), 'aluminum', 100),
  [.78, 0]), 'front'), 'ice');
const iceLedger = count => {
  let state = initialState();
  for (let i = 0; i < count; i++) state = appendRun(state, 'ice', .01);
  return state;
};

test('every registered equal-heat dose yields distinct copper/aluminum temperature rises below the physical limit', () => {
  assert.deepEqual(COMPARISON_DOSES, [40, 80, 120]); assert.ok(Object.isFrozen(COMPARISON_DOSES));
  assert.throws(() => COMPARISON_DOSES.push(160), TypeError);
  for (const doseJ of COMPARISON_DOSES) {
    const prepared = prepareComparison(baseline(), doseJ);
    const copper = calculateDoseRun(prepared, 'copper', doseJ, 1e308);
    const aluminum = calculateDoseRun(prepared, 'aluminum', doseJ, 1e308);
    for (const run of [copper, aluminum]) {
      assert.equal(run.energyJ, doseJ); assert.equal(run.totalEnergyJ, doseJ);
      assert.equal(run.seconds, doseJ / POWER_W); assert.equal(run.doseJ, doseJ);
      assert.equal(run.targetReached, true); assert.equal(run.doseRemainingSeconds, 0);
      assert.equal(run.complete, false); assert.equal(run.sample.complete, false);
      assert.ok(run.remainingSeconds > 0); assert.ok(run.sample.temperatureC < 60);
      assert.equal(run.sample.phase, 'solid'); assert.equal(run.sample.meltFraction, 0);
      near(.01 * SAMPLES[run.material].heatCapacityJPerKgK * (run.sample.temperatureC - 25), doseJ);
    }
    assert.ok(copper.sample.temperatureC > aluminum.sample.temperatureC);
    near((copper.sample.temperatureC - 25) / (aluminum.sample.temperatureC - 25),
      SAMPLES.aluminum.heatCapacityJPerKgK / SAMPLES.copper.heatCapacityJPerKgK);
    const completed = appendDoseRun(appendDoseRun(prepared, 'copper', doseJ, 1e308), 'aluminum', doseJ, 1e308);
    assert.deepEqual(completed.energies, { copper: doseJ, aluminum: doseJ, ice: 30 });
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(completed))), completed);
  }
});

test('preparing comparison resets only the metals, preserving the ice ledger, camera and monotonically increasing IDs', () => {
  const state = appendRun(baseline(), 'ice', 1), before = structuredClone(state);
  const prepared = prepareComparison(state, 80);
  assert.deepEqual(prepared.energies, { copper: 0, aluminum: 0, ice: 40 });
  assert.deepEqual(prepared.records, before.records.filter(record => record.material === 'ice'));
  assert.equal(prepared.nextId, before.nextId); assert.equal(prepared.view, before.view);
  assert.deepEqual(prepared.camera, before.camera); assert.equal(prepared.selected, 'copper');
  assert.deepEqual(prepared.source, [-.78, 0]); assert.deepEqual(state, before);
  const completed = appendDoseRun(appendDoseRun(prepared, 'copper', 80, 8), 'aluminum', 80, 8);
  assert.deepEqual(completed.records.slice(-2).map(record => record.id), [before.nextId, before.nextId + 1]);
  assert.equal(completed.nextId, before.nextId + 2);
  prepared.camera.position[0] = 0; prepared.source[0] = 0; prepared.records[0].seconds = 0;
  assert.deepEqual(state, before);
});

test('partial input and resuming truncate exactly at the chosen dose while retaining ordinary physical remaining heat', () => {
  const prepared = prepareComparison(initialState(), 80), first = calculateDoseRun(prepared, 'copper', 80, 1.237);
  near(first.energyJ, 12.37); near(first.seconds, 1.237);
  assert.equal(first.targetReached, false); near(first.doseRemainingSeconds, (80 - 12.37) / 10);
  const partial = appendDoseRun(prepared, 'copper', 80, 1.237), before = structuredClone(partial);
  const finish = calculateDoseRun(partial, 'copper', 80, 100);
  assert.equal(finish.totalEnergyJ, 80); near(finish.energyJ, 67.63); near(finish.seconds, 6.763);
  assert.equal(finish.targetReached, true); assert.equal(finish.complete, false);
  near(finish.remainingSeconds, (SAMPLES.copper.maxEnergyJ - 80) / 10);
  const completed = appendDoseRun(partial, 'copper', 80, 100);
  assert.equal(completed.energies.copper, 80); assert.equal(completed.records.length, 2);
  near(completed.records.reduce((sum, record) => sum + record.seconds, 0), 8);
  assert.deepEqual(partial, before); assert.deepEqual(validateState(completed), completed);
  const noMore = calculateDoseRun(completed, 'copper', 80, 1e308);
  assert.equal(noMore.energyJ, 0); assert.equal(noMore.seconds, 0); assert.equal(noMore.targetReached, true);
  assert.deepEqual(appendDoseRun(completed, 'copper', 80, 1e308), completed);
});

test('fractional partitions end at the exact dose without a floating-point overshoot or reused input ID', () => {
  for (const doseJ of COMPARISON_DOSES) {
    for (const id of ['copper', 'aluminum']) {
      let state = prepareComparison(initialState(), doseJ);
      for (const seconds of [.001, .007, .023, .123, .237, .419, 1.123]) state = appendDoseRun(state, id, doseJ, seconds);
      const run = calculateDoseRun(state, id, doseJ, 1000);
      state = appendDoseRun(state, id, doseJ, 1000);
      assert.equal(state.energies[id], doseJ); assert.equal(run.targetReached, true);
      assert.equal(state.records.at(-1).energyJ, run.energyJ); assert.equal(state.records.at(-1).seconds, run.seconds);
      assert.deepEqual(state.records.map(record => record.id), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.equal(calculateDoseRun(state, id, doseJ, 0).targetReached, true);
      near(state.records.reduce((sum, record) => sum + record.energyJ, 0), doseJ);
      near(sample(id, state.energies[id]).temperatureC, 25 + doseJ / (.01 * SAMPLES[id].heatCapacityJPerKgK));
    }
  }
});

test('comparison preflight counts retained ice rows and reserves both sequential record IDs atomically', () => {
  let allowed = appendRun(appendRun(iceLedger(38), 'copper', .01), 'aluminum', .01);
  assert.equal(allowed.records.length, 40);
  allowed = prepareComparison(allowed, 40);
  assert.equal(allowed.records.length, 38); assert.equal(allowed.nextId, 41);
  const completed = appendDoseRun(appendDoseRun(allowed, 'copper', 40, 4), 'aluminum', 40, 4);
  assert.equal(completed.records.length, 40); assert.deepEqual(completed.records.slice(-2).map(record => record.id), [41, 42]);
  for (const state of [iceLedger(39), iceLedger(40)]) {
    const before = structuredClone(state);
    assert.throws(() => prepareComparison(state, 40), /至少两条/); assert.deepEqual(state, before);
  }
  const lastPair = prepareComparison({ ...initialState(), nextId: 999_998 }, 120);
  const last = appendDoseRun(appendDoseRun(lastPair, 'copper', 120, 12), 'aluminum', 120, 12);
  assert.deepEqual(last.records.map(record => record.id), [999_998, 999_999]); assert.equal(last.nextId, 1_000_000);
  for (const nextId of [999_999, 1_000_000]) {
    const state = { ...initialState(), nextId }, before = structuredClone(state);
    assert.throws(() => prepareComparison(state, 80), /编号不足/); assert.deepEqual(state, before);
  }
});

test('zero heat consumes neither a full ledger slot nor an exhausted ID, while positive input preserves ordinary limits', () => {
  const full = iceLedger(40), before = structuredClone(full);
  assert.deepEqual(appendDoseRun(full, 'copper', 40, 0), full);
  assert.throws(() => appendDoseRun(full, 'copper', 40, .1), /满 40/); assert.deepEqual(full, before);
  const exhausted = { ...initialState(), nextId: 1_000_000 };
  assert.deepEqual(appendDoseRun(exhausted, 'aluminum', 80, 0), exhausted);
  assert.throws(() => appendDoseRun(exhausted, 'aluminum', 80, .1), /上限/);
});

test('invalid comparison requests reject unknown materials, doses, non-finite times and heat already above the dose without mutation', () => {
  const state = initialState(), before = structuredClone(state);
  for (const doseJ of [0, 20, 40.000001, 134.77921769796612, 160, NaN, Infinity, '40', null, {}, [40]]) {
    assert.throws(() => prepareComparison(state, doseJ), /只支持/);
    assert.throws(() => calculateDoseRun(state, 'copper', doseJ, 1), /只支持/);
    assert.throws(() => appendDoseRun(state, 'aluminum', doseJ, 1), /只支持/);
  }
  for (const id of ['ice', 'constructor', '__proto__', '', null, 0, {}, ['copper']]) {
    assert.throws(() => calculateDoseRun(state, id, 40, 1), /只支持铜和铝/);
    assert.throws(() => appendDoseRun(state, id, 40, 1), /只支持铜和铝/);
  }
  for (const seconds of [-1, NaN, Infinity, '1', null, {}, [1]]) {
    assert.throws(() => calculateDoseRun(state, 'copper', 40, seconds), /非负有限/);
    assert.throws(() => appendDoseRun(state, 'copper', 40, seconds), /非负有限/);
  }
  const heated = appendRun(state, 'copper', 4.001), heatedBefore = structuredClone(heated);
  assert.throws(() => calculateDoseRun(heated, 'copper', 40, 0), /超过对照剂量/);
  assert.throws(() => appendDoseRun(heated, 'copper', 40, 1), /超过对照剂量/);
  assert.deepEqual(heated, heatedBefore); assert.deepEqual(state, before);
  const forged = { ...state, energies: { copper: 40, aluminum: 0, ice: 0 } };
  assert.throws(() => prepareComparison(forged, 40), /完整热输入账本/);
  assert.throws(() => calculateDoseRun(forged, 'copper', 40, 1), /完整热输入账本/);
  assert.throws(() => appendDoseRun(forged, 'copper', 40, 1), /完整热输入账本/);
});

test('cancelling in the second sample rolls back both reset metals, the completed copper input and the complete observation context', () => {
  const original = baseline(), history = new History(original);
  history.begin('80J 铜铝对照'); history.current = prepareComparison(history.current, 80);
  history.current = appendDoseRun(history.current, 'copper', 80, 100);
  history.current = selectSample(setSource(history.current, [0, 0]), 'aluminum');
  const preview = calculateDoseRun(history.current, 'aluminum', 80, 2.13);
  assert.equal(preview.targetReached, false); near(preview.energyJ, 21.3);
  assert.equal(history.current.energies.copper, 80); assert.equal(history.current.energies.aluminum, 0);
  assert.deepEqual(history.pending.state, original); assert.equal(history.past.length, 0);
  history.cancel(); assert.deepEqual(history.current, original); assert.equal(history.past.length, 0);
  assert.equal(history.pending, null); assert.deepEqual(original, baseline());
});

test('pausing or completing the second sample commits one transaction and undo/redo restores exact full experiments', () => {
  for (const secondSeconds of [2.13, 100]) {
    const original = baseline(), history = new History(original);
    history.begin('80J 铜铝对照'); history.current = prepareComparison(history.current, 80);
    history.current = appendDoseRun(history.current, 'copper', 80, 100);
    history.current = selectSample(setSource(history.current, [0, 0]), 'aluminum');
    history.current = appendDoseRun(history.current, 'aluminum', 80, secondSeconds);
    assert.equal(history.commit(), true); assert.equal(history.past.length, 1);
    const finished = structuredClone(history.current);
    assert.equal(finished.energies.copper, 80); near(finished.energies.aluminum, Math.min(secondSeconds * 10, 80));
    assert.equal(finished.energies.ice, original.energies.ice);
    assert.deepEqual(finished.records.filter(record => record.material === 'ice'), original.records.filter(record => record.material === 'ice'));
    assert.deepEqual(finished.records.slice(-2).map(record => record.id), [original.nextId, original.nextId + 1]);
    assert.equal(finished.nextId, original.nextId + 2); assert.deepEqual(finished.camera, original.camera);
    history.undo(); assert.deepEqual(history.current, original);
    history.redo(); assert.deepEqual(history.current, finished);
    history.undo(); history.begin('再次对照'); history.current = prepareComparison(history.current, 40);
    history.current = appendDoseRun(history.current, 'copper', 40, 4);
    history.undo(); assert.deepEqual(history.current, original); assert.equal(history.future.length, 1);
    history.redo(); assert.deepEqual(history.current, finished);
  }
});
