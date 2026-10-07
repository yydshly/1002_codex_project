# Car Concept · 本地汽车展厅资产

模型和纹理：Eric Chadwick，© 2024 Darmstadt Graphics Group GmbH，按 [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) 使用。

官方资产来源：[Khronos glTF Sample Assets / CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)。资产的逐项许可保留在 `metadata.json` 和 `CC-BY-4.0.txt`。原模型包含 Khronos 与 3D Commerce 标识，其使用条件保留在 `Khronos-legal-mark.txt`；模型许可不会授予将这些标识用于其他上下文的权利。

`CarConcept.glb` 由官方无压缩 glTF、原始几何和 14 张 PNG 纹理嵌入构建而成。未重建几何，未修改纹理、材质参数、零件层级或铰链。仅将外部文件封装到一个本地 GLB，移除网络和压缩解码器依赖。下载来源文件和最终 GLB 的 SHA-256 保留在 `manifest.json`。运行时资源均可本地使用。

## 已核查部件

| 用途 | 节点/材质 | 接入说明 |
| --- | --- | --- |
| 引擎盖 | `BodyHood` | 原模型前端低位铰链，沿节点自身 X 正轴转动 0–60°。保留五个子部件。 |
| 内部机械 | `Engine` | 原资产简化机械舱网格，和引擎盖为兄弟节点；开盖时留在车身内。60 个三角形配合烘焙法线和 ORM 贴图，不作真实发动机构造或检修演示。 |
| 前灯 | `BodyHeadlights` / `Headlight` | 原模型前灯位于引擎盖子树，发光材质和实际补光应一起随盖联动。 |
| 尾灯 | `BodyTaillights` / `Brakelight` | 原始红色发光材质，可单独切换。 |
| 车门 | `BodyDoorLColor1`, `BodyDoorRColor1` | 带原始铰链和子树，本次不因此宣称已接入车门操作。 |
| 原装外观 | `KHR_materials_variants` | Carmine Candy / Pearly Swirly / Torched Graphite。 |

坐标和实际尺寸由 glTF accessor 与节点世界矩阵测得，完整信息见 `inspection.json`。GLTFLoader 已通过 `BodyUnderside` 根矩阵把 Z-up 转为 Y-up，场景不要重复旋转。未额外缩放时，原始包围盒尺寸为宽 2.71616 m、高 1.30795 m、长 4.35739 m；尺寸指资产几何范围，并非量产车型规格。车头朝世界 +Z。让资产水平居中并落地时，外层 Group 平移 `[0.00521695, 0.15929904, -0.23846179]`。

`BodyHood` 世界铰链在未居中时约为 `[0, 0.176015, 2.379389]`。其原始局部旋转为单位旋转，沿 X 正向抬起至 60° 会打开车头盖并显露独立 Engine 网格。不是围绕网格中心缩放或翻转。

整车共 213,347 个三角形。开盖交互可展示这辆概念车的原装机械舱；原模型未提供完整发动机零件、流体或机械仿真，UI 与接入清单应保留这一界限。

## 构建和核查

```powershell
node projects/011-solaris/scripts/car-download.mjs
node projects/011-solaris/scripts/car-inspect.mjs --write
node projects/011-solaris/scripts/verify-car-assets.mjs
```

下载脚本使用项目内 `.cache/car-source` 缓存已完成资源。检查脚本验证 GLB 校验和、嵌入 PNG、独立引擎与灯光层级，以及逐项许可文件；不将构建检查当成浏览器视觉或交互验收。
