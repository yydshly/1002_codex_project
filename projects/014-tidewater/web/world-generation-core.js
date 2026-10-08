// Read-only whole-scene asset recipe. Importing this module never requests a model or changes a plan.
import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { ASSET_KINDS, createAssetJob, validateAssetJob } from './asset-generation-core.js';

export const WORLD_RECIPE_FORMAT = 'tidewater-world-recipe.v1';
export const WORLD_TASK_STATUSES = Object.freeze(['pending', 'awaiting-asset', 'preserved', 'running', 'succeeded', 'failed']);
const CATALOG_KEYS = ['id', 'kind', 'entityId', 'method', 'url', 'referenceUrl', 'rotationY', 'provenance', 'bytes', 'sha256'];
const PROVENANCE_KEYS = ['provider', 'model', 'taskId', 'license', 'source'];
const RECIPE_KEYS = ['format', 'sourceFingerprint', 'sourcePlan', 'catalog', 'tasks', 'capabilityGaps'];
const TASK_KEYS = ['id', 'entityId', 'kind', 'locked', 'sourceEntity', 'placement', 'source', 'status', 'output', 'error'];
const OUTPUT_KEYS = ['entityId', 'method', 'assetId', 'triangles'];
const TRANSITIONS = Object.freeze({ pending: ['running', 'failed'], running: ['succeeded', 'failed'], failed: ['running'], succeeded: [], preserved: [], 'awaiting-asset': [] });
const copy = value => JSON.parse(JSON.stringify(value));
function fail(message) { throw new Error(message); }
function dataTree(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value)) fail('整场景输入只能包含有限的普通数据，不能包含函数、循环或隐藏字段。');
  const array = Array.isArray(value);
  if (array ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('整场景输入只能包含普通对象和数组。');
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || (array && (!/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) fail('整场景输入不能包含隐藏字段或访问器。');
    dataTree(descriptor.value, seen);
  }
  if (array && Object.keys(value).length !== value.length) fail('整场景输入不能包含空缺数组项。');
  seen.delete(value);
}
function fields(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}必须是普通对象。`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${label}包含未知字段。`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}只能包含普通可序列化字段。`);
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}缺少字段「${key}」。`);
}
function text(value, maximum, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label}不是有效文本。`);
  return value.trim();
}
function id(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value)) fail(`${label}不是有效 ID。`);
  return value;
}
function safeURL(value, label) {
  const location = text(value, 4096, label);
  if (location.startsWith('/') && !location.startsWith('//') && !location.includes('\\')) {
    const parsed = new URL(location, 'https://local.invalid');
    if (parsed.origin === 'https://local.invalid') return location;
  }
  let parsed;
  try { parsed = new URL(location); } catch { fail(`${label}须为站内路径或 HTTPS 地址。`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) fail(`${label}须为站内路径或 HTTPS 地址。`);
  return location;
}
function validateCatalog(catalog, plan) {
  if (!Array.isArray(catalog) || catalog.length > 124) fail('资产清单最多为四种通用资产与 120 个精确对象绑定。');
  const ids = new Set(), kinds = new Set(), boundEntities = new Set();
  return catalog.map(item => {
    fields(item, CATALOG_KEYS, ['id', 'kind', 'method', 'url', 'provenance'], '资产清单项');
    const assetId = id(item.id, '资产 ID');
    if (ids.has(assetId)) fail('资产 ID 重复。');
    ids.add(assetId);
    if (!ASSET_KINDS.includes(item.kind)) fail('精细资产对象类型无效。');
    const entityId = item.entityId ?? null;
    if (entityId === null) {
      if (kinds.has(item.kind)) fail('每种对象只能显式绑定一份通用资产；不可随机挑选或重复绑定。');
      kinds.add(item.kind);
    } else {
      id(entityId, '精确对象 ID');
      if (boundEntities.has(entityId)) fail('同一个精确对象不能重复绑定资产。');
      const entity = plan.entities.find(item => item.id === entityId);
      if (!entity || entity.kind !== item.kind || entity.locked) fail('精确资产必须绑定当前存在、类型匹配且未锁定的源对象。');
      boundEntities.add(entityId);
    }
    if (!['neural-3d', 'scanned-asset'].includes(item.method)) fail('资产清单须标明神经 3D 或真实扫描素材；程序模型不能冒充生成资产。');
    fields(item.provenance, PROVENANCE_KEYS, PROVENANCE_KEYS, '资产来源');
    const provenance = {
      provider: text(item.provenance.provider, 160, '提供方'), model: text(item.provenance.model, 160, '模型或扫描素材名称'),
      taskId: item.method === 'neural-3d' ? text(item.provenance.taskId, 200, '实际模型任务 ID') : item.provenance.taskId === null ? null : text(item.provenance.taskId, 200, '扫描记录 ID'),
      license: text(item.provenance.license, 1000, '许可说明'), source: safeURL(item.provenance.source, '来源地址'),
    };
    const rotationY = item.rotationY ?? 0;
    if (!Number.isFinite(rotationY) || Math.abs(rotationY) > Math.PI * 2) fail('资产朝向须为有限弧度数。');
    const bytes = item.bytes ?? null;
    if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 64 * 1024 * 1024)) fail('资产文件大小超出当前导入限制。');
    const sha256 = item.sha256 ?? null;
    if (sha256 !== null && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256))) fail('资产 SHA-256 无效。');
    return {
      id: assetId, kind: item.kind, entityId, method: item.method, url: safeURL(item.url, '资产地址'),
      referenceUrl: item.referenceUrl === undefined || item.referenceUrl === null ? null : safeURL(item.referenceUrl, '参考图片地址'),
      rotationY, provenance, bytes, sha256,
    };
  });
}
function placement(plan, entity) {
  const points = entity.points.map(point => ({ x: (point.x - .5) * plan.world.width, z: (point.y - .5) * plan.world.depth }));
  const spec = ASSET_KINDS.includes(entity.kind) && !entity.locked ? createAssetJob(plan, entity.id, { id: 'world-spec' }).spec : null;
  return { points, height: entity.height, spec };
}

/** Recover the actual file checksum from a confirmed receipt, or an exactly matching published manifest. */
export function confirmedAssetChecksum(assetJob, receipt, sourceAssetCatalog = []) {
  const job = validateAssetJob(assetJob);
  if (job.status !== 'succeeded') fail('只有真实成功的已确认任务可以复用。');
  dataTree(receipt ?? {}); dataTree(sourceAssetCatalog);
  const bytes = receipt?.output?.bytes ?? receipt?.bytes;
  const sha256 = receipt?.output?.sha256 ?? receipt?.sha256;
  if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 64 * 1024 * 1024)) fail('已确认任务的实际输出文件大小无效。');
  if (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256))) fail('已确认任务的实际输出 SHA-256 无效。');
  if (bytes !== undefined && sha256 !== undefined) return { bytes, sha256, verificationSource: 'confirmed-receipt' };
  const known = validateCatalog(sourceAssetCatalog, job.sourcePlan).find(item => item.kind === job.binding.kind && item.url === job.output.glbUrl && item.provenance.taskId === job.output.taskId && item.provenance.model === job.output.model);
  if (!known || known.bytes === null || known.sha256 === null) fail('已确认资产缺少可核对的真实输出校验记录，请补齐实际任务记录。');
  if ((bytes !== undefined && bytes !== known.bytes) || (sha256 !== undefined && sha256 !== known.sha256)) fail('已确认任务记录与已发布资产校验不一致。');
  return { bytes: known.bytes, sha256: known.sha256, verificationSource: 'matching-published-manifest' };
}

/** One task per original entity. Shared kind assets are explicit reusable assets, not new inference per instance. */
export function createWorldRecipe(plan, sourceAssetCatalog = []) {
  dataTree(sourceAssetCatalog);
  const sourcePlan = validatePlan(plan), catalog = validateCatalog(sourceAssetCatalog, sourcePlan);
  const tasks = sourcePlan.entities.map(entity => {
    const asset = catalog.find(item => item.entityId === entity.id)
      || catalog.find(item => item.kind === entity.kind && item.entityId === null);
    let status = 'pending', source;
    if (entity.locked) {
      status = 'preserved'; source = { method: 'coarse-preserved', assetId: null, url: null, provenance: null };
    } else if (asset) {
      source = { method: asset.method, assetId: asset.id, url: asset.url, provenance: copy(asset.provenance) };
    } else {
      source = { method: 'procedural-geometry', assetId: null, url: null, provenance: null };
      if (ASSET_KINDS.includes(entity.kind)) status = 'awaiting-asset';
    }
    return {
      id: `world-${entity.id}`, entityId: entity.id, kind: entity.kind, locked: entity.locked,
      sourceEntity: copy(entity), placement: placement(sourcePlan, entity), source, status, output: null, error: null,
    };
  });
  const capabilityGaps = ASSET_KINDS.map(kind => ({
    kind, entityIds: tasks.filter(task => task.kind === kind && task.status === 'awaiting-asset').map(task => task.entityId),
    reason: '尚无已验证的精细资产，继续显示上一版程序几何；本次不会声称模型已完成。',
  })).filter(gap => gap.entityIds.length);
  return { format: WORLD_RECIPE_FORMAT, sourceFingerprint: fingerprintPlan(sourcePlan), sourcePlan, catalog, tasks, capabilityGaps };
}

function validateOutput(value, task) {
  fields(value, OUTPUT_KEYS, ['entityId', 'method', 'assetId'], '任务执行结果');
  if (value.entityId !== task.entityId || value.method !== task.source.method || value.assetId !== task.source.assetId) fail('任务结果与原对象或真实来源不匹配。');
  const triangles = value.triangles ?? null;
  if (triangles !== null && (!Number.isSafeInteger(triangles) || triangles < 0 || triangles > 10000000)) fail('三角形数量无效。');
  if (['neural-3d', 'scanned-asset'].includes(task.source.method) && (!triangles || triangles <= 0)) fail('真实资产须成功载入非空网格，才能标为已完成。');
  return { entityId: task.entityId, method: task.source.method, assetId: task.source.assetId, triangles };
}

/** Stored recipes cannot silently edit a source object, lock, footprint, provenance or target envelope. */
export function validateWorldRecipe(value) {
  dataTree(value);
  fields(value, RECIPE_KEYS, RECIPE_KEYS, '整场景方案');
  if (value.format !== WORLD_RECIPE_FORMAT) fail('整场景方案版本不受支持。');
  const canonical = createWorldRecipe(value.sourcePlan, value.catalog);
  if (value.sourceFingerprint !== canonical.sourceFingerprint || JSON.stringify(value.capabilityGaps) !== JSON.stringify(canonical.capabilityGaps)) fail('源布局绑定或能力缺口记录不一致。');
  if (!Array.isArray(value.tasks) || value.tasks.length !== canonical.tasks.length) fail('任务必须与每个原布局对象一一对应。');
  canonical.tasks = canonical.tasks.map((expected, index) => {
    const task = value.tasks[index];
    fields(task, TASK_KEYS, TASK_KEYS, '场景任务');
    for (const key of TASK_KEYS.filter(key => !['status', 'output', 'error'].includes(key))) {
      if (JSON.stringify(task[key]) !== JSON.stringify(expected[key])) fail('任务对象、布局、锁定或资产来源被修改。');
    }
    if (!WORLD_TASK_STATUSES.includes(task.status)) fail('场景任务状态无效。');
    if (['preserved', 'awaiting-asset'].includes(expected.status) && task.status !== expected.status) fail('锁定或缺少资产的对象不能冒充已生成。');
    if (expected.status === 'pending' && ['preserved', 'awaiting-asset'].includes(task.status)) fail('场景任务状态与资产绑定不一致。');
    if (task.status === 'succeeded') {
      if (task.error !== null) fail('成功任务不能包含错误。');
      expected.output = validateOutput(task.output, expected);
    } else if (task.output !== null) fail('尚未完成的任务不能包含成功结果。');
    if (task.status === 'failed') expected.error = text(task.error, 1000, '实际任务错误');
    else if (task.error !== null) fail('只有失败任务可以包含错误。');
    expected.status = task.status;
    return expected;
  });
  return canonical;
}

/** State changes must follow actual load/provider events. There is no elapsed-time progress simulation. */
export function transitionWorldTask(recipe, entityId, nextStatus, details = {}) {
  const valid = validateWorldRecipe(recipe);
  fields(details, ['output', 'error'], [], '任务变更');
  const task = valid.tasks.find(item => item.entityId === entityId);
  if (!task) fail('原布局对象不存在。');
  if (!TRANSITIONS[task.status].includes(nextStatus)) fail(`不能从 ${task.status} 变更为 ${nextStatus}。`);
  if (nextStatus === 'succeeded') {
    if (!Object.hasOwn(details, 'output') || Object.hasOwn(details, 'error')) fail('完成状态须有实际载入结果。');
    task.output = validateOutput(details.output, task); task.error = null;
  } else if (nextStatus === 'failed') {
    if (!Object.hasOwn(details, 'error') || Object.hasOwn(details, 'output')) fail('失败状态须记录实际错误。');
    task.output = null; task.error = text(details.error, 1000, '实际任务错误');
  } else {
    if (Object.keys(details).length) fail('运行状态不能附带成功结果。');
    task.output = null; task.error = null;
  }
  task.status = nextStatus;
  return valid;
}

export function worldBindingMatchesSource(recipe, plan) {
  const valid = validateWorldRecipe(recipe);
  return fingerprintPlan(validatePlan(plan)) === valid.sourceFingerprint;
}

/** Gaps can retain the previous geometry, but pending/failed work cannot be silently committed. */
export function assertWorldApplicable(recipe, plan) {
  const valid = validateWorldRecipe(recipe);
  if (!worldBindingMatchesSource(valid, plan)) fail('源布局已改变，请重新完善，避免对象、尺寸或锁定错位。');
  if (valid.tasks.some(task => ['pending', 'running', 'failed'].includes(task.status))) fail('仍有待处理或失败任务，不能确认这一版。');
  if (!valid.tasks.some(task => task.status === 'succeeded')) fail('没有可以确认的已完成效果。');
  return valid;
}

export function summarizeWorldRecipe(recipe) {
  const valid = validateWorldRecipe(recipe), tasks = valid.tasks;
  return {
    total: tasks.length, locked: tasks.filter(task => task.locked).length,
    pending: tasks.filter(task => task.status === 'pending').length, running: tasks.filter(task => task.status === 'running').length,
    succeeded: tasks.filter(task => task.status === 'succeeded').length, failed: tasks.filter(task => task.status === 'failed').length,
    awaitingAsset: tasks.filter(task => task.status === 'awaiting-asset').length,
    neuralBound: tasks.filter(task => task.source.method === 'neural-3d').length,
    neuralReady: tasks.filter(task => task.source.method === 'neural-3d' && task.status === 'succeeded').length,
    scannedBound: tasks.filter(task => task.source.method === 'scanned-asset').length,
    scannedReady: tasks.filter(task => task.source.method === 'scanned-asset' && task.status === 'succeeded').length,
    procedural: tasks.filter(task => task.source.method === 'procedural-geometry').length,
    uniqueAssets: new Set(tasks.filter(task => task.source.assetId).map(task => task.source.assetId)).size,
    reusableInstances: tasks.filter(task => task.source.assetId).length,
    capabilityGaps: copy(valid.capabilityGaps),
  };
}
