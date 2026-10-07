# ATELIER 0.8.0 — 精选设计商店的真实素材与能力边界

核查日期：2026-10-05。该场景复用已下载、登记的六件 Poly Haven 家具模型，新增下载为零。模型及原 PBR 贴图共 12,410,834 字节；加摄影环境 HDR 后共 13,845,953 字节、37 个本地文件。全部几何共 62,824 个三角形、24 张 1024 × 1024 JPEG 贴图。资产不是用简单几何体替代的家具，也没有通过外部模型后台生成。

## 本地复用清单

所有模型的根 glTF 都在 `web/studio/assets/models/<source>/<source>.gltf`。完整二进制及贴图保留在同一资产目录；每个文件的下载地址、字节数与 SHA-256 使用既有 `web/studio/assets/manifest.json`，本轮不另造来源登记。

| 商店 ID | 来源模型与官方页面 | 原作者 | 原始外观和说明 | 三角形 / 材质 / 贴图 | 本地模型总字节 |
| --- | --- | --- | --- | --- | --- |
| sofa | [sofa_02](https://polyhaven.com/a/sofa_02) | Kirill Sannikov | 木框、扣饰皮革沙发；表面保留原有使用痕迹 | 2,728 / 1 / 3 | 427,171 |
| chair | [modern_arm_chair_01](https://polyhaven.com/a/modern_arm_chair_01) | Vibrant Nordic | 木扶手椅、黑色软垫；椅架和坐垫各自材质 | 8,916 / 2 / 6 | 2,698,032 |
| table-glass | [modern_coffee_table_01](https://polyhaven.com/a/modern_coffee_table_01) | Amin | 长形茶几，木结构和石质台面；内部历史 ID 含 glass 不代表玻璃材质 | 4,504 / 1 / 3 | 1,331,297 |
| table-solid | [modern_coffee_table_02](https://polyhaven.com/a/modern_coffee_table_02) | Amin | 方形茶几，深色基座与木质几何嵌饰 | 13,645 / 2 / 6 | 2,955,725 |
| lamp | [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) | Kuutti Siitonen（建模、贴图）；Yann Kervran（源项目骨架） | 弹簧关节灯臂和桌夹；当前 glTF 没有动画片段，商店仅观察其既有姿态 | 24,102 / 2 / 3 | 2,875,984 |
| plant | [potted_plant_04](https://polyhaven.com/a/potted_plant_04) | James Ray Cock | 陶盆小型斑马十二卷多肉，四个网格连同叶片完整保留 | 8,929 / 1 / 3 | 2,122,625 |

上述素材与环境均采用 [Poly Haven 的 CC0 资产许可](https://polyhaven.com/license)，可以本地存储、修改及再分发。其网站示例渲染、品牌标识、头像和文案另受保护；本项目商品图由本地已授权模型自行渲染，没有保存或复用网站预览图片。

`web/studio/assets/environment/coastal-day.hdr` 来自 [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)，作者 Greg Zaal / Jarod Guest，1,435,119 字节。SHA-256 为 `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`。该图只是摄影照明来源，不表示家具拍摄地点或实物出处。

## 自有摄影渲染

`web/collection/render-products.js` 通过本地 importmap 加载 Three.js、GLTFLoader 和 HDRLoader；读取上述完整源模型，保留原网格、节点、材质数值及贴图。不重新生成家具、不增加假冒品牌标识、不置换皮革、木材或石材贴图。

模块只创建一个可复用的离屏 WebGLRenderer，按需输出 900 × 650 PNG dataURL，无连续动画循环。浅暖灰地面、真实投影、HDR 环境与自有主光 / 补光形成一致的产品摄影。每件物体先等比居中落地，再根据完整包围盒适配相机；正面、侧面、斜视三种角度使用同一几何和材质。正面沿用客厅中原始 +Z 朝向，侧面为 +X 朝向，实际可读性由最终浏览器视图验收记录确认。

API：`await createProductRenderer()` 返回 `{ images, render(id, view = 'three-quarter'), dispose() }`。`images` 初始包含六个 ID 的斜视图；`render` 支持 `three-quarter`、`front`、`side`，同步生成对应图片；`dispose` 释放几何、纹理、摄影资源和 WebGL 上下文。不同图片中的等比显示尺寸不代表实物彼此同高或同宽。

官网素材的尺寸标注描述三维资产。尤其植物原页为约 0.3 米的小型盆栽，不能把旧客厅中的展示缩放当成真实 1.18 米商品。本场景没有核实制造商、商标、实物规格、价格、库存、配送或交易系统；呈现的是设计素材陈列与鼠标操作验证。

## 本轮能力验证范围

- **C05 商品陈列**：用真实家具图验证将某个稳定商品 ID 放入陈列位置、占用槽位时交换、合法落点预览、撤销与取消。渲染只是商品外观；放置事务应在商店状态模块完成。陈列不应修改客厅摆放、家具原几何或其他场景的收藏状态。
- **C33 显式偏好适配**：用户主动选择偏好，基于可核实的外观 / 类别标签与规则产生排序或陈列建议，并显示对应原因。保留已有选择和布局；使用有限偏好规则，不声称识别潜在意图或提供未知材质性能、环保认证、真实价格优势。
- **C35 已建场景转场**：把有限目标选择映射到已经存在的客厅、汽车展厅、影像工作站、地标馆、料理台、创作台。验证进入、取消、返回及独立场景状态恢复。其他场景作为体验入口，不混入家具商品库存；不承诺任意文本生成一个全新场景。

该文档记录素材及渲染模块边界。上述鼠标事务、偏好结果和转场的完整验收应以主任务的实际浏览器操作、状态断言和独立验证记录为准，不能由素材校验结果代替。

## 完整性校验与质量风险

运行 `node projects/011-solaris/scripts/verify-collection-assets.mjs`，离线读取上游 manifest：检查 37 个文件的 CC0 / 官方下载来源、SHA-256 和字节数；检查 glTF 2.0、完整本地资源引用、24 张 1k JPEG、全部 PBR 材质贴图、有限顶点、索引范围、完整节点树、原始包围盒和三角形数量。模型均无 Draco / Meshopt / KTX 解码依赖，也没有动画片段。2026-10-05 校验通过；渲染模块通过 `node --check`。浏览器的正面、暗部、材质和三角度视觉检查另行记录。

1k 贴图适合卡片和本轮 900 × 650 观察图片，极近距离看细节会受分辨率限制。沙发带旧化皮革、木框扶手椅较简洁、灯为桌夹灯：这是各原始模型的真实外观，不应靠修改名字假装相同品牌系列。所有六件保留原始节点和完整材质，统一摄影风格负责版面一致性。

与水下场景比较，[Khronos BarramundiFish](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/BarramundiFish/README.md) 是 Microsoft 的 CC0 完整纹理鱼，约 3,864 个三角形，适合有界拖动与朝向实验，但原资产没有骨架、鳍动作或游泳片段。专业潜水员骨架 / 游泳动作的已发现来源为付费或无法明确再分发许可的资产，缺口尚未解决；本轮先交付已有授权素材能支持的陈列、显式偏好与转场，水下跟随不会冒充已完成。
