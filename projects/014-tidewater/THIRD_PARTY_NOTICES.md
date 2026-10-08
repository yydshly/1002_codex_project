# 第三方来源与许可声明

本项目使用或研究 [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater) 的源码与资源，基线 commit 为 4811ba48d795197de5621985f404e765c0b7c0ef。本声明不替代资源目录中的详细许可。

## Tidewater 代码

上游 [LICENSE](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/LICENSE) 全文：

    MIT License
    
    Copyright (c) 2026 DRG Software Solutions LLC
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    

## 资产与衍生实现

| 内容 | 来源与许可 | 原始声明 |
| --- | --- | --- |
| 42 条声音录音 | Freesound；CC0 1.0 | [audio/CREDITS](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/public/audio/CREDITS.md) 列明录制者 |
| 海滩扫描道具 | Poly Haven；CC0 1.0 | 枯木、树枝、贝壳，经 LOD 简化：[debris/CREDITS](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/public/models/debris/CREDITS.md) |
| 摊位模型/纹理 | Poly Haven；CC0 1.0 | 经尺寸/网格处理：[props/CREDITS](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/public/models/props/CREDITS.md) |
| Joe / Marta 角色和动作 | Microsoft Rocketbox；MIT，© Microsoft Corporation | Wood_Male_01、Female_Adult_04 和 idle/talk/wave/shrug 动作经转换、重定向和烘焙；保留 LICENSE-Rocketbox.md，见 [Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) |
| 招牌字体 | Permanent Marker：Apache 2.0；Cabin Sketch / Oswald：SIL OFL 1.1 | 上游 tools/props/fonts/ 含许可 |
| 页面字体 | Inter / JetBrains Mono；SIL OFL 1.1 | 原版通过 Google Fonts 运行时加载；本地研究页使用系统字体 |
| SMAA 纹理/部分 SMAA、FXAA 移植 | three.js 和参考实现；MIT | 自有引擎不改变衍生材料的归属，详见 CREDITS |
| 鲸模型 | Tidewater 自有程序脚本 | 上游声明比例参考公开解剖信息，侧影参考 NOAA 公共领域插图；参考照片未收入仓库 |
| 云方案 | DRG Software Solutions 自有 Sky Pro WebGPU | 上游声明 Clouds.js 的噪声/照明/采样由权利人以本仓库 MIT 发布 |
| 开发工具 | Vite；MIT | 上游 npm 开发依赖，其他实际新增依赖依其各自许可 |

完整清单和技术参考见 [固定版本 CREDITS.md](https://github.com/dgreenheck/tidewater/blob/4811ba48d795197de5621985f404e765c0b7c0ef/CREDITS.md)。模型、声音与字体保留各自许可，不将全部资产概括为“全 MIT”。

## 技术文献

上游列出 Tessendorf 海浪、Hillaire 大气、Nubis 云、运动模糊、Bloom、RCAS、SMAA/FXAA、Evan Wallace 焦散和 Horizon Forbidden West 破浪等参考。引用说明思路来源，不代表作者/机构背书。上游说明没有包含论文代码。

## 本地改动

当前页写实材质实验另使用 Three.js r180（MIT，许可保留在 `web/realistic/vendor/LICENSE`）与 Poly Haven CC0 素材：五套沙地／草地／岩地／灰泥／木材 PBR 纹理、扫描岩石、Bermuda 草簇及日间／日落 HDRI。逐项作者、原始链接、许可证、文件大小和哈希见 [新增素材清单](web/realistic/assets/manifest.json)。素材本身不是本项目或模型原创；建筑、地形组装与渲染代码由本轮编码模型实现。

本地新增工作台界面、编辑状态、独立同源适配器和五个程序几何演示资产（灯塔、两小屋、两棕榈）。原版渲染和资源保留来源；`web/runtime/LICENSE`、`web/runtime/CREDITS.md`、音频/道具/扫描资源的 CREDITS 及 Rocketbox 许可已保留。上游 `src/` 和纳入的静态资源未修改，348 个来源文件的 SHA-256 记录见 [校验清单](checks/upstream-manifest.json)。本地适配器调整默认效果和编辑生命周期，不代表上游作者发布的产品。

原工作台和研究页使用系统字体；原工作台文字指令继续采用本地规则解析。新增创作页第 06 步通过浏览器调用 Microsoft 官方 TRELLIS.2 图片到 3D 服务。README 与网页中的工作台截图来自本机实际运行，包含上游场景和资源的渲染呈现，应与上述来源声明一起保留。

## 新增神经模型资产与参考图

2026-10-05，本轮通过 [Microsoft 官方 TRELLIS.2 Hugging Face Space](https://huggingface.co/spaces/microsoft/TRELLIS.2)，使用 [microsoft/TRELLIS.2-4B](https://huggingface.co/microsoft/TRELLIS.2-4B) 实际生成一间小屋的精细 GLB。官方 [模型卡](https://huggingface.co/microsoft/TRELLIS.2-4B) 与 [代码仓库](https://github.com/microsoft/TRELLIS.2) 标明模型/代码采用 MIT；官方代码许可另保留在 [TRELLIS-LICENSE.txt](assets/neural-service/TRELLIS-LICENSE.txt)。这些声明说明模型及软件来源，不自动把本项目的参考图、生成输出或混合场景认定为 CC0。

| 内容 | 实际来源与记录 |
| --- | --- |
| [小屋参考 PNG](web/assets/neural/cabin-reference-v1.png) | 本轮内置图像生成工具创建；用于表达外观和作为 TRELLIS.2 的图片条件，不是扫描资产或最终 3D |
| [小屋 GLB](web/assets/neural/cabin-generated-v1.glb) | 官方 TRELLIS.2-4B 从该图片生成几何与 PBR 材质；不是编码模型程序小屋，也不是 Poly Haven 素材 |
| 生成模型及软件 | Microsoft TRELLIS.2，MIT；[官方模型卡](https://huggingface.co/microsoft/TRELLIS.2-4B)、[官方代码](https://github.com/microsoft/TRELLIS.2) |
| 参数、任务与输出归属记录 | [cabin-generated-v1.manifest.json](web/assets/neural/cabin-generated-v1.manifest.json)；生成任务 `7731f838b77c48b69c074368a1cc8bdd`，导出任务 `ecf4025051ef4bf0b6382b2c1e3551e4` |
| 环境及其余对象 | 沿用前述 Tidewater、Three.js、程序资产及 Poly Haven 素材，各自来源与许可保持独立 |

本轮 GLB 含 98,320 个三角形、80,777 个顶点与两张内嵌 WebP PBR 纹理，4,859,472 bytes；文件 SHA-256 为 `c27086b4b585e3a9a90f969cb51d6df570526f8e720c4d696fa937c650bcc435`。参考图片 SHA-256、实际模型版本与参数也保存在上述任务清单中。当前接口仅以图片生成，文字要求作为任务记录；未声称 Opus 自身生成图片或 3D。

网页载入已有本地 GLB 不会再次调用生成服务。用户选择 Microsoft 官方服务并提交新参考图时，浏览器直接访问官方 Space；服务的额度、可用性与条款来自该提供方。新增“本机 GPU · TripoSR”选项使用本机隔离服务处理图片，来源与任务另行记录。本项目没有把匿名公开演示当作稳定商业服务。生成结果与参考图的来源单独保存，不将“模型 MIT”“Poly Haven CC0”概括套用到所有输出。

## 整场景实验新增参考与本地重建

本轮为棕榈、灯塔与船分别制作单对象参考图，实际使用内置图像生成工具；它们是外观条件，不是扫描素材或已经生成的三维网格。文件分别为 [palm-reference-v1.png](web/assets/neural/palm-reference-v1.png)、[lighthouse-reference-v1.png](web/assets/neural/lighthouse-reference-v1.png) 和 [boat-reference-v1.png](web/assets/neural/boat-reference-v1.png)。完整提示词、工具与透明背景要求保留在 [world-reference-prompts-v1.json](assets/neural-service/world-reference-prompts-v1.json)。

本地重建环境已在项目独立目录 `assets/neural-service/local-triposr/` 中配置，不修改全局 Python；本机 NVIDIA GeForce RTX 4070 Laptop GPU 已实际完成棕榈、灯塔和船的 CUDA 推理。使用 [Tripo AI / Stability AI 官方 TripoSR 代码](https://github.com/VAST-AI-Research/TripoSR) 与 [stabilityai/TripoSR 模型权重](https://huggingface.co/stabilityai/TripoSR)，权重版本为 `5b521936b01fbe1890f6f9baed0254ab6351c04a`。官方代码和预训练模型采用 MIT；许可全文保留在 [TRIPOSR-LICENSE.txt](assets/neural-service/local-triposr/TRIPOSR-LICENSE.txt)，模型元数据另见 [model-meta.json](assets/neural-service/local-triposr/model-meta.json)。

| 本地真实神经产物 | 实际任务与来源记录 |
| --- | --- |
| [palm-generated-v1.glb](web/assets/neural/palm-generated-v1.glb) | 任务 `local-triposr-20261005T033003-palm`；69,534 三角形、一张 1024² RGB PNG；[来源清单](web/assets/neural/palm-generated-v1.manifest.json)保存输入/输出 SHA-256、设备与计时 |
| [lighthouse-generated-v1.glb](web/assets/neural/lighthouse-generated-v1.glb) | 任务 `local-triposr-20261005T033032-lighthouse`；48,290 三角形、一张 1024² RGB PNG；[来源清单](web/assets/neural/lighthouse-generated-v1.manifest.json)保存输入/输出 SHA-256、设备与计时 |
| [boat-generated-v1.glb](web/assets/neural/boat-generated-v1.glb) | 任务 `local-triposr-20261005T034717-boat`；73,264 三角形、一张 1024² RGB PNG；[来源清单](web/assets/neural/boat-generated-v1.manifest.json)保存输入/输出 SHA-256、设备与计时 |

TripoSR 输出形状与 RGB 基础色，不生成独立的法线、粗糙度或金属度贴图；本地渲染材质的粗糙度/金属度使用明确的程序常量，与 TRELLIS.2 小屋的 PBR 输出不同。棕榈的薄叶片被重建为粗厚树冠，未达到写实验收要求；默认画面保留的细叶片是原程序几何，可以切换查看真实神经树冠。两种来源不能混称为神经生成，网格已载入也不表示视觉验收通过；灯塔和船的背面、结构及场景衔接也需继续检查。

连同此前小屋，本轮共四种实际生成资产；[整场景清单](web/assets/neural/world-assets-v1.json)记录每种 GLB 的来源、字节数与 SHA-256。保存的布局有 17 个物体标记，复用为一间小屋、一座灯塔、七艘船和八棵棕榈。全部载入时有 17 份神经候选，默认显示九份，另八棵棕榈使用原程序细叶片。候选实例数、画面可见数与独立推理产物数分别记录。

为适应本机 Windows 环境，本地适配器将等值面提取换为 CPU scikit-image marching cubes，并调整纹理查询数据在 CPU/CUDA 之间的传递；神经权重与密度查询仍使用官方模型。逐项修改的原始/修改后 SHA-256 及说明保存在 [upstream-adaptations.json](assets/neural-service/local-triposr/upstream-adaptations.json)。这些适配不构成由程序模型替代神经推理的记录。

新增整场景任务明确区分神经生成模型、扫描资产与程序几何；同种物体复用一份 GLB 时保留同一个资产 ID，不能将实例数量当成推理次数。新增环境模块继续使用前述 Poly Haven CC0 PureSky HDR、地面纹理、草簇与岩石；天空背景是实拍全景，水面与泡沫是本地着色近似，不另称为神经生成资产。生成参考图、模型输出和混合场景的归属分别保留，不统一概括为 CC0。

