// Serializable plans for the separate reference-image / semantic-layout creator.
// No renderer, image generator or model API is called here. Coordinates are normalized (0..1).
// validatePlan and every successful transaction return an independent, canonical plan.

const KINDS = Object.freeze(['land', 'water', 'road', 'cabin', 'lighthouse', 'palm', 'boat']);
const ENTRIES = new Set(['image', 'layout']);
const LIGHTING = new Set(['day', 'sunset']);
const HEIGHTS = Object.freeze({ land: 3, water: 0, road: 0.2, cabin: 7, lighthouse: 18, palm: 12, boat: 2 });
const LIMITS = Object.freeze({
  entities: 120, pointsPerEntity: 256, totalPoints: 4096, operations: 240,
  name: 80, id: 64, referenceName: 160, referenceDataUrl: 2 * 1024 * 1024,
  imageDimension: 8192, height: 100, worldMin: 10, worldMax: 2000,
});
export const MAX_REFINED_LANDS = 5;
const PLAN_KEYS = ['version', 'name', 'entry', 'intent', 'world', 'style', 'reference', 'entities'];
const ENTITY_REQUIRED_KEYS = ['id', 'kind', 'points', 'height', 'locked'];
const ENTITY_KEYS = [...ENTITY_REQUIRED_KEYS, 'refinement'];
const REFINEMENT_KEYS = ['preset', 'seed', 'density', 'beach', 'rocks', 'vegetation'];
const REFINEMENT_PRESETS = new Set(['tropical', 'rocky', 'garden']);
const STYLE_KEYS = ['lighting', 'waterColor', 'landColor'];
const KIND_NAMES = Object.freeze({ land: '陆地区域', water: '水域', road: '道路/桥路', cabin: '小屋', lighthouse: '灯塔', palm: '棕榈', boat: '船' });

function fail(message) { throw new Error(message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}必须是普通对象。`);
}
function fields(value, allowed, required, label) {
  record(value, label);
  // Symbol and hidden fields are not serializable input and must not silently disappear.
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${label}包含未知字段「${String(key)}」。`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}只能包含普通可序列化字段。`);
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}缺少字段「${key}」。`);
}
function number(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}必须是有限数值。`);
  if (value < min || value > max) fail(`${label}须在 ${min} 到 ${max} 之间。`);
}
function textValue(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label}须为 1 到 ${max} 个字符且不含控制字符的文本。`);
}
function idValue(value, label = '对象 ID') {
  if (typeof value !== 'string' || value.length > LIMITS.id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(value)) {
    fail(`${label}须为 1 到 ${LIMITS.id} 个字母、数字、下划线或连字符，首位是字母或数字。`);
  }
}
function boolean(value, label) { if (typeof value !== 'boolean') fail(`${label}必须是布尔值。`); }
function entryValue(value) { if (!ENTRIES.has(value)) fail('入口只支持 image 或 layout。'); }
function intentValue(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('创作说明须为不超过 2000 字符的文本，可为空。');
}
function normalizeStyle(style, partial = false) {
  fields(style, STYLE_KEYS, partial ? [] : STYLE_KEYS, '风格');
  const keys = Object.keys(style);
  if (partial && !keys.length) fail('风格变更不能为空。');
  const result = {};
  for (const key of keys) {
    const value = style[key];
    if (key === 'lighting') {
      if (!LIGHTING.has(value)) fail('光照只支持 day 或 sunset。');
    } else if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(value)) {
      fail(`${key}须为六位十六进制颜色，例如 #3b8d9c。`);
    }
    result[key] = value;
  }
  return result;
}

/** A complete, serializable local detail recipe. Optional on legacy land entities. */
export function validateRefinement(refinement) {
  fields(refinement, REFINEMENT_KEYS, REFINEMENT_KEYS, '陆地细化');
  if (!REFINEMENT_PRESETS.has(refinement.preset)) fail('细化风格只支持 tropical、rocky 或 garden。');
  number(refinement.seed, 0, 0xffffffff, '细化 seed');
  if (!Number.isInteger(refinement.seed)) fail('细化 seed 必须是 uint32 整数。');
  if (![1, 2, 3].includes(refinement.density)) fail('细化密度只支持 1、2 或 3。');
  for (const key of ['beach', 'rocks', 'vegetation']) boolean(refinement[key], `细化 ${key}`);
  return {
    preset: refinement.preset, seed: refinement.seed, density: refinement.density,
    beach: refinement.beach, rocks: refinement.rocks, vegetation: refinement.vegetation,
  };
}
function samePoint(a, b) { return a.x === b.x && a.y === b.y; }
function orientation(a, b, c) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(value) <= 1e-10 ? 0 : Math.sign(value);
}
function onSegment(a, b, point) {
  const epsilon = 1e-10;
  return point.x >= Math.min(a.x, b.x) - epsilon && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon && point.y <= Math.max(a.y, b.y) + epsilon;
}
function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}
function normalizePoints(points, kind, label) {
  if (!Array.isArray(points) || points.length > LIMITS.pointsPerEntity) fail(`${label}点列表须为不超过 ${LIMITS.pointsPerEntity} 点的数组。`);
  const minimum = kind === 'land' || kind === 'water' ? 3 : kind === 'road' ? 2 : 1;
  if (points.length < minimum || (minimum === 1 && points.length !== 1)) {
    fail(`${label}的 ${kind} ${minimum === 1 ? '只能有 1 个标记点' : `至少需要 ${minimum} 个点`}。`);
  }
  const validated = points.map((point, index) => {
    fields(point, ['x', 'y'], ['x', 'y'], `${label}第 ${index + 1} 个点`);
    number(point.x, 0, 1, `${label}点 x`);
    number(point.y, 0, 1, `${label}点 y`);
    return { x: point.x, y: point.y };
  });
  // Freehand drawing may repeat a point or append the first point to close a region.
  // Remove only these redundant points, never replace the authored outline with a convex hull.
  const result = validated.filter((point, index) => index === 0 || !samePoint(point, validated[index - 1]));
  if (kind === 'land' || kind === 'water') {
    if (result.length > 1 && samePoint(result[0], result.at(-1))) result.pop();
    const unique = new Set(result.map((point) => `${point.x},${point.y}`));
    if (unique.size < 3) fail(`${label}区域至少需要 3 个不同位置，请重画区域。`);
    if (unique.size !== result.length) fail(`${label}区域重复经过同一顶点，请重画不自相接的边界。`);
    let twiceArea = 0;
    for (let i = 0; i < result.length; i += 1) {
      const a = result[i], b = result[(i + 1) % result.length];
      twiceArea += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(twiceArea) / 2 <= 1e-6) fail(`${label}区域面积过小或退化成线/点，请重画区域。`);
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        // Neighbouring edges, including closing-edge / first-edge, share one legal endpoint.
        if (j === i + 1 || (i === 0 && j === result.length - 1)) continue;
        if (segmentsIntersect(result[i], result[(i + 1) % result.length], result[j], result[(j + 1) % result.length])) {
          fail(`${label}区域边界自交或自相接，请重画简单区域。`);
        }
      }
    }
  } else if (kind === 'road' && result.length < 2) {
    fail(`${label}道路至少需要一条非零长度线段，请重画道路。`);
  }
  return result;
}
function normalizeEntity(entity, defaults = false) {
  fields(entity, ENTITY_KEYS, defaults ? ['id', 'kind', 'points'] : ENTITY_REQUIRED_KEYS, '布局对象');
  idValue(entity.id);
  if (!KINDS.includes(entity.kind)) fail(`不支持对象种类「${String(entity.kind)}」。`);
  const height = defaults && !Object.hasOwn(entity, 'height') ? HEIGHTS[entity.kind] : entity.height;
  const locked = defaults && !Object.hasOwn(entity, 'locked') ? false : entity.locked;
  number(height, 0, LIMITS.height, `${entity.id}高度`);
  boolean(locked, `${entity.id} locked`);
  const result = { id: entity.id, kind: entity.kind, points: normalizePoints(entity.points, entity.kind, entity.id), height, locked };
  if (Object.hasOwn(entity, 'refinement')) {
    if (entity.kind !== 'land') fail('只有陆地区域支持 refinement 细化。');
    result.refinement = validateRefinement(entity.refinement);
  }
  return result;
}
function normalizeReference(reference) {
  if (reference === null) return null;
  fields(reference, ['name', 'dataUrl', 'width', 'height'], ['name', 'dataUrl', 'width', 'height'], '参考图');
  textValue(reference.name, LIMITS.referenceName, '参考图名称');
  for (const key of ['width', 'height']) {
    number(reference[key], 1, LIMITS.imageDimension, `参考图 ${key}`);
    if (!Number.isInteger(reference[key])) fail(`参考图 ${key}必须是整数。`);
  }
  if (typeof reference.dataUrl !== 'string' || reference.dataUrl.length > LIMITS.referenceDataUrl) fail('参考图 dataUrl 须为不超过 2 MiB 的文本。');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(reference.dataUrl);
  if (!match || match[2].length % 4 !== 0) fail('参考图仅支持 PNG/JPEG/WebP 的有效 base64 data URL；不支持 SVG 或外部链接。');
  let header;
  try { header = atob(match[2].slice(0, 32)); } catch { fail('参考图 base64 数据无效。'); }
  const bytes = [...header].map((char) => char.charCodeAt(0));
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  if (!(match[1] === 'image/png' ? png : match[1] === 'image/jpeg' ? jpeg : webp)) fail('参考图 MIME 与文件签名不匹配。');
  // Signature checks establish the allowed container, not whether all image bytes decode.
  // The UI must load/decode the image before displaying or accepting a newly selected file.
  return { name: reference.name, dataUrl: reference.dataUrl, width: reference.width, height: reference.height };
}

/** Strictly validate a complete plan and return a deep copy. Does not mutate input. */
export function validatePlan(plan) {
  fields(plan, PLAN_KEYS, PLAN_KEYS, '创作计划');
  if (plan.version !== 1) fail('计划版本必须为 1。');
  textValue(plan.name, LIMITS.name, '计划名称');
  entryValue(plan.entry);
  intentValue(plan.intent);
  fields(plan.world, ['width', 'depth'], ['width', 'depth'], '世界尺寸');
  number(plan.world.width, LIMITS.worldMin, LIMITS.worldMax, '世界宽度');
  number(plan.world.depth, LIMITS.worldMin, LIMITS.worldMax, '世界深度');
  if (!Array.isArray(plan.entities) || plan.entities.length > LIMITS.entities) fail('布局对象须为不超过 120 项的数组。');
  const ids = new Set();
  let totalPoints = 0, refinedLands = 0;
  const entities = plan.entities.map((entity) => {
    const result = normalizeEntity(entity);
    if (ids.has(result.id)) fail(`重复对象 ID「${result.id}」。`);
    ids.add(result.id);
    if (result.refinement && ++refinedLands > MAX_REFINED_LANDS) fail('最多可细化 5 块陆地；请先移除一块陆地的细化，现有布局不变。');
    totalPoints += entity.points.length;
    if (totalPoints > LIMITS.totalPoints) fail('布局总点数不能超过 4096。');
    return result;
  });
  return {
    version: 1, name: plan.name, entry: plan.entry, intent: plan.intent,
    world: { width: plan.world.width, depth: plan.world.depth },
    style: normalizeStyle(plan.style), reference: normalizeReference(plan.reference), entities,
  };
}

/** An empty layout. The renderer may provide a default sea; it is not a stored land entity. */
export function createPlan(entry = 'layout') {
  entryValue(entry);
  return {
    version: 1, name: entry === 'image' ? '参考图片创作' : '我的布局',
    entry, intent: '', world: { width: 200, depth: 150 },
    style: { lighting: 'day', waterColor: '#3b8d9c', landColor: '#6c956b' },
    reference: null, entities: [],
  };
}

/** Optional authored example. A new plan never loads this layout implicitly. */
export function createDemoPlan(entry = 'layout') {
  const plan = createPlan(entry);
  plan.name = '双岛与桥路';
  plan.entities = [
    { id: 'island-west', kind: 'land', points: [{ x: 0.12, y: 0.25 }, { x: 0.36, y: 0.19 }, { x: 0.48, y: 0.4 }, { x: 0.4, y: 0.76 }, { x: 0.2, y: 0.81 }, { x: 0.08, y: 0.59 }] },
    { id: 'island-east', kind: 'land', points: [{ x: 0.64, y: 0.31 }, { x: 0.84, y: 0.29 }, { x: 0.94, y: 0.51 }, { x: 0.85, y: 0.73 }, { x: 0.65, y: 0.68 }, { x: 0.59, y: 0.49 }] },
    { id: 'bridge-road', kind: 'road', points: [{ x: 0.24, y: 0.54 }, { x: 0.42, y: 0.5 }, { x: 0.61, y: 0.5 }, { x: 0.77, y: 0.53 }] },
    { id: 'cabin-west', kind: 'cabin', points: [{ x: 0.27, y: 0.48 }] },
    { id: 'cabin-east', kind: 'cabin', points: [{ x: 0.76, y: 0.57 }] },
    { id: 'lighthouse-west', kind: 'lighthouse', points: [{ x: 0.34, y: 0.3 }] },
    { id: 'palm-west', kind: 'palm', points: [{ x: 0.19, y: 0.62 }] },
    { id: 'palm-east', kind: 'palm', points: [{ x: 0.81, y: 0.42 }] },
    { id: 'boat-south', kind: 'boat', points: [{ x: 0.53, y: 0.8 }] },
  ].map((entity) => normalizeEntity(entity, true));
  return validatePlan(plan);
}

/** Apply all operations to a copy, or throw with the original unchanged. */
export function applyPlanOperations(plan, operations) {
  const next = validatePlan(plan);
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > LIMITS.operations) {
    fail('操作须为 1 到 240 项的数组。');
  }
  for (const operation of operations) {
    record(operation, '操作');
    if (operation.type === 'add') {
      fields(operation, ['type', 'entity'], ['type', 'entity'], '新增操作');
      const entity = normalizeEntity(operation.entity, true);
      if (next.entities.some((item) => item.id === entity.id)) fail(`重复对象 ID「${entity.id}」。`);
      if (next.entities.length >= LIMITS.entities) fail('布局对象不能超过 120 项。');
      next.entities.push(entity);
    } else if (operation.type === 'update') {
      fields(operation, ['type', 'id', 'values'], ['type', 'id', 'values'], '更新操作');
      idValue(operation.id);
      const entity = next.entities.find((item) => item.id === operation.id);
      if (!entity) fail(`对象「${operation.id}」不存在。`);
      fields(operation.values, ['points', 'height', 'locked', 'refinement'], [], '对象变更');
      const keys = Object.keys(operation.values);
      if (!keys.length) fail('对象变更不能为空。');
      if (keys.includes('locked') && keys.length !== 1) fail('locked 必须单独修改；解锁后再修改其他属性。');
      if (entity.locked && !(keys.length === 1 && keys[0] === 'locked')) fail(`对象「${entity.id}」已锁定，请先解锁。`);
      if (Object.hasOwn(operation.values, 'points')) entity.points = normalizePoints(operation.values.points, entity.kind, entity.id);
      if (Object.hasOwn(operation.values, 'height')) {
        number(operation.values.height, 0, LIMITS.height, `${entity.id}高度`);
        entity.height = operation.values.height;
      }
      if (Object.hasOwn(operation.values, 'locked')) {
        boolean(operation.values.locked, `${entity.id} locked`);
        entity.locked = operation.values.locked;
      }
      if (Object.hasOwn(operation.values, 'refinement')) {
        if (entity.kind !== 'land') fail('只有陆地区域支持 refinement 细化。');
        if (operation.values.refinement === null) delete entity.refinement;
        else entity.refinement = validateRefinement(operation.values.refinement);
      }
    } else if (operation.type === 'remove') {
      fields(operation, ['type', 'id'], ['type', 'id'], '删除操作');
      idValue(operation.id);
      const index = next.entities.findIndex((entity) => entity.id === operation.id);
      if (index < 0) fail(`对象「${operation.id}」不存在。`);
      if (next.entities[index].locked) fail(`对象「${operation.id}」已锁定，请先解锁。`);
      next.entities.splice(index, 1);
    } else if (operation.type === 'style') {
      fields(operation, ['type', 'values'], ['type', 'values'], '风格操作');
      Object.assign(next.style, normalizeStyle(operation.values, true));
    } else if (operation.type === 'rename') {
      fields(operation, ['type', 'name'], ['type', 'name'], '命名操作');
      textValue(operation.name, LIMITS.name, '计划名称');
      next.name = operation.name;
    } else if (operation.type === 'reference') {
      fields(operation, ['type', 'reference'], ['type', 'reference'], '参考图操作');
      next.reference = normalizeReference(operation.reference);
    } else if (operation.type === 'intent') {
      fields(operation, ['type', 'intent'], ['type', 'intent'], '创作说明操作');
      intentValue(operation.intent);
      next.intent = operation.intent;
    } else if (operation.type === 'entry') {
      fields(operation, ['type', 'entry'], ['type', 'entry'], '入口操作');
      entryValue(operation.entry);
      next.entry = operation.entry;
    } else fail(`不支持操作类型「${String(operation.type)}」。`);
  }
  return validatePlan(next);
}

export function summarizePlan(plan) {
  const valid = validatePlan(plan);
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  for (const entity of valid.entities) counts[entity.kind] += 1;
  return {
    entityCount: valid.entities.length, counts, world: { ...valid.world },
    limitations: [
      '这是可编辑的概念布局，不包含碰撞、导航或工程仿真。',
      '图片仅作视觉参考，未自动识别、分割或重建成 3D。',
      '未连接模型 API；布局渲染不自动提供任务、钓鱼等运行阶段玩法。',
    ],
  };
}

function center(points) {
  const result = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  return { x: result.x / points.length, y: result.y / points.length };
}
function location(point) {
  const horizontal = point.x < 0.35 ? '左侧' : point.x > 0.65 ? '右侧' : '中部';
  const vertical = point.y < 0.35 ? '上方' : point.y > 0.65 ? '下方' : '中部';
  return horizontal === '中部' && vertical === '中部' ? '中央' : `${horizontal}、${vertical}`;
}
function rounded(value) { return Math.round(value * 100) / 100; }
function entityDescription(entity, world) {
  const point = center(entity.points);
  const position = `图上${location(point)}；中心归一化坐标 (${rounded(point.x)}, ${rounded(point.y)})，世界 X/Z 约 (${rounded((point.x - 0.5) * world.width)}, ${rounded((point.y - 0.5) * world.depth)}) 米`;
  const extent = entity.kind === 'land' || entity.kind === 'water'
    ? `；多边形 ${entity.points.length} 点，范围 x=${rounded(Math.min(...entity.points.map((p) => p.x)))}..${rounded(Math.max(...entity.points.map((p) => p.x)))}, y=${rounded(Math.min(...entity.points.map((p) => p.y)))}..${rounded(Math.max(...entity.points.map((p) => p.y)))}`
    : entity.kind === 'road'
      ? `；路径从 (${rounded(entity.points[0].x)}, ${rounded(entity.points[0].y)}) 到 (${rounded(entity.points.at(-1).x)}, ${rounded(entity.points.at(-1).y)})`
      : '';
  const refinement = entity.refinement
    ? `；本地细化 ${entity.refinement.preset}，密度 ${entity.refinement.density}，seed ${entity.refinement.seed}，沙滩/岩石/植被 ${entity.refinement.beach}/${entity.refinement.rocks}/${entity.refinement.vegetation}` : '';
  return `- ${entity.id} / ${KIND_NAMES[entity.kind]}：${position}${extent}；${entity.kind === 'water' ? '最低水位' : '高度'} ${entity.height} 米；${entity.locked ? '已锁定，保持形状/位置/高度/细化配置' : '可编辑'}${refinement}。`;
}

/** A copyable local brief. Reference pixels are not included and no API is invoked. */
export function buildGenerationBrief(plan) {
  const valid = validatePlan(plan), summary = summarizePlan(valid);
  const lines = [
    '实时 3D 概念场景制作说明',
    `作品名称：${JSON.stringify(valid.name)}`,
    `输入入口：${valid.entry === 'image' ? '参考图片' : '语义绘笔布局'}。`,
    `世界尺寸：${valid.world.width} × ${valid.world.depth} 米；图上坐标归一化为 0..1，左/上为 0，右/下为 1；世界原点在图中央。`,
    `风格：${valid.style.lighting === 'sunset' ? '日落光照' : '日间光照'}；水色 ${valid.style.waterColor}；陆地色 ${valid.style.landColor}。`,
    `用户创作说明：${valid.intent.trim() ? JSON.stringify(valid.intent) : '未填写。'}。`,
  ];
  if (valid.reference) {
    lines.push(
      `视觉参考：${JSON.stringify(valid.reference.name)}（${valid.reference.width} × ${valid.reference.height}）。`,
      '图片用于色彩、氛围和外观参考，不覆盖明确布局或锁定对象。本说明不携带图片像素；使用外部模型时请另行附图。',
    );
  } else lines.push('视觉参考：未附图。不要声称已分析参考图片。');
  lines.push(`布局对象：${summary.entityCount} 个。`);
  if (valid.entities.some(entity => entity.kind === 'water')) lines.push('水域预览规则：水平水面取最低水位与相交陆地最高标高的较大值，自动贴合地表；水域覆盖陆地，与创建顺序无关。当前为平面粗模，不包含地形挖洞或流体模拟。');
  if (valid.entities.length) {
    lines.push(...valid.entities.map((entity) => entityDescription(entity, valid.world)));
    const markers = valid.entities.filter((entity) => !['land', 'water', 'road'].includes(entity.kind));
    const islands = valid.entities.filter((entity) => entity.kind === 'land');
    if (markers.length && islands.length) {
      lines.push('位置关系（按图上中心距离，不代表处于陆地内或可达）：');
      for (const marker of markers) {
        const point = marker.points[0];
        const nearest = islands.reduce((best, island) => {
          const other = center(island.points);
          const distance = Math.hypot((point.x - other.x) * valid.world.width, (point.y - other.y) * valid.world.depth);
          return !best || distance < best.distance ? { id: island.id, distance } : best;
        }, null);
        lines.push(`- ${marker.id} 最近的陆地区域中心是 ${nearest.id}，距离约 ${rounded(nearest.distance)} 米。`);
      }
    }
  } else lines.push('当前布局为空：未绘制岛屿、道路或物体；不要将内置示例当成当前作品。默认底海由渲染器提供。');
  const locked = valid.entities.filter((entity) => entity.locked).map((entity) => entity.id);
  lines.push(
    `修改范围：保持世界尺寸与未明确要求更改的布局；锁定对象为 ${locked.length ? locked.join('、') : '无'}。改变锁定对象前必须先明确解锁。`,
    '语义范围：陆地/水域是区域，道路是路径，小屋/灯塔/棕榈/船是标记对象；绘笔不只是图片叠层。陆地可保存细化配置，装饰由本地确定性规则派生，保留绘制轮廓并避开水域、道路与已有标记。',
    '边界：当前为独立概念布局，未自动从图片重建场景，未实现碰撞、导航、任务或钓鱼玩法；不用于工程仿真。',
    '这是一份本地生成的可复制说明，未调用 Opus 或任何模型 API。',
  );
  return lines.join('\n');
}

