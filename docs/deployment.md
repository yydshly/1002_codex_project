# 多项目 Web 展示与发布

本仓库将多个静态 Web 汇总到同一个 GitHub Pages 站点，按项目编号分配独立子路径。

| 内容 | 发布后地址 |
| --- | --- |
| 总索引 | `https://yydshly.github.io/1002_codex_project/` |
| 全部网页索引 | `https://yydshly.github.io/1002_codex_project/#web-index` |
| 002 · Upscayl 静态引导图 | `https://yydshly.github.io/1002_codex_project/projects/002-upscayl/` |
| 003 · sprite-gen | `https://yydshly.github.io/1002_codex_project/projects/003-sprite-gen/` |
| 004 · Three.js 海岸花园 | `https://yydshly.github.io/1002_codex_project/projects/004-threejs-worlds/` |
| 010 · Ix | `https://yydshly.github.io/1002_codex_project/projects/010-ix/` |
| 011 · ATELIER | `https://yydshly.github.io/1002_codex_project/projects/011-solaris/` |
| 001 · Cult UI | `https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/` |
| 006 · text-to-cad | `https://yydshly.github.io/1002_codex_project/projects/006-text-to-cad/` |
| 008 · PDoomVideo | `https://yydshly.github.io/1002_codex_project/projects/008-pdoom-video/` |
| 008 · 理解总览与引导图 | `https://yydshly.github.io/1002_codex_project/projects/008-pdoom-video/overview.html` |
| 009 · shadcn-admin | `https://yydshly.github.io/1002_codex_project/projects/009-shadcn-admin/` |
| 013 · OmniVoice 中文研究网页 | `https://yydshly.github.io/1002_codex_project/projects/013-omnivoice/` |
| 014 · Tidewater 当前成果与产品思路 | `https://yydshly.github.io/1002_codex_project/projects/014-tidewater/release.html` |
| 014 · 原场景提案工作室 | `https://yydshly.github.io/1002_codex_project/projects/014-tidewater/camp.html` |

上表为当前配置的项目入口，全部子页面以自动生成的总站索引为准。006 发布可独立阅读的静态理解总览、生成的引导图和实测报告；实时 CAD 查看与运动操作按页面说明在本机启动。008 发布完整能力实验室、理解总览与引导图、元素驱动控制台和六秒真实场景样例。009 发布 shadcn-admin 的八类模块、复用原理、业务适配、后续价值与边界说明，并沿用我们整理的理解引导图，提供 PNG / SVG 下载。仓库 Pages 已配置为 GitHub Actions 发布。GitHub Pages 每个仓库只有一个站点，因此这里使用多个子目录承载各项目的静态输出。参考 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 配置子项目

013 发布 OmniVoice 的中文知识汇总，包含能力与输入输出、声音编码与模型权重的区别、双向 Transformer、掩码补全教学交互、训练与推理、部署代码、使用场景和边界。目录封面与网页均沿用我们制作的全量引导图，网页默认展示整图，提供原尺寸 PNG / SVG；静态网页不运行语音模型。

静态输出目录必须位于对应的 `projects/<编号>-<slug>/` 内，并包含 `index.html`。在清单中设置 `publishDir` 后，总构建会将整个目录复制到 `_site/projects/<编号>-<slug>/`。

```json
{
  "publishDir": "projects/001-slug/web/dist",
  "demo": null
}
```

- 纯静态项目可以直接使用 `web/`。
- 根目录 `npm run build` 已包含 Cult UI 子项目构建，再汇总静态输出。首次运行需先执行 `npm --prefix projects/001-cult-ui/web ci`；两个工作流均已包含此步骤。后续新增框架应用时，将其构建命令接入根构建，并在工作流中安装它的依赖。
- 设置资源基础路径 `/1002_codex_project/projects/001-slug/`，或使用相对资源路径。单页应用使用 hash 路由，或自行处理直接访问路由时的 404。
- GitHub Pages 托管 HTML/CSS/JS 等静态文件，后端和数据库需要另行部署；可用 `demo` 指向完整的外部应用。
- `demo` 优先用作索引入口；`publishDir` 若同时存在，仍会被构建和发布。

## 本地预览

014沿用原三岛25对象/17细化物体的场景，发布研究总图、说明、编辑页面、已有GLB与独立工程。根构建先生成`projects/014-tidewater/publish/`，排除重复本机工程和完整早期备份，并提供早期阶段回顾；v3/v5和原场景/六木屋独立提案保留。在线版不运行4198控制模型或4197GPU服务，新生成需要本机启动；已有工程回放不依赖模型服务。

```bash
npm run build
npm run preview
```

打开 `http://localhost:4173/` 查看总入口，`http://localhost:4173/projects/001-cult-ui/` 查看首个子项目。内置 Node 静态服务器只监听本机；端口被占用时，运行 `node scripts/serve.mjs --port 4187`。本次研究的实际验证地址是 `http://localhost:4187/projects/001-cult-ui/`。Cult UI 使用相对 base `./`，已在总站子路径下验证资源加载。

## 发布与更新

1. 将通过本地构建和检查的改动推送到远端 `main`。
2. 确认仓库 **Settings → Pages → Build and deployment → Source** 为 **GitHub Actions**，本仓库已配置。
3. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 并执行。
4. 工作流完成后，使用部署记录提供的实际 URL 验证总索引、能力图、子项目与组件预览。

部署工作流采用手动触发。后续更新清单、截图或 Web 后，重新运行该工作流即可发布。普通 push 和 PR 只运行检查。

总站从发布目录自动发现网页，并提供用途分组、关键词搜索和项目快速定位。`npm run build` 会核验发布后的相对页面链接，`npm run check:web` 可单独复查；`npm run preview` 先构建再启动，避免预览旧 `_site`。每次发布后核对 `web-index.json` 中的在线入口，并确认 GitHub About 的 Website 与 `catalog.siteUrl` 相同。仅有文档的项目不显示在线演示；本机 CAD、模型任务等功能在入口旁标出启动条件。

014 的完整离线提案 ZIP 与 v3/v5 GLB 下载资产位于 [Tidewater 资产发布](https://github.com/yydshly/1002_codex_project/releases/tag/tidewater-assets-2026-10-08)。网页保留渲染所需资源，大文件下载通过 `publishDownloads` 指向 Releases；原始本机数据和历史源码保留，不随构建删除。

官方配置说明：[使用 GitHub Actions 发布 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
