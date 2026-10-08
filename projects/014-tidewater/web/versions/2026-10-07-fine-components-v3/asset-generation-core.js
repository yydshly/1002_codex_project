// Data-only contract for one generated replacement asset. No provider request or code execution occurs here.
import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { surfaceHeight } from './creation-surfaces.js';

export const ASSET_KINDS = Object.freeze(['cabin', 'lighthouse', 'palm', 'boat']);
export const ASSET_JOB_STATUSES = Object.freeze(['pending', 'running', 'succeeded', 'failed', 'cancelled']);
const DEFAULTS = Object.freeze({
  cabin: { width: 8, height: 7, depth: 7 },
  lighthouse: { width: 5.2, height: 18, depth: 5.2 },
  palm: { width: 10, height: 12, depth: 10 },
  boat: { width: 4, height: 2, depth: 8 },
});
const SUBJECTS = Object.freeze({
  cabin: 'One complete single-storey coastal cabin with a physically plausible roof, walls, glazed windows, door and modest porch. Real weathered timber, plaster and roof materials.',
  lighthouse: 'One complete coastal lighthouse: coherent masonry tower, entrance, windows, top lantern room and safe balcony. Real weathered masonry, glass and metal materials.',
  palm: 'One complete mature tropical palm tree with a continuous trunk and naturally curved individual fronds. Real bark and detailed leaf surfaces; foliage has believable thickness and silhouette.',
  boat: 'One complete small coastal boat with a watertight hull, coherent gunwale, deck and suitable interior. Real painted timber or fibreglass and weathered fittings. Bow and stern lie on the local Z axis.',
});
const JOB_KEYS = ['version', 'id', 'status', 'binding', 'sourcePlan', 'spec', 'appearanceBrief', 'prompt', 'referenceImage', 'output', 'error'];
const SPEC_KEYS = ['width', 'height', 'depth', 'fallbackHeight', 'anchor', 'rotationY'];
const OUTPUT_KEYS = ['method', 'provider', 'model', 'taskId', 'glbUrl', 'license', 'prompt'];
const TRANSITIONS = Object.freeze({ pending: ['running', 'cancelled', 'failed'], running: ['succeeded', 'failed', 'cancelled'], succeeded: [], failed: [], cancelled: [] });
let requestSequence = 0;

function fail(message) { throw new Error(message); }
function fields(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}必须是普通对象。`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${label}包含未知字段。`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}只能包含普通可序列化字段。`);
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}缺少字段「${key}」。`);
}
function text(value, maximum, label, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${label}不是有效文本。`);
  return value.trim();
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value)) fail(`${label}不是有效 ID。`);
  return value;
}
function finite(value, minimum, maximum, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label}超出有限数值范围。`);
  return value;
}
function safeLocation(value, label) {
  const location = text(value, 4096, label);
  if (location.startsWith('/') && !location.startsWith('//') && !location.includes('\\') && !/[\r\n]/u.test(location)) {
    const parsed = new URL(location, 'https://local.invalid');
    if (parsed.origin === 'https://local.invalid') return location;
  }
  let parsed;
  try { parsed = new URL(location); } catch { fail(`${label}须为站内路径或 HTTPS 地址。`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname || /[\r\n]/u.test(location)) fail(`${label}须为站内路径或 HTTPS 地址。`);
  return location;
}
function referenceImage(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2 * 1024 * 1024) fail('参考图片过大或格式无效。');
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)) return value;
  return safeLocation(value, '参考图片');
}
function assetSpec(plan, entity) {
  const defaults = DEFAULTS[entity.kind], point = entity.points[0];
  return {
    width: defaults.width, height: entity.height, depth: defaults.depth, fallbackHeight: defaults.height,
    anchor: { x: (point.x - .5) * plan.world.width, y: surfaceHeight(plan, point), z: (point.y - .5) * plan.world.depth },
    rotationY: 0,
  };
}
function validateSpec(value) {
  fields(value, SPEC_KEYS, SPEC_KEYS, '资产尺寸');
  fields(value.anchor, ['x', 'y', 'z'], ['x', 'y', 'z'], '资产锚点');
  return {
    width: finite(value.width, .001, 2000, '资产宽度'), height: finite(value.height, 0, 100, '资产高度'),
    depth: finite(value.depth, .001, 2000, '资产深度'), fallbackHeight: finite(value.fallbackHeight, .001, 100, '资产默认高度'),
    anchor: { x: finite(value.anchor.x, -1000000, 1000000, '锚点 X'), y: finite(value.anchor.y, -1000000, 1000000, '锚点 Y'), z: finite(value.anchor.z, -1000000, 1000000, '锚点 Z') },
    rotationY: finite(value.rotationY, -Math.PI * 2, Math.PI * 2, '资产朝向'),
  };
}
function promptFor(kind, spec, appearanceBrief) {
  const height = spec.height > 0 ? spec.height : spec.fallbackHeight;
  return [
    'Generate exactly ONE isolated photorealistic, physically plausible 3D asset with textured PBR materials, suitable for close inspection from all sides.',
    SUBJECTS[kind],
    `Target physical envelope: width at most ${spec.width} m, height at most ${height} m, depth at most ${spec.depth} m. Keep believable proportions.`,
    'Use Y-up; place the bottom of the asset on Y=0; centre its footprint on X=0,Z=0. Keep its local orientation consistent across views.',
    'Do not generate an entire scene, island, terrain, landscape, ocean, background, sky, floor plane, pedestal, people, text, watermarks or unrelated extra objects.',
    'Deliver one coherent textured GLB mesh asset. Do not replace, move or regenerate the authored surrounding layout.',
    `Appearance requested by the user: ${appearanceBrief || 'Natural coastal appearance with subtle realistic wear.'}`,
  ].join('\n');
}

/** Bind one isolated asset request to a canonical read-only source snapshot. */
export function createAssetJob(plan, entityId, options = {}) {
  fields(options, ['appearanceBrief', 'referenceImage', 'id'], [], '生成设置');
  const sourcePlan = validatePlan(plan);
  identifier(entityId, '源对象 ID');
  const entity = sourcePlan.entities.find(item => item.id === entityId);
  if (!entity) fail('源对象已删除或不存在。');
  if (!ASSET_KINDS.includes(entity.kind)) fail('资产生成只支持小屋、灯塔、棕榈和船。');
  if (entity.locked) fail('源对象已锁定；解锁后才能生成替换资产。');
  const appearanceBrief = text(options.appearanceBrief ?? '', 2000, '外观说明', true);
  const spec = assetSpec(sourcePlan, entity);
  const generatedId = `asset-${entity.kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(++requestSequence).toString(36)}`}`;
  return {
    version: 1, id: identifier(options.id ?? generatedId, '任务 ID'), status: 'pending',
    binding: { sourceFingerprint: fingerprintPlan(sourcePlan), entityId, kind: entity.kind }, sourcePlan, spec,
    appearanceBrief, prompt: promptFor(entity.kind, spec, appearanceBrief), referenceImage: referenceImage(options.referenceImage), output: null, error: null,
  };
}

function validateOutput(value, prompt) {
  fields(value, OUTPUT_KEYS, OUTPUT_KEYS, '生成结果');
  if (value.method !== 'neural-3d') fail('生成结果须标明 neural-3d；编码模型或素材组装不能冒充神经模型生成。');
  if (value.prompt !== prompt) fail('生成结果的提示词与源任务不一致。');
  return {
    method: 'neural-3d', provider: text(value.provider, 120, '生成服务'), model: text(value.model, 160, '生成模型'),
    taskId: text(value.taskId, 200, '服务任务 ID'), glbUrl: safeLocation(value.glbUrl, 'GLB 地址'),
    license: text(value.license, 1000, '模型许可说明'), prompt,
  };
}

/** Validate stored/job API data without trusting executable fields or mutating the source. */
export function validateAssetJob(value) {
  fields(value, JOB_KEYS, JOB_KEYS, '生成任务');
  if (value.version !== 1) fail('生成任务版本必须为 1。');
  if (!ASSET_JOB_STATUSES.includes(value.status)) fail('生成任务状态无效。');
  fields(value.binding, ['sourceFingerprint', 'entityId', 'kind'], ['sourceFingerprint', 'entityId', 'kind'], '源绑定');
  const original = createAssetJob(value.sourcePlan, value.binding.entityId, { id: value.id, appearanceBrief: value.appearanceBrief, referenceImage: value.referenceImage });
  if (value.binding.sourceFingerprint !== original.binding.sourceFingerprint || value.binding.kind !== original.binding.kind) fail('生成任务的源布局绑定不一致。');
  const spec = validateSpec(value.spec);
  if (JSON.stringify(spec) !== JSON.stringify(original.spec) || value.prompt !== original.prompt) fail('生成任务尺寸、锚点或提示词被修改。');
  if (value.status === 'succeeded') {
    if (value.error !== null) fail('已完成任务不能包含错误。');
    original.output = validateOutput(value.output, original.prompt);
  } else if (value.output !== null) fail('未成功任务不能包含生成结果。');
  if (value.status === 'failed') original.error = text(value.error, 1000, '服务错误');
  else if (value.error !== null) fail('只有失败任务可以包含服务错误。');
  original.status = value.status;
  return original;
}

/** Only actual provider events advance state; no duration-based simulated progress. */
export function transitionAssetJob(job, nextStatus, details = {}) {
  const valid = validateAssetJob(job);
  fields(details, ['output', 'error'], [], '任务变更');
  if (!TRANSITIONS[valid.status].includes(nextStatus)) fail(`不能从 ${valid.status} 变更为 ${nextStatus}。`);
  if (nextStatus === 'succeeded') {
    if (!Object.hasOwn(details, 'output') || Object.hasOwn(details, 'error')) fail('成功任务必须具有真实生成结果。');
    valid.output = validateOutput(details.output, valid.prompt);
  } else if (nextStatus === 'failed') {
    if (!Object.hasOwn(details, 'error') || Object.hasOwn(details, 'output')) fail('失败任务必须具有服务错误。');
    valid.error = text(details.error, 1000, '服务错误');
  } else if (Object.keys(details).length) fail('运行或取消状态不能附带生成结果。');
  valid.status = nextStatus;
  return valid;
}

export function bindingMatchesSource(job, plan) {
  const valid = validateAssetJob(job), source = validatePlan(plan);
  const entity = source.entities.find(item => item.id === valid.binding.entityId);
  return Boolean(entity && !entity.locked && entity.kind === valid.binding.kind && fingerprintPlan(source) === valid.binding.sourceFingerprint);
}

export function assertAssetApplicable(job, plan) {
  const valid = validateAssetJob(job), source = validatePlan(plan);
  if (valid.status !== 'succeeded') fail('生成任务尚未成功，不能应用。');
  const entity = source.entities.find(item => item.id === valid.binding.entityId);
  if (!entity) fail('源对象已删除，不能应用。');
  if (entity.locked) fail('源对象已锁定，不能应用。');
  if (!bindingMatchesSource(valid, source)) fail('源布局已改变，请重新生成，避免资产错位。');
  return valid;
}

function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3) fail(`${label}必须是三个坐标。`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!['0', '1', '2'].includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}只能包含普通坐标。`);
  }
  return [0, 1, 2].map(axis => finite(value[axis], -1000000, 1000000, `${label}分量`));
}

/** Uniform scale preserves proportions; local offset centres X/Z and puts the foot at Y=0. */
export function fitAssetBounds(bounds, spec) {
  fields(bounds, ['min', 'max'], ['min', 'max'], '模型包围盒');
  const min = vector(bounds.min, '包围盒最小值'), max = vector(bounds.max, '包围盒最大值'), target = validateSpec(spec);
  const size = min.map((value, axis) => max[axis] - value);
  if (size.some(value => value < .000001 || value > 1000000)) fail('模型包围盒退化、方向错误或尺寸过大。');
  const height = target.height > 0 ? target.height : target.fallbackHeight;
  const scale = Math.min(target.width / size[0], height / size[1], target.depth / size[2]);
  return {
    scale, offset: [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2],
    position: [target.anchor.x, target.anchor.y, target.anchor.z], rotationY: target.rotationY,
    dimensions: { width: size[0] * scale, height: size[1] * scale, depth: size[2] * scale },
  };
}
