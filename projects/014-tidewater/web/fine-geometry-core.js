// Data-only model-authored component geometry; importing this module runs no code or model.
import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { validateCompletionRecipe } from './scene-completion-core.js';

export const FINE_GEOMETRY_FORMAT = 'tidewater-fine-geometry.v1';
export const FINE_GEOMETRY_PATCH_FORMAT = 'tidewater-fine-geometry-patch.v1';
export const FINE_ASSET_KINDS = Object.freeze(['cabin', 'lighthouse', 'palm', 'boat']);
export const FINE_PRIMITIVES = Object.freeze(['box', 'ellipsoid', 'cylinder', 'cone', 'torus', 'gable-roof', 'curved-tube', 'leaf', 'ribbon', 'lathe', 'mesh']);
export const FINE_TEXTURES = Object.freeze(['none', 'plaster', 'wood', 'rock', 'grass']);
export const FINE_LIMITS = Object.freeze({ materials: 16, templates: 12, parts: 100, repeat: 64, renderedParts: 2500, meshPoints: 256, indices: 1536, segments: 48 });
const fail = message => { throw new Error(message); };
const textSchema = maxLength => ({ type: 'string', minLength: 1, maxLength });
const idSchema = () => ({ type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' });
const colorSchema = () => ({ type: 'string', pattern: '^#[a-fA-F0-9]{6}$' });
const numSchema = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const vectorSchema = (min, max) => ({ type: 'array', minItems: 3, maxItems: 3, items: numSchema(min, max) });
const targetEntities = plan => plan.entities.filter(entity => !entity.locked && FINE_ASSET_KINDS.includes(entity.kind));

export function fineGeometrySchema(inputPlan, inputBaseRecipe = null) {
  const plan = validatePlan(inputPlan), targets = targetEntities(plan);
  if (!targets.length) fail('当前布局没有可精细化的未锁定物体。');
  const base = inputBaseRecipe ? validateCompletionRecipe(inputBaseRecipe, plan) : null;
  const part = objectSchema({
    id: idSchema(), primitive: { type: 'string', enum: [...FINE_PRIMITIVES] }, material: idSchema(),
    center: vectorSchema(-.7, 1.1), size: vectorSchema(.002, 1.4), rotationDeg: vectorSchema(-360, 360),
    points: { type: 'array', minItems: 0, maxItems: FINE_LIMITS.meshPoints, items: vectorSchema(-1, 1) },
    indices: { type: 'array', minItems: 0, maxItems: FINE_LIMITS.indices, items: { type: 'integer', minimum: 0, maximum: FINE_LIMITS.meshPoints - 1 } },
    repeat: objectSchema({ count: { type: 'integer', minimum: 1, maximum: FINE_LIMITS.repeat }, step: vectorSchema(-1.4, 1.4), turnDeg: vectorSchema(-360, 360) }),
    segments: { type: 'integer', minimum: 3, maximum: FINE_LIMITS.segments },
  });
  return objectSchema({
    format: { type: 'string', const: FINE_GEOMETRY_FORMAT }, sourceFingerprint: { type: 'string', const: fingerprintPlan(plan) },
    title: textSchema(120), summary: textSchema(2000),
    materials: { type: 'array', minItems: 1, maxItems: FINE_LIMITS.materials, items: objectSchema({
      id: idSchema(), label: textSchema(120), color: colorSchema(), roughness: numSchema(.05, 1), metalness: numSchema(0, 1),
      texture: { type: 'string', enum: [...FINE_TEXTURES] }, opacity: numSchema(.08, 1), emissive: colorSchema(),
    }) },
    templates: { type: 'array', minItems: 1, maxItems: Math.min(targets.length, FINE_LIMITS.templates), items: objectSchema({
      id: idSchema(), label: textSchema(120), parts: { type: 'array', minItems: 1, maxItems: FINE_LIMITS.parts, items: part },
    }) },
    instances: { type: 'array', minItems: targets.length, maxItems: targets.length, items: { anyOf: targets.map(entity => objectSchema({
      entityId: { type: 'string', const: entity.id }, templateId: idSchema(),
      rotationDeg: base ? { type: 'number', const: base.objects.find(object => object.id === entity.id).rotationDeg } : numSchema(-180, 180),
    })) } },
  });
}

export function validateFineScope(inputPlan, scopeIds) {
  dataTree(scopeIds);
  const plan = validatePlan(inputPlan), eligible = targetEntities(plan), allowed = new Set(eligible.map(entity => entity.id));
  list(scopeIds, 1, eligible.length, '局部范围');
  if (new Set(scopeIds).size !== scopeIds.length || scopeIds.some(entityId => !allowed.has(entityId))) fail('局部范围须为有效且未锁定的小屋、灯塔、棕榈或船物体，且不能重复。');
  return eligible.filter(entity => scopeIds.includes(entity.id)).map(entity => entity.id);
}

/** Only scoped objects are generated. Omitted material definitions may borrow
 * a verified previous material by its exact ID; shared definitions are isolated
 * by the merger if a scoped edit changes their values. */
export function fineGeometryPatchSchema(inputPlan, previousGeometry, scopeIds, inputBaseRecipe = null) {
  const plan = validatePlan(inputPlan), options = inputBaseRecipe ? { baseRecipe: inputBaseRecipe } : {};
  const previous = validateFineGeometry(previousGeometry, plan, options), scope = new Set(validateFineScope(plan, scopeIds));
  const schema = fineGeometrySchema(plan, inputBaseRecipe);
  schema.properties.format.const = FINE_GEOMETRY_PATCH_FORMAT;
  schema.properties.materials.minItems = 0;
  schema.properties.templates.maxItems = Math.min(scope.size, FINE_LIMITS.templates);
  schema.properties.instances.minItems = scope.size; schema.properties.instances.maxItems = scope.size;
  schema.properties.instances.items.anyOf = schema.properties.instances.items.anyOf.filter(item => scope.has(item.properties.entityId.const));
  for (const item of schema.properties.instances.items.anyOf) item.properties.rotationDeg = { type: 'number', const: previous.instances.find(instance => instance.entityId === item.properties.entityId.const).rotationDeg };
  return schema;
}

// Reject getters, polluted objects, cycles and oversized trees before touching their values.
function dataTree(value, depth = 0, state = { active: new Set(), nodes: 0 }) {
  if (++state.nodes > 200000 || depth > 12) fail('精细几何数据过大或嵌套过深。');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('精细几何数据含非有限数字。'); return; }
  if (typeof value !== 'object' || state.active.has(value)) fail('精细几何数据含循环或非 JSON 值。');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('精细几何数据须为普通对象。');
  state.active.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && (value.length > 10000 || keys.length !== value.length + 1)) fail('精细几何数组须为有界的连续数组。');
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key) || !desc.enumerable || !Object.hasOwn(desc, 'value')) fail('精细几何数据含未知或非序列化字段。');
    if (Array.isArray(value) && (!/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) fail('精细几何数组含额外字段。');
    dataTree(desc.value, depth + 1, state);
  }
  state.active.delete(value);
}
function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}须为普通对象。`);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) fail(`${label}包含未知或缺少字段。`);
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${label}不是有效文本。`);
  return value;
}
function id(value, label) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value)) fail(`${label}不是有效 ID。`); return value; }
function number(value, min, max, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}超出有限数值范围。`); return value; }
function integer(value, min, max, label) { number(value, min, max, label); if (!Number.isSafeInteger(value)) fail(`${label}须为整数。`); return value; }
function color(value) { if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(value)) fail('材质颜色须为六位十六进制颜色。'); return value.toLowerCase(); }
function list(value, min, max, label) { if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label}数量超出预算。`); return value; }
function vector(value, min, max, label) { return list(value, 3, 3, label).map(component => number(component, min, max, label)); }
function unique(items, label) { const seen = new Set(); for (const item of items) { if (seen.has(item.id)) fail(`${label} ID 重复。`); seen.add(item.id); } return seen; }
function triangleArea(a, b, c) {
  const u = b.map((v, index) => v - a[index]), v = c.map((w, index) => w - a[index]);
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}
function validatePart(input, materialIds) {
  fields(input, ['id', 'primitive', 'material', 'center', 'size', 'rotationDeg', 'points', 'indices', 'repeat', 'segments'], '几何部件');
  if (!FINE_PRIMITIVES.includes(input.primitive)) fail('几何 primitive 不受支持。');
  const material = id(input.material, '部件材质'); if (!materialIds.has(material)) fail('部件引用未知材质。');
  const center = vector(input.center, -.7, 1.1, '部件位置');
  if (center[0] > .7 || center[2] > .7 || center[1] < -.1) fail('部件中心越过模板局部范围。');
  const points = list(input.points, 0, FINE_LIMITS.meshPoints, '部件顶点').map(point => vector(point, -1, 1, '局部顶点'));
  const indices = list(input.indices, 0, FINE_LIMITS.indices, '三角形索引').map(index => integer(index, 0, Math.max(0, points.length - 1), '三角形索引'));
  if (input.primitive === 'mesh') {
    if (points.length < 3 || indices.length < 3 || indices.length % 3) fail('自定义网格须包含完整三角形。');
    for (let i = 0; i < indices.length; i += 3) if (triangleArea(...indices.slice(i, i + 3).map(index => points[index])) < 1e-8) fail('自定义网格含退化三角形。');
  } else {
    if (indices.length) fail('只有 mesh 部件可提供三角形索引。');
    if (['curved-tube', 'lathe'].includes(input.primitive)) {
      if (points.length < 2) fail('曲线或旋转轮廓至少需要两个点。');
      for (let i = 1; i < points.length; i++) if (Math.hypot(...points[i].map((v, axis) => v - points[i - 1][axis])) < 1e-6) fail('曲线轮廓含重复相邻点。');
      if (input.primitive === 'lathe' && (points.some(point => point[0] < 0 || point[2] !== 0) || !points.some(point => point[0] > 0))) fail('旋转轮廓须使用非负半径与零 Z 坐标。');
    } else if (input.primitive === 'ribbon') {
      if (points.length < 4 || points.length % 2) fail('ribbon 须由至少两个连续左右边界截面组成，顶点数为偶数。');
      for (let i = 0; i < points.length; i += 2) {
        if (Math.hypot(...points[i].map((v, axis) => v - points[i + 1][axis])) < 1e-6) fail('ribbon 截面左右宽度须非零。');
        if (i + 3 >= points.length) continue;
        const center = points[i].map((v, axis) => (v + points[i + 1][axis]) / 2), next = points[i + 2].map((v, axis) => (v + points[i + 3][axis]) / 2);
        if (Math.hypot(...center.map((v, axis) => v - next[axis])) < 1e-6) fail('ribbon 相邻截面中心不能重合。');
        if (triangleArea(points[i], points[i + 1], points[i + 2]) < 1e-8 || triangleArea(points[i + 1], points[i + 3], points[i + 2]) < 1e-8) fail('ribbon 相邻截面须形成两个非退化三角形。');
      }
    } else if (input.primitive === 'leaf') {
      if (points.length < 3 || !points.slice(2).some(point => triangleArea(points[0], points[1], point) > 1e-8)) fail('叶片须有三个以上非共线点。');
    } else if (points.length) fail('该 primitive 不接受自定义顶点。');
  }
  fields(input.repeat, ['count', 'step', 'turnDeg'], '重复设置');
  const repeat = { count: integer(input.repeat.count, 1, FINE_LIMITS.repeat, '重复数量'), step: vector(input.repeat.step, -1.4, 1.4, '重复位移'), turnDeg: vector(input.repeat.turnDeg, -360, 360, '重复旋转') };
  const end = center.map((v, axis) => v + repeat.step[axis] * (repeat.count - 1));
  if (Math.abs(end[0]) > .7 || Math.abs(end[2]) > .7 || end[1] < -.1 || end[1] > 1.1) fail('重复部件中心越过模板局部范围。');
  return { id: id(input.id, '部件 ID'), primitive: input.primitive, material, center, size: vector(input.size, .002, 1.4, '部件尺寸'), rotationDeg: vector(input.rotationDeg, -360, 360, '部件角度'), points, indices, repeat, segments: integer(input.segments, 3, FINE_LIMITS.segments, '细分数量') };
}

function validateGeometry(input, inputPlan, options = {}, context = {}) {
  dataTree(input); fields(options, Object.hasOwn(options, 'baseRecipe') ? ['baseRecipe'] : [], '精细验证设置');
  const plan = validatePlan(inputPlan), targets = context.targets || targetEntities(plan), format = context.format || FINE_GEOMETRY_FORMAT;
  if (!targets.length) fail('当前布局没有可精细化的未锁定物体。');
  const base = options.baseRecipe ? validateCompletionRecipe(options.baseRecipe, plan) : null;
  fields(input, ['format', 'sourceFingerprint', 'title', 'summary', 'materials', 'templates', 'instances'], '精细几何');
  if (input.format !== format) fail('精细几何格式不匹配。');
  if (input.sourceFingerprint !== fingerprintPlan(plan)) fail('布局已经变化，精细几何不能应用到不同输入。');
  const materials = list(input.materials, context.borrowedMaterials ? 0 : 1, FINE_LIMITS.materials, '材质').map(item => {
    fields(item, ['id', 'label', 'color', 'roughness', 'metalness', 'texture', 'opacity', 'emissive'], '材质');
    if (!FINE_TEXTURES.includes(item.texture)) fail('材质纹理类型不受支持。');
    return { id: id(item.id, '材质 ID'), label: text(item.label, 120, '材质名称'), color: color(item.color), roughness: number(item.roughness, .05, 1, '粗糙度'), metalness: number(item.metalness, 0, 1, '金属度'), texture: item.texture, opacity: number(item.opacity, .08, 1, '透明度'), emissive: color(item.emissive) };
  });
  const materialIds = unique(materials, '材质');
  for (const material of context.borrowedMaterials || []) materialIds.add(material.id);
  const templates = list(input.templates, 1, Math.min(targets.length, FINE_LIMITS.templates), '模板').map(item => {
    fields(item, ['id', 'label', 'parts'], '几何模板');
    const parts = list(item.parts, 1, FINE_LIMITS.parts, '模板部件').map(part => validatePart(part, materialIds)); unique(parts, '部件');
    return { id: id(item.id, '模板 ID'), label: text(item.label, 120, '模板名称'), parts };
  });
  unique(templates, '模板'); const templateMap = new Map(templates.map(template => [template.id, template]));
  const targetIds = new Set(targets.map(entity => entity.id)), instanceIds = new Set(), used = new Set(); let renderedParts = 0;
  const instances = list(input.instances, targets.length, targets.length, '物体实例').map(item => {
    fields(item, ['entityId', 'templateId', 'rotationDeg'], '物体实例');
    const entityId = id(item.entityId, '原物体 ID'); if (!targetIds.has(entityId) || instanceIds.has(entityId)) fail('实例须与每个未锁定原物体一一对应。'); instanceIds.add(entityId);
    const templateId = id(item.templateId, '实例模板'); if (!templateMap.has(templateId)) fail('实例引用未知模板。'); used.add(templateId);
    const rotationDeg = number(item.rotationDeg, -180, 180, '实例角度');
    if (base && rotationDeg !== base.objects.find(object => object.id === entityId).rotationDeg) fail('精细实例不能改变已确认场景朝向。');
    renderedParts += templateMap.get(templateId).parts.reduce((sum, part) => sum + part.repeat.count, 0);
    return { entityId, templateId, rotationDeg };
  });
  if (used.size !== templates.length) fail('精细几何包含未使用模板。');
  if (renderedParts > FINE_LIMITS.renderedParts) fail('精细几何超过 2500 个实际渲染部件预算。');
  instances.sort((a, b) => targets.findIndex(entity => entity.id === a.entityId) - targets.findIndex(entity => entity.id === b.entityId));
  return { format, sourceFingerprint: input.sourceFingerprint, title: text(input.title, 120, '精细场景标题'), summary: text(input.summary, 2000, '精细场景说明'), materials, templates, instances };
}

export function validateFineGeometry(input, inputPlan, options = {}) { return validateGeometry(input, inputPlan, options); }

export function validateFineGeometryPatch(input, inputPlan, previousGeometry, scopeIds, options = {}) {
  const plan = validatePlan(inputPlan), previous = validateFineGeometry(previousGeometry, plan, options), scope = new Set(validateFineScope(plan, scopeIds));
  const patch = validateGeometry(input, plan, options, { format: FINE_GEOMETRY_PATCH_FORMAT, targets: targetEntities(plan).filter(entity => scope.has(entity.id)), borrowedMaterials: previous.materials });
  for (const instance of patch.instances) if (instance.rotationDeg !== previous.instances.find(old => old.entityId === instance.entityId).rotationDeg) fail('局部几何不能改变原实例朝向。');
  return patch;
}

/** Merge only the scoped dependency graph; old outside instances, templates and
 * materials stay byte-for-byte equal to their canonical validated records.
 * Conflicting local definitions are renamed, never applied globally. Scope-only
 * obsolete dependencies are discarded before enforcing the full scene budget. */
export function mergeFineGeometryPatch(previousGeometry, inputPatch, inputPlan, scopeIds, options = {}) {
  const plan = validatePlan(inputPlan), previous = validateFineGeometry(previousGeometry, plan, options);
  const scope = new Set(validateFineScope(plan, scopeIds)), patch = validateFineGeometryPatch(inputPatch, plan, previous, [...scope], options);
  const outsideInstances = previous.instances.filter(instance => !scope.has(instance.entityId));
  const outsideTemplateIds = new Set(outsideInstances.map(instance => instance.templateId));
  const templates = previous.templates.filter(template => outsideTemplateIds.has(template.id));
  const outsideMaterialIds = new Set(templates.flatMap(template => template.parts.map(part => part.material)));
  const materials = previous.materials.filter(material => outsideMaterialIds.has(material.id));
  const oldMaterials = new Map(previous.materials.map(material => [material.id, material]));
  const patchMaterials = new Map(patch.materials.map(material => [material.id, material]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const freshId = (prefix, used) => { let index = 1; while (used.has(`${prefix}-${index}`)) index++; const value = `${prefix}-${index}`; used.add(value); return value; };
  const usedMaterialIds = new Set([...previous.materials, ...patch.materials].map(material => material.id)), materialNames = new Map();
  for (const materialId of new Set(patch.templates.flatMap(template => template.parts.map(part => part.material)))) {
    const next = patchMaterials.get(materialId) || oldMaterials.get(materialId), outside = materials.find(material => material.id === materialId);
    if (!next) fail('局部几何引用未知材质。');
    if (outside && same(outside, next)) { materialNames.set(materialId, materialId); continue; }
    const nextId = outside ? freshId('refine-material', usedMaterialIds) : materialId;
    materialNames.set(materialId, nextId); materials.push({ ...next, id: nextId });
  }
  const usedTemplateIds = new Set([...previous.templates, ...patch.templates].map(template => template.id)), templateNames = new Map();
  for (const template of patch.templates) {
    const next = { ...template, parts: template.parts.map(part => ({ ...part, material: materialNames.get(part.material) })) };
    const outside = templates.find(old => old.id === template.id);
    if (outside && same(outside, next)) { templateNames.set(template.id, template.id); continue; }
    const nextId = outside ? freshId('refine-template', usedTemplateIds) : template.id;
    templateNames.set(template.id, nextId); templates.push({ ...next, id: nextId });
  }
  const scopedInstances = patch.instances.map(instance => ({ ...instance, templateId: templateNames.get(instance.templateId) }));
  const result = validateFineGeometry({ format: FINE_GEOMETRY_FORMAT, sourceFingerprint: previous.sourceFingerprint, title: patch.title, summary: patch.summary, materials, templates, instances: [...outsideInstances, ...scopedInstances] }, plan, options);
  for (const instance of outsideInstances) if (!same(instance, result.instances.find(next => next.entityId === instance.entityId))) fail('局部合并改变了范围外实例。');
  for (const template of previous.templates.filter(old => outsideTemplateIds.has(old.id))) if (!same(template, result.templates.find(next => next.id === template.id))) fail('局部合并改变了范围外模板部件。');
  for (const material of previous.materials.filter(old => outsideMaterialIds.has(old.id))) if (!same(material, result.materials.find(next => next.id === material.id))) fail('局部合并改变了范围外材质。');
  return result;
}

/** Read-only modeling diagnostics, separate from contract validity and visual acceptance.
 * These checks inspect normalized template coordinates, not a fitted world mesh.
 * Leaf orientation is advisory; only the two deterministic transform mistakes
 * set needsRepair. No part, template, instance or material is rewritten. */
export function fineGeometryDiagnostics(bundle) {
  const warnings = []; let needsRepair = false;
  const nearZero = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e-8;
  const triple = value => Array.isArray(value) && value.length === 3 && value.every(component => typeof component === 'number' && Number.isFinite(component));
  for (const template of Array.isArray(bundle?.templates) ? bundle.templates : []) {
    for (const part of Array.isArray(template?.parts) ? template.parts : []) {
      const label = `${String(template.id || 'template')}/${String(part.id || 'part')}`;
      const repeat = part.repeat;
      if (['box', 'cylinder'].includes(part.primitive) && /post|pillar|baluster/iu.test(String(part.id || ''))
        && Number.isSafeInteger(repeat?.count) && repeat.count > 1 && triple(repeat.step) && repeat.step.every(nearZero)
        && triple(repeat.turnDeg) && nearZero(repeat.turnDeg[0]) && nearZero(repeat.turnDeg[2])
        && triple(part.size) && part.size[1] > 4 * Math.max(part.size[0], part.size[2])) {
        needsRepair = true;
        warnings.push(`${label}：${repeat.count} 根细立柱原位重复，绕自身 Y 轴旋转不会形成圆周分布；应分别给出圆周中心坐标，或使用实际非零位移。`);
      }
      if (part.primitive === 'torus' && triple(part.rotationDeg) && triple(part.size)) {
        const xAngle = ((part.rotationDeg[0] % 360) + 360) % 360;
        const horizontal = Math.min(Math.abs(xAngle - 90), Math.abs(xAngle - 270)) <= 10;
        const diameterRatio = Math.max(part.size[0], part.size[1]) / Math.max(1e-12, Math.min(part.size[0], part.size[1]));
        if (horizontal && diameterRatio > 4) {
          needsRepair = true;
          warnings.push(`${label}：水平圆环的局部 X/Y 尺寸比为 ${diameterRatio.toFixed(1)}；torus 先在 XY 平面成环，再绕 X 旋转，当前尺寸会把圆环压成窄条，应检查两条局部圆径。`);
        }
      }
      if (part.primitive === 'leaf' && /palm|frond|棕榈/iu.test(`${String(template.id || '')} ${String(template.label || '')} ${String(part.id || '')}`)
        && Array.isArray(part.points) && part.points.length >= 3
        && part.points.every(point => triple(point) && nearZero(point[2])) && triple(part.size) && part.size[2] > 0) {
        warnings.push(`${label}：叶片所有局部 Z 坐标均为零，size.Z 缩放不会产生局部 Z 宽度；若目标是自然下垂的棕榈叶，请检查 X/Z 展开与 Y 弯曲。该项仅为朝向提示。`);
      }
    }
  }
  return { needsRepair, warnings };
}
