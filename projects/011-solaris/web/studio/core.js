export const VERSION = 2;
export const OBJECTS = [
  // Calibrated against the bundled glTF versions; see scripts/calibrate.mjs.
  { id: 'sofa', name: '弧线沙发', type: '坐具', asset: 'sofa_02', width: 2.65, depth: 1.1991369530506324, height: 1.0403827065305107, movable: true, scalable: true, fabric: true },
  { id: 'chair', name: '橡木阅读椅', type: '坐具', asset: 'modern_arm_chair_01', width: 0.86, depth: 1.0342522370784974, height: 1.0722968904195473, movable: true, scalable: true, fabric: true },
  { id: 'table', name: '橡木玻璃茶几', type: '桌几', asset: 'modern_coffee_table_01', width: 0.6615385120907262, depth: 1.3250946965007793, height: 0.43, movable: true, scalable: true },
  { id: 'lamp', name: '可调阅读灯', type: '照明', asset: 'desk_lamp_arm_01', width: 0.11751959773022945, depth: 0.3576181038090658, height: 0.52, movable: true, scalable: true, parent: 'table' },
  { id: 'plant', name: '窗边绿植', type: '植物', asset: 'potted_plant_04', width: 0.7406998866708103, depth: 0.815107263225225, height: 1.18, movable: true, scalable: true },
  { id: 'art', name: '大地色构成', type: '画作', width: 1.58, depth: 0.06, height: 0.92, movable: true, scalable: true, wall: true },
  { id: 'rug', name: '织纹地毯', type: '软装', width: 3.65, depth: 2.65, height: 0.02, movable: true, scalable: true },
];
export const SWATCHES = [
  { id: 'ivory', name: '燕麦白', color: '#d9cdb5' },
  { id: 'sage', name: '苔绿', color: '#849580' },
  { id: 'clay', name: '陶土', color: '#bc7358' },
  { id: 'ink', name: '深海蓝', color: '#536775' },
];
export const WALLS = ['#ddd5c7', '#c9cfbf', '#c9b5a3', '#e9e3d9'];
export const MATERIALS = ['original', 'linen', 'weave'];
export const ARTWORKS = ['earth', 'blue', 'line'];
export const GUIDE_STEPS = [
  { id: 'move', name: '安排一个位置', hint: '选择植物或家具，用移动工具拖到空位，也可输入 X / Z。', labels: ['移动对象','输入对象位置'] },
  { id: 'size', name: '调整家具尺寸', hint: '在对象上上下拖动缩放，或在属性面板输入宽、深、高。', labels: ['调整尺寸','调整独立尺寸'] },
  { id: 'material', name: '选择坐具质感', hint: '选中沙发或阅读椅，切换一种材质或颜色。', labels: ['更换材质','更换颜色'] },
  { id: 'light', name: '找到喜欢的光', hint: '进入环境面板，调整时间、太阳方向或阅读灯。', labels: ['调整时间','调整太阳方向','拖动太阳','切换阅读灯','调整阅读灯亮度'] },
  { id: 'save', name: '保存自己的方案', hint: '点击右上角“保存方案”。完成后可导出 JSON 备份。', labels: ['保存方案'] },
];
export const clone = value => structuredClone(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const MAX_OBJECTS = 24;
export const TABLE_VARIANTS = {
  glass: { name: '橡木玻璃茶几', asset: 'modern_coffee_table_01', width: .6615385120907262, depth: 1.3250946965007793, height: .43 },
  solid: { name: '现代方形茶几', asset: 'modern_coffee_table_02', width: 1.3963935969784573, depth: 1.397028777244936, height: .43 },
};
export function definition(id, project) {
  const value = project?.objects[id];
  const base = OBJECTS.find(object => object.id === (value?.kind || id));
  if (!base) return null;
  return { ...base, ...(base.id === 'table' ? TABLE_VARIANTS[value?.variant || 'glass'] : {}), id, kind: base.id, parent: value?.parent ?? base.parent };
}
export const sceneObjects = (project, includeHidden = false) => Object.keys(project.objects).filter(id => includeHidden || !project.objects[id].hidden).map(id => definition(id, project));
export function dimensions(project, id, value = project.objects[id]) {
  const d = definition(id, project), a = value.stretch || { x: 1, y: 1, z: 1 };
  return { width: d.width * value.scale * a.x, height: d.height * value.scale * a.y, depth: d.depth * value.scale * a.z };
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
const close = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function initialProject() {
  const project = {
    version: VERSION, name: '光与阅读 · 客厅方案',
    objects: {
      sofa: { x: -0.90, z: -1.57, y: 0, rotation: 0, scale: 1, color: 'ivory', material: 'linen' },
      chair: { x: 1.78, z: 0.44, y: 0, rotation: -0.55, scale: 1, color: 'sage', material: 'linen' },
      table: { x: -0.24, z: 0.09, y: 0, rotation: 0, scale: 1 },
      lamp: { x: 0.22, z: -0.04, y: 0.43, rotation: 0.25, scale: 1 },
      plant: { x: 2.12, z: -1.74, y: 0, rotation: 0, scale: 1 },
      art: { x: -0.79, z: -2.42, y: 1.98, rotation: 0, scale: 1, artwork: 'earth' },
      rug: { x: -0.13, z: 0.05, y: 0.014, rotation: 0, scale: 1 },
    },
    guide: { enabled: false, completed: [] },
    environment: { hour: 15, sun: 35, wall: '#ddd5c7', lampOn: true, lampPower: 11 },
    camera: { position: [7.1, 5.45, 7.4], target: [0, 1.06, -0.1] },
  };
  for (const def of OBJECTS) Object.assign(project.objects[def.id], { kind: def.id, hidden: false, stretch: { x: 1, y: 1, z: 1 }, ...(def.id === 'table' ? { variant: 'glass' } : {}) });
  return project;
}

export function worldPosition(project, id) {
  const value = project.objects[id];
  const def = definition(id, project);
  if (!value || !def) throw new Error('对象不存在');
  if (!def.parent) return { x: value.x, y: value.y, z: value.z };
  const parent = project.objects[def.parent];
  const c = Math.cos(parent.rotation), s = Math.sin(parent.rotation);
  const a = parent.stretch;
  const x = value.x * parent.scale * a.x, z = value.z * parent.scale * a.z;
  return { x: parent.x + x * c + z * s, y: dimensions(project, def.parent).height, z: parent.z - x * s + z * c };
}

export function scaleLimits(project, id, rotation = project.objects[id]?.rotation, stretch = project.objects[id]?.stretch) {
  const def = definition(id, project);
  if (!def) throw new Error('对象不存在');
  if (!def.scalable) return { min: 1, max: 1 };
  const min = def.kind === 'rug' ? .7 : .6;
  let max = def.wall ? 1.3 : 1.6;
  const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
  const width = def.width * stretch.x * c + def.depth * stretch.z * s, depth = def.depth * stretch.z * c + def.width * stretch.x * s;
  if (def.parent) {
    const parent = dimensions(project, def.parent);
    max = Math.min(max, parent.width / width, parent.depth / depth);
  } else if (!def.wall) max = Math.min(max, 5.74 / width, 4.74 / depth);
  else max = Math.min(max, 5.7 / width, 2.85 / (def.height * stretch.y));
  max = Math.max(.05, Math.floor((max + 1e-10) * 100) / 100);
  return { min: Math.min(min, max), max };
}

export function constrainObject(project, id, proposed) {
  const def = definition(id, project);
  if (!def) throw new Error('对象不存在');
  const value = { ...project.objects[id], ...proposed };
  value.stretch = { ...project.objects[id].stretch, ...proposed.stretch };
  for (const axis of ['x', 'y', 'z']) { if (!finite(value.stretch[axis])) throw new Error('尺寸必须是有限数值'); value.stretch[axis] = clamp(value.stretch[axis], .5, 1.5); }
  for (const key of ['x', 'y', 'z', 'rotation', 'scale']) if (!finite(value[key])) throw new Error('请输入有限数值');
  if (def.wall) value.rotation = 0;
  else if (value.rotation < -Math.PI || value.rotation >= Math.PI) value.rotation = ((value.rotation + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const limits = scaleLimits(project, id, value.rotation, value.stretch);
  value.scale = clamp(value.scale, limits.min, limits.max);
  if (def.parent) {
    const parent = definition(def.parent, project), pv = project.objects[def.parent];
    const c = Math.abs(Math.cos(value.rotation)), s = Math.abs(Math.sin(value.rotation));
    const hx = (def.width * value.stretch.x * c + def.depth * value.stretch.z * s) * value.scale / (pv.scale * pv.stretch.x) / 2;
    const hz = (def.depth * value.stretch.z * c + def.width * value.stretch.x * s) * value.scale / (pv.scale * pv.stretch.z) / 2;
    value.x = clamp(value.x, -parent.width / 2 + hx, parent.width / 2 - hx);
    value.z = clamp(value.z, -parent.depth / 2 + hz, parent.depth / 2 - hz);
    value.y = dimensions(project, def.parent).height;
  } else if (def.wall) {
    value.x = clamp(value.x, -2.85 + def.width * value.scale * value.stretch.x / 2, 2.85 - def.width * value.scale * value.stretch.x / 2);
    value.y = clamp(value.y, 0.2 + def.height * value.scale * value.stretch.y / 2, 3.05 - def.height * value.scale * value.stretch.y / 2);
    value.z = -2.42;
  } else {
    const c = Math.abs(Math.cos(value.rotation)), s = Math.abs(Math.sin(value.rotation));
    const hx = (def.width * value.stretch.x * c + def.depth * value.stretch.z * s) * value.scale / 2;
    const hz = (def.depth * value.stretch.z * c + def.width * value.stretch.x * s) * value.scale / 2;
    value.x = clamp(value.x, -2.87 + hx, 2.87 - hx);
    value.z = clamp(value.z, -2.37 + hz, 2.37 - hz);
    value.y = def.kind === 'rug' ? 0.014 : 0;
  }
  if (def.fabric) {
    if (!SWATCHES.some(swatch => swatch.id === value.color)) throw new Error('颜色不存在');
    if (!MATERIALS.includes(value.material)) throw new Error('材质不存在');
  }
  if (def.kind === 'art' && !ARTWORKS.includes(value.artwork)) throw new Error('画作不存在');
  if (def.kind === 'art' && value.customImage !== undefined && value.customImage !== null) {
    if (typeof value.customImage !== 'string' || value.customImage.length > 600000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.customImage)) throw new Error('画作图片无效');
  }
  return value;
}

export function overlaps(project, id, value) {
  const a = definition(id, project);
  if (value.hidden || ['rug', 'art', 'lamp'].includes(a.kind)) return false;
  const half = (d, v) => ({ x: (Math.abs(Math.cos(v.rotation)) * d.width * v.stretch.x + Math.abs(Math.sin(v.rotation)) * d.depth * v.stretch.z) * v.scale / 2, z: (Math.abs(Math.cos(v.rotation)) * d.depth * v.stretch.z + Math.abs(Math.sin(v.rotation)) * d.width * v.stretch.x) * v.scale / 2 });
  const ah = half(a, value);
  return sceneObjects(project).some(b => {
    if (b.id === id || ['rug', 'art', 'lamp'].includes(b.kind)) return false;
    const v = project.objects[b.id], bh = half(b, v);
    return Math.abs(value.x - v.x) < ah.x + bh.x - 0.035 && Math.abs(value.z - v.z) < ah.z + bh.z - 0.035;
  });
}

export function updateObject(project, id, patch, collision = true) {
  const next = constrainObject(project, id, patch);
  if (collision && overlaps(project, id, next)) return { changed: false, blocked: true };
  const changed = !close(next, project.objects[id]);
  project.objects[id] = next;
  for (const child of sceneObjects(project, true).filter(object => object.parent === id)) project.objects[child.id] = constrainObject(project, child.id, {});
  return { changed, blocked: false };
}

export function resizeObject(project, id, axis, meters) {
  if (!['x', 'y', 'z'].includes(axis) || !finite(meters) || meters <= 0) throw new Error('请输入大于零的尺寸');
  const def = definition(id, project), value = project.objects[id];
  const size = { x: def.width, y: def.height, z: def.depth }[axis];
  return updateObject(project, id, { stretch: { [axis]: meters / (size * value.scale) } });
}

export function removeObject(project, id) {
  if (!project.objects[id] || project.objects[id].hidden) throw new Error('对象不存在');
  const ids = [id, ...sceneObjects(project).filter(d => d.parent === id).map(d => d.id)];
  for (const key of ids) project.objects[key].hidden = true;
  return ids;
}

export function restoreObject(project, id) {
  const def = definition(id, project);
  if (def.parent && project.objects[def.parent].hidden) throw new Error('请先恢复所属茶几');
  const result = updateObject(project, id, { hidden: false });
  if (result.blocked) throw new Error('原位置已被占用，请先移动附近家具');
  return result;
}

export function duplicateObject(project, id) {
  if (sceneObjects(project, true).length >= MAX_OBJECTS) throw new Error(`一个项目最多保留 ${MAX_OBJECTS} 个对象，请撤销不需要的复制`);
  const source = project.objects[id], def = definition(id, project);
  if (!source || source.hidden) throw new Error('请选择可见对象');
  if (def.parent) throw new Error('台灯随茶几一起复制，避免灯具脱离桌面');
  const children = sceneObjects(project).filter(d => d.parent === id);
  if (sceneObjects(project, true).length + 1 + children.length > MAX_OBJECTS) throw new Error('项目对象数已达到上限');
  let number = 2, key; do { key = `${def.kind}-${number++}`; } while (project.objects[key]);
  const copy = clone(source); project.objects[key] = copy;
  const candidates = [];
  for (let x = -2.5; x <= 2.5; x += .35) for (let z = -2; z <= 2; z += .35) candidates.push({ x, z, distance: Math.hypot(x-source.x, z-source.z) });
  candidates.sort((a, b) => a.distance - b.distance);
  let placed = false;
  for (const point of candidates) {
    const v = constrainObject(project, key, def.wall ? { x: point.x, y: source.y } : { x: point.x, z: point.z });
    if (Math.hypot(v.x-source.x, v.z-source.z) < .3 || overlaps(project, key, v)) continue;
    if (['art','rug'].includes(def.kind)) {
      const size=dimensions(project,key,v);
      const collides=sceneObjects(project).filter(d=>d.id!==key&&d.kind===def.kind).some(d=>{
        const other=project.objects[d.id], b=dimensions(project,d.id);
        if(def.wall)return Math.abs(v.x-other.x)<(size.width+b.width)/2+.05&&Math.abs(v.y-other.y)<(size.height+b.height)/2+.05;
        const half=(s,r)=>({x:(s.width*Math.abs(Math.cos(r))+s.depth*Math.abs(Math.sin(r)))/2,z:(s.depth*Math.abs(Math.cos(r))+s.width*Math.abs(Math.sin(r)))/2});
        const a=half(size,v.rotation),bh=half(b,other.rotation);
        return Math.abs(v.x-other.x)<a.x+bh.x+.05&&Math.abs(v.z-other.z)<a.z+bh.z+.05;
      });
      if(collides)continue;
    }
    project.objects[key] = v; placed = true; break;
  }
  if (!placed) { delete project.objects[key]; throw new Error('空间不足，请先腾出位置再复制'); }
  for (const child of children) {
    let n = 2, childKey; do { childKey = `${child.kind}-${n++}`; } while (project.objects[childKey]);
    project.objects[childKey] = { ...clone(project.objects[child.id]), parent: key };
    project.objects[childKey] = constrainObject(project, childKey, {});
  }
  return key;
}

export function replaceTable(project, id, variant) {
  if (definition(id, project)?.kind !== 'table' || !Object.hasOwn(TABLE_VARIANTS,variant)) throw new Error('茶几型号不存在');
  const before = clone(project.objects[id]);
  project.objects[id].variant = variant;
  const result = updateObject(project, id, {});
  if (result.blocked) { project.objects[id] = before; throw new Error('新茶几需要更多空间，请先调整位置'); }
  return { ...result, changed: !close(project.objects[id],before) };
}

export function advanceGuide(project, label) {
  if (!project.guide.enabled) return false;
  const step = GUIDE_STEPS.find(item => item.labels.includes(label));
  if (!step || project.guide.completed.includes(step.id)) return false;
  project.guide.completed.push(step.id); return true;
}

export function validateProject(input) {
  if (!input || ![1, VERSION].includes(input.version) || typeof input.name !== 'string' || input.name.length > 120) throw new Error('不支持的项目文件');
  const result = initialProject(); result.name = input.name;
  if (input.guide !== undefined) {
    const g=input.guide;
    if (!g || typeof g.enabled!=='boolean' || !Array.isArray(g.completed) || g.completed.some(id=>!GUIDE_STEPS.some(s=>s.id===id))) throw new Error('教程进度无效');
    result.guide={enabled:g.enabled,completed:[...new Set(g.completed)]};
  }
  for (const def of OBJECTS) {
    if (!input.objects?.[def.id]) throw new Error('项目缺少场景对象');
  }
  if (Object.keys(input.objects).length > MAX_OBJECTS) throw new Error('项目对象数量超出上限');
  // Accept only known templates, local variants and documented fields. Parents are tables.
  for (const [id, raw] of Object.entries(input.objects)) {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('对象属性无效');
    if (!/^(sofa|chair|table|lamp|plant|art|rug)(-\d{1,3})?$/.test(id)) throw new Error('对象 ID 无效');
    const kind = raw.kind || id;
    if (!OBJECTS.some(d => d.id === kind) || id.split('-')[0] !== kind) throw new Error('对象类型无效');
    const base = initialProject().objects[kind];
    const value = { ...base };
    for (const key of ['x','y','z','rotation','scale','color','material','artwork','customImage','hidden','variant','parent']) if (Object.hasOwn(raw, key)) value[key] = raw[key];
    value.kind = kind; value.stretch = raw.stretch ? { x: raw.stretch.x, y: raw.stretch.y, z: raw.stretch.z } : { x: 1, y: 1, z: 1 };
    if (typeof value.hidden !== 'boolean' || (kind === 'table' && !Object.hasOwn(TABLE_VARIANTS,value.variant))) throw new Error('对象属性无效');
    if (raw.parent !== undefined && (kind !== 'lamp' || !/^table(-\d{1,3})?$/.test(raw.parent))) throw new Error('对象父级无效');
    result.objects[id] = value;
  }
  for (const def of sceneObjects(result, true).sort((a, b) => Number(!!a.parent) - Number(!!b.parent))) {
    if (def.parent && (definition(def.parent, result)?.kind !== 'table' || (!result.objects[def.id].hidden && result.objects[def.parent].hidden))) throw new Error('台灯所属茶几不可用');
    result.objects[def.id] = constrainObject(result, def.id, {});
  }
  const e = input.environment;
  if (!e || !finite(e.hour) || !finite(e.sun) || !finite(e.lampPower) || typeof e.lampOn !== 'boolean' || !WALLS.includes(e.wall)) throw new Error('环境参数无效');
  result.environment = { hour: clamp(e.hour, 7, 21), sun: clamp(e.sun, -90, 90), wall: e.wall, lampPower: clamp(e.lampPower, 0, 25), lampOn: e.lampOn };
  const c = input.camera;
  if (!c || !['position', 'target'].every(key => Array.isArray(c[key]) && c[key].length === 3 && c[key].every(v => finite(v) && Math.abs(v) < 100))) throw new Error('视角参数无效');
  if (Math.hypot(...c.position.map((v, i) => v - c.target[i])) < 0.2) throw new Error('视角位置无效');
  result.camera = clone(c);
  return result;
}

export class History {
  constructor(project) { this.current = clone(project); this.past = []; this.future = []; this.pending = null; }
  begin(label) { if (this.pending) return; this.pending = { label, before: clone(this.current) }; }
  commit(label = '编辑') {
    if (!this.pending) return false;
    const { before } = this.pending; label = this.pending.label || label; this.pending = null;
    if (close(before, this.current)) return false;
    this.past.push({ label, state: before }); if (this.past.length > 60) this.past.shift(); this.future = []; return true;
  }
  cancel() { if (!this.pending) return false; this.current = this.pending.before; this.pending = null; return true; }
  run(label, fn) { this.begin(label); try { fn(this.current); return this.commit(label); } catch (error) { this.cancel(); throw error; } }
  undo() { this.cancel(); if (!this.past.length) return false; const item = this.past.pop(); this.future.push({ label: item.label, state: clone(this.current) }); this.current = item.state; return item.label; }
  redo() { this.cancel(); if (!this.future.length) return false; const item = this.future.pop(); this.past.push({ label: item.label, state: clone(this.current) }); this.current = item.state; return item.label; }
  replace(project) { this.current = validateProject(project); this.past = []; this.future = []; this.pending = null; }
}

export function parseCommand(text, selected = 'sofa') {
  const value = text.trim().replace(/[，。！!]/g, '');
  const names = { 沙发: 'sofa', 椅子: 'chair', 阅读椅: 'chair', 茶几: 'table', 灯: 'lamp', 台灯: 'lamp', 植物: 'plant', 绿植: 'plant', 挂画: 'art', 画: 'art', 地毯: 'rug' };
  const match = Object.entries(names).sort((a,b) => b[0].length - a[0].length).find(([word]) => value.includes(word));
  const id = match?.[1] ?? selected;
  for (const swatch of SWATCHES) if (value.includes(swatch.name) && /换|变|改/.test(value)) return { kind: 'color', id, color: swatch.id };
  if (/打开.*灯|开灯/.test(value)) return { kind: 'lamp', on: true };
  if (/关闭.*灯|关灯/.test(value)) return { kind: 'lamp', on: false };
  if (/傍晚|黄昏/.test(value)) return { kind: 'hour', hour: 18 };
  if (/午后|下午/.test(value)) return { kind: 'hour', hour: 15 };
  if (/清晨|早上/.test(value)) return { kind: 'hour', hour: 9 };
  const move = value.match(/向?(左|右|前|后)(?:移动|移|挪)?\s*([\d.]+)\s*(厘米|米|cm|m)/i);
  if (move && Number.isFinite(Number(move[2]))) return { kind: 'move', id, direction: move[1], distance: clamp(Number(move[2]) * (/厘米|cm/i.test(move[3]) ? 0.01 : 1), 0, 6) };
  throw new Error('试试「沙发向右移动20厘米」「沙发换成苔绿」「切换傍晚」');
}
