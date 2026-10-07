export const VERSION = 1;
export const PAINTS = [
  { id: 'graphite', name: '石墨灰', color: '#343b42' },
  { id: 'pearl', name: '珍珠白', color: '#eeeae1' },
  { id: 'racing', name: '赛道红', color: '#a52329' },
  { id: 'silver', name: '钛银', color: '#a8b0b5' },
  { id: 'blue', name: '深海蓝', color: '#234a6d' },
];
// Positions use metres; the front of the calibrated vehicle faces +Z.
export const VIEWS = {
  hero: { name: '经典视角', position: [5.1, 2.35, 5.8], target: [0, .65, 0] },
  front: { name: '车头', position: [0, 1.25, 6.2], target: [0, .65, .4] },
  rear: { name: '车尾', position: [0, 1.3, -6.2], target: [0, .65, -.4] },
  side: { name: '侧面', position: [6, 1.3, 0], target: [0, .65, 0] },
  cabin: { name: '座舱近景', position: [1.8, 1.7, .9], target: [0, 1, 0] },
  engine: { name: '前舱近景', position: [2.35, 3.65, 2.75], target: [0, .65, 1.35] },
};
export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function initialState() {
  return {
    version: VERSION,
    paint: 'graphite',
    lights: { on: false, power: 160 },
    hood: 0,
    camera: { position: [...VIEWS.hero.position], target: [...VIEWS.hero.target] },
    view: 'hero',
  };
}

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
}

/** Reject malformed backups instead of silently altering camera or lighting values. */
export function validateState(value) {
  exactKeys(value, ['version', 'paint', 'lights', 'hood', 'camera', 'view'], '展厅文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的展厅文件版本');
  if (!PAINTS.some(item => item.id === value.paint)) throw new Error('车漆编号无效');
  if (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view)) throw new Error('视角编号无效');
  exactKeys(value.lights, ['on', 'power'], '车灯参数无效');
  if (typeof value.lights.on !== 'boolean' || !finite(value.lights.power) || value.lights.power < 0 || value.lights.power > 300) throw new Error('车灯参数无效');
  if (!finite(value.hood) || value.hood < 0 || value.hood > 1) throw new Error('前舱开度无效');
  exactKeys(value.camera, ['position', 'target'], '视角参数无效');
  for (const key of ['position', 'target']) {
    const vector = value.camera[key];
    if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(finite)) throw new Error('视角参数无效');
  }
  const [px, py, pz] = value.camera.position, [tx, ty, tz] = value.camera.target;
  if (Math.abs(px) > 25 || Math.abs(pz) > 25 || py < .08 || py > 15 || Math.abs(tx) > 5 || Math.abs(tz) > 5 || ty < .1 || ty > 2.5) throw new Error('视角超出展厅范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < 1.2 - 1e-6 || distance > 12 + 1e-6) throw new Error('相机距离无效');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .1 - 1e-6 || polar > Math.PI * .48 + 1e-6) throw new Error('相机角度超出展厅范围');
  return {
    version: VERSION, paint: value.paint,
    lights: { on: value.lights.on, power: value.lights.power },
    hood: value.hood,
    camera: { position: [...value.camera.position], target: [...value.camera.target] },
    view: value.view,
  };
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
  begin(label = '编辑展厅') {
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
    if (this.pending) throw new Error('请先完成当前拖动');
    this.begin(label);
    try { fn(this.current); return this.commit(); }
    catch (error) { this.cancel(); throw error; }
  }
  run(label, fn) { return this.edit(label, fn); }
  undo() {
    this.cancel();
    if (!this.past.length) return false;
    const item = this.past.pop();
    this.future.push({ label: item.label, state: validateState(this.current) });
    this.current = item.state;
    return true;
  }
  redo() {
    this.cancel();
    if (!this.future.length) return false;
    const item = this.future.pop();
    this.past.push({ label: item.label, state: validateState(this.current) });
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
