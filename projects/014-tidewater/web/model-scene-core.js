// A model-designed look is stored separately from the authored spatial plan.
// Recipes are data only: this module never executes code or resolves asset URLs.
import { validatePlan, buildGenerationBrief } from './creation-core.js';

export const MODEL_SCENE_LIMITS = Object.freeze({
  notes: 12, note: 280, id: 64, title: 120, direction: 2000, label: 120,
  triangles: 120000, groups: 1024, bytes: 16 * 1024 * 1024,
});
const PALETTE_KEYS = ['water', 'land', 'sand', 'plaster', 'roof', 'timber', 'foliage'];
const CANDIDATE_KEYS = ['version', 'id', 'title', 'direction', 'provenance', 'recipe', 'notes'];

function fail(message) { throw new Error(message); }
function fields(value, allowed, label, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}必须是普通对象。`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${label}包含未知字段「${String(key)}」。`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}只能包含普通可序列化字段。`);
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}缺少字段「${key}」。`);
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label}须为 1 到 ${max} 个字符且不含控制字符的文本。`);
  return value.trim();
}
function id(value, label) {
  if (typeof value !== 'string' || value.length > MODEL_SCENE_LIMITS.id
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(value)) fail(`${label}须为不超过 64 个字母、数字、下划线或连字符。`);
  return value;
}
function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function planFingerprint(valid) {
  const source = canonicalJSON(valid);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `plan-v1-${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}-${source.length}`;
}

/** Change detection for a canonical full plan; this is not a security signature. */
export function fingerprintPlan(plan) { return planFingerprint(validatePlan(plan)); }

/** Validate only the separate look recipe; never rewrite the supplied plan. */
export function validateModelCandidate(input, plan) {
  validatePlan(plan);
  fields(input, CANDIDATE_KEYS, '模型候选');
  if (input.version !== 1) fail('模型候选版本必须为 1。');
  fields(input.provenance, ['method', 'label', 'generatedAt'], '模型来源');
  if (input.provenance.method !== 'coding-model') fail('模型来源 method 只支持 coding-model。');
  const generatedAt = input.provenance.generatedAt;
  if (typeof generatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(generatedAt)
    || !Number.isFinite(Date.parse(generatedAt)) || new Date(generatedAt).toISOString() !== generatedAt) {
    fail('模型生成时间须为有效的 UTC ISO 时间，例如 2026-10-05T01:00:00.000Z。');
  }
  fields(input.recipe, ['assetKit', 'seed', 'palette', 'lighting', 'detail'], '模型方案');
  if (input.recipe.assetKit !== 'coastal-v1') fail('当前只支持 coastal-v1 场景资源。');
  if (typeof input.recipe.seed !== 'number' || !Number.isInteger(input.recipe.seed)
    || input.recipe.seed < 0 || input.recipe.seed > 0xffffffff) fail('模型方案 seed 必须是 uint32 整数。');
  if (!['warm-day', 'sunset'].includes(input.recipe.lighting)) fail('模型光照只支持 warm-day 或 sunset。');
  if (![1, 2].includes(input.recipe.detail)) fail('模型细节只支持 1 或 2。');
  fields(input.recipe.palette, PALETTE_KEYS, '模型配色');
  const palette = {};
  for (const key of PALETTE_KEYS) {
    const color = input.recipe.palette[key];
    if (typeof color !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(color)) fail(`模型 ${key} 须为六位十六进制颜色。`);
    palette[key] = color.toLowerCase();
  }
  if (!Array.isArray(input.notes) || input.notes.length > MODEL_SCENE_LIMITS.notes) fail('模型说明须为不超过 12 项的文本数组。');
  const notes = [];
  for (const key of Reflect.ownKeys(input.notes)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= input.notes.length) fail('模型说明数组包含未知字段。');
    const descriptor = Object.getOwnPropertyDescriptor(input.notes, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('模型说明只能包含普通文本项。');
  }
  for (let index = 0; index < input.notes.length; index += 1) {
    if (!Object.hasOwn(input.notes, index)) fail('模型说明数组不能有空项。');
    notes.push(text(input.notes[index], MODEL_SCENE_LIMITS.note, '模型说明'));
  }
  return {
    version: 1, id: id(input.id, '模型候选 ID'),
    title: text(input.title, MODEL_SCENE_LIMITS.title, '模型候选标题'),
    direction: text(input.direction, MODEL_SCENE_LIMITS.direction, '模型设计方向'),
    provenance: {
      method: 'coding-model', label: text(input.provenance.label, MODEL_SCENE_LIMITS.label, '模型来源名称'), generatedAt,
    },
    recipe: { assetKit: 'coastal-v1', seed: input.recipe.seed, palette, lighting: input.recipe.lighting, detail: input.recipe.detail },
    notes,
  };
}

/** Exact authored coordinates and locks accompany the descriptive brief. */
export function makeModelContext(plan) {
  const valid = validatePlan(plan);
  return {
    version: 1, sourceFingerprint: planFingerprint(valid), brief: buildGenerationBrief(valid), plan: valid,
    lockedEntityIds: valid.entities.filter(entity => entity.locked).map(entity => entity.id),
    outputContract: {
      version: 1, assetKits: ['coastal-v1'], lighting: ['warm-day', 'sunset'], detail: [1, 2],
      paletteKeys: [...PALETTE_KEYS], geometry: 'Keep authored world dimensions, entity IDs, points, elevations and locks. Return a separate look recipe.',
      delivery: 'Return bounded JSON candidate data. Do not return executable code, remote asset URLs or a replacement spatial plan.',
    },
  };
}

function numericArray(value, label, min, max) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) fail(`${label}须为数值数组。`);
  if (!Number.isInteger(value.length) || value.length === 0 || value.length % 9 !== 0
    || value.length > MODEL_SCENE_LIMITS.triangles * 9) fail(`${label}须为 1 到 ${MODEL_SCENE_LIMITS.triangles} 个非索引三角形。`);
  const result = new Float32Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const number = value[index];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) fail(`${label}包含无效数值。`);
    result[index] = number;
  }
  return result;
}

/** A portable glTF 2 binary containing geometry, normals and linear vertex colors. */
export function createSceneGLB(mesh, options = {}) {
  fields(mesh, ['positions', 'normals', 'colors', 'groups'], '场景网格', ['positions', 'normals', 'colors']);
  fields(options, ['title'], '导出设置', []);
  const title = Object.hasOwn(options, 'title') ? text(options.title, MODEL_SCENE_LIMITS.title, '导出标题') : 'Model designed scene';
  const positions = numericArray(mesh.positions, '网格坐标', -1000000, 1000000);
  const normals = numericArray(mesh.normals, '网格法线', -1, 1);
  const colors = numericArray(mesh.colors, '网格颜色', 0, 1);
  if (positions.length !== normals.length || positions.length !== colors.length) fail('坐标、法线、RGB 颜色的分量数量必须一致。');
  for (let index = 0; index < normals.length; index += 3) {
    if (Math.abs(Math.hypot(normals[index], normals[index + 1], normals[index + 2]) - 1) > 0.025) fail('网格法线必须归一化。');
  }
  const vertexCount = positions.length / 3;
  let groups;
  if (Object.hasOwn(mesh, 'groups')) {
    if (!Array.isArray(mesh.groups) || mesh.groups.length > MODEL_SCENE_LIMITS.groups) fail('网格对象分组超过导出限制。');
    const ids = new Set();
    groups = mesh.groups.map(group => {
      fields(group, ['id', 'start', 'count'], '网格对象分组');
      const groupId = id(group.id, '网格分组 ID');
      if (ids.has(groupId)) fail('网格分组 ID 不能重复。');
      ids.add(groupId);
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count <= 0
        || group.start % 3 !== 0 || group.count % 3 !== 0 || group.start + group.count > vertexCount) fail('网格分组须为有效的三角形顶点范围。');
      return { id: groupId, start: group.start, count: group.count };
    });
    const ordered = [...groups].sort((a, b) => a.start - b.start);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].start < ordered[index - 1].start + ordered[index - 1].count) fail('网格对象分组不能重叠。');
    }
  }
  function positionBounds(start, count) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let index = start * 3; index < (start + count) * 3; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions[index + axis]);
        max[axis] = Math.max(max[axis], positions[index + axis]);
      }
    }
    return { min, max };
  }
  // Use the same three attribute buffers for separate selectable glTF objects.
  // Unassigned sea/background/gaps must still be included in the exported scene.
  const ranges = [];
  if (groups) {
    const occupiedIds = new Set(groups.map(group => group.id));
    let remainderNumber = 1, cursor = 0;
    const remainder = (start, count) => {
      let rangeId;
      do { rangeId = `unassigned-${remainderNumber++}`; } while (occupiedIds.has(rangeId));
      occupiedIds.add(rangeId);
      ranges.push({ id: rangeId, start, count, authored: false });
    };
    for (const group of [...groups].sort((a, b) => a.start - b.start)) {
      if (group.start > cursor) remainder(cursor, group.start - cursor);
      ranges.push({ ...group, authored: true });
      cursor = group.start + group.count;
    }
    if (cursor < vertexCount) remainder(cursor, vertexCount - cursor);
  } else ranges.push({ id: title, start: 0, count: vertexCount, authored: false });
  const accessors = [];
  const meshes = ranges.map(range => {
    const firstAccessor = accessors.length;
    for (let attribute = 0; attribute < 3; attribute += 1) {
      accessors.push({ bufferView: attribute, byteOffset: range.start * 12, componentType: 5126, count: range.count, type: 'VEC3',
        ...(attribute === 0 ? positionBounds(range.start, range.count) : {}) });
    }
    return {
      name: range.id, primitives: [{ attributes: { POSITION: firstAccessor, NORMAL: firstAccessor + 1, COLOR_0: firstAccessor + 2 }, material: 0, mode: 4 }],
      ...(groups ? { extras: { sourceEntityId: range.authored ? range.id : null, vertexRange: { start: range.start, count: range.count } } } : {}),
    };
  });
  const attributeBytes = positions.byteLength;
  const binLength = attributeBytes * 3;
  const document = {
    asset: { version: '2.0', generator: 'Tidewater model scene export' }, scene: 0,
    scenes: [{ name: title, nodes: ranges.map((_, index) => index), ...(groups ? { extras: { entityGroups: groups } } : {}) }],
    nodes: ranges.map((range, index) => ({ name: range.id, mesh: index,
      ...(range.authored ? { extras: { sourceEntityId: range.id } } : {}) })),
    meshes,
    materials: [{ name: 'Linear vertex colors', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [0, 1, 2].map(index => ({ buffer: 0, byteOffset: index * attributeBytes, byteLength: attributeBytes, target: 34962 })),
    accessors,
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const totalLength = 12 + 8 + jsonLength + 8 + binLength;
  if (totalLength > MODEL_SCENE_LIMITS.bytes) fail('场景 GLB 超过 16 MiB 导出限制。');
  const output = new Uint8Array(totalLength);
  const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, totalLength, true);
  header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength); output.set(json, 20);
  const binOffset = 20 + jsonLength;
  header.setUint32(binOffset, binLength, true); header.setUint32(binOffset + 4, 0x004e4942, true);
  // Write explicitly little endian rather than relying on the host typed-array byte order.
  let byteOffset = binOffset + 8;
  for (const attribute of [positions, normals, colors]) {
    for (const component of attribute) { header.setFloat32(byteOffset, component, true); byteOffset += 4; }
  }
  return output;
}
