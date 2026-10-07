# 地标场景资产来源与范围

验证日期：2026-10-05。采用纽约 Carnegie Mansion（卡内基宅邸、现 Cooper Hewitt 博物馆）的 Smithsonian 官方开放建筑模型来源。

[Cooper Hewitt 官方模型页](https://www.cooperhewitt.org/open-source-at-cooper-hewitt/mansionmodel/) 明确：3D Systems 于 2014 年 6 月扫描、制作并捐赠；模型使用 CC0 许可，允许下载、修改与再利用。该页面把 STL 描述为简化的中空打印模型，把包含色彩纹理与分层室内的完整数据描述为 FBX。ATELIER 本轮接入的是前者，不能把两个版本的范围混在一起。

官方 [Smithsonian Exterior 记录](https://3d.si.edu/object/3d/carnegie-mansion-exterior%3A5010a19c-2f7f-4325-b43c-bebe6711b473) 与 [原始 STL 地址](https://3d-api.si.edu/content/document/3d_package:5010a19c-2f7f-4325-b43c-bebe6711b473/resources/CooperHewitt_print.stl) 在下载时分别出现站点暂不可用 / 403。使用保留该官方来源链的 [公开 CC0 镜像](https://www.3d-printed.org/models/smithsonian-carnegie-mansion-exterior-55cce488)，并逐字节核对镜像公开的 SHA-256。不存在登录、凭证、付费、隐藏接口或访问限制绕过。

实际交付文件 `web/assets/landmark/CooperHewitt_print.stl`：17,164,134 bytes、343,281 三角、单几何、0 原材质、0 纹理；所有三角属性字为 0。SHA-256 为 `2158098219d3f2e8030d26edc3d7cdf119d1fb01f3d9a9bef62c4a45d8a2c49d`。无 NaN / Infinity 坐标；原文件的 1,163 个近退化面与零法线原样保留。未作几何修复、简化、拓扑替换或纹理生成。

STL 没有记录物理单位、测绘精度、地理朝向或采集点位。真实浏览器的正面、背侧与屋顶三种渲染已确认：Y 轴对应建筑高度，显示放大 2 倍、X/Z 居中及 Y 轴落地后模型没有倒置。这是展示轴向的观察结果，不构成地理朝向或真实长度单位的证明。`manifest.json` 保存原始数值包围盒供展示取景。页面只验证模型轨道浏览、视角与光照状态、点击热点及保存恢复，不将显示尺寸用于真实建筑测量；白模展示材质由本产品提供，不伪称照片纹理。历史文字另按 `hotspots.json` 的博物馆来源核查；浏览器整体验收另见 `notes/landmark-validation.json`。

备选筛选记录：

- [Khronos Sponza](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Sponza/LICENSE.md)：模型资产标为 Cryengine Limited License Agreement，只有元文档为 CC BY。没有当作通用 CC-BY 资产接入。
- [Intel 2022 Sponza](https://www.intel.com/content/www/us/en/developer/topic-technology/graphics-research/samples.html)：官方明确 Creative Commons Attribution；基础包 3.71 GB，不满足本轮轻量本地交付预算。不能把 Khronos 旧 Sponza 文件替换署名为 Intel 新版。
- [Devonaboy 作者模型](https://github.com/bilol-makhmudov/monuments)：提供 CC BY-SA 与纹理署名、测量证据，但作者详细说明室内平面含假设，且重建建筑的著作权 / panorama 许可未解决。只作候选评估，没有发布或接入。
