const topics = {
  capability: {
    number: '01', title: '库的能力：把空间、材质与运动绘制出来',
    description: 'Three.js 管理场景、几何体、模型、相机、材质、灯光与动画，并通过 GPU 绘制。官方扩展提供 glTF / HDR 加载、水面和后处理；射线拾取连接三维对象与网页交互，实例化帮助控制重复物体的绘制开销。',
    points: ['当前组合：动画导览员、金属与玻璃、反射水池、植被、光照与画质分档。', '人物模型、贴图和动作是独立素材；库负责读取、计算和绘制。', '角色控制、轻量碰撞、地图和展览路线由本地应用代码实现。'],
    demo: 'material', demoLabel: '在图中体验材质与光影',
  },
  principle: {
    number: '02', title: '原理：输入 → 更新 → 绘制 → 显示',
    description: '输入改变角色与镜头状态；每一帧按经过的时间更新位置、骨骼动作与世界。模型提供形状，材质与灯光决定表面，相机决定视野，GPU 将三维场景转成屏幕像素。网络同步是另行接入的一层。',
    points: ['骨骼动画：AnimationMixer 混合站立、行走、奔跑和挥手。', '光影：HDR / PMREM 环境反射、PBR 参数、阴影、水面离屏反射与后处理共同作用。', '拾取：Raycaster 从镜头发射射线，应用将交点映射到作品内容。'],
    demo: 'character', demoLabel: '在图中体验动画与镜头',
  },
  scenario: {
    number: '03', title: '使用场景：让空间本身承担内容导航',
    description: '数字展览、园区与文旅导览、产品展示、品牌空间、教学实验和轻量互动，都可以用三维关系表达内容。海岸艺术花园把建筑、雕塑、路径、角色、地图和热点组合成可参观的展览。',
    points: ['角色提供尺度与参与感，路径组织参观顺序，热点承载作品说明。', '真人更容易带来“我在这里”的代入感；机器人更容易形成导览伙伴的陪伴感。', '舒服感来自比例、动作节奏、脚步落地、镜头距离与环境风格的一致，细节精度只是其中一项。'],
    demo: 'tour', demoLabel: '在图中跟随展览导览',
  },
  extension: {
    number: '04', title: '可扩展方向：保留基础，按需求增加系统',
    description: '后期可以围绕具体产品继续：替换授权角色、扩充动作、复用控制器，完善脚步和镜头，接入业务内容、移动端优化、WebXR 或多人房间。每个方向都需要额外开发与目标设备验证。',
    points: ['角色方向：人体或品牌角色、动作重定向、脚步与镜头调校、表情与交互。', '产品方向：可配置展品与路线、内容管理、教学任务、数据或产品模型。', '技术方向：加载与资源压缩、性能预算、复杂碰撞、WebXR；Trystero / WebRTC 多人同步与重连。'],
    demo: 'character', demoLabel: '体验现有角色基础',
  },
};

export function initUnderstanding({ onDemo, onSource, onCapability }) {
  const root = document.querySelector('#understanding');
  const title = root.querySelector('#guide-topic-title');
  const description = root.querySelector('#guide-topic-description');
  const points = root.querySelector('#guide-topic-points');
  const launch = root.querySelector('#guide-topic-demo');
  const buttons = [...root.querySelectorAll('[data-guide-topic]')];
  let selected = 'capability', demoOpening = false;
  function select(id) {
    if (!topics[id]) return;
    selected = id;
    const topic = topics[id];
    title.textContent = topic.title;
    description.textContent = topic.description;
    points.replaceChildren(...topic.points.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    root.querySelector('#guide-topic-number').textContent = topic.number;
    launch.textContent = `${topic.demoLabel} ↗`;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guideTopic === id)));
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.guideTopic)));
  async function openDemo(kind) {
    if (demoOpening) return;
    demoOpening = true;
    const launches = [...root.querySelectorAll('[data-guide-demo], #guide-topic-demo')];
    launches.forEach(button => button.disabled = true);
    try { await onDemo(kind); }
    finally { demoOpening = false; launches.forEach(button => button.disabled = false); }
  }
  launch.addEventListener('click', () => openDemo(topics[selected].demo));
  root.querySelectorAll('[data-guide-demo]').forEach(button => button.addEventListener('click', () => openDemo(button.dataset.guideDemo)));
  root.querySelector('[data-guide-source]').addEventListener('click', () => onSource());
  root.querySelector('[data-guide-lab]').addEventListener('click', () => onCapability());
  select('capability');
}
