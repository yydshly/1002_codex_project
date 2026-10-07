import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Editable, self-contained project diagram. Native SVG only: no foreignObject,
// screenshots, remotely loaded fonts, external images or rendering dependencies.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 2560, HEIGHT = 1800;
const C = { paper: '#f6f5ef', panel: '#fcfcf7', ink: '#35432f', olive: '#526b44',
  muted: '#68775c', line: '#d9e1d0', tint: '#edf2e5', warm: '#f3eedf', gold: '#9b8550' };
const FONT = "'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', sans-serif";
const chunks = [];
const xml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const add = value => chunks.push(value);
const rect = (x, y, width, height, fill = C.panel, stroke = C.line, radius = 12) =>
  add(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`);
const line = (x1, y1, x2, y2, stroke = C.line, width = 1) =>
  add(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`);
function text(x, y, content, { size = 23, color = C.ink, weight = 400, anchor = 'start', spacing = 0, font = FONT } = {}) {
  add(`<text x="${x}" y="${y}" font-family="${xml(font)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${spacing}">${xml(content)}</text>`);
}
function lines(x, y, values, { gap = 33, ...options } = {}) {
  values.forEach((value, index) => text(x, y + index * gap, value, options));
}
function label(x, y, content, color = C.muted) { text(x, y, content, { size: 24, color, weight: 500 }); }
function arrow(x, y, vertical = false) {
  add(`<path d="${vertical ? `M${x} ${y}v12m-5-5 5 5 5-5` : `M${x} ${y}h16m-6-5 6 5-6 5`}" fill="none" stroke="#91a27e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
}
function number(x, y, value, size = 23) {
  text(x, y, value, { size, color: '#8b9a7b', font: "'Segoe UI', sans-serif", weight: 500 });
}
function icon(x, y, kind) {
  const shapes = {
    living: '<path d="M3 11v9h18v-9M6 12V6h12v6M3 15h18M6 20v3m12-3v3"/>',
    car: '<path d="m4 11 3-6h10l3 6M2 11h20v8H2zM4 19v3m16-3v3M5 14h3m8 0h3"/>',
    imaging: '<rect x="4" y="2" width="16" height="21" rx="2"/><path d="m8 7 3 4-3 4m8-8-3 4 3 4M7 19h10"/>',
    landmark: '<path d="M2 10 12 3l10 7M4 10h16M5 10v11m5-11v11m5-11v11m4-11v11M2 22h20"/>',
    kitchen: '<path d="M2 11h20c-1 9-4 11-10 11S3 20 2 11Z"/><circle cx="8" cy="7" r="3"/><circle cx="17" cy="6" r="4"/>',
    creative: '<path d="m17 2 5 5-11 11-5-5ZM6 13l5 5-6 5-3-3ZM14 5l5 5"/>',
    collection: '<rect x="2" y="3" width="8" height="8" rx="1"/><rect x="14" y="3" width="8" height="8" rx="1"/><rect x="2" y="15" width="8" height="8" rx="1"/><rect x="14" y="15" width="8" height="8" rx="1"/>',
    skate: '<path d="M2 15c4 3 16 3 20 0M8 4l5 4-3 5m3-5 5-3"/><circle cx="7" cy="21" r="2"/><circle cx="17" cy="21" r="2"/>',
    materials: '<path d="M8 5V3h8v2M9 5v9l-5 7h16l-5-7V5M8 17h8"/><path d="M21 8c-2 3 2 3 0 6"/>',
    underwater: '<path d="M3 12c5-8 11-8 16 0-5 8-11 8-16 0Zm16 0 4-4v8ZM8 5l4 3m0 8-4 3"/><circle cx="7" cy="11" r=".7"/>',
    fitting: '<path d="m8 3 4 3 4-3 6 5-4 4-2-2v12H8V10l-2 2-4-4Z"/>',
  };
  add(`<g transform="translate(${x} ${y}) scale(1.35)" fill="none" stroke="#789264" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${shapes[kind]}</g>`);
}

add(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="figure-title figure-description">
<title id="figure-title">ATELIER × Solaris：鼠标交互项目全景</title>
<desc id="figure-description">依据ATELIER 0.17.0既有资料生成的可编辑概念图，非实测截图。左栏为Solaris公开研究与边界；中栏为本地显式状态流程、十一场景及共用基础；右栏为四类工作和四步规划。当前35/36为限定能力映射，不是完成率。C19尚未接入，试衣与真人扩展暂缓；验收与待验范围分别列出。</desc>
<defs><linearGradient id="paper-glow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8f8f1"/><stop offset="1" stop-color="#f0f2e8"/></linearGradient></defs>`);
rect(0, 0, WIDTH, HEIGHT, 'url(#paper-glow)', 'none', 0);
text(80, 86, 'ATELIER × Solaris', { size: 35, color: C.olive, weight: 500, spacing: 1.3 });
text(77, 171, '鼠标交互项目全景', { size: 63, weight: 500, spacing: -1 });
text(82, 225, '从公开研究启发，走向可操作、可保存、可恢复的成果。', { size: 27, color: C.muted });
rect(2034, 52, 446, 57, C.panel, '#cbd7bf', 29);
text(2257, 90, '0.17.0  ·  2026-10-07', { size: 26, anchor: 'middle', color: C.olive });
text(2478, 175, '11 个场景 · 有限范围内接入', { size: 28, anchor: 'end', color: C.olive, weight: 500 });
text(2478, 220, '独立本地产品 / 公开来源研究 / 逐项验收', { size: 23, anchor: 'end', color: C.muted });
line(80, 270, 2480, 270, '#cdd8c1', 2);

const L = { x: 80, width: 508 }, M = { x: 616, width: 1136 }, R = { x: 1780, width: 700 };
label(L.x, 323, '01 / 原研究与生成机制');
label(M.x, 323, '02 / 我们的本地实现');
label(R.x, 323, '03 / 工作类型与后续规划');

// Left: source research and explicit limits. All explanatory body text is >=23px.
rect(L.x, 351, L.width, 1112);
text(L.x + 27, 398, 'Solaris：生成式界面', { size: 29, color: C.olive, weight: 500 });
text(L.x + 27, 436, '36 条公开能力映射线索', { size: 24, color: C.muted });
const originalFlow = [
  '视觉上下文 + 历史鼠标输入',
  'LLM 意图理解 / 场景行为提示',
  '世界模型生成后续交互帧',
  '画面反馈 → 继续交互',
];
originalFlow.forEach((item, i) => {
  const y = 462 + i * 65;
  rect(L.x + 27, y, L.width - 54, 50, i === 2 ? '#eaf0df' : '#f5f7ef', '#d6e0ca', 7);
  text(L.x + L.width / 2, y + 33, item, { size: 24, anchor: 'middle', color: i === 2 ? C.olive : C.ink });
  if (i < originalFlow.length - 1) arrow(L.x + L.width / 2, y + 52, true);
});
text(L.x + 27, 748, '公开交互能力', { size: 26, weight: 500 });
lines(L.x + 27, 787, ['对象尺寸 / 材质光照 / 视角', '图像测量 / 取样成为工具', '动作联动 / 内容策展与转场'], { size: 23, color: C.muted, gap: 32 });
text(L.x + 27, 904, '公开方法', { size: 26, weight: 500 });
const methods = [ ['自回归', 113], ['少步蒸馏', 134], ['自身输出训练', 185] ];
let methodX = L.x + 27;
for (const [title, width] of methods) {
  rect(methodX, 923, width, 43, '#eef2e5', 'none', 5);
  text(methodX + width / 2, 952, title, { size: 23, anchor: 'middle', color: C.olive });
  methodX += width + 8;
}
lines(L.x + 27, 1003, ['实际鼠标调用频率、事件协议', '与持久对象结构未确认。'], { size: 23, color: C.muted, gap: 31 });
line(L.x + 27, 1058, L.x + L.width - 27, 1058);
text(L.x + 27, 1098, '开放情况与证据', { size: 26, weight: 500 });
lines(L.x + 27, 1138, ['官方提供 early-access 申请', '源码 / API / 权重开放未确认'], { size: 23, color: C.muted, gap: 31 });
text(L.x + 27, 1212, '公开挑战与待测项', { size: 26, weight: 500 });
lines(L.x + 27, 1252, ['长会话、文字与可信内容', '无障碍集成仍是公开挑战', '我们未测精度、延迟或成功率'], { size: 23, color: C.muted, gap: 31 });
rect(L.x + 27, 1350, L.width - 54, 99, C.warm, 'none', 7);
text(L.x + 46, 1383, '本项目：公开证据研究', { size: 23, color: '#7d704b', weight: 500 });
lines(L.x + 46, 1413, ['未接入或运行 Solaris。', '画面不证明精确几何或真实物理。'], { size: 23, color: '#7d765b', gap: 28 });

// Middle: explicit local execution, then eleven distinct scene cards.
rect(M.x, 351, M.width, 128, '#edf2e4', '#d0ddc3', 10);
const chain = ['输入与拾取', '工具与约束', '显式状态事务', '本地渲染 / 仿真', '稳定保存恢复'];
const nodeWidth = 188, nodeGap = 30, chainX = M.x + 38;
chain.forEach((item, i) => {
  const x = chainX + i * (nodeWidth + nodeGap);
  rect(x, 372, nodeWidth, 49, C.panel, '#d0ddc2', 6);
  text(x + nodeWidth / 2, 405, item, { size: 23, anchor: 'middle', color: C.olive, weight: 500 });
  if (i < chain.length - 1) arrow(x + nodeWidth + 7, 397);
});
text(M.x + 38, 457, '登记对象、明确语义与合法边界；原三维 / 像素工作流不调用 Solaris 后台。', { size: 23, color: C.muted });
text(M.x, 517, '11 个场景 · 每个入口都有操作目的与边界', { size: 27, weight: 500 });
const scenes = [
  { name: '客厅设计', icon: 'living', action: '家具变换、材质灯光、A/B', boundary: '有限资产；新桌关系待扩展验证' },
  { name: '汽车展厅', icon: 'car', action: '车灯、车漆、原铰链盖板', boundary: '概念车外观；非工程或维修依据' },
  { name: '影像工作台', icon: 'imaging', action: '原图测量、指针缩放与平移', boundary: '默认 px；mm 须已知参考校准' },
  { name: '地标观察', icon: 'landmark', action: '白模环绕、光影与知识热点', boundary: '简化外部；无完整室内 / 可靠尺度' },
  { name: '料理备料', icon: 'kitchen', action: '拖入、沉降、浮起检查与归位', boundary: '四原食材；近似刚体，不切丁' },
  { name: '局部创作', icon: 'creative', action: '图像框选、纹理印章、逐笔撤销', boundary: '有限像素笔刷；非任意风格生成' },
  { name: '精选陈列', icon: 'collection', action: '交换锁槽、策展、九任务与备份', boundary: '有限去向；不续播未完成过程' },
  { name: '滑板练习', icon: 'skate', action: '板面上拖、骨架起落与记录', boundary: '固定平地；非真实运动物理求解' },
  { name: '材料教学', icon: 'materials', action: '热源拖放、同热量对照、冰熔化', boundary: '教学零散热模型；温度非实测' },
  { name: '水下联动', icon: 'underwater', action: '拖鱼、安全跟随、双主体恢复', boundary: '固定水层 / 三礁石；非海洋仿真' },
  { name: '试衣与真人参考', icon: 'fitting', action: '上衣 / 双鞋槽；真人外观研究', boundary: '固定人体与有限衣鞋；不判合身' },
];
const cardWidth = 560, cardHeight = 116;
scenes.forEach((scene, i) => {
  const x = M.x + (i % 2) * (cardWidth + 16), y = 542 + Math.floor(i / 2) * 128;
  rect(x, y, cardWidth, cardHeight, i % 4 < 2 ? C.panel : '#f8faf3', C.line, 9);
  number(x + 20, y + 36, String(i + 1).padStart(2, '0'));
  text(x + 60, y + 36, scene.name, { size: 27, weight: 500 });
  icon(x + cardWidth - 56, y + 13, scene.icon);
  text(x + 20, y + 73, scene.action, { size: 23, color: C.ink });
  text(x + 20, y + 105, scene.boundary, { size: 23, color: C.muted });
});
const noteX = M.x + cardWidth + 16;
line(noteX + 7, 1189, noteX + cardWidth - 7, 1189, '#c5d2b9', 2);
lines(noteX + 8, 1218, ['三维搭配与真人参考归为一个场景。', '潜在用途：空间方案、产品展示、', '教学交互、素材创作与复用底座。', '商业使用还需业务、许可与专项验收。'], { size: 23, color: C.muted, gap: 29 });
rect(M.x, 1320, M.width, 143, '#e9efdf', '#cdd9c0', 10);
text(M.x + 26, 1357, '共用底座：机制已积累，统一协议仍待整理', { size: 26, color: C.olive, weight: 500 });
lines(M.x + 26, 1392, [
  '拾取 / 投影 · 约束 · 手势事务 · 状态校验 · 校准 · 稳定保存恢复',
  'Three.js / Cannon-es + 授权素材；本项目编写控制与局部算法',
  'FASHN：本机预训练研究，不保证合身；不是全部算法自研',
], { size: 23, color: C.muted, gap: 29 });

// Right: classify work and make the planned generalization task explicit.
const types = [
  ['A / 基础能力', '拾取、约束、动作反馈、取消与恢复', '潜在价值：可控编辑与成果延续'],
  ['B / 锦上添花', '真实素材、PBR / HDR、比较与提示', '更易观察；画质不充当能力证据'],
  ['C / 业务与工程', '版本、备份、往返、多窗口与异常', '可靠工作流；真实商品与业务待接'],
  ['D / 真实能力探索', '跨新模型的关系、条件扩展与真实适配', '检验规则推广，同时验证拒绝样本'],
];
types.forEach(([title, body, value], i) => {
  const y = 351 + i * 121;
  rect(R.x, y, R.width, 109, i === 3 ? '#f4f0e3' : C.panel, C.line, 9);
  add(`<rect x="${R.x}" y="${y + 17}" width="4" height="74" rx="2" fill="${i === 3 ? '#aa965f' : '#92a77e'}"/>`);
  text(R.x + 24, y + 34, title, { size: 26, color: i === 3 ? '#7d714a' : C.olive, weight: 500 });
  text(R.x + 24, y + 66, body, { size: 23 });
  text(R.x + 24, y + 97, value, { size: 23, color: C.muted });
});
text(R.x, 866, '下一步 · 四个明确动作', { size: 28, weight: 500 });
const steps = [
  { y: 891, title: '可靠性收尾', body: ['下载 / 剪贴板 / 九页重开 / 真实故障', '竞争写入、设备与长期性能分项验收'] },
  { y: 998, title: '新桌：共用平面支撑规则', body: ['≥3 独立新桌，静态 GLB 声明单位', '未逐件适配 / 未调参 / 不手写支撑', '同规则验灯底 / 孔洞 / 联动恢复与拒绝'] },
  { y: 1137, title: '具备条件后扩展柜架', body: ['可靠尺度 / 多层支撑候选 / 上方净空', '先通过桌面，再验跨层与关系恢复'] },
  { y: 1247, title: '阅读角完整成果任务', body: ['选品 → 布置 → A/B → 画面 → 备份恢复', '验完整可继续编辑成果，而非单按钮'] },
];
steps.forEach((step, i) => {
  add(`<circle cx="${R.x + 18}" cy="${step.y + 15}" r="18" fill="#e5ecd9"/>`);
  text(R.x + 18, step.y + 23, i + 1, { size: 23, anchor: 'middle', color: C.olive });
  text(R.x + 53, step.y + 25, step.title, { size: 26, weight: 500 });
  lines(R.x + 53, step.y + 60, step.body, { size: 23, color: C.muted, gap: 30 });
});
rect(R.x, 1370, R.width, 93, '#f0ebdb', 'none', 9);
lines(R.x + 24, 1407, ['C19 购物联动未接入，目前暂停推进。', '试衣与真人扩展暂缓；商用尚未完成。'], { size: 24, color: '#7e714c', gap: 34 });

// Full-width verification rail. Prior evidence and outstanding work are separate.
rect(80, 1502, 2400, 206, C.panel, '#ccd8bf', 12);
add(`<path d="M864 1526v154M1682 1526v154" stroke="#d8e0cf" fill="none"/>`);
text(108, 1546, '既有验收 · 0.17.0', { size: 25, color: C.muted, weight: 500 });
text(108, 1600, '243 产品 Node / 16 仓库检查', { size: 32, color: C.olive, weight: 500 });
lines(108, 1640, ['真实界面操作与故障模拟分开留档。', '数字按有限输入与实际检查范围使用。'], { size: 23, color: C.muted, gap: 31 });
text(895, 1546, '任务与稳定成果', { size: 25, color: C.muted, weight: 500 });
text(895, 1600, '9 个往返目标 · 10 份稳定存档', { size: 31, color: C.olive, weight: 500 });
lines(895, 1640, ['不含会话撤销、未提交预览与运行中过程。', '试衣 / 真人任务不在整套备份内。'], { size: 23, color: C.muted, gap: 31 });
text(1714, 1546, '继续专项验证', { size: 25, color: '#8a7750', weight: 500 });
lines(1714, 1593, ['下载落盘 / 剪贴板 / 九页逐一重开', '真实故障 / 全局多窗口 / 设备与长期性能', '整套恢复不保证跨窗口多键原子性。'], { size: 24, color: C.muted, gap: 38 });
text(83, 1749, '35/36 = 公开清单的限定能力映射，不是产品完成率。项目资料生成的概念图，非实测截图。', { size: 24, color: C.olive });
text(83, 1783, '来源：Runway “Introducing Solaris” · arxiv.org/html/2609.00776v1 ｜ 范围依据：ATELIER 0.17.0 项目记录', { size: 23, color: C.muted });
add('</svg>\n');

const svg = chunks.join('\n');
const outputs = ['assets/atelier-project-overview.svg', 'web/assets/atelier-project-overview.svg'];
for (const relative of outputs) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Overview output escaped the project directory');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, svg, 'utf8');
}
console.log(JSON.stringify({ width: WIDTH, height: HEIGHT, bytes: Buffer.byteLength(svg), scenes: scenes.length, minimumBodyFontSize: 23, outputs }, null, 2));
