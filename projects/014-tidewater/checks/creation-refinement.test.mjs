import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, createDemoPlan, validatePlan, applyPlanOperations, buildGenerationBrief } from '../web/creation-core.js';
import { makeRefinement, generateLandDetails, createLandDetailSafety, DETAIL_FOOTPRINTS, DETAIL_LIMITS } from '../web/creation-refinement.js';

const clone = value => JSON.parse(JSON.stringify(value));
const p = (x, y) => ({ x, y });
const rectangle = (id = 'land-main', x1 = .05, y1 = .05, x2 = .95, y2 = .95, kind = 'land', height = 3) => ({
  id, kind, points: [p(x1, y1), p(x2, y1), p(x2, y2), p(x1, y2)], height, locked: false,
});
function planOf(...entities) { return validatePlan({ ...createPlan(), entities }); }
function refined(entity = rectangle(), preset = 'tropical', density = 2, seed = 1) {
  return { ...entity, refinement: makeRefinement(preset, density, seed) };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function contains(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function segmentDistance(point, a, b, world) {
  const dx = (b.x - a.x) * world.width, dy = (b.y - a.y) * world.depth;
  const px = (point.x - a.x) * world.width, py = (point.y - a.y) * world.depth;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * t, py - dy * t);
}
function assertSafeFootprints(plan, land, details) {
  for (const item of details.decorations) {
    const radius = DETAIL_FOOTPRINTS[item.type] * item.scale;
    for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI * 2 / 64;
      const point = p(item.point.x + Math.cos(angle) * radius / plan.world.width,
        item.point.y + Math.sin(angle) * radius / plan.world.depth);
      assert.ok(contains(point, land.points), 'the entire circular footprint stays in the authored outline');
      for (const other of plan.entities) {
        if (other.kind === 'water' || (other.kind === 'land' && other.height > land.height)) {
          assert.equal(contains(point, other.points), false, `footprint avoids ${other.id}`);
        }
      }
    }
    for (const other of plan.entities.filter(entity => entity.kind === 'road')) {
      for (let i = 1; i < other.points.length; i++) {
        assert.ok(segmentDistance(item.point, other.points[i - 1], other.points[i], plan.world) > radius + 1.6 + .8,
          'footprint avoids the rendered road half width and margin');
      }
    }
  }
  for (let i = 0; i < details.decorations.length; i++) {
    for (let j = i + 1; j < details.decorations.length; j++) {
      const a = details.decorations[i], b = details.decorations[j];
      const distance = Math.hypot((a.point.x - b.point.x) * plan.world.width, (a.point.y - b.point.y) * plan.world.depth);
      assert.ok(distance >= DETAIL_FOOTPRINTS[a.type] * a.scale + DETAIL_FOOTPRINTS[b.type] * b.scale,
        'derived footprints do not overlap each other');
    }
  }
}

test('old JSON and explicit demo stay exactly compatible without new optional fields', () => {
  for (const old of [createPlan(), createDemoPlan(), planOf(rectangle())]) {
    assert.deepEqual(validatePlan(clone(old)), old);
    assert.ok(old.entities.every(entity => !Object.hasOwn(entity, 'refinement')));
  }
  const plan = planOf(rectangle());
  const details = generateLandDetails(plan, plan.entities[0]);
  assert.deepEqual(details.decorations, []);
  assert.equal(details.beach.enabled, false);
  assert.equal(details.groundColor, plan.style.landColor);
});

test('all three complete recipes have stable defaults and independent objects', () => {
  for (const preset of ['tropical', 'rocky', 'garden']) {
    const recipe = makeRefinement(preset);
    assert.equal(recipe.preset, preset);
    assert.equal(recipe.seed, 1);
    assert.equal(recipe.density, 2);
    assert.equal(recipe.beach, preset === 'tropical');
    assert.deepEqual(validatePlan(planOf(refined(rectangle(), preset))).entities[0].refinement, recipe);
    const second = makeRefinement(preset);
    recipe.seed = 7;
    assert.equal(second.seed, 1);
  }
  assert.equal(makeRefinement('rocky', 3, 0xffffffff).seed, 0xffffffff);
});

test('recipe schema rejects missing, unknown, hidden, nonfinite and wrong typed values', () => {
  for (const key of ['preset', 'seed', 'density', 'beach', 'rocks', 'vegetation']) {
    const entity = refined(); delete entity.refinement[key];
    assert.throws(() => planOf(entity), /缺少/);
  }
  const bad = [null, { ...makeRefinement('tropical'), other: 1 }, { ...makeRefinement('tropical'), preset: 'magic' },
    ...[-1, .5, 0x100000000, NaN, Infinity, '1'].map(seed => ({ ...makeRefinement('tropical'), seed })),
    ...[0, 4, 1.5, '2'].map(density => ({ ...makeRefinement('tropical'), density })),
    ...['beach', 'rocks', 'vegetation'].map(key => ({ ...makeRefinement('tropical'), [key]: 1 }))];
  for (const refinement of bad) assert.throws(() => planOf({ ...rectangle(), refinement }));
  const recipe = makeRefinement('rocky');
  Object.defineProperty(recipe, 'hidden', { value: true, enumerable: false });
  assert.throws(() => planOf({ ...rectangle(), refinement: recipe }), /未知|序列化/);
});

test('only land accepts refinement; stored null is invalid and update null removes the optional key', () => {
  const road = { id: 'road', kind: 'road', points: [p(.1, .1), p(.8, .8)], height: .2, locked: false };
  for (const entity of [rectangle('water', .1, .1, .8, .8, 'water', 0), road,
    { id: 'cabin', kind: 'cabin', points: [p(.2, .2)], height: 7, locked: false }]) {
    assert.throws(() => planOf({ ...entity, refinement: makeRefinement('rocky') }), /只有陆地/);
    assert.throws(() => applyPlanOperations(planOf(entity), [{ type: 'update', id: entity.id, values: { refinement: null } }]), /只有陆地/);
  }
  const plan = planOf(refined());
  const next = applyPlanOperations(plan, [{ type: 'update', id: 'land-main', values: { refinement: null } }]);
  assert.equal(Object.hasOwn(next.entities[0], 'refinement'), false);
  assert.ok(Object.hasOwn(plan.entities[0], 'refinement'));
  assert.throws(() => planOf({ ...rectangle(), refinement: null }));
});

test('locked land rejects every recipe update, no-op and removal and transaction stays atomic', () => {
  const plan = freeze(planOf({ ...refined(), locked: true }, rectangle('other', .05, .05, .1, .1)));
  const before = JSON.stringify(plan);
  for (const refinement of [makeRefinement('tropical'), makeRefinement('rocky'), null]) {
    assert.throws(() => applyPlanOperations(plan, [
      { type: 'update', id: 'other', values: { height: 10 } },
      { type: 'update', id: 'land-main', values: { refinement } },
    ]), /锁定/);
    assert.equal(JSON.stringify(plan), before);
  }
  assert.throws(() => applyPlanOperations(plan, [{ type: 'update', id: 'land-main', values: { locked: false, refinement: null } }]), /单独/);
  const unlocked = applyPlanOperations(plan, [
    { type: 'update', id: 'land-main', values: { locked: false } },
    { type: 'update', id: 'land-main', values: { refinement: makeRefinement('rocky') } },
  ]);
  assert.equal(unlocked.entities[0].refinement.preset, 'rocky');
  assert.equal(plan.entities[0].locked, true);
});

test('invalid recipe after a valid mutation rolls the complete transaction back', () => {
  const plan = planOf(rectangle());
  const before = clone(plan);
  assert.throws(() => applyPlanOperations(plan, [
    { type: 'update', id: 'land-main', values: { height: 9 } },
    { type: 'update', id: 'land-main', values: { refinement: { ...makeRefinement('garden'), seed: -1 } } },
  ]));
  assert.deepEqual(plan, before);
});

test('seeded generation is deterministic, JSON-safe, copies input and keeps world and authored shape', () => {
  const plan = freeze(planOf(refined())), before = JSON.stringify(plan);
  const first = generateLandDetails(plan, plan.entities[0]);
  assert.ok(first.decorations.length > 10);
  assert.deepEqual(generateLandDetails(plan, plan.entities[0]), first);
  const roundtrip = validatePlan(JSON.parse(before));
  assert.deepEqual(generateLandDetails(roundtrip, roundtrip.entities[0]), first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  first.decorations[0].point.x = -50;
  assert.equal(JSON.stringify(plan), before);
  assert.ok(generateLandDetails(plan, plan.entities[0]).decorations[0].point.x >= 0);
  assert.match(buildGenerationBrief(plan), /本地细化 tropical/);
  assert.match(buildGenerationBrief(plan), /未调用 Opus/);
});

test('seed changes the arrangement while density and disabled toggles stay within their budgets', () => {
  const plans = [1, 2, 3].map(density => planOf(refined(rectangle(), 'tropical', density, 0)));
  const counts = plans.map(plan => generateLandDetails(plan, plan.entities[0]).decorations.length);
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2]);
  assert.ok(counts[0] <= 18 && counts[1] <= 32 && counts[2] <= 48);
  const changed = planOf(refined(rectangle(), 'tropical', 2, 99));
  assert.notDeepEqual(generateLandDetails(plans[1], plans[1].entities[0]).decorations,
    generateLandDetails(changed, changed.entities[0]).decorations);
  for (const [rocks, vegetation] of [[true, false], [false, true], [false, false]]) {
    const entity = refined(rectangle(), 'rocky'); entity.refinement = { ...entity.refinement, rocks, vegetation };
    const plan = planOf(entity), details = generateLandDetails(plan, plan.entities[0]);
    assert.ok(details.decorations.every(item => item.type === 'rock' ? rocks : vegetation));
    if (!rocks && !vegetation) { assert.equal(details.decorations.length, 0); assert.equal(details.stats.attempts, 0); }
  }
});

test('footprints stay inside concave outlines rather than their convex hull', () => {
  const land = refined({ ...rectangle(), points: [p(.1, .1), p(.9, .1), p(.9, .3), p(.3, .3), p(.3, .7), p(.9, .7), p(.9, .9), p(.1, .9)] });
  const plan = planOf(land), details = generateLandDetails(plan, plan.entities[0]);
  assert.ok(details.decorations.length > 8);
  assertSafeFootprints(plan, plan.entities[0], details);
  assert.ok(details.decorations.every(item => !(item.point.x > .3 && item.point.y > .3 && item.point.y < .7)));
});

test('water, roads and authored marker footprints remain clear in real metre units', () => {
  const plan = planOf(refined(), rectangle('lake', .4, .1, .7, .4, 'water', 0),
    { id: 'road', kind: 'road', points: [p(.1, .55), p(.95, .55)], height: .2, locked: false },
    { id: 'house', kind: 'cabin', points: [p(.3, .75)], height: 7, locked: true },
    { id: 'tower', kind: 'lighthouse', points: [p(.75, .75)], height: 18, locked: false });
  const details = generateLandDetails(plan, plan.entities[0]);
  assert.ok(details.decorations.length > 10);
  assertSafeFootprints(plan, plan.entities[0], details);
  for (const item of details.decorations) {
    const radius = DETAIL_FOOTPRINTS[item.type] * item.scale;
    for (const [id, markerRadius] of [['house', 6.3], ['tower', 2.55]]) {
      const marker = plan.entities.find(entity => entity.id === id).points[0];
      assert.ok(Math.hypot((item.point.x - marker.x) * 200, (item.point.y - marker.y) * 150) > radius + markerRadius + .8);
    }
  }
});

test('safety considers circles crossing water edges even when their centers are on dry land', () => {
  const plan = planOf(refined(), rectangle('lake', .4, .2, .6, .8, 'water', 0));
  const safe = createLandDetailSafety(plan, plan.entities[0]);
  assert.equal(safe(p(.39, .5), .5), true);
  assert.equal(safe(p(.39, .5), 2.1), false);
  assert.equal(safe(p(.4, .5), 0), false);
  assert.equal(safe(p(.052, .5), 1), false);
  assert.equal(createLandDetailSafety(plan, plan.entities[0], { ignoreBoundary: true })(p(.052, .5), 1), true);
  assert.equal(createLandDetailSafety(plan, plan.entities[0], { ignoreBoundary: true })(p(.39, .5), 2.1), false);
  for (const point of [p(NaN, .5), p(.5, Infinity), null]) assert.equal(safe(point), false);
  assert.equal(safe(p(.2, .5), -1), false);
});

test('higher overlapping land suppresses lower details regardless of entity order and lower land does not suppress higher', () => {
  const base = refined(), plateau = refined(rectangle('plateau', .45, .05, .95, .95, 'land', 12), 'rocky');
  const plan = planOf(base, plateau), reversed = planOf(plateau, base);
  for (const land of plan.entities) {
    const details = generateLandDetails(plan, land);
    assert.ok(details.decorations.length > 0);
    assert.deepEqual(details, generateLandDetails(reversed, reversed.entities.find(entity => entity.id === land.id)));
    assertSafeFootprints(plan, land, details);
    if (land.id === base.id) assert.ok(details.decorations.every(item => item.point.x < .45));
  }
});

test('equal-height overlaps use stable ownership instead of duplicate decorations or draw order', () => {
  const plan = planOf(refined(rectangle('alpha')), refined(rectangle('beta')));
  assert.ok(generateLandDetails(plan, plan.entities[0]).decorations.length > 0);
  assert.equal(generateLandDetails(plan, plan.entities[1]).decorations.length, 0);
  const reversed = planOf(...[...plan.entities].reverse());
  assert.deepEqual(generateLandDetails(reversed, reversed.entities[1]), generateLandDetails(plan, plan.entities[0]));
});

test('tiny and completely blocked islands safely yield no objects', () => {
  const tiny = planOf(refined(rectangle('tiny', .499, .499, .501, .501)));
  assert.deepEqual(generateLandDetails(tiny, tiny.entities[0]).decorations, []);
  const covered = planOf(refined(), rectangle('lake', .04, .04, .96, .96, 'water', 0));
  const details = generateLandDetails(covered, covered.entities[0]);
  assert.deepEqual(details.decorations, []);
  assert.ok(details.stats.attempts <= DETAIL_LIMITS.attemptsPerLand);
});

test('moving the authored outline recalculates deterministic positions and does not retain old coordinates', () => {
  const plan = planOf(refined(rectangle('moving', .1, .1, .6, .6)));
  const before = generateLandDetails(plan, plan.entities[0]);
  const next = applyPlanOperations(plan, [{ type: 'update', id: 'moving', values: {
    points: plan.entities[0].points.map(point => p(point.x + .25, point.y + .25)),
  } }]);
  const after = generateLandDetails(next, next.entities[0]);
  assert.equal(after.decorations.length, before.decorations.length);
  assert.notDeepEqual(after.decorations, before.decorations);
  after.decorations.forEach((item, index) => {
    assert.ok(Math.abs(item.point.x - before.decorations[index].point.x - .25) < 1e-10);
    assert.ok(Math.abs(item.point.y - before.decorations[index].point.y - .25) < 1e-10);
  });
  assert.deepEqual(generateLandDetails(plan, plan.entities[0]), before);
  assertSafeFootprints(next, next.entities[0], after);
});

test('anisotropic worlds use metre clearance rather than equal normalized X/Y margins', () => {
  const plan = validatePlan({ ...planOf(refined()), world: { width: 2000, depth: 10 } });
  const safe = createLandDetailSafety(plan, plan.entities[0]);
  assert.equal(safe(p(.1, .15), 2), false); // 100 m from X edge, 1 m from Y edge.
  assert.equal(safe(p(.1, .5), 2), true);
  assertSafeFootprints(plan, plan.entities[0], generateLandDetails(plan, plan.entities[0]));
});

test('single-land and total plan budgets cap generated geometry independently of call order', () => {
  const entities = Array.from({ length: 5 }, (_, i) => {
    return refined(rectangle(`land-${String(i).padStart(2, '0')}`, i / 5 + .01, .01,
      (i + 1) / 5 - .01, .99), 'rocky', 3, i);
  });
  const plan = validatePlan({ ...createPlan(), world: { width: 2000, depth: 1500 }, entities });
  const details = plan.entities.map(land => generateLandDetails(plan, land));
  assert.ok(details.every(detail => detail.decorations.length <= DETAIL_LIMITS.perLand));
  assert.equal(details.reduce((sum, detail) => sum + detail.decorations.length, 0), DETAIL_LIMITS.total);
  const reversed = validatePlan({ ...plan, entities: [...plan.entities].reverse() });
  for (let i = 0; i < entities.length; i++) assert.deepEqual(details[i], generateLandDetails(reversed,
    reversed.entities.find(land => land.id === entities[i].id)));
  const invalid = rectangle('orphan'); invalid.refinement = makeRefinement('garden');
  assert.throws(() => generateLandDetails(plan, invalid), /当前创作方案/);
  assert.throws(() => generateLandDetails(plan, { kind: 'water' }), /陆地/);
});

test('five refinement recipes are allowed, the sixth rejects atomically without reducing the 120-entity layout limit', () => {
  const entities = Array.from({ length: 120 }, (_, i) => i < 5 ? refined(rectangle(`land-${i}`)) : rectangle(`land-${i}`));
  const plan = planOf(...entities);
  assert.equal(plan.entities.length, 120);
  assert.equal(plan.entities.filter(entity => entity.refinement).length, 5);
  const before = clone(plan);
  assert.throws(() => applyPlanOperations(plan, [
    { type: 'rename', name: 'Must roll back' },
    { type: 'update', id: 'land-5', values: { refinement: makeRefinement('rocky') } },
  ]), /最多.*5/);
  assert.deepEqual(plan, before);
  assert.throws(() => planOf(...entities.slice(0, 5), refined(rectangle('sixth'))), /最多.*5/);
  const replaced = applyPlanOperations(plan, [
    { type: 'update', id: 'land-1', values: { refinement: null } },
    { type: 'update', id: 'land-5', values: { refinement: makeRefinement('rocky') } },
  ]);
  assert.equal(replaced.entities.filter(entity => entity.refinement).length, 5);
});

test('refining or removing other islands never reallocates details on an already confirmed or locked island', () => {
  const first = { ...refined(rectangle('confirmed', .05, .05, .45, .95), 'rocky', 3), locked: true };
  const second = rectangle('other', .55, .05, .95, .95);
  const plan = planOf(first, second), details = generateLandDetails(plan, plan.entities[0]);
  const next = applyPlanOperations(plan, [{ type: 'update', id: second.id, values: { refinement: makeRefinement('garden', 3) } }]);
  assert.deepEqual(generateLandDetails(next, next.entities[0]), details);
  const removed = applyPlanOperations(next, [{ type: 'update', id: second.id, values: { refinement: null } }]);
  assert.deepEqual(generateLandDetails(removed, removed.entities[0]), details);
  assert.equal(plan.entities[0].locked, true);
  assert.deepEqual(next.entities[0], plan.entities[0]);
});
