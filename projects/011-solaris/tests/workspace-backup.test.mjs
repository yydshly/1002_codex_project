import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSPACES, MAX_WORKSPACE_BYTES, createWorkspaceBackup } from '../web/collection/workspace.js';
import { initialState as collection } from '../web/collection/core.js';
import { initialProject, validateProject } from '../web/studio/core.js';
import { initialState as showroom } from '../web/showroom/core.js';
import { initialState as imaging } from '../web/imaging/core.js';
import { initialState as landmark } from '../web/landmark/core.js';
import { initialState as kitchen } from '../web/kitchen/core.js';
import { initialState as creative, addStroke } from '../web/creative/core.js';
import { initialState as skate, appendTrial, gesture } from '../web/skate/core.js';
import { initialState as materials, appendRun } from '../web/materials/core.js';
import * as oldWater from '../web/underwater/core.js';
import { parseState } from '../web/underwater/workspace.js';

const TRIP = 'atelier-collection-trip-v1', LEGACY = 'atelier-underwater-workspace-v1';
const ids = WORKSPACES.map(item => item.id), key = id => WORKSPACES.find(item => item.id === id).key;
const raw = value => JSON.stringify(value), copy = value => structuredClone(value);
const bundle = records => ({ format: 'atelier-workspace', version: 1, createdAt: '2026-10-06T10:20:30.000Z',
  records: Object.fromEntries(ids.map(id => [id, records[id] ?? null])) });

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); this.operations = []; this.onGet = null; this.beforeSet = null; this.afterSet = null; this.beforeRemove = null; }
  getItem(key) { this.operations.push(['get', key]); this.onGet?.(key, this); return this.values.get(key) ?? null; }
  setItem(key, value) { this.operations.push(['set', key, value]); this.beforeSet?.(key, value, this); this.values.set(key, value); this.afterSet?.(key, value, this); }
  removeItem(key) { this.operations.push(['remove', key]); this.beforeRemove?.(key, this); this.values.delete(key); }
  writes() { return this.operations.filter(([operation]) => operation !== 'get'); }
}
function savedRecords({ largeSlots = false } = {}) {
  const project = validateProject(initialProject());
  project.objects.art.customImage = 'data:image/png;base64,QUJD';
  const slotA = copy(project), slotB = copy(project);
  slotA.name = '阅读角 A'; slotB.name = '自然光 B'; slotB.environment.hour = 10;
  const thumbnail = 'data:image/jpeg;base64,' + 'A'.repeat(largeSlots ? 120_000 : 4);
  const manifest = JSON.parse(readFileSync(new URL('../web/assets/imaging/manifest.json', import.meta.url)));
  const imageStates = Object.fromEntries(manifest.assets.map(asset => [asset.id, imaging(asset.width, asset.height, asset.id)]));
  imageStates.hand.measurements = [{ id: 'measure-1', a: { x: 100, y: 200 }, b: { x: 700, y: 1100 } }];
  imageStates.hand.calibration = { a: { x: 100, y: 200 }, b: { x: 200, y: 200 }, lengthMm: 15 };
  let drawing = addStroke(creative(), [[100, 100, .5], [240, 140, .8]]);
  drawing.source = { id: 'wheat', rect: [.1, .2, .6, .5] }; drawing.activeLayer = 'paint';
  drawing = addStroke(drawing, [[800, 600, 1]]);
  const water = oldWater.appendDrag(oldWater.initialState(), [oldWater.INITIAL_FISH.position, [-.7, 1.3]]);
  return Object.fromEntries(Object.entries({
    collection: { ...collection(), pinned: ['chair'], wishlist: ['sofa'], lastScene: 'underwater' },
    living: { project, slots: { a: { project: slotA, thumbnail, date: '2026年10月6日 18:20:30' }, b: { project: slotB, thumbnail, date: '2026年10月5日 13:11' } } },
    showroom: { ...showroom(), hood: .65 },
    imaging: { format: 'atelier-imaging', version: 1, activeId: 'hand', viewport: { width: 1200, height: 720 }, states: imageStates },
    landmark: { ...landmark(), time: 11 }, kitchen: kitchen(), creative: drawing,
    skate: appendTrial(skate(), gesture(96, 0, 320)), materials: appendRun(appendRun(materials(), 'copper', 4), 'aluminum', 4),
    underwater: parseState(oldWater.serializeState(water)),
  }).map(([id, value]) => [id, JSON.stringify(value, null, 2)]));
}
function setup(records = {}) {
  const storage = new MemoryStorage(Object.entries(records).map(([id, value]) => [key(id), value]));
  return { storage, backup: createWorkspaceBackup(storage) };
}

test('the pure backup registry covers collection plus nine fixed workspaces without DOM, network, or fitting', () => {
  assert.equal(globalThis.document, undefined);
  assert.deepEqual(ids, ['collection', 'living', 'showroom', 'imaging', 'landmark', 'kitchen', 'creative', 'skate', 'materials', 'underwater']);
  assert.equal(new Set(WORKSPACES.map(item => item.key)).size, 10);
  assert.ok(Object.isFrozen(WORKSPACES)); assert.ok(WORKSPACES.every(Object.isFrozen));
  assert.equal(MAX_WORKSPACE_BYTES, 12 * 1024 * 1024);
});

test('capture validates all ten real stable records and keeps full living A/B thumbnails, dates, source selections and ledgers verbatim', () => {
  const records = savedRecords({ largeSlots: true }), { storage, backup } = setup(records);
  storage.values.set(TRIP, 'navigation checkpoint'); storage.values.set(LEGACY, 'old underwater rescue raw');
  const result = backup.capture();
  assert.equal(result.ok, true); assert.equal(result.status, 'captured');
  assert.deepEqual(result.bundle.records, records); assert.ok(result.entries.every(entry => entry.status === 'saved'));
  assert.equal(result.entries.find(entry => entry.id === 'living').bytes > 64 * 1024, true);
  assert.equal(JSON.parse(result.bundle.records.living).slots.a.date, '2026年10月6日 18:20:30');
  assert.ok(Number.isFinite(Date.parse(result.bundle.createdAt)));
  assert.equal(Object.hasOwn(result.bundle.records, 'trip'), false); assert.equal(Object.hasOwn(result.bundle.records, 'legacy'), false);
  assert.deepEqual(storage.writes(), []);
});

test('a selected all-workspace restore writes exact original raw and leaves trip, legacy and unrelated keys intact', () => {
  const records = savedRecords(), { storage, backup } = setup({ collection: raw(collection()), showroom: raw(showroom()) });
  storage.values.set(TRIP, 'current trip raw'); storage.values.set(LEGACY, 'older raw'); storage.values.set('unrelated', 'keep');
  const preview = backup.preview(raw(bundle(records)));
  assert.equal(preview.status, 'previewed'); assert.equal(preview.entries.length, 10);
  assert.equal(preview.currentBundle.records.collection, raw(collection()));
  const result = backup.apply(ids);
  assert.equal(result.status, 'applied'); assert.deepEqual(result.writtenIds, ids); assert.equal(result.rollback, null);
  for (const item of WORKSPACES) assert.equal(storage.values.get(item.key), records[item.id]);
  assert.equal(storage.values.get(TRIP), 'current trip raw'); assert.equal(storage.values.get(LEGACY), 'older raw'); assert.equal(storage.values.get('unrelated'), 'keep');
  assert.equal(backup.apply(ids).status, 'no-preview');
});

test('null backup entries never delete existing workspaces and unchanged selected raw never writes', () => {
  const records = savedRecords(), { storage, backup } = setup(records);
  const preview = backup.preview(raw(bundle({ collection: records.collection })));
  assert.equal(preview.entries.find(entry => entry.id === 'living').status, 'empty');
  assert.equal(backup.apply(['living']).status, 'invalid-selection');
  assert.equal(backup.apply(['collection']).status, 'unchanged');
  assert.deepEqual(storage.writes(), []); assert.equal(storage.values.get(key('living')), records.living);
});

test('invalid stored raw remains in the captured bundle while legal selected entries can recover independently', () => {
  const records = savedRecords(), { storage, backup } = setup({ living: '{broken original', collection: records.collection });
  const captured = backup.capture();
  assert.equal(captured.ok, true); assert.equal(captured.bundle.records.living, '{broken original');
  assert.equal(captured.entries.find(entry => entry.id === 'living').status, 'invalid');
  assert.equal(captured.entries.find(entry => entry.id === 'living').message, '原文保留但不能恢复：记录不是完整JSON，请使用对应工作台的有效备份');
  const incoming = bundle({ living: '{broken original', showroom: records.showroom });
  assert.equal(backup.preview(raw(incoming)).ok, true);
  assert.equal(backup.apply(['living']).status, 'invalid-selection');
  assert.equal(backup.apply(['showroom']).status, 'applied');
  assert.equal(storage.values.get(key('living')), '{broken original');
  assert.equal(storage.values.get(key('collection')), records.collection);
});

test('a validated incoming record can explicitly replace a damaged local record without changing unselected damage', () => {
  const records = savedRecords(), { storage, backup } = setup({ collection: 'damaged collection', living: 'damaged living' });
  assert.equal(backup.preview(raw(bundle({ collection: records.collection }))).ok, true);
  assert.equal(backup.apply(['collection']).status, 'applied');
  assert.equal(storage.values.get(key('collection')), records.collection); assert.equal(storage.values.get(key('living')), 'damaged living');
});

test('bad outer format, time, missing or extra records, non-raw types and excess bytes revoke the old preview before any write', () => {
  const records = savedRecords();
  const invalid = [
    '{', raw({ ...bundle(records), version: 2 }), raw({ ...bundle(records), format: 'custom' }),
    raw({ ...bundle(records), createdAt: '2026-10-06' }), raw({ ...bundle(records), key: 'attacker-key' }),
    raw({ ...bundle(records), records: { ...records, fitting: null } }),
    raw({ ...bundle(records), records: { ...records, collection: {} } }),
    raw({ ...bundle(records), records: Object.fromEntries(Object.entries(records).filter(([id]) => id !== 'living')) }),
    ' '.repeat(MAX_WORKSPACE_BYTES + 1),
  ];
  const { storage, backup } = setup();
  for (const text of invalid) {
    assert.equal(backup.preview(raw(bundle(records))).ok, true);
    const rejected = backup.preview(text);
    assert.equal(rejected.status, 'invalid-backup');
    if (text === '{') assert.equal(rejected.message, '未预览：文件不是完整JSON，请选择整套工作台导出的有效备份');
    assert.equal(backup.apply(['collection']).status, 'no-preview');
  }
  assert.deepEqual(storage.writes(), []);
});

test('strict scene checks reject substantive malformed parameters rather than flattening them into valid backups', () => {
  const records = savedRecords();
  const edits = {
    collection: value => { value.lastScene = 'fitting'; },
    living: value => { value.project.objects.chair.scale = 8; },
    showroom: value => { value.hood = 2; },
    imaging: value => { value.states.hand.image.width++; },
    landmark: value => { value.time = 24; },
    kitchen: value => { value.items[1].position = [...value.items[0].position]; },
    creative: value => { value.layers[0].strokes[0].source.id = 'https://external.example/image'; },
    skate: value => { value.trials[0].height += .1; },
    materials: value => { value.energies.copper++; },
    underwater: value => { value.diver.position = [...value.fish.position]; },
  };
  const { storage, backup } = setup();
  for (const [id, edit] of Object.entries(edits)) {
    const value = JSON.parse(records[id]); edit(value);
    const next = backup.preview(raw(bundle({ [id]: raw(value) })));
    assert.equal(next.ok, true); assert.equal(next.entries.find(entry => entry.id === id).status, 'invalid', id);
    assert.equal(backup.apply([id]).status, 'invalid-selection', id);
  }
  assert.deepEqual(storage.writes(), []);
});

test('living wrappers reject unknown fields, truncating dates and normalized parameters while accepting documented legacy defaults', () => {
  const records = savedRecords(), { backup } = setup();
  for (const edit of [
    value => { value.extra = true; }, value => { delete value.slots.b; },
    value => { value.slots.a.thumbnail = 'data:image/png;base64,AAAA'; },
    value => { value.project.environment.hour = 100; },
    value => { value.project.objects.chair.externalModel = 'injected.glb'; },
    value => { value.project.camera.hidden = true; },
    value => { value.project.camera.position[0] = 101; },
    value => { value.project.camera.target = [...value.project.camera.position]; },
    value => { value.project.guide.completed = ['save', 'save']; },
    value => { value.project.guide.completed = ['unknown']; },
    value => { value.project.guide.enabled = 1; },
    value => { value.slots.a.date = '原应用重开时会截断的日期'.repeat(4); },
  ]) {
    const value = JSON.parse(records.living); edit(value);
    assert.equal(backup.preview(raw(bundle({ living: raw(value) }))).entries.find(entry => entry.id === 'living').status, 'invalid');
  }
  const legacy = JSON.parse(records.living); legacy.project.version = 1; delete legacy.project.guide;
  for (const object of Object.values(legacy.project.objects)) { delete object.kind; delete object.stretch; delete object.hidden; }
  const preview = backup.preview(raw(bundle({ living: raw(legacy) })));
  assert.equal(preview.entries.find(entry => entry.id === 'living').status, 'saved');
  assert.equal(preview.bundle.records.living, raw(legacy));
});

test('a date that the original scene would truncate is still captured verbatim for rescue but cannot be restored', () => {
  const records = savedRecords(), value = JSON.parse(records.living);
  value.slots.a.date = '完整长日期不应该被备份截断'.repeat(4);
  const original = raw(value), { storage, backup } = setup({ living: original });
  const captured = backup.capture();
  assert.equal(captured.ok, true); assert.equal(captured.bundle.records.living, original);
  assert.equal(captured.entries.find(entry => entry.id === 'living').status, 'invalid');
  assert.match(captured.entries.find(entry => entry.id === 'living').message, /截断/);
  assert.deepEqual(storage.writes(), []);
});

test('imaging wrapper enforces both manifest identities and its narrower displayed appearance range', () => {
  const records = savedRecords(), { backup } = setup();
  for (const edit of [
    value => { delete value.states['chest-lateral']; }, value => { value.states.hand.appearance.brightness = -.9; },
    value => { value.states.hand.appearance.contrast = 5; }, value => { value.activeId = 'sample'; },
    value => { value.states.hand.imageId = 'chest-lateral'; }, value => { value.viewport.width = 0; },
  ]) {
    const value = JSON.parse(records.imaging); edit(value);
    assert.equal(backup.preview(raw(bundle({ imaging: raw(value) }))).entries.find(entry => entry.id === 'imaging').status, 'invalid');
  }
});

test('each scene raw byte cap applies before parsing and a large captured corrupt item remains downloadable within the outer cap', () => {
  const records = savedRecords(), { storage, backup } = setup();
  for (const item of WORKSPACES) {
    const over = records[item.id] + ' '.repeat(item.maxBytes - Buffer.byteLength(records[item.id]) + 1);
    const preview = backup.preview(raw(bundle({ [item.id]: over })));
    assert.equal(preview.ok, true, item.id); assert.equal(preview.entries.find(entry => entry.id === item.id).status, 'invalid', item.id);
  }
  storage.values.set(key('creative'), '{' + ' '.repeat(3 * 1024 * 1024));
  const captured = backup.capture();
  assert.equal(captured.ok, true); assert.equal(captured.bundle.records.creative, storage.values.get(key('creative')));
  assert.equal(captured.entries.find(entry => entry.id === 'creative').status, 'invalid');
  assert.deepEqual(storage.writes(), []);
  storage.values.set(key('living'), ' '.repeat(MAX_WORKSPACE_BYTES));
  assert.equal(backup.capture().status, 'invalid-backup');
});

test('a current snapshot exceeding the outer cap disables the recovery-before bundle but keeps the valid incoming preview and baseline', () => {
  const { storage, backup } = setup({ living: ' '.repeat(MAX_WORKSPACE_BYTES) });
  const preview = backup.preview(raw(bundle({ collection: raw(collection()) })));
  assert.equal(preview.ok, true); assert.equal(preview.currentBundle, null); assert.match(preview.currentBackupMessage, /分别备份/);
  assert.equal(backup.apply(['collection']).status, 'applied');
  assert.equal(storage.values.get(key('living')).length, MAX_WORKSPACE_BYTES);
});

test('legacy underwater is warned about but never bundled, silently migrated, deleted, or used to bypass an invalid v2 record', () => {
  const old = oldWater.serializeState(oldWater.initialState()), { storage, backup } = setup();
  storage.values.set(LEGACY, old);
  const captured = backup.capture(), entry = captured.entries.find(entry => entry.id === 'underwater');
  assert.equal(captured.bundle.records.underwater, null); assert.equal(entry.status, 'empty'); assert.equal(entry.legacy, true); assert.match(entry.message, /旧版/);
  assert.equal(backup.preview(raw(bundle({ underwater: old }))).entries.find(entry => entry.id === 'underwater').status, 'invalid');
  storage.values.set(key('underwater'), '{bad v2');
  const bad = backup.capture().entries.find(entry => entry.id === 'underwater');
  assert.equal(bad.status, 'invalid'); assert.equal(bad.legacy, false);
  assert.equal(storage.values.get(LEGACY), old); assert.deepEqual(storage.writes(), []);
});

test('missing storage, denied reads and non-string results fail closed and revoke any older preview', () => {
  const records = savedRecords();
  for (const storage of [null, undefined, {}, { getItem() { throw Error('denied'); } }, { getItem() { return undefined; } }]) {
    const backup = createWorkspaceBackup(storage);
    assert.equal(backup.capture().status, 'unavailable'); assert.equal(backup.preview(raw(bundle(records))).status, 'unavailable');
    assert.equal(backup.apply(['collection']).status, 'no-preview');
  }
  const { storage, backup } = setup(); backup.preview(raw(bundle(records)));
  storage.onGet = key => { if (key === TRIP) throw Error('trip unreadable'); };
  assert.equal(backup.preview(raw(bundle(records))).status, 'unavailable'); assert.equal(backup.apply(['collection']).status, 'no-preview');
  assert.deepEqual(storage.writes(), []);
});

test('capture and preview detect a record changing during their reads without manufacturing a mixed backup or enabling recovery', () => {
  for (const operation of ['capture', 'preview']) {
    const { storage, backup } = setup({ collection: raw(collection()) });
    let changed = false;
    storage.onGet = currentKey => { if (!changed && currentKey === key('living')) { changed = true; storage.values.set(key('collection'), 'newer record'); } };
    const result = operation === 'capture' ? backup.capture() : backup.preview(raw(bundle(savedRecords())));
    assert.equal(result.status, 'conflict'); assert.equal(backup.apply(['collection']).status, 'no-preview');
    assert.equal(storage.values.get(key('collection')), 'newer record'); assert.deepEqual(storage.writes(), []);
  }
});

test('any of the ten workspaces, trip or legacy changing since preview blocks every write, including formatting-only changes', () => {
  const records = savedRecords();
  for (const guard of [...WORKSPACES.map(item => item.key), TRIP, LEGACY]) {
    const { storage, backup } = setup(records);
    backup.preview(raw(bundle({ collection: raw(collection()) })));
    const present = storage.values.get(guard);
    storage.values.set(guard, present ? present + '\n' : 'new raw');
    assert.equal(backup.apply(['collection']).status, 'conflict', guard);
    assert.deepEqual(storage.writes(), [], guard);
  }
});

test('a mid-restore change to an unselected workspace aborts and rolls back owned earlier writes while preserving the external change', () => {
  const records = savedRecords(), original = raw(collection()), { storage, backup } = setup({ collection: original });
  backup.preview(raw(bundle(records)));
  storage.afterSet = currentKey => { if (currentKey === key('collection')) storage.values.set(key('skate'), 'other window latest'); };
  const result = backup.apply(['collection', 'living']);
  assert.equal(result.status, 'conflict'); assert.equal(result.rollback, 'restored');
  assert.equal(storage.values.get(key('collection')), original); assert.equal(storage.values.get(key('living')), undefined);
  assert.equal(storage.values.get(key('skate')), 'other window latest');
  assert.equal(backup.apply(['collection']).status, 'no-preview');
});

test('quota failure on a later item restores the exact old raw and removes only a newly created owned key', () => {
  const records = savedRecords();
  for (const original of [null, JSON.stringify(collection(), null, 4)]) {
    const { storage, backup } = setup(original === null ? {} : { collection: original });
    backup.preview(raw(bundle(records)));
    storage.beforeSet = currentKey => { if (currentKey === key('living')) throw Error('QuotaExceededError'); };
    const result = backup.apply(['collection', 'living']);
    assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored');
    assert.equal(storage.values.get(key('collection')) ?? null, original); assert.equal(storage.values.has(key('living')), false);
    assert.deepEqual(result.writtenIds, ['collection']);
  }
});

test('a setItem that writes and then throws is still rolled back from its owned new raw', () => {
  const records = savedRecords(), original = raw(collection()), { storage, backup } = setup({ collection: original });
  backup.preview(raw(bundle(records)));
  storage.afterSet = (currentKey, value) => { if (currentKey === key('collection') && value === records.collection) throw Error('write failed after mutation'); };
  const result = backup.apply(['collection']);
  assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored'); assert.equal(storage.values.get(key('collection')), original);
});

test('rollback never overwrites a newer other-window value after a partial restore fails', () => {
  const records = savedRecords(), { storage, backup } = setup({ collection: raw(collection()) });
  backup.preview(raw(bundle(records)));
  storage.beforeSet = currentKey => { if (currentKey === key('living')) { storage.values.set(key('collection'), 'external latest'); throw Error('quota'); } };
  const result = backup.apply(['collection', 'living']);
  assert.equal(result.status, 'conflict'); assert.equal(result.rollback, 'newer-preserved');
  assert.equal(storage.values.get(key('collection')), 'external latest'); assert.equal(storage.values.has(key('living')), false);
});

test('failed rollback reports its uncertain partial result and requires a fresh preview before another attempt', () => {
  const records = savedRecords(), original = raw(collection()), { storage, backup } = setup({ collection: original });
  backup.preview(raw(bundle(records)));
  storage.beforeSet = (currentKey, value) => { if (currentKey === key('living') || currentKey === key('collection') && value === original) throw Error('quota'); };
  const result = backup.apply(['collection', 'living']);
  assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'failed'); assert.match(result.message, /无法确认/);
  assert.equal(storage.values.get(key('collection')), records.collection); assert.equal(backup.apply(['collection']).status, 'no-preview');
  storage.beforeSet = null;
  assert.equal(backup.preview(raw(bundle({ collection: original }))).ok, true); assert.equal(backup.apply(['collection']).status, 'applied');
  assert.equal(storage.values.get(key('collection')), original);
});

test('a verification read exception rolls back owned writes and never continues writing the next item', () => {
  const records = savedRecords(), original = raw(collection()), { storage, backup } = setup({ collection: original });
  backup.preview(raw(bundle(records)));
  let failed = false;
  storage.afterSet = (currentKey, value) => { if (currentKey === key('collection') && value === records.collection) storage.onGet = nextKey => { if (!failed && nextKey === TRIP) { failed = true; throw Error('read denied'); } }; };
  const result = backup.apply(['collection', 'living']);
  assert.equal(result.status, 'unavailable'); assert.equal(result.rollback, 'restored');
  assert.equal(storage.values.get(key('collection')), original); assert.equal(storage.values.has(key('living')), false);
});

test('UI result mutation, illegal IDs, duplicate/sparse/accessor selections cannot enable damaged or unregistered records', () => {
  const records = savedRecords(), { storage, backup } = setup();
  const preview = backup.preview(raw(bundle({ collection: records.collection, living: '{bad' })));
  preview.entries.find(entry => entry.id === 'living').status = 'saved';
  assert.throws(() => { preview.bundle.records.living = records.living; }, TypeError);
  let getterCalled = false;
  const accessor = []; Object.defineProperty(accessor, 0, { enumerable: true, get() { getterCalled = true; return 'collection'; } });
  for (const selected of [['living'], ['fitting'], ['collection', 'collection'], [, 'collection'], accessor, new Array(100_000_000), {}]) assert.equal(backup.apply(selected).status, 'invalid-selection');
  assert.equal(getterCalled, false); assert.deepEqual(storage.writes(), []);
  assert.equal(backup.apply(['collection']).status, 'applied'); assert.equal(storage.values.has(key('living')), false);
});

test('a newest failed preview or a new capture replaces eligibility from every older successful preview', () => {
  const records = savedRecords(), { storage, backup } = setup();
  assert.equal(backup.preview(raw(bundle(records))).ok, true);
  assert.equal(backup.preview(raw(bundle({ collection: records.collection }))).ok, true);
  assert.equal(backup.apply(['living']).status, 'invalid-selection');
  assert.equal(backup.capture().ok, true); assert.equal(backup.apply(['collection']).status, 'no-preview');
  assert.deepEqual(storage.writes(), []);
});
