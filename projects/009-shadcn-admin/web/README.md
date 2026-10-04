# shadcn-admin 研究网页

`index.html` 是完整中文研究页面；图为我们整理的能力与复用图，不是上游产品截图。没有复制上游应用实现，没有接入真实业务服务。

页面包含八类模块、前端交互与演示边界、实现原理、两种复用方式、任务改订单案例、后续价值、应用方向与源码证据。

## 本地浏览

可以直接打开 `index.html`。在研究库根目录运行 `npm run build` 后，运行 `node scripts/serve.mjs --port 4193`，打开 `http://127.0.0.1:4193/projects/009-shadcn-admin/`。

发布沿用研究库的 GitHub Pages 工作流。将通过检查的内容推送到远端 `main`，运行 `Deploy GitHub Pages`，完成后核验 [线上研究网页](https://yydshly.github.io/1002_codex_project/projects/009-shadcn-admin/) 的内容、图片与下载入口。详细步骤见根目录 `docs/deployment.md`。

## 一张图

- `assets/shadcn-admin-understanding.svg`：可编辑、可放大的矢量图。
- `assets/shadcn-admin-understanding.png`：可下载的高清图片。
- 项目上级 `assets/` 保存同一份图作为 README 和研究库封面来源。

## 渲染与检查

工具位于 `../tools/render-and-verify.mjs`，使用 Node.js、Chrome 与 Puppeteer Core。可在 `../tools/` 安装 `package.json` 的依赖；或设置 `SHADCN_AUTOMATION_MODULE` 指向已有本地 `puppeteer-core` 安装路径。`SHADCN_CHROME_PATH` 指定 Chrome，`SHADCN_PREVIEW_URL` 指定预览地址。

1. `node ../tools/render-and-verify.mjs --render-only`：从原始 SVG 导出 PNG，复制两份图到网页资源目录。
2. 构建研究库并启动静态预览服务。
3. `node ../tools/render-and-verify.mjs`：检查八类模块、图片、下载、链接、索引、原生折叠和多尺寸排版。

检查记录保存为 `../notes/web-verification.json`。这些验证只针对研究网页与图，不代表上游应用和业务服务已在本机验收。
