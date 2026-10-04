# 多项目 Web 展示与发布

本仓库将多个静态 Web 汇总到同一个 GitHub Pages 站点，按项目编号分配独立子路径。

| 内容 | 发布后地址 |
| --- | --- |
| 总索引 | `https://yydshly.github.io/1002_codex_project/` |
| 001 · Cult UI | `https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/` |
| 006 · text-to-cad | `https://yydshly.github.io/1002_codex_project/projects/006-text-to-cad/` |
| 008 · PDoomVideo | `https://yydshly.github.io/1002_codex_project/projects/008-pdoom-video/` |
| 008 · 理解总览与引导图 | `https://yydshly.github.io/1002_codex_project/projects/008-pdoom-video/overview.html` |
| 009 · shadcn-admin | `https://yydshly.github.io/1002_codex_project/projects/009-shadcn-admin/` |
| 002 项目 | `https://yydshly.github.io/1002_codex_project/projects/002-slug/` |

总入口、001、006、008 和 009 项目是站点的配置地址；002 行展示后续项目的路径格式。006 发布可独立阅读的静态理解总览、生成的引导图和实测报告；实时 CAD 查看与运动操作按页面说明在本机启动。008 发布完整能力实验室、理解总览与引导图、元素驱动控制台和六秒真实场景样例。009 发布 shadcn-admin 的八类模块、复用原理、业务适配、后续价值与边界说明，并沿用我们整理的理解引导图，提供 PNG / SVG 下载。仓库 Pages 已配置为 GitHub Actions 发布。GitHub Pages 每个仓库只有一个站点，因此这里使用多个子目录承载各项目的静态输出。参考 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 配置子项目

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

官方配置说明：[使用 GitHub Actions 发布 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
