export const VERSION = 1;
export const MIN_SCALE = .04;
export const MAX_SCALE = 16;
export const MAX_MEASUREMENTS = 100;
export const clone = value => structuredClone(value);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
}

function size(value) {
  exactKeys(value, ['width', 'height'], '图像尺寸结构无效');
  for (const key of ['width', 'height']) {
    if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > 8192) throw new Error('图像尺寸必须为 1–8192 像素');
  }
  return { width: value.width, height: value.height };
}

function point(value, imageSize) {
  exactKeys(value, ['x', 'y'], '坐标结构无效');
  if (!finite(value.x) || !finite(value.y)) throw new Error('坐标必须为有限数值');
  if (imageSize && (value.x < 0 || value.x > imageSize.width || value.y < 0 || value.y > imageSize.height)) throw new Error('坐标超出图像范围');
  return { x: value.x, y: value.y };
}

function view(value) {
  exactKeys(value, ['scale', 'offsetX', 'offsetY'], '视口参数结构无效');
  if (!finite(value.scale) || value.scale < MIN_SCALE || value.scale > MAX_SCALE) throw new Error('缩放范围为 4%–1600%');
  if (!finite(value.offsetX) || !finite(value.offsetY) || Math.abs(value.offsetX) > 1000000 || Math.abs(value.offsetY) > 1000000) throw new Error('平移参数无效');
  return { scale: value.scale, offsetX: value.offsetX, offsetY: value.offsetY };
}

function calibration(value, imageSize) {
  exactKeys(value, ['a', 'b', 'lengthMm'], '校准参数结构无效');
  const a = point(value.a, imageSize), b = point(value.b, imageSize);
  if (!finite(value.lengthMm) || value.lengthMm < .01 || value.lengthMm > 1000000) throw new Error('参考长度必须为 0.01–1,000,000 mm');
  if (distance(a, b) < 1) throw new Error('参考线至少需要 1 像素');
  return { a, b, lengthMm: value.lengthMm };
}

export function initialState(width, height, imageId = 'sample') {
  return validateState({
    version: VERSION, imageId, image: { width, height },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    appearance: { brightness: 0, contrast: 1, invert: false },
    calibration: null, measurements: [],
  });
}

/** A backup stores image coordinates, never rendered screen coordinates or a remote URL. */
export function validateState(value) {
  exactKeys(value, ['version', 'imageId', 'image', 'view', 'appearance', 'calibration', 'measurements'], '影像文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的影像文件版本');
  if (typeof value.imageId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.imageId)) throw new Error('图像编号无效');
  const image = size(value.image), viewport = view(value.view);
  exactKeys(value.appearance, ['brightness', 'contrast', 'invert'], '显示参数结构无效');
  const { brightness, contrast, invert } = value.appearance;
  if (!finite(brightness) || brightness < -1 || brightness > 1 || !finite(contrast) || contrast < .05 || contrast > 8 || typeof invert !== 'boolean') throw new Error('显示参数超出范围');
  if (!Array.isArray(value.measurements) || value.measurements.length > MAX_MEASUREMENTS) throw new Error('最多可保留 100 条测量线');
  const measurementKeys = Reflect.ownKeys(value.measurements);
  if (measurementKeys.length !== value.measurements.length + 1 || measurementKeys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.measurements.length))) throw new Error('测量线列表结构无效');
  const ids = new Set();
  const measurements = value.measurements.map(item => {
    exactKeys(item, ['id', 'a', 'b'], '测量线结构无效');
    if (typeof item.id !== 'string' || !/^measure-[1-9]\d{0,8}$/.test(item.id) || ids.has(item.id)) throw new Error('测量编号无效或重复');
    ids.add(item.id);
    return { id: item.id, a: point(item.a, image), b: point(item.b, image) };
  });
  return {
    version: VERSION, imageId: value.imageId, image, view: viewport,
    appearance: { brightness, contrast, invert },
    calibration: value.calibration === null ? null : calibration(value.calibration, image),
    measurements,
  };
}

export function imageToScreen(viewport, imagePosition) {
  const v = view(viewport), p = point(imagePosition);
  return point({ x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY });
}

export function screenToImage(viewport, screenPosition) {
  const v = view(viewport), p = point(screenPosition);
  return point({ x: (p.x - v.offsetX) / v.scale, y: (p.y - v.offsetY) / v.scale });
}

export function fitView(imageWidth, imageHeight, viewportWidth, viewportHeight, padding = 40) {
  const image = size({ width: imageWidth, height: imageHeight });
  if (!finite(viewportWidth) || !finite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0 || viewportWidth > 100000 || viewportHeight > 100000 || !finite(padding) || padding < 0) throw new Error('视口尺寸或边距无效');
  const availableWidth = Math.max(1, viewportWidth - 2 * padding);
  const availableHeight = Math.max(1, viewportHeight - 2 * padding);
  const scale = clamp(Math.min(availableWidth / image.width, availableHeight / image.height), MIN_SCALE, MAX_SCALE);
  return view({ scale, offsetX: (viewportWidth - image.width * scale) / 2, offsetY: (viewportHeight - image.height * scale) / 2 });
}

/** The image coordinate under the pointer is invariant, including at a zoom limit. */
export function zoomAt(viewport, screenPosition, factor) {
  const v = view(viewport), p = point(screenPosition);
  if (!finite(factor) || factor <= 0) throw new Error('缩放比例无效');
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === v.scale) return v;
  const anchor = screenToImage(v, p);
  return view({ scale, offsetX: p.x - anchor.x * scale, offsetY: p.y - anchor.y * scale });
}

export function panView(viewport, dx, dy) {
  const v = view(viewport);
  if (!finite(dx) || !finite(dy)) throw new Error('平移距离无效');
  return view({ scale: v.scale, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy });
}

export function imagePoint(viewport, screenPosition, imageSize, shouldClamp = true) {
  const image = size(imageSize), p = screenToImage(viewport, screenPosition);
  if (typeof shouldClamp !== 'boolean') throw new Error('坐标边界参数无效');
  if (!shouldClamp) return point(p, image);
  return { x: clamp(p.x, 0, image.width), y: clamp(p.y, 0, image.height) };
}

export function measurementLength(state, measurement) {
  const image = size(state.image), a = point(measurement.a, image), b = point(measurement.b, image);
  const pixelLength = distance(a, b);
  if (state.calibration === null) return { value: pixelLength, unit: 'px' };
  const reference = calibration(state.calibration, image);
  return { value: pixelLength * (reference.lengthMm / distance(reference.a, reference.b)), unit: 'mm' };
}

/** Calibration is manual: the caller must supply a trusted length in millimetres. */
export function calibrate(state, a, b, lengthMm) {
  const next = validateState(state);
  next.calibration = calibration({ a, b, lengthMm }, next.image);
  return next;
}

/** Endpoints stay in image space when the viewport is zoomed or panned. */
export function moveEndpoint(state, measurementId, endpoint, imagePosition, shouldClamp = true) {
  const next = validateState(state);
  if (!['a', 'b'].includes(endpoint) || typeof shouldClamp !== 'boolean') throw new Error('测量端点参数无效');
  const item = next.measurements.find(entry => entry.id === measurementId);
  if (!item) throw new Error('测量线不存在');
  const p = point(imagePosition);
  item[endpoint] = shouldClamp ? { x: clamp(p.x, 0, next.image.width), y: clamp(p.y, 0, next.image.height) } : point(p, next.image);
  return next;
}

export class History {
  constructor(state, limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('历史记录上限为 1–40');
    this.limit = limit;
    this.current = validateState(state);
    this.past = [];
    this.future = [];
    this.pending = null;
  }
  begin(label = '编辑影像') {
    if (this.pending) return false;
    this.pending = { label: String(label), state: validateState(this.current) };
    return true;
  }
  commit() {
    if (!this.pending) return false;
    let next;
    try { next = validateState(this.current); }
    catch (error) { this.cancel(); throw error; }
    const previous = this.pending;
    this.pending = null;
    this.current = next;
    if (same(previous.state, next)) return false;
    this.past.push(previous);
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
      const result = fn(this.current);
      if (result !== undefined) this.current = result;
      return this.commit();
    } catch (error) { this.cancel(); throw error; }
  }
  run(label, fn) { return this.edit(label, fn); }
  undo() {
    this.cancel();
    if (!this.past.length) return false;
    const previous = this.past.pop();
    this.future.push({ label: previous.label, state: validateState(this.current) });
    this.current = previous.state;
    return true;
  }
  redo() {
    this.cancel();
    if (!this.future.length) return false;
    const next = this.future.pop();
    this.past.push({ label: next.label, state: validateState(this.current) });
    this.current = next.state;
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
