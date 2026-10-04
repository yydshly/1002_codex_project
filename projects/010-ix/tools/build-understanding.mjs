import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Original editorial diagram. All text remains editable; no upstream screenshots.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1800, H = 4360;
const palette = { ink: '#142333', muted: '#526875', paper: '#f3f5f1', navy: '#0e192a', green: '#117c67', mint: '#e0f0e8', gold: '#a1651e', amber: '#fbefda', line: '#d5e0da' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const out = [];
const rect = (x,y,w,h,fill= '#fff',rx=16,stroke=palette.line) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''}/>`);
function label(value, x, y, size=24, color=palette.ink, weight=400, extra='') {
  out.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${escape(value)}</text>`);
}
function wrap(value, width, size) {
  const lines = []; let line = '', used = 0;
  for (const c of value) {
    const advance = /[\u0000-\u00ff]/.test(c) ? size * .57 : size;
    if (used + advance > width && line) { lines.push(line); line=''; used=0; }
    line += c; used += advance;
  }
  if (line) lines.push(line);
  return lines;
}
function body(lines,x,y,width,size=23,color=palette.muted,leading=32) {
  let baseline = y;
  for (const line of lines) for (const row of wrap(line,width,size)) { label(row,x,baseline,size,color); baseline += leading; }
  return baseline-leading+size*.25;
}
function tag(value,x,y,kind='fact') {
  const color=kind==='fact'?palette.green:palette.gold;
  const fill=kind==='fact'?palette.mint:palette.amber;
  const width=value.length*18+26;
  rect(x,y,width,30,fill,6,null); label(value,x+13,y+21,17,color,600);
}
function section(id,number,title,subtitle,y) {
  out.push(`<g id="${id}" data-section="${id}">`);
  label(number,64,y,26,palette.green,700);
  label(title,128,y,34,palette.ink,700);
  label(subtitle,W-64,y,20,palette.muted,400,'text-anchor="end"');
}
const end = () => out.push('</g>');
function card({x,y,w,h,title,lines,commands,kind='fact',badge,size=21,leading=29}) {
  out.push(`<g class="ix-map-card" aria-label="${escape(title)}">`);
  rect(x,y,w,h,kind==='future'?'#f9f4e9':'#fff');
  if (badge) tag(badge,x+22,y+18,kind);
  const titleY=y+(badge?76:39);
  label(title,x+22,titleY,27,palette.ink,700);
  const endY=body(lines,x+22,titleY+31,w-44,size,palette.muted,leading);
  if (commands) label(commands,x+22,y+h-20,18,palette.green,500);
  if (endY > y+h-10-(commands?22:0)) throw new Error(`Diagram text exceeds card: ${title}`);
  end();
}
function arrow(x1,y1,x2,y2,dashed=false,color=palette.green) {
  out.push(`<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2"${dashed?' stroke-dasharray="7 6"':''} marker-end="url(#arrow)"/>`);
}

const views = [
  { id:'all', label:'完整总览', x:0,y:0,width:W,height:H },
  { id:'position', label:'定位与目标', x:0,y:0,width:W,height:485 },
  { id:'principle', label:'底层原理', x:0,y:475,width:W,height:665 },
  { id:'capability', label:'当前能力', x:0,y:1140,width:W,height:440 },
  { id:'effect', label:'展示效果', x:0,y:1580,width:W,height:450 },
  { id:'diagnosis', label:'问题与性能', x:0,y:2030,width:W,height:370 },
  { id:'extension', label:'扩展价值', x:0,y:2400,width:W,height:385 },
  { id:'product', label:'产品方向', x:0,y:2785,width:W,height:915 },
  { id:'boundary', label:'边界与证据', x:0,y:3700,width:W,height:660 },
];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ix-map-title ix-map-description">
<title id="ix-map-title">Ix 完整理解图：能力、展示、原理、扩展价值与产品方向</title>
<desc id="ix-map-description">公开源码事实以绿色标识；展示设计和扩展产品以黄色标识。涵盖增量扫描、语法抽取、目标解析、数据库节点与边、查询深度、当前辅助能力、可呈现结果、Bug与性能边界、扩展层次和八个产品方向。本图为本项目独立研究，未运行 Ix。</desc>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L8 5 L1 9" fill="none" stroke="context-stroke" stroke-width="2"/></marker></defs>
<style>text{font-family:'Microsoft YaHei','Segoe UI','Noto Sans CJK SC',sans-serif}text{letter-spacing:0}a text{text-decoration:underline;text-underline-offset:4px}</style>`);
for(const view of views) out.push(`<view id="view-${view.id}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}"/>`);
rect(0,0,W,H,palette.paper,0,null);
rect(0,0,W,235,palette.navy,0,null);
label('IX / 从代码关系到软件理解',64,55,22,'#55d5b5',600);
label('我们对 Ix 的完整理解',64,122,57,'#f3f5f1',700);
label('共享、持久、可追溯的代码结构索引，供开发者和 AI 查询与核对。',64,171,28,'#b7cbd5');
label('公开 main · 核验 2026-10-04 · 未锁定 commit · 本图非真实运行截图',64,210,20,'#b7cbd5');
tag('绿色：公开能力 / 已核验机制',1190,36);
tag('黄色：展示设计 / 扩展设想',1190,80,'future');

section('position','01','产品定位与目标','理解软件实现，减少反复定位和阅读',282);
card({x:64,y:305,w:824,h:155,title:'当前定位：结构索引与辅助分析',lines:['代码 → 实体与关系 → 持久图 → 有界查询与源码证据','辅助接手、排查、评审、重构和 AI 编码；实际收益需测量。']});
card({x:912,y:305,w:824,h:155,title:'人和 AI 使用同一份结构事实',lines:['人：找到实现、探索路径、打开源码、核对判断。','AI：按目标取必要上下文；模型与执行能力由宿主提供。']});
end();

section('principle','02','底层原理：先解析关联，再写入数据库','通用思路；语法与目标解析需要语言适配',515);
const pipeline = [
  ['扫描与增量',['Git 文件清单 / 目录回退','筛选语言、大小与生成文件','mtime → SHA-256 比较','变化重解析；删除需清理']],
  ['语法结构抽取',['Tree-sitter + 语言查询','先定义，再导入与调用','识别函数、类、文件等','保留行范围和容器']],
  ['调用目标解析',['符号表 + 导入绑定索引','明确导入 → 一跳再导出','同语言唯一名称回退','歧义与常见名可能跳过']],
  ['版本化图补丁',['UpsertNode / Edge','ID：工作区、路径、限定名','Patch：hash + 提取器','来源、replaces、删除']],
  ['数据库与接口',['CLI → HTTP Patch','Scala memory-layer','ArangoDB / volume','节点、边、来源、rev']],
  ['查询与结果',['名字 / 路径 → 实体 ID','方向 + 关系类型 + hops','CLI / MCP / Compass 读取','组织文字、记录与局部图']],
];
pipeline.forEach(([title,lines],i)=>card({x:64+i*282,y:548,w:262,h:220,title,lines,size:18,leading:24}));
for(let i=0;i<5;i++) arrow(328+i*282,658,342+i*282,658);
rect(64,790,1672,122,palette.mint);
label('数据库关联：每个实体有 ID，关系记录用 src / dst 指向两端节点。',86,827,25,palette.ink,600);
body(['CALLS 调用 · IMPORTS 导入 · CONTAINS 包含 · REFERENCES 引用 · EXTENDS / IMPLEMENTS 继承与实现','来源路径、行范围、hash 与图谱版本用于回溯；改名或移动文件可能改变身份。'],86,865,1628,22);
rect(64,934,1672,176,'#fff');
label('直接边与查询深度 · 概念示例，非 Ix 实测',86,970,24,palette.ink,600);
[['N1 / submitOrder',245],['N2 / checkoutOrder',795],['N3 / calculateShipping',1345]].forEach(([name,x])=>{
  rect(x-159,990,318,51,palette.mint,9,null); label(name,x,1023,23,palette.ink,600,'text-anchor="middle"');
});
arrow(422,1015,618,1015);arrow(972,1015,1168,1015);
label('CALLS',520,998,18,palette.green,500,'text-anchor="middle"');label('CALLS',1070,998,18,palette.green,500,'text-anchor="middle"');
label('反向从 N3 查询：1 跳找到 N2；2 跳继续找到 N1。深度相对于起点，不是函数固定属性。',86,1075,23);
label('impact 默认 1、上限 3；本例需 --depth 2。trace 是静态遍历；公开摄取代码逐条写关系，间接依赖由路径体现。',86,1103,20,palette.muted);
end();

section('capability','03','Ix 当前提供的能力','可组合的查询与维护工具',1176);
const capabilities = [
 ['定位与阅读',['找符号、定义和源码；文本搜索补充候选。'],'search · locate · read · text'],
 ['调用与依赖',['查上游、下游、导入、包含与关联路径。'],'callers · callees · trace · depends'],
 ['结构解释与影响',['摘要、清单、结构排序与潜在影响范围。'],'explain · overview · inventory · impact · rank'],
 ['架构辅助检查',['结构异味、子系统与图中 claim 矛盾线索。'],'smells · subsystems · conflicts · view'],
 ['持久化与修订',['增量与跨工作区图谱；资料摄取、历史和差异。'],'map · watch · history · diff · ingest'],
 ['AI 上下文与接入',['按目标组合实体、关系和证据并裁剪预算。'],'context · --from-issue · MCP · text / json / llm'],
];
capabilities.forEach(([title,lines,commands],i)=>card({x:64+(i%3)*566,y:1208+Math.floor(i/3)*171,w:540,h:150,title,lines,commands}));
label('explain 公开流程为事实收集 → 规则推断 → 模板呈现；MCP 复用 CLI。AI 调用工具后仍需判断与验证。',64,1560,21,palette.muted);
end();

section('effect','04','可以展现的效果：让理解有路径、有依据','绿色为现有输出，黄色为我们的展示设计',1620);
card({x:64,y:1652,w:540,h:182,title:'终端 / 程序结果',lines:['符号位置、关系、路径、摘要、影响候选。','文字方便人读；JSON 方便程序串联。','LLM 格式提供紧凑、有范围的结构记录。'],badge:'公开输出'});
card({x:630,y:1652,w:540,h:182,title:'Compass / 图形浏览',lines:['读取同一后端的图与系统 / 子系统层级。','view 本地代理：8080 → 8090。','本次未核验具体布局算法、图库和界面。'],badge:'官方可视化入口'});
card({x:1196,y:1652,w:540,h:182,title:'AI 获得的内容',lines:['当前任务相关的实体、关系和来源。','必要源码与诊断信息；限制上下文预算。','图不会让模型自动掌握完整业务。'],badge:'MCP / context'});
rect(64,1856,1672,145,palette.amber);
tag('展示设计：软件理解工作台',86,1870,'future');
label('系统概览 → 问题输入 → 实现说明 + 局部关系图 ↔ 点击定位源码与证据',86,1934,29,palette.ink,600);
label('最终结果：知道功能在哪里、如何关联、依据是什么、哪些内容仍待确认；衡量任务准确性与完成时间。',86,1974,23,palette.muted);
end();

section('diagnosis','05','还能辅助什么？定位问题、审查结构、调查性能','结构线索与运行证据承担不同工作',2073);
const dx=[
 ['Bug 定位','问题描述 / 报错符号 → 相关代码与调用入口','复现、错误堆栈、日志、输入与测试确认根因'],
 ['架构 / 重构','高依赖组件、结构异味、潜在影响与测试线索','设计判断、动态关系、契约和回归测试'],
 ['性能排查','定位可疑函数及调用方，阅读循环与访问逻辑','耗时、频率、CPU、内存、SQL 与外部等待数据'],
];
rect(64,2106,1672,207);
label('排查任务',86,2140,21,palette.green,600);label('Ix 可以提供',335,2140,21,palette.green,600);label('确认结论还需要',1010,2140,21,palette.green,600);
dx.forEach(([a,b,c],i)=>{const y=2182+i*51;label(a,86,y,24,palette.ink,600);body([b],335,y,640,21,palette.muted,27);body([c],1010,y,702,21,palette.muted,27);});
rect(64,2331,1672,50,palette.amber,9,null);
label('结构热点不等于耗时热点；一条 CALLS 边不表示实际调用次数。公开 CLI 未见内置性能数据采集。',86,2364,24,palette.gold,600);
end();

section('extension','06','可扩展价值：由结构证据进入诊断与操作','以下为扩展路线，不是 Ix 现成能力',2440);
const ex=[
 ['扩大覆盖',['语言与框架适配；路由、SQL、配置、事件关系。','新增边必须有提取依据、来源与更新策略。']],
 ['提高分析深度',['加入类型、数据流、控制流、业务规则与状态。','调用关系不能直接视为因果或业务正确性证明。']],
 ['连接真实运行',['日志、Trace、Profiler、测试覆盖和部署版本。','把观测定位回同一版本源码，核对异常与瓶颈。']],
 ['形成可操作能力',['绑定可调用接口、契约、权限和状态变化。','支持任务组合；执行、失败恢复和结果验证另建。']],
];
ex.forEach(([title,lines],i)=>card({x:64+i*423,y:2475,w:403,h:205,title,lines,kind:'future'}));
rect(64,2700,1672,60,palette.navy,10,null);
label('通用构图思路可以复用；产品价值来自可信关系、领域语义、运行证据与实际完成的任务。',86,2739,25,'#e7f4ed',600);
end();

section('product','07','可扩展产品方向：从辅助理解到完成明确任务','全部为产品假设；不代表市场空白或已验证收益',2825);
const products=[
 ['A / 软件理解工作台',['目标：接手、探索和解释复杂系统。','交付：说明 + 局部图 + 源码证据 + 待确认项。','验证：理解正确率、完成时间、上下文成本。']],
 ['B / 问题与性能诊断',['目标：从异常或慢请求走到可检验的问题候选。','需要：日志、Profiler / Trace、版本与源码映射。','验证：根因候选准确性、复现率与定位时间。']],
 ['C / 业务变更验收',['目标：发现漏实现、例外被破坏和未验证场景。','需要：团队确认的验收规则、相关实现与测试。','验证：人工确认的遗漏、误报与验收耗时。']],
 ['D / 跨系统变更协调',['目标：接口、字段或事件升级能完整推进。','交付：消费者、责任人、兼容验证和发布顺序。','需要：真实契约、版本、消费者与部署证据。']],
 ['E / 旧功能安全退役',['目标：完成旧服务、任务或表的退役与成本回收。','需要：结构依赖、使用记录、季节性与资源数据。','交付：分阶段计划、观测、回滚与退役结果。']],
 ['F / 旧系统能力提取',['目标：复用已有业务能力，减少重复开发。','交付：可调用接口、依赖边界、运行包与测试。','需要：状态、事务、权限；函数并不天然独立。']],
];
products.forEach(([title,lines],i)=>card({x:64+(i%2)*848,y:2860+Math.floor(i/2)*184,w:824,h:164,title,lines,kind:'future'}));
card({x:64,y:3426,w:824,h:242,title:'G / 业务策略预演',lines:['目标：在沙盒中比较策略、约束及可能结果。','需要：验证过的行为模型、真实数据、假设与校准。','代码图帮助定位实现；预演需要额外建模与执行。'],kind:'future',badge:'远期扩展：行为模型'});
card({x:912,y:3426,w:824,h:242,title:'H / AI 跨系统任务执行',lines:['目标：把既有软件能力组合为可完成的业务任务。','需要：业务对象、能力契约、权限、执行与失败恢复。','验证：任务成功率、约束遵守、结果核对与人工介入。'],kind:'future',badge:'远期扩展：操作能力'});
end();

section('boundary','08','采用边界、证据与判断尺度','保持事实、推演、实测的区别',3730);
const boundaries=[
 ['图谱覆盖与新鲜度',['动态调用、反射与歧义可能漏连或误连。','图中没有关系，不能单独证明没有依赖。']],
 ['默认摄取与查询范围',['普通 map 默认 topology-only，过滤 chunk / claim。','正文可从本地源码读取；有限深度和预算会裁剪。']],
 ['后端、版本与许可',['Scala 后端源码私有，以公开镜像交付。','graph revision 不是 Git SHA；公开 repo 为 Apache-2.0。']],
 ['Pro、云端与运行条件',['决策 / 目标 / 计划等为 Pro；semantic 需云提取。','本地标准部署：Node 22+、Docker / Compose、ArangoDB。']],
];
boundaries.forEach(([title,lines],i)=>card({x:64+(i%2)*848,y:3766+Math.floor(i/2)*137,w:824,h:118,title,lines}));
rect(64,4057,1672,104,palette.mint);
body(['研究事实：未安装或运行 Ix，未实测解析准确率、性能和 token 节省；中文页与调用图采用教学数据。','Node 订单示例实际运行过，不能当成 Ix 查询验证。扩展产品的付费意愿、可行性与收益尚待验证。'],86,4094,1628,22,palette.ink,32);
end();
label('证据入口 / 公开源码与官方资料',64,4211,24,palette.ink,600);
const sources=[
 ['Ix README / 命令','https://github.com/ix-infrastructure/Ix/blob/main/skills/ix/references/commands.md'],
 ['解析器 / Patch','https://github.com/ix-infrastructure/Ix/tree/main/core-ingestion/src'],
 ['API / 图数据模型','https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md'],
 ['代码属性图 / CPG','https://cpg.joern.io/'],
 ['运行观测 / OTel','https://opentelemetry.io/docs/concepts/signals/traces/'],
];
sources.forEach(([name,url],i)=>{out.push(`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">`);label(name,64+i*340,4255,22,palette.green);out.push('</a>');});
label('已有产品边界：Sourcegraph 搜索 / 批量变更 · Greptile 审查 · SeaLights 测试影响 · Pact 兼容验证；扩展方向需进一步差异化。',64,4302,20,palette.muted);
label('原创理解图 · 可编辑 SVG / PNG · 1800 × 4360 · 详尽来源见网页与 sources.json',64,4337,19,palette.muted);
out.push('</svg>');
const svg=out.join('\n');
await mkdir(path.join(root,'assets'),{recursive:true});
await writeFile(path.join(root,'assets/ix-understanding.svg'),svg,'utf8');
await copyFile(path.join(root,'assets/ix-understanding.svg'),path.join(root,'web/assets/ix-understanding.svg'));
await writeFile(path.join(root,'web/assets/ix-map-views.json'),JSON.stringify(views,null,2)+'\n');
const pagePath=path.join(root,'web/index.html');
let html=await readFile(pagePath,'utf8');
if (html.includes('<!-- IX_MAP_BEGIN -->')) {
  const inline=svg.replace('<svg xmlns=', '<svg id="understanding-map" xmlns=').replace(/id="arrow"/g,'id="ix-map-arrow"').replace(/url\(#arrow\)/g,'url(#ix-map-arrow)');
  html=html.replace(/<!-- IX_MAP_BEGIN -->[\s\S]*?<!-- IX_MAP_END -->/, `<!-- IX_MAP_BEGIN -->\n${inline}\n<!-- IX_MAP_END -->`);
  await writeFile(pagePath,html,'utf8');
}
const require=createRequire(import.meta.url);
const sharpLocation=process.env.IX_DIAGRAM_SHARP || 'sharp';
const sharp=require(sharpLocation);
await sharp(Buffer.from(svg)).png().toFile(path.join(root,'assets/ix-understanding.png'));
await copyFile(path.join(root,'assets/ix-understanding.png'),path.join(root,'web/assets/ix-understanding.png'));
console.log(JSON.stringify({width:W,height:H,textElements:(svg.match(/<text /g)||[]).length,views:views.length,svgBytes:Buffer.byteLength(svg)}));
