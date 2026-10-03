export const capabilities = [
  {
    id: 'world', title: '走进一座三维小岛', label: '场景与镜头',
    description: '同一座岛，换一个观察位置，就能看到真实的远近关系。拖动转动镜头，滚轮拉近或拉远。',
    principle: 'Scene 收纳物体，PerspectiveCamera 定义视角，WebGLRenderer 将几何体绘制成像素。本实验由应用代码计算镜头旋转和缩放。',
    tryThis: '拖动场景观察小岛背面，再滚动鼠标比较近景和远景。',
    scene: 'harbour', camera: 'orbit',
  },
  {
    id: 'material', title: '让水面和物体有质感', label: '材质实验',
    description: '观察水面的波纹、反光和天文台黄铜浑天仪的表面。调整粗糙度，同一形状就会呈现不同的质感。',
    principle: '几何体决定形状，材质决定表面如何与光相互作用。这里用物理材质呈现表面反光，用逐帧变化的几何或着色参数模拟水波。',
    tryThis: '把粗糙度从 0.05 调到 1，比较黄铜浑天仪与建筑的反光，再切换线框查看几何结构。',
    scene: 'observatory', camera: 'orbit',
  },
  {
    id: 'lighting', title: '改变一天的光线', label: '灯光与阴影',
    description: '光的方向和颜色决定小岛的气氛。切换晨光、午后和蓝调，看建筑、树木和地面如何一起变化。',
    principle: '环境光补充暗部，方向光模拟太阳。阴影贴图先从光源方向记录深度，再判断哪些表面被物体遮挡。',
    tryThis: '依次选择晨光、午后和蓝调，再开关阴影，比较建筑的亮暗与地面影子。',
    scene: 'observatory', camera: 'orbit',
  },
  {
    id: 'motion', title: '让角色持续移动', label: '动画与时间',
    description: '进入漫游后，用键盘带角色在岛上行走、跑步和挥手。第三人称镜头跟随角色，水面也在持续更新。',
    principle: '每一帧根据经过的时间更新位置、朝向和动画，再重新渲染。路径与控制逻辑由应用代码编写；角色控制并非 Three.js 自带的游戏功能。',
    tryThis: '点击三维画面，用 WASD 行走，按住 Shift 跑步，再点击“角色挥手”观察动作变化。',
    scene: 'coast', camera: 'third',
  },
  {
    id: 'instancing', title: '用少量绘制铺满树林', label: '批量渲染',
    description: '许多树共享同一份模型和材质，但各自保留位置、旋转与大小。场景可以变丰富，同时减少重复提交。',
    principle: 'InstancedMesh 将相同几何体和材质的多个实例合并绘制。每个实例通过独立矩阵放置；减少 draw call，并不代表无限增加物体都没有成本。',
    tryThis: '把树木数量从 0 调到 600，再开关“批量绘制”，比较树林密度和绘制调用统计。',
    scene: 'coast', camera: 'orbit',
  },
  {
    id: 'picking', title: '点选三维世界里的物体', label: '射线拾取',
    description: '点击岛上的交互标记，读取地标的名称和说明。网页按钮与三维物体可以连接成同一条交互流程。',
    principle: '把屏幕指针坐标换算到相机视野，Raycaster 从镜头发出射线，计算射线与对象的交点，再由应用决定选中后的行为。',
    tryThis: '点击场景中的标记，留意对应地标及其信息提示。',
    scene: 'harbour', camera: 'orbit',
  },
];

export const useCases = [
  { title: '文旅与空间导览', description: '让用户先看清地点的空间关系，再决定从哪里开始探索。', examples: '园区地图 · 酒店预览 · 景点导览' },
  { title: '产品与品牌体验', description: '通过旋转、放大和点选，展示产品外观、细节与故事。', examples: '产品展示 · 发布活动 · 品牌展厅' },
  { title: '教学与数据解释', description: '把抽象的形状、运动和流程做成能操作的实验。', examples: '物理实验 · 建筑讲解 · 空间数据' },
  { title: '轻量游戏与共同在场', description: '结合应用逻辑与网络服务，构建可探索、可互动的共享空间。', examples: '寻宝 · 虚拟展览 · 朋友同游' },
];

export const pipeline = [
  { id: 'input', title: '接收输入', description: '鼠标、键盘或界面控件改变用户意图。' },
  { id: 'update', title: '更新世界', description: '应用计算角色、相机、灯光和动画的新状态。' },
  { id: 'render', title: '提交绘制', description: 'Three.js 组织几何与材质，让显卡完成绘制。' },
  { id: 'display', title: '显示下一帧', description: 'Canvas 展示结果，下一次动画帧继续循环。' },
];
