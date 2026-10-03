import { readFile, writeFile } from 'node:fs/promises';
const screenshot = await readFile(new URL('../assets/art-garden.jpg', import.meta.url));
const escape = text => text.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
const text = (x, y, label, klass='body', extra='') => `<text x="${x}" y="${y}" class="${klass}" ${extra}>${escape(label)}</text>`;
const lines = (x, y, labels, klass='body', spacing=40) => labels.map((label,i)=>text(x,y+i*spacing,label,klass)).join('');
function panel(x,y,w,h,n,title,subtitle,rows,bottom) {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="#fbfbf5" stroke="#d8decf"/>${text(x+30,y+49,n,'number')}${text(x+92,y+49,title,'panel-title')}${text(x+30,y+86,subtitle,'small')}${lines(x+30,y+139,rows)}<path d="M ${x+30} ${y+h-78} H ${x+w-30}" stroke="#dce2d2"/>${text(x+30,y+h-43,bottom,'caption')}</g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1280" viewBox="0 0 1920 1280" role="img" aria-labelledby="title desc">
<title id="title">Three.js · 从绘制能力到空间体验</title><desc id="desc">能力、原理、场景和扩展的理解总览。人物与机器人有不同体验价值；外部素材、Three.js 和应用各自承担职责。现有单人艺术花园暂告一段落，后期按需重启。</desc>
<defs><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#f8f6ed"/><stop offset="1" stop-color="#eef1e5"/></linearGradient><linearGradient id="bronze" x2="1" y2="1"><stop stop-color="#d5bd7d"/><stop offset="1" stop-color="#927449"/></linearGradient><clipPath id="scene"><rect x="637" y="233" width="646" height="352" rx="18"/></clipPath><style>
text { font-family: 'Microsoft YaHei', 'Noto Sans SC', sans-serif; fill:#294536; }
.title{font-size:52px;font-weight:700;letter-spacing:1px}.subtitle{font-size:23px;fill:#74836b}.number{font-size:33px;font-family:Georgia,serif;fill:#ab8a50}.panel-title{font-size:31px;font-weight:700}.body{font-size:23px;fill:#435e44}.small{font-size:19px;fill:#7f8d70}.caption{font-size:19px;fill:#8b794d}.center-title{font-size:27px;font-weight:700}.role-title{font-size:24px;font-weight:700}.role-body{font-size:20px;fill:#657b5b}.chain{font-size:22px;font-weight:700}.footer{font-size:20px;fill:#4e6749}.tiny{font-size:17px;fill:#7b876e}
</style></defs>
<rect width="1920" height="1280" fill="url(#paper)"/>
<path d="M 48 144 H 1872" stroke="#d1d9c6"/>
${text(54,54,'PROJECT 004  /  UNDERSTANDING MAP','small')}${text(54,116,'Three.js · 从绘制能力到空间体验','title')}
${text(1866,54,'2026.10.04 · 阶段整理','small','text-anchor="end"')}${text(1866,111,'模型 + 动画 + 光影 + 交互 + 内容','subtitle','text-anchor="end"')}
${panel(48,178,538,407,'01','能力','Three.js 核心 + 官方扩展',['场景与镜头 · 几何与模型','PBR 材质 · 灯光与阴影','骨骼动画 · 射线拾取','实例化 · 水面反射 · 后处理'],'组合能力，让空间丰富且可操作')}
${panel(1334,178,538,407,'02','原理','输入 → 更新 → 绘制 → 显示',['模型提供形状，骨骼驱动动作','材质与光决定表面的质感','镜头决定视野，逐帧更新世界','GPU 将三维场景绘制为像素'],'控制规则与网络由应用实现')}
${panel(48,638,538,438,'03','使用场景','空间关系与探索任务承载内容',['数字展览 · 文旅与园区导览','产品展示 · 品牌空间','教学实验 · 轻量互动','路线、地图、热点组织内容','角色提供尺度和参与感'],'三维体验需要对应真实内容')}
${panel(1334,638,538,438,'04','可扩展方向','后期按需求开发，并验证目标设备',['角色替换 · 动作与控制复用','更自然的脚步、镜头与碰撞','可配置内容 · 业务系统','资源压缩 · 移动端 · WebXR','多人房间 · 状态同步 · 重连'],'扩展方向尚未完整接入')}
<path d="M 590 384 H 624 M 1296 384 H 1330 M 590 849 H 623 M 1297 849 H 1330" stroke="#b69a63" stroke-width="3" stroke-dasharray="7 7"/>
<rect x="616" y="178" width="688" height="898" rx="26" fill="#e5ebd8" stroke="#c5cfb5"/>
${text(642,219,'LUME · 海岸艺术花园','center-title')}${text(1276,217,'现有单人演示','small','text-anchor="end"')}
<g clip-path="url(#scene)"><svg x="637" y="233" width="646" height="352" viewBox="56 312 1298 710"><image width="1440" height="1080" xlink:href="data:image/jpeg;base64,${screenshot.toString('base64')}"/></svg></g>
<rect x="637" y="601" width="646" height="152" rx="16" fill="#f7f8ee"/>
<g transform="translate(671,628)"><circle cx="30" cy="12" r="12" fill="#b79c75"/><path d="M 15 36 Q 30 24 45 36 L 45 67 H 15 Z" fill="#405d4a"/><path d="M 20 67 L 17 96 M 39 67 L 44 96 M 15 40 L 3 62 M 45 40 L 57 62" stroke="#405d4a" stroke-width="9" stroke-linecap="round"/></g>
${text(753,639,'真人角色','role-title')}${text(753,675,'代入感与现实尺度','role-body')}${text(753,711,'“我在这里散步”','role-body')}
<path d="M 958 621 V 731" stroke="#ced7c0"/>
<g transform="translate(986,632)"><rect x="5" y="0" width="52" height="32" rx="12" fill="#f0f0df" stroke="#526b54" stroke-width="3"/><rect x="12" y="11" width="38" height="9" rx="4" fill="#526b54"/><rect x="15" y="40" width="32" height="35" rx="8" fill="#ebecdd" stroke="#526b54" stroke-width="3"/><path d="M 19 77 L 16 96 M 42 77 L 48 96 M 10 47 L 1 72 M 52 47 L 61 72" stroke="#526b54" stroke-width="8" stroke-linecap="round"/></g>
${text(1064,639,'机器人角色','role-title')}${text(1064,675,'陪伴感与角色辨识','role-body')}${text(1064,711,'“伙伴带我参观”','role-body')}
${text(960,789,'舒服感：比例 · 动作 · 脚步 · 镜头 · 环境','chain','text-anchor="middle"')}${text(960,823,'两者均可成立，角色选择由体验目标决定','small','text-anchor="middle"')}
<path d="M 645 850 H 1275" stroke="#c5cfb5"/>
${text(960,887,'外部素材 → Three.js 绘制 → 应用体验','chain','text-anchor="middle"')}
${lines(647,931,['模型 / 贴图 / 动作','独立素材提供内容'],'role-body',33)}
${lines(868,931,['加载 / 动画 / 渲染','库组织显卡绘制'],'role-body',33)}
${lines(1086,931,['漫游 / 导览 / 联网','应用组织产品行为'],'role-body',33)}
${text(960,1018,'素材、绘制与体验各自承担职责','small','text-anchor="middle"')}
<rect x="48" y="1112" width="1824" height="120" rx="22" fill="#274535"/>
${text(78,1152,'当前：单人艺术花园 + 原作在线接入 + 基础参数实验','footer','style="fill:#f6f5e8"')}
${text(78,1193,'人物来源：Renderpeople Nathan（原作） / RobotExpressive（本地，CC0）','footer','style="fill:#d5dfc8"')}
${text(1841,1152,'暂告一段落 · 后期按需重启','footer','style="fill:#f1ddb2" text-anchor="end"')}
${text(1841,1193,'本地多人与 WebXR 尚未接入','footer','style="fill:#d5dfc8" text-anchor="end"')}
${text(50,1260,'实景来自本地艺术花园；角色体感与迁移方向为本项目理解。网页中的图上入口可打开真实演示。','tiny')}
</svg>`;
await writeFile(new URL('../assets/threejs-understanding.svg',import.meta.url),svg);
await writeFile(new URL('../web/assets/threejs-understanding.svg',import.meta.url),svg);
console.log('Generated reproducible 1920×1280 SVG guide with embedded local scene proof.');
