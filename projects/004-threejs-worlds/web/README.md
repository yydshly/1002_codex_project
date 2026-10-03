# 004 · LUME 海岸艺术花园 Web

原生 HTML/CSS/JavaScript，主入口为完整的单人海岸艺术花园。使用 Three.js r180、动画 glTF、HDR/PMREM、物理材质与玻璃、反射 Water、实例化植被、SSAO 和 Bloom。原作 iframe 与基础参数实验保留为两个辅助来源。

页面首部新增生成的「理解总览」：能力、原理、使用场景、可扩展方向、三层职责、角色来源与体感、当前归档状态。图中可打开实时演示弹窗，复用原有 `#showcase-view` 和同一个 WebGL 场景；关闭后恢复原位置，不额外创建渲染器。扩展说明是后期计划，未标为已实现能力。

[项目介绍](../README.md) · [研究笔记](../notes/research.md) · [第三方声明](../THIRD_PARTY_NOTICES.md)

## 运行

仓库根目录：

```powershell
npm run build
node scripts/serve.mjs --port 4189
```

预览 [海岸艺术花园](http://localhost:4189/projects/004-threejs-worlds/#source=showcase&world=art-garden)。本项目通过总构建复制到 `_site/`；仅更新静态展示时可运行 `node scripts/catalog.mjs build`。Node.js ≥22；无需安装运行时 CDN 或额外 Three.js 包。

`publishDir` 为 `projects/004-threejs-worlds/web`。资源使用相对路径，支持 GitHub Pages 子路径。须通过 HTTP 加载 ES modules；部署见[仓库指南](../../../docs/deployment.md)。

## 三种来源

| 路由 | 用途 |
| --- | --- |
| `#source=showcase&world=art-garden` | 主展示：数字展览、自主漫游与自动导览 |
| `#source=original&world=solstice&room=commons` | 原作在线接入；`porto/solstice/astral` 三世界 |
| `#source=lab&world=coast` | 基础实验；`harbour/coast/observatory` 三个参数化场景 |

切换时只有当前来源绘制。花园和实验延迟创建，离开时停止 RAF 与输入；花园音频随页面来源暂停。原作在本地模式被替换为 `about:blank`，返回后重新接入。页面后台暂停 WebGL 更新。

花园初始进入雕塑广场，「回到入口」与「跟随导览」从入口开始。操作：WASD / Shift / 鼠标拖动 / 滚轮；V 切换 third/first/overview，E 查看附近作品，Q 挥手。触屏提供方向按钮，方向输入可接管导览。「定位展点」直接传送到对应入口。「海风」由用户点击后合成环境声。光照与画质独立切换，支持浏览器内全屏与 Esc 返回。

「流畅」关闭实时阴影、反射更新、SSAO 与 Bloom，并降低像素预算；「均衡/精细」恢复这些效果。FPS 是即时帧率，随设备和视角变化。基础实验的 draw calls 单独统计主视角，不能与含反射和后处理的花园直接比较。

## 模块

| 文件 | 职责 |
| --- | --- |
| `app.js` | 三种来源、原作 iframe、路由、教学与参数控制 |
| `understanding.js / understanding.css` | 总览主题展开、图上入口、响应式布局与实时演示弹窗 |
| `showcase.js` | 花园延迟加载、地图、展品面板、导览/光照/画质/音频界面 |
| `park-scene.js` | 空间建造、PBR/HDR、Water/后处理、骨骼动画、移动/障碍/镜头与导览路线 |
| `assets/` | 独立 CC0 角色、两张 HDR 与材质图；`manifest.json` 保存来源和哈希 |
| `vendor/addons/` | 固定 r180 官方加载器、几何、Water、后处理与依赖 |
| `world.js` | 辅助参数实验的程序化世界与几何人物 |
| `value.js / lessons.js` | 原作价值与基础教学数据 |
| `network.js` | Trystero/WebRTC 流程教学模拟，无真实联网 |

修改展览内容时编辑 `park-scene.js` 的 `EXHIBITS`；改变可达路线时同步调整 `tourRoute` 和障碍边界。画面布局与操作按钮在 `index.html/styles.css`。保存资源后重建静态站点，再刷新浏览器。

资源恢复脚本：`node projects/004-threejs-worlds/scripts/vendor-showcase.mjs`。使用 `--cached` 仅为现有本地文件重建来源/哈希清单，不联网。Three.js 核心恢复脚本为 `vendor-three.mjs`。

主展示角色来自 RobotExpressive CC0，HDR 与混凝土来自 Poly Haven CC0；没有复制原作人物或 bundle。布局与交互为本地实现。本地主展示为单人体验，原作多人连接由原站处理，联机可视化仍为教学模拟。浏览器验证见[结构化记录](../notes/validation.json)。
