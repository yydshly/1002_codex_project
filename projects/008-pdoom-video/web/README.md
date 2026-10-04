# 008 · PDoomVideo · 代码动画能力实验室 Web

[返回项目介绍](../README.md) · [研究记录](../notes/research.md) · [第三方说明](../THIRD_PARTY_NOTICES.md)

这是中文静态能力展示，用上游真实画面、无声短片、本地 Canvas 时间实验和渲染管线交互解释 PDoomVideo 的效果、原理与用途。研究日期为 2026-10-04；上游固定版本为 [fa546a3](https://github.com/JohnHeibel/PDoomVideo/tree/fa546a38092e75f2b079e6a86d6abc54dd525d17)。

## 页面与来源

- `index.html`：能力实验室，含效果、原理、场景、价值和边界。本地时间函数示意使用原生 Canvas，另行编写并明确标识。
- `overview.html`、`overview.css`：整理我们确认的理解，覆盖实际效果、资产准备、AI 分镜和代码、程序绘画、出片、使用场景及个人价值；含可下载的完整图和真实六秒成片。
- `assets/pdoom-understanding.png`：3200×5830 的一张总览图，由原生网页排版导出，嵌入 14 幅已有实际渲染画面；来源与哈希见 `assets/overview-manifest.json`。
- `source-studio.html`：运行上游动画和绘图代码，按指定歌曲时间重绘完整帧；复杂水彩效果需要等待，不播放音乐。
- `example.html`：本次 AI 新写的“点亮一盏灯”实际样例，含分镜、逐帧姿态、三种风格、四张上色拆分和六秒成片。
- `example-studio.html`、`example-scene.js`：新场景的真正绘画入口与代码，复用原始 `core.js` 和 `clawd.js`，可以按时间和风格重绘。
- `elements.html`：14 项原始代码预览、角色 / 道具来源与接口、四步准备清单、原始角色参数控制台及可复制的模型创作任务。
- `elements-data.js`：整理共享组件、角色组合与章节导出的不同复用范围；`elements-scene.js`、`elements-studio.html`：调用原始角色和道具函数的独立绘画包装页，共享源码保持原样。
- `assets/elements/`：14 张实际预览及包含源码哈希、图片哈希、GPU 与耗时的绘制清单。
- `vendor/pdoom/`：固定版本的原始动画脚本。
- `vendor/p5.min.js`、`vendor/p5.brush.js`：重绘入口使用的绘图库，保留各自许可文件。
- `assets/`：真实静帧与无声片段。具体文件、时间与尺寸记录在研究笔记中。

新增样例的三种风格共用同一动作函数，各 72 帧、12 FPS、六秒无声 H.264 / 1920×1080。网页逐帧预览缩为 960×540，完整视频保留原始画幅。来源、分镜与复用范围见 [样例说明](../notes/example-storyboard.md)。

样例的 9 项检查全部通过，包含 FFprobe 规格、真实播放、逐帧交互、风格与上色、两种视口布局和原始代码重绘；浏览器及资源错误为零。证据见 [样例验证记录](../notes/example-web-verification.json)。

角色目录另完成 9 项验证，覆盖 14 张实际预览、来源与依赖、模型任务、Clawd / 研究员原始函数重绘、参数改变画面、同参数重复绘制、1440px / 375px 布局及浏览器错误。见 [元素验证记录](../notes/elements-web-verification.json) 与 [准备指南](../notes/elements-guide.md)。控制台启动后按参数重绘；它不调用模型，也不提供实时连续水彩播放。

上游重绘页回退为系统字体，文字外观可能与原视频不同。原作完整音乐视频保留 [YouTube 入口](https://youtu.be/8j-hR4fJywU)，不复制 MP3 或镜像完整视频。浏览本地页面不需要 Claude 登录、模型 API Key 或推理服务。

## 本地预览

在仓库根目录已具备总站构建环境时执行：

```bash
npm run build
node scripts/serve.mjs --port 4191
```

打开 `http://localhost:4191/projects/008-pdoom-video/`，上游重绘入口为 `http://localhost:4191/projects/008-pdoom-video/source-studio.html`。首次准备总站环境和发布流程见 [部署指南](../../../docs/deployment.md)。

上游离线出片需另准备 Node.js、Chrome、FFmpeg 和 puppeteer-core，不是能力页面的运行依赖。完整说明见 [项目 README](../README.md)。

本地研究媒体由 [证据渲染工具](../tools/README.md) 生成：执行原始动画代码，输出 1920×1080 静帧及无声 H.264 片段，同时记录实际 GPU。示例短片采用 12 FPS，上游默认输出为 24 FPS；轻量 Canvas 示意不能代表这条渲染路径的性能。

## 总站输出约定

本项目直接使用静态 HTML / CSS / JavaScript，清单设置：

```json
"publishDir": "projects/008-pdoom-video/web"
```

总站构建复制此目录到 `_site/projects/008-pdoom-video/`。资源使用相对路径，不依赖开发机器绝对目录。

GitHub Pages 子路径为 `/1002_codex_project/projects/008-pdoom-video/`。这仅是部署路径约定，不代表已部署新页面。不要把上游 `node_modules`、本机渲染缓存、完整音乐或完整视频副本纳入静态输出。

## 本地验证

六个时点的实际静帧与检查图已完成；单帧 1920×1080，Intel UHD / ANGLE D3D11 实测绘制约 4.85–13.14 秒/帧。Canvas 示意的桌面、375px、键盘操作、播放暂停、BPM 与图层切换和同时间图像复现检查已通过。它不代表上游的实时性能。统一证据见 [研究记录](../notes/research.md)。

无声短片 `assets/pdoom-chorus.mp4` 已输出：23–26 秒、12 FPS、36 帧、H.264、1920×1080，无音轨。机器记录为成功，文件 6,748,442 字节。总站检查 8 个项目通过，16 项脚本测试全部通过，构建成功。完整 156.6 秒成片未在本机渲染。

完整页面在 1440×1000 与 375×1000 视口完成 12 项浏览器检查，全部通过：六张真实静帧、五步管线、四类使用场景、Canvas 参数与像素复现、播放暂停、无声短片实际播放 / 返回静帧、复用模块展开和源码链接、渲染工作量估算。两视口无横向溢出，控制台错误 / 警告、页面错误、失败请求与 HTTP 资源错误均为零。[web-verification.json](../notes/web-verification.json) 保留逐项结果，[render-results.json](../notes/render-results.json) 保留实际媒体与 GPU 记录。FFprobe 另确认短片仅有视频轨。

浏览器截图：[桌面全页](../assets/lab-page-desktop.png)、[桌面原理](../assets/lab-principles-desktop.png)、[手机全页](../assets/lab-page-mobile.png)、[手机原理](../assets/lab-principles-mobile.png)。这些验证针对本机预览，不代表 GitHub Pages 已发布。
