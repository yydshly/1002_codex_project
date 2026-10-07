export const VERSION = 1;
export const MAX_ITEMS = 16;
export const BOWL = Object.freeze({ innerRadius: .42, bottomY: .10, rimY: .38, dropPlaneY: .62 });
// Radius and mass describe this rigid-body demonstration, not measured food properties.
export const INGREDIENTS = Object.freeze([
  Object.freeze({ id: 'apple', name: '苹果', radius: .085, mass: .18 }),
  Object.freeze({ id: 'lemon', name: '柠檬', radius: .075, mass: .12 }),
  Object.freeze({ id: 'onion', name: '洋葱', radius: .080, mass: .15 }),
  Object.freeze({ id: 'avocado', name: '牛油果', radius: .085, mass: .17 }),
]);
export const TEMPLATES = Object.freeze(Object.fromEntries(INGREDIENTS.map(item => [item.id, item])));
export const VIEWS = {
  hero: { name: '餐桌总览', position: [1.2, 2.5, 2.3], target: [-.2, .18, 0] },
  top: { name: '碗中俯视', position: [.4, 3.2, .4], target: [-.2, .18, 0] },
  bowl: { name: '食材近景', position: [0, 1.2, 1.4], target: [0, .18, 0] },
};
export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ID_PATTERN = /^ingredient-([1-9]\d{0,5})$/;

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
}

function vector(value, length, message) {
  if (!Array.isArray(value) || value.length !== length || Reflect.ownKeys(value).length !== length + 1 ||
      !Array.from({ length }, (_, i) => i).every(i => Object.hasOwn(value, i) && finite(value[i]))) throw new Error(message);
}

function template(id) {
  if (typeof id !== 'string' || !Object.hasOwn(TEMPLATES, id)) throw new Error('食材模板编号无效');
  return TEMPLATES[id];
}

function instanceNumber(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('食材实例编号无效');
  return Number(ID_PATTERN.exec(id)[1]);
}

function quaternion(value) {
  vector(value, 4, '食材旋转参数无效');
  if (Math.abs(Math.hypot(...value) - 1) > 1e-5) throw new Error('食材四元数必须为单位长度');
}

function settledPose(value, radius) {
  exactKeys(value, ['position', 'quaternion'], '食材姿态结构无效');
  vector(value.position, 3, '食材位置参数无效');
  quaternion(value.quaternion);
  const [x, y, z] = value.position;
  if (Math.hypot(x, z) + radius > .43 + 1e-9 || y < BOWL.bottomY + radius - .012 - 1e-9 || y > .70 + 1e-9) {
    throw new Error('食材姿态超出碗内保存范围');
  }
  return { position: [...value.position], quaternion: [...value.quaternion] };
}

export function cameraForView(id) {
  if (!Object.hasOwn(VIEWS, id)) throw new Error('此视角没有预设相机');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

function validateCamera(camera) {
  exactKeys(camera, ['position', 'target'], '餐桌相机结构无效');
  vector(camera.position, 3, '餐桌相机参数无效');
  vector(camera.target, 3, '餐桌相机参数无效');
  const [px, py, pz] = camera.position, [tx, ty, tz] = camera.target;
  if (Math.abs(px) > 6 || Math.abs(pz) > 6 || py < .2 || py > 5 ||
      Math.abs(tx) > 1.5 || Math.abs(tz) > 1.5 || ty < .05 || ty > 1.2) throw new Error('相机超出餐桌展示范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < .65 - 1e-6 || distance > 6 + 1e-6) throw new Error('餐桌相机距离无效');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .1 - 1e-6 || polar > .48 * Math.PI + 1e-6) throw new Error('餐桌相机角度无效');
  return { position: [...camera.position], target: [...camera.target] };
}

export function initialState() {
  return {
    version: VERSION, nextId: 5,
    items: [
      { id: 'ingredient-1', templateId: 'lemon', position: [-.16, .175, 0], quaternion: [0, 0, 0, 1] },
      { id: 'ingredient-2', templateId: 'apple', position: [.11, .185, -.13], quaternion: [0, 0, 0, 1] },
      { id: 'ingredient-3', templateId: 'avocado', position: [.12, .185, .12], quaternion: [0, 0, 0, 1] },
      { id: 'ingredient-4', templateId: 'onion', position: [-.10, .18, -.20], quaternion: [0, 0, 0, 1] },
    ],
    camera: cameraForView('hero'), view: 'hero',
  };
}

/** This checks the registered envelopes and file structure; contact solving belongs to the runtime. */
export function validateState(value) {
  exactKeys(value, ['version', 'nextId', 'items', 'camera', 'view'], '料理工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的料理工作区文件版本');
  if (!Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId > 1_000_000) throw new Error('下一个食材编号无效');
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS ||
      Reflect.ownKeys(value.items).length !== value.items.length + 1) throw new Error('食材清单最多支持 16 件');
  const ids = new Set();
  const items = Array.from(value.items, item => {
    exactKeys(item, ['id', 'templateId', 'position', 'quaternion'], '食材记录结构无效');
    const number = instanceNumber(item.id), registered = template(item.templateId);
    if (ids.has(item.id) || number >= value.nextId) throw new Error('食材实例编号重复或下一个编号过小');
    ids.add(item.id);
    const pose = settledPose({ position: item.position, quaternion: item.quaternion }, registered.radius);
    return { id: item.id, templateId: item.templateId, ...pose };
  });
  if (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view)) throw new Error('餐桌视角编号无效');
  return { version: VERSION, nextId: value.nextId, items, camera: validateCamera(value.camera), view: value.view };
}

/** The drop test uses the tighter opening radius, without the settled solver tolerance. */
export function canDrop(templateId, point) {
  const registered = template(templateId);
  vector(point, 3, '投放位置参数无效');
  return Math.hypot(point[0], point[2]) + registered.radius <= BOWL.innerRadius + 1e-9;
}

export function makeItem(state, templateId, pose) {
  const workspace = validateState(state), registered = template(templateId);
  if (workspace.items.length >= MAX_ITEMS) throw new Error('碗中最多支持 16 件食材');
  if (workspace.nextId >= 1_000_000) throw new Error('食材编号已达到上限');
  return { id: `ingredient-${workspace.nextId}`, templateId, ...settledPose(pose, registered.radius) };
}

export function addItem(state, templateId, pose) {
  const item = makeItem(state, templateId, pose), next = validateState(state);
  next.items.push(item);
  next.nextId++;
  return validateState(next);
}

export function removeItem(state, id) {
  const next = validateState(state);
  if (!next.items.some(item => item.id === id)) throw new Error('食材实例不存在');
  next.items = next.items.filter(item => item.id !== id);
  return next;
}

/** An inspection session is separate from persistence. Its entire upward sphere sweep must be clear. */
export function beginInspection(state, id) {
  const workspace = validateState(state), item = workspace.items.find(item => item.id === id);
  if (!item) throw new Error('食材实例不存在');
  const radius = template(item.templateId).radius, targetY = .85;
  const [x, y, z] = item.position;
  for (const other of workspace.items) {
    // Below or level with the selected centre, a stationary neighbour only gets farther away.
    if (other.id === id || other.position[1] <= y) continue;
    const nearestY = Math.max(y, Math.min(targetY, other.position[1]));
    const distance = Math.hypot(x - other.position[0], nearestY - other.position[1], z - other.position[2]);
    if (distance < radius + template(other.templateId).radius - 1e-6) throw new Error('上方食材阻挡，无法浮起观察');
  }
  return {
    itemID: id, radius,
    originalPose: { position: [...item.position], quaternion: [...item.quaternion] }, targetY,
  };
}

export function inspectionPose(session, progress) {
  exactKeys(session, ['itemID', 'radius', 'originalPose', 'targetY'], '浮起观察会话无效');
  instanceNumber(session.itemID);
  if (!INGREDIENTS.some(item => item.radius === session.radius) || session.targetY !== .85) throw new Error('浮起观察包络无效');
  const original = settledPose(session.originalPose, session.radius);
  if (!finite(progress) || progress < 0 || progress > 1) throw new Error('浮起观察进度无效');
  const eased = progress * progress * (3 - 2 * progress);
  original.position[1] = progress === 1 ? session.targetY :
    Math.min(session.targetY, original.position[1] + (session.targetY - original.position[1]) * eased);
  return original;
}

export class History {
  constructor(state = initialState(), limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('历史记录上限无效');
    this.limit = limit;
    this.current = validateState(state);
    this.past = [];
    this.future = [];
    this.pending = null;
  }
  begin(label = '编辑料理工作区') {
    if (this.pending) return false;
    this.pending = { label: String(label), state: validateState(this.current) };
    return true;
  }
  commit() {
    if (!this.pending) return false;
    let next;
    try { next = validateState(this.current); }
    catch (error) { this.cancel(); throw error; }
    const item = this.pending;
    this.pending = null;
    this.current = next;
    if (same(item.state, next)) return false;
    this.past.push(item);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }
  cancel() {
    if (!this.pending) return false;
    this.current = this.pending.state;
    this.pending = null;
    return true;
  }
  edit(label, fn) {
    if (this.pending) throw new Error('请先完成当前拖放');
    if (typeof fn !== 'function') throw new Error('编辑操作无效');
    this.begin(label);
    try {
      const next = fn(this.current);
      if (next !== undefined) this.current = next;
      return this.commit();
    } catch (error) { this.cancel(); throw error; }
  }
  run(label, fn) { return this.edit(label, fn); }
  undo() {
    this.cancel();
    if (!this.past.length) return false;
    const next = validateState(this.current), item = this.past.pop();
    this.future.push({ label: item.label, state: next });
    this.current = item.state;
    return true;
  }
  redo() {
    this.cancel();
    if (!this.future.length) return false;
    const next = validateState(this.current), item = this.future.pop();
    this.past.push({ label: item.label, state: next });
    this.current = item.state;
    return true;
  }
  replace(state) {
    const next = validateState(state);
    this.current = next;
    this.past = [];
    this.future = [];
    this.pending = null;
  }
}
