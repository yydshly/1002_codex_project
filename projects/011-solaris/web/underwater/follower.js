import { WATER_BOUNDS, REEFS, FISH_RADIUS, canMove } from './core.js';

// All distances are authored scene units. This is one fixed water layer with
// three conservative reef envelopes, rather than a biological swimming model.
export const DIVER_RADIUS = .40;
export const FOLLOW_DISTANCE = 1.00;
export const MIN_SEPARATION = .70;
export const DIVER_SPEED = .82;
export const DIVER_TURN_SPEED = 2.8;
export const MAX_FOLLOW_DT = .1;
export const FOLLOW_BAND = .025;
export const INITIAL_DIVER = Object.freeze({ position: Object.freeze([-1.85, -.95]), heading: -Math.PI / 2 });
const NODE_COUNT = 32, CLEARANCE = .02, EPSILON = 1e-12;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const equalPoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const headingTo = (a, b) => normalAngle(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
const normalAngle = value => {
  let angle = value;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle === 0 ? 0 : angle;
};

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(message);
  }
}

function point(value, message = '潜水员坐标必须为两个有限数值') {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 2 ||
      Reflect.ownKeys(value).length !== 3) throw new Error(message);
  const result = [];
  for (let i = 0; i < 2; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable ||
        typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value)) throw new Error(message);
    result.push(descriptor.value === 0 ? 0 : descriptor.value);
  }
  return result;
}

export function diverBounds() {
  return { minX: WATER_BOUNDS.minX + DIVER_RADIUS, maxX: WATER_BOUNDS.maxX - DIVER_RADIUS,
    minZ: WATER_BOUNDS.minZ + DIVER_RADIUS, maxZ: WATER_BOUNDS.maxZ - DIVER_RADIUS };
}

function intersectsCircle(from, to, center, radius) {
  const dx = to[0] - from[0], dz = to[1] - from[1], lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((center[0] - from[0]) * dx + (center[1] - from[1]) * dz) / lengthSquared));
  return (from[0] + t * dx - center[0]) ** 2 + (from[1] + t * dz - center[1]) ** 2 < radius ** 2 - EPSILON;
}

/** The complete segment is checked, not just its endpoints. The inset rectangle
 * is convex. Segment-to-circle minimum distance protects every intermediate pose.
 * Supplying fish adds its CURRENT body envelope; historical paths omit that option.
 */
export function canDiverMove(from, to, { fish = null } = {}) {
  let a, b, target;
  try { a = point(from); b = point(to); if (fish !== null) target = point(fish, '鱼的目标坐标无效'); }
  catch (error) { return { valid: false, reason: error.message }; }
  const bounds = diverBounds();
  for (const p of [a, b]) if (p[0] < bounds.minX || p[0] > bounds.maxX || p[1] < bounds.minZ || p[1] > bounds.maxZ)
    return { valid: false, reason: '潜水员超出固定水层的安全边界' };
  for (const reef of REEFS) if (intersectsCircle(a, b, reef.position, reef.radius + DIVER_RADIUS))
    return { valid: false, reason: '潜水员路径穿过礁石保护范围', reef: reef.id };
  if (target && intersectsCircle(a, b, target, MIN_SEPARATION))
    return { valid: false, reason: '潜水员路径进入鱼体间距保护范围' };
  return { valid: true, reason: '' };
}

export function validateDiverPose(value) {
  exactKeys(value, ['position', 'heading'], '潜水员姿态结构无效');
  const position = point(value.position), heading = value.heading === 0 ? 0 : value.heading;
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < -Math.PI || heading > Math.PI)
    throw new Error('潜水员方向必须为有限弧度');
  const check = canDiverMove(position, position);
  if (!check.valid) throw new Error(check.reason);
  return { position, heading };
}

function validFish(value) {
  const fish = point(value, '鱼的目标坐标无效'), check = canMove(fish, fish);
  if (!check.valid) throw new Error(check.reason);
  return fish;
}

function circleNodes(center, radius) {
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = i * 2 * Math.PI / NODE_COUNT;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
}

let staticGraph = null;
function reefGraph() {
  // No imported core constants are read at module initialization. A workspace
  // validator can import this module without an ESM initialization cycle.
  if (staticGraph) return staticGraph;
  const nodes = REEFS.flatMap(reef => circleNodes(reef.position, reef.radius + DIVER_RADIUS + CLEARANCE))
    .filter(p => canDiverMove(p, p).valid);
  const edges = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (!canDiverMove(nodes[i], nodes[j]).valid) continue;
    const weight = distance(nodes[i], nodes[j]);
    edges[i].push([j, weight]); edges[j].push([i, weight]);
  }
  staticGraph = { nodes, edges };
  return staticGraph;
}

function stations(from, fish) {
  const first = Math.atan2(from[1] - fish[1], from[0] - fish[0]);
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = first + i * 2 * Math.PI / NODE_COUNT;
    return [fish[0] + Math.cos(angle) * FOLLOW_DISTANCE, fish[1] + Math.sin(angle) * FOLLOW_DISTANCE];
  }).filter(p => canDiverMove(p, p, { fish }).valid);
}

/** Only for choosing a lawful initial pose when migrating an older workspace.
 * It makes NO claim that the diver swam between the supplied points.
 */
export function chooseFollowStation(fromPosition, fishPosition) {
  const from = point(fromPosition), fish = validFish(fishPosition);
  const choices = stations(from, fish).sort((a, b) => distance(from, a) - distance(from, b));
  if (!choices.length) throw new Error('当前鱼位周围没有采样到安全跟随站位');
  return { position: [...choices[0]], heading: headingTo(choices[0], fish) };
}

function makePlan(pose, fish, goal, route, status, detour = false, reason = '') {
  return { status, reason, route: route.map(p => [...p]), goal: [...goal], fish: [...fish],
    distance: distance(pose.position, fish), targetDistance: FOLLOW_DISTANCE, detour };
}

/** A finite visibility graph, not a general navigation engine. Circle samples
 * sit .02 outside the safety envelope; all graph edges still receive exact swept
 * checks. Therefore incomplete sampling may report blocked, but cannot admit an
 * unsafe chord or claim globally shortest continuous paths.
 */
export function planFollow(diver, fishPosition) {
  const pose = validateDiverPose(diver), fish = validFish(fishPosition), from = pose.position;
  const startCheck = canDiverMove(from, from, { fish });
  if (!startCheck.valid) return makePlan(pose, fish, from, [from], 'blocked', false, startCheck.reason);
  if (Math.abs(distance(from, fish) - FOLLOW_DISTANCE) <= FOLLOW_BAND) {
    const facingFish = Math.abs(normalAngle(headingTo(from, fish) - pose.heading)) <= EPSILON;
    return makePlan(pose, fish, from, [from], facingFish ? 'arrived' : 'turning');
  }
  const goals = stations(from, fish);
  if (!goals.length) return makePlan(pose, fish, from, [from], 'blocked', false, '没有采样到安全的目标间距站位');
  // The radial station minimizes Euclidean distance to the whole target ring.
  // When its direct segment is clear no sampled detour can improve on that path.
  const radial = [fish[0] + (from[0] - fish[0]) / distance(from, fish) * FOLLOW_DISTANCE,
    fish[1] + (from[1] - fish[1]) / distance(from, fish) * FOLLOW_DISTANCE];
  if (canDiverMove(from, radial, { fish }).valid) return makePlan(pose, fish, radial, [from, radial], 'moving');
  const base = reefGraph(), nodes = [...base.nodes, ...circleNodes(fish, MIN_SEPARATION + CLEARANCE)];
  const usable = nodes.map(p => canDiverMove(p, p, { fish }).valid), n = nodes.length;
  const adjacency = Array.from({ length: n }, () => []);
  for (let i = 0; i < base.nodes.length; i++) if (usable[i]) for (const [j, weight] of base.edges[i]) {
    if (usable[j] && !intersectsCircle(nodes[i], nodes[j], fish, MIN_SEPARATION)) adjacency[i].push([j, weight]);
  }
  for (let i = base.nodes.length; i < n; i++) if (usable[i]) for (let j = 0; j < i; j++) {
    if (!usable[j] || !canDiverMove(nodes[i], nodes[j], { fish }).valid) continue;
    const weight = distance(nodes[i], nodes[j]);
    adjacency[i].push([j, weight]); adjacency[j].push([i, weight]);
  }
  const costs = Array(n).fill(Infinity), previous = Array(n).fill(-1), visited = Array(n).fill(false);
  for (let i = 0; i < n; i++) if (usable[i] && canDiverMove(from, nodes[i], { fish }).valid) costs[i] = distance(from, nodes[i]);
  for (let iteration = 0; iteration < n; iteration++) {
    let current = -1;
    for (let i = 0; i < n; i++) if (!visited[i] && (current === -1 || costs[i] < costs[current])) current = i;
    if (current === -1 || !Number.isFinite(costs[current])) break;
    visited[current] = true;
    for (const [next, weight] of adjacency[current]) if (!visited[next] && costs[current] + weight < costs[next]) {
      costs[next] = costs[current] + weight; previous[next] = current;
    }
  }
  let best = null;
  for (const goal of goals) {
    if (canDiverMove(from, goal, { fish }).valid) {
      const cost = distance(from, goal);
      if (!best || cost < best.cost - EPSILON) best = { cost, goal, last: -1 };
    }
    for (let i = 0; i < n; i++) if (Number.isFinite(costs[i]) && canDiverMove(nodes[i], goal, { fish }).valid) {
      const cost = costs[i] + distance(nodes[i], goal);
      if (!best || cost < best.cost - EPSILON) best = { cost, goal, last: i };
    }
  }
  if (!best) return makePlan(pose, fish, from, [from], 'blocked', false, '当前水层通路受阻，找不到可安全通过的路线，潜水员停留；把鱼移回可达区域后继续追随');
  const middle = [];
  for (let i = best.last; i !== -1; i = previous[i]) middle.unshift(nodes[i]);
  const raw = [from, ...middle, best.goal], route = [[...from]];
  // Remove only redundant visible corners. Exact checks remain authoritative.
  let index = 0;
  while (index < raw.length - 1) {
    let next = raw.length - 1;
    while (next > index + 1 && !canDiverMove(raw[index], raw[next], { fish }).valid) next--;
    if (!equalPoint(route.at(-1), raw[next])) route.push([...raw[next]]);
    index = next;
  }
  const detour = !canDiverMove(from, best.goal, { fish }).valid;
  return makePlan(pose, fish, best.goal, route, detour ? 'detour' : 'moving', detour);
}

function validatePlan(value) {
  exactKeys(value, ['status', 'reason', 'route', 'goal', 'fish', 'distance', 'targetDistance', 'detour'], '跟随路线结构无效');
  if (!['moving', 'detour', 'turning', 'arrived', 'blocked'].includes(value.status) || typeof value.reason !== 'string' ||
      typeof value.detour !== 'boolean' || value.targetDistance !== FOLLOW_DISTANCE ||
      typeof value.distance !== 'number' || !Number.isFinite(value.distance) || value.distance < 0)
    throw new Error('跟随路线状态无效');
  if (!Array.isArray(value.route) || Object.getPrototypeOf(value.route) !== Array.prototype ||
      value.route.length < 1 || value.route.length > 132 || Reflect.ownKeys(value.route).length !== value.route.length + 1)
    throw new Error('跟随路线须包含 1 至 132 个密集采样点');
  const route = [];
  for (let i = 0; i < value.route.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value.route, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('跟随路线点结构无效');
    route.push(point(descriptor.value));
  }
  const goal = point(value.goal), fish = validFish(value.fish);
  if (!equalPoint(goal, route.at(-1))) throw new Error('跟随路线终点与目标站位不一致');
  if (Math.abs(value.distance - distance(route[0], fish)) > EPSILON) throw new Error('跟随路线距离与起点不一致');
  if (['blocked', 'arrived', 'turning'].includes(value.status) && route.length !== 1)
    throw new Error('已停止的跟随路线不应保留移动段');
  if (value.status !== 'blocked' && Math.abs(distance(goal, fish) - FOLLOW_DISTANCE) > FOLLOW_BAND + EPSILON)
    throw new Error('跟随路线终点没有达到目标间距范围');
  if (value.status !== 'blocked') for (let i = 0; i < route.length; i++) {
    const check = canDiverMove(route[Math.max(0, i - 1)], route[i], { fish });
    if (!check.valid) throw new Error(check.reason);
  }
  return { ...value, route, goal, fish };
}

/** Advance a reusable remaining plan by at most .082 scene units and .28 radians
 * per call. Frame time is capped by the caller rather than silently time-warped.
 * It returns a trimmed plan beginning at the returned pose for the next call.
 */
export function advanceFollower(plan, diver, dt) {
  const pose = validateDiverPose(diver), nextPlan = validatePlan(plan);
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0 || dt > MAX_FOLLOW_DT)
    throw new Error('跟随步长须为 0 至 0.1 秒');
  if (!equalPoint(pose.position, nextPlan.route[0])) throw new Error('跟随路线起点与潜水员当前位置不一致');
  let remaining = DIVER_SPEED * dt, position = [...pose.position], movementHeading = null;
  if (nextPlan.status !== 'blocked') while (nextPlan.route.length > 1 && remaining > 0) {
    const target = nextPlan.route[1], length = distance(position, target);
    if (length === 0) { nextPlan.route.shift(); continue; }
    const travel = Math.min(remaining, length), ratio = travel / length;
    const end = travel === length ? [...target] : [position[0] + (target[0] - position[0]) * ratio,
      position[1] + (target[1] - position[1]) * ratio];
    const check = canDiverMove(position, end, { fish: nextPlan.fish });
    if (!check.valid) { nextPlan.status = 'blocked'; nextPlan.reason = check.reason; break; }
    movementHeading = headingTo(position, end); position = end; remaining -= travel;
    if (travel === length) nextPlan.route.shift(); else nextPlan.route[0] = [...position];
  }
  if (nextPlan.status === 'blocked') { nextPlan.route = [[...position]]; nextPlan.goal = [...position]; }
  if (!equalPoint(nextPlan.route[0], position)) nextPlan.route.unshift([...position]);
  const atGoal = nextPlan.status !== 'blocked' && nextPlan.route.length === 1;
  const wantedHeading = atGoal ? headingTo(position, nextPlan.fish) : movementHeading ?? pose.heading;
  const delta = normalAngle(wantedHeading - pose.heading), turn = Math.max(-DIVER_TURN_SPEED * dt, Math.min(DIVER_TURN_SPEED * dt, delta));
  const resultPose = { position, heading: normalAngle(pose.heading + turn) };
  const settled = atGoal && Math.abs(normalAngle(wantedHeading - resultPose.heading)) <= 1e-12;
  if (nextPlan.status !== 'blocked') nextPlan.status = atGoal ? (settled ? 'arrived' : 'turning') : (nextPlan.detour ? 'detour' : 'moving');
  nextPlan.distance = distance(position, nextPlan.fish);
  return { pose: resultPose, plan: nextPlan, status: nextPlan.status, distance: nextPlan.distance,
    targetDistance: FOLLOW_DISTANCE, settled: settled || nextPlan.status === 'blocked', reason: nextPlan.reason };
}

/** Deterministic final pose for migrations or mathematical checks. Runtime UI must
 * use advanceFollower so reaching this pose remains visibly finite-speed motion.
 */
export function settleFollower(diver, fishPosition) {
  const pose = validateDiverPose(diver), plan = planFollow(pose, fishPosition);
  return { pose: plan.status === 'blocked' ? pose : { position: [...plan.goal], heading: headingTo(plan.goal, plan.fish) }, plan };
}

export function fishCanPassDiver(from, to, diver) {
  const pose = validateDiverPose(diver), check = canMove(from, to);
  if (!check.valid) return check;
  const a = point(from), b = point(to);
  if (intersectsCircle(a, b, pose.position, FISH_RADIUS + DIVER_RADIUS))
    return { valid: false, reason: '鱼的路径穿过潜水员的身体保护范围' };
  return { valid: true, reason: '' };
}

export const canFishPastDiver = fishCanPassDiver;
