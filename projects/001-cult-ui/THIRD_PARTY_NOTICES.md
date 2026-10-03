# Third-party notices

本项目现在收录固定版本 Cult UI 的原始组件及 136 个官方示例源码，位于 `web/src/upstream/vendor/`。两个 Base Select / Base Tooltip 接入示例由本项目调用原始 API 编写，并明确标识。原有六组轻量研究复现保留在 `web/src/components/Demos.tsx`，不作为官方示例计数。

集成调整包括本地 import 路径、已知仓库 public 资源的子路径适配、明确标记的 Next 浏览器适配层，以及独立预览容器；两个源文件的行尾空格已作格式规范，不改变组件行为。Next 的图片优化和应用路由服务不包含在本地预览内。外部图片、视频和嵌入内容保留官方示例使用的原 URL，访问仍依赖对应媒体服务。

本地媒体文件来自相同固定 commit 的 `apps/www/public/`；未将本项目自制图形替换成官方媒体。全部源文件的 SHA 和路径保存在文件头及 `integration-report.json` 中。

Geist / Geist Mono / 五套 Geist Pixel 字体来自 npm `geist` 包，是该固定版本网站使用的七个字体家族。字体文件保持原样，经 Vite 打包至预览站点；授权为 SIL Open Font License 1.1，Copyright (c) 2023 Vercel, in collaboration with basement.studio。完整字体许可副本见 `assets/licenses/Geist-OFL-1.1.txt`，站点分发副本见 `web/public/licenses/Geist-OFL-1.1.txt`。

来源：https://github.com/nolly-studio/cult-ui

研究 commit：67a66c6ac1cd240914ba688a907611b3437a7a2b

以下为该 commit 的 LICENSE.md 原文：

MIT License

Copyright (c) 2023 Jordan-Gilliam

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
