import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlan, createDemoPlan, validatePlan, applyPlanOperations, summarizePlan, buildGenerationBrief,
} from '../web/creation-core.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const point = (x = 0.5, y = 0.5) => ({ x, y });
const marker = (id = 'custom-cabin', kind = 'cabin') => ({
  id, kind, points: [point()], height: 7, locked: false,
});
const land = (id = 'custom-land') => ({
  id, kind: 'land', points: [point(0.1, 0.1), point(0.7, 0.1), point(0.3, 0.8)], height: 3, locked: false,
});
const png = {
  name: 'reference.png', width: 1, height: 1,
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAt0AAAAASUVORK5CYII=',
};
const withEntities = (...entities) => ({ ...createPlan(), entities });
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function polygon(count) {
  return Array.from({ length: count }, (_, i) => point(
    0.5 + Math.cos(i * Math.PI * 2 / count) * 0.2,
    0.5 + Math.sin(i * Math.PI * 2 / count) * 0.2,
  ));
}

test('new plans are empty, valid and independent for both input entries', () => {
  for (const entry of ['layout', 'image']) {
    const plan = createPlan(entry);
    assert.equal(plan.version, 1);
    assert.equal(plan.entry, entry);
    assert.equal(plan.intent, '');
    assert.equal(plan.reference, null);
    assert.deepEqual(plan.entities, []);
    assert.deepEqual(plan.world, { width: 200, depth: 150 });
    assert.deepEqual(validatePlan(plan), plan);
    assert.notStrictEqual(validatePlan(plan), plan);
  }
  const one = createPlan(), two = createPlan();
  one.style.landColor = '#ffffff';
  one.world.width = 350;
  one.entities.push(marker());
  assert.equal(two.style.landColor, '#6c956b');
  assert.equal(two.world.width, 200);
  assert.equal(two.entities.length, 0);
  assert.throws(() => createPlan('generated-world'), /入口/);
});

test('the demo is explicit, roundtrip-safe and contains two islands connected by a road', () => {
  const plan = createDemoPlan('image');
  assert.equal(plan.entry, 'image');
  assert.equal(plan.reference, null);
  assert.equal(plan.entities.length, 9);
  const summary = summarizePlan(plan);
  assert.equal(summary.counts.land, 2);
  assert.equal(summary.counts.road, 1);
  assert.equal(summary.counts.cabin, 2);
  assert.equal(summary.counts.lighthouse, 1);
  assert.equal(summary.counts.palm, 2);
  assert.equal(summary.counts.boat, 1);
  assert.deepEqual(validatePlan(clone(plan)), plan);
  const later = createDemoPlan();
  later.entities[0].points[0].x = 0.9;
  assert.equal(plan.entities[0].points[0].x, 0.12);
  assert.equal(plan.entities.find((entity) => entity.kind === 'road').height, 0.2);
  assert.equal(plan.entities.find((entity) => entity.kind === 'cabin').height, 7);
  assert.equal(plan.entities.find((entity) => entity.kind === 'palm').height, 12);
});

test('validation and operations deeply copy entities, points, style and reference', () => {
  const source = freeze({ ...withEntities(land(), marker()), reference: { ...png } });
  const copy = validatePlan(source);
  assert.notStrictEqual(copy.entities, source.entities);
  assert.notStrictEqual(copy.entities[0], source.entities[0]);
  assert.notStrictEqual(copy.entities[0].points[0], source.entities[0].points[0]);
  assert.notStrictEqual(copy.style, source.style);
  assert.notStrictEqual(copy.reference, source.reference);
  copy.entities[0].points[0].x = 0.2;
  assert.equal(source.entities[0].points[0].x, 0.1);
  const operation = { type: 'update', id: 'custom-cabin', values: { points: [point(0.8, 0.2)] } };
  const next = applyPlanOperations(source, [operation]);
  operation.values.points[0].x = 0.01;
  assert.equal(next.entities[1].points[0].x, 0.8);
  assert.equal(source.entities[1].points[0].x, 0.5);
});

test('add operations assign kind-specific height and unlocked defaults without changing the input', () => {
  const plan = createPlan();
  const kinds = ['land', 'water', 'road', 'cabin', 'lighthouse', 'palm', 'boat'];
  const heights = [3, 0, 0.2, 7, 18, 12, 2];
  const operations = kinds.map((kind, index) => ({
    type: 'add', entity: {
      id: 'entity-' + index, kind,
      points: kind === 'land' || kind === 'water' ? land().points : kind === 'road' ? [point(0.1, 0.1), point(0.9, 0.9)] : [point()],
    },
  }));
  const next = applyPlanOperations(plan, operations);
  assert.deepEqual(next.entities.map((entity) => entity.height), heights);
  assert.ok(next.entities.every((entity) => entity.locked === false));
  assert.equal(plan.entities.length, 0);
  assert.equal(Object.hasOwn(operations[0].entity, 'height'), false);
});

test('valid transactions can rename, update style, entry, intent, reference, points and remove', () => {
  const plan = withEntities(marker('house-a'), marker('house-b'));
  const next = applyPlanOperations(plan, [
    { type: 'rename', name: '我画的海湾' },
    { type: 'style', values: { lighting: 'sunset', waterColor: '#155e75', landColor: '#aabbcc' } },
    { type: 'entry', entry: 'image' },
    { type: 'intent', intent: '保留木屋外观\n布局按绘笔方案。' },
    { type: 'reference', reference: png },
    { type: 'update', id: 'house-a', values: { height: 11, points: [point(0.75, 0.25)] } },
    { type: 'remove', id: 'house-b' },
  ]);
  assert.equal(next.name, '我画的海湾');
  assert.equal(next.entry, 'image');
  assert.equal(next.style.lighting, 'sunset');
  assert.equal(next.entities.length, 1);
  assert.equal(next.entities[0].height, 11);
  assert.deepEqual(next.entities[0].points, [point(0.75, 0.25)]);
  assert.deepEqual(next.reference, png);
  assert.match(next.intent, /木屋外观/);
  assert.deepEqual(validatePlan(clone(next)), next);
  assert.equal(plan.name, '我的布局');
  assert.equal(plan.reference, null);
  assert.equal(plan.intent, '');
  assert.equal(applyPlanOperations(next, [{ type: 'reference', reference: null }]).reference, null);
});

test('a late invalid operation rejects the entire transaction without mutating either source or earlier operations', () => {
  const plan = withEntities(marker()), before = clone(plan);
  const operations = [
    { type: 'rename', name: '不该留下的修改' },
    { type: 'style', values: { lighting: 'sunset' } },
    { type: 'update', id: 'custom-cabin', values: { height: 9 } },
    { type: 'update', id: 'custom-cabin', values: { points: [point(1.2, 0.5)] } },
  ];
  const operationsBefore = clone(operations);
  assert.throws(() => applyPlanOperations(plan, operations), /0 到 1/);
  assert.deepEqual(plan, before);
  assert.deepEqual(operations, operationsBefore);
});

test('locks block movement, height changes and removal, including mixed unlock updates', () => {
  const plan = applyPlanOperations(withEntities(marker()), [{ type: 'update', id: 'custom-cabin', values: { locked: true } }]);
  const snapshot = clone(plan);
  for (const operation of [
    { type: 'update', id: 'custom-cabin', values: { height: 12 } },
    { type: 'update', id: 'custom-cabin', values: { points: [point(0.7, 0.7)] } },
    { type: 'remove', id: 'custom-cabin' },
    { type: 'update', id: 'custom-cabin', values: { locked: false, height: 12 } },
  ]) {
    assert.throws(() => applyPlanOperations(plan, [
      { type: 'style', values: { lighting: 'sunset' } }, operation,
    ]), /锁定|单独/);
    assert.deepEqual(plan, snapshot);
  }
  const next = applyPlanOperations(plan, [
    { type: 'update', id: 'custom-cabin', values: { locked: false } },
    { type: 'update', id: 'custom-cabin', values: { height: 12 } },
    { type: 'update', id: 'custom-cabin', values: { locked: true } },
  ]);
  assert.equal(next.entities[0].height, 12);
  assert.equal(next.entities[0].locked, true);
  assert.deepEqual(plan, snapshot);
  const removed = applyPlanOperations(plan, [
    { type: 'update', id: 'custom-cabin', values: { locked: false } },
    { type: 'remove', id: 'custom-cabin' },
  ]);
  assert.deepEqual(removed.entities, []);
});

test('unknown and missing schema fields are rejected at every nested boundary', () => {
  const mutations = [
    (plan) => { plan.rain = true; },
    (plan) => { delete plan.intent; },
    (plan) => { plan.world.seed = 42; },
    (plan) => { plan.style.cloudCover = 0.3; },
    (plan) => { plan.entities[0].asset = 'house.glb'; },
    (plan) => { delete plan.entities[0].locked; },
    (plan) => { plan.entities[0].points[0].z = 0.5; },
    (plan) => { plan.reference = { ...png, annotation: [] }; },
    (plan) => { plan.version = 2; },
    (plan) => { plan.entry = 'anything'; },
  ];
  for (const mutate of mutations) {
    const plan = withEntities(marker());
    mutate(plan);
    assert.throws(() => validatePlan(plan));
  }
  assert.throws(() => validatePlan({ ...createPlan(), __proto__: { surprise: true } }), /普通对象/);
  assert.throws(() => validatePlan(JSON.parse(JSON.stringify(createPlan()).slice(0, -1) + ',"__proto__":{}}')), /未知字段/);
  const hidden = createPlan();
  Object.defineProperty(hidden, 'name', { value: 'hidden', enumerable: false });
  assert.throws(() => validatePlan(hidden), /可序列化/);
});

test('nonfinite values, coercible strings, invalid booleans, styles and world sizes are rejected', () => {
  const mutations = [
    (plan) => { plan.world.width = NaN; },
    (plan) => { plan.world.depth = Infinity; },
    (plan) => { plan.world.width = 9; },
    (plan) => { plan.world.depth = 2001; },
    (plan) => { plan.world.width = '200'; },
    (plan) => { plan.entities[0].height = -1; },
    (plan) => { plan.entities[0].height = 101; },
    (plan) => { plan.entities[0].height = NaN; },
    (plan) => { plan.entities[0].points[0].x = Infinity; },
    (plan) => { plan.entities[0].points[0].x = '0.5'; },
    (plan) => { plan.entities[0].points[0].y = -0.001; },
    (plan) => { plan.entities[0].locked = 1; },
    (plan) => { plan.style.lighting = 'night'; },
    (plan) => { plan.style.waterColor = 'url(https://example.com)'; },
    (plan) => { plan.style.landColor = '#fff'; },
  ];
  for (const mutate of mutations) {
    const plan = withEntities(marker());
    mutate(plan);
    assert.throws(() => validatePlan(plan));
  }
  const boundaries = withEntities({ ...marker(), height: 100, points: [point(0, 1)] });
  boundaries.world = { width: 10, depth: 2000 };
  assert.deepEqual(validatePlan(boundaries), boundaries);
});

test('text limits and ID identity reject blank/control text, oversized strings and duplicates', () => {
  const invalid = [
    (plan) => { plan.name = ' '; },
    (plan) => { plan.name = 'x'.repeat(81); },
    (plan) => { plan.name = 'line\nbreak'; },
    (plan) => { plan.intent = 'x'.repeat(2001); },
    (plan) => { plan.intent = null; },
    (plan) => { plan.intent = '\u0000'; },
    (plan) => { plan.entities[0].id = 'x'.repeat(65); },
    (plan) => { plan.entities[0].id = 'has spaces'; },
    (plan) => { plan.entities[0].id = '__proto__'; },
    (plan) => { plan.entities.push(clone(plan.entities[0])); },
    (plan) => { plan.reference = { ...png, name: 'x'.repeat(161) }; },
  ];
  for (const mutate of invalid) {
    const plan = withEntities(marker());
    mutate(plan);
    assert.throws(() => validatePlan(plan));
  }
  const accepted = withEntities({ ...marker(), id: 'x'.repeat(64) });
  accepted.name = 'x'.repeat(80);
  accepted.intent = 'x'.repeat(2000);
  assert.deepEqual(validatePlan(accepted), accepted);
});

test('entity topology distinguishes regions, roads and one-point markers', () => {
  for (const entity of [
    { ...land(), points: [point(0.1, 0.1), point(0.8, 0.8)] },
    { ...land(), kind: 'water', points: [point(0.1, 0.1), point(0.4, 0.4), point(0.8, 0.8)] },
    { ...land(), kind: 'road', points: [point()] },
    { ...land(), kind: 'road', points: [point(), point()] },
    { ...marker(), points: [] },
    { ...marker(), points: [point(), point(0.7, 0.7)] },
    { ...marker(), kind: 'tree' },
  ]) assert.throws(() => validatePlan(withEntities(entity)));
  const concave = { ...land(), points: [point(0.1, 0.1), point(0.9, 0.1), point(0.5, 0.4), point(0.9, 0.9), point(0.1, 0.9)] };
  assert.deepEqual(validatePlan(withEntities(concave)).entities[0], concave);
});

test('entity, per-entity points, total points and operation budgets fail atomically', () => {
  const maximum = withEntities(...Array.from({ length: 120 }, (_, i) => marker('marker-' + i)));
  assert.equal(validatePlan(maximum).entities.length, 120);
  assert.throws(() => validatePlan({ ...maximum, entities: [...maximum.entities, marker('too-many')] }), /120/);
  assert.throws(() => applyPlanOperations(maximum, [{ type: 'rename', name: 'discarded' }, { type: 'add', entity: marker('too-many') }]), /120/);
  assert.equal(maximum.name, '我的布局');
  assert.throws(() => validatePlan(withEntities({ ...land(), points: polygon(257) })), /256/);
  const atPointLimit = withEntities(...Array.from({ length: 16 }, (_, i) => ({ ...land('land-' + i), points: polygon(256) })));
  assert.equal(validatePlan(atPointLimit).entities.length, 16);
  const before = clone(atPointLimit);
  assert.throws(() => applyPlanOperations(atPointLimit, [{ type: 'add', entity: land('extra-land') }]), /4096/);
  assert.deepEqual(atPointLimit, before);
  assert.throws(() => applyPlanOperations(createPlan(), []), /操作/);
  assert.throws(() => applyPlanOperations(createPlan(), Array.from({ length: 241 }, () => ({ type: 'rename', name: 'same' }))), /240/);
});

test('reference images accept only matching PNG, JPEG and WebP container signatures', () => {
  const fixtures = [
    png,
    { name: 'header.jpg', width: 10, height: 10, dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 217]).toString('base64') },
    { name: 'header.webp', width: 10, height: 10, dataUrl: 'data:image/webp;base64,' + Buffer.from('RIFF0000WEBPVP8 ', 'ascii').toString('base64') },
  ];
  // JPEG/WebP fixtures exercise the schema/container guard; the browser must still decode real pixels.
  for (const reference of fixtures) {
    assert.deepEqual(validatePlan({ ...createPlan('image'), reference }).reference, reference);
  }
  for (const reference of [
    { ...png, dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') },
    { ...png, dataUrl: 'data:image/png;base64,' + Buffer.from('<svg/>').toString('base64') },
    { ...png, dataUrl: png.dataUrl.replace('image/png', 'image/jpeg') },
    { ...png, dataUrl: 'https://example.com/image.png' },
    { ...png, dataUrl: 'data:image/png;base64,***=' },
    { ...png, dataUrl: 'data:image/png;base64,AAA' },
    { ...png, dataUrl: 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024) },
    { ...png, width: 0 },
    { ...png, height: 8193 },
    { ...png, width: 1.5 },
    { ...png, height: '1' },
  ]) assert.throws(() => validatePlan({ ...createPlan('image'), reference }));
});

test('malformed operations cannot change protected fields, inject unknown keys or duplicate IDs', () => {
  const plan = withEntities(marker()), before = clone(plan);
  for (const operation of [
    { type: 'add', entity: marker() },
    { type: 'add', entity: { ...marker('new'), arbitrary: true } },
    { type: 'update', id: 'custom-cabin', values: { kind: 'boat' } },
    { type: 'update', id: 'custom-cabin', values: {} },
    { type: 'update', id: 'custom-cabin', values: { locked: true, height: 10 } },
    { type: 'update', id: 'absent', values: { height: 10 } },
    { type: 'remove', id: 'absent' },
    { type: 'style', values: {} },
    { type: 'style', values: { lighting: 'day', rain: 1 } },
    { type: 'rename', name: 'new', model: 'Opus' },
    { type: 'reference', reference: { ...png, serverUrl: 'https://example.com' } },
    { type: 'intent', intent: 'x'.repeat(2001) },
    { type: 'entry', entry: 'game' },
    { type: 'world', world: { width: 600, depth: 500 } },
  ]) {
    assert.throws(() => applyPlanOperations(plan, [{ type: 'rename', name: 'temporary' }, operation]));
    assert.deepEqual(plan, before);
  }
});

test('custom layout summaries and briefs derive from authored content, not an implicit demo', () => {
  const plan = {
    ...withEntities(
      land('user-island'),
      { ...marker('user-tower', 'lighthouse'), height: 18, locked: true, points: [point(0.8, 0.2)] },
    ),
    name: '我的自定义布局', intent: '保留参考图的木材色彩。', entry: 'image', reference: png,
    style: { lighting: 'sunset', waterColor: '#112233', landColor: '#445566' },
  };
  const summary = summarizePlan(plan);
  assert.equal(summary.entityCount, 2);
  assert.equal(summary.counts.land, 1);
  assert.equal(summary.counts.lighthouse, 1);
  assert.equal(summary.counts.cabin, 0);
  assert.deepEqual(summary.world, { width: 200, depth: 150 });
  assert.ok(summary.limitations.some((limitation) => /碰撞、导航/.test(limitation)));
  summary.world.width = 300;
  assert.equal(plan.world.width, 200);
  const brief = buildGenerationBrief(plan);
  assert.match(brief, /user-island/);
  assert.match(brief, /user-tower/);
  assert.match(brief, /右侧、上方/);
  assert.match(brief, /60, -45/);
  assert.match(brief, /已锁定/);
  assert.match(brief, /日落光照/);
  assert.match(brief, /#112233/);
  assert.match(brief, /保留参考图的木材色彩/);
  assert.match(brief, /reference\.png/);
  assert.match(brief, /另行附图/);
  assert.match(brief, /不代表处于陆地内或可达/);
  assert.match(brief, /未调用 Opus/);
  assert.doesNotMatch(brief, /island-west|cabin-west|data:image/);
  assert.deepEqual(validatePlan(clone(plan)), plan);
});

test('empty layout briefs explicitly describe absence of layout and image analysis', () => {
  const plan = createPlan('image'), before = clone(plan);
  const brief = buildGenerationBrief(plan);
  assert.match(brief, /布局对象：0 个/);
  assert.match(brief, /当前布局为空/);
  assert.match(brief, /不要声称已分析参考图片/);
  assert.match(brief, /绘笔不只是图片叠层/);
  assert.match(brief, /未实现碰撞、导航、任务或钓鱼玩法/);
  assert.deepEqual(plan, before);
});

test('freehand outlines retain concavity and remove only adjacent repeats or closing-point duplicates', () => {
  const original = withEntities({
    ...land('outline'),
    points: [point(0.1, 0.1), point(0.9, 0.1), point(0.9, 0.1), point(0.5, 0.4), point(0.9, 0.9), point(0.1, 0.9), point(0.1, 0.1)],
  });
  const before = clone(original);
  const normalized = validatePlan(original);
  assert.equal(normalized.entities[0].points.length, 5);
  assert.deepEqual(normalized.entities[0].points[2], point(0.5, 0.4));
  assert.deepEqual(original, before);
  const reversed = { ...normalized, entities: [{ ...normalized.entities[0], points: [...normalized.entities[0].points].reverse() }] };
  assert.equal(validatePlan(reversed).entities[0].points.length, 5);
  const road = applyPlanOperations(createPlan(), [{
    type: 'add', entity: { id: 'road', kind: 'road', points: [point(0.1, 0.2), point(0.1, 0.2), point(0.8, 0.7)] },
  }]);
  assert.equal(road.entities[0].points.length, 2);
});

test('self-intersecting, touching, too-small and repeated-vertex polygons reject the whole edit', () => {
  const badOutlines = [
    // Nonzero shoelace area, but two non-adjacent edges cross.
    [point(0.1, 0.1), point(0.9, 0.8), point(0.1, 0.9), point(0.7, 0.1)],
    // Non-adjacent vertex touches an earlier edge.
    [point(0.1, 0.1), point(0.9, 0.1), point(0.9, 0.9), point(0.5, 0.1), point(0.1, 0.9)],
    [point(0.1, 0.1), point(0.9, 0.1), point(0.9, 0.9), point(0.1, 0.1), point(0.1, 0.9)],
    [point(0.1, 0.1), point(0.9, 0.1), point(0.1, 0.100001)],
    [point(0.1, 0.1), point(0.8, 0.8), point(0.1, 0.1), point(0.8, 0.8)],
  ];
  const plan = withEntities(land('retained')), before = clone(plan);
  for (const points of badOutlines) {
    assert.throws(() => applyPlanOperations(plan, [
      { type: 'rename', name: 'must-not-apply' },
      { type: 'style', values: { lighting: 'sunset' } },
      { type: 'add', entity: { id: 'bad-region', kind: 'land', points } },
    ]), /重画/);
    assert.deepEqual(plan, before);
    assert.throws(() => validatePlan(withEntities({ ...land('bad-water'), kind: 'water', points })), /重画/);
  }
});

test('a completely coincident road fails after preceding edits without leaving a partial result', () => {
  const plan = withEntities(land()), before = clone(plan);
  assert.throws(() => applyPlanOperations(plan, [
    { type: 'intent', intent: 'this must not stay' },
    { type: 'add', entity: { id: 'bad-road', kind: 'road', points: [point(0.5, 0.5), point(0.5, 0.5), point(0.5, 0.5)] } },
  ]), /非零长度/);
  assert.deepEqual(plan, before);
});

