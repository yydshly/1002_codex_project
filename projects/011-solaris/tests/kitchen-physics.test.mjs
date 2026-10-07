import test from 'node:test';
import assert from 'node:assert/strict';
import { createKitchenPhysics, PHYSICS_LIMITS } from '../web/kitchen/physics.js';
import { initialState, TEMPLATES, BOWL } from '../web/kitchen/core.js';
import { PerspectiveCamera, Raycaster, Vector2, Vector3, Plane } from '../web/studio/vendor/three.module.js';

const clone = value => structuredClone(value);
const item = (number, templateId, position) => ({ id: `ingredient-${number}`, templateId, position, quaternion: [0, 0, 0, 1] });
function finish(physics, delta = 1 / 60) {
  let result;
  for (let frame = 0; frame < 1500 && physics.active; frame++) result = physics.step(delta);
  assert.equal(physics.active, false, 'Solver should stop at stability or its simulation limit');
  return result || physics.step(0);
}
function supported(items) {
  for (const value of items) {
    const radius = TEMPLATES[value.templateId].radius;
    assert.ok(Math.hypot(value.position[0], value.position[2]) + radius <= .43 + 1e-10);
    assert.ok(value.position[1] >= BOWL.bottomY + radius - .012 - 1e-10);
    assert.ok(value.position[1] <= .7);
    assert.ok(Math.abs(Math.hypot(...value.quaternion) - 1) < 1e-12);
  }
  for (let first = 0; first < items.length; first++) for (let second = first + 1; second < items.length; second++) {
    const a = items[first], b = items[second];
    const distance = Math.hypot(...a.position.map((value, axis) => value - b.position[axis]));
    assert.ok(TEMPLATES[a.templateId].radius + TEMPLATES[b.templateId].radius - distance <= .008 + 1e-10);
  }
}

test('fixed substeps produce the same drop outcome across 30, 60 and 120 Hz frames', () => {
  const inputs = [...initialState().items, item(5, 'apple', [0, .62, 0])];
  const outcomes = [1 / 30, 1 / 60, 1 / 120].map(delta => {
    const physics = createKitchenPhysics(); physics.start(inputs);
    const result = finish(physics, delta); assert.equal(result.failure, null);
    supported(result.items); return physics.snapshot();
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('the actual seventh-lemon browser drop converges with a fruit resting on three neighbours', () => {
  // Preserve the six-item browser state which exposed a repeated contact impulse.
  // The user's exported workspace can change without altering this regression.
  const saved = [
    { id: 'ingredient-1', templateId: 'lemon', position: [-0.1405102226178558, 0.17498051353994576, 0.03453952151630534], quaternion: [0.20595927382584647, -0.22151846362606656, -0.15064032464518567, 0.9411789629972984] },
    { id: 'ingredient-2', templateId: 'apple', position: [0.14956244333445656, 0.18498052951646615, -0.11250134492524913], quaternion: [0.1448912115008259, 0.20535960101488943, -0.234164716980431, 0.9391490065065837] },
    { id: 'ingredient-3', templateId: 'avocado', position: [0.2125311675657511, 0.18498050858680212, 0.18072297498638942], quaternion: [0.35709513620946315, -0.2952087794259888, -0.4328700552658571, 0.7732776703742951] },
    { id: 'ingredient-4', templateId: 'onion', position: [-0.11305651059322568, 0.1799804818249978, -0.22157935465632428], quaternion: [-0.1338365257585678, -0.009795388643282424, 0.07866788039960057, 0.9878275149678902] },
    { id: 'ingredient-5', templateId: 'apple', position: [0.029561072039896115, 0.1849804778363527, 0.04373918193883398], quaternion: [0.11734915515063113, -0.06309281745999326, -0.4594381855130766, 0.8781600229245494] },
    { id: 'ingredient-6', templateId: 'avocado', position: [-0.009590023160715805, 0.24470176668441143, -0.11053511142594616], quaternion: [0.2063270722531772, 0.09427360345024274, -0.35645063308010383, 0.9063578615120695] }
  ];
  const camera = new PerspectiveCamera(35, 980 / 646, .025, 30);
  camera.position.set(1.2, 2.5, 2.3); camera.lookAt(-.2, .18, 0); camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(537 / 980 * 2 - 1, -(355 - 74) / 646 * 2 + 1), camera);
  const drop = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -.38), new Vector3());
  assert.ok(drop && Math.abs(drop.x - -0.05703370608970704) < 1e-12 && Math.abs(drop.z - -0.0660268052232853) < 1e-12);
  const inputs = [...saved, item(7, 'lemon', [drop.x, BOWL.dropPlaneY, drop.z])];
  const outcomes = [1 / 20, 1 / 30, 1 / 60, 1 / 120].map(delta => {
    const physics = createKitchenPhysics(); physics.start(inputs);
    let result, frames = 0;
    while (physics.active && frames * delta < PHYSICS_LIMITS.maxSimulationSeconds) { result = physics.step(delta); frames++; }
    assert.equal(physics.active, false); assert.equal(result.failure, null);
    assert.ok(frames * delta < 4, 'The previously recurring contact impulse should converge before the simulation deadline');
    assert.deepEqual(result.items.map(value => [value.id, value.templateId]), inputs.map(value => [value.id, value.templateId]));
    supported(result.items);
    const snapshot = physics.snapshot(); assert.deepEqual(physics.step(1).items, snapshot);
    return snapshot;
  });
  for (const outcome of outcomes.slice(1)) assert.deepEqual(outcome, outcomes[0]);
  assert.deepEqual(inputs.slice(0, 6), saved, 'The saved six-item fixture must not be mutated');
});

test('all four whole-food envelopes drop onto the bowl base without tunnelling', () => {
  for (const templateId of Object.keys(TEMPLATES)) {
    const physics = createKitchenPhysics(); const input = [item(1, templateId, [0, .62, 0])];
    physics.start(input); const result = finish(physics);
    assert.equal(result.failure, null); supported(result.items);
    assert.ok(Math.abs(result.items[0].position[1] - (BOWL.bottomY + TEMPLATES[templateId].radius)) < .002);
    assert.deepEqual(result.items.map(value => [value.id, value.templateId]), input.map(value => [value.id, value.templateId]));
    assert.deepEqual(input[0].position, [0, .62, 0], 'Caller drop data must not be mutated');
  }
});

test('real sphere contact prevents overlap and preserves every existing ingredient ID', () => {
  const physics = createKitchenPhysics();
  const inputs = [item(1, 'apple', [0, .185, 0]), item(2, 'lemon', [0, .62, 0])];
  physics.start(inputs); const result = finish(physics);
  assert.equal(result.failure, null); supported(result.items);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(value => value.id), ['ingredient-1', 'ingredient-2']);
  assert.ok(result.items[1].position[1] > .27, 'The second fruit should be supported by the first rather than pass through it');
});

test('segmented inner walls contain drops near the rim around the whole bowl', () => {
  for (let quadrant = 0; quadrant < 8; quadrant++) {
    const angle = quadrant * Math.PI / 4;
    const physics = createKitchenPhysics();
    physics.start([item(1, 'lemon', [.338 * Math.cos(angle), .62, .338 * Math.sin(angle)])]);
    const result = finish(physics); assert.equal(result.failure, null); supported(result.items);
  }
});

test('reset restores exact saved poses and idle frames never drift or leak mutable references', () => {
  const physics = createKitchenPhysics(); physics.start([item(1, 'apple', [0, .62, 0])]); finish(physics);
  const saved = initialState().items; physics.reset(saved);
  assert.equal(physics.active, false);
  for (const delta of [0, .001, .05, 1, 3600]) assert.deepEqual(physics.step(delta).items, saved);
  const snapshot = physics.snapshot(); snapshot[0].position[0] = 99;
  assert.deepEqual(physics.snapshot(), saved);
  assert.deepEqual(saved, initialState().items);
});

test('a long stalled browser frame advances at most six fixed substeps', () => {
  const input = [item(1, 'apple', [0, .62, 0])];
  const longFrame = createKitchenPhysics(), shortFrame = createKitchenPhysics();
  longFrame.start(input); shortFrame.start(input);
  const actual = longFrame.step(100);
  let expected; for (let step = 0; step < PHYSICS_LIMITS.maxSubSteps; step++) expected = shortFrame.step(PHYSICS_LIMITS.fixedStep);
  assert.deepEqual(actual.items, expected.items);
  assert.ok(actual.items[0].position[1] > .60, 'A stalled frame must not fast-forward the entire fall');
  assert.throws(() => longFrame.snapshot(), /下落/);
});

test('a drop outside the container fails honestly instead of being clamped or deleted', () => {
  const physics = createKitchenPhysics(); const input = [item(1, 'apple', [.70, .62, 0])];
  physics.start(input); const result = finish(physics);
  assert.match(result.failure, /碗外|支撑/);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].id, 'ingredient-1');
  assert.ok(result.items[0].position[0] > .6);
  assert.throws(() => physics.snapshot(), /碗外|支撑/);
  physics.reset(initialState().items); assert.equal(physics.step(0).failure, null);
});

test('invalid registrations, counts and numeric poses cannot corrupt a loaded workspace', () => {
  const physics = createKitchenPhysics(), initial = initialState().items;
  physics.reset(initial);
  const invalid = [
    [item(1, 'banana', [0, .62, 0])],
    [item(0, 'apple', [0, .62, 0])],
    [item(1, 'apple', [NaN, .62, 0])],
    [item(1, 'apple', [Infinity, .62, 0])],
    [item(1, 'apple', [0, .62, 0]), item(1, 'lemon', [.2, .62, 0])],
    Array.from({ length: 17 }, (_, index) => item(index + 1, 'apple', [0, .62, 0])),
    [{ ...item(1, 'apple', [0, .62, 0]), quaternion: [0, 0, 0, 0] }],
    [{ ...item(1, 'apple', [0, .62, 0]), extra: 'unsupported' }]
  ];
  for (const input of invalid) { assert.throws(() => physics.start(input)); assert.deepEqual(physics.snapshot(), initial); }
  const sparse = new Array(1); assert.throws(() => physics.start(sparse));
  for (const delta of [NaN, Infinity, -1, '0.1']) assert.throws(() => physics.step(delta));
  assert.deepEqual(physics.snapshot(), initial);
  assert.throws(() => physics.reset([item(1, 'apple', [0, .01, 0])]), /支撑/);
  assert.throws(() => physics.reset([item(1, 'apple', [0, .185, 0]), item(2, 'apple', [0, .185, 0])]), /穿透/);
  assert.deepEqual(physics.snapshot(), initial);
  const empty = createKitchenPhysics(); empty.start([]); assert.equal(empty.active, false); assert.deepEqual(empty.snapshot(), []);
});
