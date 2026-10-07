# 影像工作台素材与尺度边界

本次扩展采用两张真实、高清、原作者公开的 X-ray JPEG，分别展示手部与胸部侧位。素材用于验证 **C22：影像缩放/平移与视口定位**、**C23：图像坐标测量和标注**。素材本身不验证临床诊断、病症识别或医学测量准确性。

来源和许可已于 2026-10-04 核查原作者的文件页：

- [手部 X-ray，Mikael Häggström，CC0 1.0](https://commons.wikimedia.org/wiki/File:X-ray_of_normal_hand_by_dorsoplantar_projection.jpg)：1466 × 2082，505312 字节。
- [胸部侧位 X-ray，Mikael Häggström，CC0 1.0](https://commons.wikimedia.org/wiki/File:Normal_lateral_chest_radiograph_(X-ray).jpg)：1769 × 2453，1114909 字节。

两张原片已实际查看，未见患者姓名、编号或联系方式；JPEG ASCII EXIF 文本属性检查未发现文本属性。手部图片有原始方向/定位小标记。页面展示使用中性的“手部 X-ray”“胸部侧位 X-ray”名称，不把来源页标题或描述当成产品诊断结果。

文件保存在 `web/assets/imaging/`，运行时只读取本地资源。`manifest.json` 记录原始下载地址、页面固定版本、作者、许可、校准状态和 SHA-256；`credits.md` 提供人可读的归属和限制。原始 JPEG 没有经过本地裁剪、绘制标尺、AI 生成或格式转换。胸部图像使用来源页当前原片，来源版本历史记录其原作者曾裁剪垂直边界。

## 测量单位

素材是 JPEG，未提供可靠的设备 PixelSpacing。初始两点长度应以 **原图像素**计算，单位明确显示 `px`。缩放/平移/旋转改变显示变换，不能改变同一段标注的原图坐标与像素长度。若支持毫米，应由用户选取图上已知长度、输入其毫米值后建立手动比例，结果标记为“用户校准”。重新选片必须清空或分开保存该校准，不能沿用另一张图的比例。

JPEG DPI、作者拍摄日期、人体部位估算都不能作为物理尺度来源。默认数据 `pixelSpacing: null`、`calibration: "unknown"`、`defaultMeasurementUnit: "px"` 应保持诚实，不能用通用假值掩盖缺失数据。

## 素材验证

运行 `node projects/011-solaris/scripts/verify-imaging-assets.mjs`，校验 2 张 JPEG 的 SHA-256、字节数、JPEG SOF 尺寸、结尾标记、许可/来源字段与未校准默认值。此脚本验证素材完整性；功能行为仍需状态测试和真实网页鼠标操作验证。
