export const VERSION = 1;
export const POWER_W = 10;
export const MAX_RECORDS = 40;
export const MATERIAL_IDS = Object.freeze(['copper', 'aluminum', 'ice']);

const metal = (id, name, heatCapacityJPerKgK) => Object.freeze({
  id, name, kind: 'metal', massG: 10, massKg: .01, heatCapacityJPerKgK,
  initialTemperatureC: 25, limitTemperatureC: 60,
  maxEnergyJ: .01 * heatCapacityJPerKgK * (60 - 25),
});
/** These are a bounded teaching approximation: constant room-temperature Cp, zero heat loss,
 *  uniform sample temperature and a fixed absorbed power. They do not describe a calibrated flame.
 */
export const SAMPLES = Object.freeze({
  copper: metal('copper', '铜', 385.083479137046),
  aluminum: metal('aluminum', '铝', 897.141426132353),
  ice: Object.freeze({ id: 'ice', name: '冰', kind: 'phase-change', massG: 1, massKg: .001,
    initialTemperatureC: 0, limitTemperatureC: 0, latentHeatJPerG: 333.4, maxEnergyJ: 333.4 }),
});
export const PORTS = Object.freeze([
  Object.freeze({ id: 'copper', position: Object.freeze([-.78, 0]), radius: .18 }),
  Object.freeze({ id: 'aluminum', position: Object.freeze([0, 0]), radius: .18 }),
  Object.freeze({ id: 'ice', position: Object.freeze([.78, 0]), radius: .18 }),
]);
const view = (name, position, target) => Object.freeze({
  name, position: Object.freeze(position), target: Object.freeze(target),
});
export const VIEWS = Object.freeze({
  hero: view('样品总览', [2.25, 2.6, 3.6], [0, .15, 0]),
  top: view('俯视观察', [0, 4.5, .1], [0, .1, 0]),
  front: view('正面观察', [0, 1.75, 4], [0, .15, 0]),
});

export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Numeric equality allows only accumulated binary rounding, not a meaningful heat-account mismatch.
const sameEnergy = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

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
  return result;
}

function registered(id) {
  if (typeof id !== 'string' || !Object.hasOwn(SAMPLES, id)) throw new Error('样品编号无效');
  return SAMPLES[id];
}

function boundedEnergy(id, value) {
  const spec = registered(id);
  if (!finite(value) || value < 0 || value > spec.maxEnergyJ) throw new Error('样品吸收能量超出限定范围');
  return value;
}

export function cameraForView(id) {
  if (typeof id !== 'string' || !Object.hasOwn(VIEWS, id)) throw new Error('材料观察方向无效');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

export function validateCamera(value) {
  exactKeys(value, ['position', 'target'], '材料相机结构无效');
  const position = vector(value.position, 3, '材料相机参数无效'), target = vector(value.target, 3, '材料相机参数无效');
  const [px, py, pz] = position, [tx, ty, tz] = target;
  if (Math.abs(px) > 7 || Math.abs(pz) > 7 || py < .5 || py > 6 ||
      Math.abs(tx) > 1.4 || Math.abs(tz) > 1.4 || ty < 0 || ty > 1.5) throw new Error('相机超出材料展示范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < 2 - 1e-6 || distance > 7 + 1e-6) throw new Error('材料相机距离无效');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .02 - 1e-6 || polar > .48 * Math.PI + 1e-6) throw new Error('材料相机角度无效');
  return { position, target };
}

function sourcePosition(value) {
  const position = vector(value, 2, '热源位置参数无效');
  if (position[0] < -1.15 || position[0] > 1.15 || position[1] < -.3 || position[1] > .85) throw new Error('热源超出教学台拖动范围');
  return position;
}

export function initialState() {
  return {
    version: VERSION, view: 'hero', camera: cameraForView('hero'), source: [0, .7], selected: 'copper',
    energies: { copper: 0, aluminum: 0, ice: 0 }, records: [], nextId: 1,
  };
}

/** Q = P t. For a metal ΔT = Q / (m Cp); for the initially 0°C ice f = Q / (m L).
 *  Ice stays at 0°C throughout this model and no further heat is admitted after it has melted.
 *  Metal colors/overlay, clock acceleration and normalized volume presentation belong to the UI.
 */
export function sample(id, energyJ) {
  const spec = registered(id), energy = boundedEnergy(id, energyJ), complete = energy === spec.maxEnergyJ;
  const meltFraction = spec.kind === 'phase-change' ? energy / spec.maxEnergyJ : 0;
  const temperatureC = spec.kind === 'phase-change' ? 0 : complete ? spec.limitTemperatureC :
    spec.initialTemperatureC + energy / (spec.massKg * spec.heatCapacityJPerKgK);
  return {
    id, energyJ: energy, seconds: energy / POWER_W, temperatureC, meltFraction,
    remainingFraction: 1 - meltFraction, progress: energy / spec.maxEnergyJ, complete,
    phase: spec.kind === 'metal' ? 'solid' : complete ? 'melted' : energy > 0 ? 'melting' : 'ice',
  };
}

function record(value) {
  exactKeys(value, ['id', 'material', 'energyJ', 'seconds'], '热输入记录结构无效');
  if (!Number.isSafeInteger(value.id) || value.id < 1 || value.id >= 1_000_000) throw new Error('热输入记录编号无效');
  const spec = registered(value.material), energyJ = boundedEnergy(value.material, value.energyJ);
  if (!(energyJ > 0) || !finite(value.seconds) || value.seconds <= 0 || value.seconds > spec.maxEnergyJ / POWER_W ||
      !sameEnergy(energyJ, value.seconds * POWER_W)) throw new Error('热输入记录的能量与时间不一致');
  return { id: value.id, material: value.material, energyJ, seconds: value.seconds };
}

export function validateState(value) {
  exactKeys(value, ['version', 'view', 'camera', 'source', 'selected', 'energies', 'records', 'nextId'], '材料教学台文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的材料教学台文件版本');
  if (typeof value.view !== 'string' || (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view))) throw new Error('材料观察方向无效');
  registered(value.selected);
  if (!Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId > 1_000_000) throw new Error('下一个热输入编号无效');
  exactKeys(value.energies, MATERIAL_IDS, '样品能量结构无效');
  const energies = Object.fromEntries(MATERIAL_IDS.map(id => [id, boundedEnergy(id, value.energies[id])]));
  const totals = { copper: 0, aluminum: 0, ice: 0 };
  let previousId = 0;
  const records = denseArray(value.records, MAX_RECORDS, '热输入记录最多支持 40 条').map(item => {
    const next = record(item);
    if (next.id <= previousId || next.id >= value.nextId) throw new Error('热输入编号重复、顺序错误或下一个编号过小');
    previousId = next.id; totals[next.material] += next.energyJ;
    return next;
  });
  for (const id of MATERIAL_IDS) {
    if (!sameEnergy(totals[id], energies[id])) throw new Error('样品能量与完整热输入账本不一致');
  }
  return { version: VERSION, view: value.view, camera: validateCamera(value.camera), source: sourcePosition(value.source),
    selected: value.selected, energies, records, nextId: value.nextId };
}

export function calculateRun(state, id, requestedSeconds) {
  const current = validateState(state), spec = registered(id);
  if (!finite(requestedSeconds) || requestedSeconds < 0) throw new Error('热输入时间必须为非负有限秒数');
  const before = current.energies[id], remaining = spec.maxEnergyJ - before;
  const limitedSeconds = Math.min(requestedSeconds, remaining / POWER_W);
  const totalEnergyJ = limitedSeconds === remaining / POWER_W ? spec.maxEnergyJ : before + limitedSeconds * POWER_W;
  const energyJ = totalEnergyJ - before, seconds = energyJ / POWER_W;
  return { material: id, energyJ, seconds, totalEnergyJ,
    remainingSeconds: (spec.maxEnergyJ - totalEnergyJ) / POWER_W,
    complete: totalEnergyJ === spec.maxEnergyJ, sample: sample(id, totalEnergyJ) };
}

export function appendRun(state, id, requestedSeconds) {
  const next = validateState(state);
  if (next.records.length >= MAX_RECORDS) throw new Error('热输入账本已满 40 条，请重置后继续');
  if (next.nextId >= 1_000_000) throw new Error('热输入记录编号已达到上限');
  const run = calculateRun(next, id, requestedSeconds);
  if (run.energyJ === 0) return next;
  next.records.push({ id: next.nextId, material: id, energyJ: run.energyJ, seconds: run.seconds });
  next.nextId++; next.energies[id] = run.totalEnergyJ;
  return validateState(next);
}

export function targetAt(point) {
  const position = vector(point, 2, '热源接触点参数无效');
  const port = PORTS.find(candidate => Math.hypot(position[0] - candidate.position[0], position[1] - candidate.position[1]) <= candidate.radius + 1e-12);
  return port?.id ?? null;
}

export function setSource(state, position) {
  const next = validateState(state);
  next.source = sourcePosition(position);
  return next;
}

export function setView(state, id) {
  const next = validateState(state);
  next.camera = cameraForView(id); next.view = id;
  return next;
}

export function selectSample(state, id) {
  const next = validateState(state);
  registered(id); next.selected = id;
  return next;
}

export function resetSamples(state) {
  const next = validateState(state);
  next.energies = { copper: 0, aluminum: 0, ice: 0 }; next.records = [];
  return next;
}

/** Restart one observation without resetting the other samples or reusing ledger IDs. */
export function resetSample(state, id) {
  const next = validateState(state);
  registered(id);
  next.energies[id] = 0;
  next.records = next.records.filter(item => item.material !== id);
  return validateState(next);
}

export class History {
  constructor(state = initialState(), limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('历史记录上限必须为 1 至 40');
    this.limit = limit; this.current = validateState(state);
    this.past = []; this.future = []; this.pending = null;
  }
  get state() { return this.current; }
  set state(value) { this.current = value; }
  get canUndo() { return !!this.pending || this.past.length > 0; }
  get canRedo() { return !!this.pending || this.future.length > 0; }
  begin(label = '编辑材料教学台') {
    if (this.pending) return false;
    if (typeof label !== 'string' || label.length > 120) throw new Error('历史记录说明无效');
    this.pending = { label, state: validateState(this.current) };
    return true;
  }
  commit() {
    if (!this.pending) return false;
    let next;
    try { next = validateState(this.current); }
    catch (error) { this.cancel(); throw error; }
    const item = this.pending;
    this.pending = null; this.current = next;
    if (same(item.state, next)) return false;
    this.past.push(item);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }
  cancel() {
    if (!this.pending) return false;
    this.current = this.pending.state; this.pending = null;
    return true;
  }
  edit(label, fn) {
    if (this.pending) throw new Error('请先完成当前热输入');
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
    this.future.push({ label: item.label, state: next }); this.current = item.state;
    return true;
  }
  redo() {
    if (this.pending) return this.cancel();
    if (!this.future.length) return false;
    const next = validateState(this.current), item = this.future.pop();
    this.past.push({ label: item.label, state: next }); this.current = item.state;
    return true;
  }
  replace(state) {
    const next = validateState(state);
    this.current = next; this.past = []; this.future = []; this.pending = null;
  }
}
