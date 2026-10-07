# ATELIER 第三方依赖与资产

2026-10-05。本文件登记当前打包的图形基础库与内容资产。产品运行只读取本地文件；客厅 `assets/manifest.json`、汽车 [../assets/car/manifest.json](../assets/car/manifest.json) 、影像 [../assets/imaging/manifest.json](../assets/imaging/manifest.json) 、地标 [../assets/landmark/manifest.json](../assets/landmark/manifest.json) 与料理 [../assets/kitchen/manifest.json](../assets/kitchen/manifest.json) 分别保存来源、许可、大小及 SHA-256。

## Three.js r180

来源：[Three.js r180](https://github.com/mrdoob/three.js/tree/r180)。MIT，Copyright © 2010–2025 three.js authors。完整许可原文已随产品保存为 [vendor/LICENSE](vendor/LICENSE)。本地包包含核心模块、glTF/HDR 加载、OrbitControls、后处理和所需辅助模块。

Three.js 负责图形基础。对象语义、约束、校准、指针操作、状态事务、中文解析、上传、保存、方案比较及界面流程由本项目实现。

## Poly Haven 内容资产

资产依据 [Poly Haven 许可](https://polyhaven.com/license) 使用 CC0；不将网站预览图片视为同样授权。本产品下载 glTF、模型配套纹理、PBR 纹理与 HDR 原始文件，未使用网站预览渲染作为产品结果。

| 类型 | 上游资产 |
| --- | --- |
| 沙发 | [sofa_02](https://polyhaven.com/a/sofa_02) |
| 阅读椅 | [modern_arm_chair_01](https://polyhaven.com/a/modern_arm_chair_01) |
| 茶几 | [modern_coffee_table_01](https://polyhaven.com/a/modern_coffee_table_01) |
| 现代方形茶几，已接入型号替换 | [modern_coffee_table_02](https://polyhaven.com/a/modern_coffee_table_02) |
| 台灯 | [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) |
| 绿植 | [potted_plant_04](https://polyhaven.com/a/potted_plant_04) |
| 木地板材质 | [wood_floor](https://polyhaven.com/a/wood_floor) |
| 布料纹理 | [fabric_pattern_07](https://polyhaven.com/a/fabric_pattern_07) |
| 日间环境 | [kloofendal_48d_partly_cloudy_puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) |
| 黄昏环境 | [qwantani_sunset_puresky](https://polyhaven.com/a/qwantani_sunset_puresky) |

资产获取工具使用官方 [Public API](https://github.com/Poly-Haven/Public-API) 提供的文件地址；带产品 User-Agent，保存来源元数据。初次构建需要联网，已有资产可用 `scripts/assets.mjs --cached` 重建清单；正常使用不调用该 API。

模型按设计尺寸统一缩放，居中并落到放置面；坐具增加可编辑材质变体，沙发图集按三角形高度分离布料与木脚。房间、窗帘、地毯纹理、书本、杯子与三幅挂画为本项目构建。模型尺寸用于本场景设计，不是制造商产品规格。

## Khronos Car Concept

汽车展厅使用 [Khronos glTF Sample Assets / CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)。模型与纹理由 Eric Chadwick 制作，© 2024 Darmstadt Graphics Group GmbH，按 CC BY 4.0 使用。原始逐项版权保留在 [metadata.json](../assets/car/metadata.json)，完整许可保留在 [CC-BY-4.0.txt](../assets/car/CC-BY-4.0.txt)。

原模型含 Khronos 与 3D Commerce 标识；原标记保持在模型中，其原始版权和使用条件保留在 [Khronos-legal-mark.txt](../assets/car/Khronos-legal-mark.txt)。资产许可不授予把商标用于其他上下文的权利，也不表示 Khronos 对本产品背书。

本项目把官方无压缩glTF的原始几何与14张PNG封装为约11.27MB的本地 `CarConcept.glb`；封装保留原材质、部件层级、变换、铰链与纹理。运行时另外对登记车漆颜色、灯组发光强度、真实灯光和盖板姿态进行状态驱动修改，并加入自己的展台、照明、相机、界面与配置流程。原始下载文件和最终GLB的校验和见 [manifest.json](../assets/car/manifest.json)。

`BodyHood` 使用原局部 X 轴铰链，开度映射0–60°；原前灯属于盖板子树并一起转动。`Engine` 是原资产简化机械舱网格，配合烘焙法线和材质纹理，并非完整发动机结构。车型尺寸、配色、PBR、光强与开度仅用于概念资产展示，不作为具体量产车型规格、维修或工程测量依据。完整校准与部件说明见 [README.md](../assets/car/README.md) 和 [inspection.json](../assets/car/inspection.json)。

## Wikimedia Commons 真实 X-ray 图像

影像工作台使用 Mikael Häggström 公开的两张原始 JPEG：[手部 X-ray](https://commons.wikimedia.org/wiki/File:X-ray_of_normal_hand_by_dorsoplantar_projection.jpg)（1466×2082）与[胸部侧位 X-ray](https://commons.wikimedia.org/wiki/File:Normal_lateral_chest_radiograph_(X-ray).jpg)（1769×2453）。两张文件的原作者均选择 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；原作者页与许可于 2026-10-04 核查，固定页面版本和 SHA-256 保留在 [manifest.json](../assets/imaging/manifest.json)，人可读归属保留在 [credits.md](../assets/imaging/credits.md)。

本地文件与来源当前原片字节一致，没有 AI 生成、裁剪或绘制标尺。胸部原作者在来源版本历史中记录过垂直裁剪；本产品采用该当前原片。运行时通过视口及亮度、对比度、反相调整显示，原文件保持不变。实际看图未见患者姓名/编号，JPEG ASCII EXIF 属性检查未发现文本属性；核查记录不等于临床匿名化认证。

素材没有可靠 DICOM PixelSpacing；默认标注 `px`，物理单位仅允许明确标记的用户参考校准。页面展示中不把原作者文件名中的医学描述当作诊断结果。素材校验命令为 `node projects/011-solaris/scripts/verify-imaging-assets.mjs`。

## Cooper Hewitt / Smithsonian Carnegie打印几何

地标场景采用[博物馆官方开放模型](https://www.cooperhewitt.org/open-source-at-cooper-hewitt/mansionmodel/)的CC0简化中空外部打印STL。官方发布页署名Cooper Hewitt, Smithsonian Design Museum与3D Systems，并说明2014年6月扫描、制作与捐赠。本地采用原始`CooperHewitt_print.stl`，17,164,134字节、343,281三角面；SHA-256、公开镜像及官方来源见[manifest.json](../assets/landmark/manifest.json)，许可与署名见[LICENSE.md](../assets/landmark/LICENSE.md)。

该STL没有源纹理、源材质、完整室内/花园、物理单位或动画，不是含纹理的完整FBX；原退化面和零法线保持源文件。本项目制作白模陈列材质、光照、相机、界面与工作记录，展示×2后的数值不能读作米。模型许可与网页文字版权分别处理：四知识卡是简短原创中文概述，直接引用博物馆官网出处并保留来源范围和知识边界，见[hotspots.json](../assets/landmark/hotspots.json)。不把2014扫描当作2015改造后的完整花园或今日现场。

## Cannon-es 0.20.0

料理备料台使用[Cannon-es v0.20.0](https://github.com/pmndrs/cannon-es/tree/v0.20.0)的本地ES模块；MIT，Copyright (c) 2015 cannon.js Authors。原许可保留在[../kitchen/vendor/LICENSE](../kitchen/vendor/LICENSE)，运行包为[../kitchen/vendor/cannon-es.js](../kitchen/vendor/cannon-es.js)。

基础库负责刚体重力、接触与求解。球形包络、有限碗边界、固定1/120秒时间步、稳定ID、拖放/沉降事务、数量上限、受控浮起通路、归位/取消和保存规则由本产品实现。采用该库不代表精确食物接触、软体或烹饪仿真；实际鼠标与保存恢复的可靠性由单独产品验收记录证明，设备与性能另验。

## 料理备料的Poly Haven完整食材

四种真实扫描食材采用Poly Haven官方1k glTF原文件：

| 运行ID | 原资产 | 作者 | 来源 |
| --- | --- | --- | --- |
| apple | food_apple_01 | Oliver Harries | [官方资产](https://polyhaven.com/a/food_apple_01) |
| lemon | lemon | Kuutti Siitonen | [官方资产](https://polyhaven.com/a/lemon) |
| onion | yellow_onion | Kuutti Siitonen | [官方资产](https://polyhaven.com/a/yellow_onion) |
| avocado | food_avocado_01 | Oliver Harries | [官方资产](https://polyhaven.com/a/food_avocado_01) |

依据[Poly Haven资产许可](https://polyhaven.com/license)，食材几何与原纹理为CC0 1.0。20个原文件、12张1k JPEG、24,211三角面、4,716,226字节保留源数据；上游MD5与本地SHA-256已独立检查。原glTF节点、材质和纹理保持；显示居中/落地/归一化另在场景进行。来源文件及校验见[manifest.json](../assets/kitchen/manifest.json)，完整署名与许可见[LICENSE.md](../assets/kitchen/LICENSE.md)。

模型为完整带皮食材，没有切丁、剥皮、骨架或烹饪动作。原资产尺寸只描述各扫描件，不代表所有真实食材尺寸、份量、重量或营养。陶瓷碗、案板、台面、布局和界面由本项目制作；台面/案板木材复用[wood_floor](https://polyhaven.com/a/wood_floor)，餐巾复用[fabric_pattern_07](https://polyhaven.com/a/fabric_pattern_07)，环境复用本地coastal-day.hdr（上游[kloofendal_48d_partly_cloudy_puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)），三者均为前述已登记CC0原资产；文件哈希与来源见客厅[manifest.json](assets/manifest.json)，不将自有器皿或布局标为Poly Haven扫描食材。托盘可重复取用、默认4件/最多16件及近似碰撞参数是产品规则，不表示食物或烹饪知识认证。

## 原始研究媒体

Solaris 官方媒体和论文画面只在 `research.html` 的来源研究中在线引用，所有权属于原发布方。未将其打包到 ATELIER 运行场景，也未把官方回放计入产品效果或测试结果。
