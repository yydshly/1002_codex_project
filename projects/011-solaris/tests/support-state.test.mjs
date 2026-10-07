import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_WORKSPACE_KEY, MAX_SUPPORT_BACKUP_BYTES, createSupportStore,
  validateSupportState, parseSupportBackup, serializeSupportBackup } from '../web/support/state.js';

// These are dependency-injection/transaction fixtures, not evidence for real meshes.
const RULE = 'frozen-rule-v1';
const TABLE_HASH = 'a'.repeat(64), LAMP_HASH = 'b'.repeat(64);
const initial = () => ({
  table: { assetId: 'table', sha256: TABLE_HASH, analysisVersion: RULE, surfaceId: 'surface-a',
    transform: { x: 0, y: 0, z: 0, yaw: 0, scale: { x: 1, y: 1, z: 1 } } },
  lamp: { assetId: 'lamp', sha256: LAMP_HASH, scale: 1, yaw: 0 },
  attachment: { localAnchor: { x: -.7, z: 0 } },
});
const copy = value => structuredClone(value);
const change = (source, fn) => { const next = copy(source); fn(next); return next; };

function setup(extra = {}) {
  const assets = { table: { sha256: TABLE_HASH, surfaces: ['surface-a', 'surface-b'] }, lamp: { sha256: LAMP_HASH } };
  const calls = { placement: 0, sweep: 0 };
  const options = { assets, analysisVersion: RULE, initialState: initial(),
    validatePlacement(state) {
      calls.placement++;
      const { x, z } = state.attachment.localAnchor, t = state.table.transform;
      const radius = .1 * state.lamp.scale;
      if (Math.abs(x) + radius / t.scale.x > 1 || Math.abs(z) + radius / t.scale.z > 1) return { ok: false, reason: 'fixture-overhang' };
      if (Math.abs(x) < .12 && Math.abs(z) < .2) return { ok: false, reason: 'fixture-hole' };
      return { ok: true, worldPose: { x: t.x + Math.cos(t.yaw) * t.scale.x * x + Math.sin(t.yaw) * t.scale.z * z,
        y: t.y + .75 * t.scale.y, z: t.z - Math.sin(t.yaw) * t.scale.x * x + Math.cos(t.yaw) * t.scale.z * z,
        yaw: t.yaw + state.lamp.yaw, scale: state.lamp.scale }, evidence: { scope: 'fixture-only' } };
    },
    checkSweep(before, after) {
      calls.sweep++;
      const a = before.attachment.localAnchor, b = after.attachment.localAnchor;
      if (a.x * b.x < 0 && Math.abs(a.z) < .2 && Math.abs(b.z) < .2) return { ok: false, reason: 'fixture-swept-hole' };
      return { ok: true };
    }, ...extra };
  return { options, assets, calls, store: createSupportStore(options) };
}

test('initial state requires registered fingerprints, analysis and geometry readiness', () => {
  const { options } = setup();
  for (const edit of [state => state.table.assetId = 'unknown', state => state.table.sha256 = 'c'.repeat(64),
    state => state.lamp.sha256 = 'd'.repeat(64), state => state.table.analysisVersion = 'old-rule',
    state => state.table.surfaceId = 'invented']) {
    assert.throws(() => createSupportStore({ ...options, initialState: change(initial(), edit) }));
  }
  assert.throws(() => createSupportStore({ ...options, checkSweep: undefined }));
  assert.throws(() => createSupportStore({ ...options, validatePlacement: () => ({ ok: false, reason: 'not-ready' }) }), /not-ready/);
});

test('rejects nonfinite, zero/negative scales, tilt/shear and unknown state fields', () => {
  const { options } = setup();
  for (const edit of [s => s.table.transform.x = Infinity, s => s.lamp.yaw = NaN, s => s.attachment.localAnchor.z = '0',
    s => s.table.transform.scale.x = 0, s => s.table.transform.scale.y = -1, s => s.lamp.scale = 0,
    s => s.table.transform.pitch = .2, s => s.table.transform.shear = .1, s => s.extra = 'unversioned']) {
    assert.equal(validateSupportState(change(initial(), edit), options).ok, false);
  }
});

test('parent translation, yaw and stretch move the root pose but retain independent lamp shape', () => {
  const { store } = setup();
  const next = change(store.getState(), state => { state.table.transform = { x: 3, y: .2, z: -2, yaw: Math.PI / 2, scale: { x: 2, y: 1.2, z: .8 } }; state.lamp.yaw = .3; });
  const result = store.apply(next, '拉伸桌子');
  assert.equal(result.ok, true);
  assert.equal(result.worldPose.scale, 1, 'lamp own scale is not inherited from its stretched parent');
  assert.ok(Math.abs(result.worldPose.x - 3) < 1e-12);
  assert.ok(Math.abs(result.worldPose.z + .6) < 1e-12);
  assert.ok(Math.abs(result.worldPose.y - 1.1) < 1e-12);
  assert.equal(result.worldPose.yaw, Math.PI / 2 + .3);
  assert.deepEqual(store.getState().attachment, initial().attachment);
});

test('failed table shrinking rejects the whole edit without moving or shrinking the lamp', () => {
  const { store } = setup();
  const before = store.getState();
  const next = change(before, s => { s.table.transform.scale.x = .2; s.table.transform.x = 2; });
  assert.equal(store.apply(next).ok, false);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.getStatus().canUndo, false);
});

test('changing detected surface is an explicit whole-state operation, and unknown selection retains baseline', () => {
  const { store } = setup();
  const before = store.getState();
  assert.equal(store.apply(change(before, s => s.table.surfaceId = 'invented'), '切换支撑面').ok, false);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.apply(change(before, s => s.table.surfaceId = 'surface-b'), '切换支撑面').ok, true);
  assert.equal(store.undo().state.table.surfaceId, 'surface-a');
  assert.equal(store.redo().state.table.surfaceId, 'surface-b');
});

test('many valid drag previews commit as one complete undo/redo record', () => {
  const { store } = setup();
  const before = store.getState();
  assert.equal(store.begin('同时编辑桌与灯').ok, true);
  for (let i = 1; i <= 4; i++) assert.equal(store.update(change(before, s => {
    s.table.transform.x = i / 10; s.table.transform.yaw = i / 100; s.lamp.yaw = i / 20;
    s.attachment.localAnchor.x = -.7 + i / 100;
  })).ok, true);
  const after = store.getState();
  assert.equal(store.getStatus().canUndo, false, 'previews do not create history');
  assert.equal(store.commit().changed, true);
  assert.deepEqual(store.undo().state, before);
  assert.equal(store.getStatus().canUndo, false, 'one undo restores the entire gesture');
  assert.deepEqual(store.redo().state, after);
});

test('illegal release rolls back every valid earlier preview in the same gesture', () => {
  const { store } = setup();
  const before = store.getState();
  store.begin();
  assert.equal(store.update(change(before, s => s.table.transform.x = .5)).ok, true);
  assert.equal(store.update(change(store.getState(), s => s.attachment.localAnchor.x = 1.4)).ok, false);
  assert.equal(store.getStatus().invalidPending, true);
  const release = store.commit();
  assert.equal(release.ok, false);
  assert.equal(release.rolledBack, true);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.getStatus().canUndo, false);
});

test('both endpoints valid still cannot cross a hole between mouse events', () => {
  const { store, options } = setup();
  const before = store.getState(), across = change(before, s => s.attachment.localAnchor.x = .7);
  assert.equal(validateSupportState(across, options).ok, true, 'the end point itself fits');
  store.begin();
  const move = store.update(across);
  assert.equal(move.ok, false);
  assert.equal(move.reason, 'fixture-swept-hole');
  assert.equal(store.commit().rolledBack, true);
  assert.deepEqual(store.getState(), before);
});

test('after rejected movement a legal candidate must sweep from the last legal pose', () => {
  const { store, calls } = setup();
  const before = store.getState();
  store.begin();
  assert.equal(store.update(change(before, s => s.attachment.localAnchor.x = .7)).ok, false);
  assert.equal(store.update(change(before, s => s.attachment.localAnchor.x = .8)).ok, false, 'cannot bypass hole by a second event');
  assert.equal(store.update(change(before, s => s.attachment.localAnchor.x = -.6)).ok, true);
  assert.equal(store.getStatus().invalidPending, false);
  assert.equal(store.commit().ok, true);
  assert.equal(calls.sweep, 3);
});

test('Escape, blur, pointercancel and lost capture each restore the complete baseline', () => {
  for (const reason of ['Escape', 'blur', 'pointercancel', 'lostpointercapture']) {
    const { store } = setup();
    const before = store.getState();
    store.begin(reason);
    store.update(change(before, s => { s.table.transform.x = .2; s.lamp.yaw = .4; }));
    assert.equal(store.cancel(reason).cancelled, true);
    assert.deepEqual(store.getState(), before);
    assert.equal(store.getStatus().canUndo, false);
  }
});

test('geometry errors, malformed success and callback mutation cannot corrupt state', () => {
  const { store, options } = setup();
  const before = store.getState(), next = change(before, s => s.table.transform.x = .5);
  options.validatePlacement = () => { throw new Error('geometry-unavailable'); };
  assert.equal(store.apply(next).ok, false);
  assert.deepEqual(store.getState(), before);
  options.validatePlacement = state => { state.table.transform.x = 99; return { valid: true }; };
  assert.equal(store.apply(next).ok, false, 'the DI contract requires explicit ok:true');
  assert.deepEqual(store.getState(), before);
  options.validatePlacement = state => { state.table.transform.x = 99; return { ok: true }; };
  assert.equal(store.apply(next).ok, true);
  assert.equal(store.getState().table.transform.x, .5, 'callback receives an isolated copy');
  const external = store.getState(); external.lamp.scale = 100;
  assert.equal(store.getState().lamp.scale, 1);
});

test('commit revalidates if geometry changes after the latest legal preview', () => {
  const { store, options } = setup();
  const before = store.getState();
  store.begin();
  store.update(change(before, s => s.table.transform.x = .5));
  options.validatePlacement = () => ({ ok: false, reason: 'obstacle-changed' });
  assert.equal(store.commit().reason, 'obstacle-changed');
  assert.deepEqual(store.getState(), before);
});

test('undo/redo revalidate fingerprints and geometry without consuming an invalid history record', () => {
  const { store, assets, options } = setup();
  const before = store.getState();
  store.apply(change(before, s => s.table.transform.x = .5));
  const after = store.getState();
  assets.table.sha256 = 'e'.repeat(64);
  assert.equal(store.undo().ok, false);
  assert.deepEqual(store.getState(), after);
  assert.equal(store.getStatus().canUndo, true);
  assets.table.sha256 = TABLE_HASH;
  assert.equal(store.undo().ok, true);
  const originalCallback = options.validatePlacement;
  options.validatePlacement = () => ({ ok: false, reason: 'blocked-now' });
  assert.equal(store.redo().ok, false);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.getStatus().canRedo, true);
  options.validatePlacement = originalCallback;
  assert.deepEqual(store.redo().state, after);
});

test('new accepted edit clears redo, rejection and no-op preserve it', () => {
  const { store } = setup();
  const before = store.getState();
  store.apply(change(before, s => s.table.transform.x = .5));
  store.undo();
  store.apply(change(before, s => s.attachment.localAnchor.x = 9));
  assert.equal(store.getStatus().canRedo, true);
  assert.equal(store.apply(before).changed, false);
  assert.equal(store.getStatus().canRedo, true);
  store.apply(change(before, s => s.table.transform.z = .5));
  assert.equal(store.getStatus().canRedo, false);
});

test('deterministic version-1 export contains the exact relation and cancels unfinished previews', () => {
  const { store, options } = setup();
  const before = store.getState();
  store.begin(); store.update(change(before, s => s.table.transform.x = .5));
  const backup = store.export();
  assert.equal(store.getStatus().transactionActive, false);
  assert.deepEqual(parseSupportBackup(backup, options).state, before);
  assert.equal(backup, serializeSupportBackup(before, options));
  assert.equal(backup, store.export());
});

test('invalid paste retains its exact text, original state and history without a write', () => {
  const { store, options } = setup();
  const before = store.getState(), envelope = JSON.parse(store.export());
  for (const rawText of ['{"unfinished":', JSON.stringify({ ...envelope, version: 2 }),
    JSON.stringify({ ...envelope, extra: true }), JSON.stringify({ ...envelope, state: change(before, s => s.table.sha256 = 'changed') }),
    JSON.stringify({ ...envelope, state: change(before, s => s.table.surfaceId = 'gone') }),
    JSON.stringify({ ...envelope, state: change(before, s => s.attachment.localAnchor.x = 9) })]) {
    assert.equal(store.restore(rawText).ok, false);
    assert.equal(parseSupportBackup(rawText, options).ok, false);
    assert.deepEqual(store.getState(), before);
  }
  assert.equal(store.getStatus().canUndo, false);
});

test('valid restore uses editing validation and can be undone as one complete relation', () => {
  const { store, options, calls } = setup();
  const before = store.getState(), restored = change(before, s => { s.table.transform.x = 2; s.lamp.yaw = .6; s.attachment.localAnchor.x = .7; });
  const backup = serializeSupportBackup(restored, options);
  assert.equal(store.restore(backup).ok, true);
  assert.deepEqual(store.getState(), restored);
  assert.equal(calls.sweep, 0, 'restore is a discrete relation, not a claimed sliding path');
  assert.deepEqual(store.undo().state, before);
  assert.deepEqual(store.redo().state, restored);
});

test('explicit load preserves invalid local raw data and never auto-writes any key', () => {
  const { store } = setup();
  const before = store.getState(), rawText = '  {broken original \n';
  const reads = [], writes = [];
  const storage = { getItem(key) { reads.push(key); return rawText; }, setItem(key, value) { writes.push([key, value]); } };
  const loaded = store.load(storage);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.rawText, rawText);
  assert.deepEqual(store.getState(), before);
  assert.deepEqual(reads, [SUPPORT_WORKSPACE_KEY]);
  assert.deepEqual(writes, []);
});

test('save writes only the independent new key and cancels an unfinished gesture', () => {
  const { store, options } = setup();
  const before = store.getState(), writes = [];
  store.begin(); store.update(change(before, s => s.table.transform.x = .5));
  const saved = store.save({ setItem(key, value) { writes.push([key, value]); } });
  assert.equal(saved.ok, true);
  assert.deepEqual(writes.map(([key]) => key), ['atelier-support-workspace-v1']);
  assert.deepEqual(parseSupportBackup(writes[0][1], options).state, before);
  assert.deepEqual(store.getState(), before);
});

test('storage quota/read failures retain valid in-memory state and allow explicit backup', () => {
  const { store } = setup();
  const before = store.getState();
  const saved = store.save({ setItem() { throw new Error('quota'); } });
  assert.equal(saved.ok, false);
  assert.match(saved.reason, /quota/);
  assert.equal(typeof saved.rawText, 'string');
  assert.equal(store.load({ getItem() { throw new Error('read-denied'); } }).ok, false);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.export(), saved.rawText);
});

test('oversized UTF-8 backup is rejected before parse, without changing its state', () => {
  const { store, options } = setup();
  const before = store.getState();
  const text = '中'.repeat(Math.floor(MAX_SUPPORT_BACKUP_BYTES / 3) + 1);
  assert.ok(text.length < MAX_SUPPORT_BACKUP_BYTES);
  assert.equal(parseSupportBackup(text, options).ok, false);
  assert.match(parseSupportBackup(text, options).reason, /64 KiB/);
  assert.equal(store.restore(text).ok, false);
  assert.deepEqual(store.getState(), before);
});

test('discrete edits can explicitly require the same conservative sweep as mouse dragging', () => {
  const { store } = setup();
  const before = store.getState(), across = change(before, s => s.attachment.localAnchor.x = .7);
  assert.equal(store.apply(across, { label: '连续移动', sweep: true }).ok, false);
  assert.deepEqual(store.getState(), before);
  assert.equal(store.apply(across, { label: '明确重新摆放', sweep: false }).ok, true);
});
