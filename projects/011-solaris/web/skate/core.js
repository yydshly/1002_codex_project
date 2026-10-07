export const VERSION = 1;
export const MAX_TRIALS = 40;
export const HEIGHT_MIN = .3;
export const HEIGHT_MAX = 1.1;
export const GRAVITY = 9.8;
export const PREPARATION_SECONDS = .28;
export const LANDING_SECONDS = .30;

const view = (name, position, target) => Object.freeze({
  name, position: Object.freeze(position), target: Object.freeze(target),
});
export const VIEWS = Object.freeze({
  hero: view('公园总览', [5, 3.6, 6], [0, .7, 0]),
  side: view('侧面观察', [5, 2.3, 0], [0, .7, 0]),
  front: view('正面观察', [0, 2.4, 6], [0, .7, 0]),
});

export const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

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
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new Error(message);
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(message);
    result.push(descriptor.value);
  }
  return result;
}

function vector(value) {
  const result = denseArray(value, 3, '滑板相机参数无效');
  if (result.length !== 3 || !result.every(finite)) throw new Error('滑板相机参数无效');
  return result;
}

function height(value) {
  if (!finite(value) || value < HEIGHT_MIN || value > HEIGHT_MAX) throw new Error('起跳高度必须为 0.3 至 1.1 展示单位');
  return value;
}

export function cameraForView(id) {
  if (typeof id !== 'string' || !Object.hasOwn(VIEWS, id)) throw new Error('滑板观察方向无效');
  return { position: [...VIEWS[id].position], target: [...VIEWS[id].target] };
}

export function validateCamera(value) {
  exactKeys(value, ['position', 'target'], '滑板相机结构无效');
  const position = vector(value.position), target = vector(value.target);
  const [px, py, pz] = position, [tx, ty, tz] = target;
  if (Math.abs(px) > 14 || Math.abs(pz) > 14 || py < .35 || py > 12 ||
      Math.abs(tx) > 3 || Math.abs(tz) > 3 || ty < 0 || ty > 3) throw new Error('相机超出滑板展示范围');
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  if (distance < 2 - 1e-6 || distance > 16 + 1e-6) throw new Error('滑板相机距离无效');
  const polar = Math.acos((py - ty) / distance);
  if (polar < .08 - 1e-6 || polar > .47 * Math.PI + 1e-6) throw new Error('滑板相机角度无效');
  return { position, target };
}

export function initialState() {
  return {
    version: VERSION, view: 'hero', camera: cameraForView('hero'), height: .7,
    trials: [], nextId: 1, selectedTrial: null,
  };
}

/** Only the final upward displacement counts. Returning below 24 px cancels an earlier high preview.
 *  Distance controls height; recorded speed never changes the trajectory. Ranges are input limits,
 *  not measurements of a real athlete: 24–4096 px, 1–60000 ms, and at most 100 px horizontal motion.
 */
export function gesture(rise, dx, durationMs) {
  if (!finite(rise) || !finite(dx) || !finite(durationMs) ||
      rise < 24 || rise > 4096 || Math.abs(dx) > 100 || durationMs < 1 || durationMs > 60_000) return null;
  const amount = clamp((rise - 24) / (160 - 24), 0, 1);
  return { rise, durationMs, height: HEIGHT_MIN + amount * (HEIGHT_MAX - HEIGHT_MIN), speed: rise / durationMs * 1000 };
}

function trialId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 1_000_000) throw new Error('起跳记录编号无效');
  return value;
}

function validateTrial(value) {
  exactKeys(value, ['id', 'rise', 'durationMs', 'height'], '起跳记录结构无效');
  const expected = gesture(value.rise, 0, value.durationMs);
  if (!expected || !finite(value.height) || Math.abs(value.height - expected.height) > 1e-12) throw new Error('起跳记录与手势参数不一致');
  return { id: trialId(value.id), rise: expected.rise, durationMs: expected.durationMs, height: expected.height };
}

export function validateState(value) {
  exactKeys(value, ['version', 'view', 'camera', 'height', 'trials', 'nextId', 'selectedTrial'], '滑板工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的滑板工作区文件版本');
  if (typeof value.view !== 'string' || (value.view !== 'custom' && !Object.hasOwn(VIEWS, value.view))) throw new Error('滑板观察方向无效');
  if (!Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId > 1_000_000) throw new Error('下一个起跳记录编号无效');
  let previousId = 0;
  const trials = denseArray(value.trials, MAX_TRIALS, '起跳记录最多支持 40 条').map(item => {
    const next = validateTrial(item);
    if (next.id <= previousId || next.id >= value.nextId) throw new Error('起跳记录编号重复、顺序错误或下一个编号过小');
    previousId = next.id;
    return next;
  });
  if (value.selectedTrial !== null && (!Number.isSafeInteger(value.selectedTrial) || !trials.some(item => item.id === value.selectedTrial))) {
    throw new Error('所选起跳记录不存在');
  }
  return {
    version: VERSION, view: value.view, camera: validateCamera(value.camera), height: height(value.height),
    trials, nextId: value.nextId, selectedTrial: value.selectedTrial,
  };
}

export function setView(state, id) {
  const next = validateState(state);
  next.camera = cameraForView(id); next.view = id;
  return next;
}

export function setHeight(state, value) {
  const next = validateState(state);
  next.height = height(value);
  return next;
}

/** Constructing a trial is a pure operation; the application appends it only after landing completes. */
export function createTrial(state, input) {
  const current = validateState(state);
  if (current.nextId >= 1_000_000) throw new Error('起跳记录编号已达到上限');
  exactKeys(input, ['rise', 'durationMs', 'height', 'speed'], '起跳手势参数无效');
  const expected = gesture(input.rise, 0, input.durationMs);
  if (!expected || !finite(input.speed) || Math.abs(input.speed - expected.speed) > 1e-9 ||
      !finite(input.height) || Math.abs(input.height - expected.height) > 1e-12) throw new Error('起跳手势参数不一致');
  return validateTrial({ id: current.nextId, rise: expected.rise, durationMs: expected.durationMs, height: expected.height });
}

export function appendTrial(state, input) {
  const next = validateState(state), trial = createTrial(next, input);
  next.trials.push(trial);
  if (next.trials.length > MAX_TRIALS) next.trials.shift();
  next.nextId++;
  next.selectedTrial = trial.id;
  return validateState(next);
}

export function findTrial(state, id) {
  const current = validateState(state);
  trialId(id);
  const trial = current.trials.find(item => item.id === id);
  if (!trial) throw new Error('起跳记录不存在');
  return trial;
}

export function selectTrial(state, id) {
  const next = validateState(state);
  if (id !== null) findTrial(next, id);
  next.selectedTrial = id;
  return next;
}

function sampleHeight(value) {
  // Zero is supported as a no-flight sample; workspace presets and recorded jumps start at 0.3.
  if (!finite(value) || value < 0 || value > HEIGHT_MAX) throw new Error('动作采样高度无效');
  return value;
}

export function jumpDuration(value) {
  const h = sampleHeight(value);
  return PREPARATION_SECONDS + 2 * Math.sqrt(2 * h / GRAVITY) + LANDING_SECONDS;
}

/** The display carrier follows a vertical projectile arc. The renderer supplies the licensed rig
 *  animation; these weights do not claim inverse kinematics, obstacle contact or athlete physics.
 *  crouch is a continuous 0–1 pose weight; hipLower is in display units and arm is in radians.
 */
export function sampleJump(timeSeconds, value) {
  if (!finite(timeSeconds)) throw new Error('动作采样时间无效');
  const h = sampleHeight(value), airSeconds = 2 * Math.sqrt(2 * h / GRAVITY);
  const landingStart = PREPARATION_SECONDS + airSeconds, duration = landingStart + LANDING_SECONDS;
  const time = clamp(timeSeconds, 0, duration);
  let phase, boardY = 0, verticalSpeed = 0, crouch = 0, arm = 0;
  if (time >= duration) phase = 'done';
  else if (time < PREPARATION_SECONDS) {
    phase = 'preparation'; crouch = smooth(time / PREPARATION_SECONDS); arm = .4 * crouch;
  } else if (time < landingStart) {
    phase = 'air';
    const elapsed = time - PREPARATION_SECONDS, progress = elapsed / airSeconds;
    boardY = Math.max(0, Math.sqrt(2 * h * GRAVITY) * elapsed - .5 * GRAVITY * elapsed * elapsed);
    verticalSpeed = Math.sqrt(2 * h * GRAVITY) - GRAVITY * elapsed;
    crouch = 1 - smooth(progress / .22) + .55 * smooth((progress - .7) / .3);
    arm = .4 * crouch + .7 * Math.sin(Math.PI * progress);
  } else {
    phase = 'landing';
    const progress = (time - landingStart) / LANDING_SECONDS;
    // Compress after contact, then recover; endpoints match the air pose and the stable stand pose.
    crouch = progress <= .35 ? .55 + .45 * smooth(progress / .35) : 1 - smooth((progress - .35) / .65);
    arm = .4 * crouch;
  }
  // A zero-height preview still reaches the prep crouch; make that degenerate boundary continuous.
  if (airSeconds === 0 && phase === 'landing') {
    crouch = 1 - smooth((time - landingStart) / LANDING_SECONDS); arm = .4 * crouch;
  }
  return {
    phase, time, duration, boardY, verticalSpeed, crouch: clamp(crouch, 0, 1),
    hipLower: .24 * crouch, arm, progress: time / duration,
  };
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
  begin(label = '编辑滑板工作区') {
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
    if (this.pending) throw new Error('请先完成当前动作');
    if (typeof fn !== 'function') throw new Error('编辑操作无效');
    this.begin(label);
    try { const next = fn(this.current); if (next !== undefined) this.current = next; return this.commit(); }
    catch (error) { this.cancel(); throw error; }
  }
  run(label, fn) { return this.edit(label, fn); }
  undo() {
    // A pending gesture or motion is cancelled first; an older stable action stays in history.
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
