# 上游素材与许可记录

本子项目展示 [aldegad/sprite-gen](https://github.com/aldegad/sprite-gen) 的能力。以下记录对应固定提交 [`d993e5300b4255111e8ee0e29779caea1b3b97bd`](https://github.com/aldegad/sprite-gen/tree/d993e5300b4255111e8ee0e29779caea1b3b97bd)，核查与下载日期为 2026-10-03（Asia/Shanghai）。

## 媒体来源与展示性质

`web/media/` 中的 7 个 GIF / PNG 均为该提交的 `docs/assets/` 原始文件，未修改、未压缩、未重绘。全部文件大小和 Git blob SHA-1 与上游 tree 一致，总大小为 3,044,982 字节。逐文件来源、尺寸、帧数、SHA-256、中文描述与归属记录保存在 [assets/media-index.json](assets/media-index.json)。

| 本地文件 | 上游用途 | 展示说明 |
|---|---|---|
| `web/media/attack-fox-hood.gif` | README 中的狐狸攻击循环 | 上游说明为静态角色经 Grok Imagine 视频和 sprite-gen 视频处理管线得到的结果 |
| `web/media/attack-slime.gif` | README 中的 slime 攻击循环 | 同上；命名沿用上游，角色视觉为带背壳的蓝色像素角色 |
| `web/media/demo-furniture.gif` | `docs/curation.md` 中的整理界面录屏 | 等距家具网格与素材调整操作；界面文字来自上游 |
| `web/media/chroma-fullbody-illustration-green.png` | `docs/chroma-alpha.md` 中的绿幕插画比较 | 上游三栏图，包含源图、v1.12.0 和 v1.13.0 结果，非本地重新运行的结果 |
| `web/media/chroma-fullbody-pixelart-magenta.png` | `docs/chroma-alpha.md` 中的像素图比较 | 上游三栏图，包含品红源图和版本间抠图结果 |
| `web/media/cutout-demo.png` | `docs/assets/` 中的独立抠图展示 | 白底导入图、品红检查图与棋盘透明效果并列 |
| `web/media/curator-iso.png` | `docs/curation.md` 中的界面截图 | 韩文整理界面、等距网格和素材预览 |

这些文件作为“上游演示”展示。它们不构成本地安装、运行或质量测试的证据。本地可复现演示应单独标明输入、命令与实际输出。本次素材整理没有调用付费 AI，也没有生成替代媒体。

## 上游许可证与归属

能力与原理总览图 `assets/capabilities-principles-map.png` 及发布副本 `web/media/capabilities-principles-map.png` 为本项目程序绘制的解释图。图中狐狸小图取自上游 `attack-fox-hood.gif` 的若干帧，经透明边界裁切、缩放和排版形成流程示意；它们不表示在本机分别运行了这些生成路线。机器人来自本项目程序绘制输入与真实 CLI 输出，森林和工具图标由绘图脚本绘制。上游狐狸来源和修改方式记录在 [图依据清单](notes/capabilities-principles-map.sources.json)，保留原始 LICENSE 与 NOTICE。总览图的版面、文案和场景示意不是上游原始媒体。

上游仓库根目录声明 **Apache License 2.0**，`NOTICE` 记录 `sprite-gen`、`Copyright 2026 Alex Kim`，并记录部分算法来源。完整原始文本已随本子项目保留：

- [assets/upstream-LICENSE.txt](assets/upstream-LICENSE.txt)：[固定提交中的 LICENSE](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/LICENSE)。
- [assets/upstream-NOTICE.txt](assets/upstream-NOTICE.txt)：[固定提交中的 NOTICE](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/NOTICE)。

`NOTICE` 说明 alpha 质心对齐、投影分割、可选 YCbCr 抠图和像素网格估计中的部分实现来自 MIT 许可的 [perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio)，归属 Andrew Kim（gykim80）；同时说明其流程受到 Apache-2.0 `hatch-pet` 启发，且不包含 Codex pet 视觉素材。上述说明保留在原始 NOTICE 中。

本子项目还保存 [notes/upstream-modules.py](notes/upstream-modules.py)，来源为该提交的 [`sprite_gen/_modules.py`](https://github.com/aldegad/sprite-gen/blob/d993e5300b4255111e8ee0e29779caea1b3b97bd/sprite_gen/_modules.py)。该源码用于整理模块分类，文件内带有 `SPDX-License-Identifier: Apache-2.0`，归属与许可沿用上述 sprite-gen LICENSE / NOTICE。源码来源文件保留原内容，本地仅更改存放路径与文件名。

## 媒体许可边界

所核查快照没有为这 7 个文档媒体提供独立许可文件或逐文件创作 / 生成服务条款说明。本子项目按上游仓库的 Apache-2.0 声明保留许可与来源，但不把仓库的软件许可表述为对每个角色设计、模型输出、第三方标识或其他潜在权利的额外保证。README 对部分攻击动画说明了 Grok Imagine 的参与；这也不等于取得了该服务所有输出用途的独立授权。

如将这些演示媒体进一步用于产品素材库、商业角色或其他用途，应根据具体文件的创作来源和适用条款判断。项目名称及界面名称仅用于说明来源，不表示上游作者或服务提供方认可本子项目。
