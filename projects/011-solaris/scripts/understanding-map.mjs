import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A new, editable knowledge map. The five existing photographs are embedded
// without rewriting their bytes; the map itself is a conceptual explanation,
// not a new browser test or a reproduction of a Solaris model session.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 3840, HEIGHT = 3440;
const FONT = "'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', sans-serif";
const C = { ink:'#293b32', muted:'#5e7469', olive:'#42654e', line:'#cfdbd2', paper:'#f3f5ef', panel:'#fcfdf9', tint:'#e6eee2', warm:'#f4eddf', gold:'#8d7046', teal:'#426d74' };
const chunks = [], bounds = [], backgroundAssets = [];
const xml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const add = value => chunks.push(value);
const rect = (x,y,w,h,fill=C.panel,stroke=C.line,r=18) => add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`);
function text(x,y,value,{size=32,color=C.ink,weight=400,anchor='start'}={}) {
  if(size<30)throw new Error('All authored map text must be at least 30px');
  add(`<text x="${x}" y="${y}" font-family="${xml(FONT)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${xml(value)}</text>`);
}
function lines(x,y,values,{gap=43,...options}={}) {values.forEach((value,index)=>text(x,y+index*gap,value,options));}
const units = value => Array.from(value).reduce((sum,char)=>sum+(/\s/.test(char)?0.32:/[\u0000-\u007f]/.test(char)?0.57:1),0);
function paragraph(x,y,w,value,{size=32,gap=43,maxLines=99,color=C.muted,weight=400}={}) {
  const values=[];let line='';
  for(const char of String(value)){if(char==='\n'){values.push(line);line='';continue;}if(units(line+char)*size>w&&line){values.push(line);line=char;}else line+=char;}
  if(line)values.push(line);
  if(values.length>maxLines)throw new Error(`Text does not fit ${maxLines} lines: ${value}`);
  lines(x,y,values,{size,gap,color,weight});
  bounds.push({x,y,w,lines:values.length,size,bottom:y+(values.length-1)*gap+size*.24});
  return y+values.length*gap;
}
function arrow(x,y,w=26,color='#89a28b') {add(`<path d="M${x} ${y}h${w}m-9-8 9 8-9 8" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);}
async function background(name,x,y,w,h,{opacity=.15,align='xMidYMid slice'}={}) {
  const bytes=await fs.readFile(path.join(root,'assets',name));
  const id='bg-'+backgroundAssets.length;
  add(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath></defs>`);
  add(`<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${align}" opacity="${opacity}" clip-path="url(#${id})" href="data:image/jpeg;base64,${bytes.toString('base64')}"/>`);
  backgroundAssets.push({name,bytes:bytes.length,opacity});
}
function heading(x,y,number,title,subtitle='') {
  text(x,y,`${number} / ${title}`,{size:40,color:C.olive,weight:600});
  if(subtitle)text(3744,y,subtitle,{size:30,color:C.muted,anchor:'end'});
}

const catalog=JSON.parse(await fs.readFile(path.join(root,'web/capabilities.json'),'utf8'));
const sceneCatalog=JSON.parse(await fs.readFile(path.join(root,'web/capabilities/scene-catalog.json'),'utf8'));
const evidence=catalog.capabilities.reduce((map,item)=>(map[item.evidenceLevel]=(map[item.evidenceLevel]||0)+1,map),{});
const expected={ 'official-figure':25,'official-video-observation':1,'official-comparison':2,'official-description':5,'official-prospect':3 };
if(catalog.families.length!==12||catalog.capabilities.length!==36||sceneCatalog.scenes.length!==11||Object.entries(expected).some(([key,count])=>evidence[key]!==count))throw new Error('Source inventory changed; review map before publishing');
const evidenceLabel={'official-figure':'图','official-video-observation':'视频','official-comparison':'比较','official-description':'文字','official-prospect':'设想'};

add(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="understanding-title understanding-description">
<title id="understanding-title">ATELIER × Solaris：从源网页能力到我们的自主实现与按需研究</title>
<desc id="understanding-description">依据公开研究与ATELIER 0.18.2基础探索资料制作的新概念知识图，非实测截图。完整列出十二族三十六条研究能力、证据分类、两种实现原理、十一个产品场景、独立三桌圆底灯支撑、保存与离开保护、五类用途、用户意义、验收边界与按具体任务扩展的定位。背景含官方画面观察页截图以及本项目历史实际演示截图；并非本项目运行Solaris，未确认专用源码、API或权重公开。35/36是限定映射，不是完成率。</desc>
<defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8f8f2"/><stop offset="1" stop-color="#edf3ed"/></linearGradient></defs>`);
rect(0,0,WIDTH,HEIGHT,'url(#paper)','none',0);
text(96,80,'ATELIER × Solaris',{size:37,color:C.olive,weight:600});
text(96,168,'我们怎样理解鼠标交互，以及它对我们的价值',{size:70,weight:600});
text(3744,77,'基础探索基线 0.18.2 · 2026-10-07',{size:32,color:C.olive,anchor:'end'});
text(96,219,'公开研究启发 → 自主实现可控原型 → 留存基础 → 有具体产品想法时，再细化研究',{size:36,color:C.muted});
text(3744,217,'概念汇总图 · 不是实测截图',{size:31,color:C.gold,anchor:'end'});

// Two routes: input semantics are central in both; their execution is different.
const colX=[96,1940],colW=1804;
rect(colX[0],256,colW,541,C.panel);await background('solaris-gallery.jpg',colX[0],256,colW,541,{opacity:.12,align:'xMidYMax slice'});
rect(colX[1],256,colW,541,C.panel);await background('atelier-studio.jpg',colX[1],256,colW,541,{opacity:.15});
heading(128,307,'01','源网页：Runway Solaris 的生成式界面');
paragraph(128,357,1708,'鼠标是连续控制输入；同一个拖动，在不同对象、场景与意图下可以触发不同效果。画面来自模型对上下文的持续生成。',{size:34,gap:44,maxLines:2,color:C.ink});
const sourceNodes=['鼠标操作历史','当前画面 / 语义','LLM 意图与行为提示','逐帧视觉世界模型'];
sourceNodes.forEach((label,index)=>{const x=128+index*435;rect(x,446,403,70,'#edf2e8','#bccdbd',11);text(x+201.5,490,label,{size:32,anchor:'middle',color:C.olive,weight:500});if(index<3)arrow(x+411,481,15);});
lines(128,565,['生成下一帧 → 用户继续操作 → 新输入继续条件化；自回归地延续环境。','公开方法：少步蒸馏提高生成效率；用自身生成的输出训练，适应滚动生成。'],{size:32,gap:44,color:C.ink});
paragraph(128,669,1720,'这不是已确认的开源库：专用源码、可调用 API、权重开放均未确认。我们未运行或实测 Solaris，不从视觉效果推断精确几何、真实物理或内部对象结构。',{size:31,gap:40,maxLines:2,color:C.gold});
text(128,770,'背景：官方画面观察页截图（回放与论文入口），不是本项目实测源模型。',{size:30,color:C.muted});

heading(1972,307,'02','我们的实现：明确对象、规则与可恢复状态');
paragraph(1972,357,1708,'把可观察的交互类型，转为能自行维护的场景原型。登记对象有明确身份，操作有规则，失败可解释，成果能够保存、比较与继续编辑。',{size:34,gap:44,maxLines:2,color:C.ink});
const ownNodes=['指针拾取 / 工具','校验几何与约束','状态事务 / 回滚','本地绘制 / 重建'];
ownNodes.forEach((label,index)=>{const x=1972+index*435;rect(x,446,403,70,'#edf2e8','#bccdbd',11);text(x+201.5,490,label,{size:32,anchor:'middle',color:C.olive,weight:500});if(index<3)arrow(x+411,481,15);});
lines(1972,565,['一次完整手势是一条编辑：预览 → 合法提交；越界或取消 → 整次回到起点。','主要基础：本地 Three.js / 图像画布 / 有限算法；料理使用近似刚体。'],{size:32,gap:44,color:C.ink});
paragraph(1972,669,1710,'不借用 Solaris 后台；真人上装参考另用本机 FASHN 预训练模型，属于外观研究且暂缓扩展，不代表全部算法自研或真实合身。',{size:31,gap:40,maxLines:2,color:C.gold});
text(1972,770,'背景：我们的历史客厅实际演示；本地图形与规则不等于任意世界生成。',{size:30,color:C.muted});

// Exact source family and capability coverage, with evidence attached to each line.
heading(96,862,'03','公开能力全清单：12 个族 / 36 条研究线索','证据强度分开读；设想不能当成可用功能');
text(96,912,'图示 25 · 官方视频观察 1 · 对比任务 2 · 文字描述 5 · 官方设想 3  ｜  C19 购物关联尚未接入',{size:32,color:C.muted});
const gridW=882,gridGap=40,familyH=234;
catalog.families.forEach((family,index)=>{
  const x=96+(index%4)*(gridW+gridGap),y=945+Math.floor(index/4)*(familyH+18);
  rect(x,y,gridW,familyH,C.panel,C.line,13);
  const items=catalog.capabilities.filter(item=>item.family===family.label);
  text(x+22,y+42,`${String(index+1).padStart(2,'0')}  ${family.label}`,{size:34,color:C.olive,weight:600});
  items.forEach((item,i)=>{
    text(x+22,y+78+i*33,`${item.id}  ${item.name}`,{size:30,color:item.id==='C19'?C.gold:C.ink});
    text(x+gridW-22,y+78+i*33,`${evidenceLabel[item.evidenceLevel]}${item.id==='C19'?' · 未接':''}`,{size:30,color:item.id==='C19'?C.gold:C.muted,anchor:'end'});
    if(units(`${item.id}  ${item.name}`)*30>gridW-190)throw new Error(`Capability label overlaps evidence: ${item.id}`);
  });
});

// Eleven bounded scenes and a separate research workbench: no extra scene count.
heading(96,1749,'04','我们已经实现什么：11 个场景 + 独立支撑研究','35/36 是受控映射，不是“产品完成 97%”');
const scenes=[
  ['living','客厅设计','C01–04 / 06–11 / 15–16 / 34 / 36','家具移动旋转缩放、材质墙色、灯光时段','复制移除、测量、有限指令、教程与 A/B','固定房间 / 登记资产；非工程日照'],
  ['car','汽车展厅','C24–26','车漆与灯组、车体环绕、原铰链引擎盖','独立部件状态、视角、图片与配置保存','授权固定车型；非维修或任意车型生成'],
  ['imaging','影像工作台','C22–23','原图缩放平移、两点测量与标注','用户标尺校准、编辑恢复与稳定坐标','两张 JPEG；无 DICOM / 诊断能力'],
  ['landmark','建筑白模','C12–14','同一几何的时段光影、多方向观察','四张知识卡、镜头与方案保存','外部简化模型；不补全未知建筑'],
  ['kitchen','料理备料','C20 / 29','四类完整食材拖入碗、沉降与稳定实例','点击浮起检视、归位 / 恢复','最多 16 件；无切丁、烹饪或营养判断'],
  ['creative','材质与笔触创作','C27–28','矩形取样变纹理印章 / 调色方向笔刷','局部绘画、两图层、逐笔撤销与恢复','登记来源 / 固定画纸；非通用风格模型'],
  ['collection','精选陈列','C05 / 33 / 35','六槽交换锁定、显式偏好、九目标往返','整套已保存成果导出、勾选恢复','固定标签与去向；不续播未完成过程'],
  ['skate','滑板练习','C32','上拖板面触发骑手与板同步起落','手势取消、动作记录、重播与保存','固定平地与有限姿态；非训练仿真'],
  ['materials','热响应教学','C21','拖火源、铜铝温升 / 冰熔化、同热量对照','暂停观察、Q / 温度账本、重看与恢复','固定教学假设；温度是计算值非实测'],
  ['underwater','水下联动','C30–31','拖鱼改变位置 / 朝向、潜水员安全跟随','绕礁 / 不可达停留、双主体事务恢复','固定水层 / 三礁石；非海洋物理'],
  ['fitting','试衣与真人参考','C17–18','固定人体两款上衣 / 两双鞋的拖放搭配','真人另为本机照片外观参考，暂缓扩展','不判体型尺码合身；购物 C19 未接'],
  ['support','独立新桌与灯具','深化对象关系 · 不新增研究编号','三张真实桌 + 圆底工业灯共用网格规则','候选面选择、合法摆放、回滚与完整恢复','独立存档；未并入客厅 / 九任务 / 整套备份'],
];
for(let index=0;index<scenes.length;index++){
  const [id,name,mapping,a,b,boundary]=scenes[index];
  if(id!=='support'&&!sceneCatalog.scenes.some(item=>item.id===id))throw new Error(`Scene is not registered: ${id}`);
  const x=96+(index%4)*(gridW+gridGap),y=1782+Math.floor(index/4)*197;
  rect(x,y,gridW,181,index===11?'#edf2e7':C.panel,C.line,13);
  if(id==='car')await background('atelier-car-showroom.jpg',x,y,gridW,181,{opacity:.14});
  if(id==='underwater')await background('atelier-underwater-follow-during.jpg',x,y,gridW,181,{opacity:.14});
  text(x+22,y+40,`${id==='support'?'研究':String(index+1).padStart(2,'0')}  ${name}`,{size:34,color:C.olive,weight:600});
  text(x+gridW-22,y+39,mapping,{size:30,color:C.muted,anchor:'end'});
  lines(x+22,y+79,[a,b],{size:30,gap:34});
  text(x+22,y+153,boundary,{size:30,color:C.muted});
  for(const value of[a,b,boundary])if(units(value)*30>gridW-44)throw new Error(`Scene summary does not fit: ${id}`);
}

// Deeper support result and the distinction between historical evidence and gaps.
const bottomY=2410,bottomH=383;
rect(96,bottomY,colW,bottomH,C.panel);await background('atelier-support-workbench.jpg',96,bottomY,colW,bottomH,{opacity:.15});
heading(128,bottomY+51,'05','独立支撑：探索可复用规则，保留失败原因');
lines(128,bottomY+102,[
  '原三角面 + 节点变换 → 水平连通候选 → 用户选面 → 完整灯底覆盖检验。',
  '实际三角并集 + 2 mm 保守边距；不用中心、四角或桌包围框替代支撑。',
  '拖灯连续扫掠；拖桌 / 旋转 / 宽深变更保持关系，非法释放整次回滚。',
  '圆桌、乡村桌、复古茶几复用规则；原夹装灯语义失败如实留档。',
  '0.18.2：编辑 / 撤销 / 重做的保存状态准确；失败不跳页，先备份可留页。',
],{size:31,gap:43});
text(128,bottomY+336,'背景：历史真实新桌工作台；75 cm / 52 cm 为设计约定，不判断承重与重心。',{size:30,color:C.muted});

rect(1940,bottomY,colW,bottomH,C.tint);
heading(1972,bottomY+51,'06','基础与证据：能复用，但不外推为商用成熟');
lines(1972,bottomY+102,[
  '共用积累：拾取投影、约束、手势事务、状态校验、稳定保存与重建。',
  '0.18.2 历史已验：产品 Node 386/386；仓库检查 16/16。',
  '九个登记目标 / 十份稳定存档；不含试衣、真人或独立新桌工作台。',
  '真实截图、完整 JSON 对照、源资产分析、纯夹具 / VM 模拟分别留证。',
  '待按需专项：指定设备、触摸 / 原生关闭、真实故障与竞争、离线与长期性能。',
],{size:31,gap:43});
text(1972,bottomY+336,'多键恢复 / 原文比较不是跨窗口原子锁；登记静态资产通过不证明任意输入泛化。',{size:30,color:C.muted});

// Why this foundation matters: five practical purposes, not product promises.
heading(96,2858,'07','可能用在哪里：五类用途，按真实用户任务选择');
const uses=[
  ['空间方案与选品','家具、灯光、关系与 A/B','用于可恢复的设计沟通'],
  ['产品展示与观察','汽车部件、视角与配置','用于交互展品和说明'],
  ['交互教学与探索','图像测量、热响应、地标','用于明确假设的教学'],
  ['素材创作与策展','取样笔刷、陈列与偏好','用于可编辑内容生产'],
  ['交互原型与接入研究','语义、动作、约束、状态','用于新任务的快速验证'],
];
uses.forEach(([title,a,b],index)=>{
  const x=96+index*737;
  rect(x,2892,700,143,C.panel,C.line,12);
  text(x+22,2933,title,{size:34,weight:600,color:C.olive});
  lines(x+22,2975,[a,b],{size:31,gap:37,color:C.muted});
});

rect(96,3074,3648,210,'#e1ebdf','#b9ccb8',15);
text(128,3126,'对你的意义：把看到的“效果”沉淀为自主维护的交互、状态、约束、素材与原型基础。',{size:39,color:C.olive,weight:600});
lines(128,3180,[
  '基础方向探索已经够用：保留代码、十一场景、支撑研究与分层验证；不为补编号继续扩展，也不把测试数字当成商业成熟度。',
  '后续有具体产品想法 → 明确谁要完成什么任务 → 选择复用能力 → 补该任务需要的研究 / 内容 / 业务 → 用真实成果与恢复流程验收。',
  '更多素材与画质属于体验改善；任意新资产、复杂关系、真实数据与新业务，需各自定义输入、边界和失败样本再研究。',
],{size:32,gap:42,color:C.ink});

text(96,3339,'背景来源：solaris-gallery 为官方画面观察页；客厅 / 展厅 / 水下 / 新桌为我们的历史实际演示。背景不代表本轮全量实测。',{size:30,color:C.muted});
text(96,3383,'公开依据：Runway Introducing Solaris · arxiv.org/html/2609.00776v1  ｜  本地依据：能力清单、场景说明、0.18.2 记录  ｜  C19 与试衣扩展暂缓。',{size:30,color:C.muted});
add('<a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept">');
text(96,3427,'汽车素材：Eric Chadwick · ©2024 Darmstadt Graphics Group GmbH · CC BY 4.0；修改：车漆 / 光照 / 姿态。其余素材与完整许可见网页声明。',{size:30,color:C.muted});
add('</a>');
add('</svg>\n');

if(bounds.some(item=>item.x<0||item.x+item.w>WIDTH||item.bottom>HEIGHT))throw new Error('Paragraph outside figure bounds');
const svg=chunks.join('\n');
const outputs=['assets/atelier-understanding-map.svg','web/assets/atelier-understanding-map.svg'];
for(const relative of outputs){
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))throw new Error('Map output escaped the project directory');
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,svg,'utf8');
}
// The site builder publishes web/ only; copy the existing real scene evidence
// used by overview.html into that directory without altering the photographs.
const galleryAssets=['atelier-studio.jpg','atelier-car-showroom.jpg','atelier-imaging-workspace.jpg','atelier-landmark-workspace.jpg','atelier-kitchen-workspace.jpg','atelier-creative-workspace.jpg','atelier-collection-workspace.jpg','atelier-skate-air.jpg','atelier-materials-comparison-heating.jpg','atelier-underwater-follow-during.jpg','atelier-footwear-workspace.jpg','atelier-support-workbench.jpg'];
for(const name of galleryAssets) await fs.copyFile(path.join(root,'assets',name),path.join(root,'web/assets',name));
console.log(JSON.stringify({width:WIDTH,height:HEIGHT,minimumAuthoredFontSize:30,bytes:Buffer.byteLength(svg),families:catalog.families.length,sourceCapabilities:catalog.capabilities.length,scenes:sceneCatalog.scenes.length,independentResearchWorkbenches:1,evidence,backgroundAssets,galleryAssets,outputs},null,2));
