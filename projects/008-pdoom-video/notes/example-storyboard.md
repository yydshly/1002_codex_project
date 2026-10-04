# 实际样例：点亮一盏灯

本次创作要求：做一段六秒二维卡通，角色发现按钮、走近、按下后点亮灯泡，再开心庆祝。需要能逐帧观察动作，并比较暖色水彩、冷色水彩和平涂三种风格。

这份分镜和 `web/example-scene.js` 在本次对话中由 AI 编写。浏览器执行已经写好的代码，播放和导出时无需调用模型。

| 时间 | 分镜 | 代码落实 |
| --- | --- | --- |
| 0–0.8 秒 | 角色发现右侧按钮和熄灭的灯泡 | 角色在 x=460，眼睛朝右，出现问号 |
| 0.8–2.4 秒 | 角色走到按钮旁 | x 从 460 插值到 1030；腿、手臂与身体随时间变化 |
| 2.4–3.5 秒 | 角色伸手按下按钮，灯泡亮起 | 右手旋转到按钮位置，按钮下降 13 px；3.25 秒开启灯，随后渐亮 |
| 3.5–6 秒 | 角色微笑、举手、小跳跃 | happy 眼睛，微笑，两手上举，身体位移与挤压伸展 |

## 复用与新增

- 原样复用的文件：`web/vendor/pdoom/core.js`、`web/vendor/pdoom/clawd.js`、p5.js 和 p5.brush。共享关键帧、缓动、几何、角色、水彩笔刷、纸张与 `renderAt`。
- 新增：故事、时间安排、按钮和灯泡道具、动作函数、风格配置、教学图层与逐帧查看界面。
- `example-scene.js` 在本地包装 `paint` 和帧合成函数，切换教学图层及平涂效果，不修改上游源文件。每次出帧固定画笔随机种子；渲染工具另外检查同一时刻的像素是否复现。
- 调色板改变颜色；水彩 / 平涂开关改变填充路径；纸纹开关改变合成。三种风格共用同一动作函数，实际姿态值写入公开清单。

## 真正出片

```powershell
node projects/008-pdoom-video/tools/render-example.mjs
node scripts/catalog.mjs build
node projects/008-pdoom-video/tools/verify-example.mjs
```

本机 Chrome 执行 `web/example-studio.html?render`，每隔 1/12 秒绘制一帧，三种风格各 72 帧。FFmpeg 从原始 1920×1080 帧编码六秒 H.264 MP4，无音轨。网页的逐帧预览及四张上色拆分缩小为 960×540；原始帧位于忽略的 `tools/.render-temp/example/`。

实际结果见 `example-render-results.json`，逐帧动作、视频路径、画幅和源码哈希见 `web/assets/example/manifest.json`。浏览器与 FFprobe 验证见 `example-web-verification.json`。

实际渲染与同时间像素复现检查成功；GPU 为 Intel UHD / ANGLE D3D11。三种视频经 FFprobe 确认为六秒、12 FPS、72 帧、H.264、1920×1080，均只有视频轨。样例 9 项验证全部通过，包含真实播放、风格保持动作一致、四张上色图、1440px / 375px 布局和在浏览器重新执行绘画代码；浏览器和资源错误为零。
