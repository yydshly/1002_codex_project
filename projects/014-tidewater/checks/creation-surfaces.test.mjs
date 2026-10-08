import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, validatePlan } from '../web/creation-core.js';
import { WATER_SURFACE_OFFSET, waterLevel, surfaceHeight } from '../web/creation-surfaces.js';

const point = (x, y) => ({ x, y });
const rectangle = (minX, minY, maxX, maxY) => [point(minX, minY), point(maxX, minY), point(maxX, maxY), point(minX, maxY)];
const region = (id, kind, points, height = kind === 'water' ? 0 : 3) => ({ id, kind, points, height, locked: false });
const land = (id, points, height = 3) => region(id, 'land', points, height);
const water = (id, points, height = 0) => region(id, 'water', points, height);
const planWith = (...entities) => validatePlan({ ...createPlan(), entities });
const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test('water inside land rests above the actual land top without changing its authored zero height', () => {
  const lake = water('lake', rectangle(0.3, 0.3, 0.6, 0.6));
  const plan = planWith(land('island', rectangle(0.1, 0.1, 0.8, 0.8)), lake);
  assert.equal(waterLevel(plan, lake), 3);
  assert.equal(surfaceHeight(plan, point(0.4, 0.4)), 3 + WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, point(0.2, 0.2)), 3);
  assert.equal(surfaceHeight(plan, point(0.9, 0.9)), 0);
  assert.equal(plan.entities[1].height, 0);
});

test('water that completely contains land also detects that supporting land', () => {
  const lake = water('lake', rectangle(0.1, 0.1, 0.9, 0.9));
  const plan = planWith(lake, land('island', rectangle(0.3, 0.3, 0.6, 0.6), 7));
  assert.equal(waterLevel(plan, lake), 7);
  assert.equal(surfaceHeight(plan, point(0.2, 0.2)), 7 + WATER_SURFACE_OFFSET);
});

test('crossing polygon edges detect overlap even when no polygon vertices lie inside the other', () => {
  const lake = water('lake', rectangle(0.4, 0.1, 0.6, 0.9));
  const plan = planWith(land('island', rectangle(0.1, 0.4, 0.9, 0.6), 5), lake);
  assert.equal(waterLevel(plan, lake), 5);
  assert.equal(surfaceHeight(plan, point(0.5, 0.5)), 5 + WATER_SURFACE_OFFSET);
});

test('shared edges and single touching vertices are treated as supporting contact', () => {
  const island = land('island', rectangle(0.1, 0.1, 0.5, 0.5), 4);
  const edgeLake = water('edge-lake', rectangle(0.5, 0.2, 0.8, 0.4));
  const cornerLake = water('corner-lake', rectangle(0.5, 0.5, 0.8, 0.8));
  const plan = planWith(island, edgeLake, cornerLake);
  assert.equal(waterLevel(plan, edgeLake), 4);
  assert.equal(waterLevel(plan, cornerLake), 4);
  assert.equal(surfaceHeight(plan, point(0.5, 0.3)), 4 + WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, point(0.5, 0.5)), 4 + WATER_SURFACE_OFFSET);
});

test('concave land does not raise water in its empty notch despite overlapping bounding boxes', () => {
  const outline = [point(0.1, 0.1), point(0.8, 0.1), point(0.8, 0.3), point(0.3, 0.3), point(0.3, 0.8), point(0.1, 0.8)];
  const lake = water('notch-lake', rectangle(0.4, 0.4, 0.6, 0.6));
  const plan = planWith(land('concave-island', outline, 9), lake);
  assert.equal(waterLevel(plan, lake), 0);
  assert.equal(surfaceHeight(plan, point(0.5, 0.5)), WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, point(0.2, 0.5)), 9);
});

test('concave water does not attach to a land polygon inside its empty notch', () => {
  const outline = [point(0.1, 0.1), point(0.8, 0.1), point(0.8, 0.3), point(0.3, 0.3), point(0.3, 0.8), point(0.1, 0.8)];
  const lake = water('concave-lake', outline);
  const plan = planWith(lake, land('notch-island', rectangle(0.4, 0.4, 0.6, 0.6), 9));
  assert.equal(waterLevel(plan, lake), 0);
  assert.equal(surfaceHeight(plan, point(0.2, 0.5)), WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, point(0.5, 0.5)), 9);
});

test('separate regions keep the water level at zero and support sea objects consistently', () => {
  const sea = water('sea', rectangle(0.6, 0.6, 0.9, 0.9));
  const plan = planWith(land('island', rectangle(0.1, 0.1, 0.4, 0.4), 12), sea);
  assert.equal(waterLevel(plan, sea), 0);
  assert.equal(surfaceHeight(plan, point(0.75, 0.75)), WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, point(0.5, 0.5)), 0);
});

test('the highest overlapping land supports a flat water region independently of entity order', () => {
  const lake = water('lake', rectangle(0.2, 0.2, 0.8, 0.8));
  const low = land('low-island', rectangle(0.1, 0.1, 0.4, 0.4), 3);
  const high = land('high-island', rectangle(0.6, 0.6, 0.9, 0.9), 8);
  for (const entities of [[low, lake, high], [high, low, lake], [lake, high, low]]) {
    const plan = planWith(...entities);
    assert.equal(waterLevel(plan, lake), 8);
    assert.equal(surfaceHeight(plan, point(0.3, 0.3)), 8 + WATER_SURFACE_OFFSET);
    assert.equal(surfaceHeight(plan, point(0.7, 0.7)), 8 + WATER_SURFACE_OFFSET);
  }
});

test('an explicit high water level is preserved while lower values auto-fit supporting land', () => {
  const island = land('island', rectangle(0.1, 0.1, 0.9, 0.9), 3);
  const lake = water('lake', rectangle(0.3, 0.3, 0.6, 0.6), 12);
  assert.equal(waterLevel(planWith(island, lake), lake), 12);
  assert.equal(surfaceHeight(planWith(island, lake), point(0.4, 0.4)), 12 + WATER_SURFACE_OFFSET);
  const lower = { ...lake, height: 2 };
  assert.equal(waterLevel(planWith(island, lower), lower), 3);
  assert.equal(waterLevel(planWith(lake), lake), 12);
});

test('markers and road endpoints use the topmost water support with the same mesh offset', () => {
  const lowWater = water('low-water', rectangle(0.1, 0.1, 0.9, 0.9), 2);
  const highWater = water('high-water', rectangle(0.3, 0.3, 0.6, 0.6), 7);
  const boat = { id: 'boat', kind: 'boat', points: [point(0.4, 0.4)], height: 2, locked: false };
  const road = { id: 'road', kind: 'road', points: [point(0.2, 0.2), point(0.4, 0.4)], height: 0.2, locked: false };
  const plan = planWith(lowWater, highWater, boat, road);
  assert.equal(surfaceHeight(plan, boat.points[0]), 7 + WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, road.points[0]), 2 + WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(plan, road.points[1]), 7 + WATER_SURFACE_OFFSET);
  assert.equal(surfaceHeight(planWith(highWater, lowWater), boat.points[0]), 7 + WATER_SURFACE_OFFSET);
});

test('moving or raising land recomputes derived water levels, including locked water', () => {
  const lake = { ...water('lake', rectangle(0.3, 0.3, 0.6, 0.6)), locked: true };
  const plan = planWith(land('island', rectangle(0.1, 0.1, 0.8, 0.8)), lake);
  assert.equal(waterLevel(plan, lake), 3);
  const raised = clone(plan); raised.entities[0].height = 6;
  assert.equal(waterLevel(raised, lake), 6);
  const moved = clone(plan); moved.entities[0].points = rectangle(0.7, 0.7, 0.9, 0.9);
  assert.equal(waterLevel(moved, lake), 0);
  assert.deepEqual(raised.entities[1], plan.entities[1]);
  assert.deepEqual(moved.entities[1], plan.entities[1]);
});

test('optional precomputed levels agree with uncached support heights and remain unchanged', () => {
  const lake = water('lake', rectangle(0.3, 0.3, 0.6, 0.6));
  const sea = water('sea', rectangle(0.8, 0.8, 0.9, 0.9));
  const plan = planWith(land('island', rectangle(0.1, 0.1, 0.7, 0.7)), lake, sea);
  const levels = new Map([[lake.id, waterLevel(plan, lake)], [sea.id, waterLevel(plan, sea)]]);
  const before = [...levels];
  for (const location of [point(0.4, 0.4), point(0.85, 0.85), point(0.2, 0.2), point(0.95, 0.95)]) {
    assert.equal(surfaceHeight(plan, location, levels), surfaceHeight(plan, location));
    assert.equal(surfaceHeight(plan, location, new Map()), surfaceHeight(plan, location));
  }
  assert.deepEqual([...levels], before);
});

test('surface calculations leave all plan, polygon, height, lock and point inputs unchanged', () => {
  const lake = water('lake', rectangle(0.3, 0.3, 0.6, 0.6));
  const plan = freeze(planWith(land('island', rectangle(0.1, 0.1, 0.8, 0.8)), { ...lake, locked: true }));
  const before = clone(plan), location = freeze(point(0.4, 0.4));
  assert.equal(waterLevel(plan, plan.entities[1]), 3);
  assert.equal(surfaceHeight(plan, location), 3 + WATER_SURFACE_OFFSET);
  assert.deepEqual(plan, before);
  assert.deepEqual(location, point(0.4, 0.4));
});
