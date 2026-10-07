import { World, Body, Sphere, Plane, Cylinder, Box, Vec3, Quaternion, Material, ContactMaterial } from './vendor/cannon-es.js';
import { TEMPLATES, BOWL, MAX_ITEMS } from './core.js';

export const PHYSICS_LIMITS = Object.freeze({ fixedStep: 1 / 120, maxFrameDelta: .05, maxSubSteps: 6, solverIterations: 60, linearQuietSpeed: .025, angularQuietSpeed: .12, quietSeconds: .25, maxSimulationSeconds: 8, wallSegments: 48, savedOpeningRadius: .43, floorTolerance: .012, pairTolerance: .008 });
const clone = value => structuredClone(value);
const itemKeys = ['id', 'templateId', 'position', 'quaternion'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const EPSILON = 1e-10;

function validateItems(items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS || Reflect.ownKeys(items).length !== items.length + 1) throw new Error('物理食材清单最多支持 16 件');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item)) ||
        Reflect.ownKeys(item).length !== itemKeys.length || Reflect.ownKeys(item).some(key => !itemKeys.includes(key))) throw new Error('物理食材记录结构无效');
    if (typeof item.id !== 'string' || !/^ingredient-[1-9]\d{0,5}$/.test(item.id) || ids.has(item.id)) throw new Error('物理食材实例编号无效或重复');
    ids.add(item.id);
    if (typeof item.templateId !== 'string' || !Object.hasOwn(TEMPLATES, item.templateId)) throw new Error('物理食材模板未登记');
    for (const [value, length] of [[item.position, 3], [item.quaternion, 4]]) {
      if (!Array.isArray(value) || value.length !== length || Reflect.ownKeys(value).length !== length + 1 ||
          !Array.from({ length }, (_, index) => index).every(index => Object.hasOwn(value, index) && finite(value[index]))) throw new Error('物理食材姿态必须使用有限数值');
    }
    if (Math.abs(Math.hypot(...item.quaternion) - 1) > 1e-5) throw new Error('物理食材旋转必须为单位四元数');
    // Bound transient input before passing it to the solver. Final bowl constraints
    // are checked separately, so a real failed drop is never silently relocated.
    if (Math.abs(item.position[0]) > 2 || Math.abs(item.position[2]) > 2 || item.position[1] < 0 || item.position[1] > 1.2) throw new Error('物理投放位置超出工作台范围');
  }
  return clone(items);
}

function snapshotFailure(items) {
  for (const item of items) {
    const radius = TEMPLATES[item.templateId].radius, [x, y, z] = item.position;
    if (![x, y, z, ...item.quaternion].every(Number.isFinite) || Math.abs(Math.hypot(...item.quaternion) - 1) > 1e-5) return '食材姿态求解失败，请重新投放';
    if (Math.hypot(x, z) + radius > PHYSICS_LIMITS.savedOpeningRadius + EPSILON) return '食材落在碗外或越过碗壁，请选择碗内落点';
    if (y < BOWL.bottomY + radius - PHYSICS_LIMITS.floorTolerance - EPSILON || y > .70 + EPSILON) return '食材未被碗底可靠支撑或堆叠过高，请减少数量';
  }
  for (let first = 0; first < items.length; first++) for (let second = first + 1; second < items.length; second++) {
    const a = items[first], b = items[second];
    const separation = Math.hypot(...a.position.map((value, axis) => value - b.position[axis]));
    if (TEMPLATES[a.templateId].radius + TEMPLATES[b.templateId].radius - separation > PHYSICS_LIMITS.pairTolerance + EPSILON) return '食材碰撞尚有明显穿透，请减少数量或更换落点';
  }
  return null;
}

function makeWorld(items) {
  const world = new World({ gravity: new Vec3(0, -9.82, 0), allowSleep: false, quatNormalizeSkip: 0, quatNormalizeFast: false });
  // A fruit supported by several neighbours needs enough iterations for their
  // coupled contacts to converge; otherwise small repeated impulses prevent rest.
  world.solver.iterations = PHYSICS_LIMITS.solverIterations;
  world.solver.tolerance = 1e-8;
  const contactMaterial = new Material('kitchen-rigid-envelope');
  world.addContactMaterial(new ContactMaterial(contactMaterial, contactMaterial, { friction: .55, restitution: .025, contactEquationStiffness: 1e8, contactEquationRelaxation: 3, frictionEquationStiffness: 1e8, frictionEquationRelaxation: 3 }));
  const desk = new Body({ mass: 0, material: contactMaterial });
  desk.addShape(new Plane());
  desk.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(desk);
  const baseThickness = .06;
  const base = new Body({ mass: 0, material: contactMaterial, position: new Vec3(0, BOWL.bottomY - baseThickness / 2, 0) });
  // cannon-es Cylinder's longitudinal axis is Y. Do not rotate it as a Z-axis cylinder.
  base.addShape(new Cylinder(BOWL.innerRadius + .025, BOWL.innerRadius + .025, baseThickness, 64));
  world.addBody(base);
  const thickness = .03, height = BOWL.rimY - BOWL.bottomY;
  const segments = PHYSICS_LIMITS.wallSegments;
  const tangentHalfLength = (BOWL.innerRadius + thickness) * Math.tan(Math.PI / segments) + .002;
  for (let index = 0; index < segments; index++) {
    const angle = index * Math.PI * 2 / segments, radius = BOWL.innerRadius + thickness / 2;
    const wall = new Body({ mass: 0, material: contactMaterial, position: new Vec3(Math.cos(angle) * radius, BOWL.bottomY + height / 2, Math.sin(angle) * radius) });
    wall.addShape(new Box(new Vec3(thickness / 2, height / 2, tangentHalfLength)));
    wall.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), -angle);
    world.addBody(wall);
  }
  const bodies = items.map(item => {
    const template = TEMPLATES[item.templateId];
    const body = new Body({ mass: template.mass, material: contactMaterial, shape: new Sphere(template.radius), position: new Vec3(...item.position), quaternion: new Quaternion(...item.quaternion), linearDamping: .65, angularDamping: .9, allowSleep: false });
    world.addBody(body);
    return body;
  });
  return { world, bodies };
}

/** Local rigid envelopes; original scanned render meshes are never modified. */
export function createKitchenPhysics() {
  let current = [], world = null, bodies = [], active = false, failure = null, accumulator = 0, elapsed = 0, quietFor = 0;
  function liveItems() {
    return current.map((item, index) => {
      const body = bodies[index];
      // Reading a render snapshot must not alter the solver at a frame-dependent
      // frequency. Normalize a copy, while World handles body normalization per step.
      const quaternion = body.quaternion.clone(); quaternion.normalize();
      return { id: item.id, templateId: item.templateId, position: [body.position.x, body.position.y, body.position.z], quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] };
    });
  }
  function freeze(problem = null) {
    current = liveItems();
    failure = problem || snapshotFailure(current);
    active = false; accumulator = 0;
    for (const body of bodies) { body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0); body.sleep(); }
  }
  function replace(items, run) {
    const next = validateItems(items);
    if (!run) { const problem = snapshotFailure(next); if (problem) throw new Error(problem); }
    const prepared = makeWorld(next);
    current = next; world = prepared.world; bodies = prepared.bodies;
    failure = null; accumulator = 0; elapsed = 0; quietFor = 0;
    active = run && next.length > 0;
    return clone(current);
  }
  return {
    get active() { return active; },
    reset(items) { return replace(items, false); },
    start(items) { return replace(items, true); },
    step(deltaSeconds) {
      if (!finite(deltaSeconds) || deltaSeconds < 0) throw new Error('物理帧时长必须是非负有限数值');
      if (!active) return { active: false, items: clone(current), failure };
      accumulator = Math.min(PHYSICS_LIMITS.maxFrameDelta, accumulator + Math.min(deltaSeconds, PHYSICS_LIMITS.maxFrameDelta));
      let subSteps = 0;
      while (active && accumulator + EPSILON >= PHYSICS_LIMITS.fixedStep && subSteps < PHYSICS_LIMITS.maxSubSteps) {
        world.step(PHYSICS_LIMITS.fixedStep);
        accumulator = Math.max(0, accumulator - PHYSICS_LIMITS.fixedStep); subSteps++;
        elapsed += PHYSICS_LIMITS.fixedStep;
        if (bodies.some(body => ![body.position.x, body.position.y, body.position.z, body.velocity.x, body.velocity.y, body.velocity.z, body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z].every(Number.isFinite))) {
          freeze('食材物理求解产生无效数值，请重新投放'); break;
        }
        const quiet = bodies.every(body => body.velocity.length() <= PHYSICS_LIMITS.linearQuietSpeed && body.angularVelocity.length() <= PHYSICS_LIMITS.angularQuietSpeed);
        quietFor = quiet ? quietFor + PHYSICS_LIMITS.fixedStep : 0;
        if (quietFor + EPSILON >= PHYSICS_LIMITS.quietSeconds) freeze();
        else if (elapsed + EPSILON >= PHYSICS_LIMITS.maxSimulationSeconds) freeze('食材未能稳定，请减少数量或更换落点');
      }
      return { active, items: active ? liveItems() : clone(current), failure };
    },
    snapshot() {
      if (active) throw new Error('食材正在下落，稳定后才能保存');
      const problem = failure || snapshotFailure(current);
      if (problem) throw new Error(problem);
      return clone(current);
    }
  };
}
