# 007 · X-Twitter-Downloader 研究笔记

[返回项目介绍](../README.md)

研究日期：2026-10-03，Asia/Shanghai。来源：[X-Twitter-Downloader](https://x-twitter-downloader.com/zh-CN)。

## 最终结论

基础解析与下载原理已成熟，当前深入研究价值不大。保留该网站的产品思路，作为后期开发视频下载产品的参考与指导；状态为“已归档”。

本次重点是理解“页面链接与媒体资源的关联”，以及将解析、版本选择、下载和失败反馈整理成可用流程，不继续投入该站后台复现。

## 事实、实测与推断

| 类型 | 记录 |
| --- | --- |
| 网站声明 | 免费、无需注册或 X 登录信息；面向公开帖子；使用本站服务器和外部解析服务 |
| 公开前端可确认 | `POST /api/parse-video`，请求体为 `{ "url": "帖子链接" }`；结果包含视频版本；下载按钮打开 `direct_download_url` |
| 本次接口实测 | 官方教程示例帖子成功解析，返回 5 个 MP4 版本；文件地址位于 `video.twimg.com` |
| 通用实现思路 | 可通过页面、播放器接口或媒体元数据发现资源；具体方式按网站适配 |
| 当前用途判断 | 基础研究价值不大，主要保留后期产品开发参考价值 |
| 未确认 | 本站后台具体采用哪种 X 接口、解析供应商或实现库；不能断定使用了 yt-dlp |
| 未验证 | 逐个文件下载、完整播放、登录内容、其他网站、所有视频类型和长期成功率 |

## 接口实验

测试输入采用[官网使用教程](https://x-twitter-downloader.com/zh-CN/how-to-use)提供的帖子：

```text
https://x.com/TeslaAUNZ/status/1963788601361359349
```

请求方式：

```http
POST https://x-twitter-downloader.com/api/parse-video
Content-Type: application/json

{"url":"https://x.com/TeslaAUNZ/status/1963788601361359349"}
```

返回 `success: true`，时长为 58.665 秒，5 个版本的实际分辨率分别是 3840×2160、1920×1080、1280×720、640×360、480×270，文件扩展名为 MP4，下载类型为 `direct`。保留的响应字段摘录见 [parse-example.json](parse-example.json)，该文件是本次响应摘录，不是完整原始响应，也不是可持续使用的地址保证。

响应中的 `qualityDesc` 存在错位：例如 3840×2160 的版本被标为 `HD (1080p)`，1920×1080 被标为 `SD (480p)`。产品展示应依据实际宽高生成分辨率标签，并核对解析结果，不能直接把第三方文字标签当成准确画质。

## 来源与证据索引

| 来源名称 | 支持的判断 |
| --- | --- |
| [X-Twitter-Downloader](https://x-twitter-downloader.com/zh-CN) | 用户输入、下载选项、公开帖子与访问边界 |
| [X-Twitter-Downloader · 关于](https://x-twitter-downloader.com/zh-CN/about) | 独立服务定位及服务器、外部解析服务 |
| [X-Twitter-Downloader · 隐私政策](https://x-twitter-downloader.com/zh-CN/privacy-policy) | 提交链接与技术数据的处理方式 |
| [X-Twitter-Downloader · 使用教程](https://x-twitter-downloader.com/zh-CN/how-to-use) | 具体操作流程与本次测试用例 |
| [X-Twitter-Downloader · 本次读取的前端脚本](https://x-twitter-downloader.com/_next/static/chunks/app/%5Blocale%5D/page-9ecfa229a1e6e19e.js) | 本站解析请求和打开 `direct_download_url` 的逻辑；文件名对应本次部署，后续可能失效 |
| [X 官方媒体数据文档](https://docs.x.com/x-api/fundamentals/data-dictionary#media-object) | 帖子媒体信息与视频 `variants` 数据结构；不证明本站采用官方 API |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 已有媒体提取与下载能力，以及程序嵌入方式；作为后期引擎候选 |
| [MDN · HTML 视频元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video) | 从 `video` / `source` 获取媒体地址的通用途径 |
| [MDN · blob URL](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob) | 浏览器内部引用与远程媒体地址的区别 |

网页与文档链接指向动态内容，结论以本次日期的观察和响应摘录为准。

## 后期产品设计起点

将来源页面、视频元数据、候选版本、下载任务和本地文件关联起来：

```text
来源页面 URL
    └─ 视频：标题 / 封面 / 时长
        └─ 版本：实际分辨率 / 格式 / 文件或清单地址
            └─ 任务：状态 / 进度 / 错误 / 重试
                └─ 本地文件：保存路径 / 来源 / 解析日期
```

解析引擎、下载执行与产品界面分别承担资源发现、文件获取和用户操作。先以一个目标平台验证链路，再根据需求扩展平台适配、HLS / DASH 分段、登录状态和任务恢复。来源地址可能过期，记录地址与元数据不等于永久拥有可下载资源。

这些是后期开发建议。本次没有创建下载程序、Web 演示或跨站下载服务。
