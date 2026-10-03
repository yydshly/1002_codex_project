# GitHub 项目研究库

记录近期发现的项目与网站：理解设计思路、复现核心能力、整理研究结论，并按需提供 Web 演示。

这里是总入口。每个子项目都有固定编号、独立研究文档、图片和可选演示；首页只保留摘要与索引，具体分析放在子项目内。

## 子项目索引

编号按加入顺序递增，归档后保留编号。目录、README 和展示网站使用同一份 [项目清单](projects/catalog.json)。

<!-- PROJECTS:START -->
| 编号 | 子项目 / 研究文档 | 摘要 | 状态 | 来源 | Web |
| --- | --- | --- | --- | --- | --- |
| 001 | [Cult UI · 组件能力与原理实验室](projects/001-cult-ui/README.md) | **能力：** 可复制和修改的 React 界面与动效源码集合；137 个组件覆盖 AI 输入与结果、工作台、表单、导航、反馈、引导、官网、插画、媒体、文字与背景。<br>**原理：** 通过 React 状态、Tailwind / CSS / SVG，结合 Motion、Canvas / WebGL 实现交互与视觉效果；组件源码复制进自己的项目后可直接修改。<br>**使用场景：** React 官网、作品集、AI / SaaS 产品界面与后台工作台。<br>**价值：** 快速搭建界面、复用交互并学习动效实现；完整中文目录、真实示例与原理证据帮助选型。<br>**边界：** 业务后端、模型 API、鉴权与持久化需自行接入。 | 已完成 | [Cult UI](https://github.com/nolly-studio/cult-ui) | [演示](https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/) |
| 002 | [Upscayl 图片超分辨率研究](projects/002-upscayl/README.md) | **能力：** 本地 AI 图片放大与细节增强，支持单张和文件夹批量处理。<br>**原理：** 调用预训练视觉模型，通过 NCNN 与 Vulkan GPU 在本机执行推理，放大图片并预测细节。<br>**使用场景：** 设计、展示与打印素材加工，以及重复图片处理的自动化。<br>**价值：** 改善素材交付尺寸，并学习如何把模型、显卡计算、文件管理与任务界面组合成产品。<br>**边界：** 预测纹理不等于恢复真实信息；本项目尚未实测图片质量或显卡性能。 | 已完成 | [Upscayl](https://github.com/upscayl/upscayl) | — |
| 003 | [sprite-gen · 精灵素材能力实验室](projects/003-sprite-gen/README.md) | **能力：** 制作与整理透明动图、精灵图集和帧数据；支持抠图、切帧、对齐、循环选择、换色、导出，以及动画与背景合成。<br>**原理：** 动作来自外部视频模型、多姿势图像模型，或已有帧与有限代码形变；Python、Pillow、NumPy、FFmpeg 加工资源，按时间、位置和图层合成。<br>**使用场景：** 2D 游戏原型、网页与桌面角色、贴纸、视频包装、短场景和素材库整理。<br>**价值：** 复用素材、减少批量整理，并学习“模型生成—算法加工—人工整理—资源交付”的制作流程，为后续角色动效与素材工具提供参考。<br>**边界：** 复杂动作仍需验收；本机验证了已有素材的后处理，未调用 AI 生成或运行场景渲染，网页提供研究与效果展示。 | 已完成 | [sprite-gen](https://github.com/aldegad/sprite-gen) | [演示](https://yydshly.github.io/1002_codex_project/projects/003-sprite-gen/) |
| 005 | [Jianying Headless · 配置驱动的初步剪辑](projects/005-jianying-headless/README.md) | **能力：** 以结构化 JSON 计划执行初步剪辑；Mac 生成可编辑剪映工程与原生 MP4，Windows 输出 MP4。<br>**原理：** Mac 适配剪映私有草稿格式与内部接口；Windows 将计划转成 FFmpeg 滤镜图和公开命令行调用。<br>**使用场景：** 口播粗剪、模板化批量制作，以及 AI 剪辑决定向人工编辑工程交接。<br>**价值：** 参考“配置驱动执行、AI 决策外接、人工精修”的自动化剪辑流程。<br>**当前结论：** 当前仅作方向参考，暂不深入研究或集成；尚未在本机运行，Mac 路径依赖匹配的剪映与运行环境。 | 已归档 | [Jianying Headless](https://github.com/mcncarl/jianying-headless) | — |
| 007 | [X-Twitter-Downloader · 视频下载产品参考](projects/007-x-twitter-downloader/README.md) | **能力：** 解析公开 X 帖子的媒体信息，列出已有视频版本并提供下载入口。<br>**原理：** 链接经解析接口获取媒体元数据与视频地址，用户选择版本后请求媒体文件；具体后台实现尚未确认。<br>**使用场景：** 公开视频下载、链接解析与多版本选择产品。<br>**价值：** 借鉴链接输入、版本选择、下载与失败反馈流程，指导后期视频下载产品开发。<br>**当前结论：** 基础解析与下载技术已成熟，当前不继续深入研究，按产品参考归档。 | 已归档 | [X-Twitter-Downloader](https://x-twitter-downloader.com/zh-CN) | — |

### 001 · Cult UI · 组件能力与原理实验室

**能力：** 可复制和修改的 React 界面与动效源码集合；137 个组件覆盖 AI 输入与结果、工作台、表单、导航、反馈、引导、官网、插画、媒体、文字与背景。

**原理：** 通过 React 状态、Tailwind / CSS / SVG，结合 Motion、Canvas / WebGL 实现交互与视觉效果；组件源码复制进自己的项目后可直接修改。

**使用场景：** React 官网、作品集、AI / SaaS 产品界面与后台工作台。

**价值：** 快速搭建界面、复用交互并学习动效实现；完整中文目录、真实示例与原理证据帮助选型。

**边界：** 业务后端、模型 API、鉴权与持久化需自行接入。

[![Cult UI 全能力地图：137 个组件、源码分发、底层技术、效果方向、应用场景、个人价值与选用路径](projects/001-cult-ui/assets/cult-ui-capability-map.png)](projects/001-cult-ui/README.md)

### 002 · Upscayl 图片超分辨率研究

**能力：** 本地 AI 图片放大与细节增强，支持单张和文件夹批量处理。

**原理：** 调用预训练视觉模型，通过 NCNN 与 Vulkan GPU 在本机执行推理，放大图片并预测细节。

**使用场景：** 设计、展示与打印素材加工，以及重复图片处理的自动化。

**价值：** 改善素材交付尺寸，并学习如何把模型、显卡计算、文件管理与任务界面组合成产品。

**边界：** 预测纹理不等于恢复真实信息；本项目尚未实测图片质量或显卡性能。

[![Upscayl 能力与原理总览：应用能力、上游训练、本机 GPU 推理、技术关键词、后期价值与能力边界](projects/002-upscayl/assets/upscayl-overview.png)](projects/002-upscayl/README.md)

### 003 · sprite-gen · 精灵素材能力实验室

**能力：** 制作与整理透明动图、精灵图集和帧数据；支持抠图、切帧、对齐、循环选择、换色、导出，以及动画与背景合成。

**原理：** 动作来自外部视频模型、多姿势图像模型，或已有帧与有限代码形变；Python、Pillow、NumPy、FFmpeg 加工资源，按时间、位置和图层合成。

**使用场景：** 2D 游戏原型、网页与桌面角色、贴纸、视频包装、短场景和素材库整理。

**价值：** 复用素材、减少批量整理，并学习“模型生成—算法加工—人工整理—资源交付”的制作流程，为后续角色动效与素材工具提供参考。

**边界：** 复杂动作仍需验收；本机验证了已有素材的后处理，未调用 AI 生成或运行场景渲染，网页提供研究与效果展示。

[![sprite-gen 能力与原理全景图：三种动作来源、输入输出、图像算法、背景场景、技术底座与需开发的扩展方向](projects/003-sprite-gen/assets/capabilities-principles-map.png)](projects/003-sprite-gen/README.md)

### 005 · Jianying Headless · 配置驱动的初步剪辑

**能力：** 以结构化 JSON 计划执行初步剪辑；Mac 生成可编辑剪映工程与原生 MP4，Windows 输出 MP4。

**原理：** Mac 适配剪映私有草稿格式与内部接口；Windows 将计划转成 FFmpeg 滤镜图和公开命令行调用。

**使用场景：** 口播粗剪、模板化批量制作，以及 AI 剪辑决定向人工编辑工程交接。

**价值：** 参考“配置驱动执行、AI 决策外接、人工精修”的自动化剪辑流程。

**当前结论：** 当前仅作方向参考，暂不深入研究或集成；尚未在本机运行，Mac 路径依赖匹配的剪映与运行环境。

[![Jianying Headless 配置驱动初剪理解图：Mac 剪映逆向适配、Windows FFmpeg 公开接口、能力环境场景与当前参考价值](projects/005-jianying-headless/assets/jianying-headless-overview.png)](projects/005-jianying-headless/README.md)
<!-- PROJECTS:END -->

## 添加项目

需要 Node.js 22.12 或更新版本；管理脚本无需安装依赖，框架子项目需要先安装各自依赖。

```bash
npm run new -- --slug example-repo --name "项目名称" --repo "https://github.com/owner/repo" --source-name "来源名称" --summary "一句话说明研究价值"
```

脚本自动分配下一个编号，例如 `001-example-repo`，创建研究文档、图片目录和 Web 目录，并更新上方索引。`--repo` 可填写 GitHub 仓库或网站的 HTTPS 地址；`--source-name` 指定索引显示的来源名称，省略时使用项目名称。命令中的名称和地址是占位示例，请替换为实际来源。

后续编辑子项目文档与 `projects/catalog.json`，再运行：

```bash
npm run sync   # 更新 README 的摘要、图片与索引
npm run check  # 检查编号、路径、图片和索引一致性
npm run build  # 生成展示入口与各子项目静态 Web 到 _site/
npm run preview # 启动本地总站预览（默认端口 4173）
```

## 目录结构

```text
projects/
  catalog.json             # 唯一项目清单，按固定编号排序
  001-project-slug/        # 添加首个项目后创建
    README.md              # 项目介绍、来源、图片、复现步骤、结论
    notes/research.md      # 深入分析、实验记录和待验证问题
    assets/                # 截图、封面、架构图等
    web/                   # 可选的 Web 源码或静态演示
templates/project/         # 新项目使用的文档模板
scripts/                   # 编号、索引同步、检查与网站生成
site/                      # 总展示入口的样式
docs/                      # 项目组织与部署约定
.github/workflows/         # 索引检查和手动 Pages 发布
_site/                     # 构建产物，不提交
```

## Web 展示

首个 Cult UI 子项目提供能力图、完整组件目录、真实预览，以及原理、使用场景和选用判断。总索引与子项目通过同一 GitHub Pages 工作流发布，上方 Web 链接指向对应子项目。

首次运行 Cult UI 展示：

```bash
npm --prefix projects/001-cult-ui/web ci
npm run build
npm run preview
```

打开 `http://localhost:4173/projects/001-cult-ui/`。端口被占用时可运行 `node scripts/serve.mjs --port 4187`；本次验证使用 [4187 本地预览](http://localhost:4187/projects/001-cult-ui/)。开发模式可运行 `npm run dev:cult`。

总入口：[GitHub 项目研究库](https://yydshly.github.io/1002_codex_project/)。子项目：[Cult UI 能力与原理实验室](https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/)，各项目使用独立子路径。

支持项目内静态 Web 和外部演示链接。添加应用时再确定技术栈和构建命令，详见 [部署指南](docs/deployment.md)。

## 研究约定

- 编号固定、不复用；研究顺序按编号展示，停止研究时将状态设为“已归档”。
- 记录来源名称与链接；仓库来源记录研究版本或 commit、许可证，网站来源记录访问日期、实测范围与证据。
- 总 README 保持摘要；图片存入对应子项目的 `assets/`，完整分析写在项目文档和研究笔记中。
- 复现前写清环境、运行命令和验证结果；尚未验证的结论明确标注。

详细说明见 [项目管理指南](docs/project-guide.md)。
