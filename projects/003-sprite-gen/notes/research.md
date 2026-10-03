# 003 · sprite-gen 能力、原理与实验笔记

[返回项目介绍](../README.md) · [能力展示](../web/index.html) · [固定源码索引](upstream-snapshot.json) · [媒体来源](../assets/media-index.json)

研究日期为 **2026-10-03，Asia/Shanghai**，固定上游 commit 为 [`d993e5300b4255111e8ee0e29779caea1b3b97bd`](https://github.com/aldegad/sprite-gen/commit/d993e5300b4255111e8ee0e29779caea1b3b97bd)，包版本 `2.20.0`。正文区分接口事实、源码分析、上游演示与本地实验；应用收益是结合证据作出的判断。

## 研究问题与范围

### 本轮讨论形成的理解

按“动作内容从哪里来”归纳为三种方式：①参考图与动作要求输入外部视频模型，模型产生连续运动，库拆帧、色键处理并截取循环；②静态姿势用有限身体形变做呼吸，已有姿势 / 帧 / 图集 / 视频按规则整理与编排；③图像模型直接画多姿势图，库提取、对齐、人工选帧与打包。此分类是认知说明，上游仍为两条生成管线与独立处理工具。

GIF 是播放与编码格式；复杂姿态来自模型或已画好的帧，代码呼吸产生有限形变。背景合成处于下游：已有动画、背景和 scene.json 输入，代码逐帧选图、更新位置与镜头、叠加背景和投影阴影，输出 PNG 帧或带背景 GIF / MP4。移动角色的位置不会创造新的肢体动作。

采用价值结合当前开源研究目标理解为：角色动效候选、已有素材批量复用、背景场景样片，以及学习模型适配、规格管理、人工整理、质量报告与导出。单次 GIF 转换的额外收益较少；多角色、多动作、多方向、多配色和多格式时更适合复用流程。这属于接口分析推导，未做人工耗时、模型成功率或批量性能基准。

更强姿态与轨迹约束、其他模型后端、骨骼 / IK、任务生产界面、Unity / Godot 交互等均单列为需要开发与验证的扩展。引导图为 [能力与原理全景图](../assets/capabilities-principles-map.png)，其 [依据清单](capabilities-principles-map.sources.json) 说明固定来源与本机验证范围。README、总索引与 Web 使用同一理解，网页本身不调用生成服务。

| 问题 | 本次回答方式 | 证据边界 |
| --- | --- | --- |
| 库能做什么 | 按图集、视频、独立处理、后期、素材工具和场景整理输入输出 | 固定文档与 CLI 注册表 |
| 哪些步骤由 AI 完成 | 核对图像与视频生成适配器 | 未推断服务未公开的训练和内部网络 |
| 透明、网格、时间如何处理 | 阅读像素、循环实现与契约 | 算法解释不代表所有实际素材都能成功处理 |
| 可以怎样采用 | 给出素材与验收条件 | 收益判断，非质量或性能承诺 |
| 本机实际跑了什么 | 无外部生成的 CLI 实验，保留报告与产物 | 未调用 AI 图像 / 视频服务，未运行游戏引擎 |

Skill 是代理使用 CLI 的工作流说明。Python 包负责生成适配、像素处理、缓存与输出契约，浏览器整理器负责候选预览和编辑，外部服务负责生成新图像或运动。研究这些职责无需把上游 Skill 安装进当前代理环境。[CLI](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/cli.py)、[架构](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/architecture.md)

## 能力地图与源码入口

| 模块 | 操作与产物 | 固定源码 |
| --- | --- | --- |
| 请求准备 | 动作、尺寸、边距、fit → request、布局和提示 | [prepare.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/prepare.py) |
| 图像生成 | prompt、参考图、provider → PNG 与报告 | [gen_set.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/gen_set.py)、[base.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/base.py) |
| 帧提取 | 色键、姿态数、fit → frames 与帧报告 | [extract.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/extract.py) |
| 独立导入 | 图片 / 网格 / 图集 / PNG 集合 → 透明图或可整理 run | [cutout.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/cutout.py)、[slice_sheet.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/slice_sheet.py)、[unpack_atlas.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/unpack_atlas.py) |
| 人工整理 | 选择、顺序、变形、像素编辑、锚点 → curation 与预览 | [curation.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/curate/curation.py)、[serve_curation.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/serve/serve_curation.py) |
| 图集合成 | request + frames + curation → PNG 图集与 manifest | [compose_atlas.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/compose/compose_atlas.py) |
| 视频管线 | 画布、短片、RGBA 帧 → cycle、GIF、WebP、strip | [canvas.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/canvas.py)、[frames.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/frames.py)、[loop.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/loop.py) |
| 后期 | breathe、颜色映射、rig / layer → 动效、变体、合成图集 | [breathe.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/effects/breathe.py)、[recolor.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/effects/recolor.py)、[compose_layers.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/compose/compose_layers.py) |
| 引擎导出 | 图集 manifest → Aseprite-compatible JSON | [export_aseprite.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/compose/export_aseprite.py) |
| 素材工具 | 已有背景 / 动画 → tile、投影阴影、动作报告 | [tile.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/background/tile.py)、[shadow.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/effects/shadow.py)、[motion.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/qa/motion.py) |
| 场景合成 | 现成素材 + scene.json → 帧 / MP4 / GIF、放置与检查 | [model.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/scene/model.py)、[render.py](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/scene/render.py) |

## 从参考图到可用资源

### 规格和角色一致性

`prepare` 将动作、帧数、fps、loop、画布与边距保存为请求，再生成布局引导和提示词。图像路径按动作行组织生成，提取器依据声明的姿态数检查结果。多方向流程以接受过的 idle anchor 作为角色身份依据，basis / paired row 传递动作参考；脸、比例、服饰与配件仍需验收。[prepare](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/prepare.py)、[anchor](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/curate/anchor.py)、[方向工作流](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/directional-anchor-workflow.md)

身份约束依赖参考、提示与人工验收，不等于本地训练了专用身份模型。简单 idle / jump / attack / wave 默认路径也不等同于完整方向锚点链。[架构身份归属](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/architecture.md#5-idle-anchor-architecture-identity-ownership)

### 生成适配器与透明策略

| 路径 | 调用方式 | 透明策略 |
| --- | --- | --- |
| `codex` 图像 | Codex 图像生成，读取会话图像字节 | `native`，请求原生 alpha 并测量 |
| `grok` 图像 | xAI Imagine 图像生成 / 编辑 API | `chroma`，色键生成后本地清理 |
| `openai` 图像 | OpenAI Images REST API，需显式选择 | `native`，透明 PNG，按调用计费 |
| 视频 | xAI Grok Imagine 视频 API | 色键短片拆帧后清理 alpha |

适配器声明能力，报告记录实际后端、认证来源、透明策略和输出数据。默认图像后端从设置解析；显式选择的后端不被可用性回退覆盖。此处是固定仓库的路由规则，本地未验证账号额度、价格、当前服务可用性或生成质量。[生成文档](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/gen.md)、[图像适配器](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/base.py)、[视频适配器](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/video.py)

### 色键、软 alpha 与姿态分离

边缘常混有主体和背景颜色，简单删除近似背景色会吞掉细线。色键路径围绕 `C = αF + (1−α)B` 的混色关系估计覆盖度与主体颜色，结合邻域证据去除溢色；YCbCr 路径处理阴影或压缩噪声。白底 / 浅色底独立 cutout 则走相应 matte 路径。[透明边缘](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/chroma-alpha.md)、[色键实现](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/gen/chroma.py)、[cutout](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/cutout.py)

姿态提取先按 alpha 做连通区域分析，再按面积、横向位置归入姿态。粘连可显式选择 projection 分离，通过投影和动态规划寻找切线；无法恢复声明数时停止。规则切格属于布局已知的另一入口，本次切格实验不能证明未知布局姿态提取成功。[extract](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/extract.py)、[segment](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/segment.py)、[切格契约](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/sheet-slicing.md)

### 像素网格修复的准确含义

`pixel_unfake` 在提取阶段确定性处理，不调用模型。它逐帧测 pitch，再以行共识纠错和回退，随后实测相位、边界吸附、块取色、尺寸限制、alpha 二值化、身体对齐、共享调色板与整数放置。[pixel-unfake](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/pixel-unfake.md)

源码 `resolve_frame_pitch` 规定：正常帧自身测量优先；若与共识的最大轴向比率超过 `1.1`，采用共识防止倍频或塌陷误检；测量失败也会回退并警告。正常帧可有小幅差异，避免统一 pitch 的累积偏差切进眼睛等细节。运行长度估计用于交叉检查，不静默替换标准测量。因此“全主体一个网格”宣传描述不能简化为所有帧强制同 pitch。[精确决策](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/frames/extract.py#L1884)、[pitch 回归](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/tests/frames/test_pitch_ground_truth.py)

`logical_height` 参与目标与整数倍率，不意味着把全部姿态压成同高。压缩可能合并细节；输入精细度与目标差距过大仍需重新准备参考。canonical、plain 和高分辨率显示副本按契约保存，整理器按选择预览和烘焙。[显示 / 输出契约](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/run-contract.md)

### 整理、呼吸、换色与图层

整理器在 `curation.json` 保存帧选择、顺序、变形和编辑。原帧保留，compose / export 读取同一规则烘焙；revision 避免旧编辑误套更新后的帧。候选池与播放序列分开，实时预览按状态时序播放。[整理契约](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/curation.md)

呼吸使用随位置变化的 squash / stretch 形变场，降低脸部和脚端形变；像素路径采用整数行列映射。换色按精确或容差颜色映射改 RGB，保留 alpha 和布局。分层需要显式 rig、整数 landmark、track 与 stack，不会自动把完整角色分成可编辑骨骼。[呼吸实现](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/effects/breathe.py)、[换色](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/recolor.md)、[图层契约](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/layer-tracks.md)

## 视频循环、QA 与资源契约

视频先按动作提供空间：jump 需要头顶余量，attack / projectile 需要横向余量。生成后 FFmpeg 拆帧并逐帧清理，分析的是 RGBA 时序。[画布](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/canvas.py)、[拆帧](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/frames.py)

`video-loop` 计算帧差矩阵 `D[i,j]`，比较时间间隔的重复误差找周期；选起点时比较尾首变化与普通播放步长，避免相似首尾导致停顿。walk / run 还有半周期和上下文检查；单次动作路径找相近休息姿态包围的完整离开和返回。[循环实现](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/loop.py)

RIFE 是额外插帧推理组件，可替换少量突变帧、将方向循环重采样到共同长度；落在源帧位置的帧保留。缺少 RIFE 时 auto 修复 / 对齐可跳过并警告。jolt 和修复分数依赖经验阈值，默认警告不等于质量合格。[循环修复](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/loop-repair.md)、[repair](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/repair.py)、[rife](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/video/rife.py)

| 产物 | 消费方式与边界 |
| --- | --- |
| `sprite-sheet-alpha.png` | 已烘焙图集 |
| `manifest.json.frame_layout.rows` | 播放实例的绝对 `{x,y,w,h}`，可复用单元 |
| `animation.rows` | 动作 fps、loop、帧数、可选 duration |
| `name.strip.png` + `.strip.json` | 横向条带、尺寸、数量和时序 |
| `.gif` / `.webp` | 编码后预览 / 素材，格式限制需检查 |
| `exports/aseprite.json` | Aseprite-compatible 元数据，不是 `.aseprite` 源文件 |

图集矩形是运行时依据，引擎不需要猜网格或扫描 alpha。[run-contract](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/run-contract.md)。Phaser 导出以 tags 组织动作，Flame 可按状态导出 hash JSON；loop 仍由应用读取 / 设置。上游做结构测试，未在 CI 中运行浏览器 Phaser / Flutter；本次也未实测。[引擎导出](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/engine-export.md)

背景 tile 从已有重叠区域寻找低差异缝合；阴影以锚点做压扁、剪切、透明度和模糊。动作报告保留重复姿态的实际时长，缺乏同脚接触假设与隔离 ROI 时 stride 保持未验证。场景用素材时间、锚点、平面 / 层速度、相机和 parallax 定位；像素或时序身份不匹配的 stride 报告不被接受。[素材工具](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/asset-tools.md)、[场景](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/scene.md)

## 命令模板与依赖

以下是按固定接口整理的模板，替换素材和目录后自行执行，**不构成本机生成成功记录**。安装固定快照并用独立虚拟环境：

```powershell
git clone https://github.com/aldegad/sprite-gen.git sprite-gen-upstream
Set-Location sprite-gen-upstream
git checkout d993e5300b4255111e8ee0e29779caea1b3b97bd
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -e .
& .\.venv\Scripts\sprite-gen.exe --help
```

图集路径：

```powershell
& .\.venv\Scripts\sprite-gen.exe prepare --out-dir runs/hero --character-id hero --base-image base.png
& .\.venv\Scripts\sprite-gen.exe gen-set --run-dir runs/hero --provider codex
& .\.venv\Scripts\sprite-gen.exe extract --run-dir runs/hero
& .\.venv\Scripts\sprite-gen.exe curation --run-dir runs/hero
& .\.venv\Scripts\sprite-gen.exe compose-atlas --run-dir runs/hero
& .\.venv\Scripts\sprite-gen.exe export-aseprite --run-dir runs/hero
```

视频和已有素材：

```powershell
& .\.venv\Scripts\sprite-gen.exe video-set --base side=still.png --states idle,jump,attack --out-dir video-set
& .\.venv\Scripts\sprite-gen.exe cutout icon.png --white-check
& .\.venv\Scripts\sprite-gen.exe slice-sheet --sheet sheet.png --chroma-key magenta --grid 3x2
& .\.venv\Scripts\sprite-gen.exe unpack-atlas --atlas sheet.png --grid 3x2 --out-dir runs/imported
& .\.venv\Scripts\sprite-gen.exe compose-atlas --run-dir runs/imported
& .\.venv\Scripts\sprite-gen.exe recolor-palette --base runs/imported/sprite-sheet-alpha.png --out palette.draft.json
& .\.venv\Scripts\sprite-gen.exe recolor --run-dir runs/imported --spec recolor.spec.json
```

`palette.draft.json` 是颜色列表，要编辑成 `sprite-gen-recolor` spec 后再换色，不能直接用作 spec；各命令参数以 `--help` 为准。[换色说明](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/recolor.md)

| 依赖 | 所属步骤 |
| --- | --- |
| Python `>=3.11` | CLI 和处理引擎 |
| Pillow `>=12.3.0,<13` | 图片读写、alpha、变形和编码 |
| NumPy `>=2.2.6,<3` | 像素数组、色键、帧差分析 |
| 所选 provider 的登录 / 凭据 | 外部图像生成，服务决定模型与计费 |
| Grok 登录或 `XAI_API_KEY` | 外部视频生成 |
| `ffmpeg` / `ffprobe` | 拆帧、视频检查与编码 |
| `img2webp` | 动画 WebP 编码 |
| 可选 RIFE 可执行文件与权重 | 视频修复 / 周期对齐，组件许可单独核对 |
| 浏览器 | 上游整理器及本项目展示 |

核心版本约束来自 [pyproject.toml](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/pyproject.toml)，视频依赖来自 [video-pipeline](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/video-pipeline.md) 和 [loop-repair](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/loop-repair.md)。

## 本地实验与验证

在子项目目录运行 `python scripts/run_demo.py`。脚本独立建立 `.venv`，抓取固定 commit 的 87 个 Python 模块及元数据 / 声明并验证 Git blob SHA，安装固定兼容依赖，然后调用上游安装后的 `sprite-gen` console script。源码缓存、run 和日志位于忽略的 `.cache/`；网页公开产物在 `web/demo/`，验证在 `notes/validation.json`。

本次环境：Windows、Python `3.12.14`、Pillow `12.3.0`、NumPy `2.5.3`、sprite-gen `2.20.0`。输入由 Pillow 矩形和线段绘制，为 `384×320` 品红网格、`3×2` 布局、6 个几何机器人姿态。**输入非 AI，外部模型调用为 0。**

| 实际阶段 | 结果与证据 |
| --- | --- |
| `cutout` | 去除 84,182 个背景像素；全部 38,698 个源前景像素保留；无脏透明像素；[cutout-sheet.png](../web/demo/output/cutout-sheet.png) |
| `slice-sheet` | 导出 6 帧，每帧 `128×160`，明确 grid、baseline 和 target height；[frames](../web/demo/output/frames/frame-00.png) |
| `unpack-atlas` PNG 导入 | 创建 `wave` run；脚本随后显式设置 `fps:6, loop:true`，并保留 [sprite-request.json](../web/demo/input/sprite-request.json) |
| `compose-atlas` | `768×160`，6 个绝对矩形；逐帧像素与切格输出相同；[atlas.png](../web/demo/output/atlas.png)、[manifest.json](../web/demo/output/manifest.json) |
| `unpack-atlas` 图集往返 | 根据 atlas + manifest 恢复 6 帧，与原帧逐像素相同 |
| `compose-gif` | 6 帧透明 GIF，每帧 `170ms`，每帧透明像素至少 13,972；[wave.gif](../web/demo/output/wave.gif) |
| `recolor-palette` | 提取 4 色草稿；[palette.json](../web/demo/output/palette.json) |
| `recolor` | sunset、violet 两变体，各改 14,587 个 RGB 像素，alpha 保持不变；[sunset](../web/demo/output/variants/sunset.png)、[violet](../web/demo/output/variants/violet.png) |
| `export-aseprite` | 6 帧 Aseprite JSON array，wave tag 为 0–5；[aseprite.json](../web/demo/output/aseprite.json) |
| `export-pngs` | 6 个导出 PNG，与源帧逐像素相同；[frame-00.png](../web/demo/output/exported-pngs/frame-00.png) |

共 **10 次 CLI 调用、9 个不同命令全部返回 0**。所有命令、耗时、测量和产物 SHA-256 见 [validation.json](validation.json)，网页数据入口见 [demo.json](../web/demo/demo.json)。PNG 导入的默认时序并非动画需求，本地脚本明确修改 recipe 后再 compose。manifest 为 6fps / loop，Aseprite duration 为 `167ms`；GIF 为 `170ms`，来自 GIF 的 `10ms` 时长刻度量化，不能声称各格式时长字节一致。

这项实验验证规则布局图片处理、图集与帧对应、透明度、换色与结构导出，不覆盖 `gen` / `gen-set`、AI 视频、视频循环识别、pixel-unfake、未知布局姿态提取、上游整理器服务器、RIFE、场景视频或游戏引擎运行时。

另归档 7 个上游原样示例，总 3,044,982 字节，逐项大小和 Git blob SHA-1 与固定 tree 一致；逐文件来源与 SHA-256 见 [media-index.json](../assets/media-index.json)。上游角色与家具媒体是效果参照，不是本地实验产物。

## 采用判断与未验证问题

优先从已有素材处理和短动作候选入手，先定义尺寸、帧数、动作语义及验收，再比较输入输出。循环移动要看脚步交替、完整周期、方向相位、身体抖动和漂移；统计指标暴露问题，最终仍需看动画。[状态与帧数](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/states-and-frames.md)、[motion QA](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/docs/qa-motion.md)

尚未实测外部服务的登录、额度、费用和生成质量；未做大量真实素材、耗时 / 内存基准；未运行 Phaser / Flame；未证明复杂人形 locomotion 或多方向切换已达到交付要求。上游演示和本次几何样本各有范围，不能替代这些验证。

## 来源与许可处理

研究链接固定到本次 commit，后续上游变化不自动成为当前结论。包声明 Apache-2.0；上游媒体未在此快照发现逐文件独立许可，已按仓库许可上下文保留来源、LICENSE、NOTICE 并标记原样未改动。生成服务内容和可选 RIFE 有各自条件，不能由代码许可一并推断。[LICENSE](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/LICENSE)、[NOTICE](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/NOTICE)、[本地第三方说明](../THIRD_PARTY_NOTICES.md)
