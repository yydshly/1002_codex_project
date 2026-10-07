export const VERSION = 2;
export const AVATAR_ID = 'atelier-mannequin-v1';
export const MAX_FILE_BYTES = 32 * 1024;
export const MAX_HISTORY = 40;

const entry = value => Object.freeze(value);
export const GARMENTS = Object.freeze([
  entry({ id: 'tee-01', name: 'Core 短袖上衣', description: '为当前虚拟人体预适配的完整短袖上衣。' }),
  entry({ id: 'jacket-01', name: 'Field 轻夹克', description: '为当前虚拟人体预适配的完整长袖夹克。' }),
]);
export const SHOES = Object.freeze([
  entry({ id: 'court-01', name: 'Court 低帮鞋', description: '为当前虚拟人体双脚预适配的完整成对低帮鞋。' }),
  entry({ id: 'boot-01', name: 'Ridge 短靴', description: '为当前虚拟人体双脚预适配的完整成对短靴。' }),
]);
export const COLORS = Object.freeze([
  entry({ id: 'ivory', name: '暖白', color: '#e7e2d5' }),
  entry({ id: 'moss', name: '苔绿', color: '#677565' }),
  entry({ id: 'ink', name: '墨蓝', color: '#273747' }),
]);
export const POSES = Object.freeze([
  entry({ id: 'neutral', name: '自然站姿' }),
  entry({ id: 'reach', name: '抬臂检查' }),
]);
const view = (name, position, target) => entry({ name, position: Object.freeze(position), target: Object.freeze(target) });
const LEGACY_VIEWS = Object.freeze({
  hero: view('试衣间总览', [3.1, 1.85, 5.6], [0, .95, 0]),
  front: view('正面检查', [0, 1.3, 5.1], [0, .95, 0]),
  back: view('背面检查', [0, 1.3, -5.1], [0, .95, 0]),
  detail: view('上身细节', [1.9, 1.75, 2.75], [0, 1.35, 0]),
});
export const VIEWS = Object.freeze({
  ...LEGACY_VIEWS,
  'shoe-detail': view('鞋脚细节', [1.05, .50, 1.65], [0, .2, .05]),
});
export const CAMERA_LIMITS = entry({
  minDistance: .75, maxDistance: 9, minPolar: .10, maxPolar: Math.PI / 2 + .08,
  maxPositionXZ: 12, minPositionY: .15, maxPositionY: 7,
  maxTargetXZ: 1.2, minTargetY: .2, maxTargetY: 1.8,
});

export const clone = value => structuredClone(value);
const bytes = value => new TextEncoder().encode(value).byteLength;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = value => typeof value === 'number' && Number.isFinite(value);

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(message);
  }
}

function vector(value) {
  const message = '试衣间相机坐标必须为三个有限数值';
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 3 ||
      Reflect.ownKeys(value).length !== 4) throw new Error(message);
  const result = [];
  for (let i = 0; i < 3; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable || !finite(descriptor.value))
      throw new Error(message);
    result.push(descriptor.value === 0 ? 0 : descriptor.value);
  }
  return result;
}

function garmentId(value) {
  if (typeof value !== 'string' || !GARMENTS.some(item => item.id === value)) throw new Error('衣服编号未登记');
  return value;
}
function shoeId(value) {
  if (typeof value !== 'string' || !SHOES.some(item => item.id === value)) throw new Error('成对鞋履编号未登记');
  return value;
}
function colorId(value, message = '衣服面料颜色未登记') {
  if (typeof value !== 'string' || !COLORS.some(item => item.id === value)) throw new Error(message);
  return value;
}
function poseId(value) {
  if (typeof value !== 'string' || !POSES.some(item => item.id === value)) throw new Error('人体检查姿态未登记');
  return value;
}

export function cameraForView(id) {
  if (typeof id !== 'string' || !Object.hasOwn(VIEWS, id)) throw new Error('试衣间观察方向未登记');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

export function validateCamera(value) {
  exactKeys(value, ['position', 'target'], '试衣间相机结构无效');
  const position = vector(value.position), target = vector(value.target);
  const [px, py, pz] = position, [tx, ty, tz] = target, limits = CAMERA_LIMITS;
  if (Math.abs(px) > limits.maxPositionXZ || Math.abs(pz) > limits.maxPositionXZ ||
      py < limits.minPositionY || py > limits.maxPositionY || Math.abs(tx) > limits.maxTargetXZ ||
      Math.abs(tz) > limits.maxTargetXZ || ty < limits.minTargetY || ty > limits.maxTargetY)
    throw new Error('相机超出试衣间观察范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < limits.minDistance - 1e-9 || distance > limits.maxDistance + 1e-9)
    throw new Error('试衣间相机距离无效');
  const polar = Math.acos(Math.max(-1, Math.min(1, (py - ty) / distance)));
  if (polar < limits.minPolar - 1e-9 || polar > limits.maxPolar + 1e-9)
    throw new Error('相机角度超出试衣间观察范围');
  return { position, target };
}

export function initialState() {
  return { version: VERSION, avatarId: AVATAR_ID, garment: null, shoes: null, pose: 'neutral',
    view: 'hero', camera: cameraForView('hero') };
}

function validateInspection(value, registeredViews) {
  if (value.avatarId !== AVATAR_ID) throw new Error('虚拟人体编号未登记');
  let garment = null;
  if (value.garment !== null) {
    exactKeys(value.garment, ['id', 'color'], '单件上装结构无效');
    garment = { id: garmentId(value.garment.id), color: colorId(value.garment.color) };
  }
  const pose = poseId(value.pose);
  if (typeof value.view !== 'string' || (value.view !== 'custom' && !Object.hasOwn(registeredViews, value.view)))
    throw new Error('试衣间观察方向未登记');
  const camera = validateCamera(value.camera);
  if (value.view !== 'custom' && !same(camera, cameraForView(value.view)))
    throw new Error('注册观察方向与相机坐标不一致，请将自由相机标为 custom');
  return { avatarId: AVATAR_ID, garment, pose, view: value.view, camera };
}

/** Upper garments and complete shoe pairs occupy independent registered slots.
 * Both share the fixed body, frozen pose and atomic workspace. No size, gait,
 * individual-foot combination, cloth simulation or shopping data is stored.
 */
export function validateState(value) {
  exactKeys(value, ['version', 'avatarId', 'garment', 'shoes', 'pose', 'view', 'camera'], '试衣间工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的试衣间文件版本');
  const inspected = validateInspection(value, VIEWS);
  let shoes = null;
  if (value.shoes !== null) {
    exactKeys(value.shoes, ['id', 'color'], '成对鞋履结构无效');
    shoes = { id: shoeId(value.shoes.id), color: colorId(value.shoes.color, '鞋履面料颜色未登记') };
  }
  return { version: VERSION, avatarId: inspected.avatarId, garment: inspected.garment, shoes,
    pose: inspected.pose, view: inspected.view, camera: inspected.camera };
}

/** A legacy file has neither a shoe slot nor the new foot-detail preset.
 * Validate the exact old format before adding only v2 and an empty shoe slot.
 * Existing garment, frozen pose and finite-precision camera are retained.
 */
function migrateV1(value) {
  exactKeys(value, ['version', 'avatarId', 'garment', 'pose', 'view', 'camera'], '旧版试衣间工作区文件结构无效');
  if (value.version !== 1) throw new Error('不支持的旧版试衣间文件版本');
  const inspected = validateInspection(value, LEGACY_VIEWS);
  return validateState({ version: VERSION, ...inspected, shoes: null });
}

export function serializeState(state) { return JSON.stringify(validateState(state)); }
export function parseState(text) {
  if (typeof text !== 'string' || bytes(text) > MAX_FILE_BYTES) throw new Error('试衣间工作区文件最多支持 32 KiB');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('试衣间工作区 JSON 无法解析'); }
  if (value && value.version === 1) return migrateV1(value);
  return validateState(value);
}

/** Legal pointer release is decided by the renderer's actual upper-body hit.
 * Calling this function replaces the single slot, retaining body pose and camera.
 */
export function wearGarment(state, id, color = 'ivory') {
  const next = validateState(state); next.garment = { id: garmentId(id), color: colorId(color) }; return next;
}
export function removeGarment(state) {
  const next = validateState(state); next.garment = null; return next;
}
export function setColor(state, color) {
  const next = validateState(state); colorId(color);
  if (!next.garment) throw new Error('请先穿上一件上装，再更换面料颜色');
  next.garment.color = color; return next;
}
/** The renderer verifies an actual registered foot-region drop. One semantic
 * shoe ID replaces both authored shoes together and never changes the upper slot.
 */
export function wearShoes(state, id, color = 'ivory') {
  const next = validateState(state); next.shoes = { id: shoeId(id), color: colorId(color, '鞋履面料颜色未登记') }; return next;
}
export function removeShoes(state) {
  const next = validateState(state); next.shoes = null; return next;
}
export function setShoeColor(state, color) {
  const next = validateState(state); colorId(color, '鞋履面料颜色未登记');
  if (!next.shoes) throw new Error('请先穿上一双鞋，再更换鞋履面料颜色');
  next.shoes.color = color; return next;
}
export function setPose(state, pose) {
  const next = validateState(state); next.pose = poseId(pose); return next;
}
export function setView(state, id) {
  const next = validateState(state); next.camera = cameraForView(id); next.view = id; return next;
}
export function setCamera(state, camera) {
  const next = validateState(state); next.camera = validateCamera(camera); next.view = 'custom'; return next;
}
export function resetState(state = initialState()) {
  validateState(state); return initialState();
}

/** All garment, pose and camera changes are atomic. Cancelling an in-flight
 * gesture restores its entire baseline before earlier undo/redo is considered.
 */
export class History {
  constructor(state = initialState(), limit = MAX_HISTORY) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY) throw new Error('试衣历史上限必须为 1 至 40');
    this.limit = limit; this.current = validateState(state); this.past = []; this.future = []; this.pending = null;
  }
  get state() { return this.current; }
  set state(value) { this.current = value; }
  get canUndo() { return !!this.pending || this.past.length > 0; }
  get canRedo() { return !!this.pending || this.future.length > 0; }
  begin(label = '拖动衣服到人体上身') {
    if (this.pending) return false;
    if (typeof label !== 'string' || label.length > 120) throw new Error('试衣历史说明无效');
    this.pending = { label, state: validateState(this.current) }; return true;
  }
  commit() {
    if (!this.pending) return false;
    let next;
    try { next = validateState(this.current); } catch (error) { this.cancel(); throw error; }
    const item = this.pending; this.pending = null; this.current = next;
    if (same(item.state, next)) return false;
    this.past.push(item); if (this.past.length > this.limit) this.past.shift(); this.future = []; return true;
  }
  cancel() {
    if (!this.pending) return false;
    this.current = this.pending.state; this.pending = null; return true;
  }
  edit(label, fn) {
    if (this.pending) throw new Error('请先完成当前试衣操作');
    if (typeof fn !== 'function') throw new Error('试衣编辑操作无效');
    this.begin(label);
    try { const next = fn(this.current); if (next !== undefined) this.current = next; return this.commit(); }
    catch (error) { this.cancel(); throw error; }
  }
  run(label, fn) { return this.edit(label, fn); }
  undo() {
    if (this.pending) return this.cancel();
    if (!this.past.length) return false;
    const next = validateState(this.current), item = this.past.pop();
    this.future.push({ label: item.label, state: next }); this.current = item.state; return true;
  }
  redo() {
    if (this.pending) return this.cancel();
    if (!this.future.length) return false;
    const next = validateState(this.current), item = this.future.pop();
    this.past.push({ label: item.label, state: next }); this.current = item.state; return true;
  }
  replace(state) {
    const next = validateState(state); this.current = next; this.past = []; this.future = []; this.pending = null;
  }
}
