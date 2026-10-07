import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original photographs are embedded once and referenced through SVG windows.
// No bitmap rewriting or generated substitution. Source windows follow a
// visual frame audit; the complete original remains below the selected frames.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WIDTH=4800,M=120,GAP=40,COLUMN=2260,CARD=1110,ROW=860,EFFECT_Y=550,EFFECT_H=6990;
const PRINCIPLE_Y=7630,CAPABILITY_Y=8105,SUPPORT_Y=9010,USE_Y=9485,VALUE_Y=9745,HEIGHT=10105;
const FONT="'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', sans-serif";
const C={ink:'#293b32',muted:'#5e7469',olive:'#42654e',line:'#cfdbd2',paper:'#f3f5ef',panel:'#fcfdf9',tint:'#e6eee2',gold:'#8d7046',source:'#3d6076'};
const chunks=[],defs=[],bounds=[],photos=[];let windowIndex=0;
const xml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const add=value=>chunks.push(value);
const rect=(x,y,w,h,fill=C.panel,stroke=C.line,r=18)=>add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`);
function text(x,y,value,{size=36,color=C.ink,weight=400,anchor='start'}={}){if(size<30)throw new Error('Map text must be at least 30px');add(`<text x="${x}" y="${y}" font-family="${xml(FONT)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${xml(value)}</text>`);}
function lines(x,y,values,{gap=45,...options}={}){values.forEach((value,i)=>text(x,y+i*gap,value,options));}
const units=value=>Array.from(value).reduce((sum,char)=>sum+(/\s/.test(char)?.32:/[\u0000-\u007f]/.test(char)?.57:1),0);
function paragraph(x,y,w,value,{size=34,gap=43,maxLines=99,color=C.muted,weight=400}={}){const values=[];let line='';for(const char of String(value)){if(char==='\n'){values.push(line);line='';continue;}if(units(line+char)*size>w&&line){values.push(line);line=char;}else line+=char;}if(line)values.push(line);if(values.length>maxLines)throw new Error(`Text does not fit: ${value}`);lines(x,y,values,{size,gap,color,weight});bounds.push({x,y,w,bottom:y+(values.length-1)*gap+size*.24});return y+values.length*gap;}
function link(url,fn){add(`<a href="${xml(url)}">`);fn();add('</a>');}
function heading(x,y,n,title){text(x,y,`${n} / ${title}`,{size:48,color:C.olive,weight:600});}
function imageSize(b){
  if(b.subarray(1,4).toString()==='PNG')return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if(b[0]===0xff&&b[1]===0xd8){let i=2;while(i<b.length){if(b[i]!==0xff){i++;continue;}const marker=b[i+1];i+=2;if([0xd8,0xd9].includes(marker))continue;const len=b.readUInt16BE(i);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return{width:b.readUInt16BE(i+5),height:b.readUInt16BE(i+3)};i+=len;}}
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'){const type=b.subarray(12,16).toString();if(type==='VP8X')return{width:b.readUIntLE(24,3)+1,height:b.readUIntLE(27,3)+1};if(type==='VP8 ')return{width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};if(type==='VP8L'){const bits=b.readUInt32LE(21);return{width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}}
  throw new Error('Unsupported original photo format');
}
async function registerPhoto(relative,label){const bytes=await fs.readFile(path.join(root,relative)),size=imageSize(bytes),id=`photo-${photos.length}`,mime=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes.subarray(1,4).toString()==='PNG'?'image/png':'image/webp';defs.push(`<image id="${id}" width="${size.width}" height="${size.height}" href="data:${mime};base64,${bytes.toString('base64')}"/>`);const photo={id,file:relative,label,mime,bytes:bytes.length,...size};photos.push(photo);return photo;}
function viewport(photo,x,y,w,h,crop=null,{back='#eef1ed'}={}){const selected=crop||[0,0,photo.width,photo.height];if(selected.length!==4||selected[0]<0||selected[1]<0||selected[0]+selected[2]>photo.width||selected[1]+selected[3]>photo.height)throw new Error(`Crop outside original: ${photo.file}`);const clip=`window-${windowIndex++}`;rect(x,y,w,h,back,'#d1d9d2',6);add(`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${selected.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect x="${selected[0]}" y="${selected[1]}" width="${selected[2]}" height="${selected[3]}"/></clipPath></defs><use href="#${photo.id}" clip-path="url(#${clip})"/></svg>`);}
const catalog=JSON.parse(await fs.readFile(path.join(root,'web/capabilities.json'),'utf8'));
const sceneCatalog=JSON.parse(await fs.readFile(path.join(root,'web/capabilities/scene-catalog.json'),'utf8'));
const sourceCatalog=JSON.parse(await fs.readFile(path.join(root,'web/scenes.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'web/assets/solaris-effects/manifest.json'),'utf8'));
const evidence=catalog.capabilities.reduce((map,item)=>(map[item.evidenceLevel]=(map[item.evidenceLevel]||0)+1,map),{}),expected={'official-figure':25,'official-video-observation':1,'official-comparison':2,'official-description':5,'official-prospect':3};
if(catalog.families.length!==12||catalog.capabilities.length!==36||sceneCatalog.scenes.length!==11||Object.entries(expected).some(([key,count])=>evidence[key]!==count))throw new Error('Inventory changed; review diagram');
if(manifest.items.length!==14||new Set(manifest.items.map(item=>item.sceneId)).size!==13||manifest.modelExecuted!==false)throw new Error('Expected 14 source photos across 13 scenes, model not executed');
const sourcePhotos=new Map();for(const item of manifest.items)sourcePhotos.set(item.file,await registerPhoto(`web/assets/solaris-effects/${item.file}`,item.title));
const sourceWindows={
  'interior.jpg':{before:[0,0,854,480],after:[2586,488,854,480],beforeLabel:'P1 · 较早状态',afterLabel:'P8 · 蓝沙发 / 放大对象'},
  'interior-extended.jpg':{before:[0,0,854,480],after:[0,488,854,480],beforeLabel:'P1 · 较早状态',afterLabel:'P5 · 墙色 / 夜间光照'},
  'fashion.jpg':{before:[858,0,850,480],after:[2574,488,850,480],beforeLabel:'P2 · 白衣 / 棕鞋',afterLabel:'P8 · 蓝衬衫 / 红鞋'},
  'xray.jpg':{before:[0,0,850,480],after:[1716,0,850,480],beforeLabel:'P1 · 初始 X 光',afterLabel:'P3 · 局部放大'},
  'xray-2.jpg':{before:[0,0,850,480],after:[2574,0,850,480],beforeLabel:'P1 · 初始 X 光',afterLabel:'P4 · 测量线'},
  'salad.jpg':{before:[0,0,850,480],after:[1716,488,850,480],beforeLabel:'P1 · 起始碗',afterLabel:'P7 · 食材组合'},
  'combustion.jpg':{before:[858,0,850,480],after:[2574,0,850,480],beforeLabel:'P2 · 火焰工具',afterLabel:'P4 · 可见火花'},
  'landmark.jpg':{before:[0,0,850,480],after:[2574,488,850,480],beforeLabel:'P1 · 白天正视',afterLabel:'P8 · 夜间航拍'},
  'car.jpg':{before:[0,0,850,480],after:[1716,488,850,480],beforeLabel:'P1 · 较早状态',afterLabel:'P7 · 车灯 / 引擎盖'},
  'floating.jpg':{before:[0,0,872,480],after:[1760,0,872,480],beforeLabel:'P1 · 较早状态',afterLabel:'P3 · 对象升起'},
  'camera.jpg':{before:[0,0,872,480],after:[1760,0,872,480],beforeLabel:'P1 · 阳台视点',afterLabel:'P3 · 相机移动后'},
  'mobile-fish.jpg':{before:[0,0,270,480],after:[556,0,270,480],beforeLabel:'P1 · 起始位置',afterLabel:'P3 · 鱼 / 潜水员移动'},
  'mobile-skateboard.jpg':{before:[0,0,270,480],after:[278,0,270,480],beforeLabel:'P1 · 起始姿态',afterLabel:'P2 · 腾空'},
};
const ownScenes=[
  ['living','客厅设计','atelier-chair-scaling.jpg','index.html','C01–04 / 06–11 / 15–16 / 34 / 36','家具移动、旋转、缩放；墙色材质、时段光照','测量 / 复制移除 / 有限指令 / 教程 / A/B','固定房间与登记资产；非工程日照'],
  ['car','汽车展厅','atelier-car-mechanical-bay.jpg','showroom.html','C24–26','车漆灯组、环绕视角、原铰链引擎盖','独立部件状态、导图与可恢复配置','授权固定车型；非任意车型或维修系统'],
  ['imaging','影像工作台','atelier-imaging-workspace.jpg','imaging.html','C22–23','原图缩放平移、两点测量与标注','校准 / 原图坐标 / 保存与稳定恢复','两张 JPEG；无 DICOM 与诊断能力'],
  ['landmark','建筑白模','atelier-landmark-workspace.jpg','landmark.html','C12–14','同一几何的时段光影与多方向观察','四张知识卡、镜头与方案保存','外部简化模型；不补全未知建筑'],
  ['kitchen','料理备料','atelier-kitchen-inspection.jpg','kitchen.html','C20 / 29','完整食材拖进碗、沉降和组合','点击浮起检视、归位、稳定实例恢复','四类 / 最多 16 件；无切丁与烹饪'],
  ['creative','素材与笔触创作','atelier-creative-mouse-proof.jpg','creative.html','C27–28','矩形取样变成纹理印章与参考色笔刷','两图层 / 逐笔撤销 / 原图与状态恢复','登记来源与固定画纸；非通用风格模型'],
  ['collection','精选陈列','atelier-collection-preference.jpg','collection.html','C05 / 33 / 35','六槽交换、锁定与显式选品偏好','九目标往返 / 整套稳定存档导出恢复','固定标签去向；不续播未完成的过程'],
  ['skate','滑板练习','atelier-skate-air.jpg','skate.html','C32','向上拖动板面，让骑手与板同步起落','取消 / 重播 / 动作记录与保存','固定平地与有限姿态；非训练仿真'],
  ['materials','热响应教学','atelier-materials-comparison-heating.jpg','materials.html','C21','拖火源；铜铝温升、冰熔化与同热量对照','暂停观察 / Q 与温度账本 / 重看恢复','固定教学假设；温度是计算值'],
  ['underwater','水下联动','atelier-underwater-follow-during.jpg','underwater.html','C30–31','拖鱼改变位置朝向；潜水员绕礁跟随','不可达停留 / 取消整次动作 / 双主体恢复','固定水层与三礁；非海洋物理'],
  ['fitting','三维搭配','atelier-footwear-workspace.jpg','fitting.html','C17–18','同一固定人体的上衣、双鞋拖放搭配','两款上衣 / 两双鞋 / 两姿态 / 保存恢复','不判断体型、尺码与合身；扩展暂缓'],
  ['support','独立新桌与灯具','atelier-support-workbench.jpg','support.html','额外研究入口 · 不增加场景数','三张真实桌 + 圆底灯共用网格支撑规则','候选面选择 / 合法摆放 / 事务回滚恢复','独立存档；未并入客厅与整套备份'],
  ['real-person','真人照片参考','atelier-real-person-workspace.png','tryon.html','额外研究入口 · 不增加场景数','人物原图与商品照片生成上装外观参考','本机 FASHN / 原图对照 / 人工评分留档','非商业研究样本；无真实合身证明，暂缓'],
];
const ownPhotos=new Map();for(const [,title,file]of ownScenes)ownPhotos.set(file,await registerPhoto(`assets/${file}`,title));
const sourceView=[80,285,2340,7320],ourView=[2380,285,2340,7320];
const header=(w,h,v)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${v.join(' ')}" role="img" aria-labelledby="map-title map-desc">`;
add(`<?xml version="1.0" encoding="UTF-8"?>\n${header(WIDTH,HEIGHT,[0,0,WIDTH,HEIGHT])}
<title id="map-title">Solaris 源效果与 ATELIER 扩展效果完整对照图</title>
<desc id="map-desc">左侧为十三个公开场景的十四份官方原过程图或播放器封面、两类纯文字举例；右侧为我们的十一个场景和两个额外研究入口的历史实景。图片清晰不透明，出处与边界分别标注。完整保留十二族三十六项能力、两条原理、用途与意义；0.18.2 基础探索收束。源模型未接入，35/36 是有限映射，不是产品完成率。</desc>
<view id="source-effects" viewBox="${sourceView.join(' ')}"/><view id="our-effects" viewBox="${ourView.join(' ')}"/><view id="principles" viewBox="80 7565 4640 2540"/>
<defs>${defs.join('\n')}</defs>`);
rect(0,0,WIDTH,HEIGHT,C.paper,'none',0);
text(M,82,'ATELIER × Solaris',{size:42,color:C.olive,weight:600});text(M,180,'从源效果，到我们的自主交互基础',{size:80,weight:600});
text(WIDTH-M,82,'基础探索基线 0.18.2 · 2026-10-07',{size:36,color:C.olive,anchor:'end'});
text(M,242,'先看真实画面和它说明的能力，再看实现原理、使用场景与对你的价值。',{size:41,color:C.muted});text(WIDTH-M,239,'照片保持原字节 · 可放大阅读',{size:34,color:C.gold,anchor:'end'});
rect(M,295,COLUMN,EFFECT_H+220,'#edf2f4','#bcced7',22);rect(2420,295,COLUMN,EFFECT_H+220,'#edf2e7','#c8d5c2',22);
text(M+32,370,'01 / 源公开效果 · Runway Solaris',{size:56,color:C.source,weight:600});
paragraph(M+32,425,COLUMN-64,'论文原过程图 / 官网播放器封面：13 个有画面场景、14 份原图；另列 2 类文字说明。不把愿景当作实证。',{size:35,gap:43,maxLines:2,color:C.source});text(M+32,515,'作者 / Runway 原图研究说明引用；本轮未运行源模型或重播视频。',{size:34,color:C.gold});
text(2452,370,'02 / 我们的扩展效果 · ATELIER 实景',{size:56,color:C.olive,weight:600});
paragraph(2452,425,COLUMN-64,'11 个场景全部展示；独立桌灯与真人照片参考另列，不增加场景数量。均来自本项目已有实际演示截图。',{size:35,gap:43,maxLines:2,color:C.olive});text(2452,515,'受控对象、明确规则与可恢复成果；没有复现任意视觉生成。',{size:34,color:C.gold});
const sourceIds=['interior','interior-extended','fashion','xray','salad','combustion','landmark','car','streetlight','floating','camera','mobile-fish','mobile-skateboard','tools','adaptive'];
const shortTitles=['室内移动、缩放与材质','完整室内编辑','真人服饰与购物联动','同一拖动，两种语义','食材进入碗中','火焰作用于材料','地标时间与多视角','车灯、角度与引擎盖','太阳与街景光照','点击使对象悬浮','相机移动与场景延续','拖鱼，潜水员跟随','拖滑板，骑手跳跃','对象变成工具（文字）','界面与教程适配（设想）'];
const sourceCaptions=[['移动灯具；缩放挂画、植物；更换沙发布料','观察对象、遮挡与环境能否一起变化'],['墙色、时间、灯光、视点与画作连续编辑','同一房间里的连续设计工作流'],['商品拖到真人身上；外观与购物车关联','视觉替换演示；不证明真实尺码合身'],['同一张 X 光，同一拖动可放大或用于测量','双图分别展示；数值不证明测量准确性'],['多种食材拖入碗中，连续形成组合','保留已有食材与场景关系'],['火焰作为工具，触碰材料后触发响应','视觉响应不等于物理或化学验证'],['改变时间、地标信息与观察方向','新视点是持续生成的画面'],['车灯开关、车体角度、引擎盖及内部','公开论文图；未核实独立录像'],['鼠标标记、太阳位置与街景光照一起变化','封面单帧；按下 / 释放语义未确认'],['点击后缓慢升起，补全遮挡后的背景','公开对比任务；不是物理检验'],['灯塔阳台向海岸移动、向下观察','有官方运动指令；手势映射未明确'],['拖鱼改变位置，潜水员随之移动','一个输入带动多个主体的关联'],['向上拖滑板，触发骑手与板同步跳跃','方向被解释为动作意图'],['点击猫借取纹理；点击画作借用风格','只属文字举例，不展示虚构结果'],['店铺适配、推荐、教程恢复属方向设想','局部编辑或转场有官方方法描述 C35']];
for(let i=0;i<sourceIds.length;i++){
  const scene=sourceCatalog.scenes.find(item=>item.id===sourceIds[i]),x=M+(i%2)*(CARD+GAP),y=EFFECT_Y+Math.floor(i/2)*ROW,item=manifest.items.find(item=>item.sceneId===scene.id);
  rect(x,y,CARD,ROW-28,C.panel,'#c4d3db',15);link(scene.sourceUrl,()=>text(x+24,y+51,`${String(i+1).padStart(2,'0')}  ${shortTitles[i]}`,{size:39,color:C.source,weight:600}));text(x+24,y+94,item?item.kind:'无对应媒体实证 · 不编造效果图',{size:30,color:item?C.muted:C.gold});
  if(!item){rect(x+24,y+125,CARD-48,515,'#eef2f4','#cfdae0',10);text(x+54,y+200,'官方文字描述 / 方向性设想',{size:39,color:C.source,weight:600});paragraph(x+54,y+266,CARD-108,scene.description,{size:38,gap:54,maxLines:5,color:C.ink});paragraph(x+54,y+564,CARD-108,'没有找到对应公开录像或过程图；不能把邻近场景画面当成该功能的证明。',{size:33,gap:43,maxLines:2,color:C.gold});}
  else if(scene.id==='xray'){
    for(const [j,file]of['xray.jpg','xray-2.jpg'].entries()){const photo=sourcePhotos.get(file),p=sourceWindows[file],py=y+138+j*263;text(x+24,py,file==='xray.jpg'?'语义 A · 局部放大 P1 → P3':'语义 B · 测量 P1 → P4',{size:30,color:C.muted});viewport(photo,x+24,py+15,519,210,p.before);viewport(photo,x+567,py+15,519,210,p.after);}
    text(x+24,y+667,'两份完整原图条带（不把示意数值当作实测）',{size:30,color:C.muted});viewport(sourcePhotos.get('xray.jpg'),x+24,y+682,519,30);viewport(sourcePhotos.get('xray-2.jpg'),x+567,y+682,519,30);
  }else{
    const photo=sourcePhotos.get(item.file),p=sourceWindows[item.file];
    if(p){const pw=519;text(x+24,y+132,p.beforeLabel,{size:30,color:C.muted});text(x+567,y+132,p.afterLabel,{size:30,color:C.muted});viewport(photo,x+24,y+147,pw,405,p.before);viewport(photo,x+567,y+147,pw,405,p.after);text(x+24,y+587,'完整原过程图（未改写；上方选择原帧窗口）',{size:30,color:C.muted});viewport(photo,x+24,y+603,CARD-48,94,null,{back:'#f4f4ef'});}
    else{text(x+24,y+132,'官方播放器封面：单帧，不表示前后变化',{size:30,color:C.muted});viewport(photo,x+24,y+147,CARD-48,515,null,{back:'#f4f4ef'});}
  }
  lines(x+24,y+743,sourceCaptions[i],{size:32,gap:39,color:C.ink});text(x+24,y+823,item?'© 作者 / Runway · 点击标题查看完整出处':'Runway 官网文字 · 点击标题查看出处',{size:30,color:C.muted});
}
for(let i=0;i<ownScenes.length;i++){
  const [id,title,file,url,mapping,a,b,boundary]=ownScenes[i];if(i<11&&!sceneCatalog.scenes.some(item=>item.id===id))throw new Error(`Unregistered scene: ${id}`);
  const x=2420+(i%2)*(CARD+GAP),y=EFFECT_Y+Math.floor(i/2)*ROW;rect(x,y,CARD,ROW-28,C.panel,'#c9d6c4',15);link(`../${url}`,()=>text(x+24,y+51,`${i<11?String(i+1).padStart(2,'0'):'额外'}  ${title}`,{size:39,color:C.olive,weight:600}));text(x+24,y+94,mapping,{size:30,color:C.muted});const photo=ownPhotos.get(file);
  if(id==='real-person'){text(x+24,y+130,'原图 ↔ 本机生成图（实际截图对照区）',{size:30,color:C.muted});viewport(photo,x+24,y+147,775,515,[314,253,653,809]);viewport(photo,x+819,y+147,267,515);}
  else viewport(photo,x+24,y+126,CARD-48,580);
  lines(x+24,y+743,[a,b],{size:32,gap:39,color:C.ink});text(x+24,y+823,boundary,{size:30,color:C.gold});for(const value of[a,b,boundary])if(units(value)*32>CARD-48)throw new Error(`Caption too long: ${id}`);
}
const sy=EFFECT_Y+7*ROW;rect(2420,sy,COLUMN,ROW-28,'#e1ebdf','#bacdb7',16);text(2452,sy+62,'从效果里沉淀什么',{size:47,color:C.olive,weight:600});lines(2452,sy+133,['对象身份、选择工具、投影拾取、连续手势、明确状态、约束与恢复。','同一输入在不同场景中，操作意义由对象、当前工具与任务决定。','可重复编辑与保存的成果，帮助检验真实用户任务能否完成。'],{size:38,gap:60,color:C.ink});text(2452,sy+367,'35/36 是受控映射，不是“产品完成 97%”。',{size:47,color:C.gold,weight:600});paragraph(2452,sy+432,COLUMN-64,'C19 购物关联尚未接入；真人参考与三维试衣扩展暂缓。不会为了补齐编号继续扩展，也不会把程序渲染当成原模型的任意视觉生成。',{size:37,gap:53,maxLines:3,color:C.ink});text(2452,sy+667,'照片性质：已有真实演示留档，不表示本轮全量重新实测。',{size:34,color:C.muted});text(2452,sy+728,'图片是效果入口；功能说明、边界和验证记录仍是验收依据。',{size:34,color:C.muted});

heading(M,PRINCIPLE_Y,'03','原理是什么：同样重视鼠标与语义，两条不同执行路径');rect(M,PRINCIPLE_Y+40,COLUMN,365,C.panel,C.line,16);rect(2420,PRINCIPLE_Y+40,COLUMN,365,C.panel,C.line,16);text(M+32,PRINCIPLE_Y+95,'源研究：视觉世界模型持续生成',{size:42,color:C.source,weight:600});lines(M+32,PRINCIPLE_Y+157,['鼠标操作历史 + 当前画面与上下文 → LLM 意图 / 行为提示','→ 条件化视觉世界模型生成下一帧 → 新操作继续改变未来画面。','公开方法：自回归生成、少步蒸馏、使用自身输出训练滚动生成。','不由视觉效果推断内部对象结构、精确几何或真实物理。'],{size:35,gap:49,color:C.ink});text(M+32,PRINCIPLE_Y+376,'未确认专用源码、API 或权重公开；不是已接入的“源库”。',{size:33,color:C.gold});text(2452,PRINCIPLE_Y+95,'我们的实现：明确对象、规则与可恢复状态',{size:42,color:C.olive,weight:600});lines(2452,PRINCIPLE_Y+157,['指针拾取 / 当前工具 → 校验几何与约束 → 状态事务与回滚','→ 本地图形或画布重绘 → 稳定成果保存 / 校验 / 重建。','主要用 Three.js、图像画布与有限算法；料理用近似刚体。','一次手势是一条编辑；非法或取消，整次回到手势起点。'],{size:35,gap:49,color:C.ink});text(2452,PRINCIPLE_Y+376,'真人另用本机 FASHN 预训练模型；非全部算法自研或真实合身。',{size:33,color:C.gold});
heading(M,CAPABILITY_Y,'04','功能全清单：12 个族 / 36 条公开研究线索');text(M,CAPABILITY_Y+60,'论文图示 25 · 官方视频观察 1 · 对比任务 2 · 文字描述 5 · 官方设想 3 ｜ 证据类别分开阅读',{size:35,color:C.muted});
const evidenceLabel={'official-figure':'图','official-video-observation':'视频','official-comparison':'比较','official-description':'文字','official-prospect':'设想'};
catalog.families.forEach((family,i)=>{const x=M+(i%4)*(CARD+GAP),y=CAPABILITY_Y+98+Math.floor(i/4)*256;rect(x,y,CARD,238,C.panel,C.line,14);text(x+24,y+44,`${String(i+1).padStart(2,'0')}  ${family.label}`,{size:37,color:C.olive,weight:600});catalog.capabilities.filter(item=>item.family===family.label).forEach((item,j)=>{text(x+24,y+85+j*34,`${item.id}  ${item.name}`,{size:31,color:item.id==='C19'?C.gold:C.ink});text(x+CARD-24,y+85+j*34,`${evidenceLabel[item.evidenceLevel]}${item.id==='C19'?' · 未接':''}`,{size:31,color:item.id==='C19'?C.gold:C.muted,anchor:'end'});if(units(`${item.id}  ${item.name}`)*31>CARD-200)throw new Error(`Capability overlaps: ${item.id}`);});});
heading(M,SUPPORT_Y,'05','我们已有的基础：可复用的关系与分层证据');rect(M,SUPPORT_Y+40,COLUMN,365,C.panel,C.line,16);rect(2420,SUPPORT_Y+40,COLUMN,365,C.tint,C.line,16);text(M+32,SUPPORT_Y+94,'独立支撑：从画面到可验证对象关系',{size:41,color:C.olive,weight:600});lines(M+32,SUPPORT_Y+151,['原三角面 / 节点变换 → 水平连通候选 → 选面 → 完整灯底覆盖检验。','真实三角并集 + 2 mm 保守边距；不用桌包围框替代支撑。','拖灯连续扫掠；拖桌 / 旋转 / 宽深变更保持关系，非法释放回滚。','三桌复用规则；原夹装灯语义失败保留，不判断承重与重心。','0.18.2：保存 / 撤销 / 重做状态准确；失败不跳页，备份后可留页。'],{size:34,gap:46,color:C.ink});text(2452,SUPPORT_Y+94,'证据与边界：历史通过，不外推商业成熟',{size:41,color:C.olive,weight:600});lines(2452,SUPPORT_Y+151,['历史 0.18.2：产品 Node 386/386；仓库检查 16/16。','九个登记目标 / 十份稳定存档；不含试衣、真人和独立桌灯。','实际截图、JSON 对照、源资产分析、纯夹具 / VM 模拟分别留证。','多键恢复 / 原文比较不是跨窗口原子锁；登记资产不证明任意泛化。','指定设备、真实故障竞争、触摸、离线与长期性能，按需专项验证。'],{size:34,gap:46,color:C.ink});
heading(M,USE_Y,'06','使用场景：按真实用户任务选择，五类可能用途');
[['空间方案与选品','家具、光照、关系与 A/B','可恢复的设计沟通'],['产品展示与观察','汽车部件、视角与配置','交互展品与说明'],['交互教学与探索','图像测量、热响应、地标','明确假设的教学'],['素材创作与策展','取样笔刷、陈列与偏好','可编辑的内容生产'],['交互原型与接入研究','语义、动作、约束与状态','新任务的实际验证']].forEach(([title,a,b],i)=>{const x=M+i*920;rect(x,USE_Y+44,880,159,C.panel,C.line,12);text(x+24,USE_Y+90,title,{size:36,weight:600,color:C.olive});lines(x+24,USE_Y+135,[a,b],{size:33,gap:40,color:C.muted});});
rect(M,VALUE_Y,4560,255,'#e1ebdf','#bacdb7',18);text(M+32,VALUE_Y+59,'对你的意义：把看见的效果，沉淀为可自主维护的交互、状态、约束、素材和原型基础。',{size:44,color:C.olive,weight:600});lines(M+32,VALUE_Y+117,['基础方向探索已经够用。保留代码、十一场景、独立研究与失败证据；后期由具体产品想法决定扩展，当前不另起新功能研究。','具体用户任务 → 选择已可复用的基础 → 定义缺口与输入边界 → 补需要的研究 / 业务 / 内容 → 用真实成果与恢复流程验收。','画质和素材改善属于体验；任意新资产、复杂关系、真实数据与新业务，都需要各自的输入、失败样本和验证范围。'],{size:35,gap:48,color:C.ink});
link('https://runway.com/news/research/introducing-solaris',()=>text(M,HEIGHT-59,'公开依据：Runway Introducing Solaris / arxiv.org/html/2609.00776v1 ｜ 标题可点击出处或场景；源图 © 作者 / Runway，并无商业授权声明。',{size:30,color:C.muted}));
link('https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',()=>text(M,HEIGHT-15,'汽车：Eric Chadwick · ©2024 Darmstadt Graphics Group GmbH · CC BY 4.0；修改车漆 / 光照 / 姿态。其余素材完整许可见网页。',{size:30,color:C.muted}));add('</svg>\n');
if(bounds.some(item=>item.x<0||item.x+item.w>WIDTH||item.bottom>HEIGHT))throw new Error('Paragraph outside map');
const svg=chunks.join('\n'),outputs=[];
for(const [suffix,view]of[['',[0,0,WIDTH,HEIGHT]],['-source',sourceView],['-ours',ourView]]){const out=suffix?svg.replace(header(WIDTH,HEIGHT,[0,0,WIDTH,HEIGHT]),header(view[2],view[3],view)):svg;for(const directory of['assets','web/assets']){const relative=`${directory}/atelier-understanding-map${suffix}.svg`;await fs.writeFile(path.join(root,relative),out,'utf8');outputs.push(relative);}}
console.log(JSON.stringify({width:WIDTH,height:HEIGHT,sourceView,ourView,minimumAuthoredFontSize:30,bytes:Buffer.byteLength(svg),sourceScenes:13,sourcePhotos:14,sourceTextCards:2,productScenes:11,additionalResearchEntries:2,sourceWindows,photos,evidence,outputs},null,2));
