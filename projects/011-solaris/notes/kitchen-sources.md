# 料理工作台 · 食材资产来源

核查日期：2026-10-05。采用 Poly Haven 的四个真实食材三维资产及原始 PBR 贴图，没有把预览图片或基础球体当作食材模型。

| Runtime ID | 官方资产 | 作者 | 交付 |
|---|---|---|---|
| avocado | [Food Avocado 01](https://polyhaven.com/a/food_avocado_01) | Oliver Harries | 原始整颗成熟鳄梨，带皮、未切开 |
| onion | [Yellow Onion](https://polyhaven.com/a/yellow_onion) | Kuutti Siitonen | 原始整颗黄洋葱，纸质外皮保留 |
| lemon | [Lemon](https://polyhaven.com/a/lemon) | Kuutti Siitonen | 原始整颗柠檬，未切片 |
| apple | [Food Apple 01](https://polyhaven.com/a/food_apple_01) | Oliver Harries | 原始整颗红苹果，带果梗 |

[Poly Haven 官方许可](https://polyhaven.com/license) 明确所有模型和纹理资产使用 CC0，允许商用与再分发。每个资产页面也显示 CC0 和作者；`LICENSE.md` 保留官方链接与署名。公共 API 请求仅用于构建阶段，通过独立产品 User-Agent 读取公开文件清单；[API 条款](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) 允许获取资产用于产品，本地运行不依赖该 API。

使用 API `files/{sourceId}` 明确提供的 **1k glTF**：每个模型保留原 glTF、原几何 BIN 和三个 1024×1024 JPEG 纹理。不是自行截取网页预览，也没有纹理重绘、网格简化、切片或生成替换。完整文件 URL、官方 MD5、实际 bytes、SHA-256、源节点转换后的包围盒和三角数均记录于 `web/assets/kitchen/manifest.json`。`scripts/verify-kitchen-assets.mjs` 在本地检查所有引用、顶点、索引、贴图尺寸和摘要；真实浏览器加载与拖动验收另记。

这四项适合备料台的食材选择、拖放、器皿布局和配方输入验证。它们是完整食材，不能宣传为已经洗净、去皮、切丁的成品沙拉；模型没有刀切、剥皮、搅拌的原始动画。glTF 长度单位描述的是该模型样本，不是重量或营养；配方克数需由产品单独录入与验证，不从网格体积推算。陶瓷碗与料理台若由产品绘制，应独立描述为展示组件。
