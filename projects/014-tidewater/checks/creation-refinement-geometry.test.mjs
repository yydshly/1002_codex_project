import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, validatePlan } from '../web/creation-core.js';
import { makeRefinement, generateLandDetails } from '../web/creation-refinement.js';
import { generateBeachTriangles } from '../web/creation-refinement-geometry.js';

const p = (x, y) => ({ x, y });
const rectangle = (x, y, w, h) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
const entity = (id, kind, points, height = kind === 'land' ? 3 : 0) => ({ id, kind, points, height, locked: false });
const make = (points, extras = [], world = { width: 200, depth: 150 }) => validatePlan({ ...createPlan(), world,
  entities: [{ ...entity('island', 'land', points), refinement: makeRefinement('tropical', 2, 8) }, ...extras],
});
function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const area = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(area) < 1e-9 && point.x >= Math.min(a.x, b.x) - 1e-9 && point.x <= Math.max(a.x, b.x) + 1e-9
      && point.y >= Math.min(a.y, b.y) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function samples(triangle) {
  const points = [...triangle];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) {
    const c = 4 - a - b;
    points.push(p((triangle[0].x * a + triangle[1].x * b + triangle[2].x * c) / 4,
      (triangle[0].y * a + triangle[1].y * b + triangle[2].y * c) / 4));
  }
  return points;
}
const normalized = (point, world) => p(point.x / world.width + .5, point.y / world.depth + .5);
function generate(plan, limit) {
  const land = plan.entities[0];
  return generateBeachTriangles(plan, land, generateLandDetails(plan, land).beach, limit);
}
function distance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

test('shorelines are real nonempty triangles within both polygon windings and anisotropic worlds', () => {
  for (const points of [rectangle(.1, .2, .75, .6), rectangle(.1, .2, .75, .6).reverse()]) {
    const plan = make(points, [], { width: 640, depth: 80 }), triangles = generate(plan);
    assert.ok(triangles.length > 20);
    for (const triangle of triangles) for (const point of samples(triangle)) assert.ok(contains(normalized(point, plan.world), points));
  }
});

test('clipping concave shores never creates triangles across an open bay', () => {
  const points = [p(.1, .1), p(.9, .1), p(.9, .9), p(.66, .9), p(.66, .28), p(.34, .28), p(.34, .9), p(.1, .9)];
  const plan = make(points), triangles = generate(plan);
  assert.ok(triangles.length > 20);
  for (const triangle of triangles) for (const point of samples(triangle)) assert.ok(contains(normalized(point, plan.world), points), JSON.stringify(point));
});

test('shoreline triangles stay out of crossing water regions and higher land, including their edges', () => {
  const waterPoints = rectangle(.46, .05, .08, .42), highPoints = rectangle(.70, .10, .16, .12);
  const plan = make(rectangle(.1, .1, .8, .8), [entity('lake', 'water', waterPoints), entity('higher', 'land', highPoints, 9)]);
  const triangles = generate(plan);
  assert.ok(triangles.length > 10);
  for (const triangle of triangles) for (const point of samples(triangle)) {
    const q = normalized(point, plan.world);
    assert.ok(!contains(q, waterPoints)); assert.ok(!contains(q, highPoints));
  }
});

test('shoreline leaves actual bridge width and authored building footprints clear', () => {
  const roadPoints = [p(.4, .02), p(.4, .98)], cabin = p(.72, .11);
  const plan = make(rectangle(.1, .1, .8, .8), [entity('road', 'road', roadPoints, .2), entity('cabin', 'cabin', [cabin], 7)]);
  const road = roadPoints.map(q => p((q.x - .5) * 200, (q.y - .5) * 150)), building = p((cabin.x - .5) * 200, (cabin.y - .5) * 150);
  for (const triangle of generate(plan)) for (const point of samples(triangle)) {
    assert.ok(distance(point, ...road) > 1.35 + .79);
    assert.ok(Math.hypot(point.x - building.x, point.y - building.y) > 6.3 + .79);
  }
});

test('shoreline output is deterministic, budgeted and does not mutate an authored plan', () => {
  const plan = make(rectangle(.05, .05, .9, .9), [], { width: 2000, depth: 2000 }), saved = JSON.stringify(plan);
  const first = generate(plan, 17), second = generate(plan, 17);
  assert.equal(first.length, 17); assert.deepEqual(first, second); assert.equal(JSON.stringify(plan), saved);
  assert.ok(generate(plan).length <= 768);
});

test('disabling a beach or removing refinement leaves no derived shoreline mesh', () => {
  const plan = make(rectangle(.1, .1, .8, .8)), land = plan.entities[0];
  land.refinement.beach = false;
  assert.deepEqual(generate(plan), []);
  delete land.refinement;
  assert.deepEqual(generate(plan), []);
});
