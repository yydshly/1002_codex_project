# GitHub 项目研究库

记录近期发现的优秀 GitHub 项目：理解设计思路、复现核心能力、整理研究结论，并按需提供 Web 演示。

这里是总入口。每个子项目都有固定编号、独立研究文档、图片和可选演示；首页只保留摘要与索引，具体分析放在子项目内。

## 子项目索引

编号按加入顺序递增，归档后保留编号。目录、README 和展示网站使用同一份 [项目清单](projects/catalog.json)。

<!-- PROJECTS:START -->
| 编号 | 子项目 / 研究文档 | 摘要 | 状态 | 上游 | Web |
| --- | --- | --- | --- | --- | --- |
| 001 | [Cult UI · 组件能力与原理实验室](projects/001-cult-ui/README.md) | 可复制和修改的 React 界面与动效源码库，137 个组件覆盖 AI 输入/结果、工作台、表单、导航、反馈、引导、按钮卡片、官网、插画、设备媒体、文字与背景。通过 React 状态、Tailwind/CSS/SVG，结合 Motion、Canvas/WebGL 实现；用于 React 官网、作品集、AI/SaaS 与后台，帮助快速搭界面、复用交互和学习原理，业务后端需自行接入。 | 已完成 | [源码](https://github.com/nolly-studio/cult-ui) | [演示](https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/) |
| 002 | [Upscayl 图片超分辨率研究](projects/002-upscayl/README.md) | 本地 AI 图片放大与细节增强工具。以预训练视觉模型、NCNN 和 Vulkan GPU 推理实现单张及批量处理；用于素材加工、脚本自动化和学习模型产品化，预测细节不等于恢复真实信息。 | 已完成 | [源码](https://github.com/upscayl/upscayl) | — |

### 001 · Cult UI · 组件能力与原理实验室

可复制和修改的 React 界面与动效源码库，137 个组件覆盖 AI 输入/结果、工作台、表单、导航、反馈、引导、按钮卡片、官网、插画、设备媒体、文字与背景。通过 React 状态、Tailwind/CSS/SVG，结合 Motion、Canvas/WebGL 实现；用于 React 官网、作品集、AI/SaaS 与后台，帮助快速搭界面、复用交互和学习原理，业务后端需自行接入。

[![Cult UI 全能力地图：137 个组件、源码分发、底层技术、效果方向、应用场景、个人价值与选用路径](projects/001-cult-ui/assets/cult-ui-capability-map.png)](projects/001-cult-ui/README.md)

### 002 · Upscayl 图片超分辨率研究

本地 AI 图片放大与细节增强工具。以预训练视觉模型、NCNN 和 Vulkan GPU 推理实现单张及批量处理；用于素材加工、脚本自动化和学习模型产品化，预测细节不等于恢复真实信息。

[![Upscayl 能力与原理总览：应用能力、上游训练、本机 GPU 推理、技术关键词、后期价值与能力边界](projects/002-upscayl/assets/upscayl-overview.png)](projects/002-upscayl/README.md)
<!-- PROJECTS:END -->

## 添加项目

需要 Node.js 22.12 或更新版本；管理脚本无需安装依赖，框架子项目需要先安装各自依赖。

```bash
npm run new -- --slug example-repo --name "项目名称" --repo "https://github.com/owner/repo" --summary "一句话说明研究价值"
```

脚本自动分配下一个编号，例如 `001-example-repo`，创建研究文档、图片目录和 Web 目录，并更新上方索引。命令中的名称和地址是占位示例，请替换为实际项目。

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
- 记录上游仓库、研究时的版本或 commit、许可证，以及本仓库做了哪些改动。
- 总 README 保持摘要；图片存入对应子项目的 `assets/`，完整分析写在项目文档和研究笔记中。
- 复现前写清环境、运行命令和验证结果；尚未验证的结论明确标注。

详细说明见 [项目管理指南](docs/project-guide.md)。
