export const VERSION = 1;
export const PRODUCT_IDS = Object.freeze(['sofa', 'chair', 'table-glass', 'table-solid', 'lamp', 'plant']);
export const PREFERENCE_IDS = Object.freeze(['all', 'reading', 'compact', 'natural']);

const product = (id, name, category, model, tags, description) => Object.freeze({
  id, name, category, model, tags: Object.freeze(tags), description,
  sourceUrl: `https://polyhaven.com/a/${model}`, license: 'CC0',
});

/** Registered CC0 design assets. Tags describe this collection's editorial rules, not certified materials or physical fit. */
export const PRODUCTS = Object.freeze({
  sofa: product('sofa', '双人沙发', '坐具', 'sofa_02', ['休憩坐具', '软垫外观'], '适合在休憩构图中观察的完整沙发模型；保留原始显示纹理。'),
  chair: product('chair', '扶手阅读椅', '坐具', 'modern_arm_chair_01', ['阅读坐具', '单人坐具', '木纹外观', '软垫外观'], '带扶手的单人椅模型，可查看坐垫、支架与原始外观。'),
  'table-glass': product('table-glass', '长形茶几', '桌几', 'modern_coffee_table_01', ['随手置物', '长形桌面', '木纹外观'], '长形桌面与支撑结构的茶几模型，作为作者策展的置物参考。'),
  'table-solid': product('table-solid', '方形茶几', '桌几', 'modern_coffee_table_02', ['随手置物', '方形桌面', '木纹外观'], '方形桌面茶几模型，可与长形款比较原始形态。'),
  lamp: product('lamp', '折臂阅读灯', '照明', 'desk_lamp_arm_01', ['辅助灯具', '陈列配角'], '折臂灯具模型，用于阅读主题的陈列与结构观察。'),
  plant: product('plant', '陶盆小多肉', '植物', 'potted_plant_04', ['植被形态', '陈列配角'], '盆栽植物模型，用于自然主题的陈列与外观观察。'),
});

export const PREFERENCES = Object.freeze({
  all: Object.freeze({ name: '全部设计', weights: Object.freeze({}) }),
  reading: Object.freeze({ name: '阅读角', weights: Object.freeze({ 阅读坐具: 3, 辅助灯具: 3, 随手置物: 1 }) }),
  compact: Object.freeze({ name: '紧凑陈列', weights: Object.freeze({ 单人坐具: 3, 长形桌面: 2, 陈列配角: 1 }) }),
  natural: Object.freeze({ name: '自然外观', weights: Object.freeze({ 植被形态: 3, 木纹外观: 2, 软垫外观: 1 }) }),
});

const scene = (sceneId, name, path) => Object.freeze({ sceneId, name, path });
export const SCENES = Object.freeze({
  living: scene('living', '客厅工作台', './index.html'),
  showroom: scene('showroom', '汽车展厅', './showroom.html'),
  imaging: scene('imaging', '影像工作台', './imaging.html'),
  landmark: scene('landmark', '地标视口', './landmark.html'),
  kitchen: scene('kitchen', '料理备料台', './kitchen.html'),
  creative: scene('creative', '创作台', './creative.html'),
  skate: scene('skate', '滑板练习场', './skate.html'),
  materials: scene('materials', '材料教学台', './materials.html'),
  underwater: scene('underwater', '水下工作台', './underwater.html'),
});

const task = (title, operation, expected, boundary) => Object.freeze({ title, operation, expected, boundary });
/** Finite tasks use the destination's existing tools and independently saved workspace. */
export const SCENE_TASKS = Object.freeze({
  living: task('布置一个阅读角', '拖动阅读椅或台灯，调整尺寸、配色和光照，再保存方案。', '家具、表面和光照随编辑变化；重开后继续已保存的布置。', '只编辑登记家具与设计光照，不自动植入陈列素材或生成新房间。'),
  showroom: task('检查车灯与引擎盖', '点击车灯和引擎盖，拖动环绕车辆，再保存状态。', '灯组与实际照明一起变化；盖板绕原铰链开合，视角和开度可恢复。', '概念车辆的视觉与部件探索，不提供车型维修或工程照度判断。'),
  imaging: task('比较缩放前后的测量', '拖出两点测量，围绕指针放大并平移，查看同一条标注。', '端点保持原图位置，缩放前后距离不变；标注可保存。', '默认显示像素；毫米比例须用户校准，不提供诊断或临床精度保证。'),
  landmark: task('从不同方向观察建筑', '拖动环绕建筑，切换立面、背侧和屋顶，并点击知识热点。', '同一建筑白模在不同视角保持一致；资料卡给出来源，视角可保存。', '简化外部打印白模与有限知识卡，不包含完整室内或真实天文日照。'),
  kitchen: task('组合一份备料', '把托盘食材拖入碗内，等待稳定，再点击食材浮起检查。', '实例和数量保持；受阻检视会拒绝，归位后保存稳定组合。', '完整带皮食材与近似碰撞，不模拟切丁、烹饪或称重。'),
  creative: task('完成一块局部纹理', '在来源图框选纹理，再拖动画笔到画纸或试片上绘制。', '来源选区持续可见；每笔可撤销，范围外画面保持，创作可保存。', '图像取样与参数笔刷，不代表语义风格迁移或三维材质重建。'),
  skate: task('完成一次上拖跳跃', '按住真实滑板向上拖至少24像素后松手，落地后重播或保存记录。', '骑手与板同步起跳、落地；完成才记一次，取消不留记录。', '固定平地与有限骨架动作；只保存已完成练习，不续播未完成动作。'),
  materials: task('比较铜铝同热量温升', '展开同热量对照，选择40、80或120焦耳，观察铜和铝依次供能。', '相同热量对应不同温升；图与热账同步，稳定热量和记录可保存。', '教学公式的计算读数，不是实测温度；重开不续跑未完成对照。'),
  underwater: task('让潜水员追随目标', '按住鱼体拖向空旷水层，松手观察潜水员转向、绕礁与停稳。', '鱼保持落点，潜水员沿有限安全路径追随；整次可撤销并保存稳定位置。', '固定水层与登记礁石，不模拟海洋动力学；重开不续播跟随过程。'),
});

export const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

function productId(id) {
  if (typeof id !== 'string' || !PRODUCT_IDS.includes(id)) throw new Error('设计素材编号无效');
  return id;
}

function sceneId(id) {
  if (typeof id !== 'string' || !Object.hasOwn(SCENES, id)) throw new Error('场景编号无效');
  return id;
}

function preferenceId(key) {
  if (typeof key !== 'string' || !PREFERENCE_IDS.includes(key)) throw new Error('策展偏好编号无效');
  return key;
}

function idList(value, complete = false) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > PRODUCT_IDS.length || (complete && value.length !== PRODUCT_IDS.length) ||
      Reflect.ownKeys(value).length !== value.length + 1) throw new Error('设计素材清单结构无效');
  const ids = [], found = new Set();
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('设计素材清单必须连续');
    const id = productId(descriptor.value);
    if (found.has(id)) throw new Error('设计素材编号重复');
    found.add(id); ids.push(id);
  }
  return ids;
}

export function initialState() {
  return { version: VERSION, order: [...PRODUCT_IDS], pinned: [], selected: 'chair', wishlist: [], preference: 'all', lastScene: null };
}

export function validateState(value) {
  exactKeys(value, ['version', 'order', 'pinned', 'selected', 'wishlist', 'preference', 'lastScene'], '精选设计文件结构无效');
  if (value.version !== VERSION) throw new Error('不支持的精选设计文件版本');
  return {
    version: VERSION, order: idList(value.order, true), pinned: idList(value.pinned),
    selected: productId(value.selected), wishlist: idList(value.wishlist), preference: preferenceId(value.preference),
    lastScene: value.lastScene === null ? null : sceneId(value.lastScene),
  };
}

export function swapProducts(state, fromId, toId) {
  const next = validateState(state);
  productId(fromId); productId(toId);
  if (fromId === toId) return next;
  if (next.pinned.includes(fromId) || next.pinned.includes(toId)) throw new Error('锁定的设计素材保持原槽位，请先解除锁定');
  const from = next.order.indexOf(fromId), to = next.order.indexOf(toId);
  [next.order[from], next.order[to]] = [next.order[to], next.order[from]];
  return next;
}

function toggle(state, id, key) {
  const next = validateState(state);
  productId(id);
  next[key] = next[key].includes(id) ? next[key].filter(value => value !== id) : [...next[key], id];
  return next;
}

export const togglePin = (state, id) => toggle(state, id, 'pinned');
export const toggleWishlist = (state, id) => toggle(state, id, 'wishlist');

export function selectProduct(state, id) {
  const next = validateState(state);
  next.selected = productId(id);
  return next;
}

/** Stable editorial ranking only fills unlocked slots; the pinned IDs retain their exact previous indices. */
export function planPreference(state, key) {
  const current = validateState(state), preference = preferenceId(key), rule = PREFERENCES[preference];
  const scored = current.order.map((id, index) => {
    const matches = PRODUCTS[id].tags.filter(tag => Object.hasOwn(rule.weights, tag));
    const score = matches.reduce((sum, tag) => sum + rule.weights[tag], 0);
    const explanation = preference === 'all' ? '无偏好排序，保留当前相对顺序' :
      matches.length ? matches.map(tag => `${tag} +${rule.weights[tag]}`).join('；') : '无匹配标签，保留同分项的当前相对顺序';
    return { id, index, score, reason: current.pinned.includes(id) ? `已锁定第 ${index + 1} 槽；${explanation}` : explanation };
  });
  const unlocked = scored.filter(item => !current.pinned.includes(item.id)).sort((a, b) => b.score - a.score || a.index - b.index);
  let index = 0;
  const order = current.order.map(id => current.pinned.includes(id) ? id : unlocked[index++].id);
  const byId = new Map(scored.map(item => [item.id, item]));
  return { preference, order, reasons: order.map(id => { const { score, reason } = byId.get(id); return { id, score, reason }; }) };
}

export function applyPreference(state, key) {
  const next = validateState(state), plan = planPreference(next, key);
  next.preference = plan.preference; next.order = plan.order;
  return next;
}

const INTENT_ALIASES = Object.freeze({
  living: ['客厅', '客厅工作台'], showroom: ['展厅', '汽车展厅'], imaging: ['影像', '影像工作台'],
  landmark: ['地标', '地标视口'], kitchen: ['料理', '料理备料台'], creative: ['创作', '创作台'],
  skate: ['滑板', '滑板练习', '滑板练习场'],
  materials: ['材料', '材料教学', '材料教学台', '热响应', '热响应教学台'],
  underwater: ['水下', '水下工作台', '水下拖动', '水下拖动工作台'],
});
const INTENT_PREFIXES = Object.freeze(['去', '打开', '进入', '前往', '切换到', '请去', '请打开', '请进入', '带我去', '我想去', '我要去']);

/** A finite command registry, never a generated URL or an unrestricted language router. */
export function resolveIntent(text) {
  if (typeof text !== 'string' || text.length > 120) return null;
  const command = text.trim().replace(/\s+/g, '').replace(/[。！!？?]$/, '');
  for (const [id, aliases] of Object.entries(INTENT_ALIASES)) {
    if (aliases.some(alias => INTENT_PREFIXES.some(prefix => command === prefix + alias))) return { ...SCENES[id] };
  }
  return null;
}

export function validateCheckpoint(value) {
  exactKeys(value, ['version', 'token', 'sceneId', 'shop'], '跨场景检查点结构无效');
  if (value.version !== VERSION || typeof value.token !== 'string' || !/^[0-9a-f]{16}$/.test(value.token)) throw new Error('跨场景检查点版本或令牌无效');
  return { version: VERSION, token: value.token, sceneId: sceneId(value.sceneId), shop: validateState(value.shop) };
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
  begin(label = '编辑精选设计') {
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
  run(label, fn) {
    if (this.pending) throw new Error('请先完成当前编辑');
    if (typeof fn !== 'function') throw new Error('编辑操作无效');
    this.begin(label);
    try { const next = fn(this.current); if (next !== undefined) this.current = next; return this.commit(); }
    catch (error) { this.cancel(); throw error; }
  }
  edit(label, fn) { return this.run(label, fn); }
  undo() {
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
