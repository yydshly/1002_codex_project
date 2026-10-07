# ATELIER 0.7.0 — 真实参考素材与取样边界

核查日期：2026-10-05。图片在 `web/assets/creative/`，通过本地静态服务器加载。四个图像合计 7,602,490 字节，均保持原图完整构图，2400 像素长边，没有 AI 生成、重绘、裁切或风格化。Met 三份 API 原始 JSON 另占 7,658 字节。

## 1. 猫毛实拍：C27 材质参考取样

- 文件 / ID：`cat-fur.jpg` / `cat-fur`；作者 OboeBlanket，拍摄于 2013-06-08。
- [原图作者页](https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg)；作者将自己的作品直接发布为 [CC0 1.0](https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg#Licensing)，不是沿用 Unsplash 的旧许可。
- [原始 JPEG](https://upload.wikimedia.org/wikipedia/commons/8/8f/Cat_in_towel.jpg)：3648 × 2736、2,257,689 字节。完整画面含黑白猫头、手臂和毛巾；原页声明与其 CC0 名称记录在 manifest。
- 派生 JPEG：2400 × 1800、1,107,786 字节。图像的黑白毛、细毛高光和毛巾纹理可以直接比较；猫毛的实用参考区域在画面右上，整张图的下半部主要是毛巾。
- 建议归一化默认选区 `[x,y,width,height]=[.53,.23,.13,.15]`，覆盖白额头与黑毛交界，毛纹方向可辨，避开眼睛、鼻子和毛巾。第二选区 `[.65,.15,.16,.14]` 可以观察上额黑毛及其高光。坐标为人工观察建议，最终默认框由浏览器视觉验收决定。
- C27 可以验证鼠标选择参考区域、提取局部真实像素纹理、在目标区域中重复应用和保留来源。局部像素印章或纹理填充不会使目标拥有真实三维毛发；该素材也没有猫毛语义分割标签。

## 2. 梵高：C28 笔触参考之一

- 文件 / ID：`wheat-cypresses.jpg` / `wheat-cypresses`。
- Vincent van Gogh，*Wheat Field with Cypresses*（《麦田与柏树》），1889。
- [Met 官方藏品页，objectID 436535](https://www.metmuseum.org/art/collection/search/436535)，馆藏号 1993.132。
- [原始 API](https://collectionapi.metmuseum.org/public/collection/v1/objects/436535) 的真实下载响应已保存为 `provenance/met-436535.json`，`isPublicDomain:true`；原图地址、API 字节数和 SHA-256 都在 manifest。
- 原图 4000 × 3184、8,291,194 字节；本地完整派生图 2400 × 1910、2,875,465 字节。
- 馆方描述其丰富厚涂和活跃笔触。建议天空中的弧形云、下部金色麦田、右侧柏树分别取样，比较弧线、长短斜线和深色竖向线条。取样应显示区域原像素及其明显方向信息，避免仅用平均色声称复现笔触。

## 3. 西斯莱：C28 笔触参考之二

- 文件 / ID：`river-bridge.jpg` / `river-bridge`。
- Alfred Sisley，*The Bridge at Villeneuve-la-Garenne*（《维勒讷夫拉加伦桥》），1872。
- [Met 官方藏品页，objectID 437680](https://www.metmuseum.org/art/collection/search/437680)，馆藏号 64.287。
- [原始 API](https://collectionapi.metmuseum.org/public/collection/v1/objects/437680) 实际下载响应保存为 `provenance/met-437680.json`，明确 `isPublicDomain:true`。
- 原图 4000 × 3000、6,012,677 字节；本地完整派生图 2400 × 1800、2,025,950 字节。
- 馆方指出水面以明亮的平笔触表现光线。建议取下半部水面的短水平蓝白笔触，同梵高麦田与天空的弯曲、密集笔触做对照；可另取建筑或桥边，比较结构边缘。此图应显示作者真实姓名，不再标作莫奈。
- 原计划候选 Met 莫奈 437127（*Bridge over a Pond of Water Lilies*）与 437137 的当前官方高分辨率下载均受限制；437127 API 为 `isPublicDomain:false`、无 primaryImage，官网提示不能下载。没有绕过其限制，也未把通用开放政策当作该具体图片的授权。西斯莱替代方案已获根任务确认。

## 4. 塞尚：保留真实静物构图的默认创作底图

- 文件 / ID：`still-life.jpg` / `still-life`。
- Paul Cézanne，*Still Life with Apples and a Pot of Primroses*（《苹果与报春花盆静物》），约 1890。
- [Met 官方藏品页，objectID 435882](https://www.metmuseum.org/art/collection/search/435882)，馆藏号 51.112.1。
- [原始 API](https://collectionapi.metmuseum.org/public/collection/v1/objects/435882) 已保存为 `provenance/met-435882.json`，明确 `isPublicDomain:true`。
- 原图 3807 × 3021、2,989,655 字节；完整派生图 2400 × 1904、1,593,289 字节。
- 中央工作区应保留苹果、白布、花盆和报春花的完整位置与构图，使用完整本地图像作为底图；不要重新生成近似静物。该真实底图支持观察用户局部改动与原作的比较，默认覆盖层应该可撤销、清空和单独保存。

## 授权、色彩与可复现过程

[Met Open Access](https://www.metmuseum.org/hubs/open-access) 将明确开放的公版艺术图片及馆藏数据按 CC0 发布。三个选择均以具体藏品网页与真实 API `isPublicDomain:true` 验证，作者、标题、作品年份和照片数字文件出处各自分开记录。

`download.mjs` 对原始下载 bytes 记录 SHA-256、长宽、颜色空间与 ICC 状态；原下载只保存在内存。通过 sharp 0.35.4 / libvips 8.18.6 应用 EXIF 朝向、保持完整画面、Lanczos3 内适配到 2400×2400 边界且不放大、转换与嵌入 sRGB ICC，最终 JPEG quality 92 / 4:4:4。四图都是三通道 RGB、8-bit、嵌入 sRGB profile；未做美学调色。原图像素与重新采样的输出像素不能称作逐字节原文件相同，原 SHA 与本地派生 SHA 分别列在 manifest。

`scripts/verify-creative-assets.mjs` 无需网络即可验证四图身份、文件安全路径、哈希/字节数、JPEG 完整标记/尺寸/ICC/4:4:4、构图长宽比、预算和三份原始 Met 授权元数据。有 bundled sharp 包路径时，还会完整解码每张图的像素。

素材获取与本地静态结构校验已经完成；浏览器交互、默认选区与最终视觉验收由根任务记录。材质像素取样和笔触样本应用是本地实现能力，不是图片生成模型、艺术家风格模型或重新创作原画。
