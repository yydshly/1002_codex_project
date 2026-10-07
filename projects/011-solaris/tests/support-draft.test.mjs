import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportDraft } from '../web/support/draft.js';

// These deliberately small states test draft comparisons and status only.
// They are not evidence of valid asset fingerprints or support geometry.
const state = x => ({ table: { transform: { x, scale: { x: 1, y: 1, z: 1 } } },
  lamp: { yaw: 0 }, attachment: { localAnchor: { x: 0, z: 0 } } });
const A = state(0), B = state(0.05), C = state(-0.05);
const flags = (extra = {}) => ({ hasState: true, dirty: false, pendingSelection: false,
  transactionActive: false, externalChanged: false, ...extra });

test('initial and null observations have no state; the first unsaved scheme is dirty', () => {
  const draft = createSupportDraft();
  assert.deepEqual(draft.getSnapshot(), flags({ hasState: false }));
  assert.equal(draft.observe(null).ok, true);
  assert.deepEqual(draft.getSnapshot(), flags({ hasState: false }));
  assert.equal(draft.observe(A).ok, true);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
});

test('verified save makes the current scheme clean and later edits become dirty', () => {
  const draft = createSupportDraft();
  draft.observe(A);
  assert.equal(draft.markSaved(A).ok, true);
  assert.deepEqual(draft.getSnapshot(), flags());
  draft.observe(B);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
});

test('a verified initial stored state can be marked before its first observation', () => {
  const draft = createSupportDraft();
  draft.markSaved(A);
  assert.deepEqual(draft.getSnapshot(), flags({ hasState: false }));
  draft.observe(A);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('Undo to the saved value is clean; redo to a different value is dirty', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  draft.observe(B);
  assert.equal(draft.getSnapshot().dirty, true);
  draft.observe(JSON.parse(JSON.stringify(A)));
  assert.equal(draft.getSnapshot().dirty, false);
  draft.observe(B);
  assert.equal(draft.getSnapshot().dirty, true);
});

test('a preview can return to the saved value while the transaction remains active', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  draft.observe(B, { transactionActive: true });
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true, transactionActive: true }));
  draft.observe(A, { transactionActive: true });
  assert.deepEqual(draft.getSnapshot(), flags({ transactionActive: true }));
  draft.observe(A);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('null and undefined pending replies retain the last validated scheme', () => {
  const draft = createSupportDraft();
  draft.observe(B); draft.markSaved(A);
  draft.observe(null, { pendingSelection: true });
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true, pendingSelection: true }));
  draft.observe(undefined, { pendingSelection: true, transactionActive: true });
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true, pendingSelection: true, transactionActive: true }));
  draft.observe(B);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
});

test('pending selection is distinct from dirty placement and clears on an ordinary observation', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  draft.observe(null, { pendingSelection: true });
  assert.deepEqual(draft.getSnapshot(), flags({ pendingSelection: true }));
  draft.observe(A);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('an external change remains dirty even when local geometry equals the saved baseline', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  draft.markExternalChanged();
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true, externalChanged: true }));
  draft.observe(B); draft.observe(A);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true, externalChanged: true }));
});

test('explicit verified adoption clears external change and Undo retrieves a dirty former draft', () => {
  const draft = createSupportDraft();
  draft.observe(B); draft.markSaved(A); draft.markExternalChanged();
  draft.observe(C); draft.markSaved(C);
  assert.deepEqual(draft.getSnapshot(), flags());
  draft.observe(B);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
  draft.observe(C);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('a late save for an older scheme cannot mark the current edited scheme clean', () => {
  const draft = createSupportDraft();
  draft.observe(B);
  draft.markSaved(A);
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
  draft.observe(A);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('observation, export copies and snapshot reads alone never advance the saved baseline', () => {
  const draft = createSupportDraft();
  draft.observe(B);
  JSON.stringify(B, null, 2);
  draft.observe(JSON.parse(JSON.stringify(B)));
  draft.getSnapshot();
  assert.deepEqual(draft.getSnapshot(), flags({ dirty: true }));
});

test('structural comparison ignores object field order and serialized whitespace', () => {
  const draft = createSupportDraft();
  const original = { name: '台灯', properties: { alpha: 1, beta: true }, values: [{ x: 2, z: null }, 'a'] };
  draft.observe(original); draft.markSaved(original);
  const reordered = JSON.parse(`{ "values": [ { "z": null, "x": 2 }, "a" ],
    "properties": { "beta": true, "alpha": 1 }, "name": "台灯" }`);
  draft.observe(reordered);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('array order and scalar types remain significant to equality', () => {
  const draft = createSupportDraft();
  const original = { values: [1, '1', false, null] };
  draft.observe(original); draft.markSaved(original);
  draft.observe({ values: ['1', 1, false, null] });
  assert.equal(draft.getSnapshot().dirty, true);
  draft.observe({ values: [1, 1, false, null] });
  assert.equal(draft.getSnapshot().dirty, true);
  draft.observe(original);
  assert.equal(draft.getSnapshot().dirty, false);
});

test('mutating input or returned flags does not change retained comparison signatures', () => {
  const draft = createSupportDraft();
  const input = state(0);
  draft.observe(input); draft.markSaved(input);
  input.table.transform.x = 0.05;
  const observed = draft.getSnapshot();
  observed.dirty = true; observed.externalChanged = true;
  assert.deepEqual(draft.getSnapshot(), flags());
  draft.observe(input);
  assert.equal(draft.getSnapshot().dirty, true);
  draft.observe(A);
  assert.equal(draft.getSnapshot().dirty, false);
});

test('invalid JSON states cannot replace a valid draft or clear its operation flags', () => {
  const cycle = {}; cycle.self = cycle;
  const sparse = []; sparse[2] = 1;
  const extra = [1]; extra.custom = 2;
  const getter = {}; Object.defineProperty(getter, 'value', { enumerable: true, get() { throw new Error('must not read'); } });
  const invalid = [[], 1, 'raw', false, { x: NaN }, { x: Infinity }, { x: -Infinity },
    { x: undefined }, { x: Symbol('x') }, { x: 1n }, { x() {} }, { x: new Date() },
    { x: new Map() }, Object.create({ inherited: true }), cycle, { sparse }, { extra }, getter,
    { [Symbol('field')]: 1 }];
  const draft = createSupportDraft();
  draft.observe(B, { pendingSelection: true, transactionActive: true }); draft.markSaved(A); draft.markExternalChanged();
  const before = draft.getSnapshot();
  for (const value of invalid) {
    assert.equal(draft.observe(value).ok, false);
    assert.deepEqual(draft.getSnapshot(), before);
    assert.equal(draft.markSaved(value).ok, false);
    assert.deepEqual(draft.getSnapshot(), before);
  }
});

test('invalid markSaved including absent state preserves the verified baseline and external warning', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A); draft.markExternalChanged();
  const before = draft.getSnapshot();
  for (const value of [null, undefined, { number: NaN }]) {
    assert.equal(draft.markSaved(value).ok, false);
    assert.deepEqual(draft.getSnapshot(), before);
  }
  draft.markSaved(A);
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('invalid operation flags reject atomically without updating the compared state', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  for (const options of [null, [], false, { pendingSelection: 'yes' }, { transactionActive: 1 }]) {
    assert.equal(draft.observe(B, options).ok, false);
    assert.deepEqual(draft.getSnapshot(), flags());
  }
});

test('shared noncyclic JSON references and null-prototype objects compare by value', () => {
  const draft = createSupportDraft();
  const shared = { name: 'lamp' };
  const original = Object.assign(Object.create(null), { first: shared, second: shared });
  draft.observe(original); draft.markSaved(original);
  draft.observe({ second: { name: 'lamp' }, first: { name: 'lamp' } });
  assert.deepEqual(draft.getSnapshot(), flags());
});

test('excessive nesting, node counts and text reject without losing a valid scheme', () => {
  const draft = createSupportDraft();
  draft.observe(A); draft.markSaved(A);
  let deep = { leaf: 1 };
  for (let i = 0; i < 40; i++) deep = { child: deep };
  for (const value of [deep, { values: Array.from({ length: 5000 }, () => 1) }, { text: 'x'.repeat(70000) },
    { values: Array.from({ length: 100 }, () => 'x'.repeat(1000)) }]) {
    assert.equal(draft.observe(value).ok, false);
    assert.deepEqual(draft.getSnapshot(), flags());
  }
});
