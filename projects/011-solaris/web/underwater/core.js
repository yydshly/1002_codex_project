export const VERSION = 1;
export const MAX_RECORDS = 40;
export const MAX_PATH_POINTS = 64;
export const MAX_FILE_BYTES = 64 * 1024;
export const FISH_RADIUS = .30;
export const SWIM_Y = .95;
export const WATER_BOUNDS = Object.freeze({ minX: -2.65, maxX: 2.65, minZ: -1.75, maxZ: 1.75 });
export const CENTER_BOUNDS = Object.freeze({
  minX: WATER_BOUNDS.minX + FISH_RADIUS, maxX: WATER_BOUNDS.maxX - FISH_RADIUS,
  minZ: WATER_BOUNDS.minZ + FISH_RADIUS, maxZ: WATER_BOUNDS.maxZ - FISH_RADIUS,
});
export const INITIAL_FISH = Object.freeze({ position: Object.freeze([-1.85, .9]), heading: 0 });
export const REEFS = Object.freeze([
  Object.freeze({ id: 'west', position: Object.freeze([-.8, -.45]), radius: .42 }),
  Object.freeze({ id: 'center', position: Object.freeze([.85, .65]), radius: .40 }),
  Object.freeze({ id: 'east', position: Object.freeze([1.55, -.7]), radius: .35 }),
]);
const view = (name, position, target) => Object.freeze({ name, position: Object.freeze(position), target: Object.freeze(target) });
export const VIEWS = Object.freeze({
  hero: view('水下总览', [5, 4.2, 6.2], [0, .65, 0]),
  top: view('俯视拖动', [0, 6.8, .1], [0, .6, 0]),
  front: view('水下观察', [0, 2.4, 6.6], [0, .65, 0]),
});

export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const bytes = value => new TextEncoder().encode(value).byteLength;

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

function denseArray(value, maximum, message) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum ||
      Reflect.ownKeys(value).length !== value.length + 1) throw new Error(message);
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(message);
    result.push(descriptor.value);
  }
  return result;
}

function vector(value, length, message) {
  const result = denseArray(value, length, message);
  if (result.length !== length || !result.every(finite)) throw new Error(message);
  return result.map(number => Object.is(number, -0) ? 0 : number);
}

/** A sphere envelope is conservative for every fish orientation. The only obstacles are
 *  these registered circles extended through the fixed swim layer; no path is rerouted.
 */
export function canMove(from, to) {
  let start, end;
  try { start = vector(from, 2, '鱼的起点必须为两个有限坐标'); end = vector(to, 2, '鱼的落点必须为两个有限坐标'); }
  catch (error) { return { valid: false, reason: error.message }; }
  const { minX, maxX, minZ, maxZ } = CENTER_BOUNDS;
  for (const point of [start, end]) {
    if (point[0] < minX || point[0] > maxX || point[1] < minZ || point[1] > maxZ) {
      return { valid: false, reason: '鱼体超出可拖动水域' };
    }
  }
  const dx = end[0] - start[0], dz = end[1] - start[1], lengthSquared = dx * dx + dz * dz;
  for (const reef of REEFS) {
    const [rx, rz] = reef.position;
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((rx - start[0]) * dx + (rz - start[1]) * dz) / lengthSquared));
    const nearestX = start[0] + projection * dx, nearestZ = start[1] + projection * dz;
    const distanceSquared = (nearestX - rx) ** 2 + (nearestZ - rz) ** 2;
    if (distanceSquared < (reef.radius + FISH_RADIUS) ** 2 - 1e-12) {
      return { valid: false, reason: '路径穿过礁石的鱼体保护范围', reef: reef.id };
    }
  }
  return { valid: true, reason: '' };
}

function validPoint(value) {
  const point = vector(value, 2, '鱼的位置参数无效');
  const check = canMove(point, point);
  if (!check.valid) throw new Error(check.reason);
  return point;
}

function dragPath(value) {
  const points = denseArray(value, MAX_PATH_POINTS, '每次拖动路径须包含 2 至 64 个采样点').map(validPoint);
  if (points.length < 2) throw new Error('每次拖动路径须包含 2 至 64 个采样点');
  const path = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const check = canMove(points[i - 1], points[i]);
    if (!check.valid) throw new Error(check.reason);
    if (!samePoint(path.at(-1), points[i])) path.push(points[i]);
  }
  return path;
}

/** The model is built facing +X; Three.js positive Y rotation maps +X toward -Z. */
function endHeading(path) {
  const last = path.at(-1), previous = path.at(-2);
  const heading = Math.atan2(-(last[1] - previous[1]), last[0] - previous[0]);
  return heading === 0 ? 0 : heading;
}

export function cameraForView(id) {
  if (typeof id !== 'string' || !Object.hasOwn(VIEWS, id)) throw new Error('水下观察方向无效');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

export function validateCamera(value) {
  exactKeys(value, ['position', 'target'], '水下相机结构无效');
  const position = vector(value.position, 3, '水下相机参数无效'), target = vector(value.target, 3, '水下相机参数无效');
  const [px, py, pz] = position, [tx, ty, tz] = target;
  if (Math.abs(px) > 12 || Math.abs(pz) > 12 || py < .5 || py > 10 ||
      Math.abs(tx) > 2.9 || Math.abs(tz) > 2 || ty < 0 || ty > 2) throw new Error('相机超出水下展示范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < 3 - 1e-6 || distance > 12 + 1e-6) throw new Error('水下相机距离无效');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .01 - 1e-6 || polar > .47 * Math.PI + 1e-6) throw new Error('水下相机角度无效');
  return { position, target };
}

export function initialState() {
  return { version: VERSION, view: 'hero', camera: cameraForView('hero'),
    fish: { position: [...INITIAL_FISH.position], heading: INITIAL_FISH.heading }, records: [], nextId: 1 };
}

export function validateState(value) {
  exactKeys(value, ['version', 'view', 'camera', 'fish', 'records', 'nextId'], '水下工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的水下工作区文件版本');
  if (typeof value.view !== 'string' || (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view))) throw new Error('水下观察方向无效');
  if (!Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId > 1_000_000) throw new Error('下一个拖动记录编号无效');
  exactKeys(value.fish, ['position', 'heading'], '鱼的状态结构无效');
  const position = validPoint(value.fish.position), heading = value.fish.heading === 0 ? 0 : value.fish.heading;
  if (!finite(heading) || heading < -Math.PI || heading > Math.PI) throw new Error('鱼的方向参数无效');
  let previousId = 0, previousPosition = INITIAL_FISH.position, expectedHeading = INITIAL_FISH.heading;
  const records = denseArray(value.records, MAX_RECORDS, '拖动记录最多支持 40 条').map(item => {
    exactKeys(item, ['id', 'path'], '拖动记录结构无效');
    if (!Number.isSafeInteger(item.id) || item.id <= previousId || item.id >= value.nextId || item.id >= 1_000_000) throw new Error('拖动记录编号重复、顺序错误或下一个编号过小');
    const path = dragPath(item.path);
    if (path.length < 2 || samePoint(path[0], path.at(-1))) throw new Error('拖动记录必须改变最终位置');
    if (!samePoint(path[0], previousPosition)) throw new Error('拖动记录的起点与上一条落点不一致');
    previousId = item.id; previousPosition = path.at(-1); expectedHeading = endHeading(path);
    return { id: item.id, path };
  });
  // Math.atan2 may differ by a few ULPs between JavaScript engines. Preserve the supplied
  // heading exactly, allowing only a negligible angular difference from the recorded path.
  if (!samePoint(position, previousPosition) || Math.abs(heading - expectedHeading) > 1e-12) throw new Error('鱼的落点或方向与完整拖动记录不一致');
  const result = { version: VERSION, view: value.view, camera: validateCamera(value.camera), fish: { position, heading }, records, nextId: value.nextId };
  if (bytes(JSON.stringify(result)) > MAX_FILE_BYTES) throw new Error('水下工作区文件最多支持 64 KiB');
  return result;
}

export function appendDrag(state, points) {
  const next = validateState(state), path = dragPath(points);
  if (!samePoint(path[0], next.fish.position)) throw new Error('拖动起点必须是鱼的当前位置');
  if (path.length < 2 || samePoint(path[0], path.at(-1))) return next;
  if (next.records.length >= MAX_RECORDS) throw new Error('拖动记录已满 40 条，请重置后继续');
  if (next.nextId >= 1_000_000) throw new Error('拖动记录编号已达到上限');
  next.records.push({ id: next.nextId, path }); next.nextId++;
  next.fish = { position: [...path.at(-1)], heading: endHeading(path) };
  return validateState(next);
}

export function resetFish(state) {
  const next = validateState(state);
  next.fish = { position: [...INITIAL_FISH.position], heading: INITIAL_FISH.heading }; next.records = [];
  return next;
}

export function setView(state, id) {
  const next = validateState(state); next.view = id; next.camera = cameraForView(id); return next;
}

export function setCamera(state, camera) {
  const next = validateState(state); next.camera = validateCamera(camera); next.view = 'custom'; return next;
}

export function serializeState(state) { return JSON.stringify(validateState(state)); }

export function parseState(text) {
  if (typeof text !== 'string' || bytes(text) > MAX_FILE_BYTES) throw new Error('水下工作区文件最多支持 64 KiB');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('水下工作区 JSON 无法解析'); }
  return validateState(value);
}

export class History {
  constructor(state = initialState(), limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('历史记录上限必须为 1 至 40');
    this.limit = limit; this.current = validateState(state); this.past = []; this.future = []; this.pending = null;
  }
  get state() { return this.current; }
  set state(value) { this.current = value; }
  get canUndo() { return !!this.pending || this.past.length > 0; }
  get canRedo() { return !!this.pending || this.future.length > 0; }
  begin(label = '拖动水下鱼') {
    if (this.pending) return false;
    if (typeof label !== 'string' || label.length > 120) throw new Error('历史记录说明无效');
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
    if (this.pending) throw new Error('请先完成当前拖动');
    if (typeof fn !== 'function') throw new Error('编辑操作无效');
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
