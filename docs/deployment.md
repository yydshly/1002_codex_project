# 多项目 Web 展示与发布

本仓库将多个静态 Web 汇总到同一个 GitHub Pages 站点，按项目编号分配独立子路径。

| 内容 | 发布后地址 |
| --- | --- |
| 总索引 | `https://yydshly.github.io/1002_codex_project/` |
| 001 项目 | `https://yydshly.github.io/1002_codex_project/projects/001-slug/` |
| 002 项目 | `https://yydshly.github.io/1002_codex_project/projects/002-slug/` |

上面是规划地址与路径示例，初始化时尚未启用或部署网站。GitHub Pages 每个仓库只有一个站点，因此这里使用多个子目录承载各项目的静态输出。参考 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 配置子项目

静态输出目录必须位于对应的 `projects/<编号>-<slug>/` 内，并包含 `index.html`。在清单中设置 `publishDir` 后，总构建会将整个目录复制到 `_site/projects/<编号>-<slug>/`。

```json
{
  "publishDir": "projects/001-slug/web/dist",
  "demo": null
}
```

- 纯静态项目可以直接使用 `web/`。
- 框架应用先运行自己的构建命令，再运行根目录的 `npm run build`。根构建只汇总静态输出；请在发布工作流的总构建步骤前加入该应用的安装与构建步骤。
- 设置资源基础路径 `/1002_codex_project/projects/001-slug/`，或使用相对资源路径。单页应用使用 hash 路由，或自行处理直接访问路由时的 404。
- GitHub Pages 托管 HTML/CSS/JS 等静态文件，后端和数据库需要另行部署；可用 `demo` 指向完整的外部应用。
- `demo` 优先用作索引入口；`publishDir` 若同时存在，仍会被构建和发布。

## 本地预览

```bash
npm run build
python -m http.server 8000 --directory _site
```

打开 `http://localhost:8000/` 查看总入口。使用绝对 base 路径的应用，需要在与实际发布路径一致的本地服务下测试。

## 首次发布

1. 将初始化代码推送到远端 `main`。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 并执行。
4. 工作流完成后，使用部署记录提供的实际 URL 验证入口、截图和子项目。

部署工作流采用手动触发。后续更新清单、截图或 Web 后，重新运行该工作流即可发布。普通 push 和 PR 只运行检查。

官方配置说明：[使用 GitHub Actions 发布 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
