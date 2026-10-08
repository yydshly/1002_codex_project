# ATELIER 产品与 Solaris 研究画廊

**当前基线为ATELIER 0.18.2，基础方向探索已收束，后续按具体产品想法扩展。** 保留11个场景、35/36项受控映射、C35九个登记任务和陈列加九工作台的十份稳定存档。35/36不是产品完成率；C19购物联动未接入，试衣/真人扩展继续暂停。独立新桌与灯具工作台是对象关系研究的深化，不增加业务场景，也尚未接入客厅、跨场景任务或十份整套备份。

从[项目理解与完整总览](http://localhost:4189/projects/011-solaris/overview.html)及[新版汇总图](../assets/atelier-understanding-map.svg)阅读来源能力、原理、自主实现、场景用途和对后续产品的意义；[首页](http://localhost:4189/projects/011-solaris/)关联全部入口，[能力与接入说明](http://localhost:4189/projects/011-solaris/integration.html#scenes)记录操作和验证范围，[研究画廊](http://localhost:4189/projects/011-solaris/research.html#demo)保留官方媒体。0.18.2当轮386/386项产品Node测试、16/16项仓库检查已通过；本次网页整理的检查单独记录，不代表所有场景重新实测。全部历史数字、真实操作、失败与未验证事项按各自版本阅读，阶段收束不代表商用成熟或任意输入、设备和故障均已验证。

汇总图现以清晰的效果展板呈现：源侧13个有公开画面场景、14份原始图；本项目侧11个场景的实际效果、独立桌灯和真人参考。网页可切换两侧或整图，125%–200%放大并在图内滚动，源图片目录保留完整过程图及出处。所有照片来自已留档的原图，不由AI替换；此次改进展示与说明，基础版本仍为0.18.2。原图清单见[solaris-effects/manifest.json](assets/solaris-effects/manifest.json)，新发布检查见[effect-display-validation.json](../notes/effect-display-validation.json)。

**0.15.0历史：** 同一试衣场景提供三维衣鞋搭配和真人正面上装研究参考两个入口。真人用本机部署的FASHN预训练服务，四组实际输出与首次内存不足失败留档：跨衣缺实穿对照，原衣重建与实拍不一致，不判尺码或商业可用。当轮189项产品与18项Python后端测试通过，网页分界比较、放大/平移和复位已实际验证；PNG预览/评审JSON内容与选款撤销已核查；自动下载写盘/剪贴板一致性及异常另验；原C17/C18、水下和材料历史保留。

0.12.0历史：C31有限跟随在固定水层/单鱼/单潜水员/三登记礁石接入；稳定v2及旧v1最新工作区保值迁移后保存重开完整JSON一致，PNG1443×969已解码；追随中重新抓鱼及设备/性能专项仍另验。详见[水下操作与边界](../notes/integration.md#underwater)。

## 当前场景入口

客厅顶部“全部场景”和左栏“演示”直接打开11场景的实景预览目录，包含项目总览、每个场景的验证说明和“全部项目库”返回入口；窄屏保留左栏“演示”。原侧栏“场景”改名“方案”，仅切换客厅预设。理解、研究与验证资料保留在独立折叠中。导航不修改工作区内容，0.18.2基线保持；此次核查见[首页导航记录](../notes/home-navigation-validation.json)。

| 场景 | 页面 | 主要验证 |
| --- | --- | --- |
| 客厅 | [index.html](http://localhost:4189/projects/011-solaris/) | 家具直接编辑、材质光照、撤销保存与A/B，14项 |
| 汽车 | [showroom.html](http://localhost:4189/projects/011-solaris/showroom.html) | C24–C26灯组、原铰链盖板及多视角 |
| 影像 | [imaging.html](http://localhost:4189/projects/011-solaris/imaging.html) | C22/C23真实X-ray视口与原图坐标测量 |
| 地标 | [landmark.html](http://localhost:4189/projects/011-solaris/landmark.html) | C12–C14建筑白模光影、导航和来源热点 |
| 料理 | [kitchen.html](http://localhost:4189/projects/011-solaris/kitchen.html) | C20/C29完整食材组合与受控检视 |
| 创作 | [creative.html](http://localhost:4189/projects/011-solaris/creative.html) | C27/C28真实图像框选、纹理印章与有限笔刷 |
| 陈列 | [collection.html](http://localhost:4189/projects/011-solaris/collection.html) | C05/C33/C35交换、显式策展和九目标任务往返；十份已保存记录的整套备份与选择恢复 |
| 滑板 | [skate.html](http://localhost:4189/projects/011-solaris/skate.html) | C32板面上拖、有限骨架起落与可恢复记录 |
| 材料 | [materials.html](http://localhost:4189/projects/011-solaris/materials.html) | C21温升/冰熔化与恢复；同热量顺序对照和只读温升图已验收；保存重开及普通供能回归已验收 |
| 水下 | [underwater.html](http://localhost:4189/projects/011-solaris/underwater.html) | C30直接鱼体拖动与C31潜水员有限跟随；可见安全路径、到位/无路停留和整段双主体恢复 |
| 试衣 | [三维搭配](http://localhost:4189/projects/011-solaris/fitting.html) / [真人上装参考](http://localhost:4189/projects/011-solaris/tryon.html) | C17上衣到胸腹、C18完整左右鞋到脚掌/脚踝，两槽独立、两静态姿态/各三主色与整次恢复；真人是C17同场景深化，登记正面实拍/本机生成/质量比较，不接真实购买 |

材料C21受控范围保持：铜铝各10g25–60°C常温Cp、冰1g0°C潜热，已吸收10W均匀零散热。0.10.1默认×1、暂停切×4；新增温度/供能可见反馈、接口吸附、暂停累计读数、单样品重新观察事务，桌面实际UI已验收。金属保持固态，环/蓝焰/热流箭头为教学示意。[0.10.1历史反馈验收](../notes/integration.md#材料教学体验修复0101)。

[真实追随过程](../assets/atelier-underwater-follow-during.jpg)、[不可达停留](../assets/atelier-underwater-follow-blocked.jpg)、[两次实际联动备份](../assets/atelier-underwater-follow-example.json)、[1443×969真实PNG](../assets/atelier-underwater-follow-render.png)与[本轮验收](../notes/diver-validation.json)留档。

## 使用真人上装研究参考

[打开真人工作区](http://localhost:4189/projects/011-solaris/tryon.html)。选登记人物，把衣物卡拖到人物区域或点选，再点击开始本机生成。拖卡只选择衣物；完成后比较原图与生成图、放大细节并填写人工观察。已生成示例与本次任务分开显示，生成图应带明确标记。

两组无人衣图跨衣、一组原衣重建和一组模特衣图跨衣均完成20步，耗时63.34、49.58、41.84、52.58秒，输出576×768；首次61.49秒内存不足无图也保留。跨衣能看见目标上装主要结构，但裤腰/纽扣及小细节可能改变，缺同人同目标衣实拍。原衣重建将宽松褶皱改成较贴身平整，字样与裤腰也变，不能称与实穿一致。用途是有限外观研究，不判断尺码、舒适或商品保真。

本机需Python/CUDA、权重和4197服务；自部署预训练不等于从零训练，不用外部推理API。两组原照片登记为4张原JPEG、5个输入角色，既含单件无人衣图也含模特穿着参考；照片为非商业研究样本，没有可售商品编号；解析组件、照片、肖像/品牌商业授权分别受限。上传为实验输入，输入和结果保留在本机任务目录。189项产品与18项Python后端测试通过；网页分界拖动、放大/平移与复位已实际验证；PNG预览与评审JSON内容已实际核查，选款撤销恢复原评分/实际图；自动下载落盘及剪贴板字节一致性未验证，故障专项另验。

PNG导出预览已实际核查为576×812（原图576×768加44px生成注记）；评审JSON全文已核对并留档，含真实输入组合、任务ID、元数据和缺实拍依据。提供复制/保存入口；内置浏览器自动下载落盘及剪贴板字节一致性未验证。

[真人工作区](../assets/atelier-real-person-workspace.png)、[原衣重建问题](../assets/atelier-real-person-baseline.png)、[带生成注记的导出预览](../assets/atelier-real-person-export-preview.png)、[评审JSON](../assets/atelier-real-person-review.json)和[评审核对窗口](../assets/atelier-real-person-review-dialog.png)保留实际界面与内容。

[操作目的与四次运行](../notes/integration.md#real-person-tryon)、[样本来源](../notes/tryon-sources.md)、[运行说明](../notes/tryon-runtime.md)、[真实生成与质量记录](../notes/real-person-tryon-validation.json)及[样板计划](../notes/real-person-tryon-plan.md)可查。C17/C18原三维证据与所有历史保留；0.15.0当轮为35/36、十一场景、阶段5的2/3，C19待接、C35六目标。当前C35九目标与暂停扩展定位见本文首段。

## 0.13.0上衣操作与有限适配历史

按住场景里的圆领短袖或轻夹克，拖到人体胸腹；合适位置可预览，松手后替换一个上装槽。错位/Escape取消恢复原搭配，换装一次撤销重做；颜色、自然站姿/抬臂及四预设/空白环绕可观察前背侧与细节。同衣款且同颜色不增加历史，单同款而不同颜色仍是合法改色。三合法/七坏JSON及本机保存重开逐值一致，1431×969实际PNG已解码。

完整Quaternius CC0 53骨人体保留13,743唯一面，两款服装、连续权重与两个冻结姿态由本项目设计；轻夹克为宽圆口包边与独立拉链、口袋/背育克，不是立领或外部衣物模型。11素材检查仅在有限域通过，选定径向采样有64个肩/腋下无壳命中未验证，前背侧/抬臂视觉复核作补充，不证明全身零穿插。一个固定体型/两款上衣不代表照片试穿、真实尺码或布料物理，C17当轮不覆盖鞋履；C18鞋履历史见下节，C19未接入，当轮C35六登记去向保持。

[操作与边界](../notes/integration.md#fitting)、[人体与服装来源](../notes/fitting-sources.md)、[本轮验收](../notes/fitting-validation.json)、[真实工作区](../assets/atelier-fitting-workspace.jpg)、[拖入预览](../assets/atelier-fitting-drag.jpg)、[背面检查](../assets/atelier-fitting-back.jpg)、[实际配置](../assets/atelier-fitting-example.json)与[PNG](../assets/atelier-fitting-render.png)可查。

## 完整鞋履：成对适配与独立搭配

切鞋履，在总览把Court/Ridge实体展样或侧栏拖到人体脚掌/脚踝，合法预览后松手左右一起换款。上装、姿态和相机保持；胸腹/空处拒绝、活动Escape、一次撤销重做恢复完整搭配，反向换上衣保留鞋，脱鞋只清鞋槽。三主鞋面色不改独立鞋底/鞋带/金属；两原静态姿态足位同一，近看鞋脚隐藏展台/展样，回总览恢复取样。

原完整53骨人体/双足与C17三GLB哈希保持，鞋由本项目原创完整左右组刚性注册。9素材有限域检查、35来源文件/5运行文件、18原人体复审图；264足点投影、120非踝口上射线和144真开放踝口域，Ridge2,830低腿三角面八阶样点仅覆盖登记域，不证明体积零交叉、缓冲/尺码或步态。

三合法/八坏UI搭配、最终v2保存重开完整JSON、PNG1431×969已实际验证；[操作与范围](../notes/integration.md#footwear)、[鞋履来源](../notes/footwear-sources.md)、[本轮验收](../notes/footwear-validation.json)、[工作区](../assets/atelier-footwear-workspace.jpg)、[细节](../assets/atelier-footwear-detail.jpg)、[侧后](../assets/atelier-footwear-side.jpg)、[真实预览](../assets/atelier-footwear-drag.jpg)、[搭配JSON](../assets/atelier-footwear-example.json)与[PNG](../assets/atelier-footwear-render.png)。当轮C19待研发、C35六目标，原证据不改为当前九目标验收。

## 产品结构与运行

- `studio/core.js`：初始7个对象与可复制实例的版本化状态、校准资产尺寸、约束、占位检查、编辑事务、输入校验和有限中文语法。
- `studio/scene.js`：专业 glTF 家具、PBR 木地板与布料、窗光和灯具、动态阴影、HDR、材质修改、相机与真实渲染截图。
- `studio/app.js`：指针工具、属性面板、保存、A/B、上传、文件导入、错误反馈与键盘操作。
- `studio/studio.css`：桌面与手机工作区；小屏幕用对象抽屉与下置属性面板。
- `studio/vendor/` 与 `studio/assets/`：本地固定版本依赖与专业内容。来源和许可见 [THIRD_PARTY_NOTICES.md](studio/THIRD_PARTY_NOTICES.md)。
- `showroom/core.js`：汽车 schema v1、登记车漆与视角、严格校验和40条事务历史。
- `showroom/scene.js`、`showroom/app.js`、`showroom/showroom.css`：专业车辆渲染、点击灯盖、轨道相机、部件联动、配置保存恢复和真实截图。
- `assets/car/`：Khronos Car Concept、14张嵌入PNG、版权与商标许可、校准检查和文件哈希。
- `imaging/core.js`：影像 schema v1、视口正逆变换、指针锚定缩放、图像坐标端点、像素/用户校准长度与40条历史。
- `imaging/app.js`：直接 Canvas 渲染、工具手势、显示调整、测量与校准面板、每源独立本机状态与严格配置恢复。
- `assets/imaging/`：两张真实高清 CC0 X-ray JPEG、作者/许可与来源、原图哈希及未校准状态。
- `landmark/core.js`、`landmark/scene.js`与`landmark/app.js`：建筑白模陈列光照、轨道相机、四个有来源知识热点与独立工作记录。
- `assets/landmark/`：官方CC0简化中空打印STL、许可/文件核查与知识资料；白模不是原色扫描，也没有完整室内。
- `kitchen/core.js`：稳定食材实例、16件上限、组合校验、检视状态与事务历史。
- `kitchen/physics.js`、`kitchen/scene.js`与`kitchen/app.js`：本地Cannon-es固定时间步、近似碰撞、真实食材渲染、托盘直接拖入与稳定组合恢复；真实拖入/浮起与保存恢复已验收，设备等专项继续。
- `assets/kitchen/`与`kitchen/vendor/`：四个Poly Haven CC0完整食材、原几何/纹理/许可/哈希，及Cannon-es 0.20.0本地MIT包。
- `creative/`与`assets/creative/`：真实CC0猫照片和Met公版画作，1200×900固定画纸、可见选区、两图层与逐笔记录；像素印章/参数笔刷不等于任意风格生成。
- `collection/`：六件真实Poly Haven CC0模型/PBR渲染、双端锁槽、策展理由、有限中文去向、十份已保存记录的整套备份与选择恢复；`scene-return.js`只读桥严格匹配九个登记目标。原六目标历史与0.16.0滑板/材料/水下新增往返分别留证，不把普通导航自动计为任务接入。
- `skate/`与`assets/skate/`：Kenney CC0完整七骨节角色、板与场地，板面手势、有限姿态/受控轨迹、逐帧预览/重播、完整落地记录与本机/JSON恢复；不提供膝脚IK或现实物理求解。
- `materials/`：真实热源三接口拖放、有限能量账/温升/熔化、整体过程取消与事务恢复、严格本机/JSON；`reference-data.json`保留NIST参数/单位和假设。装置样品/PBR为自有设计，沿用四原CC0台面纹理/HDR。
- `underwater/core.js`、`follower.js`、`workspace.js`：原鱼账/固定水层约束、有限安全路径/间距/转向、双主体配置v2与旧v1迁移；40条，鱼2–64点/潜水员1–128点，整体512KiB且原鱼账64KiB限制保留。
- `underwater/scene.js`、`underwater/app.js`及`underwater/assets/`：完整鱼/岩礁与53骨潜水员及自有装备、Hover/Swim混合；真实鱼身拾取、指针反馈、跟随/到位/无路停留和一次双主体事务，原摆尾只作外观。
- `fitting/core.js`、`fitting/scene.js`、`fitting/app.js`及`fitting/assets/`/`fitting/footwear/`：完整原53骨人体、两款原创厚衣片/两双完整鞋与原固定姿态，上衣胸腹/鞋脚掌或脚踝实体拾取/预览、双槽独立与鞋成对替换。严格v2兼容原v1，32KiB/40会话历史，三各自主色、取消与整套一次历史恢复。
- `tryon/`、`tryon.html`与本机Python服务：登记真实照片、本机FASHN预训练任务、原图/生成图比较与人工观察；已生成案例与失败分开，不推断尺码或购买，运行目录不发布。
- `studio/integration.js` 与 `studio/integration-data.json`：清单与规划页面，按状态、阶段和关键词筛选。

在仓库根目录运行 `node scripts/catalog.mjs build`，已有预览服务器读取 `_site`。启动服务器：`node scripts/serve.mjs --port 4189`。原三维与像素工具无需新增npm依赖，三维需浏览器支持WebGL。真人生成还需单独准备Python/CUDA、离线权重和4197本机服务，详见[运行说明](../notes/tryon-runtime.md)。开发测试：`node --test projects/011-solaris/tests/*.test.mjs`；客厅资产尺寸核对：`node projects/011-solaris/scripts/calibrate.mjs --check`。

功能范围为35个公开研究条目的受控版本：客厅14、汽车3、影像2、地标3、料理2、创作2、陈列3、滑板1、热响应1、水下2、试衣2。待接入仅C19共1项，详见[交付记录](../notes/product-release.md)；衣鞋只支持固定人体/各两款网格/两静态姿态，购物关联待研发，潜水员只有限固定水层跟随，材料仅登记热容量/潜热教学。料理接入完整带皮备料组合和受控检视，真实拖入/浮起与保存恢复已验收，设备等专项继续；不是切丁、烹饪、营养或称重。地标只使用CC0简化中空外部打印几何，没有原色纹理、完整花园/室内或物理尺度，显示白模材质由本项目制作。客厅地面测量不重复计作X-ray功能，页面导航与氛围预设不属于C35意图转场。客厅资产检查：`node projects/011-solaris/scripts/verify-assets.mjs`；汽车资产检查：`node projects/011-solaris/scripts/verify-car-assets.mjs`；影像素材检查：`node projects/011-solaris/scripts/verify-imaging-assets.mjs`；料理食材检查：`node projects/011-solaris/scripts/verify-kitchen-assets.mjs`；陈列复用资产检查：`node projects/011-solaris/scripts/verify-collection-assets.mjs`；滑板原文件检查：`node projects/011-solaris/scripts/verify-skate-assets.mjs`；材料科学/四原素材检查：`node projects/011-solaris/scripts/verify-materials-reference.mjs`；试衣上衣完整素材/有限适配检查：`node projects/011-solaris/scripts/verify-fitting-assets.mjs`；鞋履来源/有限足域检查：`node projects/011-solaris/scripts/verify-footwear-assets.mjs`。

保存使用当前浏览器的本地存储；项目导入和导出包含对象、环境、相机、教程、A/B 与自选图片，撤销历史只保留当前会话。自动下载完成回调尚未确认，JSON 提供复制备份，场景图片提供可保存预览。原三维工作台CSP与导入校验禁止第三方运行请求和远程图片；真人页面另允许4197本机服务，研究画廊仍按其来源加载官方媒体。

汽车使用独立本地存储键 `atelier-car-showroom-v1`：五种配色、六种观察视角、灯光开关与0–300亮度、0–1盖板开度和相机。连续相机与盖板手势合并为一条编辑，历史上限40；自动保存重开，JSON复制/粘贴校验上限32KB，图片提供真实渲染预览。车辆采用本地CC BY 4.0专业资产，盖板沿原始铰链0–60°转动；机械舱为原概念模型简化网格和烘焙纹理，PBR与光强均不作真实车型工程或维修依据。详见 [汽车接入](../notes/integration.md#automotive)。

影像主要验证二维鼠标工具语义（C22）与图像坐标测量（C23）：平移/缩放/测量使用不同模式，线端点可拖动，视口变化不改变同一标注长度。固定两张真实CC0原片，不支持上传或DICOM。默认长度以原图像素 `px` 计算，mm 仅由用户提供已知参考校准，标记“用户校准”；不能用 JPEG DPI 或人体比例推断物理尺度。每源独立历史、视口、显示与校准；存储键 `atelier-imaging-workspace-v1`，严格备份封装 `format: "atelier-imaging", version: 1`，JSON上限64KiB且不携带远程URL。详见 [影像接入与验收目标](../notes/integration.md#imaging) 与 [素材来源](../notes/imaging-sources.md)。

0.10.0的107产品/16仓库/14材料科学素材核查及真实主流程保留历史。0.10.1材料核心17项、独立参考15项通过；新鼠标反馈、慢速/快放与单样品重新观察已完成桌面验收，完整112项产品回归已通过。设备/故障/离线/性能等专项另验。详见[当前验收](../notes/product-validation.json)、[本轮材料反馈验收](../notes/materials-feedback-validation.json)与[0.10.0材料历史验收](../notes/materials-validation.json)。

## 新场景的使用与留档

试衣：上衣实体/侧栏到胸腹，完整鞋对到脚掌/脚踝，合法预览后松手各替换独立槽，上装/鞋互相保持。错位/活动Escape、鞋对一次恢复、两原固定姿态/各自主色/鞋脚近看已原生验收。新本机键`atelier-fitting-room-v2`，schema2保存固定人体ID、上衣/颜色或null、完整鞋款/颜色或null、姿态与相机；32KiB/40会话历史，严格原v1六字段/四预设迁移只加version2+shoes:null且旧key保留。[鞋履范围](../notes/integration.md#footwear)与[本轮验收](../notes/footwear-validation.json)，原0.13.0上衣记录仍保留。

水下：按住鱼体拖向左侧空处并松手，看鱼保持落点、潜水员连续转向/踢腿并沿金色安全路径追随；到目标间距1.00场景单位或无安全通路时停留，移回可达处恢复。非法释放、拖动/追随阶段Escape及整段撤销重做恢复双主体；五类坏JSON、40条/编号耗尽拒绝与旧v1安全初始化已验收。固定水层和有限路径不代表真实游泳；[操作与范围](../notes/integration.md#underwater)、[潜水员素材](../notes/diver-sources.md)，所有[0.11.0历史验收](../notes/underwater-validation.json)及原图/备份保留。

创作：在真实来源图中框选，在画纸/试片点击或拖绘，逐笔撤销并保存恢复；来源与旧笔迹各自保持。[创作验收](../notes/creative-validation.json)写明局部像素及JSON/PNG结果。

陈列：拖六件模型卡片交换，锁住位置，预览偏好理由再应用；输入“去料理”等有限去向可到九个登记工作台并返回，十份已保存记录可整套导出和选择恢复。收藏不是购物订单，不虚构品牌/库存/价格；[陈列例子](../assets/atelier-collection-example.json)与[六目标历史验收](../notes/collection-validation.json)可追溯，当前九目标和备份的各轮证据见[接入说明](../notes/integration.md)。

滑板：从板面净向上拖至少24px后松手，24–160px对应0.3–1.1展示高度；完整落地才记一次，Escape取消、辅助预览和重播不增条目。逐帧只用于预览/重播，真实手势不可seek。固定平地有限骨架动作不等于完整ollie、脚部IK、越障或现实训练；[实际工作区](../assets/atelier-skate-workspace.jpg)、[1467×969真实PNG](../assets/atelier-skate-render.png)、[两条真实手势配置](../assets/atelier-skate-example.json)及[素材依据](../notes/skate-sources.md)已保存。

材料：释放命中接口后吸附供能；温度/ΔT和熔化比例、供能标签与累计读数持续显示，60°C或融尽后可重新观察一个样品。默认×1，暂停可切×4；倍率不改10W模型或热账schema。0.10.1桌面实际UI已验收，0.10.0已有证据与[科学素材来源](../notes/materials-sources.md)保留。

## 研究画廊：research.html

以下内容描述原始研究画廊。

## 内容与数据

- `scenes.json`：15 个公开场景，包含 8 个具有核验 MP4 链接的官方录像、5 个以封面或论文原图呈现的场景、2 个文字资料场景。街景光照拥有独立场景。
- `capabilities.json`：36 个公开能力条目，按 12 个能力族整理；5 种证据等级由 JSON 提供，页面动态读取，不把官方设想计为已展示能力。
- 主屏默认室内设计官方回放，可切换完整室内编辑、服饰、沙拉、地标、燃烧教学、X 光等真实场景。
- 同场景可切换视频、官方单帧、完整论文过程图；论文过程图可打开原图放大阅读。文字场景显示原文来源与证据状态，不生成替代画面。
- 场景操作导读按能力条目显示输入与公开结果；研究目录支持关键词、能力族和证据等级筛选，并展示来源、机制分析与验证问题。
- 页面中的选择操作只控制证据浏览。视频维持官方录制顺序，不伪造时间点，不向模型发送动作，不允许在录制画面中拖动对象。

所有远程媒体直接使用已核验的官方 URL。此目录没有媒体下载、代理或第三方视频播放器依赖。视频加载失败时提供官方入口，并说明当前失败，不以图片冒充动态回放。

## 本地预览

页面通过 `fetch` 读取同目录 JSON，因此应使用 HTTP 预览服务。直接从文件管理器打开 HTML 时，浏览器可能阻止读取 JSON。

在仓库根目录运行：

```powershell
node scripts/catalog.mjs build
node scripts/serve.mjs --port 4189
```

打开 `http://localhost:4189/projects/011-solaris/research.html#demo` 查阅原始来源。首页 `http://localhost:4189/projects/011-solaris/#demo` 现为 ATELIER 实际编辑工作区。

脚本语法验证：

```powershell
node --check projects/011-solaris/web/app.js
```

## 旧演示归档

上一版原创 SVG 与规则交互样例保存在 `archived-demo.html`、`archived-demo.css`、`archived-demo.js`。页脚入口标为“归档：本地输入教学样例”。它解释浏览器输入，不是 Solaris 输出，不再作为首页主演示。

## 研究边界

录像是发布者的公开演示，论文原图是静态证据，文字描述与方向性设想分别标注。场景存在视频不意味着其每个关联能力都已由视频证明；各条目的证据等级独立显示。精确尺寸、物理求解、内部对象结构与性能需要真实接入后测量，不能从视觉真实感直接推导。

来源：Runway [官方介绍](https://runway.com/news/research/introducing-solaris)、[论文 v1](https://arxiv.org/html/2609.00776v1)。核查日期：2026-10-04。

本次已通过 `node --check`。媒体播放、筛选与不同视口的浏览器验收由主任务统一执行，以项目 README 记录为准。

0.2.0增加动态实例、软移除与恢复、非等比尺寸、茶几型号与教程进度。0.3.0增加汽车展厅与七阶段网页规划。0.4.0增加真实影像视口与测量，以及逐场景能力说明。0.5.0增加CC0 Carnegie建筑白模的C12–C14。0.6.0增加料理备料C20/C29与五场景导航；资产/方案检查和浏览器实际验收分开记录。0.7.0增加创作C27/C28，0.8.0增加陈列C05/C33/C35，0.9.0增加滑板C32，0.9.0当时八场景30/36受控接入。0.10.0新增C21有限热响应；0.10.1修复材料观察/重试反馈，九场景31/36接入数不变，新反馈已完成桌面实际验收。0.10.2补充铜铝同热量对照；0.11.0当时新增C30直接水下拖动、十场景32/36、阶段4为4/5；0.12.0在同场新增C31有限潜水员跟随，当时33/36、阶段4为5/5、C17–C19待接入；0.13.0新增第十一场景和C17固定上衣适配，当时34/36、阶段5为1/3、C18/C19待接入；0.14.0同场接入C18完整鞋对；0.15.0深化C17真人正面上装研究参考，当前仍35/36、十一场景、阶段5为2/3、仅C19待接入。`integration.html`读取`studio/integration-data.json`，由产品状态、路线与场景说明生成；运行`node projects/011-solaris/scripts/integration.mjs --check`检查来源同步。开发接入见[接入说明](../notes/integration.md)。

0.6.0料理留档：[真实工作区1280×720](../assets/atelier-kitchen-workspace.jpg)、[浮起近景1280×720](../assets/atelier-kitchen-inspection.jpg)、[真实canvas JPEG1470×969](../assets/atelier-kitchen-render.jpg)与[六件hero配置](../assets/atelier-kitchen-config.json)。检视采用临时镜头跟随，归位/取消还原原视角；浮起时保存重载不写入临时镜头，恢复稳定组合与idle。

## 铜铝同热量对照：0.10.2

[打开材料教学台](http://localhost:4189/projects/011-solaris/materials.html)。这一流程在相同质量、初温和输入热量下比较铜与铝的温升，继续验证C21；0.10.2该轮九场景、31/36项接入与C35六目标保持。

| 操作 | 预期观察 | 恢复与限制 |
| --- | --- | --- |
| 展开“同热量对照”，选每样品40/80/120J，按“重新开始对照”；默认40J | 一只10W火源先给铜、再给铝输入所选Q；两者均10g、起温25°C，完成后同Q对应不同ΔT | 开始先重置铜铝及各自旧账，冰与冰账保持；按钮驱动顺序步骤，不称同时双火源或新增鼠标拖放证据 |
| 看步骤状态、大号温度/ΔT与只读温升图 | 横轴Q=0–340J、纵轴25–60°C；铜/铝分别在134.779J/313.999J止于60°C，当前点跟随实际Q | 曲线来自原常数Cp公式，是计算值；不能拖图改变输入，冰条件不同，不列同条件对照 |
| 铜或铝阶段按“取消整个对照”/“暂停对照并记录”，完成后撤销/重做 | 重置、铜输入和铝输入组成一次完整历史事务 | 取消回原完整基线，暂停提交已输入部分；一次undo/redo恢复整次对照，冰保持 |
| 默认×1观察，暂停后可选×4 | 只改变观看进度，Q/t仍10W | 倍率不改功率或物性schema，UI时钟不作外部实测计时 |

**本轮已验收：** 新增9项对照核心测试和完整121项产品回归通过。真实1280×720界面分别完成40/80/120J对照，两个金属热量相同而温升不同；80J时铜45.8°C、铝33.9°C，各8教学秒。40J图上两点同x=59.17647058823529，铜/铝y约94.354/112.987，状态点与实际Q一致。

铜第一步取消和铜完成后的第二步Escape均全JSON精确回原基线；完整40J对照一次undo/redo保持。×4的40J第二步暂停得到铜40J/铝5.384J，一次undo回原120J基线、redo回暂停态。39条冰账导致容量预检拒绝且全JSON不改；原冰136.0359999990463J与两行记录在普通对照中全程保持。

[80J第二步供能实景](../assets/atelier-materials-comparison-heating.jpg)、[80J完成实景](../assets/atelier-materials-comparison.jpg)与[真实公开备份](../assets/atelier-materials-comparison-example.json)独立留档，结果由[本轮对照验收](../notes/materials-comparison-validation.json)管理。0.10.0/0.10.1已验收记录保留；本轮独立科学/素材15项重新通过，不新增物性参数，也不借用Solaris或模型后台。

稳定80J结果保存→重载→公开备份全JSON精确一致，图上状态点根据现存Q恢复，观察速度回默认×1。剂量选择及步骤/完成标签是临时工具设定，不入schema；重开保存热量与账本，不续跑对照。普通冰供能实际由136.036J到138.129J且铜铝80J保持，原生Escape全JSON回基线；公开JSON导入、保存、重载也恢复原实验的四行记录、相机/火源/选择与nextId=5。自然1280×720无横向溢出，浏览器warn/error为空。

编号耗尽也已实测：合法nextId=1000000时普通开始/重试禁用；原生冰→铝接口命中启动前拒绝，蓝焰未开，全JSON精确保持，不先重置或遗留火源位移。

**待专项验收：** 设备、存储故障、完全断网、下载实际写盘、长期运行、指定硬件性能及精确外部时钟校准。

## 材料教学体验修复：0.10.1

[打开材料教学台](http://localhost:4189/projects/011-solaris/materials.html)。本轮解决“金属似乎没变化、火源状态不清、到终点后无法继续观察”的反馈，保留原10W吸收功率与物性。

1. **温度看得见**：铜铝显示大号温度、ΔT和25–60°C温度条；独立示意环解释升温，金属保持固态。
2. **供能状态常驻**：火源持续标明供能或熄火，暂停后仍能判断当前状态。
3. **看清供能路径**：空心支架底座露出蓝焰，热流箭头明确标为教学示意，不称真实热场。
4. **接口命中吸附**：松手命中圆环后吸附固定接口中心，错位不开始供能。
5. **累计读数保留**：所选样品累计热量Q与累计教学秒在暂停后保持，继续从已有状态计算。
6. **终点可以重看**：60°C或融尽有明确提示；“重新观察铜/铝/冰”只重置该样品再供能，其余样品与记录保持，整次可以取消或撤销。
7. **默认慢速观察**：默认×1，暂停后可切×4快放；倍率只改变观察速度，不进物性/热账schema，不把吸收功率改成40W。

**当前验证状态：** 单样品重置与账本/事务核心新增5项测试，材料核心共17项通过；科学与原素材独立核查15项通过。完整112项产品回归已通过；新界面的三接口鼠标命中吸附、温度/供能反馈、暂停累计读数、两档观察和三样品单独重新观察/恢复均已完成桌面真实操作验收。

真实鼠标释放分别吸附铜、铝、冰三个固定接口并点燃蓝焰；铜用×1观察到60°C/134.779J自动熄火，铝用×4快放到60°C/313.999J自动熄火，每条热账仍满足Q/t=10W。三种样品单独重新观察仅清本样品热账，其他两者保持；暂停后一次撤销和重做精确恢复，铜重试中Escape整态取消、铝与冰取消保持。默认及重载×1，活动中倍率控件禁用，暂停后可切×4。

1280×720实景中大号温度/ΔT、温度条与独立彩环、蓝焰本体/状态及橙色热流箭头均可见，页面没有横向溢出。新的[供能过程实景](../assets/atelier-materials-heating.jpg)、[稳定工作区实景](../assets/atelier-materials-feedback-workspace.jpg)和[0.10.1反馈验收](../notes/materials-feedback-validation.json)独立留档，原0.10.0图片与配置保留。

温度与比例仍是明确条件下的计算值；示意环、蓝焰和热流箭头不作为探头、热场或燃烧预测。0.10.0时的×4、107项产品测试、14项参考检查和实际主流程仍作为历史验收保留。设备/存储故障、完全断网、下载写盘、性能及外部时钟精确校准继续单独验收。

