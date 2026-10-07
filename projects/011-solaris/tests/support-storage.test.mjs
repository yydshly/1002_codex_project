import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportStorage } from '../web/support/storage.js';
import { SUPPORT_WORKSPACE_KEY, SUPPORT_FORMAT, SUPPORT_VERSION, MAX_SUPPORT_BACKUP_BYTES } from '../web/support/state.js';

// The fixture exercises storage only. Its state is intentionally not evidence
// that assets, fingerprints or geometry have passed the worker's scene checks.
const raw = label => JSON.stringify({ format: SUPPORT_FORMAT, version: SUPPORT_VERSION, state: { fixture: label } }, null, 2);
const A = raw('a'), B = raw('b'), C = raw('c');
function memory(initial = A) {
  const records = new Map(initial === null ? [] : [[SUPPORT_WORKSPACE_KEY, initial]]);
  const calls = [];
  const storage = {
    getItem(key) { calls.push(['read', key]); return records.has(key) ? records.get(key) : null; },
    setItem(key, value) { calls.push(['write', key, value]); records.set(key, value); },
  };
  return { storage, records, calls, session: createSupportStorage(storage),
    replace(value) { if (value === null) records.delete(SUPPORT_WORKSPACE_KEY); else records.set(SUPPORT_WORKSPACE_KEY, value); } };
}
const writes = fixture => fixture.calls.filter(call => call[0] === 'write');

test('initial snapshot captures exact text and cannot be reset by another load', () => {
  const m = memory(`\n${A}\n`);
  assert.equal(m.session.getSnapshot().baselineKnown, false);
  const loaded = m.session.loadSnapshot();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.baselineKnown, true);
  assert.equal(loaded.currentRaw, `\n${A}\n`);
  assert.equal(loaded.expectedRaw, loaded.currentRaw);
  m.replace(B);
  assert.equal(m.session.loadSnapshot().code, 'storage-conflict');
  assert.equal(m.session.getSnapshot().expectedRaw, `\n${A}\n`);
  assert.equal(writes(m).length, 0);
});

test('an initially absent record has a known null baseline and permits first explicit save', () => {
  const m = memory(null);
  assert.deepEqual({ ...m.session.loadSnapshot(), currentRawBytes: undefined, expectedRawBytes: undefined },
    { ok: true, baselineKnown: true, expectedRawBytes: undefined, expectedRaw: null, found: false, currentRawBytes: undefined, currentRaw: null });
  const result = m.session.save(B);
  assert.equal(result.ok, true);
  assert.equal(result.currentRaw, B);
  assert.equal(m.session.getSnapshot().expectedRaw, B);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
});

test('each tab retains an independent baseline and stale save never calls setItem', () => {
  const m = memory();
  const other = createSupportStorage(m.storage);
  m.session.loadSnapshot(); other.loadSnapshot();
  assert.equal(m.session.save(B).ok, true);
  const beforeWrites = writes(m).length;
  const conflict = other.save(C);
  assert.equal(conflict.code, 'storage-conflict');
  assert.equal(conflict.currentRaw, B);
  assert.equal(conflict.expectedRaw, A);
  assert.equal(conflict.baselineKnown, true);
  assert.equal(writes(m).length, beforeWrites);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
  assert.equal(other.getSnapshot().expectedRaw, A);
});

test('byte-for-byte comparison treats a formatting-only rewrite as another writer', () => {
  const m = memory(); m.session.loadSnapshot();
  const compact = JSON.stringify(JSON.parse(A));
  assert.deepEqual(JSON.parse(compact), JSON.parse(A));
  m.replace(compact);
  assert.equal(m.session.checkCurrent().code, 'storage-conflict');
  assert.equal(m.session.save(B).code, 'storage-conflict');
  assert.equal(writes(m).length, 0);
});

test('external deletion is a conflict and cannot be adopted as a valid current backup', () => {
  const m = memory(); m.session.loadSnapshot(); m.replace(null);
  const result = m.session.save(B);
  assert.equal(result.code, 'storage-conflict');
  assert.equal(result.currentRaw, null);
  assert.equal(result.found, false);
  assert.equal(m.session.acceptCurrent(null).code, 'invalid-backup');
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(writes(m).length, 0);
});

test('external empty or damaged text is returned exactly for inspection and never auto-adopted', () => {
  for (const damaged of ['', '{not-json', 'null', '[]', '{}']) {
    const m = memory(); m.session.loadSnapshot(); m.replace(damaged);
    const result = m.session.checkCurrent();
    assert.equal(result.code, 'storage-conflict');
    assert.equal(result.currentRaw, damaged);
    assert.equal(m.session.save(B).code, 'storage-conflict');
    assert.equal(m.session.acceptCurrent(damaged).code, 'invalid-backup');
    assert.equal(m.session.getSnapshot().expectedRaw, A);
    assert.equal(writes(m).length, 0);
  }
});

test('initial damaged raw is retained for caller validation but cannot be overwritten through save', () => {
  for (const damaged of ['', '{bad-json', '{}']) {
    const m = memory(damaged);
    const loaded = m.session.loadSnapshot();
    assert.equal(loaded.ok, true, 'reading is distinct from validating the backup');
    assert.equal(loaded.currentRaw, damaged);
    assert.equal(m.session.save(B).code, 'stored-backup-invalid');
    assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), damaged);
    assert.equal(writes(m).length, 0);
  }
});

test('successful explicit adoption rechecks exact current text and updates only the baseline', () => {
  const m = memory(); m.session.loadSnapshot(); m.replace(B);
  const inspected = m.session.checkCurrent();
  assert.equal(inspected.currentRaw, B);
  const adopted = m.session.acceptCurrent(inspected.currentRaw);
  assert.equal(adopted.ok, true);
  assert.equal(adopted.expectedRaw, B);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
  assert.equal(writes(m).length, 0);
  assert.equal(m.session.save(C).ok, true);
});

test('a writer between checking and adoption rejects the checked older text', () => {
  const m = memory(); m.session.loadSnapshot(); m.replace(B);
  const inspected = m.session.checkCurrent(); m.replace(C);
  const adopted = m.session.acceptCurrent(inspected.currentRaw);
  assert.equal(adopted.code, 'storage-accept-conflict');
  assert.equal(adopted.checkedRaw, B);
  assert.equal(adopted.currentRaw, C);
  assert.equal(adopted.expectedRaw, A);
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(writes(m).length, 0);
});

test('deletion between inspection and adoption preserves baseline and does not recreate the record', () => {
  const m = memory(); m.session.loadSnapshot(); m.replace(B);
  const inspected = m.session.checkCurrent(); m.replace(null);
  const adopted = m.session.acceptCurrent(inspected.currentRaw);
  assert.equal(adopted.code, 'storage-accept-conflict');
  assert.equal(adopted.currentRaw, null);
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(m.records.has(SUPPORT_WORKSPACE_KEY), false);
});

test('successful save keeps noncanonical original formatting and verifies the written raw', () => {
  const m = memory(); m.session.loadSnapshot();
  const exact = `\n\t${JSON.stringify(JSON.parse(B))}  \n`;
  const result = m.session.save(exact);
  assert.equal(result.ok, true);
  assert.equal(result.rawText, exact);
  assert.equal(result.expectedRaw, exact);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), exact);
  assert.equal(m.session.checkCurrent().ok, true);
  assert.deepEqual(m.calls.map(call => call[0]), ['read', 'read', 'write', 'read', 'read']);
});

test('save and adopt reject invalid incoming envelopes before any write', () => {
  const invalid = [null, undefined, 8, '', '{', 'null', '[]', '{}',
    JSON.stringify({ format: 'other', version: SUPPORT_VERSION, state: {} }),
    JSON.stringify({ format: SUPPORT_FORMAT, version: 2, state: {} }),
    JSON.stringify({ format: SUPPORT_FORMAT, version: SUPPORT_VERSION, state: null }),
    JSON.stringify({ format: SUPPORT_FORMAT, version: SUPPORT_VERSION, state: [], extra: 1 }),
    JSON.stringify({ format: SUPPORT_FORMAT, version: SUPPORT_VERSION, state: {}, extra: 1 })];
  for (const input of invalid) {
    const m = memory(); m.session.loadSnapshot();
    assert.equal(m.session.save(input).code, 'invalid-backup');
    assert.equal(m.session.acceptCurrent(input).code, 'invalid-backup');
    assert.equal(m.session.getSnapshot().expectedRaw, A);
    assert.equal(writes(m).length, 0);
  }
});

test('64 KiB uses UTF-8 bytes and permits exactly the limit without rewriting padding', () => {
  const m = memory(); m.session.loadSnapshot();
  const exact = B + ' '.repeat(MAX_SUPPORT_BACKUP_BYTES - new TextEncoder().encode(B).byteLength);
  assert.equal(m.session.save(exact).ok, true);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), exact);
  const tooLarge = exact + ' ';
  const count = writes(m).length;
  assert.equal(m.session.save(tooLarge).code, 'backup-too-large');
  assert.equal(m.session.acceptCurrent(tooLarge).code, 'backup-too-large');
  assert.equal(writes(m).length, count);
  const chinese = raw('中'.repeat(Math.floor(MAX_SUPPORT_BACKUP_BYTES / 2)));
  assert.ok(chinese.length < MAX_SUPPORT_BACKUP_BYTES);
  assert.ok(new TextEncoder().encode(chinese).byteLength > MAX_SUPPORT_BACKUP_BYTES);
  assert.equal(m.session.save(chinese).code, 'backup-too-large');
});

test('initial oversized raw establishes exact internal baseline but is not returned or overwritten', () => {
  const tooLarge = '中'.repeat(MAX_SUPPORT_BACKUP_BYTES);
  const m = memory(tooLarge);
  const loaded = m.session.loadSnapshot();
  assert.equal(loaded.code, 'stored-backup-too-large');
  assert.equal(loaded.restricted, true);
  assert.equal(loaded.conflict, false);
  assert.equal(loaded.baselineKnown, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.currentRawBytes, MAX_SUPPORT_BACKUP_BYTES * 3);
  assert.equal(Object.hasOwn(loaded, 'currentRaw'), false);
  assert.equal(Object.hasOwn(loaded, 'expectedRaw'), false);
  assert.equal(Object.hasOwn(m.session.getSnapshot(), 'expectedRaw'), false);
  assert.equal(m.session.save(B).code, 'stored-backup-too-large');
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), tooLarge);
  assert.equal(writes(m).length, 0);
});

test('another writer oversized raw blocks writes and never propagates that oversized text', () => {
  const m = memory(); m.session.loadSnapshot(); m.replace('x'.repeat(MAX_SUPPORT_BACKUP_BYTES + 1));
  const result = m.session.save(B);
  assert.equal(result.code, 'stored-backup-too-large');
  assert.equal(result.conflict, true);
  assert.equal(result.expectedRaw, A);
  assert.equal(Object.hasOwn(result, 'currentRaw'), false);
  assert.equal(writes(m).length, 0);
  const accept = m.session.acceptCurrent(B);
  assert.equal(accept.code, 'storage-accept-conflict');
  assert.equal(Object.hasOwn(accept, 'currentRaw'), false);
});

test('unknown baseline cannot save, inspect or adopt even when record exists', () => {
  const m = memory();
  assert.equal(m.session.save(B).code, 'storage-not-initialized');
  assert.equal(m.session.checkCurrent().code, 'storage-not-initialized');
  assert.equal(m.session.acceptCurrent(A).code, 'storage-not-initialized');
  assert.equal(m.session.getSnapshot().baselineKnown, false);
  assert.equal(m.calls.length, 0);
});

test('initial read errors never establish an empty baseline or permit later implicit save', () => {
  const m = memory();
  const read = m.storage.getItem;
  m.storage.getItem = () => { throw new Error('blocked read'); };
  const result = m.session.loadSnapshot();
  assert.equal(result.code, 'storage-read-failed');
  assert.equal(result.baselineKnown, false);
  assert.equal(m.session.getSnapshot().initialized, false);
  m.storage.getItem = read;
  assert.equal(m.session.save(B).code, 'storage-not-initialized');
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), A);
  assert.equal(writes(m).length, 0);
  assert.equal(m.session.loadSnapshot().currentRaw, A, 'an explicit retry reads the real existing record');
});

test('a throwing storage provider and missing interfaces fail without baseline changes', () => {
  const provider = createSupportStorage(() => { throw new Error('SecurityError'); });
  assert.equal(provider.loadSnapshot().code, 'storage-read-failed');
  assert.equal(provider.getSnapshot().baselineKnown, false);
  for (const adapter of [undefined, {}, { getItem: 1 }]) {
    const session = createSupportStorage(adapter);
    assert.equal(session.loadSnapshot().code, 'storage-read-failed');
    assert.equal(session.getSnapshot().baselineKnown, false);
  }
  const session = createSupportStorage({ getItem: () => A });
  session.loadSnapshot();
  assert.equal(session.save(B).code, 'storage-write-failed');
  assert.equal(session.getSnapshot().expectedRaw, A);
});

test('adapter reads must return a string or null and never pretend undefined means empty', () => {
  for (const invalid of [undefined, false, {}, 1]) {
    const session = createSupportStorage({ getItem: () => invalid, setItem() { assert.fail('must not write'); } });
    assert.equal(session.loadSnapshot().code, 'invalid-storage-value');
    assert.equal(session.getSnapshot().baselineKnown, false);
  }
});

test('a later read failure blocks save and adoption while retaining the known baseline', () => {
  const m = memory(); m.session.loadSnapshot();
  m.storage.getItem = () => { throw new Error('read unavailable'); };
  for (const result of [m.session.checkCurrent(), m.session.save(B), m.session.acceptCurrent(A)]) {
    assert.equal(result.code, 'storage-read-failed');
    assert.equal(result.baselineKnown, true);
    assert.equal(result.expectedRaw, A);
  }
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(writes(m).length, 0);
});

test('quota and ordinary write errors never claim success or advance baseline', () => {
  for (const error of [new DOMException('quota full', 'QuotaExceededError'), new Error('write blocked')]) {
    const m = memory(); m.session.loadSnapshot();
    m.storage.setItem = () => { throw error; };
    const result = m.session.save(B);
    assert.equal(result.code, 'storage-write-failed');
    assert.equal(result.ok, false);
    assert.equal(m.session.getSnapshot().expectedRaw, A);
    assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), A);
  }
});

test('a writer that mutates storage and then throws does not trigger an automatic rollback', () => {
  const m = memory(); m.session.loadSnapshot();
  m.storage.setItem = (key, value) => { m.records.set(key, value); throw new Error('failure after write'); };
  assert.equal(m.session.save(B).code, 'storage-write-failed');
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(m.session.checkCurrent().code, 'storage-conflict');
});

test('readback failure means the write cannot be confirmed, and baseline remains old', () => {
  const m = memory(); m.session.loadSnapshot();
  const set = m.storage.setItem;
  m.storage.setItem = (key, value) => { set(key, value); m.storage.getItem = () => { throw new Error('readback blocked'); }; };
  const result = m.session.save(B);
  assert.equal(result.code, 'storage-read-failed');
  assert.equal(result.writtenRaw, B);
  assert.equal(result.expectedRaw, A);
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
  assert.equal(m.session.getSnapshot().expectedRaw, A);
  assert.equal(writes(m).length, 1);
});

test('competing write or deletion before readback is detected and the competing record is retained', () => {
  for (const newer of [C, null, 'x'.repeat(MAX_SUPPORT_BACKUP_BYTES + 1)]) {
    const m = memory(); m.session.loadSnapshot();
    const set = m.storage.setItem;
    m.storage.setItem = (key, value) => { set(key, value); m.replace(newer); };
    const result = m.session.save(B);
    assert.equal(result.code, 'storage-verification-failed');
    assert.equal(result.writtenRaw, B);
    assert.equal(result.expectedRaw, A);
    if (newer?.length > MAX_SUPPORT_BACKUP_BYTES) assert.equal(Object.hasOwn(result, 'currentRaw'), false);
    else assert.equal(result.currentRaw, newer);
    assert.equal(m.session.getSnapshot().expectedRaw, A);
    assert.equal(m.records.has(SUPPORT_WORKSPACE_KEY) ? m.records.get(SUPPORT_WORKSPACE_KEY) : null, newer);
    assert.equal(writes(m).length, 1, 'no rollback write replaces another window');
  }
});

test('readback sees a silent failed write and rejects success', () => {
  const m = memory(); m.session.loadSnapshot(); m.storage.setItem = () => {};
  const result = m.session.save(B);
  assert.equal(result.code, 'storage-verification-failed');
  assert.equal(result.currentRaw, A);
  assert.equal(m.session.getSnapshot().expectedRaw, A);
});

test('comparison plus write is deliberately not represented as an atomic cross-window lock', () => {
  const m = memory(); m.session.loadSnapshot();
  const set = m.storage.setItem;
  m.storage.setItem = (key, value) => {
    m.replace(C); // Another writer after the preflight comparison, before write.
    set(key, value);
  };
  const result = m.session.save(B);
  assert.equal(result.ok, true, 'readback confirms our write but cannot detect the overwritten intermediate writer');
  assert.equal(m.records.get(SUPPORT_WORKSPACE_KEY), B);
  m.replace(C); // A later write can also occur after successful readback.
  assert.equal(m.session.checkCurrent().code, 'storage-conflict');
});

test('all operations address only the support key and expose no force overwrite method', () => {
  const m = memory();
  for (let i = 0; i < 10; i++) m.records.set(`other-workspace-${i}`, `keep-${i}`);
  const others = [...m.records].filter(([key]) => key !== SUPPORT_WORKSPACE_KEY);
  m.session.loadSnapshot(); m.session.checkCurrent(); m.session.save(B); m.replace(C); m.session.acceptCurrent(C);
  assert.ok(m.calls.every(call => call[1] === SUPPORT_WORKSPACE_KEY));
  assert.deepEqual([...m.records].filter(([key]) => key !== SUPPORT_WORKSPACE_KEY), others);
  assert.equal(m.session.forceOverwrite, undefined);
  assert.equal(m.session.remove, undefined);
});
