import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';

export const COMPLETION_FORMAT = 'tidewater-scene-completion.v1';
export const TREATMENTS = Object.freeze({
  land: ['natural-coast', 'rocky-coast', 'meadow'],
  water: ['lagoon', 'clear-water', 'pond'],
  road: ['sand-path', 'stone-path', 'timber-path'],
  cabin: ['coastal-cabin', 'timber-cabin'],
  lighthouse: ['stone-lighthouse', 'striped-lighthouse'],
  palm: ['lush-palm', 'slender-palm'],
  boat: ['fishing-boat', 'rowing-boat'],
});
const colorSchema = () => ({ type: 'string', pattern: '^#[a-fA-F0-9]{6}$' });
const num = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const str = maxLength => ({ type: 'string', minLength: 1, maxLength });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export function completionSchema(inputPlan) {
  const plan = validatePlan(inputPlan);
  return obj({
    format: { type: 'string', const: COMPLETION_FORMAT },
    sourceFingerprint: { type: 'string', const: fingerprintPlan(plan) },
    title: str(120), summary: str(1600),
    environment: obj({
      lighting: { type: 'string', enum: ['day', 'sunset'] },
      waterColor: colorSchema(), groundTint: colorSchema(), sandTint: colorSchema(), rockTint: colorSchema(),
      exposure: num(.7, 1.4), fog: num(.0002, .005),
      sunAzimuth: num(-180, 180), sunElevation: num(15, 85), seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
    }),
    objects: { type: 'array', minItems: plan.entities.length, maxItems: plan.entities.length, items: {
      anyOf: plan.entities.map(entity => obj({
        id: { type: 'string', const: entity.id }, kind: { type: 'string', const: entity.kind },
        treatment: { type: 'string', enum: entity.locked ? ['preserve'] : TREATMENTS[entity.kind] },
        materialColor: colorSchema(), accentColor: colorSchema(),
        roughness: num(.2, 1), rotationDeg: entity.locked ? { type: 'number', const: 0 } : num(-180, 180),
        density: num(0, 1), relief: num(0, .8), note: str(600),
      })),
    } },
  });
}
function fail(message) { throw new Error(message); }
function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}须为普通对象。`);
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !keys.includes(key) || !desc.enumerable || !Object.hasOwn(desc, 'value')) fail(`${label}包含未知或非序列化字段。`);
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}缺少 ${key}。`);
}
function number(value, min, max, label) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}须在 ${min} 到 ${max} 之间。`); return value; }
function text(value, max, label) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${label}不是有效文本。`); return value; }
function color(value) { if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(value)) fail('材质颜色须为六位十六进制颜色。'); return value.toLowerCase(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Model output has no coordinates, scale or external asset URLs. Geometry is
 * always supplied by the exact authored plan, never silently repaired afterward. */
export function validateCompletionRecipe(input, inputPlan, options = {}) {
  const plan = validatePlan(inputPlan);
  fields(input, ['format', 'sourceFingerprint', 'title', 'summary', 'environment', 'objects'], '场景候选');
  if (input.format !== COMPLETION_FORMAT) fail('整场景候选格式不匹配。');
  if (input.sourceFingerprint !== fingerprintPlan(plan)) fail('布局已经变化，候选不能应用到不同输入。');
  const e = input.environment;
  fields(e, ['lighting', 'waterColor', 'groundTint', 'sandTint', 'rockTint', 'exposure', 'fog', 'sunAzimuth', 'sunElevation', 'seed'], '场景环境');
  if (!['day', 'sunset'].includes(e.lighting)) fail('光照只支持白天或日落。');
  const environment = { lighting: e.lighting, waterColor: color(e.waterColor), groundTint: color(e.groundTint), sandTint: color(e.sandTint), rockTint: color(e.rockTint), exposure: number(e.exposure, .7, 1.4, '曝光'), fog: number(e.fog, .0002, .005, '雾密度'), sunAzimuth: number(e.sunAzimuth, -180, 180, '太阳方位'), sunElevation: number(e.sunElevation, 15, 85, '太阳高度'), seed: number(e.seed, 0, 4294967295, '种子') };
  if (!Number.isInteger(environment.seed)) fail('种子须为 uint32 整数。');
  if (!Array.isArray(input.objects) || input.objects.length !== plan.entities.length) fail('候选必须覆盖全部原对象，数量须一致。');
  const originals = new Map(plan.entities.map(entity => [entity.id, entity])), seen = new Set();
  const objects = input.objects.map(item => {
    fields(item, ['id', 'kind', 'treatment', 'materialColor', 'accentColor', 'roughness', 'rotationDeg', 'density', 'relief', 'note'], '场景对象');
    const entity = originals.get(item.id);
    if (!entity || item.kind !== entity.kind || seen.has(item.id)) fail('候选出现未知、重复或种类不匹配的对象。');
    seen.add(item.id);
    if (!(entity.locked ? ['preserve'] : TREATMENTS[entity.kind]).includes(item.treatment)) fail(`${item.id}的外观方案不受当前执行器支持。`);
    if (entity.locked && item.rotationDeg !== 0) fail('锁定对象不能改变朝向。');
    return { id: item.id, kind: item.kind, treatment: item.treatment, materialColor: color(item.materialColor), accentColor: color(item.accentColor), roughness: number(item.roughness, .2, 1, '粗糙度'), rotationDeg: number(item.rotationDeg, -180, 180, '朝向'), density: number(item.density, 0, 1, '密度'), relief: number(item.relief, 0, .8, '微地形'), note: text(item.note, 600, '对象说明') };
  });
  // Canonical order makes unchanged records auditable despite model array order.
  objects.sort((a, b) => plan.entities.findIndex(e => e.id === a.id) - plan.entities.findIndex(e => e.id === b.id));
  const result = { format: COMPLETION_FORMAT, sourceFingerprint: input.sourceFingerprint, title: text(input.title, 120, '标题'), summary: text(input.summary, 1600, '生成说明'), environment, objects };
  if (options.previousRecipe) {
    const previous = validateCompletionRecipe(options.previousRecipe, plan);
    const scope = new Set(options.scopeIds || []);
    if (!scope.size || [...scope].some(id => !originals.has(id) || originals.get(id).locked)) fail('局部修改须选择有效且未锁定的对象或区域。');
    if (!same(environment, previous.environment)) fail('局部修改改变了全局环境，已拒绝候选。');
    for (const item of objects) if (!scope.has(item.id) && !same(item, previous.objects.find(prior => prior.id === item.id))) fail(`局部修改影响了范围外对象 ${item.id}，已拒绝候选。`);
  }
  return result;
}
export function completionConsistency(inputPlan, recipe, previousRecipe = null, scopeIds = []) {
  const plan = validatePlan(inputPlan), valid = validateCompletionRecipe(recipe, plan, previousRecipe ? { previousRecipe, scopeIds } : {});
  return { sourceFingerprint: valid.sourceFingerprint, entityCount: plan.entities.length, preservedGeometry: true, preservedIds: true, preservedLocks: true, unchangedOutsideScope: previousRecipe ? true : null, changedIds: previousRecipe ? valid.objects.filter(e => !same(e, previousRecipe.objects.find(p => p.id === e.id))).map(e => e.id) : valid.objects.filter(e => e.treatment !== 'preserve').map(e => e.id), visualQuality: 'needs-user-review', checks: ['原轮廓、位置、数量和高度由原布局直接执行', '全部稳定 ID 与锁定一致', ...(previousRecipe ? ['范围外外观与全局环境一致'] : []), '外观、多视角与物体衔接仍需人工检查'] };
}
