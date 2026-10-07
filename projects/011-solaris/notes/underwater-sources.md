# 水下拖鱼场景：素材来源与几何验算

核查日期：2026-10-05。本轮素材支持 C30「拖鱼改变位置」：完整单鱼、三块固定石礁与沙底布景。C31 潜水员跟随仍待接入，没有下载潜水员或加入鱼群跟随。交互、状态、边界与路径工具由本项目实现；鱼和石礁模型来自下面登记的作者。

## 完整鱼模型

采用 [Quaternius 官方 Animated Fish Pack](https://quaternius.com/packs/animatedfish.html) 的 `Fish3.blend / ClownFish`。官方页面标注 CC0；[作者在 OpenGameArt 的原始发布](https://opengameart.org/content/animated-fish) 提供同名源包、作者信息与 CC0 声明。原包也包含 `License.txt`，已经保留。

- 下载 URL：`https://opengameart.org/sites/default/files/Animated%20Fish%20Pack%20by%20%40Quaternius.zip`
- 原包：`assets/underwater-source-archives/original/animated-fish.zip`，1,024,233 字节，SHA-256 `c56a4bf3468e900ed9d881037334152dc203f93b656373347c8a7fc3dedb1855`。
- 运行模型：`web/underwater/assets/models/clownfish.glb`，74,532 字节，SHA-256 `a0d209e81a8ad1472013b9fcdb974bb4a785b0c375e8db30ea3fc6d87602cfbf`。
- 原始网格 345 个顶点、356 个多边形，按原面三角化后为 686 个三角形。GLB 保留全部面；导出时因材质与法线边界拆分渲染顶点，未减面或用基础几何替代鱼身、鱼鳍、尾部。
- 原 `Root / Spine1 / Spine2 / Spine3 / Tail / Face` 六骨节与 `Swim` 动作保留。原动作 0–31 帧、24 fps，对应约 1.291667 秒；导出 18 个通道，保留原骨架姿态，原根部位移恒定，不删除通道。
- 原资产使用 `Body / Stripes / Outline` 三组面材质颜色，无纹理图片。Blender 5.2.2 将旧版材质色明确写入 PBR 基色，保持橙色鱼身、浅色条纹和深色边线；运行材质设金属度 0、粗糙度 0.65。这是一份完整风格化模型，不能称照片重建、写实扫描或项目原创鱼模型。

GLTF 原坐标上方为 +Y、鱼鼻朝 +Z；登记源中心是 `[0, 0.3117998242378235, -0.8143562078475952]`。先在原坐标减去这个固定中心，再在外层绕 Y 转 `π/2`，鱼鼻朝 +X；之后采用统一比例 `0.073`，可与场景 `rotation.y = atan2(-dz, dx)` 的朝向规则一致。不能逐帧重新取包围盒中心，否则摆尾会引起场景锚点移动。

源 Blend 全网格采样 201 个姿态，中心校正与统一比例后 XZ 最大半径为 `0.28742293843461053`。独立解析导出的 GLB、按原蒙皮权重与动画通道再采样 201 个姿态，最大 XZ 半径为 `0.2874216457107428`，均小于登记鱼体半径 `0.30`。这是有限姿态采样，不是连续时间的数学上界证明，也不代表流体、生物运动或真实接触求解。

## 三块完整石礁

采用 [Kenney 官方 Nature Kit](https://kenney.nl/assets/nature-kit) 的 `rock_tallA / rock_tallB / rock_tallH`，官方页面和包内许可均标注 CC0。原 GLB 逐字节复制，保留全部几何与三个原材质区域。它们原为草盖石风格化资产，在水下场景作为美术布景使用，不宣称珊瑚扫描或真实海底岩样。

- 官方原包 URL：`https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip`
- 原包：`assets/underwater-source-archives/original/kenney-nature-kit.zip`，10,537,521 字节，SHA-256 `fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d`。

| 运行文件 | 原模型 | 字节 | 原完整几何 XZ 最大半径 | 原高度 |
| --- | --- | ---: | ---: | ---: |
| `models/rock-a.glb` | `rock_tallA` | 12,072 | 0.5219718549191058 | 0.9959259033203125 |
| `models/rock-b.glb` | `rock_tallB` | 14,060 | 0.477949488470043 | 0.8837795853614812 |
| `models/rock-c.glb` | `rock_tallH` | 7,792 | 0.3319359909867841 | 0.7107760310173035 |

各原模型的完整世界几何底部为 `Y = -0.05`。场景需按完整几何对齐地面，并分别设水平比例，使装饰几何落在固定障碍圆柱内；高度比例与水平比例可以分开。水域里的固定障碍是场景工具的保守约束包络，不能把原模型包围盒直接当作通用刚体碰撞器。

## 沙底 PBR 纹理

采用 [Poly Haven Sand 01](https://polyhaven.com/a/sand_01)，作者 Rob Tuytel，官方页面标注 CC0。通过 [官方文件元数据 API](https://api.polyhaven.com/files/sand_01) 获取原 1k JPG，文件保持原分辨率与压缩，不二次重采样；下载的字节数与官方 MD5 均已核对。

| 本地文件 | 通道与颜色空间 | 字节 | 官方 MD5 |
| --- | --- | ---: | --- |
| `textures/sand_01/sand_01_diff_1k.jpg` | Diffuse，sRGB | 485,088 | `c914c8edb419f040e04224081a3f79a5` |
| `textures/sand_01/sand_01_nor_gl_1k.jpg` | GL Normal，线性数据 | 877,821 | `369b82aa417c77ec85c4c07c4c7b60a0` |
| `textures/sand_01/sand_01_rough_1k.jpg` | Roughness，线性数据 | 189,667 | `663d0ddf782a427b7da4e247c939e73b` |

原纹理登记宽度 1.5m，内容为陆地压实沙土。场景在视觉上迁用于沙底，不把它当作水下实测或海洋环境数据。官方 HTTPS 文件 URL、SHA-256、MD5 和作者均记入 `web/underwater/assets/manifest.json`。

## 发布边界与已执行验证

`web/underwater/assets/` 仅包含四个模型、三张 JPG、许可、manifest 与源动作包络记录，共 12 个文件、1,675,391 字节。原 ZIP、完整解压包、导出脚本与官方纹理 API 原始 JSON 均保存在 `assets/underwater-source-archives/original/`，共 3,659 个文件、45,922,417 字节。运行页面不读取大原始包；原件位于 web 发布目录以外。

执行 `node projects/011-solaris/scripts/verify-underwater-assets.mjs`，11 项独立检查通过：主来源与许可、22 个登记文件大小/哈希、四模型嵌入数据与有限数值、鱼原面完整性、原六骨与动作通道、三原色区域、根部位移、201 姿态包络、三礁原件逐字节一致、礁完整几何包络和官方沙纹理 MD5/JPEG 验证。

源动作 Blender 采样在 `web/underwater/assets/motion-envelope.json`；导出及测量脚本与原模型一同存档。上面的验算不代替真实鼠标拾取、拖动、越界、障碍阻挡、停止、取消、撤销、保存、相机和截图验收。这些产品行为由场景实现与独立桌面验收记录说明。

渲染复用客厅既有 `web/studio/assets/environment/coastal-day.hdr`，对应 Poly Haven [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)，作者 Greg Zaal（原始 HDR）与 Jarod Guest（天空编辑），CC0；1,435,119 字节、SHA-256 `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`，已在客厅 `studio/assets/manifest.json` 和 `studio/THIRD_PARTY_NOTICES.md` 登记。本轮仅引用原文件，没有重复下载，不计入上述新增 12 文件 / 1,675,391 字节。场景海水颜色、沙底光斑与环境组合属于本地美术效果，不代表水体传播、折射或流体物理。
