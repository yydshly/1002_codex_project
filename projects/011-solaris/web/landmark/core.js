export const VERSION = 1;
export const HOTSPOT_IDS = ['introduction', 'facade', 'garden', 'museum'];

// These are display coordinates for the calibrated demo asset, not site survey data.
export const VIEWS = {
  overview: { name: '地标总览', position: [19, 13, 22], target: [0, 3.4, 0] },
  facade: { name: '建筑立面', position: [25, 8, 0], target: [0, 3.4, 0] },
  garden: { name: '背侧观察', position: [-25, 9, 0], target: [0, 3.4, 0] },
  roof: { name: '屋顶俯瞰', position: [14, 30, 16], target: [0, 3.4, 0] },
};

export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
}

function vector(value) {
  if (!Array.isArray(value) || value.length !== 3 ||
      Reflect.ownKeys(value).length !== 4 ||
      ![0, 1, 2].every(index => Object.hasOwn(value, index) && finite(value[index]))) {
    throw new Error('视角参数无效');
  }
}

export function cameraForView(id) {
  if (!Object.hasOwn(VIEWS, id)) throw new Error('此视角没有预设相机');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

export function initialState() {
  return {
    version: VERSION, time: 15, lights: true,
    camera: cameraForView('overview'), view: 'overview', hotspot: null,
  };
}

/** A restored file must preserve its values; invalid values are never silently clamped. */
export function validateState(value) {
  exactKeys(value, ['version', 'time', 'lights', 'camera', 'view', 'hotspot'], '地标工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的地标工作区文件版本');
  if (!finite(value.time) || value.time < 6 || value.time > 22) throw new Error('时段参数必须在 6–22 之间');
  if (typeof value.lights !== 'boolean') throw new Error('建筑照明参数无效');
  if (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view)) throw new Error('视角编号无效');
  if (value.hotspot !== null && !HOTSPOT_IDS.includes(value.hotspot)) throw new Error('说明卡编号无效');
  exactKeys(value.camera, ['position', 'target'], '视角参数无效');
  vector(value.camera.position);
  vector(value.camera.target);
  const [px, py, pz] = value.camera.position, [tx, ty, tz] = value.camera.target;
  if (Math.abs(px) > 60 || Math.abs(pz) > 60 || py < 1 || py > 40 ||
      Math.abs(tx) > 18 || Math.abs(tz) > 18 || ty < .5 || ty > 12) {
    throw new Error('视角超出地标展示范围');
  }
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < 4 - 1e-6 || distance > 65 + 1e-6) throw new Error('相机距离必须在 4–65 之间');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .08 - 1e-6 || polar > .485 * Math.PI + 1e-6) throw new Error('相机角度超出地标展示范围');
  return {
    version: VERSION, time: value.time, lights: value.lights,
    camera: { position: [...value.camera.position], target: [...value.camera.target] },
    view: value.view, hotspot: value.hotspot,
  };
}

// Deliberately authored mood anchors. They are not an ephemeris or a lux calculation.
const MOODS = [
  { time: 6, sunColor: '#ffd2a0', skyColor: '#d6bfb4', groundColor: '#695341', directIntensity: .8, ambient: .7, exposure: 1, practicalIntensity: .3 },
  { time: 9, sunColor: '#fff0d2', skyColor: '#c5d8e2', groundColor: '#77705c', directIntensity: 2.6, ambient: 1.1, exposure: 1, practicalIntensity: .05 },
  { time: 15, sunColor: '#fff0d0', skyColor: '#c2d3de', groundColor: '#716854', directIntensity: 2.4, ambient: 1, exposure: 1, practicalIntensity: .05 },
  { time: 18, sunColor: '#ffba75', skyColor: '#d09d89', groundColor: '#685447', directIntensity: 1.25, ambient: .75, exposure: 1.05, practicalIntensity: .5 },
  { time: 19.5, sunColor: '#ffad69', skyColor: '#665779', groundColor: '#333242', directIntensity: .12, ambient: .4, exposure: 1.12, practicalIntensity: 1.1 },
  { time: 22, sunColor: '#bbcdf7', skyColor: '#14233d', groundColor: '#1b2333', directIntensity: .08, ambient: .28, exposure: 1.2, practicalIntensity: 1.5 },
];

const mix = (a, b, t) => a + (b - a) * t;
function mixColor(a, b, t) {
  const channels = [1, 3, 5].map(index => Math.round(mix(
    parseInt(a.slice(index, index + 2), 16), parseInt(b.slice(index, index + 2), 16), t,
  )).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
}

/** Stable local lighting parameters; no network, geographic data, or model inference. */
export function atmosphere(time) {
  if (!finite(time) || time < 6 || time > 22) throw new Error('时段参数必须在 6–22 之间');
  const rightIndex = MOODS.findIndex(item => item.time >= time);
  const b = MOODS[rightIndex], a = MOODS[Math.max(0, rightIndex - 1)];
  const t = a.time === b.time ? 0 : (time - a.time) / (b.time - a.time);
  // An art-directed arc stays above the asset so late-hour fill remains legible.
  const arc = ((Math.min(time, 18) - 6) / 12) * Math.PI;
  const direction = [Math.cos(arc), .18 + .82 * Math.sin(arc), .45];
  const magnitude = Math.hypot(...direction);
  const result = {
    time, phase: time < 17 ? 'day' : time < 20 ? 'sunset' : 'night',
    sunDirection: direction.map(component => component / magnitude),
  };
  for (const key of ['sunColor', 'skyColor', 'groundColor']) result[key] = mixColor(a[key], b[key], t);
  for (const key of ['directIntensity', 'ambient', 'exposure', 'practicalIntensity']) result[key] = mix(a[key], b[key], t);
  return result;
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
  begin(label = '编辑地标工作区') {
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
