export const VERSION = 1;
export const CANVAS = Object.freeze({ width: 1200, height: 900 });
export const SOURCE_IDS = Object.freeze(['cat', 'wheat', 'river']);
export const LAYER_IDS = Object.freeze(['texture', 'paint']);
export const TARGETS = Object.freeze({
  all: Object.freeze([0, 0, 1200, 900]),
  left: Object.freeze([90, 110, 380, 300]),
  right: Object.freeze([730, 520, 380, 300]),
});
export const LIMITS = Object.freeze({
  minSourceSize: .025, minBrushSize: 8, maxBrushSize: 140, minOpacity: .15,
  strokesPerLayer: 200, totalStrokes: 300, pointsPerStroke: 5000, totalPoints: 100000,
  maxResampledPoints: 100000, totalStamps: 200000,
});
export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const STROKE_ID = /^stroke-([1-9]\d{0,8})$/;

function exactKeys(value, keys, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error(message);
}

function array(value, max, message) {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1 ||
      !Array.from({ length: value.length }, (_, i) => i).every(i => Object.hasOwn(value, i))) throw new Error(message);
}

function vector(value, length, message) {
  array(value, length, message);
  if (value.length !== length || !value.every(finite)) throw new Error(message);
}

function validateSource(value) {
  exactKeys(value, ['id', 'rect'], '来源选区结构无效');
  if (!SOURCE_IDS.includes(value.id)) throw new Error('来源编号无效');
  vector(value.rect, 4, '来源选区参数无效');
  const [x, y, width, height] = value.rect;
  if (x < 0 || y < 0 || width < LIMITS.minSourceSize || height < LIMITS.minSourceSize ||
      width > 1 || height > 1 || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) throw new Error('来源选区必须位于原图内且宽高至少为 2.5%');
  return { id: value.id, rect: [...value.rect] };
}

function validateBrush(value) {
  exactKeys(value, ['size', 'opacity'], '笔刷参数结构无效');
  if (!finite(value.size) || value.size < LIMITS.minBrushSize || value.size > LIMITS.maxBrushSize ||
      !finite(value.opacity) || value.opacity < LIMITS.minOpacity || value.opacity > 1) throw new Error('笔刷大小或透明度超出范围');
  return { size: value.size, opacity: value.opacity };
}

function validatePoint(value) {
  vector(value, 3, '笔迹坐标无效');
  if (value[0] < 0 || value[0] > CANVAS.width || value[1] < 0 || value[1] > CANVAS.height || value[2] < 0 || value[2] > 1) {
    throw new Error('笔迹坐标或压力超出画布范围');
  }
  return [...value];
}

function validateTarget(id) {
  if (typeof id !== 'string' || !Object.hasOwn(TARGETS, id)) throw new Error('绘画目标编号无效');
  return id;
}

function strokeNumber(id) {
  if (typeof id !== 'string' || !STROKE_ID.test(id)) throw new Error('笔迹编号无效');
  return Number(STROKE_ID.exec(id)[1]);
}

export function strokeSpacing(stroke) {
  if (!stroke || !LAYER_IDS.includes(stroke.mode) || !finite(stroke.size) ||
      stroke.size < LIMITS.minBrushSize || stroke.size > LIMITS.maxBrushSize) throw new Error('笔刷采样参数无效');
  return Math.max(1, stroke.size * (stroke.mode === 'texture' ? .16 : .12));
}

function stampCount(points, spacing) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length === 0 ? 1 : Math.ceil(length / spacing) + 1;
}

export function estimateStampCount(points, spacing) {
  array(points, LIMITS.pointsPerStroke, '单笔最多保留 5000 个坐标点');
  if (!points.length || !finite(spacing) || spacing <= 0) throw new Error('笔刷采样参数无效');
  return stampCount(points.map(validatePoint), spacing);
}

export function initialState() {
  return {
    version: VERSION, base: 'stilllife',
    source: { id: 'cat', rect: [.53, .23, .13, .15] },
    brush: { size: 72, opacity: .8 }, target: 'all', activeLayer: 'texture',
    layers: [
      { id: 'texture', visible: true, strokes: [] },
      { id: 'paint', visible: true, strokes: [] },
    ],
    nextId: 1,
  };
}

/** Saved strokes carry their own source and settings; later tool changes cannot change replay. */
export function validateState(value) {
  exactKeys(value, ['version', 'base', 'source', 'brush', 'target', 'activeLayer', 'layers', 'nextId'], '创作文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的创作文件版本');
  if (!['stilllife', 'paper'].includes(value.base)) throw new Error('画布底图编号无效');
  if (!LAYER_IDS.includes(value.activeLayer)) throw new Error('活动图层编号无效');
  if (!Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId > 1_000_000_000) throw new Error('下一个笔迹编号无效');
  array(value.layers, 2, '图层清单无效');
  if (value.layers.length !== 2) throw new Error('创作文件必须保留纹理和绘画两层');
  const layerIDs = new Set(), strokeIDs = new Set();
  let strokeCount = 0, pointCount = 0, stampTotal = 0;
  const layers = value.layers.map(layer => {
    exactKeys(layer, ['id', 'visible', 'strokes'], '图层结构无效');
    if (!LAYER_IDS.includes(layer.id) || layerIDs.has(layer.id)) throw new Error('图层编号无效或重复');
    layerIDs.add(layer.id);
    if (typeof layer.visible !== 'boolean') throw new Error('图层显示参数无效');
    array(layer.strokes, LIMITS.strokesPerLayer, '每层最多保留 200 笔');
    const strokes = layer.strokes.map(stroke => {
      exactKeys(stroke, ['id', 'source', 'mode', 'size', 'opacity', 'target', 'points'], '笔迹结构无效');
      const number = strokeNumber(stroke.id);
      if (strokeIDs.has(stroke.id) || number >= value.nextId) throw new Error('笔迹编号重复或下一个编号过小');
      strokeIDs.add(stroke.id);
      if (stroke.mode !== layer.id) throw new Error('笔迹模式必须与所属图层一致');
      const brush = validateBrush({ size: stroke.size, opacity: stroke.opacity });
      array(stroke.points, LIMITS.pointsPerStroke, '单笔最多保留 5000 个坐标点');
      if (!stroke.points.length) throw new Error('笔迹至少需要一个坐标点');
      strokeCount++; pointCount += stroke.points.length;
      if (strokeCount > LIMITS.totalStrokes || pointCount > LIMITS.totalPoints) throw new Error('创作文件超出 300 笔或 100000 个坐标点的范围');
      const points = stroke.points.map(validatePoint), stamps = stampCount(points, strokeSpacing(stroke));
      stampTotal += stamps;
      if (stamps > LIMITS.maxResampledPoints || stampTotal > LIMITS.totalStamps) throw new Error('笔迹路径过长，超出单笔 100000 或全图 200000 个笔刷印记的范围');
      return {
        id: stroke.id, source: validateSource(stroke.source), mode: stroke.mode,
        ...brush, target: validateTarget(stroke.target), points,
      };
    });
    return { id: layer.id, visible: layer.visible, strokes };
  });
  return {
    version: VERSION, base: value.base, source: validateSource(value.source),
    brush: validateBrush(value.brush), target: validateTarget(value.target), activeLayer: value.activeLayer,
    layers, nextId: value.nextId,
  };
}

export function sourceRectFromDrag(start, end) {
  vector(start, 2, '选区起点无效'); vector(end, 2, '选区终点无效');
  const a = start.map(value => clamp(value, 0, 1)), b = end.map(value => clamp(value, 0, 1));
  const width = Math.max(LIMITS.minSourceSize, Math.abs(b[0] - a[0]));
  const height = Math.max(LIMITS.minSourceSize, Math.abs(b[1] - a[1]));
  return [Math.min(Math.min(a[0], b[0]), 1 - width), Math.min(Math.min(a[1], b[1]), 1 - height), width, height];
}

function displayBounds(bounds) {
  if (!bounds || ![bounds.left, bounds.top, bounds.width, bounds.height].every(finite) || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('画布显示区域无效');
  }
  return bounds;
}

export function clientToCanvas(point, bounds, constrain = true) {
  vector(point, 2, '指针位置无效'); displayBounds(bounds);
  if (typeof constrain !== 'boolean') throw new Error('坐标约束参数无效');
  const result = [(point[0] - bounds.left) / bounds.width * CANVAS.width, (point[1] - bounds.top) / bounds.height * CANVAS.height];
  return constrain ? [clamp(result[0], 0, CANVAS.width), clamp(result[1], 0, CANVAS.height)] : result;
}

export function canvasToClient(point, bounds) {
  vector(point, 2, '画布位置无效'); displayBounds(bounds);
  return [bounds.left + point[0] / CANVAS.width * bounds.width, bounds.top + point[1] / CANVAS.height * bounds.height];
}

export function pointInTarget(target, point) {
  validateTarget(target); vector(point, 2, '目标位置无效');
  const [x, y, width, height] = TARGETS[target];
  return point[0] >= x && point[0] <= x + width && point[1] >= y && point[1] <= y + height;
}

/** Uniform cumulative-distance stamps, independent of how an identical path is divided into events. */
export function resampleStroke(points, spacing) {
  array(points, LIMITS.pointsPerStroke, '单笔最多保留 5000 个坐标点');
  if (!points.length) throw new Error('笔迹至少需要一个坐标点');
  if (!finite(spacing) || spacing <= 0) throw new Error('笔刷采样间距必须为正数');
  const clean = [];
  for (const value of points) {
    const point = validatePoint(value), previous = clean.at(-1);
    // A zero-length event is not another stamp. Preserve the first pressure at that location.
    if (!previous || point[0] !== previous[0] || point[1] !== previous[1]) clean.push(point);
  }
  if (clean.length === 1) return [clean[0]];
  const lengths = [0];
  for (let i = 1; i < clean.length; i++) lengths.push(lengths.at(-1) + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]));
  const total = lengths.at(-1), estimated = Math.ceil(total / spacing) + 1;
  if (!Number.isFinite(estimated) || estimated > LIMITS.maxResampledPoints) throw new Error('采样间距过小，笔刷印记超出范围');
  const result = [[...clean[0]]];
  let segment = 1;
  for (let index = 1; index * spacing < total - 1e-9; index++) {
    const distance = index * spacing;
    while (segment < clean.length - 1 && distance > lengths[segment]) segment++;
    const t = clamp((distance - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1]), 0, 1);
    const a = clean[segment - 1], b = clean[segment];
    result.push(a.map((value, axis) => value + (b[axis] - value) * t));
  }
  result.push([...clean.at(-1)]);
  return result;
}

export function makeStroke(state, points) {
  const current = validateState(state);
  if (current.nextId >= 1_000_000_000) throw new Error('笔迹编号已达到上限');
  array(points, LIMITS.pointsPerStroke, '单笔最多保留 5000 个坐标点');
  if (!points.length) throw new Error('笔迹至少需要一个坐标点');
  const stroke = {
    id: `stroke-${current.nextId}`, source: clone(current.source), mode: current.activeLayer,
    ...current.brush, target: current.target, points: points.map(validatePoint),
  };
  const trial = clone(current);
  trial.layers.find(layer => layer.id === stroke.mode).strokes.push(stroke);
  trial.nextId++;
  validateState(trial);
  return stroke;
}

export function addStroke(state, points) {
  const stroke = makeStroke(state, points), next = validateState(state);
  next.layers.find(layer => layer.id === stroke.mode).strokes.push(stroke);
  next.nextId++;
  return validateState(next);
}

export class History {
  constructor(state = initialState(), limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('历史记录上限无效');
    this.limit = limit;
    this.current = validateState(state);
    this.past = []; this.future = []; this.pending = null;
  }
  begin(label = '编辑创作') {
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
    if (this.pending) throw new Error('请先完成当前一笔');
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
