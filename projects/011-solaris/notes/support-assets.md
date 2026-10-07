# 新桌支撑试验：源资产与统一尺寸约定

准备日期：2026-10-07。本文只记录源资产准备，不记录支撑算法的通过结果。三份资产在检测运行前选定并登记；本脚本未运行台面检测、底座覆盖或摆放搜索。几何规则须先冻结，再单独批量验证。下载成功不等于新桌支撑能力已通过。

## 三个独立设计

| 素材与官方来源 | 作者 | 选择依据 | 本地运行文件总量 |
| --- | --- | --- | --- |
| [Round Wooden Table 02](https://polyhaven.com/a/round_wooden_table_02) | Ulan Cabanilla | 圆台面与中心支座的独立木桌设计 | 1,921,292 B |
| [Wooden Table 02](https://polyhaven.com/a/wooden_table_02) | Serhii Khromov | 矩形台面、四条直腿的独立乡村木桌设计 | 485,316 B |
| [Coffee Table 01](https://polyhaven.com/a/CoffeeTable_01) | Fernando Quinn | 带雕刻桌腿与抽屉的独立复古茶几设计 | 957,812 B |

这三份是第三方实际制作的桌模型，不是本项目生成的简易桌几何。它们来自不同作者、不同原始设计，不是已有 `modern_coffee_table_01/02` 的换材质、变形或另一个导出版本。前述两份旧桌只可计入回归，未计入此次三份新模型。

全部运行文件为 3,364,420 B（约 3.21 MiB），另有原 API 元数据快照。选用官方 1k glTF：每个包保留 glTF、其原二进制网格与三张原 1k JPG 纹理；没有改变三角片、材质或原节点变换，也没有在源文件里补台面或摆放点。glTF 文件的本地名称简化为 `<id>.gltf`，其文件字节与官方 `<id>_1k.gltf` 完全一致；官方 1k 导出引用的 `.bin` 来自官方共享的 `gltf/4k` 路径，这是 API 原清单所指的网格，不是本项目自行替换。

准备阶段仅检查格式与依赖完整性：三份 glTF 2.0 均为静态、非压缩三角网格，无动画、骨骼和形变。三份都是单节点、单网格文件，不能据此声称真实样本覆盖了复杂嵌套节点。源描述也没有证明存在台面贯通孔洞或凹边；孔洞、窄缝、嵌套变换等需在另外明确标注的几何夹具中验证，夹具不能代替这三份真实资产。

## 来源、许可与指纹

来源与许可按 [Poly Haven 官方许可](https://polyhaven.com/license) 核验，模型为 CC0-1.0，可在产品内重分发。素材来源和作者保留在运行 manifest，并在试验网页内展示 Poly Haven 来源说明。

下载通过 [Poly Haven 官方公开 API](https://polyhaven.com/our-api) 进行，使用专属 `AtelierSupportWorkbench/0.18 asset-build` User-Agent；产品运行期只读取随站点提供的本地文件，不依赖在线 API、远端推理或模型后台。

[web/support/assets-manifest.json](../web/support/assets-manifest.json) 包含每份原始 glTF/bin/纹理的官方 URL、真实文件大小、SHA-256、官方 MD5，以及 `/info/{id}`、`/files/{id}` 原响应的本地快照和 SHA-256。下载时同时核对官方文件大小和 MD5；离线复核逐文件核对本地 SHA-256。

每份源包另保存 `sourceFingerprint`：对全部运行文件按 `en` locale 路径排序，以 UTF-8 的 `path:sha256` 加 LF 形成清单，再计算 SHA-256。API 的下载次数等元数据不参与源包指纹，避免元数据变化被误称为几何变化；元数据自身仍单独留有指纹。

| ID | 源包 SHA-256 |
| --- | --- |
| `round_wooden_table_02` | `08123cf8e768b40e25adb35a07baf30d79390e3dec400aa748940cf51ac1948f` |
| `wooden_table_02` | `0ceaca88200d995ae75caf513b2dbc01937cc9d52bcdb2fd7ac33e083de6e1a3` |
| `CoffeeTable_01` | `a99f30644b6a7d4890006bc482dc33364c4700b44a87a028039e3170b3cb5fc2` |

## 单位与统一归一化

`table-height-075-v1` 是全部新桌共用的尺寸规则。依据 [Khronos glTF 2.0 单位与坐标规定](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)，源空间按米及 +Y 向上解释。不凭模型包围盒数值猜测厘米或米，不按某个模型另设单位。

先应用完整源节点变换，再用全部实际源网格的包围范围计算同一个正均匀尺度：

```text
s = 0.75 / (maxY - minY)
x' = s × (x - (minX + maxX) / 2)
y' = s × (y - minY)
z' = s × (z - (minZ + maxZ) / 2)
```

0.75 m 是本试验统一指定的产品设计总高，不是这三张桌子的实测高度，也不是自动推断出的原始物理尺寸。该规则整体等比缩放，保留桌子的实际比例、原节点组织及台面几何；不会按模型改造顶面、压平网格或改变材质来使检测通过。

具体归一化矩阵由共同的提取模块在运行时计算并记录在分析证据内。资产登记不填专属矩阵、手写台面、高度、候选面列表、锚点或检测公差。本说明里的 `maxY` 仅服务于统一尺寸归一化，不能被当成已识别的台面高度。

## 运行范围与复现

第一阶段的注册素材范围包括静态 glTF 2.0 及其本地外置 bin/纹理；不要求将原 glTF 重新打包为 GLB。本项目现有 GLTFLoader 可加载这些本地 glTF 包。运行页面加载的入口均相对 `web/support/`：

```text
assets/models/round_wooden_table_02/round_wooden_table_02.gltf
assets/models/wooden_table_02/wooden_table_02.gltf
assets/models/CoffeeTable_01/CoffeeTable_01.gltf
```

资产准备脚本 [scripts/support-assets.mjs](../scripts/support-assets.mjs) 固定这三个 ID，不基于检测结果自动换样本或追加专属设置。源下载失败、原文件大小/MD5 不匹配、超出 10 MiB 单包预算或结构范围不支持时，写入 `rejected[]`，明确阶段与原因；不得隐藏或静默替换。本轮准备的三份源包没有失败记录，这只说明资产准备成功。

```powershell
# 首次下载缺少的官方源包；已有文件不会被静默覆盖。
node projects/011-solaris/scripts/support-assets.mjs
# 仅使用现存原 API 快照和源文件，重新生成 manifest。
node projects/011-solaris/scripts/support-assets.mjs --cached
# 不联网、不重写：逐项复核已登记大小、SHA-256 和静态文档范围。
node projects/011-solaris/scripts/support-assets.mjs --check
```

本轮实际运行下载命令与 `--check` 均成功退出；后者确认 3 个源包及全部 3,364,420 B 运行文件。脚本 `node --check` 通过。后续批量几何结果须另行记录冻结规则版本/指纹、运行样本、候选面、完整底座覆盖、非法放置与变换/保存恢复结果；本文件不代替该验收。

## 首轮灯资产语义失败与独立桌灯登记

首次冻结规则 `atelier-support-v1` 分析采用客厅原有 `desk_lamp_arm_01`。它的数学最低接触片投影约为 3.527 × 3.527 mm，六个三角片形成八角形。这不构成一个可靠的自由站立灯底语义：其 [官方说明](https://polyhaven.com/a/desk_lamp_arm_01) 明确为夹装（clamp-mounted）折臂灯，需要桌沿安装。最低螺丝等小平面即使满足三角并集覆盖，也不能被解释为实际阅读灯底座或真实支撑任务已经通过。

此发现作为首轮语义失败保留。不得放大原接触轮廓、移除夹具、压平原网格或按该灯调整冻结阈值来补成功结论；原报告须保留原灯指纹、原小接触片和全部桌候选/拒绝记录。它证明了一项边界：几何规则识别最低平面不等于自动理解模型的真实安装方式，模型入库需有明确的用途语义核验。

另外登记 [Industrial Pipe Lamp](https://polyhaven.com/a/industrial_pipe_lamp)，作者 Mateusz Sadek，官方分类为 `Lighting / Floor & Desk / Desk Lamps`。它是一份新的独立桌灯设计，不是夹装灯的修改版本。2026-10-07 已在真实浏览器检查其 [官方 clay 预览](https://cdn.polyhaven.com/asset_img/renders/industrial_pipe_lamp/clay.png?height=900&quality=95&v=f1e4be54)：可见一个完整的圆形重底座，底部无夹扣或伸出螺栓，六角/螺栓连接件在管与底座的上方连接处。这支持视觉上独立单底座的分类；官方来源与图片没有提供真实物理稳定性或无需固定的保证。是否具有合格完整接触平面仍由冻结几何规则另行验证，不靠目测直接判成功。

新增 [web/support/freestanding-lamp-manifest.json](../web/support/freestanding-lamp-manifest.json) 是直接资产对象，包含独立原 `info/files` API 快照、每文件大小与指纹、原 MD5、语义来源和首轮失败说明。本地入口为 `assets/models/industrial_pipe_lamp/industrial_pipe_lamp.gltf`，六个运行文件合计 2,408,199 B，源包指纹为 `01e4d4b647a45ba18551c091100306333b52c9f396726e82cd5f7668d81eda62`。保留 glTF、bin 与四张 1k 原 JPG，包括发光贴图；没有修改源文件。该静态包有三个节点/网格/三角 primitive，无动画、骨骼和形变；只有可选材质扩展 `KHR_materials_emissive_strength`，不是压缩或几何实例扩展。

灯的统一归一化仍为 +Y 向上、米单位、正等比缩放、X/Z 包围中心归零、最低 Y 落地；设计总高固定 0.52 m（`lamp-height-052-v1`），不是原模型实测高度。新灯使用与首轮同一冻结几何规则，不设置专属接触面、接触高度、轮廓、锚点或阈值。三个桌源资产及其指纹保持不变。用新登记灯再运行这三张已分析桌，应表述为同一固定桌集的第二次任务验证，不称为新三桌留出集，也不能抹掉首轮语义失败。

```powershell
# 仅准备独立桌灯；不重写三桌 manifest 或源文件。
node projects/011-solaris/scripts/support-assets.mjs --lamp
# 离线核对该灯源包，仍不运行接触几何检测。
node projects/011-solaris/scripts/support-assets.mjs --check --lamp
```

本轮实际桌灯下载与离线校验均成功退出，确认 2,408,199 B；三桌离线复核仍为 3,364,420 B，所有源包指纹保持。源材质发光只用于展示模型外观，不表示本试验实现了电学、照度、光照真实性或材料热效应。
