import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionStorage } from '../web/collection/storage.js';
import { initialState, validateCheckpoint } from '../web/collection/core.js';

const STORE = 'atelier-collection-workspace-v1', TRIP = 'atelier-collection-trip-v1';
const raw = value => JSON.stringify(value);
const shop = lastScene => ({ ...initialState(), lastScene });
const trip = (value = shop('underwater'), token = '0123456789abcdef') => validateCheckpoint({ version: 1, token, sceneId: value.lastScene, shop: value });

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); this.operations = []; this.onGet = null; this.onSet = null; this.onRemove = null; }
  getItem(key) { this.operations.push(['get', key]); this.onGet?.(key, this); return this.values.get(key) ?? null; }
  setItem(key, value) { this.operations.push(['set', key, value]); this.onSet?.(key, value, this); this.values.set(key, value); }
  removeItem(key) { this.operations.push(['remove', key]); this.onRemove?.(key, this); this.values.delete(key); }
  writes() { return this.operations.filter(([operation]) => operation !== 'get'); }
}
const setup = (store = raw(initialState()), previousTrip = null) => {
  const storage = new MemoryStorage([[STORE, store], ...(previousTrip === null ? [] : [[TRIP, previousTrip]])]);
  return { storage, coordinator: createCollectionStorage(storage) };
};

test('initial reads and refresh retain raw formatting and never rewrite either v1 record', () => {
  const original = JSON.stringify(initialState(), null, 2), previousTrip = JSON.stringify(trip(), null, 2);
  const { storage, coordinator } = setup(original, previousTrip);
  assert.ok(Object.isFrozen(coordinator)); assert.equal(coordinator.ready, true);
  assert.equal(coordinator.currentRaw, original); assert.equal(coordinator.currentTripRaw, previousTrip);
  assert.equal(coordinator.status, 'refreshed'); assert.equal(coordinator.refresh().ok, true);
  assert.equal(coordinator.save(initialState()).status, 'unchanged');
  assert.equal(coordinator.currentRaw, original); assert.deepEqual(storage.writes(), []);
});

test('a failed initial pair read never permits saving until explicit refresh succeeds', () => {
  const storage = new MemoryStorage([[STORE, raw(initialState())]]);
  storage.onGet = key => { if (key === TRIP) throw new Error('blocked'); };
  const coordinator = createCollectionStorage(storage);
  assert.equal(coordinator.ready, false); assert.equal(coordinator.currentRaw, undefined);
  assert.equal(coordinator.currentTripRaw, undefined); assert.equal(coordinator.status, 'unavailable');
  storage.onGet = null;
  assert.equal(coordinator.save(shop('materials')).status, 'unavailable');
  assert.equal(coordinator.enter(trip(), shop('underwater')).status, 'unavailable');
  assert.deepEqual(storage.writes(), []);
  assert.equal(coordinator.refresh().status, 'refreshed');
  assert.equal(coordinator.save(shop('materials')).status, 'saved');
});

test('unavailable storage objects fail closed during initialization and every attempted operation', () => {
  for (const storage of [undefined, null, {}, { getItem() { throw new Error('denied'); } }, { getItem() { return undefined; } }]) {
    const coordinator = createCollectionStorage(storage);
    assert.equal(coordinator.ready, false); assert.equal(coordinator.currentRaw, undefined);
    assert.equal(coordinator.save(initialState()).status, 'unavailable');
    assert.equal(coordinator.enter(trip(), shop('underwater')).status, 'unavailable');
    assert.equal(coordinator.refresh().status, 'unavailable');
  }
});

test('ordinary saving advances only its own exact raw baseline and does not adopt unrelated trip updates', () => {
  const previousTrip = raw(trip()), { storage, coordinator } = setup(raw(initialState()), previousTrip);
  storage.values.set(TRIP, raw(trip(shop('materials'), 'ffffffffffffffff')));
  const next = shop('skate'), result = coordinator.save(next);
  assert.equal(result.ok, true); assert.equal(result.status, 'saved');
  assert.equal(result.storeRaw, raw(next)); assert.equal(coordinator.currentRaw, raw(next));
  assert.equal(coordinator.currentTripRaw, previousTrip);
  assert.deepEqual(storage.writes(), [['set', STORE, raw(next)]]);
});

test('exact raw CAS rejects a stale window, including external formatting-only changes', () => {
  const { storage, coordinator } = setup();
  storage.values.set(STORE, JSON.stringify(initialState(), null, 2));
  const before = storage.values.get(STORE);
  const failure = coordinator.save(shop('materials'));
  assert.equal(failure.ok, false); assert.equal(failure.status, 'conflict');
  assert.equal(coordinator.currentRaw, raw(initialState())); assert.equal(storage.values.get(STORE), before);
  assert.deepEqual(storage.writes(), []);
  assert.equal(coordinator.refresh().storeRaw, before);
  assert.equal(coordinator.save(shop('materials')).status, 'saved');
});

test('a stale window can adopt an already identical value without overwriting the newest raw record', () => {
  const { storage, coordinator } = setup();
  const next = shop('underwater');
  const newest = JSON.stringify(Object.fromEntries(Object.entries(next).reverse()), null, 2);
  storage.values.set(STORE, newest);
  assert.equal(coordinator.save(next).status, 'unchanged');
  assert.equal(coordinator.currentRaw, newest); assert.equal(storage.values.get(STORE), newest);
  assert.deepEqual(storage.writes(), []);
});

test('a newer write observed immediately after saving is retained rather than rolled back', () => {
  const { storage, coordinator } = setup();
  const next = shop('skate'), newer = raw(shop('materials'));
  let firstWrite = false;
  storage.onSet = () => { firstWrite = true; };
  storage.onGet = (key, current) => { if (key === STORE && firstWrite) { current.values.set(STORE, newer); firstWrite = false; } };
  assert.equal(coordinator.save(next).status, 'conflict');
  assert.equal(storage.values.get(STORE), newer);
  assert.equal(coordinator.currentRaw, raw(initialState()));
  assert.equal(storage.writes().length, 1);
});

test('non-JSON objects, cyclic or sparse data and capacity overflow are rejected before any write', () => {
  const { storage, coordinator } = setup();
  const cyclic = {}; cyclic.self = cyclic;
  let accessed = false;
  const accessor = {}; Object.defineProperty(accessor, 'secret', { enumerable: true, get() { accessed = true; return 1; } });
  const symbols = { [Symbol('hidden')]: 'hidden' };
  for (const invalid of [null, [], 'serialized', 1, new Date(), cyclic, accessor, symbols,
    { bad: undefined }, { bad: Infinity }, { bad: BigInt(1) }, { bad: () => true },
    { bad: new Array(2) }, { data: '衣'.repeat(256 * 1024) }]) {
    assert.equal(coordinator.save(invalid).status, 'invalid-value');
    assert.equal(coordinator.enter(invalid, shop('skate')).status, 'invalid-value');
  }
  assert.equal(coordinator.enter(trip(), { data: '衣'.repeat(64 * 1024) }).status, 'invalid-value');
  assert.equal(accessed, false); assert.deepEqual(storage.writes(), []);
  assert.equal(coordinator.currentRaw, raw(initialState()));
});

test('unreadable STORE remains protected; explicit valid replacement still requires the same raw baseline', () => {
  const { storage, coordinator } = setup('{broken');
  assert.equal(coordinator.status, 'unreadable'); assert.equal(coordinator.storeReadable, false);
  assert.equal(coordinator.currentRaw, '{broken');
  assert.equal(coordinator.refresh().status, 'unreadable');
  assert.equal(coordinator.save(initialState()).status, 'unreadable');
  assert.equal(coordinator.enter(trip(), shop('underwater')).status, 'unreadable');
  assert.deepEqual(storage.writes(), []);
  storage.values.set(STORE, '{different broken');
  assert.equal(coordinator.save(initialState(), { replaceUnreadable: true }).status, 'conflict');
  assert.equal(storage.values.get(STORE), '{different broken');
  assert.equal(coordinator.refresh().status, 'unreadable');
  assert.equal(coordinator.save(initialState(), { replaceUnreadable: true }).status, 'saved');
  assert.equal(storage.values.get(STORE), raw(initialState()));
  assert.equal(coordinator.storeReadable, true);
});

test('refresh errors keep both previous raw baselines and a write failure requires a new read', () => {
  const { storage, coordinator } = setup();
  const old = coordinator.currentRaw;
  storage.values.set(STORE, raw(shop('creative')));
  storage.onGet = key => { if (key === TRIP) throw new Error('read error'); };
  assert.equal(coordinator.refresh().status, 'unavailable');
  assert.equal(coordinator.currentRaw, old); assert.equal(coordinator.currentTripRaw, null);
  storage.onGet = null; assert.equal(coordinator.refresh().ok, true);
  storage.onSet = () => { throw new Error('quota exceeded'); };
  assert.equal(coordinator.save(shop('skate')).status, 'unavailable');
  assert.equal(coordinator.ready, false); assert.equal(coordinator.currentRaw, raw(shop('creative')));
  storage.onSet = null;
  assert.equal(coordinator.save(shop('skate')).status, 'unavailable');
  assert.equal(coordinator.refresh().ok, true); assert.equal(coordinator.save(shop('skate')).ok, true);
});

test('enter commits the original two v1 JSON objects and advances both baselines', () => {
  const { storage, coordinator } = setup();
  const next = shop('underwater'), checkpoint = trip(next);
  const result = coordinator.enter(checkpoint, next);
  assert.equal(result.ok, true); assert.equal(result.status, 'entered');
  assert.equal(result.storeRaw, raw(next)); assert.equal(result.tripRaw, raw(checkpoint));
  assert.equal(coordinator.currentRaw, raw(next)); assert.equal(coordinator.currentTripRaw, raw(checkpoint));
  assert.deepEqual(storage.writes(), [['set', TRIP, raw(checkpoint)], ['set', STORE, raw(next)]]);
  assert.deepEqual(JSON.parse(storage.values.get(STORE)), next);
  assert.deepEqual(JSON.parse(storage.values.get(TRIP)), checkpoint);
});

test('enter rejects a replaced trip even with the same STORE, but accepts an identical already committed pair', () => {
  const { storage, coordinator } = setup();
  const next = shop('underwater'), checkpoint = trip(next), newestTrip = raw(trip(shop('materials'), 'ffffffffffffffff'));
  storage.values.set(TRIP, newestTrip);
  assert.equal(coordinator.enter(checkpoint, next).status, 'conflict');
  assert.deepEqual(storage.writes(), []); assert.equal(storage.values.get(TRIP), newestTrip);
  storage.values.set(TRIP, JSON.stringify(checkpoint, null, 2)); storage.values.set(STORE, JSON.stringify(next, null, 2));
  assert.equal(coordinator.enter(checkpoint, next).status, 'unchanged');
  assert.equal(coordinator.currentRaw, storage.values.get(STORE)); assert.equal(coordinator.currentTripRaw, storage.values.get(TRIP));
  assert.deepEqual(storage.writes(), []);
});

test('a failed second write restores the prior trip raw, including absent-trip removal', () => {
  for (const previousTrip of [null, JSON.stringify(trip(shop('creative')), null, 2)]) {
    const old = raw(initialState()), { storage, coordinator } = setup(old, previousTrip);
    storage.onSet = key => { if (key === STORE) throw new Error('quota'); };
    const result = coordinator.enter(trip(), shop('underwater'));
    assert.equal(result.ok, false); assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored');
    assert.equal(storage.values.get(STORE), old); assert.equal(storage.values.get(TRIP) ?? null, previousTrip);
    assert.equal(coordinator.currentRaw, old); assert.equal(coordinator.currentTripRaw, previousTrip);
  }
});

test('enter read and first-write faults preserve both prior records without a blind retry', () => {
  for (const failure of ['read', 'first-write']) {
    const previousTrip = raw(trip(shop('creative'))), { storage, coordinator } = setup(raw(initialState()), previousTrip);
    if (failure === 'read') storage.onGet = key => { if (key === TRIP) throw new Error('read fail'); };
    else storage.onSet = key => { if (key === TRIP) throw new Error('first write fail'); };
    const result = coordinator.enter(trip(), shop('underwater'));
    assert.equal(result.ok, false); assert.equal(result.status, 'unavailable');
    assert.equal(storage.values.get(STORE), raw(initialState())); assert.equal(storage.values.get(TRIP), previousTrip);
    assert.equal(coordinator.currentRaw, raw(initialState())); assert.equal(coordinator.currentTripRaw, previousTrip);
    assert.equal(storage.writes().filter(([, key]) => key === STORE).length, 0);
  }
});

test('a write that reports failure after changing its own value rolls back both still-owned raw values', () => {
  const previousTrip = raw(trip(shop('creative'))), { storage, coordinator } = setup(raw(initialState()), previousTrip);
  let reported = false;
  storage.onSet = (key, value, current) => {
    if (key === STORE && !reported) {
      reported = true; current.values.set(key, value); throw new Error('failure after write');
    }
  };
  const result = coordinator.enter(trip(), shop('underwater'));
  assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored');
  assert.equal(storage.values.get(STORE), raw(initialState())); assert.equal(storage.values.get(TRIP), previousTrip);
  assert.equal(coordinator.currentRaw, raw(initialState())); assert.equal(coordinator.currentTripRaw, previousTrip);
});

test('after a failed second write, rollback never replaces another window newer trip', () => {
  const { storage, coordinator } = setup();
  const newer = raw(trip(shop('materials'), 'ffffffffffffffff'));
  storage.onSet = (key, _value, current) => {
    if (key === STORE) { current.values.set(TRIP, newer); throw new Error('second write failed'); }
  };
  const result = coordinator.enter(trip(), shop('underwater'));
  assert.equal(result.status, 'conflict'); assert.equal(result.rollback, 'newer-preserved');
  assert.equal(storage.values.get(TRIP), newer); assert.equal(storage.values.get(STORE), raw(initialState()));
  assert.equal(storage.writes().filter(([operation]) => operation === 'remove').length, 0);
});

test('a STORE race between trip and store writes preserves newer business state and restores only own trip', () => {
  const { storage, coordinator } = setup(), newer = raw(shop('creative'));
  let writtenTrip = false;
  storage.onSet = key => { if (key === TRIP) writtenTrip = true; };
  storage.onGet = (key, current) => { if (key === STORE && writtenTrip) { current.values.set(STORE, newer); writtenTrip = false; } };
  const result = coordinator.enter(trip(), shop('underwater'));
  assert.equal(result.status, 'conflict'); assert.equal(result.rollback, 'restored');
  assert.equal(storage.values.get(STORE), newer); assert.equal(storage.values.get(TRIP) ?? null, null);
  assert.equal(storage.writes().filter(([, key]) => key === STORE).length, 0);
});

test('a newer STORE observed after both writes is never rolled back over another window', () => {
  const { storage, coordinator } = setup(), newer = raw(shop('skate'));
  let storeWritten = false;
  storage.onSet = key => { if (key === STORE) storeWritten = true; };
  storage.onGet = (key, current) => { if (key === STORE && storeWritten) { current.values.set(STORE, newer); storeWritten = false; } };
  const result = coordinator.enter(trip(), shop('underwater'));
  assert.equal(result.status, 'conflict'); assert.equal(result.rollback, 'newer-preserved');
  assert.equal(storage.values.get(STORE), newer); assert.equal(storage.values.get(TRIP) ?? null, null);
  assert.equal(storage.writes().filter(([, key]) => key === STORE).length, 1);
});

test('rollback read or write faults are reported without blindly overwriting either key', () => {
  for (const failure of ['get', 'restore']) {
    const previousTrip = raw(trip(shop('creative'))), { storage, coordinator } = setup(raw(initialState()), previousTrip);
    let failRollback = false;
    storage.onSet = key => {
      if (key === STORE) { failRollback = true; throw new Error('write fail'); }
      if (key === TRIP && failRollback && failure === 'restore') throw new Error('restore fail');
    };
    storage.onGet = key => { if (key === TRIP && failRollback && failure === 'get') throw new Error('rollback read fail'); };
    const result = coordinator.enter(trip(), shop('underwater'));
    assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'failed'); assert.equal(coordinator.ready, false);
    assert.equal(storage.values.get(STORE), raw(initialState()));
    assert.equal(storage.values.get(TRIP), raw(trip()));
    assert.equal(coordinator.currentTripRaw, previousTrip);
    storage.onGet = null; storage.onSet = null;
    assert.equal(coordinator.refresh().ok, true);
  }
});

test('unreadable trip blocks entering but cannot prevent a safe independent STORE save', () => {
  const { storage, coordinator } = setup(raw(initialState()), '{broken trip');
  assert.equal(coordinator.ready, true); assert.equal(coordinator.tripReadable, false);
  assert.equal(coordinator.enter(trip(), shop('underwater')).status, 'unreadable');
  assert.deepEqual(storage.writes(), []);
  assert.equal(coordinator.save(shop('skate')).status, 'saved');
  assert.equal(storage.values.get(TRIP), '{broken trip');
});

test('explicit unreadable-trip recovery enters only after preserving the same raw baseline', () => {
  const { storage, coordinator } = setup(raw(initialState()), '{broken trip');
  const next = shop('underwater'), checkpoint = trip(next);
  assert.equal(coordinator.enter(checkpoint, next).status, 'unreadable');
  assert.deepEqual(storage.writes(), []);
  const result = coordinator.enter(checkpoint, next, { replaceUnreadableTrip: true });
  assert.equal(result.ok, true); assert.equal(result.status, 'entered');
  assert.equal(storage.values.get(TRIP), raw(checkpoint)); assert.equal(storage.values.get(STORE), raw(next));
  assert.equal(coordinator.tripReadable, true); assert.equal(coordinator.currentTripRaw, raw(checkpoint));
  const brokenStore = setup('{broken store', '{broken trip');
  assert.equal(brokenStore.coordinator.enter(checkpoint, next, { replaceUnreadableTrip: true }).status, 'unreadable');
  assert.deepEqual(brokenStore.storage.writes(), []);
});

test('explicit trip recovery cannot replace an external repair or a different unreadable record', () => {
  for (const replacement of [raw(trip(shop('materials'), 'ffffffffffffffff')), '{new broken trip']) {
    const { storage, coordinator } = setup(raw(initialState()), '{old broken trip');
    storage.values.set(TRIP, replacement);
    const result = coordinator.enter(trip(), shop('underwater'), { replaceUnreadableTrip: true });
    assert.equal(result.status, 'conflict'); assert.equal(result.ok, false);
    assert.equal(storage.values.get(TRIP), replacement); assert.equal(storage.values.get(STORE), raw(initialState()));
    assert.deepEqual(storage.writes(), []); assert.equal(coordinator.currentTripRaw, '{old broken trip');
  }
});

test('failed explicit trip recovery restores its original unreadable raw without deleting it', () => {
  const original = '{broken trip with original evidence', { storage, coordinator } = setup(raw(initialState()), original);
  storage.onSet = key => { if (key === STORE) throw new Error('quota'); };
  const result = coordinator.enter(trip(), shop('underwater'), { replaceUnreadableTrip: true });
  assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored');
  assert.equal(storage.values.get(TRIP), original); assert.equal(storage.values.get(STORE), raw(initialState()));
  assert.equal(coordinator.currentTripRaw, original); assert.equal(coordinator.tripReadable, false);
  assert.equal(storage.writes().filter(([operation]) => operation === 'remove').length, 0);
});
