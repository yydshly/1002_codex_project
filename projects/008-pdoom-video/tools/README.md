# 上游真实画面证据渲染

## 理解总览图与网页

从仓库根目录执行 `node projects/008-pdoom-video/tools/render-overview.mjs`，用 Chrome 将 `web/overview.html` 的 `#overview-board` 导出为 `web/assets/pdoom-understanding.png`。源图为 3200×5830，文字由原生 HTML / CSS 排版，嵌入现有 14 张实际渲染画面；并未重新生成角色形象。输入图片、排版源文件及 PNG 的哈希记录到 `web/assets/overview-manifest.json`，修改源网页或样式后需要重新导出。

导出同时保存一份字节相同的 `assets/pdoom-understanding.png`，作为总站和 README 的引导图。两处都采用完整总览图；原作六帧检查图继续保留在研究内容中。

`node projects/008-pdoom-video/tools/verify-release.mjs https://yydshly.github.io/1002_codex_project/` 用真实浏览器验证已发布总站的八段完整摘要、引导图字节、全部页面路径、总览与六秒视频播放，以及原始角色控制台的真实改色重绘。省略地址时检查本机 4191 端口。运行记录保存在忽略的 `tools/.render-temp/release-verification.json`，用于发布后验收。

构建总站并在 4191 端口预览后，执行 `node projects/008-pdoom-video/tools/verify-overview.mjs`，核对图片实际尺寸与哈希、六块说明与五步流程、页面入口及下载链接、六秒真实视频播放和桌面 / 手机布局。结果记录到 `notes/overview-web-verification.json`，截图保存到项目 `assets/overview-page-*.png`。

## 角色与要素实际预览

从仓库根目录执行 `node projects/008-pdoom-video/tools/render-elements.mjs`，用本机 Chrome 加载 `elements-studio.html`，调用原始共享组件和章节导出的 `CAST` 角色函数，分别绘制 14 项预览。画幅为 1920×1080，网页 JPEG 缩为 960×540；输出到 `web/assets/elements/`，实际 GPU、耗时与哈希记录到 `notes/elements-render-results.json` 及图片目录的 `manifest.json`。需要本机硬件 WebGL 与已安装的 `puppeteer-core`，不使用音乐或图像生成模型。

总站构建并在 4191 端口预览后，执行 `node projects/008-pdoom-video/tools/verify-elements.mjs`。脚本检查目录筛选、原始来源、准备说明、创作任务复制、Clawd / 研究员原始绘画控制台、参数改变画面、同参数复现、桌面 / 手机布局和浏览器错误。9 项结果保存到 `notes/elements-web-verification.json`；实际页面截图保存在 `assets/elements-page-*.png`。

## 新增实际场景样例

在仓库根目录执行 `node projects/008-pdoom-video/tools/render-example.mjs`，用原始角色与绘画代码输出“点亮一盏灯”的三种风格，各 72 张 1080p 原始帧和六秒无声 MP4。`--probe` 只重绘两个关键时点以检查构图。完整渲染记录写入 `notes/example-render-results.json`，场景源码哈希和逐帧姿态写入 `web/assets/example/manifest.json`。

原始帧保存在忽略的 `tools/.render-temp/example/`；网页帧和上色拆分缩为 960×540，视频保留 1920×1080。构建总站后执行 `node projects/008-pdoom-video/tools/verify-example.mjs`，检查分镜跳转、逐帧查看、三种风格、实际视频、上色拆分、桌面 / 手机布局、源码重绘与 FFprobe 输出。具体创作过程见 [样例分镜](../notes/example-storyboard.md)。

## 原作画面证据

`render-evidence.mjs` 用本机 Chrome 执行 `web/source-studio.html` 内的上游 p5 / p5.brush 代码，逐个时点调用原来的 `window.renderAt(t)`。它保留 1920×1080 原始画幅，记录真实 WebGL renderer 与每帧绘制耗时，不下载或混入歌曲音频。

在此子项目根目录运行；也可从仓库根目录使用脚本的完整相对路径。脚本依靠自己的文件位置定位子项目，因此输出不受终端当前目录影响。

```powershell
node tools/render-evidence.mjs
node tools/render-evidence.mjs --stills=none --clip=23:26 --fps=12
```

第一次命令生成 23.8、43.2、76.2、101、112、143 秒的 JPEG 原画面到 `web/assets/frames/`，文件名形如 `t23_80.jpg`、`t101_00.jpg`，JPEG 质量为 0.9。使用这些真实帧合成 `web/assets/pdoom-contact-sheet.jpg`，并复制一份到 `assets/pdoom-contact-sheet.jpg` 供研究文档使用。第二次命令只生成 23 至 26 秒的无声 H.264 MP4 到 `web/assets/pdoom-chorus.mp4`，默认帧率也是 12 FPS。结束时间不包含在帧序列内；3 秒、12 FPS 对应 36 帧。

需要在 `tools/` 安装 `puppeteer-core`，同时有本机 Chrome；导出 MP4 另需 FFmpeg 可执行文件。Windows 默认使用 ANGLE D3D11；脚本会识别 Chrome 常见安装目录，也支持显式路径：

```powershell
node tools/render-evidence.mjs --chrome="C:\Program Files\Google\Chrome\Application\chrome.exe"
node tools/render-evidence.mjs --stills=none --clip=23:26 --ffmpeg="C:\tools\ffmpeg\bin\ffmpeg.exe"
node tools/render-evidence.mjs --stills=6,24,76 --out=web/assets/check --cols=3 --w=480
```

`--out` 是子项目内的输出目录；所有帧、视频、联系表与结果记录都留在该子项目。研究文档的联系表副本始终写入 `assets/pdoom-contact-sheet.jpg`。`--w` 只改变联系表缩略图，不改变单帧或视频分辨率。完整参数可用 `--help` 查看。

测量结果写入 `notes/render-results.json`，包括实际 GPU、逐帧 `renderMs`、保存及传输在内的 `totalMs`、输出字节数与运行成功/失败状态。后续仅生成视频时保留之前的静帧测量；失败也会记录实际错误，并以非零退出码结束。未执行渲染时没有预填成功数据。

重新测量后执行 `node tools/export-benchmark.mjs`，把成功记录中的 GPU、六帧时间范围与短片测量导出到 `web/assets/render-benchmark.json`，供页面工作量估算器读取。估算器按时长、帧率和工作页面数计算帧量、串行时间范围与理想并行时间；多页面吞吐尚未实测。

默认拒绝 SwiftShader 等软件 renderer。需要研究软件后端时可明确加 `--allow-software`，JSON 仍会标记 `gpu.software: true`。本地重绘页使用系统字体回退，文字外观可能与原视频不同。FFmpeg 不存在、编码失败或提前退出会报告错误，不会将失败记为成功。

## 展示页浏览器验证

先构建总站并启动预览，然后在仓库根目录执行：

```powershell
node projects/008-pdoom-video/tools/verify-web.mjs --url=http://localhost:4191/projects/008-pdoom-video/
```

脚本执行 12 项检查，覆盖真实帧加载、管线与使用场景切换、Canvas 参数与像素复现、视频播放、复用模块展开和源码链接、渲染工作量估算、桌面和 375px 窄屏布局以及浏览器错误。验证记录保存为 `notes/web-verification.json`，截图保存在项目 `assets/`。失败返回非零退出码。源码与依赖哈希清单可通过 `node projects/008-pdoom-video/tools/update-manifest.mjs` 更新。
