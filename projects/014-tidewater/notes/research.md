# Tidewater 源码研究

[项目介绍](../README.md) · [研究网页](../web/research.html) · [产品设计](product-design.md)

研究日期：2026-10-04（Asia/Shanghai）。结论对应 commit [4811ba48d795197de5621985f404e765c0b7c0ef](https://github.com/dgreenheck/tidewater/tree/4811ba48d795197de5621985f404e765c0b7c0ef)。源码事实、作者描述、原型实测和产品推断分别记录。

## 项目定位

Tidewater 是浏览器热带海岛钓鱼游戏与图形技术展示，自有 WebGPU/WGSL 引擎、完整场景、玩家控制和装备经济共同组成应用。package.json 标记 private: true，没有公开包入口或 exports；开发依赖为 Vite 和 webgpu。适合 fork、读源码与改造，复用前仍需整理接口和生命周期。

证据：[README](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/README.md)、[package.json](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/package.json)。

Player.js 的 THREE 变量指向自有 three.js 兼容 API，不意味着当前使用 Three.js 渲染器；SMAA 纹理及部分后处理仍有 three.js 来源。[engine/index.js](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/engine/index.js)

## 可确认的能力与呈现

| 系统 | 能力与预期呈现 | 源码 |
| --- | --- | --- |
| 海洋 | 四级 FFT 波面、岸浪、泡沫、喷溅、船/鲸尾流、焦散、水线/水下和折射 | [OceanFFT](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/ocean/OceanFFT.js)、[WaterMaterial](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/ocean/WaterMaterial.js) |
| 天空 | 散射、太阳/月亮/星空、体积云、云影与空气透视，时段影响天空和照明 | [Atmosphere](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/sky/Atmosphere.js)、[App](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/App.js) |
| 世界 | 地形、村落、码头、礁、植被、鱼、鸟、蟹与鲸，配合动画和空间声音 | [App](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/App.js) |
| 玩家与船 | 步行、涉水、游泳、潜水、甲板行走、掌舵、第一/第三人称与自由相机 | [Player](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/player/Player.js)、[BoatController](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/player/BoatController.js) |
| 钓鱼 | 18 种鱼、咬钩、张力搏鱼、记录、出售和装备升级 | [Game](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/Game.js)、[FishTable](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/FishTable.js) |
| 后处理 | 阴影、GTAO、时间升采样、Bloom、曝光、运动模糊与镜头水滴 | [PostFX](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/post/PostFX.js) |

表格描述上游源码能力。工作台已实际启动同一原生渲染器，但没有逐项验收表内所有游戏机制。上游视觉示例：[码头金色时段](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/docs/screenshot.jpg)、[午后海滩](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/docs/screenshot-beach.jpg)。[本地工作台截图](../assets/workbench-desktop.png) 来自真实 WebGPU 浏览器运行。

## 海浪原理

OceanFFT.js 用 Tessendorf 方法与 Horvath/JONSWAP 频谱表达不同尺度波浪。默认四个级联，每级 256×256；行/列两个核心 GPU compute dispatch 完成频谱演化与逆 FFT，输出位移和导数纹理。此外还有初始化与 mipmap dispatch，不能把整个水系统概括为仅两次 GPU 调用。网格采样位移发生形变，导数参与法线/泡沫，WaterMaterial 处理天空反射、屏幕空间反射、单独折射通道、吸收和散射。

它是面向实时图形的近似，不是逐滴求解或完整三维 Navier–Stokes CFD，不能用于海岸工程、水动力预测或船舶认证。[OceanFFT](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/ocean/OceanFFT.js)、[WaterMaterial](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/ocean/WaterMaterial.js)

ShoreSim 在主海滩的 GPU 纹理中保存水上泡沫、沙地湿度、退水后泡沫和流速，配合岸浪/喷溅表达冲岸与回流。任意改地形并不会自动重建全部岸线系统。[ShoreSim](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/ocean/ShoreSim.js)

## 天空、光照与性能

Atmosphere 实现 Hillaire 2020 方案：Rayleigh、Mie 与臭氧吸收，通过透射率、多次散射和天空视图 LUT 减少重复计算。App 按时段更新太阳和主光源。固定版本默认用 SkyProClouds，`?oldClouds` 才选择旧 Clouds；体积云依靠噪声密度、光线步进和时间复用。[Atmosphere](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/sky/Atmosphere.js)、[App](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/App.js)

App 组装 GPU、地形、阴影、折射、水面、玩家和后处理；PostFX 合成 HDR、速度、AO、水下/水线、时间升采样、Bloom、调色与色调映射。LOD、impostor 和内部渲染分辨率减少几何/像素成本；首次 pipeline 预编译有启动开销。[App](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/App.js)、[PostFX](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/post/PostFX.js)

## 游戏机制和存档

- **咬钩**：水深、距礁/码头距离形成栖息地权重，结合时段和稀有度抽样；不是可见鱼经过生态 AI 自主咬钩。[Bites](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/Bites.js)
- **搏鱼**：张力、距离、体力和冲刺的数值状态机；持续过载断线，过松或放完线逃鱼。[CatchMinigame](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/CatchMinigame.js)
- **探鱼器**：地形深度与栖息地丰富度估计，不是声纳仿真或真实鱼群计数。[Game](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/Game.js#L297)
- **船**：GPU 水面查询、采样点近似浮力/阻尼、推进/舵力/接触，120 Hz 半隐式 Euler；不替代工程级船舶验证。[BoatController](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/player/BoatController.js)
- **存档**：原版 localStorage 的 tidewater.save.v1 保存钱、鱼舱、记录、升级、燃料，不保存完整世界/玩家位置，无账号/云同步证据。工作台配置独立保存。[GameState](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/src/game/GameState.js)

## 程序生成、资产与 Opus

世界组合代码生成的地形/布局/部分模型、Poly Haven 扫描道具与纹理、Microsoft Rocketbox 角色动作和 Freesound CC0 录音。鲸由上游程序脚本生成，侧影参考 NOAA 公共领域插图。因此不是“模型从零生成了全部美术资产”。各资产许可见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

仓库介绍写 “Coastal town built with Opus 5.5”。这是作者对开发工具的描述；源码不能证明生成比例、迭代次数或模型独立完成全部项目，也没有证据表明游戏运行时调用 Opus。

产品中的真实 LLM 可将需求变为有限动作、选择模板/资产、解释改动。图形模块负责画面，校验与历史负责执行。当前只有本地指令解析；模型需另接后端。[建议协议](product-design.md#真实模型的建议接入协议尚未实现)

证据：[仓库介绍](https://github.com/dgreenheck/tidewater)、[CREDITS](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/CREDITS.md)、[LICENSE](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/LICENSE)。

## 本地工作台与迁移方向

当前产品范围是固定海岛、原船和新增五个演示资产（灯塔、两小屋、两棕榈）。原村落/地形不编辑；预设只切换环境，镜头独立选择。对象移动不自动重建碰撞、灯光、岸线或游戏规则；新增物体没有碰撞和导航。雨天、任意新地形未接入。场景 JSON 中的 `seed: 42` 为保留字段，未连接到原版地形或所有随机系统，不可据此宣称确定性世界生成。

本地实现已经建立对象选择（列表/视图点击）、变换与隐藏/锁定、环境控制、镜头、撤销/重做、独立 localStorage、JSON 文件和 PNG 导出。工作台编辑时固定船姿态，避免船控制器在下一帧覆盖编辑位置；进入漫游恢复游戏控制。保存只覆盖已注册编辑状态，不冻结海浪、动物、玩家位置和游戏经济。

以下是产品推断，不是已验证需求或现有功能。

| 用途 | 可迁移部分 | 需要新增 |
| --- | --- | --- |
| 海岛主题交互展示 | 海水、天空、镜头和本地编辑闭环 | 展示模板、品牌内容、发布/嵌入、共享权限 |
| 虚拟拍摄/分镜 | 动态环境与自由相机 | 时间轴、关键帧、确定性回放、视频 |
| 产品配置器 | 模型、材质、照明、交互 | 商品资产、组合约束、BOM/报价 |
| 设备操作培训 | 玩家、热点、状态机 | 设备模型、操作规则、成绩、专家校核 |
| 动态空间叙事 | 可探索世界、动画、热点 | GIS/轨迹、时间同步、来源说明 |
| 固定玩法小游戏 | 输入、HUD、状态、存档 | 关卡模板、内容约束、可完成性验证 |

## 约束与实验记录

上游要求 WebGPU 浏览器和可用 GPU。60 fps 是 Apple M5 Pro、2560×1267 的作者目标，不是普遍保证。首次编译数百 shader 可能超过一分钟；资源、浏览器/驱动和效果影响体验。

| 日期 | 检查 | 结果 | 证据 |
| --- | --- | --- | --- |
| 2026-10-04 | 固定源码入口、游戏、海水/天空/后处理与许可 | 已核对源码，不等于运行验证 | 上文固定 SHA 链接 |
| 2026-10-04 | 上游源文件和资源完整性 | 348 个文件 SHA-256 比对一致 | [校验清单](../checks/upstream-manifest.json) |
| 2026-10-04 | Chrome 默认后端，Intel Gen12lp，1440×1000 页面 | 19 项检查通过：真实原生渲染、环境/几何编辑、历史/锁定、镜头、存储、实际 JSON 文件导入导出/错误保护、新建恢复、视图拾取、PNG 读回和移动页面布局；无网页错误或缺失资源 | [浏览器记录](../checks/browser-results.json)、[桌面截图](../assets/workbench-desktop.png) |
| 2026-10-04 | 状态协议与仓库检查 | 12 项场景核心、16 项仓库测试通过 | [场景测试](../checks/scene-core.test.mjs) |
| 2026-10-04 | 显式 D3D12/D3D11、软件适配器 | 前者尝试曾驱动挂起，软件资源上限不足；不构成兼容保证 | 工作台保留真实错误报告，默认后端实测通过 |
| 2026-10-04 | 帧率与跨设备性能 | 未作系统基准，不发布 FPS 保证 | 需更多设备、分辨率与效果组合测试 |

为让本机编辑可用，适配器采用每次等待一个 GPU 帧完成的循环，禁用运动模糊；默认入口为 `?fly&noAudio&noHaze&scale=0.5`。关闭海雾和降低内部比例是本地兼容配置，不是上游所有效果均开启的性能结果。原始 `src/` 未修改。

编辑 UI 的配置成功不等于 3D 渲染成功，两者分别验证。GPU/资源错误真实报告，不用替代场景伪装就绪。

