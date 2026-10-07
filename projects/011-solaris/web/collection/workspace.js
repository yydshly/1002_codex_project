import { validateState as validateCollection } from './core.js';
import { validateProject } from '../studio/core.js';
import { validateState as validateShowroom } from '../showroom/core.js';
import { validateState as validateImaging } from '../imaging/core.js';
import { validateState as validateLandmark } from '../landmark/core.js';
import { validateState as validateKitchen } from '../kitchen/core.js';
import { createKitchenPhysics } from '../kitchen/physics.js';
import { validateState as validateCreative } from '../creative/core.js';
import { validateState as validateSkate } from '../skate/core.js';
import { validateState as validateMaterials } from '../materials/core.js';
import { parseState as parseUnderwater } from '../underwater/workspace.js';

export const MAX_WORKSPACE_BYTES = 12 * 1024 * 1024;
const TRIP_KEY = 'atelier-collection-trip-v1';
const LEGACY_WATER_KEY = 'atelier-underwater-workspace-v1';
export const WORKSPACES = Object.freeze([
  { id: 'collection', name: '精选陈列', key: 'atelier-collection-workspace-v1', maxBytes: 64 * 1024 },
  { id: 'living', name: '客厅工作台', key: 'atelier-workspace-v1', maxBytes: 8_000_000 },
  { id: 'showroom', name: '汽车展厅', key: 'atelier-car-showroom-v1', maxBytes: 32_000 },
  { id: 'imaging', name: '影像工作台', key: 'atelier-imaging-workspace-v1', maxBytes: 64 * 1024 },
  { id: 'landmark', name: '地标视口', key: 'atelier-landmark-workspace-v1', maxBytes: 32 * 1024 },
  { id: 'kitchen', name: '料理备料台', key: 'atelier-kitchen-workspace-v1', maxBytes: 64 * 1024 },
  { id: 'creative', name: '创作台', key: 'atelier-creative-workspace-v1', maxBytes: 3 * 1024 * 1024 },
  { id: 'skate', name: '滑板练习场', key: 'atelier-skate-workspace-v1', maxBytes: 32 * 1024 },
  { id: 'materials', name: '材料教学台', key: 'atelier-materials-workspace-v1', maxBytes: 32 * 1024 },
  { id: 'underwater', name: '水下工作台', key: 'atelier-underwater-workspace-v2', maxBytes: 512 * 1024 },
].map(item => Object.freeze(item)));
const IDS = WORKSPACES.map(item => item.id);
const GUARD_KEYS = [...WORKSPACES.map(item => item.key), TRIP_KEY, LEGACY_WATER_KEY];
const bytes = value => new TextEncoder().encode(value).length;
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);

function exactKeys(value, required, message, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(message);
  const own = Reflect.ownKeys(value), allowed = [...required, ...optional];
  if (required.some(key => !Object.hasOwn(value, key)) || own.some(key => !allowed.includes(key))) throw new Error(message);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(message);
  }
}

// The living app's validator migrates defaults and clamps values. Check every
// supplied field against its checked result, then keep the original stored text.
function checkProject(project) {
  exactKeys(project, ['version', 'name', 'objects', 'environment', 'camera'], '客厅项目结构无效', ['guide']);
  exactKeys(project.environment, ['hour', 'sun', 'wall', 'lampOn', 'lampPower'], '客厅环境结构无效');
  exactKeys(project.camera, ['position', 'target'], '客厅视角结构无效');
  if (project.guide !== undefined) {
    exactKeys(project.guide, ['enabled', 'completed'], '客厅教程结构无效');
    if (!Array.isArray(project.guide.completed) || new Set(project.guide.completed).size !== project.guide.completed.length) throw new Error('客厅教程进度不能重复');
  }
  if (!project.objects || typeof project.objects !== 'object' || Array.isArray(project.objects)) throw new Error('客厅对象清单无效');
  const checked = validateProject(project);
  if (canonical(project.environment) !== canonical(checked.environment)) throw new Error('客厅环境参数超出有效范围');
  if (canonical(project.camera) !== canonical(checked.camera)) throw new Error('客厅视角参数需在原工作台修正后保存');
  if (project.guide !== undefined && canonical(project.guide) !== canonical(checked.guide)) throw new Error('客厅教程进度需在原工作台修正后保存');
  for (const [id, value] of Object.entries(project.objects)) {
    const kind = checked.objects[id].kind;
    const optional = ['kind', 'hidden', 'stretch'];
    if (['sofa', 'chair'].includes(kind)) optional.push('color', 'material');
    if (kind === 'table') optional.push('variant');
    if (kind === 'art') optional.push('artwork', 'customImage');
    if (kind === 'lamp') optional.push('parent');
    exactKeys(value, ['x', 'y', 'z', 'rotation', 'scale'], '客厅对象字段无效', optional);
    if (value.stretch !== undefined) exactKeys(value.stretch, ['x', 'y', 'z'], '客厅独立尺寸结构无效');
    for (const key of Object.keys(value)) if (canonical(value[key]) !== canonical(checked.objects[id][key])) throw new Error('客厅对象参数需在原工作台修正后保存');
  }
}

function checkLiving(value) {
  exactKeys(value, ['project', 'slots'], '客厅保存记录必须包含当前方案和 A/B 方案');
  exactKeys(value.slots, ['a', 'b'], '客厅 A/B 方案结构无效');
  checkProject(value.project);
  for (const slot of Object.values(value.slots)) {
    if (slot === null) continue;
    exactKeys(slot, ['project', 'thumbnail', 'date'], '客厅方案槽结构无效');
    if (typeof slot.thumbnail !== 'string' || slot.thumbnail.length > 2_000_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(slot.thumbnail)) throw new Error('客厅方案缩略图无效');
    if (typeof slot.date !== 'string' || slot.date.length > 30) throw new Error('客厅方案日期必须是最多 30 字符的文本，避免重开时截断');
    checkProject(slot.project);
  }
}

// Registered image identity and dimensions from assets/imaging/manifest.json.
// No image decoding, fetch, canvas, or app initialization is needed here.
const IMAGING_ASSETS = Object.freeze([
  Object.freeze({ id: 'hand', width: 1466, height: 2082 }),
  Object.freeze({ id: 'chest-lateral', width: 1769, height: 2453 }),
]);
function checkImaging(value) {
  exactKeys(value, ['format', 'version', 'activeId', 'viewport', 'states'], '影像工作区结构无效');
  if (value.format !== 'atelier-imaging' || value.version !== 1 || !IMAGING_ASSETS.some(asset => asset.id === value.activeId)) throw new Error('影像工作区版本或原片编号无效');
  exactKeys(value.viewport, ['width', 'height'], '影像工作区视口无效');
  if (!['width', 'height'].every(key => Number.isFinite(value.viewport[key]) && value.viewport[key] >= 1 && value.viewport[key] <= 100_000)) throw new Error('影像工作区视口尺寸无效');
  exactKeys(value.states, IMAGING_ASSETS.map(asset => asset.id), '影像工作区须包含全部登记原片');
  for (const asset of IMAGING_ASSETS) {
    const state = validateImaging(value.states[asset.id]);
    if (state.imageId !== asset.id || state.image.width !== asset.width || state.image.height !== asset.height) throw new Error('影像原片编号或尺寸不匹配');
    if (state.appearance.brightness < -.8 || state.appearance.contrast < .25 || state.appearance.contrast > 4) throw new Error('影像显示参数超出工作台范围');
  }
}

const VALIDATORS = Object.freeze({
  collection: validateCollection, living: checkLiving, showroom: validateShowroom,
  imaging: checkImaging, landmark: validateLandmark,
  kitchen: value => { const checked = validateKitchen(value); createKitchenPhysics().reset(checked.items); },
  creative: validateCreative, skate: validateSkate, materials: validateMaterials,
  underwater: (value, raw) => { if (value?.version !== 2) throw new Error('水下旧版本需先到工作台保存升级'); parseUnderwater(raw); },
});

function inspect(item, raw, current = raw, legacy = false) {
  const entry = { id: item.id, name: item.name, status: 'empty', bytes: raw === null ? 0 : bytes(raw), changed: raw !== current, legacy, message: '没有当前版本的已保存配置；恢复时跳过，不删除本机记录' };
  if (raw === null) {
    if (legacy) entry.message = '发现旧版水下存档；请先到水下工作台明确保存升级。旧版原文不在本备份内';
    return entry;
  }
  try {
    if (entry.bytes > item.maxBytes) throw new Error('原文超过该工作台的文件容量限制');
    VALIDATORS[item.id](JSON.parse(raw), raw);
    entry.status = 'saved'; entry.message = '可恢复完整已保存配置；未保存操作与运行中动画不在备份内';
    if (item.id === 'living') entry.message = '包含当前方案、A/B 方案、缩略图和日期；恢复保持原文';
    if (item.id === 'imaging') entry.message = '包含两张登记原片的视口、校准和标注；重开时按当前屏幕调整视口中心';
    if (item.id === 'creative') entry.message = '包含登记来源选区、图层和笔迹；使用项目自带来源图，不包含新上传来源';
  } catch (error) {
    entry.status = 'invalid';
    entry.message = '原文保留但不能恢复：' + (error instanceof SyntaxError ? '记录不是完整JSON，请使用对应工作台的有效备份' : error.message);
  }
  return entry;
}

function makeBundle(snapshot) {
  return Object.freeze({ format: 'atelier-workspace', version: 1, createdAt: new Date().toISOString(),
    records: Object.freeze(Object.fromEntries(WORKSPACES.map(item => [item.id, snapshot.get(item.key)]))) });
}
function parseBundle(text) {
  if (typeof text !== 'string' || bytes(text) > MAX_WORKSPACE_BYTES) throw new Error('整套备份文件最多支持 12 MiB');
  let value;
  try { value = JSON.parse(text); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('文件不是完整JSON，请选择整套工作台导出的有效备份');
    throw error;
  }
  exactKeys(value, ['format', 'version', 'createdAt', 'records'], '整套备份结构无效');
  if (value.format !== 'atelier-workspace' || value.version !== 1) throw new Error('不支持的整套备份格式或版本');
  if (typeof value.createdAt !== 'string' || value.createdAt.length !== 24 || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) throw new Error('整套备份创建时间无效');
  exactKeys(value.records, IDS, '整套备份必须包含十个登记工作台，不能自定义存储键');
  if (IDS.some(id => value.records[id] !== null && typeof value.records[id] !== 'string')) throw new Error('工作台记录必须是完整原文或 null');
  return Object.freeze({ ...value, records: Object.freeze({ ...value.records }) });
}

/**
 * Reads only persisted workspaces. Exact raw comparisons and owned rollback
 * protect against detected changes; several localStorage keys are not an atomic
 * cross-window transaction. Existing scene windows must reopen after restoration.
 */
export function createWorkspaceBackup(storage) {
  let preview = null;
  const result = (ok, status, message, extra = {}) => ({ ok, status, message, ...extra });
  function get(key) {
    const raw = storage.getItem(key);
    if (raw !== null && typeof raw !== 'string') throw new Error('存储未返回完整原文');
    return raw;
  }
  function read() { return new Map(GUARD_KEYS.map(key => [key, get(key)])); }
  function changed(snapshot) { return GUARD_KEYS.some(key => get(key) !== snapshot.get(key)); }
  function stableRead() {
    const snapshot = read();
    if (changed(snapshot)) { const error = new Error('读取期间其他窗口修改了保存记录，请重新读取'); error.conflict = true; throw error; }
    return snapshot;
  }
  function restore(key, previous, written) {
    try {
      const present = get(key);
      if (present === previous) return 'restored';
      if (present !== written) return 'newer-preserved';
      if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
      return get(key) === previous ? 'restored' : 'newer-preserved';
    } catch { return 'failed'; }
  }
  const unavailable = (extra = {}) => result(false, 'unavailable', '本机存储未能完整读取或写入；请重新预览后再恢复', extra);
  const conflict = (extra = {}) => result(false, 'conflict', '预览后其他窗口修改了保存记录；未覆盖其最新原文，请重新预览', extra);

  return Object.freeze({
    capture() {
      preview = null;
      let snapshot;
      try { snapshot = stableRead(); } catch (error) { return error.conflict ? conflict() : unavailable(); }
      const bundle = makeBundle(snapshot), entries = WORKSPACES.map(item => inspect(item, bundle.records[item.id], undefined, item.id === 'underwater' && snapshot.get(item.key) === null && snapshot.get(LEGACY_WATER_KEY) !== null));
      if (bytes(JSON.stringify(bundle)) > MAX_WORKSPACE_BYTES) return result(false, 'invalid-backup', '本机原文合计超过 12 MiB，无法生成整套文件；请先分别备份容量较大的工作台', { entries });
      return result(true, 'captured', '已读取十个工作台的已保存原文；损坏项仅保留用于救援，空项不会删除记录', { bundle, entries });
    },
    preview(text) {
      preview = null;
      let bundle;
      try { bundle = parseBundle(text); } catch (error) { return result(false, 'invalid-backup', '未预览：' + error.message); }
      let snapshot;
      try { snapshot = stableRead(); } catch (error) { return error.conflict ? conflict() : unavailable(); }
      const entries = WORKSPACES.map(item => inspect(item, bundle.records[item.id], snapshot.get(item.key), item.id === 'underwater' && snapshot.get(item.key) === null && snapshot.get(LEGACY_WATER_KEY) !== null));
      // Keep a private copy of selection eligibility; UI mutations cannot bypass checks.
      preview = { bundle, snapshot, allowed: new Set(entries.filter(entry => entry.status === 'saved').map(entry => entry.id)) };
      const current = makeBundle(snapshot), currentOversized = bytes(JSON.stringify(current)) > MAX_WORKSPACE_BYTES;
      return result(true, 'previewed', '已逐项校验并记录本机原文基线；仅恢复选中的合法差异项，空项与损坏项保持本机记录', {
        bundle, entries, currentBundle: currentOversized ? null : current,
        currentBackupMessage: currentOversized ? '恢复前原文合计超过 12 MiB，请先分别备份较大的工作台；没有生成无法重新打开的整套文件' : '',
      });
    },
    apply(selectedIds) {
      if (!preview) return result(false, 'no-preview', '请先成功预览整套备份，再选择恢复项', { writtenIds: [] });
      const dataOnly = Array.isArray(selectedIds) && selectedIds.length <= IDS.length && Array.from({ length: selectedIds.length }, (_, index) => Object.getOwnPropertyDescriptor(selectedIds, String(index)))
        .every(descriptor => descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
      if (!Array.isArray(selectedIds) || Object.getPrototypeOf(selectedIds) !== Array.prototype || Reflect.ownKeys(selectedIds).length !== selectedIds.length + 1 ||
          selectedIds.length > IDS.length || !dataOnly || !selectedIds.every(id => typeof id === 'string' && preview.allowed.has(id)) || new Set(selectedIds).size !== selectedIds.length) {
        return result(false, 'invalid-selection', '只能选择预览中合法且不重复的工作台；空项和损坏项不能恢复', { writtenIds: [] });
      }
      const prepared = preview; preview = null;
      try { if (changed(prepared.snapshot)) return conflict({ writtenIds: [] }); } catch { return unavailable({ writtenIds: [] }); }
      const selected = new Set(selectedIds), targets = WORKSPACES.filter(item => selected.has(item.id) && prepared.bundle.records[item.id] !== prepared.snapshot.get(item.key));
      if (!targets.length) return result(true, 'unchanged', '选中的合法配置与本机原文一致；没有写入或删除任何记录', { writtenIds: [] });
      const expected = new Map(prepared.snapshot), attempted = [], writtenIds = [];
      let cause = 'unavailable';
      try {
        for (const item of targets) {
          if (changed(expected)) { cause = 'conflict'; throw new Error('记录已变化'); }
          const raw = prepared.bundle.records[item.id];
          attempted.push({ item, raw, previous: prepared.snapshot.get(item.key) });
          storage.setItem(item.key, raw); expected.set(item.key, raw);
          if (changed(expected)) { cause = 'conflict'; throw new Error('写入期间记录已变化'); }
          writtenIds.push(item.id);
        }
        return result(true, 'applied', '已恢复选中工作台的完整保存原文；请重开相应工作台加载。多键写入不保证跨窗口原子性', { writtenIds, rollback: null });
      } catch {
        const outcomes = attempted.reverse().map(({ item, raw, previous }) => restore(item.key, previous, raw));
        const rollback = outcomes.includes('failed') ? 'failed' : outcomes.includes('newer-preserved') ? 'newer-preserved' : 'restored';
        const extra = { writtenIds, rollback };
        if (rollback === 'failed') return result(false, 'unavailable', '恢复未完成，部分回滚也无法确认；请重新读取各工作台并保留备份，尚未保证恢复前状态', extra);
        if (cause === 'conflict' || rollback === 'newer-preserved') return conflict(extra);
        return result(false, 'unavailable', '恢复未完成；已恢复本次仍归自己所有的写入，请重新预览后重试', extra);
      }
    },
  });
}
