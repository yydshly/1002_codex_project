# 第三方来源与许可声明

## Three.js

- 上游：[mrdoob/three.js](https://github.com/mrdoob/three.js)
- 固定版本：`r180`，npm 包版本 `0.180.0`
- 对应 commit：[`0af9729d0c143a86a1d725d6e2c3ad83301f3f34`](https://github.com/mrdoob/three.js/commit/0af9729d0c143a86a1d725d6e2c3ad83301f3f34)
- 许可证：MIT
- 版权：Copyright © 2010-2025 three.js authors
- 原始许可证：[上游 r180 LICENSE](https://github.com/mrdoob/three.js/blob/r180/LICENSE)
- 随项目保存的全文：[assets/three-LICENSE.txt](assets/three-LICENSE.txt)

本地演示的 `web/vendor/` 保存 Three.js 官方发布构建与 `examples/jsm` addon（模型/HDR 加载、Water、RoundedBoxGeometry、后处理和着色器）。库文件来自固定 r180，未修改上游库代码。分发本项目时应一并保留 MIT 版权与许可文本。

## RobotExpressive 导览角色

- 来源：[Three.js r180 RobotExpressive](https://github.com/mrdoob/three.js/tree/r180/examples/models/gltf/RobotExpressive)
- 模型作者：Tomás Laulhé / Quaternius；修改与 glTF 整理：Don McCurdy
- 许可证：CC0 1.0，见[保存的上游声明](web/assets/guide-README.md)
- 本地文件：`web/assets/guide.glb`；运行时改为米白与绿色材质，并使用已有骨骼动作混合。

## Poly Haven HDR 与混凝土

以下素材按官方声明使用 CC0，保存为本地资源：

| 素材 | 作者 | 文件 |
| --- | --- | --- |
| [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal；天空编辑 Jarod Guest | `web/assets/coastal-day.hdr`，1k HDR |
| [Qwantani Sunset (Pure Sky)](https://polyhaven.com/a/qwantani_sunset_puresky) | Greg Zaal；天空编辑 Jarod Guest | `web/assets/coastal-sunset.hdr`，1k HDR |
| [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel | `concrete-color.jpg`、`concrete-normal.jpg`、`concrete-roughness.jpg`，1k |

来源 URL、字节数与 SHA-256 保存于 [web/assets/manifest.json](web/assets/manifest.json)。混凝土在应用着色时降低颜色图的对比度，保留法线与粗糙度变化。木纹、叶片、水面法线与展亭画作为本地程序生成。

## Porto Lume 参考应用

[Porto Lume](https://porto-lume-worlds.vercel.app/#world=solstice&room=commons) 用于在线观察与实现原理研究。本项目没有确认其应用源码、页面设计、素材或人物模型的复用许可证，未复制其发布 bundle、CSS、GLTF 模型或场景资源。研究笔记中列出的公开资源 URL 仅为证据引用。

参考应用公开代码把人物标注为 Renderpeople Nathan。该标注不构成素材复用授权；本项目没有复制它。主展示使用上述 CC0 导览员，基础参数实验保留程序化几何人物。

## Trystero

[Trystero 官方仓库](https://github.com/dmotz/trystero)用于理解参考应用的多人发现和 WebRTC 通信。本地演示没有复制或分发 Trystero 库，只用原创文字和流程说明解释其作用。

## 本项目原创内容

本项目的场景布局、程序人物、建筑与展品几何、路线、交互实验、界面样式和中文教学说明为原创实现。Three.js 的 MIT 许可只描述该第三方库，外部模型和纹理分别遵循以上许可，不自动为参考应用或本仓库其他文件授予许可。
