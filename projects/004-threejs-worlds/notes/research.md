# 004 · Porto Lume · 原作效果与有效价值研究

[返回项目介绍](../README.md) · [版本快照](upstream-snapshot.json) · [第三方声明](../THIRD_PARTY_NOTICES.md)

研究日期：2026-10-03，应用展示更新：2026-10-04（Asia/Shanghai）。本项目先观察并接入原作，再把有效能力组合成 LUME 海岸艺术花园；基础参数实验保留为原理补充。本记录区分原作现场观察、公开代码特征、本地实现与迁移建议。源码证据能够解释实现通路，不等于完成跨设备功能或业务效果验证。

## 本地能力组合：海岸艺术花园

以数字展览与园区导览为实际用途，先定义入口、雕塑、展亭和海岸的空间关系，再放置作品、说明牌、路线、导览员与地图。首屏进入雕塑广场，避免长距离空地占据主要画面；「回到入口」和自动导览保留完整参观流程。

本地关键实现：

1. **材质与光照**：1k HDR 经 PMREM 生成适合 PBR 反射的环境图；金属度/粗糙度区分青铜、钢、石材和木材。混凝土同时使用颜色、法线和粗糙度图，应用着色时减弱颜色图的杂乱对比。玻璃使用 MeshPhysicalMaterial 的 transmission、thickness 和 ior。
2. **动画与漫游**：CC0 RobotExpressive 经 GLTFLoader 读取，AnimationMixer 混合 Idle/Walking/Running/Wave。应用根据时间步长更新位置、朝向、相机与边界；导览是一系列路线点和停留状态，手动方向输入立即接管。
3. **真正的水面反射**：官方 Water 使用镜像相机将场景绘制进纹理，再结合多尺度动态法线计算反射与高光。海面和池面独立处理；反射递归保护、更新节流与法线 mipmap 控制成本及远处采样。基础参数实验的水波仍为另一种简化实现。
4. **后处理**：RenderPass → SSAOPass → UnrealBloomPass → OutputPass。接触遮蔽增强雕塑、墙面与地面的关系；轻 Bloom 用于灯具与亮部，ACES/sRGB 统一输出。透明玻璃、草叶与 Water 不参加 AO 法线覆盖，避免片状模型形成错误遮挡。
5. **内容导航**：展点包含位置、到达点、描述与能力说明。Raycaster 先取可见的最近物体，再判断是否是作品；相机到人物之间检测建筑阻挡。地图将世界 X/Z 映射到 SVG，按钮与键盘 E 连接展览内容。
6. **空间与预算**：实例化树冠、叶片、灌木、花坛和草；场景含建筑、水池、花坛和雕塑障碍。导览穿过展亭并绕开水池。不同画质控制像素、阴影、反射更新和后处理，切换来源及页面后台停止当前 RAF。

角色、HDR 与材质素材来自独立 CC0 来源，不复制原站人物或 bundle。约 4.3 MiB 的素材和 addon 随静态页面保存，来源/哈希见 [manifest.json](../web/assets/manifest.json)，作者/许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。本地仍为单人展示；网络流程为教学模拟。

## 研究问题

1. 如何让访问者直接体验 Porto Lume 原作的视觉、漫游和空间/房间功能？
2. 原作哪些模式值得迁移，它们解决什么问题，分别适合什么产品？
3. 每种模式由 Three.js、应用和联网逻辑如何配合完成，投入到什么程度才有用？
4. 如何用已有本地实验解释核心原理，并把原站依赖、素材许可和验证范围说清？

## 原作接入与证据边界

原作对照页以 iframe 加载公开地址，场景、模型、渲染与网络均在原站运行，同时保留原站直达链接。接入依赖原站可用性、嵌入策略及浏览器对输入/媒体/网络的支持；本项目没有把原作 bundle 或模型复制到本地，也没有取得原作源码或素材复用许可。

公开主程序的目的地列表和 hash 解析确认以下链接：

| 原作目的地 | world 值 | 原作地址 |
| --- | --- | --- |
| Porto Lume | `porto` | [Porto Lume / Commons](https://porto-lume-worlds.vercel.app/#world=porto&room=commons) |
| Solstice Coast | `solstice` | [Solstice / Commons](https://porto-lume-worlds.vercel.app/#world=solstice&room=commons) |
| Sable Observatory | `astral` | [Observatory / Commons](https://porto-lume-worlds.vercel.app/#world=astral&room=commons) |

`commons` 是共享房间 code；场景和房间由不同 hash 字段表示。本地原理实验的 `harbour` / `coast` / `observatory` 是本地命名，不能替代原作 world 值。

证据标签约定：**已观察**表示浏览器交互或画面；**代码确认**表示本次读到的公开发布实现；**迁移判断**表示根据这些证据作出的产品/工程建议。以下六个模式中的适用场景和投入建议均属迁移判断，未测量留存、转化率或原站业务收益。

## 固定版本和来源

官方 [r180 发布页](https://github.com/mrdoob/three.js/releases/tag/r180)对应 npm `three@0.180.0`。GitHub [tag ref](https://api.github.com/repos/mrdoob/three.js/git/ref/tags/r180)指向 annotated tag 对象 `9e8635e2031c25859dc47ba07e72230dccb2682a`；继续读取[tag 对象](https://api.github.com/repos/mrdoob/three.js/git/tags/9e8635e2031c25859dc47ba07e72230dccb2682a)，对应实际 commit 为 `0af9729d0c143a86a1d725d6e2c3ad83301f3f34`。tag 日期为 2025-09-03；这里固定 r180 是为了与参考应用观察到的版本对齐，并不表示它是研究日最新版本。

[固定版本 package.json](https://github.com/mrdoob/three.js/blob/r180/package.json)记录版本与 MIT 许可。[LICENSE 原文](https://github.com/mrdoob/three.js/blob/r180/LICENSE)已保存为 [assets/three-LICENSE.txt](../assets/three-LICENSE.txt)。不使用变化中的默认分支作为可复现版本标识。

## 职责划分

| 层次 | 提供的能力 | 本项目/参考应用需要补充的逻辑 |
| --- | --- | --- |
| 浏览器与 GPU | Canvas、WebGL、输入事件、逐帧调度 | 页面布局、事件绑定、设备适配 |
| Three.js | Scene、Geometry、Mesh、Camera、Light、Material、Renderer | 场景布局、人物控制、相机模式、应用状态 |
| Three.js 扩展工具 | 模型加载、动画混合、水面、后处理等工具 | 选择素材、配置效果、动画状态与性能策略 |
| 应用 | UI、场景入口、角色位置、碰撞、热点与规则 | 用 Three.js 实际绘制这些状态 |
| 联网（参考应用） | Trystero、发现中继、WebRTC 通道 | 房间容量、状态包结构、更新频率、插值和断线处理 |

Three.js 是渲染库，而不是一套包含世界、玩法、物理、账号和网络后端的成品系统。多人需要额外同步；真实感也取决于几何、素材、灯光和参数，不能由库版本单独保证。

## 参考应用：Porto Lume

入口：[Solstice Coast / Commons](https://porto-lume-worlds.vercel.app/#world=solstice&room=commons)。2026-10-03 在浏览器观察到完整三维场景和可行走人物；第一/第三人称切换有效。目的地面板列出 Porto Lume、Solstice Coast、Sable Observatory，包含传送门、房间、邀请、姓名、衣服颜色和重连入口。观察时 Commons 为 1/8；没有把 UI 房间计数当成已实测多人成功的证据。

### 发布资源能证明什么

| 能力 | 公开资源中的代码特征 | 结论与限制 |
| --- | --- | --- |
| 实时三维渲染 | Three.js chunk 含 `window.__THREE__="180"`，主程序创建 WebGLRenderer 和 PerspectiveCamera | 使用 Three.js r180；Vite 打包痕迹可见，构建工具不承担三维场景本身 |
| 程序化景观 | 几何体构造、InstancedMesh、几何合并与位置矩阵 | 建筑、植物和设施大量由代码生成；并非必须下载整座城市模型 |
| 物体质感 | 标准/物理材质、程序生成颜色/粗糙度/法线纹理 | PBR 参数和贴图共同决定质感 |
| 天空和光照 | 自定义 GLSL 云层、DirectionalLight、FogExp2、环境 cubemap/PMREM | 天空氛围、阴影与环境反射组合形成视觉效果 |
| 水面与后处理 | Water、反射更新节流；High 模式启用后处理管线 | 水面包含动态法线与反射；高画质有额外 GPU 成本 |
| 真实人形动画 | `models/explorer-nathan.glb`，GLTFLoader、AnimationMixer，Idle/Walk/Run clips | 模型带蒙皮/骨骼动画，按速度混合，并叠加头部与挥手动作；本项目不复制模型 |
| 人物控制 | WASD、Shift、Pointer Lock、移动端摇杆、轻量障碍位置判定 | 应用代码实现移动和相机，非 Three.js 自动提供游戏规则 |
| 场景和房间链接 | URLSearchParams 解析 hash，hashchange、world/room 字段 | `world=solstice` 是场景，`room=commons` 是房间；切换仍由应用处理 |
| 多人通路 | Trystero、RTCPeerConnection、`makeAction("pose-v1")`、状态包校验 | 实际网络机制存在；尚未跨两客户端实测 |
| 环境音 | AudioContext、循环噪声、低通滤波和低频振荡器 | 环境底噪由 Web Audio 合成，无需相应音频文件 |
| 性能策略 | 像素预算、慢帧降 pixel ratio、距离剔除、缓存阴影与反射 | 画质、帧耗时和绘制开销存在权衡；未做原站统一基准测试 |

证据 URL（发布文件名可能随部署改变；本仓库不保存这些 bundle）：

- [原站主程序](https://porto-lume-worlds.vercel.app/assets/index-tsq_4SI0.js)
- [Three.js 与渲染附加模块](https://porto-lume-worlds.vercel.app/assets/three-UKy7KGmT.js)
- [Trystero/WebRTC 公共模块](https://porto-lume-worlds.vercel.app/assets/topic-strategy-BK0WQZQA.js)
- [Nostr 发现模块](https://porto-lume-worlds.vercel.app/assets/index-cIRNkQ-x.js)
- [MQTT 发现模块](https://porto-lume-worlds.vercel.app/assets/index-vhRo7NHj.js)

### 多人同步原理

1. 链接里的 room code 在应用中生成同一发现命名空间。
2. Trystero 通过 Nostr relay 发现同行；代码在约 18 秒未发现同行后尝试 MQTT relay。中继负责发现/信令，不负责绘制三维画面。
3. WebRTC 建立浏览器间通道，应用通过 `pose-v1` 发送名称、衣服颜色、位置、朝向、场景、移动与挥手状态。
4. 移动时最多约 10 Hz 发包，停下时较低频保活；远端插值与短暂外推让位置变化更平滑。
5. 接收端用 Three.js 把远端状态画为人物。房间容量、限流、过期玩家清理和重连由应用负责。

[Trystero 官方仓库](https://github.com/dmotz/trystero)说明其 WebRTC 发现策略。参考应用默认使用 Google/Cloudflare STUN，发布主程序未传 TURN 配置；网络可达性不能只靠渲染代码保证。未观察到专有业务数据库或持久世界存档，但「没有在发布资源里发现」不能证明所有部署侧服务都不存在。

## 六个可迁移模式

### 1. 氛围：先建立统一的空间感

**效果与证据。** 已观察：松林、海岸、人物和克制的文字控件共同形成可以停留和探索的空间。代码确认：三个世界有各自的内容与默认时段；天空/云 shader、方向光、雾、环境贴图、PBR 材质、水面反射和合成环境音共同参与表现。

**实现要点。** 把灯光、天空、雾与材质作为同一套参数设计，控制画面颜色和亮度；为建筑、植被和标识设定一致的尺度与材质。声音通过显式开关启用。Three.js 提供渲染工具，场景内容与氛围参数由应用配置。

**适用场景（迁移判断）。** 品牌空间、文化展览、艺术作品和互动叙事可以用氛围表达身份与情绪。价值首先是完整体验的连贯性；本次没有测量它是否提升转化或停留时间。

**投入边界。** 从一处完整小空间、统一色调和基础灯光开始，可以先验证美术方向。精细人物、纹理、反射和后处理涉及美术素材、版权与 GPU 预算。原作扫描人物的外观和模型没有被本地实验复用。

### 2. 漫游：让用户以行动理解空间

**效果与证据。** 已观察：人物可以行走，第一/第三人称切换有效。代码确认：WASD/Shift、鼠标 Pointer Lock、触屏摇杆、相机跟随、轻量碰撞，以及 Idle/Walk/Run 动画混合；转弯侧倾、视线和挥手是应用叠加动作。

**实现要点。** 把输入、移动状态、碰撞和镜头职责分开，用时间步长驱动运动；让动画速度与位移配合。第三人称提供角色与空间关系，第一人称适合观察细节。暂停、恢复、重置和输入提示也是漫游完整性的一部分。

**适用场景（迁移判断）。** 展厅、建筑导览、互动故事和小型浏览器游戏适合用漫游帮助理解布局和尺度。需要快速查找信息的页面还应保留明确内容入口，避免把行走变为阅读前的必经成本。

**投入边界。** 初版优先打磨控制和镜头，再增加动作与碰撞复杂度。完整物理、跳跃、镜头避障、无障碍操作和触屏手感需额外设计与测试。原作角色使用 glTF 蒙皮模型；本地程序人物仅用于说明移动和相机关系。

### 3. 空间导航：用地点组织内容，并保留直接入口

**效果与证据。** 已观察：目的地面板呈现三个世界及其描述；地图和当前所在位置提供方向线索。代码确认：world hash、场景切换、近距离传送门提示、位置跳转和跨世界跟随入口。原作使用 `porto`、`solstice`、`astral` 作为路由值。

**实现要点。** 让地点名称、地图、场景入口和 URL 指向同一目的地；空间里的传送门与面板里的直接跳转互补。应用维护世界配置、入口位置和切换状态，并按首次访问构建、后续访问缓存世界。

**适用场景（迁移判断）。** 多展区、虚拟校园、主题社区与分章节故事可以用空间作为内容索引。可分享的目的地链接适合从外部内容直接到达相关空间。

**投入边界。** 多场景不是路由库自动生成的能力：每个世界还需要入口、可走区域、地图与标识。世界数量增加会带来资源缓存和生命周期成本。链接只保存原作定义的目的地与房间，不代表持续存档或精确的位置恢复。

### 4. 多人房间：用低门槛加入和轻动作建立同在感

**效果与证据。** 已观察：Commons 显示 1/8，具有邀请链接、私房间、加入、名字/衣服颜色、挥手、重连与跟随入口。代码确认：真实 Trystero/WebRTC 通路与容量控制存在。尚未跨两个客户端确认实际连接成功，不能从按钮或人数显示推断联机体验已完成验证。

**实现要点。** 房间 code 分组用户，发现中继交换信令，WebRTC 通道同步最小人物状态；渲染端对远端状态插值。名字、颜色和挥手以较轻的内容增加辨识度。图形、发现服务与状态协议分层处理。

**适用场景（迁移判断）。** 小规模共同参观、远程导览、朋友聚会或活动空间可先验证“看见彼此和一起走”的价值。界面没有证明语音、文字聊天或协同编辑，不能把这些能力一并归入原作。

**投入边界。** 原作限 8 人，依赖公共发现服务与直连网络。本次代码没有默认 TURN 配置，部分网络可能需要补充中继路径。大规模房间、身份权限、内容审核、持久状态和运营工具需独立建设；Three.js 不承担这些职责。本地多人面板仅演示流程。

### 5. 渐进进入：在开始操作之前交代空间和控制

**效果与证据。** 已观察/页面资源确认：加载提示、欢迎标题与介绍、Start walking、Walk with friends、控制提示和目的地入口。代码确认：点击进入后申请 Pointer Lock；音效通过用户开关启动；其他世界按需构建并缓存。

**实现要点。** 首屏先说明体验目的和操作方式，再通过清晰的进入动作交接到漫游；加载阶段提供可读状态。把世界切换过渡与进入过程连贯处理。欢迎页属于交互进入层，模型加载和首帧初始化仍有自己的成本。

**适用场景（迁移判断）。** 访问成本较高的 3D 首页、虚拟展览和首次接触的互动作品适合逐步解释。低频访客需要知道为何等待、如何开始以及如何邀请同行。

**投入边界。** 显式点击进入有助于输入焦点和浏览器权限，但不等于全部资源在点击后才加载，也不保证缩短加载时间。渐进加载仍需资源拆分、缓存与实际测量；欢迎层不应阻止返回页面或直接查看内容。

### 6. 性能分档：把可用体验覆盖到更多设备

**效果与证据。** 页面/代码确认：Adaptive、High、Performance 档位，FPS 显示、像素预算、慢帧降低 pixel ratio、距离剔除、缓存阴影、更新节流的水面反射；High 启用额外后处理。没有测量原站跨设备表现。

**实现要点。** 从画布像素、阴影分辨率、反射更新频率和后处理选择控制成本；重复物体采用实例化/几何合并，减少 CPU 提交绘制命令的压力。根据帧耗时调整分辨率时保留冷却窗口，避免频繁改变画质。

**适用场景（迁移判断）。** 面向普通笔记本、手机和不同浏览器的 Web 3D 体验，应把较低成本的显示路径视为产品基本能力。不同预算下保留导航、人物与主要空间信息比固定最高画质更有实际价值。

**投入边界。** FPS 依赖设备、视角、分辨率、模型量与阴影；分档需要目标设备测试。实例化减少 draw calls，仍有实例几何、像素和阴影成本。本地实验记录了当前设备的绘制次数差异，不能当作原站跑分或普遍性能保证。

## 本地原理实验补充

原作 iframe 负责展示原作实际效果。下方原创 Three.js 实验通过受控调参解释若干基础机制，保持原作体验和教学模型的职责清楚；它们不覆盖原作完整美术、角色或联网功能。

| 实验 | 实现思路 | 预期观察，不代表已测数据 |
| --- | --- | --- |
| 三场景 | 基础几何组成建筑、栈道和天文台，配置颜色与布局 | 更换场景内容，渲染流程保持相同 |
| 人物与镜头 | 程序人物部件、输入驱动位置、相机相对变换 | 镜头改变观察方式，人物仍在同一坐标空间移动 |
| 灯光和 PBR | 切换光照参数，调整 MeshStandardMaterial.roughness | 较低粗糙度趋向更集中高光，较高粗糙度趋向更宽的反射；效果还依赖光照 |
| 阴影和线框 | 阴影开关、材质 wireframe | 阴影强化物体关系，线框暴露几何结构 |
| 0–600 棵树 | 普通 Mesh 与 InstancedMesh 使用相同树形与变换 | 批量绘制可减少同类物体的 draw calls；仍需处理每个实例的几何和像素 |
| 热点 | Raycaster 从指针和相机发射射线 | 屏幕点击可对应三维物体，应用决定交点触发的内容 |
| 多人流程 | 原创交互说明和原站外链 | 理解网络状态包到远端人物的过程；不产生真实联网会话 |

帧渲染可理解为：输入改变应用状态 → 更新对象与相机变换 → 更新动画与灯光 → 渲染器执行绘制 → 浏览器显示帧。图形实验通过实时调参观察变化，不生成离线预渲染视频。

官方 r180 文档：

- [MeshStandardMaterial](https://github.com/mrdoob/three.js/blob/r180/docs/api/en/materials/MeshStandardMaterial.html)：金属度/粗糙度流程、材质参数。
- [InstancedMesh](https://github.com/mrdoob/three.js/blob/r180/docs/api/en/objects/InstancedMesh.html)：共享几何/材质、每实例变换、减少 draw calls。
- [Raycaster](https://github.com/mrdoob/three.js/blob/r180/docs/api/en/core/Raycaster.html)：鼠标拾取与相交检测。
- [AnimationMixer](https://github.com/mrdoob/three.js/blob/r180/docs/api/en/animation/AnimationMixer.html)：原站与本地艺术花园均用于 glTF 模型动画；基础实验保留简单部件动画。
- [Water 源码](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Water.js)：原站与本地艺术花园的平面反射水面工具；基础参数实验为简化水波。

## 验证记录

| 日期 | 范围 | 记录 | 证据 |
| --- | --- | --- | --- |
| 2026-10-04 | 原创艺术花园 | 动画 glTF、玻璃展亭、PBR/HDR、反射水面、植被、光照与画质；路线、位置、作品内容与触屏布局验证 | [主展示](../assets/art-garden.jpg)、[展亭](../assets/art-garden-gallery.jpg)、[手机](../assets/art-garden-mobile.jpg)、[validation.json](validation.json) |
| 2026-10-03 | 上游版本与许可 | 核对 r180 tag、实际 commit、package 版本与 MIT 原文 | [upstream-snapshot.json](upstream-snapshot.json)、[three-LICENSE.txt](../assets/three-LICENSE.txt) |
| 2026-10-03 | 参考站公开实现 | 只读浏览器观察与公开发布资源分析 | 上方证据 URL；无跨设备联机结论 |
| 2026-10-03 | 原作 iframe 接入 | porto、solstice、astral 正常加载；进入漫游、键盘 V 切人称、光照预设、全屏进出正常；390×844 视口无横向溢出 | [原作接入](../assets/porto-integrated.jpg)、[手机接入](../assets/porto-mobile.jpg) |
| 2026-10-03 | 原作联机服务 | 浏览器记录 MQTT 中继 connack timeout；三维画面和单人交互正常，未做跨设备多人测试 | 公开发布模块 index-vhRo7NHj.js；[validation.json](validation.json) |
| 2026-10-03 | 接入与实验切换 | 默认不创建本地 WebGL；切实验卸载原站；回原作停本地 RAF，指标停止更新；本地实验能继续 | [validation.json](validation.json) |
| 2026-10-03 | 本地构建 | 总构建、模块语法与索引检查通过 | [validation.json](validation.json) |
| 2026-10-03 | 本地交互与截图 | 三场景、镜头、键盘/触屏移动、光照、材质、阴影、线框、热点与手机布局已检查；浏览器无运行错误 | [总览](../assets/overview.jpg)、[热点](../assets/hotspot.jpg)、[手机](../assets/mobile-overview.jpg) |
| 2026-10-03 | 批量渲染指标 | 海岸默认鸟瞰、600 棵树、阴影开启：普通 2,120 次，实例化 323 次；均约 82.1k 三角面。不作固定 FPS 跑分 | [普通](../assets/trees-ordinary.jpg)、[实例化](../assets/trees-instanced.jpg) |
| 2026-10-03 | 联机流程教学 | 四步切换、移动、500 ms 延迟后的三端一致与重置已检查；没有真实联网 | [validation.json](validation.json) |

本地使用 `renderer.info.autoReset` 默认值。r180 在阴影通道后清零统计，因此 UI 绘制调用与三角面只涵盖主视角。阴影仍消耗 GPU 时间。线框模式以线段绘制，三角面统计不代表全部模型数量。

集成修复包含第一人称隐藏人物拾取、挥手后的键盘焦点、BFCache 生命周期、流程重置的位置一致性、导航锚点误重置场景，以及暂停后请求漫游/挥手不恢复动画。窄屏鸟瞰镜头按画布纵横比调整距离。

## 局限与后续

- 原作效果经公开 URL 嵌入和链接展示，依赖原站部署和浏览器支持；本次没有获得原作源码或模型复用许可，也没有复制其发布资源。
- 本地艺术花园包含真实 glTF 骨骼动画、PBR/HDR、Water 与后处理，仍没有真实多人或扫描人物。原作对照、原创主展示与基础参数实验分别标明来源和用途。
- 六个模式的适用场景与投入建议是研究推断，没有原站转化、留存、用户测试或跨设备联机证据。
- 画面质量与性能依赖 GPU、浏览器、分辨率和阴影设置。减少 draw calls 的收益需要观察，不承诺固定 FPS。
- Three.js 能支持更大的模型、动画和效果管线，本次小实验不覆盖库的全部能力，也不证明完整产品所需的物理、身份或持久化功能。
- glTF 动画与环境贴图已经作为独立素材接入；若以后需要共同参观，再增加真实 WebRTC 双客户端实验并分别记录依赖与测试证据。


## 2026-10-04 · 阶段理解与归档

这几轮讨论把重点从单一场景效果转向完整空间体验。Three.js 的价值是组织绘制、光影、模型和动画；独立人物模型有自己的外观与动作价值，应用代码把它们变成可操作的漫游、导览与内容导航。机器人与真人分别有陪伴、辨识和代入、尺度的优势，角色选择应由体验目标决定。舒服感需要比例、动作节奏、脚步落地、镜头距离和环境风格一起协调，精细度只是其中一项。

原站公开程序明确标注 Renderpeople Nathan / scanned human explorer，加载 models/explorer-nathan.glb；这是素材系列证据，尚未确认具体 SKU。本地 RobotExpressive 来自 Three.js 官方示例，由 Tomás Laulhé / Quaternius 制作，Don McCurdy 整理，CC0 1.0；本地修改了配色。人物外观不会由渲染库自动生成，动画资源、控制和镜头也各自承担职责。

网页将理解整理为四部分：能力、输入更新绘制显示的原理、数字展览等使用场景、可扩展方向。引导图代码生成，嵌入现有实景，网页热点展开主题并在弹窗中复用原有同一个 WebGL 场景；关闭后还原位置。内置 ImageGen 两次网络失败，记录在 image-generation.json，没有将生成失败的图当成成果。

保留当前单人艺术花园、原作接入和参数实验，按用户要求阶段归档，后期按需重启。扩展包括授权角色替换、动作重定向、控制复用、脚步与镜头调校、复杂碰撞、内容配置和业务接入、加载优化和移动端预算、WebXR，以及多人房间的状态同步和重连；这些方向需要另行实现与验证。

重启时先明确产品目的，再选择角色类型、内容、目标设备及是否需要多人。当前不将扩展方向写成现有能力；没有通用 FPS 承诺，也没有跨设备联机实测结论。
