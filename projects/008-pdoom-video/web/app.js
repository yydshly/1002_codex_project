import { initLab } from './lab.js';

const upstream='https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/';
const scenes=[
  {t:'23.80',chapter:'02',file:'t23_80.jpg',title:'节拍动作',caption:'按节拍动作 · 舞台、水彩角色与 P(doom) 道具',description:'角色的跳跃、手臂和道具随时间变化。水彩铺色与墨线轮廓让同一个角色始终保持一致的造型。'},
  {t:'43.20',chapter:'03',file:'t43_20.jpg',title:'角色变换',caption:'角色变换 · 把成长与变化编排进镜头',description:'章节为角色变化编写动作和构图。角色仍由相同接口绘制，位置、大小与表情按当前时间计算。'},
  {t:'76.20',chapter:'05',file:'t76_20.jpg',title:'概念叙事',caption:'概念叙事 · 用角色、道具和几何图形表现歌词',description:'把歌曲中的 AI 概念变成可观看的场景。图形、角色和表演共同传达笑点，分镜代码承担叙事。'},
  {t:'101.00',chapter:'06',file:'t101_00.jpg',title:'星球尺度',caption:'星球尺度 · 从舞台切换到大尺度想象',description:'通过缩放、位置与构图切换叙事尺度。水彩与纸纹贯穿画面，星球场景仍使用二维几何绘制。'},
  {t:'112.00',chapter:'07',file:'t112_00.jpg',title:'场景调度',caption:'场景调度 · 角色比例、空间层次与镜头移动',description:'通过角色比例与场景布局组织观看重点。镜头推拉和画面变换都来自时间函数，可直接检查任意时刻。'},
  {t:'143.00',chapter:'09',file:'t143_00.jpg',title:'返回舞台',caption:'返回舞台 · 把角色和客串形象带回同一场景',description:'不同章节的角色在结尾再次出现。共享角色接口与客串注册使整支作品保持统一，并完成舞台叙事的回环。'}
];
const image=document.querySelector('#stage-image'),video=document.querySelector('#stage-video'),clipButton=document.querySelector('#clip-button');
let selectedScene=0,clipShowing=false;
function showScene(index){selectedScene=index;const s=scenes[index];video.pause();video.hidden=true;image.hidden=false;clipShowing=false;image.src='assets/frames/'+s.file;image.alt=`PDoomVideo ${s.t} 秒真实重绘画面：${s.title}`;document.querySelector('#frame-tag').textContent=`CHAPTER ${s.chapter} · ${s.t} s`;document.querySelector('#media-tag').textContent='静帧 / 1920 × 1080';document.querySelector('#frame-caption').textContent=s.caption;document.querySelector('#scene-title').textContent=s.title;document.querySelector('#scene-description').textContent=s.description;clipButton.textContent='▶ 播放 3 秒原画片段';document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.scene)===index)));}
document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>showScene(Number(b.dataset.scene))));
clipButton.addEventListener('click',async()=>{if(clipShowing){showScene(selectedScene);return}clipShowing=true;image.hidden=true;video.hidden=false;document.querySelector('#frame-tag').textContent='CHAPTER 02 · 23.00 → 26.00 s';document.querySelector('#media-tag').textContent='无声原画短片 / 12 FPS';document.querySelector('#frame-caption').textContent='36 张上游真实绘制帧 · 点击暂停可检查动作';clipButton.textContent='返回所选静帧';try{await video.play()}catch{document.querySelector('#frame-caption').textContent='点击视频播放按钮观看无声片段';}});
video.addEventListener('error',()=>{document.querySelector('#frame-caption').textContent='短片加载失败，可切回静帧或打开上游时间检查器。';});

const steps=[
  {label:'创作阶段',title:'先决定每个镜头发生什么',description:'作者描述的创作过程由 Claude 编写分镜、统一动画指南，再按章节组织代码。每个镜头有自己的起止时间、动作和转场。',code:'STORYBOARD.md → 每个镜头的动作\nANIMATION_GUIDE.md → 共用风格与接口\nsrc/ch/*.js → 九个章节的画面代码',file:'STORYBOARD.md'},
  {label:'渲染阶段 / 时间调度',title:'给定 t，找到当前章节和镜头',description:'时间轴先选择章节，再选择镜头。镜头接收歌曲时间、镜头内时间与镜头长度，并绘制完整画面。',code:'chapter(name, start, end, shots)\nconst ch = CH.find(c => t >= c.start && t < c.end)\nshot(t, t - shotStart, shotDuration)',file:'src/timeline.js'},
  {label:'渲染阶段 / 绘画',title:'把形状、姿态与纹理画成一帧',description:'p5.js 提供画布与变换，p5.brush 提供墨线、水彩填充和纹理。纸纹、文字与歌词最后参与合成。随机种子由时间固定，线条每秒扰动 12 次。',code:'randomSeed(1000 + Math.floor(T * 12))\ndrawWorld(T)\ncomposite(T)  // 纸纹、文字、歌词',file:'src/core.js'},
  {label:'渲染阶段 / 帧导出',title:'浏览器逐帧运行同一套代码',description:'Node.js 使用 Puppeteer 驱动无头 Chrome，在每个帧时间调用 renderAt。帧可独立计算，批量模式用多个页面并行，已有帧可跳过。',code:'t = frameIndex / fps\nawait window.renderAt(t, "image/jpeg")\n→ 保存帧 → 下一帧 / 其他 worker',file:'render.mjs'},
  {label:'交付阶段 / 视频编码',title:'图片序列和音频进入 FFmpeg',description:'上游完整成片将 JPEG 序列与已有 MP3 合成 H.264 / AAC 视频。本展示的 3 秒验证片段只有画面，原作音乐通过作者成片入口观看。',code:'图片序列 + 已授权音频\nffmpeg → H.264 视频 + AAC 音频\n→ MP4 成片',file:'render.mjs'}
];
document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{const s=steps[Number(b.dataset.step)];for(const key of ['label','title','description','code'])document.querySelector('#step-'+key).textContent=s[key];document.querySelector('#step-source').href=upstream+s.file;document.querySelectorAll('[data-step]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
const cases=[
  {tag:'最接近上游现有作品',title:'让每句歌词都有动作与转场',description:'围绕一首歌做水彩角色表演、视觉笑点和字幕。适合能接受二维卡通语言，并愿意设计每个镜头的创作。',input:'有权使用的音频、歌词时间、节拍与角色设定。',reuse:'角色绘画、舞蹈、镜头、字幕和逐帧渲染管线。',work:'为新歌曲编写分镜与章节，调整时间轴并逐镜头验收。'},
  {tag:'可迁移方向 / 需要新分镜',title:'让同一角色成为长期内容资产',description:'用固定角色、配色和动作接口制作欢迎短片、节日动画或系列故事。形象复用与局部参数修改对连续制作有价值。',input:'品牌角色设定、视觉规范、故事与目标时长。',reuse:'角色参数、表情、服装、镜头与绘画风格。',work:'绘制新角色，建立动作与场景；对形象、授权和每支短片进行验收。'},
  {tag:'可迁移方向 / 内容需自行设计',title:'把抽象概念变成有时间顺序的画面',description:'让角色、形状和镜头呈现知识点与因果关系。时间函数使讲解节奏可精确控制，适合二维解释型视频。',input:'经过核对的讲解脚本、概念关系、旁白时间。',reuse:'几何绘画、关键帧、文字合成和指定时刻检查。',work:'为教学概念设计画面；校验事实、旁白同步、可读性与教学效果。'},
  {tag:'扩展方向 / 需要参数化开发',title:'把重复制作变成可配置的模板',description:'围绕已有角色与分镜，把颜色、台词和部分时间参数提取为配置，可用于系列短片或小型动态素材生产。',input:'固定模板、允许变化的参数、输出规格与素材。',reuse:'时间调度、确定性绘制、循环场景与导出逻辑。',work:'另行开发配置接口、批处理、队列和失败恢复；仓库未提供完整产品流程。'}
];
document.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>{const c=cases[Number(b.dataset.case)];for(const key of ['tag','title','description','input','reuse','work'])document.querySelector('#case-'+key).textContent=c[key];document.querySelectorAll('[data-case]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
document.querySelector('#copy-command').addEventListener('click',async()=>{const txt=document.querySelector('#command-code').textContent,status=document.querySelector('#copy-result');try{await navigator.clipboard.writeText(txt);status.textContent='已复制。请在研究库根目录运行。'}catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(document.querySelector('#command-code'));selection.removeAllRanges();selection.addRange(range);status.textContent='已选中命令，请按 Ctrl+C 或使用系统复制菜单。'}});
const lab=initLab(document.querySelector('#principle-lab'));
window.addEventListener('pagehide',()=>lab?.dispose?.());

async function initBudget(){
  const panel=document.querySelector('#render-budget');
  const duration=document.querySelector('#budget-duration'),fps=document.querySelector('#budget-fps'),workers=document.querySelector('#budget-workers');
  const measurement=document.querySelector('#budget-measurement');
  try{
    const response=await fetch('assets/render-benchmark.json');
    if(!response.ok)throw new Error('测量记录无法加载');
    const data=await response.json();
    const minMs=Number(data.stills.minMs),maxMs=Number(data.stills.maxMs);
    if(!Number.isFinite(minMs)||minMs<=0||!Number.isFinite(maxMs)||maxMs<minMs)throw new Error('测量记录无效');
    const range=(element,min,max)=>{element.textContent=`${(min/60).toFixed(1)}–${(max/60).toFixed(1)} 分钟`;element.dataset.minSeconds=String(min);element.dataset.maxSeconds=String(max);};
    const update=()=>{
      const seconds=Number(duration.value),rate=Number(fps.value),count=Number(workers.value),frames=Math.ceil(seconds*rate);
      document.querySelector('#budget-duration-label').textContent=`${seconds} 秒`;
      document.querySelector('#budget-frames').textContent=String(frames);
      range(document.querySelector('#budget-serial'),frames*minMs/1000,frames*maxMs/1000);
      range(document.querySelector('#budget-ideal'),frames*minMs/1000/count,frames*maxMs/1000/count);
    };
    measurement.textContent=`2026-10-04 本机实测：Intel UHD / D3D11；六个静帧 ${(minMs/1000).toFixed(2)}–${(maxMs/1000).toFixed(2)} 秒/帧。3 秒无声片段（${data.clip.fps} FPS、${data.clip.frameCount} 帧）输出耗时 ${(data.clip.totalMs/60000).toFixed(2)} 分钟。`;
    for(const control of [duration,fps,workers]){control.disabled=false;control.addEventListener('input',update);control.addEventListener('change',update);}
    update();panel.dataset.ready='true';
  }catch{measurement.textContent='测量记录暂时无法加载，可查看项目研究笔记中的本机结果。估算控件已停用。';panel.dataset.ready='error';}
}
initBudget();
