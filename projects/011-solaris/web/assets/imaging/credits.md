# 影像素材来源

本目录保存两张真实放射影像 JPEG，用于图像视口和标注交互验证。两张图像均由原作者 Mikael Häggström 在 Wikimedia Commons 以 **CC0 1.0** 公开，许可允许复制、修改与商业使用。运行时读取本地文件；页面不依赖远程图片。

| 本地文件 | 原片尺寸 | 原作者来源页 | 许可 |
| --- | --- | --- | --- |
| `sample-hand.jpg` | 1466 × 2082 | [手部 X-ray 原片](https://commons.wikimedia.org/wiki/File:X-ray_of_normal_hand_by_dorsoplantar_projection.jpg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `sample-chest-lateral.jpg` | 1769 × 2453 | [胸部侧位 X-ray 原片](https://commons.wikimedia.org/wiki/File:Normal_lateral_chest_radiograph_(X-ray).jpg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

下载与许可核查日期：2026-10-04。原始文件没有本地裁剪、重绘或 AI 修改；胸部图像采用原作者在来源版本历史中记录过裁剪的当前版本。`manifest.json` 保留页面版本、原图下载地址、文件尺寸和 SHA-256，便于复核。

实际查看了完整图片：未见姓名、患者编号或联系方式；手部影像仅可见方向/定位小标记，胸部影像没有文字覆盖。JPEG ASCII EXIF 属性检查未发现文本属性。这是素材核查记录，不代表临床数据匿名化认证。

**尺度信息：**两张图像都没有可核实的 DICOM PixelSpacing。不得把 JPEG DPI、图像宽度或解剖比例转换为毫米。默认测量应标记为原图像素 `px`；只有用户标记一段已知长度并输入对应毫米后，才可显示“用户校准”的毫米结果。示例不附带虚构标尺，也不进行诊断或病症解释。
