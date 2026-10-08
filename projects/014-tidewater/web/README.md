# 014 · Tidewater · 可控 3D 场景工作台 Web

当前公开版入口为[成果与产品说明](release.html)，直接查看[已保存原海岛](camp-viewer.html?proposal=560be513-9fa1-4ee5-b4dc-22c01e3aae8b)或进入[原场景提案工作室](camp.html)。沿用200×150米、25对象、17细化物体的原三岛场景，暂不改变现有视觉效果。

网页说明已补充“图或粗模确定空间—模型完善—程序保护约束—局部另存—交付”的产品主线、入口出口、探索过程、业务扩展和后续优化。在线静态版提供已有场景浏览、提案编辑和成果下载；新的控制模型任务与工程落盘需本机4198服务。远端页面不会自动访问读者的本机控制服务。

根构建会生成`../publish/`；早期完整冻结源码仍保留在本机，公开版提供其阶段截图与当前回放。原v3/v5和两个独立业务工程继续可在线访问。资源来源与许可见[完整声明](../THIRD_PARTY_NOTICES.md)。

这里包含原生 WebGPU 海岛编辑器，以及参考图片/语义绘笔创作实验。手动布局可以生成粗模，再细化陆地、组合 PBR 材质与扫描资源，并在当前页第 06 步查看或生成神经模型精细资产。页面可以静态部署，已有本地 GLB 无需模型密钥；发起新任务需要联网，并受 Microsoft 官方 TRELLIS.2 服务额度与可用性限制。项目介绍见 [README](../README.md)，能力、产品讨论和接入设计见 [研究网页](research.html)。

在仓库根目录运行 `node projects/014-tidewater/tools/serve.mjs`，访问 http://127.0.0.1:4196/。不要直接用 file:// 打开。`index.html`、`app.js` 和 `scene-core.js` 为本地实现；`runtime/src` 为固定版本上游代码，`runtime/editor-bridge.js` 为独立适配器。

根索引配置为：

```json
"publishDir": "projects/014-tidewater/web"
```

`node scripts/catalog.mjs build` 会把本目录复制到总静态输出，无 npm 运行时依赖。浏览器开发测试可先运行 `npm install --prefix projects/014-tidewater/tools`，再运行 `node projects/014-tidewater/tools/browser-check.mjs`。当前工作区也可复用既有项目安装的 Puppeteer。测试使用本机 Chrome；可通过 `TIDEWATER_GPU_BACKEND=d3d11` 选择测试后端。

部署后工作台会位于 `/1002_codex_project/projects/014-tidewater/`。适配器把上游根相对素材请求重定位到 runtime，支持子路径。当前没有自建模型后端、账号或云存储；新第 06 步由浏览器直接调用 Microsoft 官方 TRELLIS.2 Hugging Face Space。

## 页面入口

| 页面 | 实际能力 |
| --- | --- |
| [原生海岛工作台](index.html) | 固定海岛、六对象、真实海水/天空、环境和镜头编辑 |
| [参考图片入口](create.html?entry=image) | 上传图片、人工标注、外观说明，并进入同一布局草案 |
| [语义绘笔入口](create.html?entry=layout) | 绘制区域、道路和物体，由 plan 创建真实 3D 粗模，并在选定陆地上预览、应用本地细化 |
| [保留旧工作台](previous/index.html) / [旧研究页](previous/research.html) | 本次新增前的可访问网页版本，共用原生 runtime |
| [研究页](research.html#creation-pipeline) | 实现状态、产品流程与后续扩展说明 |
| [模型方案比较](model-scene.html) | 只读当前布局，比较本轮编码模型编写的海岸几何方案，独立保存候选并导出 GLB |
| [当前页写实实验](create.html?entry=layout#realistic-panel) | 在同一创作页面读取当前布局，组合 PBR 材质、扫描岩石和 HDRI，比较粗模、切换镜头/光照并截图 |
| [模型生成精细资产](create.html?entry=layout#neural-panel) | 加载本轮 TRELLIS.2 真实生成小屋 GLB，或提交参考图片生成新 3D；按对象 ID 与尺度回填并比较、应用、还原 |
| [上一版材质效果](versions/2026-10-05-realistic-material-v1/snapshot.html) | 455 文件快照与 25 个区域／对象的冻结布局，只读回放，不写入当前草案 |

## 原生工作台

工作台实际运行固定 Tidewater 海岛，提供原版渔船和五个新增对象的有限编辑，以及环境、镜头、撤销重做、JSON 和 PNG。预设不会创建另一套地形；文字指令是本地规则解析；编辑 JSON 不包含完整世界和生成资源。

## 本地创作实验已实现什么

图片与绘笔入口共享一个独立草案，不是两套互不相关的作品。新建为空白；“载入两岛示例”明确添加演示布局，不冒充用户生成的内容。

- **图片参考**：接受 PNG、JPEG、WebP，解码并缩小为 JPEG 预览后嵌入 plan；支持使用既有海岛截图、移除图片和填写 `intent`。标注是人工操作，不识别图中物体、深度或尺寸。标记沿用画布归一化坐标，图片投影不是地面真实位置，需在俯视布局中校正。
- **语义画布**：自由绘制闭合陆地/水域多边形、道路路径，放置小屋、灯塔、棕榈和船的标记。画布、列表和粗模选择同一 ID；画布可拖动对象，属性可修改中心 X/Z 与高度。锁定保护形状、位置、高度和删除；“清除未锁定”保留锁定对象。
- **计划与历史**：独立 `version: 1` plan 描述名称、入口、文字意图、世界尺寸、风格、参考图和实体。核心严格检查字段、ID、有限数值、坐标、点数和高度，一组操作先在副本校验再提交。撤销/重做最多 30 步，仅当前页面会话。
- **真实粗模**：点击“生成 3D 粗模”后加载独立同源预览。它复用 Tidewater 的 Engine、几何和数学模块，以轻量 WGSL 光照渲染真实区域与物体；陆地挤出、水面区域、道路和标记都有几何。可以旋转、缩放、切斜视/俯视并选中对象。首次生成后默认随布局更新，也可关闭自动更新、手动生成。
- **本地交付**：自动保存与“保存”写入独立 IndexedDB；JSON 导出包含完整 plan 和缩小后的参考图像素，导入继续编辑。生成说明可以复制和下载文本，它由 plan 组织布局、意图、坐标与锁定要求，不携带图片像素，也不会发送给模型。

## 粗模之后：细化选中陆地

在画布、对象列表或 3D 中选择一块未锁定的陆地，再使用“细化选中区域”卡片。当前细化由本地程序规则生成沙滩、岩石和植被，生成的是可从不同角度观察的真实几何；没有调用模型，也不会自动读取参考图或理解外观要求文本。

1. 选择热带海岸、岩岸草甸或花园岛方向，以及稀疏、适中或丰富的密度；分别开关沙滩、岩石和植被。
2. 点击“预览细化”，在“修改前”和“候选效果”之间比较；“换一版”提供另一个候选。候选还没有提交为已保存的方案。
3. 满意后点击“应用细化”，不满意就取消或调整选项重新预览。已应用的细化可以移除，也可以撤销。修改其他草案内容或切换目标会取消当前候选。
4. 应用后的细化随草案保存及 JSON 导出，导入后可以继续编辑；撤销历史仍仅限当前页面会话。

细化依附选中陆地，通过可选 `refinement` 参数随 plan 存储，支持没有该字段的旧 plan。它不改写陆地的轮廓、高度，也不移动或删除已有水域、道路、建筑和其他标记。锁定的陆地不允许新增、替换或移除细化；需要先明确解锁。沙滩与装饰几何是显示细节，不代表挖湖、重建地形、道路可达或碰撞有效。

装饰按世界米制尺度检查落点与占地，避开陆地边缘、水域、道路、已有标记及被更高陆地覆盖的区域。岛太小或障碍太多时，实际装饰可能少于密度目标；“丰富”是预算与间距选择，不保证生成固定数量。具体生成与避让逻辑见 [creation-refinement.js](creation-refinement.js)。

本轮最多同时细化 5 块陆地，每块最多 48 个装饰，全场景最多 240 个装饰。每块陆地使用独立固定预算；细化另一块陆地不会重新分配已细化区域的预算或挤掉已有装饰。达到 5 块后需先移除某块细化，再为新目标生成候选；已有细化可以继续调整。上限在 plan 校验中执行，JSON 导入也不能绕过。

这个入口先验证“确定范围 → 查看候选 → 比较 → 接受或撤销”的控制流程。后续模型可以提出同一类受校验的陆地细化修改，执行层继续检查目标 ID、锁定与预算；这一规则细化步骤不调用模型。新的单对象精细资产生成见下方第 06 步。

水域的 `height` 表示最低绝对水位。粗模取这个值与相交陆地的最高标高中的较大值，再增加 0.035 米的显示间隔，避免水面被陆地遮挡；相交包括包含、穿越及边界接触。这只计算预览水位，不修改方案中记录的高度、轮廓或锁定状态。水域跨过不同高度的地形时，整个水多边形保持同一个水平面；船、道路及其他标记使用所在位置最高的陆地/水面作为支撑高度，随水位更新。当前不会挖出湖底，也不进行水动力模拟。

粗模和本地细化使用基础光照与程序几何，不含原海岛完整 FFT 海水、天空/云、游戏物理、碰撞或导航系统。这两个步骤不调用模型；图片标记仍为人工操作。第 06 步另接入 TRELLIS.2 图片到单对象 3D，并不代表整张场景图已恢复真实深度，或完整世界、任意资产导入和云分享已经完成。

## 同页 05：写实场景实验

[打开当前页写实实验](create.html?entry=layout#realistic-panel)。点击“把当前粗模转为写实场景”，读取当前编辑器中的布局快照，保留陆地与水面轮廓、道路走向和对象位置作为空间依据。预览把物理材质、扫描岩石、草地资源与 HDRI 环境光照组合进同一个三维空间。

- 拖动旋转、滚轮缩放、右键平移；可以切换海岸、小屋、灯塔与全景镜头。
- “查看粗模 / 返回写实效果”用于同一布局的对照，白天/日落用于检查不同光照下的材质；可保存当前视角截图。
- 修改绘笔布局后，页面提示预览仍对应上次快照。点击“按当前布局更新写实场景”才采用新的布局，不自动改写草案、存档或撤销历史。

第 05 步由编码模型实现本地场景代码与资源组装，以本地文件加载物理材质与扫描素材；这一材质步骤未调用在线模型。原粗模继续运行 Tidewater WebGPU，材质预览使用 Three.js WebGL2。“写实”描述实验目标，不能仅靠贴图或几何数量认定已经达到真实世界品质。该版本已完整保存为 [只读回放](versions/2026-10-05-realistic-material-v1/snapshot.html)，供第 06 步比较与还原。

写实预览提供截图与效果方案；完整含材质资源的统一工程导出仍待实现。上一轮模型代码候选的独立存储与 GLB 能力只对应那个候选页面。第 06 步现在以原对象 ID、位置、尺度和锁定为边界，回填模型生成组件，并将确认后的替换独立保存。

当前写实步骤通过 [12 项实际浏览器验收](../checks/realistic-browser-results.json)、[5 项地形测试](../checks/realistic-terrain.test.mjs) 和 [5 项资源校验](../checks/realistic-asset-results.json)。已在用户 25 个对象的布局与另一份双岛布局中运行；未编辑的预览标签页在退出时会跳过草案写入，以保留其他标签页的新修改。实际截图见 [当前页效果](../assets/realistic-workbench.png)，完整资源来源见 [manifest](realistic/assets/manifest.json)。

## 同页 06：模型生成精细资产

[打开第 06 步](create.html?entry=layout#neural-panel)。本轮路径已实际执行：粗模中的小屋 → 内置图像生成工具制作外观参考 → Microsoft 官方 TRELLIS.2 图片生成 3D → 导出带 PBR 纹理的 GLB。这里调用的是专门的 3D 模型，Opus 没有直接输出图片或网格。

1. 选择未锁定的小屋，点击“查看本轮模型生成小屋”，读取 [已经完成的 GLB](assets/neural/cabin-generated-v1.glb)。加载已有结果不发起新推理，也不消耗新的服务额度。
2. 在上方同一 3D 场景中旋转检查。资产等比装入原粗模尺寸边界，几何底部落在原对象支撑位置；可以调整 0°/90°/180°/270° 朝向，并切回粗模比较。
3. 确认替换后，将 GLB、模型来源与布局绑定独立保存；可以还原程序资产。源布局变化、目标删除或锁定后拒绝应用过期候选。
4. 更换 PNG/JPEG/WebP 参考图后，可以点击“用参考图生成新 3D”。图片发送到 [Microsoft 官方 Space](https://huggingface.co/spaces/microsoft/TRELLIS.2)，当前浏览器直接访问公开服务；匿名 GPU 额度、排队与服务错误会影响任务。失败会显示真实原因。

TRELLIS.2 本接口仅以图片为条件，文字外观要求只作为任务记录。页面尚无逐次生图 API；本轮参考 PNG 是开发期通过内置图像工具得到的，不是已完成的 3D，也不是从整片粗模自动恢复出来的场景图。

本轮输出为 98,320 个三角形、80,777 个顶点、两张内嵌 WebP PBR 纹理，4,859,472 bytes（约 4.63 MiB）。采用 seed 20261005、512³、2048 纹理与 100,000 导出目标。生成任务 ID 为 `7731f838b77c48b69c074368a1cc8bdd`，GLB 导出任务 ID 为 `ecf4025051ef4bf0b6382b2c1e3551e4`；参数、图片/GLB SHA-256、模型与任务来源见 [清单](assets/neural/cabin-generated-v1.manifest.json)。

本轮仅生成一间小屋，整片场景尚未由模型生成；地形、灯塔、棕榈、船与扫描素材继续沿用此前版本。模型推测了参考图不可见部分，屋檐等处仍有细节缺陷，不能保证建筑内外结构完全准确。[官方模型卡](https://huggingface.co/microsoft/TRELLIS.2-4B) 声明模型/代码为 MIT；这不是把本轮输出自动归类为 CC0 的依据，参考图片和生成资产来源单独记录。

浏览器已检查小屋正面、背面和 90° 朝向，模型按 8×7×7 米边界等比归位；确认保存后刷新页面、重新构建第 05 步时，同一布局资产成功恢复。页面新生成按钮也实际访问了官方服务，第二次请求收到 `quota-exceeded`（匿名免费 GPU 额度不足），如实显示错误而没有模拟生成；本轮缓存 GLB 可继续加载。前述第 05 步的测试数字只对应此前材质版本。

## 格式、存储与旧版

### 模型编写的 3D 候选实验

2026-10-05 新增 [独立比较页](model-scene.html)。本轮 Codex 编码模型依据已有粗模编写更详细的海岸建筑、灯塔、棕榈、船只与程序材质代码；页面运行已经写好的候选，保留原坐标、轮廓、标高与对象 ID，锁定实体保留原粗模几何。整体光照仍影响所有实体。方案可比较、独立保存，并导出真实 GLB 几何、法线、顶点色与对象分组。动态水面着色不会写入 GLB。

这个较早的独立候选页没有在线模型接口或新的逐次调用。改变参数是重建同一套代码，不会自动理解任意新文字或从图片生成 3D。其候选仍保存在独立 `tidewater-model-lab.v1` 数据库，原 `tidewater-creation-lab.v1` 草案只读；该阶段设计记录见 [本轮设计与边界](../notes/model-scene-experiment.md)。新的真实图片到 3D 服务已接在当前页第 06 步，与这个固定代码候选分开。[独立 GPU 回归页](checks/model-scene.html) 不改用户草案。

本轮核心与几何新增 21 项测试，连同原创作实验共 78 项通过；[12 项真实 WebGPU 检查](../checks/model-scene-preview-results.json) 包括真实点击拾取、锁定、水域、还原与 GLB 结构。[真实用户布局导出](../checks/model-scene-artifact-results.json) 验证 10 项保留与导出条件，实际 GLB 为 25 个节点、19,162 个三角形、约 1.99 MiB。比较、参数、独立保存、刷新恢复与导出入口通过 [12 项浏览器流程检查](../checks/model-scene-browser-results.json)。

2026-10-05 水域叠加修复已通过 [13 项水面规则测试](../checks/creation-surfaces.test.mjs) 与 [13 项真实 WebGPU 回归](../checks/water-surface-results.json)。回归包含水陆交叠、创建顺序、抬高/移出地形、锁定不改原计划、船只支撑，以及真实点击重叠湖面拾取；[独立验证页](checks/water-surface.html) 可再次运行。[原布局修复截图](../assets/water-surface-fixed-workbench.jpg) 保存了用户已有 18 个对象的验证画面。

plan 的点坐标范围为 0..1，画布左/上为 0，右/下为 1。粗模按 `world.width/depth` 映射到世界 X/Z，原点在画布中央；默认范围 200 × 150 米。这是用户定义的布局尺度，不是从参考图片测出的真实尺寸。计划最多 120 个实体、每实体 256 点、总计 4096 点，高度限制 0..100 米。

IndexedDB 为 `tidewater-creation-lab.v1`，`drafts` 中保存 `current`。原工作台的 `tidewater-studio.v1` 继续保留；初始化新入口只在备份不存在时复制到 `tidewater-studio.before-creation-inputs`。原编辑器 JSON 与创作 plan 不兼容。保存受当前浏览器和 origin 限制，JSON 用于独立备份；历史不随刷新恢复。

`previous/` 保留可运行旧网页。源文件、文档与截图另保存在 `../versions/2026-10-04-before-creation-inputs/`，见 [14 文件 SHA-256 清单](../versions/2026-10-04-before-creation-inputs/manifest.json)。旧网页共用未改动的 runtime，快照不是另一套完整渲染资源副本。

继续真实模型资产生成前，第 05 步已另存 [455 文件完整快照](versions/2026-10-05-realistic-material-v1/snapshot-manifest.json) 及 25 实体冻结布局；[只读回放](versions/2026-10-05-realistic-material-v1/snapshot.html) 不写入浏览器当前草案。冻结布局指纹为 `plan-v1-205c416bbb9a2967-22228`。

确认后的模型资产使用独立 IndexedDB `tidewater-neural-assets.v1`，`replacements` 中按完整布局指纹与目标实体 ID 关联。它保存 GLB Blob、任务元数据与朝向；原 `tidewater-creation-lab.v1` 的 plan 不写入网格或改动坐标。当前只保存已确认的对象替换，不等于完整世界工程已经导出。

## 后续产品扩展

产品探索的目标是创建不同的可编辑 3D 小场景。建议从语义绘笔开始：画水陆、道路和区域，放置关键对象，整理并确认结构化场景方案；概念图确认外观，真实 3D 粗模确认空间，再细化资源和环境。确认过的对象、区域和资源通过稳定 ID、锁定范围、约束与版本继续维护。图片可以提供参考，但不是唯一 3D 依据，也不能单独保证局部修改和空间合理。

| 扩展入口 | 用户提供什么 | 需要新增的模块 |
| --- | --- | --- |
| 语义布局 | 分区、道路、关键物体和尺度 | 基础画布/plan/粗模已有；需完善关系、分阶段确认与地形系统适配 |
| 现有资产 | 建筑、道具、角色等 3D 内容 | 导入、资源注册、比例与资源预算检查 |
| 规则约束 | 数量、间距、邻接、连通等要求 | 生成规则和空间校验 |
| 剧情事件 | 任务、触发与成功条件 | 行为/任务编辑、状态机、碰撞与导航验证 |
| 镜头时间线 | 轨迹、时长、动作顺序 | 相机关键帧、同步、重放和编码 |
| 地图与数据 | 坐标、地形高程、建筑或业务数据 | 数据接入、坐标转换、精度与缺失说明 |

当前已有不同手动布局的粗模、本地陆地细化、同页 PBR/扫描资源/HDRI 场景组装，以及 TRELLIS.2 图片到单对象 GLB 的真实生成与布局回填。任意风格、自动整场景生成、区域拓扑校验、玩法与时间线尚未实现。后续先修正资产质量、扩大对象范围和完善资源工程，再按目标用户深化玩法或镜头。

原工作台有限动作与新 plan 是独立协议。完整空间关系、统一资源引用与工程格式仍需完善，不能直接把任意模型代码或精细世界当作已有 plan 导入。完整方案见 [产品设计文档](../notes/product-design.md)，原库能力与限制见 [源码研究](../notes/research.md)。

## 文件与验证

2026-10-05 局部细化新增 [19 项配方与事务测试](../checks/creation-refinement.test.mjs) 和 [6 项沙滩裁切测试](../checks/creation-refinement-geometry.test.mjs)，连同原核心与水域测试共 57 项通过。[13 项真实 WebGPU 回归](../checks/refinement-preview-results.json) 验证几何、原布局保留、五岛预算与真实装饰拾取；[18 项独立草案浏览器流程](../checks/refinement-browser-results.json) 验证候选比较、取消、锁定、目标切换、应用、历史与 IndexedDB 恢复。可通过 [细化回归页](checks/refinement.html) 再次检查；下述较早的 10/41 项记录对应此前粗模入口。

| 文件 | 职责 |
| --- | --- |
| [create.html](create.html)、[creation.css](creation.css)、[creation.js](creation.js) | 两入口、参考图、语义画布、选中/历史、IndexedDB、导入导出 |
| [creation-core.js](creation-core.js) | 严格 plan、陆地 refinement、事务与本地生成说明；没有 API 调用 |
| [creation-refinement.js](creation-refinement.js) | 确定性的陆地细化配方、装饰预算与边界/障碍避让 |
| [creation-refinement-geometry.js](creation-refinement-geometry.js) | 将沙滩表面裁切到原陆地轮廓，并检查水域、道路与物体占地 |
| [creation-surfaces.js](creation-surfaces.js) | 纯函数计算水域贴地标高与陆地/水面的对象支撑高度 |
| [creation-preview.html](creation-preview.html)、[creation-preview.js](creation-preview.js) | 独立原生 WebGPU 粗模与选择/相机 |
| [realistic/app.js](realistic/app.js) | 当前布局快照、写实预览构建、粗模对照、镜头/光照与截图控件 |
| [realistic/scene.js](realistic/scene.js) | Three.js WebGL2、物理材质、本地扫描资源与环境光照 |
| [realistic/terrain.js](realistic/terrain.js) | 从原布局采样地形、对象支撑位置与粗模对照几何 |
| [asset-generation-core.js](asset-generation-core.js) | 单对象生成任务、源布局绑定、锁定/过期保护与等比归位 |
| [trellis-provider.js](trellis-provider.js) | 官方公开服务上传、真实队列状态、结果与错误处理 |
| [asset-generation.js](asset-generation.js) | 第 06 步候选、参考图、朝向、确认/还原与独立保存 |
| [生成清单](assets/neural/cabin-generated-v1.manifest.json) | 本轮实际模型、任务、参数、GLB/图片哈希及输出限制 |

新增核心的 [19 项测试](../checks/creation-core.test.mjs)、独立预览的 [10 项真实 WebGPU 检查](../checks/creation-preview-results.json) 和两入口的 [41 项端到端检查](../checks/creation-browser-results.json) 均通过。端到端验证真实绘笔/标注到几何、位置与高度、3D 拾取、锁定/清除/历史、含参考图与 `intent` 的 IndexedDB 恢复、原存档只备份不修改、实际 JSON 文件导入导出及错误保护、320..1440 五种宽度和保留旧版；旧版 14 文件 hash 仍一致。原海岛的 [19 项浏览器记录](../checks/browser-results.json) 对应原工作台，原核心 12 项与上游 348 文件校验也继续通过。

水域支撑另有 [13 项纯函数测试](../checks/creation-surfaces.test.mjs)，已验证包含、边相交、边界接触、凹形、不相交、顺序无关、高水位、对象支撑及输入不变。可打开 [水域真实 WebGPU 回归页](checks/water-surface.html) 检查水面几何、拾取与高度更新；该链接是验证入口，实际结果以运行页面的输出为准。

端到端脚本是 [creation-browser-check.mjs](../tools/creation-browser-check.mjs)，需要本机 Chrome、Puppeteer 和正在运行的 4196 服务。运行示例：

```bash
node --test projects/014-tidewater/checks/creation-core.test.mjs
node --test projects/014-tidewater/checks/creation-surfaces.test.mjs
node --test projects/014-tidewater/checks/creation-refinement.test.mjs projects/014-tidewater/checks/creation-refinement-geometry.test.mjs
node projects/014-tidewater/tools/creation-browser-check.mjs
```

实际页面见 [示例粗模截图](assets/creation-workbench-demo.png) 和 [图片参考截图](assets/creation-workbench-reference.png)。完整 QA 截图另存于项目 `assets/`。检查通过验证本地实验流程，不代表自动识图、模型生成或完整游戏世界已完成。

完整说明见 [部署指南](../../../docs/deployment.md)。
