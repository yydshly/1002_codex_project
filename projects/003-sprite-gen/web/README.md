# 003 · sprite-gen 展示页

纯 HTML / CSS / JavaScript，用能力与原理全景图引导阅读，解释三种动作来源、两条正式生成管线、图像算法、背景合成、使用场景、个人价值与扩展方向，并展示上游真实动画和本机无模型调用的后处理结果。

## 本地查看

在仓库根目录运行：

```bash
npm run sync
npm run check
npm run build
npm run preview
```

访问 `http://localhost:4173/projects/003-sprite-gen/`。如果默认端口已占用，可以运行 `node scripts/serve.mjs --port 4193` 后访问相同子路径。本次已验证的预览地址为 `http://localhost:4193/projects/003-sprite-gen/`。

本站新增页面无需安装前端依赖。总构建包含已有 Cult UI 项目的构建步骤，因此首次构建仍需按根 README 安装该项目依赖。

`index.html` 也可直接在浏览器打开；使用相对资源路径，不依赖后端、API key、CDN 或生成服务。GitHub Pages 的发布路径为 `/1002_codex_project/projects/003-sprite-gen/`；配置好静态输出，实际发布需按根仓库部署流程进行。

## 内容与交互

- 能力总览：切换狐狸 / 史莱姆真实动画与素材编辑录屏，切换预览背景。
- 效果与复现：播放真实 CLI 输出图集，暂停、单帧查看与调速，对比色键输入、透明输出和配色变体。
- 流程与原理：在 AI 视频、代码形变与已有素材组装、AI 多姿势图和像素修复之间切换，查看各阶段输入、输出、原理和命令。
- 能力目录：按六类筛选，搜索中文名称、关键词或 CLI 命令。
- 场景与边界：查看建议用途、质量限制与运行条件。
- 价值与扩展：结合实际目标选择输入路线，说明可复用的制作流程与需要新增开发的方向。
- 来源与验证：固定 commit 资料索引、媒体清单、本机执行记录。

上游媒体保存在 `media/`，本机 CLI 输入与输出保存在 `demo/`。`data.js` 为人工整理的研究数据；`demo-data.js` 由已验证的输出矩形和记录提供播放器数据。素材许可与修改范围见上一级 `THIRD_PARTY_NOTICES.md`。

重新运行 CLI 复现后，在本子项目目录执行 `node scripts/sync-demo.mjs`，将真实输出与验证记录同步到页面。
## 本轮理解整理与发布

展示页已将输入、动作来源、原理、输出与个人价值连起来：总览页使用 [能力与原理引导图](media/capabilities-principles-map.png)，流程页解释 AI 视频、代码形变与已有素材、AI 多姿势图三种方式，新增「价值与扩展」，保留真实 CLI 演示和固定来源。

公开部署地址：[sprite-gen 能力与价值研究](https://yydshly.github.io/1002_codex_project/projects/003-sprite-gen/)。仓库使用 GitHub Pages 手动发布流程，完整步骤见 [部署说明](../../../docs/deployment.md)。

引导图发布副本与 assets 原图保持一致；图中扩展项为待开发建议。当前页面为静态解释和播放器，不调用 AI 服务；生成需要上游 Python 环境与相应服务登录。
