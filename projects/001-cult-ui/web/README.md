# 001 · Cult UI 实验室 Web

这是中文全量研究展示：134 个官方文档组件加 3 个有效补充注册项，共 137 项。目录包含逐项原理、场景、依赖和来源；旧别名不重复。数据位于 [src/data.ts](src/data.ts)，审计依据在 [完整目录](../notes/full-catalog-audit.json) 与 [机制分析](../notes/mechanisms-audit.json)。

[项目介绍](../README.md) · [研究笔记](../notes/research.md) · [部署指南](../../../docs/deployment.md)

## 阅读路径

首页先解释 Cult UI 的源码组件定位，再以生成的全能力地图导读。`#understanding` 提供完整图展开、原图放大、能力/交付/实现摘要和六个方向的分类入口；`#capabilities` 保留 137 项目录与 138 个真实用法示例；`#principles` 解释分发、状态、动效与图形渲染；`#scenarios` 整理谁用、何时用、个人价值、业务边界和采用路径。

能力图源文件保存在 `../assets/cult-ui-capability-map.png` 与 SVG；静态发布使用 `public/` 中的副本，更新图时需同步。图内可横向滚动查看细节，首页也提供打开原图的入口。

## 环境与运行

使用 React 19、TypeScript、Vite、Tailwind CSS v4 和 Motion；本子项目要求 Node.js >=22.12.0，具体依赖版本以本目录的 package.json 与锁文件为准。以下命令从仓库根目录执行：

~~~bash
npm --prefix projects/001-cult-ui/web ci
npm --prefix projects/001-cult-ui/web run dev
~~~

开发地址以 Vite 输出为准。只预览当前项目的构建结果：

~~~bash
npm --prefix projects/001-cult-ui/web run build
npm --prefix projects/001-cult-ui/web run preview
~~~

通过总站预览最终子路径。运行根构建之前，先安装本目录依赖；根 npm run build 会自动执行 TypeScript 检查、Vite 构建和总站静态聚合：

~~~bash
npm --prefix projects/001-cult-ui/web ci
npm run sync
npm run check
npm test
npm run build
npm run preview
~~~

总站默认端口是 4173。本机该端口已占用，本次实际启动命令为：

~~~bash
node scripts/serve.mjs --port 4187
~~~

打开 [http://localhost:4187/projects/001-cult-ui/](http://localhost:4187/projects/001-cult-ui/)。也可运行 npm run preview -- --port 4187；若指定其他空闲端口，应同步修改访问地址。本地预览服务仅绑定 127.0.0.1。

## 静态输出与发布

Vite 采用相对资源基础路径 base: './'，输出到 web/dist。总项目清单应设置：

~~~json
{
  "publishDir": "projects/001-cult-ui/web/dist",
  "demo": null
}
~~~

根 npm run build 自动构建本子项目，再将静态文件复制至 _site/projects/001-cult-ui/。GitHub Pages 配置入口为 [Cult UI 能力与原理实验室](https://yydshly.github.io/1002_codex_project/projects/001-cult-ui/)；部署结果以 GitHub Actions 记录和实际页面为准。当前项目使用页内锚点，避免静态托管的深层路由回退问题。发布工作流先安装本目录依赖，再运行根构建即可。

## 实验说明

真实预览接入 136 个上游有效 example，并为无官方独立示例的 base-select、base-tooltip 增加 2 个使用真实 API 的本项目示例。这两项不冒充上游 example。137 项目录不按示例数量、复合 API 部件或 deprecated aliases 重复计数。

真实预览保留固定 commit 源码及其样式，Vite 环境对 Next.js Image/Link/font 等作必要适配。COBE、Paper Design、Three.js、Canvas、Base UI、Vaul、Embla、Sonner 与字体等依赖按组件实际需求加载。嵌入整个官方 docs 页面不能替代本地组件预览；当前也未核验到有效独立 /preview 或 /view 组件 URL。

原有 Shift Card、Text Animate、Dock、方向 Tabs、Border Beam 与 Kanban 研究实验仅用于解释代表机制。全量接入后的构建与逐项浏览器结果以本轮验收为准；看板、投票和模拟任务等仍是前端状态，业务服务另行实现。

## 验收要点与限制

- 构建生成 dist/index.html，通过总站子路径访问时 JS、CSS 和截图资源能够正确加载。
- 检查每个真实示例的加载、渲染、主要操作及错误状态；接入清单不等同于已通过全部浏览器检查。
- 375px 等移动宽度下正文、导航与实验区域可阅读；触屏不能依赖悬停完成必要操作。
- 键盘可到达主要控件，存在可见焦点；拖放操作提供可点击或可选择的替代方式。
- 页面自动读取系统 prefers-reduced-motion 并相应减少 Motion 和 CSS 动态效果；没有单独的全局页面开关。Border Beam 播放/暂停按钮仅控制该实验。实际验证结果以 [实验记录](../notes/research.md#实验记录) 为准。
- 无自动化帧率、屏幕阅读器或全组件兼容性认证；大量 DOM、尺寸动画、滤镜与持续装饰仍需在目标设备测量。

首轮代表实验版本已通过 TypeScript、Vite、总站、catalog 和根 9 个测试，以及六种交互、搜索筛选、详情关闭、复制、主题和 390px 布局。全量接入的构建、真实示例加载与逐项浏览器结果由本轮验收更新，不能把首轮通过范围扩大到所有组件。系统减少动效曾仅作源码核查，未切换用户系统设置。证据统一记录在 [研究笔记](../notes/research.md)。

## 本轮实际验收结果

137 项目录完整性校验通过；136 个官方示例及 2 个本项目 API 接入示例全部通过浏览器初始渲染检查，逐项结果见 [runtime-preview-audit.json](../notes/runtime-preview-audit.json)。本地素材路径与两个 Shader 素材加载问题修正后已复验。TypeScript、多入口 Vite、总站聚合、目录检查和根 9 个测试通过；1440px 与 390px 目录、搜索、详情、复制、主题和手机导航也已手动验证。

维护目录可运行 `npm --prefix projects/001-cult-ui/web run catalog:sync`，完整性验证可运行 `npm --prefix projects/001-cult-ui/web run check:catalog`。数据生成依据为固定版本目录审计与逐项中文机制资料；上游原版预览的生成脚本为 `scripts/build-upstream-preview.mjs`，需要被忽略的原始下载缓存。

运行依赖为适配 React 19 调整 Embla React / Autoplay 至 8.6.0、React Wrap Balancer 至 1.1.1；并非精确复用上游网站锁文件。全量初始渲染通过仍不等同于全配置、全交互或全设备兼容性认证。
