# 008 · PDoomVideo · 代码动画能力实验室 研究笔记

[返回项目介绍](../README.md) · [第三方说明](../THIRD_PARTY_NOTICES.md) · [能力实验室](../web/index.html)

研究日期：2026-10-04（Asia/Shanghai）。固定上游版本：[fa546a38092e75f2b079e6a86d6abc54dd525d17](https://github.com/JohnHeibel/PDoomVideo/tree/fa546a38092e75f2b079e6a86d6abc54dd525d17)。下载清单与排除项记录在 [source.json](../upstream/source.json)。

## 研究问题

1. 是否实现通用视频生成模型，AI 出现在哪个环节？
2. 角色、音乐同步、镜头和水彩效果怎样产生？
3. 为什么能跳到指定时间、并行出帧与补渲缺帧？
4. 哪些判断来自源码，哪些来自本机输出与浏览器实测？
5. 制作新内容需要复用什么、重新创作什么？

证据分为**作者说明**、**源码证据**与**本地实验**。分镜描述意图，章节代码实现具体镜头；以代码注册的时间范围为准。README 声称分镜和程序由 Claude Code 编写，但本次无法独立验证全部创作过程。

## 架构与关键实现

PDoomVideo 是固定歌曲 MV 的源码与制作记录。运行路径为 JavaScript 绘制、Chrome 出帧和 FFmpeg 编码，未看到视频生成模型的权重、训练流程或推理服务。作品里出现的神经网络、RLHF、GPU 和自我升级是叙事内容；P(doom) 数值是预设道具，不是风险预测结果。[README](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/README.md)

| 模块 | 职责 | 固定版本证据 |
| --- | --- | --- |
| `studio.html` | 加载绘图库与动画脚本，提供输出画布和时间滑块 | [studio.html](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/studio.html) |
| `src/core.js` | 时间、几何、镜头、绘制、纸纹合成与帧入口 | [core.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/core.js) |
| `src/clawd.js` | Clawd 造型、姿态、表情、装饰和节拍动作 | [clawd.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/clawd.js) |
| `src/cast.js` | Researcher 造型、姿态与手部钩子 | [cast.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/cast.js) |
| `src/props.js` | 舞台、幕布、温度计与泵等共用道具 | [props.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/props.js) |
| `src/lyrics.js` | 固定起止时间与歌词文本 | [lyrics.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/lyrics.js) |
| `src/timeline.js` | 章节与镜头调度、擦屏、歌词条和角落表盘 | [timeline.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/timeline.js) |
| `src/ch/` | 章节私有场景、具体动作与镜头注册 | [src/ch/](https://github.com/JohnHeibel/PDoomVideo/tree/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch) |
| `render.mjs` | Puppeteer 驱动浏览器，保存帧与调用 FFmpeg | [render.mjs](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/render.mjs) |

### 时间函数与确定性

每个镜头根据歌曲时间、镜头内时间和镜头长度求当前姿态，主要使用关键帧、缓动和数学轨迹。帧开始时清空临时状态并重置随机种子，固定物件差异用 `hash()` 计算，因此不依赖前一帧累计位置。每秒 12 次的随机种子变化用来使线稿轻微抖动，成片帧率由渲染器另行决定。[帧入口](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/core.js#L169-L207)

这是任意时间预览和乱序渲染的基础。源码要求镜头为时间的纯函数；跨浏览器、GPU 与字体环境逐像素一致性仍需单独验证。[章节约定](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/ANIMATION_GUIDE.md#L16-L18)

### 角色与音乐同步

Clawd 的姿态接口包含位置、尺寸、伸缩、翻转、旋转、四肢角度、眼睛、嘴和装饰。`move()` 按节拍产生弹跳、摆动、旋转与跑步等动作；`mood()` 为情绪切换加入闭眼、身体反应和符号弹出。身体与手部钩子可放道具，Researcher 使用相似约定。角色一致性来自同一造型代码的复用。[clawd.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/clawd.js)、[cast.js](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/cast.js)

节拍固定为 88 BPM、偏移 0.21 秒；没有运行时音频节拍检测。歌词表预写开始和结束时间，注释说明来自原视频字幕；高亮按行时长和文本长度推进，没有逐词语音对齐。角色的说唱口型也属于节拍动作而非逐音素匹配。[歌词表](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/lyrics.js)、[歌词高亮](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/timeline.js#L85-L110)

### 场景与剧情转场

| 章节 | 实际注册范围（秒） | 例子 | 代码证据 |
| --- | --- | --- | --- |
| 实验室与开场 | 0–23 | 损失曲线滑行、走廊追逐，大嘴关闭遮住镜头 | [c01](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c01_lab.js#L479-L500) |
| 副歌 1 | 23–38.5 | 舞台、火箭、中文房间、Shoggoth、同步群舞 | [c02](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c02_chorus1.js#L725-L726) |
| 起飞 | 38.5–59 | 跑步机黑洞、火箭滑板、粒子重组，心形气泡覆盖 | [c03](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c03_takeoff.js#L855-L885) |
| 副歌 2 | 59–73 | Basilisk、登月、宇宙汇聚、GPU 和金库 | [c04](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c04_chorus2.js#L803-L804) |
| 过时 | 73–95.4 | 神经网络舞蹈、急转、悬崖下落与黑暗收拢 | [c05](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c05_obsolete.js#L890-L896) |
| 副歌 3 | 95.4–109.4 | 纸夹洪水，爆炸闪光后烟雾散成爵士俱乐部 | [c06](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c06_chorus3.js#L612-L681) |
| 规模化 | 109.4–123.5 | 角色塔、Chinchilla、安全栅栏、机房与评分台 | [c07](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c07_scale.js#L678-L679) |
| 副歌 4 与揭幕 | 123.5–140.5 | 红色警报、自我升级隐喻与舞台道具揭幕 | [c08](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c08_chorus4.js#L824-L825) |
| 谢幕 | 140.5–结尾 | 角色返场、鞠躬、幕布落下 | [c09](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/src/ch/c09_finale.js#L402-L403) |

九个文件约注册 62 个镜头。剧情转场通过具体几何、遮挡与动作实现，共用笔刷擦屏只负责部分章节边界。分镜要求每个镜头有清楚的动作，借重复舞台、色彩弧线和角色尺度变化维持连贯。[STORYBOARD.md](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/STORYBOARD.md)

### 渲染与成本

上游提供静帧、检查图、短片、完整帧序列与 MP4 编码。完整帧模式由多个浏览器页面领取缺帧索引，先写临时文件再重命名；可中断后继续。默认 24 fps，按 156.6 秒计算约需 3,759 帧，属于工作量推算而非实测时长。[render.mjs](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/render.mjs)

复杂水彩帧的速度受形状、笔触数量和 GPU 影响，作者的单帧预算属于制作目标。增加 worker 不保证线性加速；本地 Canvas 示意也不能用来预测上游性能。

## 渲染成本解读

补充记录日期：2026-10-04。本节基于已存在的 [render-results.json](render-results.json) 解释工作量，没有重新渲染或进行多 worker 测速。

### 三种频率分别控制什么

| 量 | 本项目中的取值 | 控制的内容 |
| --- | --- | --- |
| 上游输出 FPS | 默认 24 | 原版渲染器每秒输出多少张图像，再交给编码器 |
| 本地样例输出 FPS | 12 | 23–26 秒片段共 36 帧，编码后仍为 3 秒；帧率低于上游默认值 |
| 线稿随机种子频率 | `BOIL = 12` 次/秒 | 每秒更新几次线条扰动种子，形成手绘变化；不决定输出帧数 |

歌曲动作还使用固定 88 BPM，它与上述三种频率也不同。改变输出 FPS 时，镜头仍按歌曲时间求值；改变 BPM 或偏移则要重新检查拍点动作与镜头边界。源码位置：[core.js](../web/vendor/pdoom/core.js)、[上游渲染器](../upstream/render.mjs)。

### 一次样本和算术推算

六个静帧的绘制范围是 4.8467–13.1352 秒/帧；23–26 秒无声短片为 12 FPS、36 帧，输出记录总耗时 289.8584 秒，约 4.83 分钟。这些是不同时间点静帧和一个短片的本机样本，并未测量完整 MV 或多 worker 的平均吞吐。

粗略工作量关系为：

```text
理论帧数 N ≈ 视频时长 D × 输出帧率 F
按六帧样本换算的绘制工作量 ≈ N × [4.85, 13.14] 秒
理想 K worker 工作量 ≈ 上述值 / K
```

最后一行只是假设所有 worker 能独立、均匀工作且没有资源争用的算术值。它不是实测的墙钟耗时或加速比例。帧数的区间起止与取整遵从具体渲染器；这里将非整数工作量向上近似，不承诺原版每条输出路径的精确帧数。

| 输出配置 | 理论帧数 | 按六静帧区间换算的单 worker 绘制工作量 | 已测范围 |
| --- | --- | --- | --- |
| 3 秒 / 12 FPS | 36 | 约 2.9–7.9 分钟 | 本地这段片实际记录总输出约 4.83 分钟，不能将样本换算视为另一次测量 |
| 3 秒 / 24 FPS | 72 | 约 5.8–15.8 分钟 | 未测此配置 |
| 156.6 秒 / 24 FPS | 约 3,759 | 约 5.1–13.7 小时 | 完整视频未在本机渲染 |

这些数值只是把已观察到的样本区间乘以帧数，不能保证新镜头落在该区间，也不是置信区间。静帧 `renderMs` 与片段 `totalMs` 的口径不同；估算不包含新内容的分镜、美术、代码迭代、时间对齐及完整视觉验收，也不能用来量化 AI 创作的效率收益。

上游按缺失帧分配任务的结构支持多 worker，但同机浏览器页面可能共享 GPU、内存和传输带宽。本次没有测量 2 或 4 worker 的真实收益。要取得可用的吞吐数据，应固定同一片段、分辨率、帧率、字体和后端，对照单 worker 与多个 worker 的总耗时和完整输出结果；这是后续实验建议，本次未执行。

## 实验记录

| 实验 | 回答的问题 | 判定标准 |
| --- | --- | --- |
| 上游静帧 | 水彩效果是否出自上游程序 | 固定 commit、歌曲时间、输出尺寸及实际文件 |
| 无声短片 | 连续动作是否能够读出 | 时间范围、帧率、帧数与页面播放 |
| 上游重绘页 | 能否按指定时间运行实际代码 | 初始化、跳转与完整画面输出 |
| 本地 Canvas | 时间函数如何驱动动作 | 暂停、拖动后只按当前时间求值；明确示意身份 |
| 管线交互 | 创作、绘制、编码各负责什么 | 明确步骤和输入输出，避免暗示调用模型 |
| 页面与总站检查 | 发布子路径能否正常使用 | 资源加载、键盘、窄屏与构建检查 |

### 本机结果

2026-10-04 已完成六张静帧与检查图。环境为 Windows、Headless Chrome 154；WebGL renderer 记录为 Intel UHD / ANGLE Direct3D11，`software: false`，画布 1920×1080。本机系统字体回退不等同于原作逐像素复现，未复制完整歌曲。以下耗时为记录中的 `renderMs`，不含保存与传输：

| 歌曲时间（秒） | 输出静帧 | 绘制耗时（秒） |
| --- | --- | --- |
| 23.8 | [t23_80.jpg](../web/assets/frames/t23_80.jpg) | 9.76 |
| 43.2 | [t43_20.jpg](../web/assets/frames/t43_20.jpg) | 5.45 |
| 76.2 | [t76_20.jpg](../web/assets/frames/t76_20.jpg) | 13.14 |
| 101 | [t101_00.jpg](../web/assets/frames/t101_00.jpg) | 4.85 |
| 112 | [t112_00.jpg](../web/assets/frames/t112_00.jpg) | 8.04 |
| 143 | [t143_00.jpg](../web/assets/frames/t143_00.jpg) | 12.92 |

检查图为 [pdoom-contact-sheet.jpg](../assets/pdoom-contact-sheet.jpg)，1920×720，已视觉审看：水彩背景、统一角色造型、场景与字幕正常出现。样本绘制速度约 4.85–13.14 秒/帧，不能当作作者预算已在本机达成，也不能外推整片每个镜头的速度。

本地 Canvas 实验使用 Playwright 驱动系统 Chrome 检查，桌面视口 1440×1000、移动视口 375×1100，设备 DPR 3，并启用 reduced-motion。实测默认暂停，画布 DPR 限制生效，三种动作、角色图层、BPM 修改、播放暂停、时间条方向键与销毁事件均符合预期；移动端未产生横向溢出，页面错误数组为空。

像素复现只针对这个本地示意：在同 BPM 88、跳跃动作和默认三层下，设时间 1.72 秒保存 `canvas.toDataURL()`；点击重绘后字符串严格相等，跳到 5.5 秒再回到 1.72 秒仍严格相等。这验证同一浏览器环境的同时间求值，不能作为上游 p5.brush 或跨设备逐像素复现的证据。

无声短片已输出至 [pdoom-chorus.mp4](../web/assets/pdoom-chorus.mp4)：时间 23–26 秒，结束时间不含在帧序列内，12 FPS、36 帧，编码后 3 秒、H.264、yuv420p、1920×1080，无音轨。文件 6,748,442 字节，FFmpeg `exitCode: 0`，本轮 `lastRun.status: success`。总耗时 289,858.4 毫秒，约 4 分 50 秒。这是样本在本机的离线输出成本，不代表整片或其他机器的速度。

同日总站验证：`npm run check` 检查 8 个项目通过；`npm test` 共 16 项脚本测试，16/16 通过；`npm run build` 成功。16 是测试数量，8 是项目数量。这些检查验证索引与静态构建，不替代画面或交互审看。

### 集成页面浏览器检查

[web-verification.json](web-verification.json) 的 `status` 为 `passed`，12 项检查全部通过。测试使用 Chrome 154、reduced-motion、DPR 1，桌面视口 1440×1000、手机视口 375×1000；这与此前 DPR 3 的独立 Canvas 组件检查分开记录。

| 检查范围 | 实际结果 |
| --- | --- |
| 页面与默认状态 | HTTP 200，本地原理实验默认暂停 |
| 真实画面切换 | 六张图逐一切换成功，自然尺寸均为 1920×1080 |
| 渲染管线 | 五个步骤更新说明、代码与固定版本来源链接 |
| 使用场景 | 四种场景更新输入、复用部分和额外工作 |
| Canvas 参数与时间 | BPM、动作与图层改变图像；同时间重绘与回跳完整 PNG 数据一致；播放前进、暂停稳定、方向键改变时间 |
| 无声视频 | 浏览器读取 3 秒与 1920×1080，实际播放时间前进，观看跨越一轮后仍可播放，并可返回静帧 |
| 响应式与视觉 | 桌面及 375px 无横向溢出，已保存截图并审看桌面全页、原理区域及手机全页 |
| 诊断 | 控制台错误 / 警告、页面错误、失败请求及 HTTP 资源错误均为 0 |

FFprobe 另确认 H.264、12 FPS、36 帧、3 秒且仅有视频轨，与渲染结果记录一致。浏览器 `muted` 状态本身并不足以证明没有音轨，本次以媒体结构检查补足这个判断。

截图证据：[桌面全页](../assets/lab-page-desktop.png)、[桌面原理](../assets/lab-principles-desktop.png)、[手机全页](../assets/lab-page-mobile.png)、[手机原理](../assets/lab-principles-mobile.png)。测试地址为本机 `http://localhost:4191/projects/008-pdoom-video/`，不是发布确认。

本机媒体使用 [tools/render-evidence.mjs](../tools/render-evidence.mjs) 调用原始 `window.renderAt(t)`。它与上游 `render.mjs` 的音频输出路径分开，详细运行方式见 [工具说明](../tools/README.md)；机器记录写到 [render-results.json](render-results.json)。本地短片使用 12 FPS，区别于上游默认 24 FPS。

## 已验证的结论

源码确认：程序动画、固定时间轴、参数化角色、水彩与纸纹合成、节拍动作、歌词条、章节镜头和离线输出接口。实际运行不依赖 Claude API。表盘阶梯 8→34→61→86→99.9 是固定剧情数据。

本地轻量示意和真实上游效果分开呈现；上游浏览器源码位于 `web/vendor/pdoom/`，研究原文位于 `upstream/`，版本清单见 `upstream/source.json`。

## 待验证问题与局限

未验证完整 156.6 秒成片的本机耗时、所有镜头的视觉正确性和跨设备逐像素一致性。没有发现自动语音识别、自动新歌分镜、通用三维引擎或任意提示词视频生成服务。时间预览页面也不是完整剪辑软件。

## 可复用资产与投入要求

补充记录日期：2026-10-04。以下是迁移到新内容的设计建议，而非新项目的成功案例、节省比例或制作时长实测。上游 `src/` 的浏览器副本在 `web/vendor/pdoom/`，通过 [source-studio.html](../web/source-studio.html) 的原有顺序加载。

| 资产类别 | 本地模块与接口 | 价值 | 重用时需要改变与检查的内容 |
| --- | --- | --- | --- |
| 角色 | [clawd.js](../web/vendor/pdoom/clawd.js) 的 `clawd()`、`move()`、`mood()`；[cast.js](../web/vendor/pdoom/cast.js) 的 `researcher()`；章节客串角色通过 `CAST` 共享 | 同一造型函数和姿态接口贯穿多个镜头；动作与情绪可组合，持物钩子支持道具 | 新角色轮廓、尺寸、眼嘴、服装、配色和动作；保持挂件与手部坐标约定，检查大幅伸缩和近景可读性 |
| 绘画 | [core.js](../web/vendor/pdoom/core.js) 的 `paint()`、`inkLine()`、几何和镜头函数；[props.js](../web/vendor/pdoom/props.js) 的舞台 / 幕布 / 表盘 / 泵 | 用一致的纸绘风格组合形状、镜头和道具，避免每个镜头独立定义画法 | 调色板、背景几何、纹理与笔触数量、角色背景对比、字幕避让和构图；新背景与道具仍需绘制 |
| 时间轴 | [timeline.js](../web/vendor/pdoom/timeline.js) 的 `chapter()`、镜头查找和歌词显示；[lyrics.js](../web/vendor/pdoom/lyrics.js)；`core.js` 的 BPM、偏移、关键帧和节拍工具 | 固定时间定位镜头和事件，支持独立检查任意时刻 | 歌词时间、BPM / 偏移、拍点、章节和镜头边界。修改 BPM 后须同时核对按节拍计算的镜头起点与硬编码时间；现有 P(doom) 数据要适配新剧情 |
| 渲染 | [tools/render-evidence.mjs](../tools/render-evidence.mjs)、[upstream/render.mjs](../upstream/render.mjs)、[source-studio.html](../web/source-studio.html) | 复用浏览器出帧、检查图、编码与缺帧处理的方式，分离内容计算与导出 | 硬件后端、Chrome / FFmpeg、字体、画幅、帧率、输出路径和范围；声音策略另设。本地证据工具的无声样例路径与上游完整帧模式不同 |
| 分镜 | [STORYBOARD.md](../upstream/STORYBOARD.md)、[ANIMATION_GUIDE.md](../upstream/ANIMATION_GUIDE.md)、[ch/](../web/vendor/pdoom/ch/) 的章节私有函数及镜头注册 | 提供镜头列表、清楚焦点、动作衔接、色彩弧线和协作边界的组织方式 | 新故事、角色目标、镜头动作、场景、转场和整体节奏；保持每镜头完整画帧和按时间求值，逐镜头验收 |

这套模块不是零成本搬运的素材库。需要有人或编码代理理解 JavaScript / p5，准备内容与造型，调整时间和场景，并对实际画面验收。文件级接口、全局常量、脚本加载顺序和字体环境共同构成依赖；只复制一个函数通常不足以运行一个完整镜头。

### 四类场景的首个小实验

| 场景 | 输入 | 可复用部分 | 新增工作 | 推荐范围与首先观察的内容 |
| --- | --- | --- | --- | --- |
| 音乐 MV | 音频、歌词及时间、节拍、角色与目标片段 | 角色和舞蹈、时间注册、字幕、镜头及出帧 | 设计歌词对应动作、调整起止与节拍、编写新章节并串联转场 | 3–6 秒，一句歌词、1–2 镜头；先检查起点 / 动作顶点 / 结尾静帧，再试低帧率无声片段，观察歌词避让与转场 |
| 品牌角色短片 | 品牌形象、配色、简短文案和目标动作 | 姿态与表情接口、持物钩子、绘画和镜头 | 新造型与道具、角色规范、品牌构图和系列动作 | 3–5 秒，一个角色和一件道具；完成欢迎动作与一次情绪变化，观察剪影、表情和道具位置 |
| 教学讲解 | 经过核对的知识点、图示与关系、旁白时间 | 几何、关键帧、文字合成、镜头和任意时刻检查 | 设计图示顺序、控制信息密度、同步讲解并核对内容 | 5–8 秒，一个概念或因果过程；用少量形状先确认运动顺序、焦点和文字可读性 |
| 模板化素材 | 固定分镜、可变文案 / 颜色、输出规格与参数边界 | 绘图组件、时间函数和导出逻辑 | 将变化项提为配置、输入校验、批处理、失败处理与质量检查 | 2–4 秒，一个动作、两组配置；检查首尾、长短文案及不同配色下的布局，再讨论批量输出 |

这些时长是缩小首次尝试范围的建议，未证明相应题材的制作效果、教学效果、品牌收益或交付成本。先用少量静帧审查造型、构图、动作和时间关系，再投入连续出帧，可把内容判断与渲染开销分开。

## 使用场景与研究价值

角色造型与姿态接口适合品牌角色和系列内容，时间函数适合需精确出帧的动态图形，几何与镜头适合概念讲解，章节隔离适合多代理协作。换歌需要重新对齐歌词、设定节拍、编写分镜；做成内容生产工具还需要批量参数输入、资产管理、导出配置与质量检查。

本项目适合学习“AI 写动画代码”的创作路线。最有价值的结构是可编辑的角色和镜头、可复现的时间求值以及关键帧检查流程。画面质量与叙事可读性需要实际审看，不能由文件成功编码替代。

## 参考资料

- [PDoomVideo 固定版本](https://github.com/JohnHeibel/PDoomVideo/tree/fa546a38092e75f2b079e6a86d6abc54dd525d17)：源码与作者说明。
- [ANIMATION_GUIDE.md](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/ANIMATION_GUIDE.md)：章节、角色、风格和检查约定。
- [STORYBOARD.md](https://github.com/JohnHeibel/PDoomVideo/blob/fa546a38092e75f2b079e6a86d6abc54dd525d17/STORYBOARD.md)：创作意图。
- [原作音乐视频](https://youtu.be/8j-hR4fJywU)：外部观看入口。
