import test from 'node:test';
import assert from 'node:assert/strict';
import { REEFS, FISH_RADIUS, WATER_BOUNDS, canMove } from '../web/underwater/core.js';
import {
  DIVER_RADIUS, FOLLOW_DISTANCE, MIN_SEPARATION, DIVER_SPEED, DIVER_TURN_SPEED, MAX_FOLLOW_DT,
  INITIAL_DIVER, diverBounds, canDiverMove, validateDiverPose, chooseFollowStation, planFollow,
  advanceFollower, settleFollower, canFishPastDiver,
} from '../web/underwater/follower.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const copyInitial = () => structuredClone(INITIAL_DIVER);
const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

function swim(pose, fish, dt = 1 / 60) {
  let plan = planFollow(pose, fish), result = null;
  const samples = [structuredClone(pose)];
  for (let i = 0; i < 1200; i++) {
    const before = pose;
    result = advanceFollower(plan, pose, dt); pose = result.pose; plan = result.plan;
    assert.ok(distance(before.position, pose.position) <= DIVER_SPEED * dt + 1e-12);
    assert.ok(Math.abs(angleDelta(pose.heading, before.heading)) <= DIVER_TURN_SPEED * dt + 1e-12);
    assert.equal(canDiverMove(before.position, pose.position, { fish }).valid, true);
    assert.deepEqual(plan.route[0], pose.position);
    samples.push(structuredClone(pose));
    if (result.settled) return { ...result, samples };
  }
  assert.fail('registered route did not reach a stable conclusion within 20 seconds');
}

test('the full diver envelope protects the water boundary and reef interiors for every swept segment', () => {
  assert.equal(DIVER_RADIUS, .4); assert.equal(FOLLOW_DISTANCE, 1);
  assert.equal(MIN_SEPARATION, DIVER_RADIUS + FISH_RADIUS);
  const bounds = diverBounds();
  assert.equal(bounds.minX, WATER_BOUNDS.minX + DIVER_RADIUS);
  assert.equal(bounds.maxZ, WATER_BOUNDS.maxZ - DIVER_RADIUS);
  assert.equal(canDiverMove([-2.25, -1.35], [-2.25, 1.35]).valid, true);
  assert.equal(canDiverMove([-2.2500001, -.95], [-2.25, -.95]).valid, false);
  assert.equal(canDiverMove([-1.9, -.45], [.1, -.45]).valid, false);
  const tangent = REEFS[0].position[1] + REEFS[0].radius + DIVER_RADIUS;
  assert.equal(canDiverMove([-1.9, tangent], [-.1, tangent]).valid, true);
  assert.equal(canDiverMove([-1.9, tangent - 1e-6], [-.1, tangent - 1e-6]).valid, false);
});

test('a clear follower advances at finite speed, continuously turns, then faces the stationary fish at target distance', () => {
  const initial = copyInitial(), fish = [-1.85, .9], plan = planFollow(initial, fish);
  assert.equal(plan.status, 'moving'); assert.equal(plan.detour, false); assert.equal(plan.route.length, 2);
  const first = advanceFollower(plan, initial, 1 / 60);
  assert.notDeepEqual(first.pose.position, plan.goal);
  near(distance(initial.position, first.pose.position), DIVER_SPEED / 60);
  assert.equal(first.settled, false);
  const result = swim(initial, fish);
  assert.equal(result.status, 'arrived'); assert.equal(result.settled, true);
  near(result.distance, FOLLOW_DISTANCE); near(result.pose.heading, -Math.PI / 2);
  assert.ok(result.samples.length > 60); assert.deepEqual(initial, copyInitial());
  assert.deepEqual(result.pose, settleFollower(initial, fish).pose);
});

test('reef occlusion produces a real detour whose every corner, chord and timed subsegment is safe', () => {
  const pose = copyInitial(), fish = [-.6, 1.35], plan = planFollow(pose, fish);
  assert.equal(plan.status, 'detour'); assert.equal(plan.detour, true); assert.ok(plan.route.length > 2);
  assert.equal(canDiverMove(pose.position, plan.goal, { fish }).valid, false);
  for (let i = 1; i < plan.route.length; i++) assert.equal(canDiverMove(plan.route[i - 1], plan.route[i], { fish }).valid, true);
  const result = swim(pose, fish);
  assert.equal(result.status, 'arrived'); near(result.distance, 1);
  assert.ok(result.samples.length > 100);
  near(result.pose.heading, Math.atan2(-(fish[1] - result.pose.position[1]), fish[0] - result.pose.position[0]));
});

test('a genuine corridor blocked by the larger diver envelope stops in place and replans after the fish returns', () => {
  const pose = copyInitial(), inaccessibleFish = [2.1, 1.4];
  assert.equal(canMove(inaccessibleFish, inaccessibleFish).valid, true);
  // The expanded center and east circles overlap and join opposite water edges.
  const center = REEFS[1], east = REEFS[2], bounds = diverBounds();
  assert.ok(center.position[1] + center.radius + DIVER_RADIUS > bounds.maxZ);
  assert.ok(east.position[1] - east.radius - DIVER_RADIUS < bounds.minZ);
  assert.ok(distance(center.position, east.position) < center.radius + east.radius + 2 * DIVER_RADIUS);
  const blocked = planFollow(pose, inaccessibleFish);
  assert.equal(blocked.status, 'blocked'); assert.match(blocked.reason, /受阻/);
  const step = advanceFollower(blocked, pose, MAX_FOLLOW_DT);
  assert.deepEqual(step.pose, pose); assert.equal(step.settled, true); assert.equal(step.status, 'blocked');
  const resumed = swim(step.pose, [-.6, 1.35]); assert.equal(resumed.status, 'arrived');
});

test('the fish body is a dynamic swept obstacle and fish drags cannot tunnel through the current diver', () => {
  const pose = { position: [-1.85, .4], heading: 0 }, fish = [-1.85, 1.2];
  assert.equal(canDiverMove([-2.1, .4], [-1.6, .4], { fish }).valid, true);
  assert.equal(canDiverMove([-2.1, .9], [-1.6, .9], { fish }).valid, false);
  assert.equal(canFishPastDiver([-2.2, 1.2], [-1.4, -.3], pose).valid, false);
  const radius = MIN_SEPARATION;
  assert.equal(canFishPastDiver([-2.2, .4 + radius], [-1.4, .4 + radius], pose).valid, true);
  const overlap = planFollow(copyInitial(), [...INITIAL_DIVER.position]);
  assert.equal(overlap.status, 'blocked'); assert.match(overlap.reason, /鱼体间距/);
  assert.deepEqual(advanceFollower(overlap, copyInitial(), .1).pose, copyInitial());
});

test('replanning mid-swim starts exactly at the visible pose and preserves lawful motion instead of teleporting to the new fish goal', () => {
  let pose = copyInitial(), plan = planFollow(pose, [-1.85, .9]);
  for (let i = 0; i < 30; i++) { const step = advanceFollower(plan, pose, 1 / 60); pose = step.pose; plan = step.plan; }
  const before = structuredClone(pose), newFish = [-.6, 1.35], redirected = planFollow(pose, newFish);
  assert.deepEqual(redirected.route[0], before.position);
  const first = advanceFollower(redirected, pose, 1 / 60);
  assert.ok(distance(before.position, first.pose.position) <= DIVER_SPEED / 60 + 1e-12);
  assert.notDeepEqual(first.pose.position, redirected.goal);
  const result = swim(first.pose, newFish); assert.equal(result.status, 'arrived');
  assert.deepEqual(pose, before);
});

test('near-distance arrival remains still while facing changes take bounded steps through the shortest angular direction', () => {
  const fish = [-1.85, .9], pose = { position: [-1.85, -.1], heading: Math.PI - .01 }, plan = planFollow(pose, fish);
  assert.equal(plan.status, 'turning'); assert.equal(plan.route.length, 1);
  const first = advanceFollower(plan, pose, .1);
  assert.deepEqual(first.pose.position, pose.position); assert.equal(first.status, 'turning'); assert.equal(first.settled, false);
  near(Math.abs(angleDelta(first.pose.heading, pose.heading)), DIVER_TURN_SPEED * .1);
  assert.ok(first.pose.heading < 0);
  const result = swim(first.pose, fish); assert.equal(result.status, 'arrived'); near(result.pose.heading, -Math.PI / 2);
});

test('a lawful imported pose at target distance facing away is not described as arrived or silently reoriented', () => {
  const fish = [-1.85, .9], imported = validateDiverPose({ position: [-1.85, -.1], heading: Math.PI / 2 });
  const before = structuredClone(imported), plan = planFollow(imported, fish);
  assert.equal(plan.status, 'turning'); assert.deepEqual(plan.route, [[...imported.position]]);
  const stationary = advanceFollower(plan, imported, 0);
  assert.equal(stationary.status, 'turning'); assert.equal(stationary.settled, false);
  assert.deepEqual(stationary.pose, before); assert.deepEqual(imported, before);
  const result = swim(imported, fish);
  assert.equal(result.status, 'arrived'); assert.equal(result.settled, true);
  assert.deepEqual(result.pose.position, before.position); near(result.pose.heading, -Math.PI / 2);
  assert.equal(planFollow(result.pose, fish).status, 'arrived');
});

test('old workspace station choice is safe even when the old fish occupies the new diver start, and does not invent a travelled route', () => {
  for (const fish of [[...INITIAL_DIVER.position], [-1.85, .9], [2.1, 1.4], [.1, .3], [.2, -1.3]]) {
    const pose = chooseFollowStation(INITIAL_DIVER.position, fish);
    assert.equal(canDiverMove(pose.position, pose.position, { fish }).valid, true);
    near(distance(pose.position, fish), FOLLOW_DISTANCE);
    assert.deepEqual(validateDiverPose(pose), pose);
    assert.equal(Object.hasOwn(pose, 'path'), false);
  }
});

test('strict pose, plan and time validation rejects getters, malformed input, illegal jumps and tampering without changing callers', () => {
  const pose = copyInitial(), plan = planFollow(pose, [-.6, 1.35]), beforePose = structuredClone(pose), beforePlan = structuredClone(plan);
  let getterCalled = false;
  const bad = { position: pose.position };
  Object.defineProperty(bad, 'heading', { enumerable: true, get() { getterCalled = true; return 0; } });
  assert.throws(() => validateDiverPose(bad)); assert.equal(getterCalled, false);
  for (const value of [{ ...pose, hidden: 1 }, { ...pose, heading: Infinity }, { ...pose, position: [NaN, 0] },
    { ...pose, position: new Array(2) }, { ...pose, position: [...REEFS[0].position] }]) assert.throws(() => validateDiverPose(value));
  for (const dt of [-.001, .10001, Infinity, NaN, '0.1']) assert.throws(() => advanceFollower(plan, pose, dt), /步长/);
  const unsafe = structuredClone(plan); unsafe.route = [[...pose.position], [...plan.goal]];
  assert.throws(() => advanceFollower(unsafe, pose, .1), /礁石/);
  const mismatch = structuredClone(plan); mismatch.route[0][0] += .01;
  assert.throws(() => advanceFollower(mismatch, pose, .1), /起点/);
  const hidden = structuredClone(plan); hidden.route.note = 'extra'; assert.throws(() => advanceFollower(hidden, pose, .1));
  const falseDistance = structuredClone(plan); falseDistance.distance = 1;
  assert.throws(() => advanceFollower(falseDistance, pose, .1), /距离与起点/);
  const falseGoal = planFollow(pose, [-1.85, .9]); falseGoal.route[1] = [-1.85, -.2]; falseGoal.goal = [-1.85, -.2];
  assert.throws(() => advanceFollower(falseGoal, pose, .1), /目标间距/);
  const unchanged = advanceFollower(plan, pose, 0); assert.deepEqual(unchanged.pose, pose);
  assert.deepEqual(pose, beforePose); assert.deepEqual(plan, beforePlan);
});

test('a deterministic grid of legal fish goals only yields entirely safe sampled routes or an explicit stationary blockage', () => {
  let safe = 0, blocked = 0, detours = 0;
  for (let x = -2.2; x <= 2.2 + 1e-10; x += .55) for (let z = -1.3; z <= 1.3 + 1e-10; z += .325) {
    const fish = [Number(x.toFixed(3)), Number(z.toFixed(3))];
    if (!canMove(fish, fish).valid || distance(fish, INITIAL_DIVER.position) < MIN_SEPARATION) continue;
    const plan = planFollow(copyInitial(), fish);
    if (plan.status === 'blocked') { blocked++; assert.deepEqual(plan.route, [[...INITIAL_DIVER.position]]); continue; }
    safe++; if (plan.detour) detours++;
    near(distance(plan.goal, fish), FOLLOW_DISTANCE, .025 + 1e-10);
    for (let i = 0; i < plan.route.length; i++) assert.equal(canDiverMove(plan.route[Math.max(0, i - 1)], plan.route[i], { fish }).valid, true);
  }
  assert.ok(safe > 10); assert.ok(blocked > 5); assert.ok(detours > 5);
});
