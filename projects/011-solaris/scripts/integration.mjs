import fs from 'node:fs/promises';

// One research inventory supplies both the product page and developer description.
const root = new URL('../', import.meta.url);
const research = JSON.parse(await fs.readFile(new URL('notes/product-feasibility.json', root), 'utf8'));
const roadmap = JSON.parse(await fs.readFile(new URL('notes/roadmap.json', root), 'utf8'));
const sceneCatalog = JSON.parse(await fs.readFile(new URL('web/capabilities/scene-catalog.json', root), 'utf8'));
const routeIds = research.capabilityRoutes.map(r => r.capabilityId);
const sceneIds = new Set(sceneCatalog.scenes.map(scene => scene.id));
if (sceneIds.size !== sceneCatalog.scenes.length || sceneCatalog.scenes.some(scene => !scene.capabilities.length || scene.capabilities.some(capability => !routeIds.includes(capability.id)))) throw Error('场景说明必须使用有效且唯一的场景 ID，以及现有研究能力编号');
const describedIds = new Set(sceneCatalog.scenes.flatMap(scene => scene.capabilities.map(capability => capability.id)));
if (research.capabilityRoutes.some(route => route.implementationStatus === 'implemented-bounded' && !describedIds.has(route.capabilityId))) throw Error('新能力接入前必须补充对应场景说明：操作、预期现象、验证方法和边界');
for (const scene of sceneCatalog.scenes) {
  const isConnected = capability => research.capabilityRoutes.find(route => route.capabilityId === capability.id)?.implementationStatus === 'implemented-bounded';
  if (new Set(scene.capabilities.map(capability => capability.id)).size !== scene.capabilities.length ||
      !scene.entry || !scene.purpose || !scene.boundaries?.length || !Array.isArray(scene.validation?.completed) || (scene.capabilities.some(isConnected) && !scene.validation.completed.length) || !scene.validation?.pending?.length ||
      scene.capabilities.some(capability => ['name','operation','expected','verification','boundary'].some(field => !capability[field]) || !Array.isArray(capability.completed) || (isConnected(capability) && !capability.completed.length) || !capability.pending?.length)) throw Error(`场景 ${scene.id} 的能力描述或验证记录不完整`);
}
const phaseIds = new Set(roadmap.phases.map(p => p.id));
const plans = new Map(roadmap.capabilities.map(c => [c.id, c]));
if (plans.size !== roadmap.capabilities.length || phaseIds.size !== roadmap.phases.length ||
    plans.size !== routeIds.length || routeIds.some(id => !plans.has(id)) ||
    roadmap.capabilities.some(c => !routeIds.includes(c.id) || !phaseIds.has(c.phaseId)) ||
    !phaseIds.has(roadmap.activePhaseId)) throw Error('路线必须为每项研究能力分配一个有效阶段，不能缺项或重复');
const connectedCount = research.capabilityRoutes.filter(r => r.implementationStatus === 'implemented-bounded').length;
if (connectedCount !== research.currentRelease.implementedBoundedCount) throw Error('发行版计数与能力实际状态不一致');
const entrances = {
  C01: ['对象 → 可调阅读灯 → 移动', '拖动台灯；调整茶几宽深高后，观察台灯和灯光仍贴合桌面。'],
  C02: ['对象 → 大地色构成 → 属性 / 缩放', '调整整体比例或宽高，拖动画作，撤销后恢复。'],
  C03: ['对象 → 窗边绿植 → 缩放 / 属性', '上下拖动，或输入尺寸；盆底保持接地。'],
  C04: ['画面底部 → 输入指令', '输入「沙发向右移动20厘米」，查看位置变化并撤销。'],
  C05: ['精选陈列 → 拖动物品至候选槽位', '在登记物品之间重排，核对身份/数量和选择独立，一步撤销并保存恢复。'],
  C06: ['沙发 / 阅读椅 → 表面材质', '在原始、亚麻、提花间切换，观察布面与保留的木脚。'],
  C07: ['坐具 → 颜色；或输入指令', '输入「沙发换成苔绿」，观察布面颜色实际变化。'],
  C08: ['环境 → 墙面颜色', '切换四种墙色，观察墙面真实材质。'],
  C09: ['挂画 → 画作 / 使用自己的图片', '切换原创画作或上传 JPG/PNG/WebP；导出项目再打开。'],
  C10: ['环境 → 一天中的时间', '从午后调整至18:30，观察色温、直射光和阴影。'],
  C11: ['环境 → 时间、光照方向、阅读灯', '改变太阳方位与灯具位置，观察阴影和点光源响应。'],
  C12: ['地标白模展览 → 时间滑块', '在6–22时之间连续调整，在相同视角查看陈列光影变化；取消、撤销并保存重开。'],
  C13: ['地标白模展览 → 拖动 / 滚轮 / 四个观察视角', '环绕、缩放、右键平移，切换总览、立面、背侧观察与屋顶；背侧是相机预设，不确认现场花园方向。'],
  C14: ['地标白模展览 → 画面热点 / 四张知识卡', '点击介绍、立面、花园、博物馆热点，阅读原创中文概述、直接官方来源与知识边界。'],
  C15: ['拖动空白处、滚轮、聚焦按钮', '旋转与缩放真实相机，保存后重新打开。'],
  C16: ['右键拖动；画面右下角 → 俯视', '平移、切换俯视再恢复默认视角。'],
  C17: ['三维试衣搭配 / 真人上装研究参考', '将短袖或轻夹克拖到完整人体上身预览，松手替换单件上装；观察真实剪裁、领口、袖腋与背面。拖空或取消恢复，切换面料配色、两种冻结姿态与相机，撤销并保存重开同一搭配。三维限定登记人体与两款预适配服装。真人入口拖照片卡只选衣，点击开始才运行本机FASHN预训练模型；比较原图/生成图并记录质量，原衣重建不一致、跨衣缺实拍，不判断尺码或真实购买。'],
  C18: ['三维试衣间 → 拖鞋展样到人体足部 / 松手', '把Court低帮鞋或Ridge短靴拖到固定人体脚掌或脚踝，合法松手左右成对替换；检查鞋口、鞋底与左右脚，上装和姿态保持。错区域或Escape恢复整套搭配，换三鞋面色、两固定姿态并从鞋细节视角观察，一次撤销重做及严格保存重开；不推断现实尺码或步态。'],
  C20: ['料理备料 → 场景内托盘拖入碗', '拖入真实完整带皮食材，释放后观察近似刚体沉降；默认4件、最多16件，核对稳定ID与数量并撤销。'],
  C21: ['材料教学 → 拖火源 / 单样品重新观察 / 同热量铜铝对照', '10W均匀零散热教学：手动查看铜铝25–60°C温升和0°C冰熔化；可选40/80/120J，让单火源依次向两块同质量同初温金属供能，实时曲线比较温升。对照重置两金属并保留冰，暂停记账、取消或一次撤销恢复整个原实验，严格保存重开。'],
  C22: ['影像工作台 → 放大工具 / 滚轮', '拖动放大，或围绕指针位置滚轮缩放；切换平移工具检查操作语义。'],
  C23: ['影像工作台 → 测量 / 标尺校准', '在原图上拖出两点测量，未校准显示 px；用已知两点标尺校准后缩放，检查长度保持。'],
  C24: ['汽车展厅 → 车灯开关 / 亮度', '切换车灯和亮度，查看灯组材质与展台上的实际照明响应。'],
  C25: ['汽车展厅 → 拖动 / 滚轮 / 观察视角', '环绕、缩放、右键平移，切换经典视角、车头、车尾、侧面、座舱近景与前舱近景。'],
  C26: ['汽车展厅 → 引擎盖滑块 / 点击盖板 / 查看前舱', '开合原始铰链盖板，查看概念车的简化机械舱，保存后重开并恢复开度。'],
  C27: ['创作台 → 来源照片 / 选区 / 纹理印章', '在真实猫照片上框选取样，再在当前画纸图层点击或拖动落印；比较不同选区，撤销后恢复。'],
  C28: ['创作台 → 参考画作 / 选区 / 绘画笔刷', '取样Met公版画作的真实像素，调节直径和透明度持续绘画，笔触方向由取样和手势形成；核对局部范围、图层与保存恢复。'],
  C29: ['料理备料 → 点击稳定食材 / 归位', '点击已稳定且通路无阻的食材，缓慢浮起检视并归位或取消；其他物品保持，受阻拒绝检视。'],
  C30: ['水下工作台 → 按住真实鱼体拖动 / 松手', '在固定水平水层直接拖鱼，位置随指针、朝向随移动方向改变，合法释放保留准确落点；水域与礁石包络限制穿越，非法释放或Escape恢复整次起点，一次撤销重做并保存重开。'],
  C31: ['水下工作台 → 拖鱼 / 观察潜水员与跟随路线', '拖鱼后观察潜水员有限转向、游动和绕礁，松手后等待到位再保留整次联动；目标间距1.00场景单位，当前水层通路受阻时安全停留，移回可达区域继续跟随。取消、撤销和保存恢复鱼与潜水员的整体位置、方向及采样轨迹。'],
  C32: ['滑板练习 → 在真实滑板上向上拖动 / 松手', '净向上拖动至少24px、横向偏移不超过100px，松手后观察骑手与滑板同步准备、起跳和落地；完成后才记一次，可取消、重播、撤销并保存恢复。'],
  C33: ['精选陈列 → 显式偏好 / 整理', '改变明确偏好，查看具体匹配理由与真实排序/布局；已有选择保持，并可撤销恢复。'],
  C34: ['帮助 → 开始 / 继续操作引导', '完成一个有效编辑，重开后继续剩余步骤。'],
  C35: ['精选陈列 → 任务 / 进入场景 / 返回选品台', '在登记工作台完成任务后返回检查点，核对陈列和各场景独立保存；未知或损坏行程拒绝。'],
  C36: ['环境 → 拖动太阳图标', '拖动太阳，实时查看方向值与场景阴影。'],
};
const nextSteps = {
  'scene-runtime': '制作经过许可与尺寸校准的对应专业场景资产，定义对象组件、约束和验收用例。',
  'appearance-engine': '接入 UV 取样、局部画布或自研图像算法，并验证边缘、遮挡和撤销。',
  'intent-tools': '为对应场景建立目标与工具协议、可靠内容依据和有限意图解析。',
  'avatar-commerce': '建立人体骨架、服装与鞋资产、适配规则和商品业务状态，再验收试穿与联动。',
  'motion-composition': '建立对应资产、固定时间步行为及接触规则，验证多主体关系与状态恢复。',
  'simulation-runtime': '实现明确材料参数、反应模型或运动规则，并提供可重复的验证场景。',
  'education-viewport': '引入有使用依据的图像数据、校准单位和领域视口工具，验证缩放与测量精度。',
  'adaptive-workflow': '建立对应商品或场景的数据与业务状态、有限意图规则和可恢复工作流，再提供真实场景验收。',
};
const data = {
  version: research.currentRelease.version, updatedAt: research.updatedAt, total: research.capabilityRoutes.length,
  connected: connectedCount,
  researchWorkbenches: research.currentRelease.tableSupportResearch ? [research.currentRelease.tableSupportResearch] : [],
  scenePrinciple: sceneCatalog.principle,
  scenes: sceneCatalog.scenes.map(scene => {
    const capabilities = scene.capabilities.map(capability => ({
      ...capability,
      status: research.capabilityRoutes.find(route => route.capabilityId === capability.id).implementationStatus,
    }));
    const connected = capabilities.filter(capability => capability.status === 'implemented-bounded').length;
    return { ...scene, capabilities, connected, total: capabilities.length, status: connected === capabilities.length ? 'implemented-bounded' : connected ? 'partial-implemented' : 'verification-pending' };
  }),
  roadmap: {
    title: roadmap.title, principle: roadmap.planningPrinciple, scheduleBoundary: roadmap.scheduleBoundary,
    activePhaseId: roadmap.activePhaseId, releaseGates: roadmap.releaseGates,
    phases: roadmap.phases.map(p => {
      const capabilityIds = roadmap.capabilities.filter(c => c.phaseId === p.id).map(c => c.id);
      const connectedIds = research.capabilityRoutes.filter(r => capabilityIds.includes(r.capabilityId) && r.implementationStatus === 'implemented-bounded').map(r => r.capabilityId);
      return { ...p, capabilityIds, connectedIds, connected: connectedIds.length, total: capabilityIds.length };
    }),
  },
  editorTools: [
    { name: '新桌支撑独立研究', entrance: '客厅顶栏 → 新桌支撑研究；明确选择自动检测面后操作', scope: '三种真实静态桌与独立圆底灯共用冻结规则；原网格三角并集、完整灯底加2mm、连续灯扫掠、整桌关系和严格备份。0.18.1增加完整原文旧页保存保护、写后读回、最新存档重验与可撤销打开；两标签顺序任务已核查，非原子锁。0.18.2准确显示草稿状态，离开前保存/备份/继续/明确离开，备份不当作保存；真实全文与跳转已核查，原生关闭/返回缓存/本轮窄屏另验。保留25候选/22失败及夹装灯语义失败，不替换客厅旧规则、不加入十份整套备份、不增加35/36。' },
    { name: '对象复制', entrance: '属性 → 复制对象 / Ctrl+D', scope: '寻找附近空位；副本独立材质和尺寸；台灯随茶几复制，最多24个对象（含可恢复对象）。' },
    { name: '移除与恢复', entrance: '属性 → 移除对象 / Delete；左侧 → 已移除的对象', scope: '移除茶几同时移除台灯；恢复时检查占位，先恢复茶几再恢复台灯；可撤销和重做。' },
    { name: '独立宽、深、高', entrance: '属性 → 位置与尺寸', scope: '输入米制尺寸后离开输入框提交；各轴50–150%，整体比例另行控制。网格拉伸会改变外观。' },
    { name: '茶几型号替换', entrance: '茶几 → 属性 → 茶几型号', scope: '两个本地 CC0 模型，保留位置、旋转和比例，重新检查尺寸与台灯桌面约束。' },
    { name: '保存、备份与比较', entrance: '保存方案；方案 A/B；项目菜单；相机按钮；精选陈列 → 整套工作台备份', scope: '本机保存、JSON与同视角真实渲染比较；整套十份已保存原文显示准确文件名/UTF-8容量，已检查文本可下载，失败保留文本，选择恢复后重开核对；无跨设备云同步。' },
  ],
  capabilities: research.capabilityRoutes.map(r => ({
    id: r.capabilityId, name: r.name, family: r.family, module: r.primaryModule,
    status: r.implementationStatus,
    entrance: r.implementationStatus === 'implemented-bounded' ? (entrances[r.capabilityId]?.[0] || '请查看对应场景操作说明') : '尚无产品操作入口',
    trial: r.implementationStatus === 'implemented-bounded' ? (entrances[r.capabilityId]?.[1] || null) : null,
    plan: plans.get(r.capabilityId),
    implementation: r.algorithm, input: r.inputRequirement,
    scope: r.releaseScope || r.scopeLimit,
    next: r.implementationStatus === 'implemented-bounded' ? null : (nextSteps[r.primaryModule] || `接入 ${r.primaryModule} 模块，准备对应资产与校准数据。`),
    acceptance: r.acceptance,
  })),
};
const output = JSON.stringify(data, null, 2) + '\n';
const target = new URL('web/studio/integration-data.json', root);
if (process.argv.includes('--check')) {
  if (await fs.readFile(target, 'utf8') !== output) throw Error('接入说明与研究清单不同步，请运行 scripts/integration.mjs');
  console.log(`接入说明同步：${data.version} · ${data.connected}/${data.total}，${data.roadmap.phases.length}个阶段覆盖全部能力，${data.scenes.length} 个场景验证说明，编辑工具${data.editorTools.length}类`);
} else { await fs.writeFile(target, output); console.log('已生成接入说明数据'); }
