// The workbench's editable scene description. This module has no renderer or model API dependency.
// Object rotation is measured in degrees; x/y/z and movement are in world-space metres.

const CAMERA_PRESETS = new Set(['overview', 'pier', 'boat']);
const ENVIRONMENT_RANGES = Object.freeze({
  timeOfDay: [0, 24], windSpeed: [0.5, 30], swell: [0, 2], cloudCover: [0, 1],
});
const OBJECT_RANGES = Object.freeze({
  x: [-500, 500], y: [-50, 100], z: [-500, 500], rotation: [-3600, 3600], scale: [0.2, 4],
});
const PRESETS = Object.freeze({
  harbor: { name: '港湾海岛', environment: { timeOfDay: 16.2, windSpeed: 7, swell: 0.48, cloudCover: 0.45 } },
  sunset: { name: '日落港湾', environment: { timeOfDay: 18.3, windSpeed: 3, swell: 0.24, cloudCover: 0.3 } },
  'open-water': { name: '外海风浪', environment: { timeOfDay: 13.5, windSpeed: 14, swell: 0.8, cloudCover: 0.25 } },
});

function asset(id, name, type, x, z, rotation = 0) {
  return Object.freeze({
    id, asset: id, name, type,
    default: Object.freeze({ x, y: 0, z, rotation, scale: 1, visible: true, locked: false }),
  });
}

// The boat controls Tidewater's boat. The lighthouse, cabins and palms are new workbench assets,
// not aliases for the original village's objects. Keep these IDs stable across saves and edits.
export const ASSET_DEFS = Object.freeze([
  asset('boat', '渔船', 'boat', 64.5, 36.5),
  asset('lighthouse', '工作台灯塔', 'lighthouse', -100, -60),
  asset('cabin-a', '工作台小屋 A', 'cabin', -35, -82),
  asset('cabin-b', '工作台小屋 B', 'cabin', -55, -92),
  asset('palm-a', '工作台棕榈 A', 'palm', -65, -64),
  asset('palm-b', '工作台棕榈 B', 'palm', -18, -58),
]);
const ASSET_BY_ID = new Map(ASSET_DEFS.map((item) => [item.id, item]));

function fail(message) { throw new Error(message); }
function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}必须是普通对象。`);
}
function fields(value, allowed, required, label) {
  plain(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}包含未知字段「${key}」。`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}缺少字段「${key}」。`);
}
function number(value, range, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}必须是有限数值。`);
  if (value < range[0] || value > range[1]) fail(`${label}须在 ${range[0]} 到 ${range[1]} 之间。`);
}
function string(value, label, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}须为 1 到 ${max} 个字符的文本。`);
}
function preset(value) {
  if (!Object.hasOwn(PRESETS, value)) fail(`不支持场景预设「${String(value)}」。`);
}
function cameraPreset(value) {
  if (!CAMERA_PRESETS.has(value)) fail(`不支持镜头「${String(value)}」，可用 overview、pier、boat。`);
}
function boolean(value, label) { if (typeof value !== 'boolean') fail(`${label}必须是布尔值。`); }
function copy(scene) {
  return { ...scene, environment: { ...scene.environment }, camera: { ...scene.camera }, objects: scene.objects.map((item) => ({ ...item })) };
}

export function createScene(value = 'harbor') {
  preset(value);
  return {
    version: 1, name: PRESETS[value].name, seed: 42, preset: value,
    environment: { ...PRESETS[value].environment }, camera: { preset: 'overview' },
    objects: ASSET_DEFS.map((item) => ({ id: item.id, asset: item.asset, name: item.name, ...item.default })),
  };
}

/** Return true for a valid v1 description; throw a readable error otherwise. */
export function validateScene(scene) {
  const sceneKeys = ['version', 'name', 'seed', 'preset', 'environment', 'camera', 'objects'];
  fields(scene, sceneKeys, sceneKeys, '场景');
  if (scene.version !== 1) fail('场景版本必须为 1。');
  string(scene.name, '场景名称');
  number(scene.seed, [0, 4294967295], '随机种子');
  if (!Number.isInteger(scene.seed)) fail('随机种子必须是整数。');
  preset(scene.preset);
  const environmentKeys = Object.keys(ENVIRONMENT_RANGES);
  fields(scene.environment, environmentKeys, environmentKeys, '环境');
  for (const key of environmentKeys) number(scene.environment[key], ENVIRONMENT_RANGES[key], `环境 ${key}`);
  fields(scene.camera, ['preset'], ['preset'], '镜头');
  cameraPreset(scene.camera.preset);
  if (!Array.isArray(scene.objects)) fail('场景对象必须是数组。');
  if (scene.objects.length !== ASSET_DEFS.length) fail(`场景须保留 ${ASSET_DEFS.length} 个已注册对象；用 visible 控制显示。`);
  const ids = new Set();
  const objectKeys = ['id', 'asset', 'name', ...Object.keys(OBJECT_RANGES), 'visible', 'locked'];
  for (const item of scene.objects) {
    fields(item, objectKeys, objectKeys, '场景对象');
    if (typeof item.id !== 'string' || !ASSET_BY_ID.has(item.id)) fail(`未注册对象 ID「${String(item.id)}」。`);
    if (ids.has(item.id)) fail(`重复对象 ID「${item.id}」。`);
    ids.add(item.id);
    if (item.asset !== ASSET_BY_ID.get(item.id).asset) fail(`对象 ${item.id} 的资产引用与注册表不符。`);
    string(item.name, `对象 ${item.id} 名称`, 80);
    for (const key of Object.keys(OBJECT_RANGES)) number(item[key], OBJECT_RANGES[key], `${item.name} ${key}`);
    boolean(item.visible, `${item.name} visible`);
    boolean(item.locked, `${item.name} locked`);
  }
  return true;
}

function change(target, key, value, label, changes) {
  if (target[key] !== value) { target[key] = value; changes.push(`${label}：${String(value)}`); }
}

/** Apply all operations to a copy, or throw without mutating the original scene. */
export function applyOperations(scene, operations, options = {}) {
  validateScene(scene);
  fields(options, ['selectedId'], [], '执行选项');
  if (options.selectedId !== undefined && !ASSET_BY_ID.has(options.selectedId)) fail('选中的对象不存在。');
  if (!Array.isArray(operations) || !operations.length || operations.length > 32) fail('操作须为包含 1 到 32 项的数组。');
  const next = copy(scene), changes = [];
  for (const operation of operations) {
    plain(operation, '操作');
    if (operation.type === 'environment') {
      fields(operation, ['type', 'values'], ['type', 'values'], '环境操作');
      fields(operation.values, Object.keys(ENVIRONMENT_RANGES), [], '环境变更');
      if (!Object.keys(operation.values).length) fail('环境变更不能为空。');
      for (const [key, value] of Object.entries(operation.values)) {
        number(value, ENVIRONMENT_RANGES[key], `环境 ${key}`);
        change(next.environment, key, value, `环境 ${key}`, changes);
      }
    } else if (operation.type === 'object') {
      fields(operation, ['type', 'id', 'values'], ['type', 'values'], '对象操作');
      const id = Object.hasOwn(operation, 'id') ? operation.id : options.selectedId;
      if (typeof id !== 'string' || !ASSET_BY_ID.has(id)) fail('请选择一个已注册对象，或提供有效对象 ID。');
      const item = next.objects.find((entry) => entry.id === id);
      fields(operation.values, ['x', 'z', 'rotation', 'scale', 'visible', 'locked'], [], '对象变更');
      const keys = Object.keys(operation.values);
      if (!keys.length) fail('对象变更不能为空。');
      if (item.locked && keys.some((key) => key !== 'locked')) fail(`「${item.name}」已锁定，请先解锁再修改。`);
      for (const [key, value] of Object.entries(operation.values)) {
        if (Object.hasOwn(OBJECT_RANGES, key)) number(value, OBJECT_RANGES[key], `${item.name} ${key}`);
        else boolean(value, `${item.name} ${key}`);
        change(item, key, value, `${item.name} ${key}`, changes);
      }
    } else if (operation.type === 'camera') {
      fields(operation, ['type', 'preset'], ['type', 'preset'], '镜头操作');
      cameraPreset(operation.preset);
      change(next.camera, 'preset', operation.preset, '镜头', changes);
    } else if (operation.type === 'preset') {
      fields(operation, ['type', 'preset'], ['type', 'preset'], '预设操作');
      preset(operation.preset);
      change(next, 'preset', operation.preset, '场景预设', changes);
      for (const [key, value] of Object.entries(PRESETS[operation.preset].environment)) change(next.environment, key, value, `环境 ${key}`, changes);
    } else fail(`不支持操作类型「${String(operation.type)}」。`);
  }
  validateScene(next);
  return { scene: next, changes };
}

const NUMBER = '(\\d+(?:\\.\\d+)?)';
const VERB = '(?:改为|改成|设为|设置为|调为|调到|设置成|切换到|切换为|切换|变成|调成|变为)?';
const PERIODS = Object.freeze({ 黎明: 5.7, 清晨: 6.5, 早晨: 7, 上午: 9, 中午: 12, 下午: 15.5, 日落: 18.3, 黄昏: 18.3, 傍晚: 18.3, 夜晚: 22, 夜间: 22, 晚上: 22, 午夜: 0 });

function selectedObject(scene, id) {
  const item = scene.objects.find((entry) => entry.id === id);
  if (!item) fail('这条对象指令需要先选择一个对象。');
  return item;
}

/** A deterministic command parser, not a model/AI endpoint. Unsupported clauses reject the whole input. */
export function parseInstruction(text, scene, selectedId) {
  validateScene(scene);
  if (typeof text !== 'string' || !text.trim() || text.length > 600) fail('请输入 1 到 600 个字符的指令。');
  if (/雨|下雪|雷电|雷暴|瀑布|火焰|烟雾/.test(text)) fail('当前工作台没有雨、雪、雷电等新增效果模块，整条指令未执行。');
  const clauses = text.trim().split(/[，,；;。\n]+|(?:然后|并且)/).map((part) => part.trim()).filter(Boolean);
  const operations = [], summaries = [], preserve = new Set();
  let preview = copy(scene);
  const append = (operation, summary) => {
    // Validate every proposed step on copies; even an error late in a compound instruction leaves scene untouched.
    preview = applyOperations(preview, [operation], selectedId === undefined ? {} : { selectedId }).scene;
    operations.push(operation); summaries.push(summary);
  };
  for (const raw of clauses) {
    let clause = raw.replace(/\s+/g, '').replace(/^(?:请帮我|帮我|请)/, '').replace(/^(?:然后|再)/, '');
    let match;
    if (/^(?:保持|保留)(?:现有)?(?:建筑|对象|物体|场景)?(?:布局|位置)(?:不变)?$/.test(clause)) {
      const onlyBuildings = clause.includes('建筑');
      for (const item of ASSET_DEFS) if (!onlyBuildings || ['cabin', 'lighthouse'].includes(item.type)) preserve.add(item.id);
      summaries.push('保持现有布局'); continue;
    }
    match = clause.match(/^(?:场景)?(?:切换到|切换为|改为|使用)?(港湾|日落|外海)(?:场景)?预设$/);
    if (match) {
      append({ type: 'preset', preset: { 港湾: 'harbor', 日落: 'sunset', 外海: 'open-water' }[match[1]] }, `切换${match[1]}预设`); continue;
    }
    match = clause.match(new RegExp(`^(?:把)?(?:时间|时段|天空)?${VERB}(黎明|清晨|早晨|上午|中午|下午|日落|黄昏|傍晚|夜晚|夜间|晚上|午夜)$`));
    if (match) { append({ type: 'environment', values: { timeOfDay: PERIODS[match[1]] } }, `时间设为${match[1]}`); continue; }
    match = clause.match(new RegExp(`^(?:把)?时间${VERB}${NUMBER}(?:点|时)?(?:(?:[:：])?(\\d{1,2})(?:分)?)?$`));
    if (match) {
      const minutes = match[2] === undefined ? 0 : Number(match[2]);
      if (minutes > 59 || (match[2] !== undefined && !Number.isInteger(Number(match[1])))) fail('时间须为小时数或有效的 时:分 格式。');
      append({ type: 'environment', values: { timeOfDay: Number(match[1]) + minutes / 60 } }, `时间设为${match[1]}${minutes ? `:${String(minutes).padStart(2, '0')}` : '点'}`); continue;
    }
    match = clause.match(new RegExp(`^(?:把)?风速${VERB}${NUMBER}(?:米每秒|m/s|米/秒)?$`, 'i'));
    if (match) { append({ type: 'environment', values: { windSpeed: Number(match[1]) } }, `风速设为 ${match[1]} 米/秒`); continue; }
    match = clause.match(new RegExp(`^(?:把)?(?:云量|云覆盖率)${VERB}${NUMBER}(%)?$`));
    if (match) { append({ type: 'environment', values: { cloudCover: Number(match[1]) / (match[2] ? 100 : 1) } }, '调整云量'); continue; }
    if (/^(?:把|让)?(?:海浪|浪|海面)(?:变|调|更)?(?:小|平缓|平静)(?:一?点|一?些)?$/.test(clause) || /^(?:降低|减小)(?:海浪|浪)$/.test(clause)) {
      append({ type: 'environment', values: { swell: Math.round(preview.environment.swell * 0.55 * 1000) / 1000 } }, '减小涌浪'); continue;
    }
    match = clause.match(new RegExp(`^(?:把)?(?:镜头|视角)?${VERB}(鸟瞰|俯瞰|码头|船边)(?:镜头|视角)?$`));
    if (match) { append({ type: 'camera', preset: { 鸟瞰: 'overview', 俯瞰: 'overview', 码头: 'pier', 船边: 'boat' }[match[1]] }, `镜头切换到${match[1]}`); continue; }

    // Objects are targeted through selection, never by a guessed or invented entity ID.
    clause = clause.replace(/^(?:把)?(?:选中(?:的)?(?:物体|对象)?)/, '').replace(/(?:选中(?:的)?(?:物体|对象)?)$/, '');
    match = clause.match(new RegExp(`^(?:向|往)?(左|右)(?:移动|移)?${NUMBER}(?:米|m)$`, 'i'));
    if (match) {
      const item = selectedObject(preview, selectedId), metres = Number(match[2]) * (match[1] === '左' ? -1 : 1);
      append({ type: 'object', id: item.id, values: { x: Math.round((item.x + metres) * 1e6) / 1e6 } }, `${item.name}沿世界 X 轴向${match[1]}移动 ${match[2]} 米`); continue;
    }
    match = clause.match(new RegExp(`^(?:(顺时针|逆时针|向左|向右))?旋转(到)?${NUMBER}(?:度|°)$`));
    if (match) {
      const item = selectedObject(preview, selectedId), degrees = Number(match[3]) * (['逆时针', '向左'].includes(match[1]) ? -1 : 1);
      append({ type: 'object', id: item.id, values: { rotation: match[2] ? degrees : item.rotation + degrees } }, `${item.name}旋转 ${degrees} 度`); continue;
    }
    match = clause.match(new RegExp(`^(放大|缩小)(?:${NUMBER}(倍|%))?$`));
    if (match) {
      const item = selectedObject(preview, selectedId), direction = match[1];
      let factor = direction === '放大' ? 1.2 : 1 / 1.2;
      if (match[2] !== undefined) {
        const amount = Number(match[2]);
        if (amount <= 0) fail('缩放幅度必须大于 0。');
        factor = match[3] === '%' ? 1 + (direction === '放大' ? amount : -amount) / 100 : (direction === '放大' ? amount : 1 / amount);
        if (match[3] === '倍' && amount < 1) fail('倍数须至少为 1；例如放大 1.2 倍或缩小 2 倍。');
      }
      append({ type: 'object', id: item.id, values: { scale: Math.round(item.scale * factor * 1e6) / 1e6 } }, `${item.name}${direction}`); continue;
    }
    if (['隐藏', '显示', '锁定', '解锁'].includes(clause)) {
      const item = selectedObject(preview, selectedId);
      const values = ['隐藏', '显示'].includes(clause) ? { visible: clause === '显示' } : { locked: clause === '锁定' };
      append({ type: 'object', id: item.id, values }, `${clause}${item.name}`); continue;
    }
    fail(`不支持指令片段「${raw}」。请使用时间、风速、浪小、选中对象移动/缩放/旋转/显示/锁定或镜头指令；整条指令未执行。`);
  }
  if (!operations.length) fail('指令未包含可执行变更。');
  for (const id of preserve) {
    const before = scene.objects.find((item) => item.id === id), after = preview.objects.find((item) => item.id === id);
    if (['x', 'y', 'z', 'rotation', 'scale'].some((key) => before[key] !== after[key])) fail('指令同时要求保持布局和修改布局，整条指令未执行。');
  }
  return { operations, summary: summaries.join('；') };
}
