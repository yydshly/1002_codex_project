# 006 · text-to-cad 研究笔记

[返回项目介绍](../README.md) · [模型清单](../src/README.md)

日期：2026-10-03，Asia/Shanghai。固定上游版本为 `0.7.10`，commit 为 [f62f86746a9c74bab08f8e68d0fb76ba68dc3c86](https://github.com/earthtojake/text-to-cad/commit/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86)。官方仓库：[earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad)。

本文记录首轮基础实验；后续望远镜、三种运动、实际干涉修正和新的理解整理见 [望远镜过程](telescope-demo.md)与 [能力、原理、效果和价值总览](understanding.md)。后续结果不覆盖首轮记录中标明的当时验证状态。

## 研究问题与判断标准

1. 文字需求如何变成具有确定尺寸的 CAD？检查源代码中的特征分解，并对保存的 STEP 做独立尺寸和拓扑验收。
2. 调整参数是否改变真实几何？用同一安装板工厂生成 80 mm 与 100 mm 长度变体，测量孔轴间距和体积。
3. 零件能否保持独立、正确定位？核对保存装配的叶节点、实体、坐标、最小间隙和交叠体积。
4. 带内腔、柱、孔和开口的模型如何组织？分成底座、上盖与装配入口，检查空腔/材料占用和各项几何特征。
5. 工程图是否使用实际模型几何？从保存文件投影视图，测量尺寸与孔径，再独立查看 PDF 的排版。

几何证据来自保存后的 B-rep，截图用于视觉复核。预期尺寸在验收脚本中独立规定，验收不导入建模源码常量。

## 安装、版本与环境

本机已完成用户级原生插件注册并启用 `text-to-cad@earthtojake` 0.7.10，证据见 [安装记录](installation.json)。子项目另有 13 个技能快照，位于 `.agents/skills/`，包含 CAD、工程图、DXF、DFM、DfAM、切片、Bambu、STEP 零件搜索、URDF/SRDF/SDF、SendCutSend 和 CAD MCP setup。快照、独立 `.venv/` 与 `.cache/` 都在 [忽略规则](../.gitignore)中；新检出的恢复方法见 [项目复现说明](../README.md#本地复现)。

[pyproject.toml](../pyproject.toml)指定 Python 3.12 和 `cadgen[snapshot]==0.7.10`，实际依赖由 [uv.lock](../uv.lock)锁定。`uv sync --frozen`恢复运行环境；Chromium 通过 `uv run --frozen python -m playwright install chromium --only-shell`为 shell 快照准备。

[PowerShell 入口](../scripts/run-demo.ps1)把 BLAS/OMP/MKL 线程数临时设为 1，作为本次 Windows 运行的环境 workaround，结束后恢复原值。它依次生成模型、运行验收、生成工程图和快照，并在非零退出时停止。本次完整执行退出码为 0。原生插件可以打开已有 STEP；本地 `cadgen viewer --host 127.0.0.1 --json --detach`提供查看器 URL，端口取返回值。

本次已在浏览器打开本地查看器并截图确认六个模型显示。原生 `cad_open`返回启动信息，但 `cad_view`未返回打开视图；自动 CAD tab 联动本次未验证。

## 机制与职责

```text
文字/尺寸要求
    → 分解实体特征，选择基准与约束
    → Python 几何工厂 + 独立模型入口
    → build123d / OpenCascade 实体运算
    → STEP 与 STL/GLB 等输出
    → 保存文件的几何回读、测量与判定
    → 快照/PDF 视觉复核、CAD Viewer 交接
```

技能库给代理提供任务步骤、接口约定和验收要求；`cadgen`运行时承担模型构建、输出、保存文件读取、测量辅助和渲染。自然语言解释、设计意图判断、特征构造顺序和检查选择由代理完成。

模型函数返回 build123d 几何，`@step`、`@stl`、`@glb`声明输出位置。执行 `python src/<model>.py`构建模型；装配直接调用子模型，然后使用 `.moved()`表达位置。装配更新时运行装配入口，变化沿子模型依赖传递。查看器和快照从保存文件读取几何，渲染过程不执行模型源码。

设计参数留在 Python 工厂和常量中。生成的 STEP 是独立交换文件，不携带本实验源码的参数和完整特征历史。通用关节或运动声明属于另一层接口，本次装配使用明确坐标放置，没有测试运动求解。

## 实验一：参数变体与销装配

[安装板工厂](../src/mounting_plate.py)先建立矩形实体，对竖直角边做 R3 圆角，再用圆柱工具切四个 Ø5.5 通孔。板以原点居中，80×50×5 mm，孔中心为 `(±30, ±15)`，因此孔距为 60×30 mm。

[宽板入口](../src/mounting_plate_wide.py)复用同一工厂，把长度改为 100 mm。孔中心由边缘距离推导为 `(±40, ±15)`，保存几何的 X 孔距为 80 mm。两个配置各有独立产物，便于同时比较。

[销装配](../src/plate_assembly.py)调用基础安装板，并把同一 Ø4.5×12 mm 销放到四个孔轴位置。销底为 z=-2.5，顶为 z=9.5；孔壁与销的最小间隙实测为 0.5 mm。保存装配保留安装板和四根销的独立实体与标签。

[独立验收脚本](../checks/verify_models.py)检查基准板、宽板及装配：包围盒与位置、有效正体积实体、上下完整圆孔、孔径/孔轴/孔距、四角圆弧、解析体积、销尺寸及位置、最近点间隙和零交叠。板的解析体积为：

```text
V = [L × W − (4 − π) × R² − 4 × π × (D / 2)²] × T
```

[实际报告](validation.json)状态为 `pass`：409 项通过、0 项失败。报告保留各项实测值、单位、容差、文件摘要以及装配最近点见证坐标。长度容差 1e-5 mm，体积容差 1e-3 mm³；文件摘要用于标明验收对象。

## 实验二：外壳的特征分解

[底座](../src/enclosure_base.py)的功能基准是底面 z=0，外包络 100×70×30 mm。外轮廓 R5，减去 94×64 mm、内角 R2 的空腔，空腔从 z=3 开始并切穿顶面，留下 3 mm 底板和侧壁。内外圆角同心，使圆角区域也对应 3 mm 壁厚。

四个螺丝柱位于 `(±40, ±25)`，外径 10 mm，范围 z=3..30；Ø3.2 孔继续穿过底板到 z=0。两条长侧壁各有五个 6×8 mm 矩形通风口，中心 x 为 -24、-12、0、12、24 mm，中心高度 z=18 mm。加柱、切孔和切通风口都保留在同一个底座实体中。

[上盖](../src/enclosure_lid.py)为独立的 100×70×3 mm、R5 零件，四个 Ø3.5 通孔，局部底面 z=0。[装配入口](../src/enclosure_assembly.py)调用两件模型，以 `.moved(Location(...))`把上盖移动到 z=30.5..33.5，形成 0.5 mm 缝隙。

[外壳验收](../checks/verify_enclosure.py)使用独立规格检查保存的部件和装配：

- 两件各自包含一个有效、正体积的实体，包围盒及位置符合要求。
- 底座孔上下完整圆环为 Ø3.2，上盖为 Ø3.5；轴心匹配，柱的外径和上下圆环符合 Ø10、z=3..30。
- 外角 R5、空腔角 R2 的圆弧及位置符合规格，实体体积与解析值一致。
- 用 `Solid.is_inside(point, tolerance=...)`检查选定内腔点无实体、底/壁/柱点有实体、孔轴与通风开口点无实体。通风口另取宽度和高度附近的内外点，检查开口和周围材料。
- 保存装配有两个叶节点、两个实体，上盖世界坐标正确，最小间隙为 0.5 mm，交叠体积为零。

[实际报告](enclosure-validation.json)状态为 `pass`：721 项通过、0 项失败。空腔与开口的点分类是报告中列出的采样检查；它们与尺寸、圆弧、体积和拓扑检查共同构成当前验收覆盖范围。

## 实验三：工程图与视觉证据

[工程图脚本](../scripts/drawing_demo.py)读取基础安装板 STEP，先核对保存几何与设计意图，再从实际圆边取得孔轴和孔径。通过 `cadgen.eng_drawing`生成 [A3 PDF](../PDF/mounting_plate_drawing.pdf)，包含第三角三视图、斜视图、80×50 外形、60×30 孔距、5 mm 厚度、4×Ø5.5 THRU 和 R3 标注。尺寸文本没有人为覆盖为预设结果。

[PDF 页面图](../assets/mounting_plate_drawing.png)已生成并完成整页排版视觉检查；六张模型 PNG 快照也已生成并逐张查看，均通过视觉复核。几何验收与视觉 QA 分开记录；[视觉记录](visual-review.json)和 [图像](../assets/)保留本次证据。

上游工程图接口能投影视图、生成隐藏线与中心标记并测量尺寸；公差需要明确提供。其文档当前列出剖视、局部详图和辅助视图尚未提供，标注与线条冲突仍需人工或代理查看 PDF。

## 实验记录汇总

| 日期 | 范围 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| 2026-10-03 | 原生插件与项目环境 | 0.7.10 已用户级注册并启用；项目独立 uv 环境、13 个本地技能快照 | [安装记录](installation.json) · [锁文件](../uv.lock) · [环境规则](../AGENTS.md) |
| 2026-10-03 | 安装板、参数变体、四销装配 | 保存 STEP 几何验收通过 | [模型源码](../src/README.md) · [报告](validation.json) |
| 2026-10-03 | 内腔、柱、孔、十通风口及上盖装配 | 保存 STEP 几何验收通过 | [底座](../src/enclosure_base.py) · [装配](../src/enclosure_assembly.py) · [报告](enclosure-validation.json) |
| 2026-10-03 | A3 工程图 | PDF 已生成并通过整页排版检查 | [脚本](../scripts/drawing_demo.py) · [PDF](../PDF/mounting_plate_drawing.pdf) |
| 2026-10-03 | 本地浏览器查看器 | 已确认六个模型显示；原生自动 CAD tab 联动未验证 | [查看命令](../README.md#本地复现) |
| 2026-10-03 | STEP 模型快照与完整复现 | 六张快照逐张视觉复核通过；run-demo 退出 0 | [视觉记录](visual-review.json) · [复现入口](../scripts/run-demo.ps1) · [图像目录](../assets/) |

## 已验证的发现与适用范围

本次展示了从尺寸要求到实体构造、参数变体、独立部件和保存装配的完整几何链路。复杂模型的可操作性来自特征可描述、接口可规定、结构可分解和结果可测量。保留代码使同一构造规则能用于不同配置，并把外形、开孔与装配位置的关系写清楚。

几何内核成功构造有效实体仍需与规格比较；本次因此同时检查包围盒、圆孔、圆角、体积、材料占用、实体层级和间隙。截图、控制台成功信息或源码常量单独不足以说明保存文件满足规格。

适合继续研究的方向包括参数化安装件、外壳、支架、带明确接口的装配、模型交换和尺寸图。基于不带尺度的图片复现时，应记录尺寸假设；配合、螺纹、载荷等要求需要明确输入。任意雕塑的外形选择与建模表示仍取决于需求和建模策略，本次未验证其自动生成能力。

## 尚未验证的范围

本次未进行 DFM/DfAM、切片、实际打印、机器人描述与仿真、供应商零件搜索或采购。外壳没有载荷、材料、螺纹配合、加工工艺或生产公差规格。验收证明报告中列出的几何关系，不构成这些工程需求的完成结论。

上游 DFM 明确是指导式审查：钣金/CNC 使用检查流程与几何测量，注塑有测量工具；判定需要材料和供应商规则。运动文档中的查看器采用树形正向运动学，闭环机构求解不在其当前范围。这些均为源码/文档阅读发现，未做本机功能实测。

## 参考与本地改动

- [固定版本 CAD 技能](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/cad/SKILL.md)：源码建模、输出、保存文件验收与查看器交接。
- [模型执行契约](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/cad/references/step-generation.md)：装饰器、工厂、子模型与独立输出。
- [几何检查接口](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/cad/references/inspection-and-validation.md)：`read_scene`、圆边、最近点、交叠和拓扑。
- [图片与图纸解释](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/cad/references/cad-brief.md)：尺度、推断与待验证尺寸。
- [工程图接口](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/engineering-drawing/references/sheet-api.md)：实际模板、视图与尺寸 API。
- [DFM 技能](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/dfm/SKILL.md)、[运动接口](https://github.com/earthtojake/text-to-cad/blob/f62f86746a9c74bab08f8e68d0fb76ba68dc3c86/skills/cad/references/kinematics.md)：文档阅读所得边界。
- [build123d 0.11.1 点分类实现](https://github.com/gumyr/build123d/blob/v0.11.1/src/build123d/topology/three_d.py)：本次 `is_inside`检查采用的实际签名。
- [MIT 许可副本](upstream-MIT-LICENSE.txt)：保存上游声明。

本地新增六个模型入口、两组独立验收、工程图及 PowerShell 复现脚本；模型为本实验自行编写。技能和运行时按固定上游版本使用，未在本实验加入打印、下单或对外服务动作。
