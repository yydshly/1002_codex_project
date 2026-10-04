# PDoomVideo 第三方来源与本地修改说明

记录日期：2026-10-04（Asia/Shanghai）。上游固定 commit：`fa546a38092e75f2b079e6a86d6abc54dd525d17`。

## PDoomVideo 源码

- 项目：[PDoomVideo](https://github.com/JohnHeibel/PDoomVideo/tree/fa546a38092e75f2b079e6a86d6abc54dd525d17)。
- 作者 / 维护者标识：GitHub 用户 JohnHeibel。
- 包声明：`pdoomvideo@1.0.0` 的 `package.json` 包含 `"license": "ISC"`。
- 检查结论：本次版本未发现独立 `LICENSE` 文件；包中的 `author` 为空。没有凭包元数据补写上游未提供的版权主体、年份或授权条款。
- 声明证据：[固定版本 package.json](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/package.json)，本地保留 [upstream/package.json](upstream/package.json)。

原始动画脚本保留在 `web/vendor/pdoom/`；研究原文及渲染器保留在 `upstream/`。下载文件清单、来源日期与排除项见 [upstream/source.json](upstream/source.json)。这些文件来自同一固定版本。本地没有将整个 PDoomVideo 仓库声明为一个经过完整许可证审核的通用分发包。

## p5.js 与 p5.brush

按时间重绘页面使用本地副本，保留以下许可文件和原有代码头部：

| 依赖 | 本地文件 | 保留许可 |
| --- | --- | --- |
| p5.js 2.3.3 | `web/vendor/p5.min.js` | [GNU LGPL 2.1 文本](web/vendor/p5-LICENSE.txt) |
| p5.brush 2.2.3 | `web/vendor/p5.brush.js` | [MIT License](web/vendor/p5.brush-LICENSE.md)，含 Copyright (c) 2023–2026 Alejandro Campos Uribe |

这两个依赖的许可独立于 PDoomVideo 的包声明。本地中文能力页的轻量 Canvas 示意另行编写；原作重绘与新增实际场景的绘画入口使用上述绘图库与共享动画脚本。

上游还声明 puppeteer-core，渲染器使用环境中的 Chrome 与 FFmpeg。它们属于本机渲染工具，不作为网页运行依赖复制。上游使用的 Permanent Marker 与 Shantell Sans 字体在本地重绘页回退到系统字体，没有复制字体文件；由此引起的文字外观差异在页面和研究中说明。

## 音乐、歌词与原作视频

上游 README 将歌曲来源指向 [2024 年的 YouTube 视频](https://www.youtube.com/watch?v=uEB5E67vcPA)，将歌词与解读指向 [Osmarks 页面](https://docs.osmarks.net/hypha/p(doom)_song_objectively_correct_interpretation)。完整视觉作品入口为 [原作视频](https://youtu.be/8j-hR4fJywU)。这些是作者提供的来源说明，不等于音乐、歌词和视频的再分发许可。

本地未复制上游 `assets/pdoom.mp3`，未镜像完整 YouTube 视频；展示片段使用无声输出。上游歌词数组作为动画程序的一部分保留，在对应时间用于上游帧重绘。代码的 ISC 包声明不能自动扩展为音乐、歌词、字体、角色标识等素材的授权。

证据：[上游 README](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/README.md)、[上游 studio.html](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/studio.html)。

## 本地新增与变更

| 内容 | 性质与修改范围 |
| --- | --- |
| `README.md`、`notes/research.md` | 中文研究、源码证据、实验及采用判断 |
| 能力实验室页面与轻量 Canvas | 本地展示与原理示意，不冒充上游原版效果 |
| `web/source-studio.html` | 适配本地资源路径、返回入口、中文加载说明与状态；移除网络字体，采用系统回退 |
| `web/vendor/pdoom/` | 保留固定版本动画源码，由重绘页面加载 |
| `tools/render-evidence.mjs` | 本地证据渲染工具，调用原始 `renderAt(t)` 并记录 GPU；无声编码不使用上游音乐 |
| 六张真实静帧与检查图 | 上游代码在本机重绘的研究资源；静帧 1920×1080，时间为 23.8、43.2、76.2、101、112、143 秒，详见 [研究记录](notes/research.md) |
| 无声短片 | `web/assets/pdoom-chorus.mp4`，上游代码本机输出，23–26 秒、12 FPS、36 帧、H.264、1920×1080；不使用音乐音轨 |
| 点亮一盏灯实际样例 | 本次新增分镜、场景与风格配置；复用原始 `core.js` 和 `clawd.js`，在独立包装页执行。三种风格各 72 帧，六秒无声 H.264 / 1080p；预览和上色拆分为 960×540，不使用原作歌词或音乐 |
| 角色与要素目录 | 本地整理来源、参数、依赖、准备清单与模型创作任务；14 张 960×540 预览由原始共享组件和章节 `CAST` 函数实际绘制。实时控制台的新增包装代码驱动原始 `clawd()`、`researcher()` 与 `move()`，固定版本共享脚本保持原样，不调用图像模型 |
| 理解总览网页与 PNG | 本地编写流程、作用分工、场景及个人价值说明，以 HTML / CSS 排版导出一张图；嵌入现有 14 张原作 / 新增样例 / 元素实际渲染画面，来源和哈希见 `web/assets/overview-manifest.json`，原图文件保持不变 |
| `assets/elements-page-*.png` | 角色目录和真实驱动控制台的桌面 / 手机浏览器截图 |
| `assets/lab-page-*.png`、`assets/lab-principles-*.png` | 本地能力展示页的桌面与手机浏览器截图，与上游单帧输出分开说明 |

本文件陈述能够核实的来源与声明，不扩展上游未明确提供的许可范围。

实际媒体与环境记录见 [render-results.json](notes/render-results.json)，展示页面及截图验证见 [web-verification.json](notes/web-verification.json)。这些实验结果说明已检查的技术行为，不替代对第三方素材授权范围的确认。
