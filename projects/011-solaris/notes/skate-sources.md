# 滑板动作研究场：原资产与动作边界

核查日期：2026-10-05。本场景候选是 Kenney 创作的 **Mini Skate 1.2** 完整风格化资产集，使用作者已有角色、滑板与公园模型。它适合做完整的滑板动作交互场景；角色外观是原作者的低多边形卡通设计，不代表真人扫描或动作捕捉。素材核查通过不等于产品交互已验收；C32 的接入状态、实际鼠标操作和接触质量由场景验证记录另行确认。

## 来源、许可与完整保留

- [Kenney 官方 Mini Skate 页面](https://kenney.nl/assets/mini-skate)：20 模型、动画、CC0，更新 1.2 明确增加角色骨架。
- [作者在 itch.io 的发布页](https://kenney-assets.itch.io/mini-skate)：作者明确分发带动画角色与 OBJ / FBX / glTF 格式；许可为 CC0，可用于商业项目。
- [官方原 ZIP](https://kenney.nl/media/pages/assets/mini-skate/00b0c2b304-1709221152/kenney_mini-skate.zip)：721,232 字节，SHA-256 `82582f6de507e93090c16bb4802a7c361015fe246eddd571e6e96f816b12e8c6`。
- 原包许可保留在 `web/assets/skate/original/License.txt`，原 ZIP 在 `web/assets/skate/kenney_mini-skate.zip`，完整原始文件在 `web/assets/skate/original/`。作者预览图和示例也属于原包，不能当作本产品运行截图。
- `web/assets/skate/manifest.json` 登记全部 133 个原包 / 运行副本文件的字节数和 SHA-256，以及每个原 GLB 的网格、三角形、骨架和动作片段。运行用 GLB 与色彩图是逐字节相同的原文件副本，没有置换皮肤、重绘纹理或重造角色网格。

运行资产为 20 个 GLB 加一张原色彩图，共 **574,065 字节、2,563 三角形**。保留全原包、完整解压和运行副本的文件合计 4,006,047 字节；这个数包含重复的 GLB、FBX、OBJ 和作者预览，不是初始网页下载量。

## 运行路径

| 用途 | 项目路径 | 字节 | 三角形 |
| --- | --- | ---: | ---: |
| 男孩骑手 | `web/assets/skate/models/character-skate-boy.glb` | 190,900 | 419 |
| 女孩骑手 | `web/assets/skate/models/character-skate-girl.glb` | 190,388 | 408 |
| 滑板 | `web/assets/skate/models/skateboard.glb` | 21,060 | 240 |
| 原角色和场景色彩图 | `web/assets/skate/models/Textures/colormap.png` | 见 manifest | 512 × 512 PNG |

GLB 通过相对 URI `Textures/colormap.png` 引用原材质；纹理必须保留在模型目录下，不能只部署 GLB。模型没有 Draco / Meshopt 解码依赖；原材质使用 metallic=0 的 PBR 色彩图和双面设置。

同目录还包含 `bowl-corner-inner`、`bowl-corner-outer`、`bowl-side`、`floor-concrete`、`floor-wood`、`half-pipe`、`obstacle-box`、`obstacle-end`、`obstacle-middle`、`pallet`、`rail-curve`、`rail-high`、`rail-low`、`rail-slope`、`steps`、`structure-platform`、`structure-wood` 共 17 个原公园 GLB。完整组件让场景沿用统一设计语言；出现护栏、台阶或碗池不代表已实现 grind、坡面滑行或跳越障碍。

## 原坐标与真实骨架

原 GLB 是 glTF 的右手坐标系，**Y 向上，板的长边沿 Z**。板原包围盒为 `x [-0.15,0.15] / y [0,0.1366025358] / z [-0.35,0.35]`；顶部独立轮廓顶点都位于 `y=0.1366025358` 的水平板面。这里的单位描述原风格化模型，不能作为实物板或人体测量。

每个角色保留 `body-mesh`、`head-mesh` 两个真实蒙皮网格，两个 skin 都引用相同七个关节：

```text
character-skate-boy / character-skate-girl
  root
    leg-left
    leg-right
    torso
      arm-left
      arm-right
      head
  body-mesh (skin 0)
  head-mesh (skin 1)
```

原资产没有膝盖、脚、踝关节，也没有与板绑定的板骨骼。`leg-left/right` 是整段腿的旋转关节；滑板是独立网格，没有 skin 或动作。原角色加原动作可以做真实骨架姿态组合，但不能因此宣称专业脚部 IK、真人生物力学或已经存在的完整 ollie。

## 原片段名称与时长

两角色分别有完全同名的 **29 个片段**，合计 58 个角色片段实例，不能说 58 种动作。秒数取原 glTF 时间 accessor 的最后采样；下表四舍五入到六位。原始精确值保留在 manifest。

| 片段 | 秒 | 片段 | 秒 |
| --- | ---: | --- | ---: |
| `static` | 0.100000 | `idle` | 1.333333 |
| `walk` | 0.666667 | `sprint` | 0.500000 |
| `jump` | 0.500000 | `fall` | 0.333333 |
| `crouch` | 0.166667 | `sit` | 0.166667 |
| `drive` | 0.166667 | `die` | 0.333333 |
| `pick-up` | 0.333333 | `emote-yes` | 0.666667 |
| `emote-no` | 0.666667 | `holding-right` | 0.166667 |
| `holding-left` | 0.166667 | `holding-both` | 0.166667 |
| `holding-right-shoot` | 0.200000 | `holding-left-shoot` | 0.200000 |
| `holding-both-shoot` | 0.200000 | `attack-melee-right` | 0.416667 |
| `attack-melee-left` | 0.416667 | `attack-kick-right` | 0.533333 |
| `attack-kick-left` | 0.533333 | `interact-right` | 0.666667 |
| `interact-left` | 0.666667 | `skate` | 0.516667 |
| `skate-stand` | 0.500000 | `skate-air` | 0.666667 |
| `skate-grab` | 0.500000 | — | — |

**关键结论：** 没有命名为 `ollie`、`takeoff`、`land` 的原片段。`skate-air` 的 root 没有平移，首尾足底姿态相同；它是循环腾空姿态，不是已经带上升与落地的完整动作。`jump`、`fall` 的名称也不能代替滑板起落验收。`crouch` 原姿态弯起一腿，并非双脚贴板的专用预备动作；`skate` 是单脚蹬地动作，右脚会低于原地面，不能当作双脚固定在板上的循环姿态。

## 贴板与片段组合研究

校验器用原顶点、原 inverse-bind 矩阵和原动画采样，计算原脚底顶点的世界位置。取原网格 `y<=0.001` 且单腿权重超过 0.9 的底面顶点；这些是几何采样点，**不是脚关节、碰撞体或物理接触求解**。男孩左底面 12 顶点、右底面 18 顶点。女孩的数量分别按原网格独立计算。

男孩 `skate-stand` 的两底面中心约为 `[0.097798,0,-0.022657]`、`[-0.089345,0,0.015478]`，整个片段底面保持水平，root 自带约 10° Y 旋转。足间方向接近 X；板保留原几何，可通过实例根节点绕 Y 调整长边来匹配横向站姿。

`skate-air` 开始时两中心约为 `[0.074771,0.048056,-0.045605]`、`[-0.108504,0.058829,-0.060423]`；中点约为 `[0.057325,0.055632,-0.062778]`、`[-0.104177,0.069716,-0.078728]`。两脚原底面已发生倾斜，直接由 stand 切到 air 会跳变；给角色和板相同竖直位移也不会自动形成足底接触。

因此受控实现需要自己的手势阈值、预备 / 上升 / 腾空 / 下降 / 恢复状态、原片段混合、板与角色的位置关系和地面落位。可以限定平地跳跃、保留原皮肤及骨骼，明确说明为“作者原骨架姿态 + 本地姿态混合与受控轨迹”。起跳贴板、空中相对位置、落地足底与板面、取消后稳定恢复、重复操作必须在最终实际浏览器中分别观察并记录；检查素材和播放一次动作不能代替这些结果。

## 重复核查

```sh
node projects/011-solaris/scripts/verify-skate-assets.mjs
node projects/011-solaris/scripts/verify-skate-assets.mjs --report
```

2026-10-05 检查通过：133 个源 / 副本文件的完整性、20 个 GLB 与原 GLB 逐字节一致、21 个运行文件、2,563 三角形、全部索引与有限顶点、两角色权重归一、7 关节、29 片段、合法时间序列、原材质相对纹理及关键动作时长。`--report` 只额外写入 `web/assets/skate/rig-analysis.json`，保留男孩 / 女孩各七种关键片段的五个原始采样姿态。

当前 011 项目此前所有 11 个 GLB / glTF 都没有 skin 或动画，不能复用为水下潜水员或骑手。本轮真正补齐滑板角色与器材来源。C30 的 [Khronos BarramundiFish](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/BarramundiFish/README.md) 是明确 CC0 的完整静态鱼；[Quaternius Animated Fish](https://quaternius.com/packs/animatedfish.html) 明确提供七种带动画水生动物，适合作为另一个风格化候选。C31 仍未补齐带装备的潜水员和匹配水下动作；通用人体游泳库不能直接视为专业潜水员资产。C30 / C31 保持独立待接入，不能因滑板角色落地或简单曲线跟随提前计完成。

只读检查同一工作区其他项目发现，`014-tidewater/web/runtime/models/characters/joe.glb`（80 关节、4,743,204 字节）和 `marta.glb`（81 关节、5,507,076 字节）确有完整真人风格人体骨架，原项目保留 Microsoft Rocketbox MIT 许可与归属。现有两个文件都只有七个 idle / talk / wave / shrug 片段，没有水下或滑板动作，也不是带潜水装备的人物；本轮没有复制或改动它们。`004-threejs-worlds/web/assets/guide.glb` 是 CC0 RobotExpressive 导览机器人，两个 skin 各 43 关节、14 片段；其 Jump / WalkJump 不能变成真实潜水员或骑手来源。该工作区其他项目的鱼和鲸使用程序几何，并不是已授权完整动物骨架文件。因此不能写“本地所有项目没有骨架”，但 C31 所需的完整潜水角色 + 装备 + 匹配水下动作仍有明确缺口。
