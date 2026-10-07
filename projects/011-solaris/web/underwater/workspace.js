import * as fishCore from './core.js';
import { INITIAL_DIVER, MIN_SEPARATION, validateDiverPose, canDiverMove, chooseFollowStation } from './follower.js';

export {
  MAX_RECORDS, MAX_PATH_POINTS, FISH_RADIUS, SWIM_Y, WATER_BOUNDS, CENTER_BOUNDS,
  INITIAL_FISH, REEFS, VIEWS, clone, cameraForView, validateCamera, canMove,
} from './core.js';
export { INITIAL_DIVER, DIVER_RADIUS, MIN_SEPARATION, FOLLOW_DISTANCE, canFishPastDiver } from './follower.js';
export const VERSION = 2;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_DIVER_PATH_POINTS = 128;
const bytes = value => new TextEncoder().encode(value).byteLength;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const samePose = (a, b) => samePoint(a.position, b.position) && a.heading === b.heading;

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

function point(value) {
  const result = denseArray(value, 2, '潜水员路径点必须为两个有限坐标');
  if (result.length !== 2 || !result.every(n => typeof n === 'number' && Number.isFinite(n)))
    throw new Error('潜水员路径点必须为两个有限坐标');
  return result.map(n => n === 0 ? 0 : n);
}

function separation(fish, diver) {
  return (fish[0] - diver[0]) ** 2 + (fish[1] - diver[1]) ** 2 >= MIN_SEPARATION ** 2 - 1e-12;
}

function diverTrack(value, { legacyField = true } = {}) {
  exactKeys(value, legacyField ? ['from', 'to', 'path', 'legacy'] : ['from', 'to', 'path'], '潜水员跟随记录结构无效');
  if (legacyField && typeof value.legacy !== 'boolean') throw new Error('潜水员历史来源标记无效');
  const from = validateDiverPose(value.from), to = validateDiverPose(value.to);
  const path = denseArray(value.path, MAX_DIVER_PATH_POINTS, '潜水员跟随路径须包含 1 至 128 个采样点').map(point);
  if (!path.length) throw new Error('潜水员跟随路径须包含 1 至 128 个采样点');
  if (!samePoint(path[0], from.position) || !samePoint(path.at(-1), to.position))
    throw new Error('潜水员跟随路径的首末点与姿态不一致');
  for (let i = 0; i < path.length; i++) {
    // The fish moves concurrently. Its final position is not an obstacle for
    // the whole historical diver path; only static reef/water geometry applies.
    const check = canDiverMove(path[Math.max(0, i - 1)], path[i]);
    if (!check.valid) throw new Error(check.reason);
  }
  const legacy = legacyField ? value.legacy : false;
  if (legacy && (path.length !== 1 || !samePose(from, to)))
    throw new Error('旧版迁移记录只能保留静止的初始化潜水员姿态');
  return { from, to, path, legacy };
}

function fishProjection(value, records) {
  return { version: 1, view: value.view, camera: value.camera, fish: value.fish,
    records: records.map(item => ({ id: item.id, path: item.path })), nextId: value.nextId };
}

export function initialState() {
  return { ...fishCore.initialState(), version: VERSION, diver: validateDiverPose(INITIAL_DIVER) };
}

/** Schema 2 keeps the original fish ledger rules and its separate 64 KiB bound.
 * The larger overall cap accommodates at most 40 independently bounded diver
 * paths. Imported angles are retained, not reconstructed from path positions.
 */
export function validateState(value) {
  exactKeys(value, ['version', 'view', 'camera', 'fish', 'records', 'nextId', 'diver'], '水下双角色工作区文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的水下双角色工作区文件版本');
  const rawRecords = denseArray(value.records, fishCore.MAX_RECORDS, '拖动记录最多支持 40 条');
  for (const item of rawRecords) exactKeys(item, ['id', 'path', 'diver'], '水下双角色拖动记录结构无效');
  const fishState = fishCore.validateState(fishProjection(value, rawRecords));
  const diver = validateDiverPose(value.diver);
  let previous = null;
  const records = rawRecords.map((item, index) => {
    const track = diverTrack(item.diver);
    if (previous && !samePose(track.from, previous)) throw new Error('潜水员跟随记录的起始姿态与上一条结束姿态不一致');
    const fishPath = fishState.records[index].path;
    if (!track.legacy && (!separation(fishPath[0], track.from.position) || !separation(fishPath.at(-1), track.to.position)))
      throw new Error('双角色记录的开始或结束位置违反身体间距保护');
    previous = track.to;
    return { ...fishState.records[index], diver: track };
  });
  if (previous && !samePose(diver, previous)) throw new Error('潜水员当前位置或方向与完整跟随记录不一致');
  if (!separation(fishState.fish.position, diver.position)) throw new Error('鱼与潜水员当前位置违反身体间距保护');
  const result = { ...fishState, version: VERSION, records, diver };
  if (bytes(JSON.stringify(result)) > MAX_FILE_BYTES) throw new Error('水下双角色工作区文件最多支持 512 KiB');
  return result;
}

/** A v1 file contains no diver evidence. Give it one safe current station and
 * mark every retained row as legacy with the same stationary initialization.
 * This does not create historical following, teleport routes, or new fish rows.
 */
function migrateV1(value) {
  const fishState = fishCore.validateState(value);
  let diver = validateDiverPose(INITIAL_DIVER);
  if (!separation(fishState.fish.position, diver.position))
    diver = chooseFollowStation(INITIAL_DIVER.position, fishState.fish.position);
  return validateState({ ...fishState, version: VERSION, diver,
    records: fishState.records.map(item => ({ ...item, diver: { from: structuredClone(diver),
      to: structuredClone(diver), path: [[...diver.position]], legacy: true } })) });
}

export function serializeState(state) { return JSON.stringify(validateState(state)); }

export function parseState(text) {
  if (typeof text !== 'string' || bytes(text) > MAX_FILE_BYTES) throw new Error('水下双角色工作区文件最多支持 512 KiB');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('水下工作区 JSON 无法解析'); }
  if (value && value.version === 1) {
    // Preserve the old format's raw-file size restriction as well as its ledger.
    if (bytes(text) > fishCore.MAX_FILE_BYTES) throw new Error('旧版水下工作区文件最多支持 64 KiB');
    return migrateV1(value);
  }
  return validateState(value);
}

export function appendDrag(state, fishPath, track) {
  const next = validateState(state);
  const inputs = denseArray(fishPath, fishCore.MAX_PATH_POINTS, '每次拖动路径最多支持 64 个采样点');
  if (!inputs.length) return next;
  if (inputs.length === 1) {
    const start = point(inputs[0]);
    if (!samePoint(start, next.fish.position)) throw new Error('拖动起点必须是鱼的当前位置');
    return next;
  }
  const fishNext = fishCore.appendDrag(fishProjection(next, next.records), inputs);
  // Zero net fish displacement cancels the whole pair, including any follower
  // preview or facing changes, and consumes neither a row nor an identifier.
  if (fishNext.records.length === next.records.length) return next;
  const diver = diverTrack(track, { legacyField: false });
  if (!samePose(diver.from, next.diver)) throw new Error('跟随起始姿态必须是潜水员的当前完整姿态');
  const records = [...next.records, { ...fishNext.records.at(-1), diver }];
  return validateState({ ...fishNext, version: VERSION, records, diver: diver.to });
}

export function resetFish(state) {
  const next = validateState(state), fishState = fishCore.resetFish(fishProjection(next, next.records));
  return validateState({ ...fishState, version: VERSION, diver: validateDiverPose(INITIAL_DIVER) });
}

export function setView(state, id) {
  const next = validateState(state); next.view = id; next.camera = fishCore.cameraForView(id); return validateState(next);
}

export function setCamera(state, camera) {
  const next = validateState(state); next.camera = fishCore.validateCamera(camera); next.view = 'custom'; return validateState(next);
}

/** Fish, follower and camera snapshots share one transaction and one undo item. */
export class History {
  constructor(state = initialState(), limit = 40) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('历史记录上限必须为 1 至 40');
    this.limit = limit; this.current = validateState(state); this.past = []; this.future = []; this.pending = null;
  }
  get state() { return this.current; }
  set state(value) { this.current = value; }
  get canUndo() { return !!this.pending || this.past.length > 0; }
  get canRedo() { return !!this.pending || this.future.length > 0; }
  begin(label = '拖动鱼并观察潜水员跟随') {
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
    if (this.pending) throw new Error('请先完成当前拖动或跟随');
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
