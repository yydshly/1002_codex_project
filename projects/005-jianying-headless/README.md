# 005 · Jianying Headless 配置驱动剪辑研究

**用结构化配置执行初步剪辑：macOS 适配剪映工程与原生引擎，Windows 使用 FFmpeg 输出 MP4。** 对当前工作，这个项目主要提供自动化剪辑的方向参考，暂不投入深入研究或集成。这是当前用途的选择，不是对项目整体研究价值的判断。

[返回总索引](../../README.md) · [研究方法与证据](notes/research.md) · [上游仓库](https://github.com/mcncarl/jianying-headless)

## 本次整理图

![Jianying Headless 理解图：配置驱动初步剪辑，剪映逆向适配与 FFmpeg 公开命令行两条路径，AI 外部决策和人工精修，当前仅作方向参考](assets/jianying-headless-overview.png)

[查看原尺寸图片](assets/jianying-headless-overview.png)

## 研究记录

| 项目 | 内容 |
| --- | --- |
| 固定编号 | 005 |
| 日期 | 2026-10-03，Asia/Shanghai |
| 上游 | [mcncarl/jianying-headless](https://github.com/mcncarl/jianying-headless) |
| 分析 commit | [42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252](https://github.com/mcncarl/jianying-headless/commit/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252) |
| 上游状态 | `0.2.0-preview`；干净机器验收未完成 |
| 本次范围 | 静态源码与作者验证记录阅读、中文整理及信息图归档 |
| 实测范围 | 未安装剪映或本项目，未运行剪辑、草稿生成或导出 |
| 许可 | 个人学习和非商业使用；商业使用需作者书面授权 |

版本与验收状态以固定快照的 [project.json](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/project.json) 为依据。本目录保存理解文档与本次图，不复制上游源码。

## 能力与环境

| 路径 | 主要能力 | 使用边界 |
| --- | --- | --- |
| macOS 剪映原生 | 多轨剪辑、字幕、音频、画中画、有限关键帧与原生效果；生成或修改可编辑草稿，再原生导出 | 主要适配剪映 11.5.0，兼容 11.4.2；依赖匹配的 Apple Silicon Mac、应用二进制和工具链 |
| Windows FFmpeg | 切片、常速变速、叠加、音频混合、音量和基础文字，输出 MP4 | 无需剪映；不生成或修改 Windows 剪映可编辑草稿，不支持剪映原生效果、转场与关键帧 |

以上是上游声明及源码边界，未在本机实测。[上游说明](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/README.md)、[Windows 路径](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/docs/windows-ffmpeg.md)

## 原理与分工

JSON 配置描述素材、时间、字幕、音量和画面安排。配置本身不是完整的剪映对接：剪映路径还需要把计划映射为私有草稿结构，进行编解码，并通过反向分析得到的内部接口调用本机引擎。FFmpeg 路径将计划转换为滤镜图与公开命令行调用，无需逆向 FFmpeg。

```text
素材 + 人工或外部 AI 的剪辑决定
                 ↓
           结构化 JSON 计划
            ↙          ↘
Mac：草稿映射与编解码   Windows：FFmpeg 滤镜图
            ↓                  ↓
可编辑剪映草稿 / 原生 MP4     MP4 成片
            ↓
      人工检查与精修
```

本库负责执行计划与验证结果；内容理解、删留判断和风格选择需要人工或外接 AI。剪映里的手动修改不会自动回流原计划，旧导出快照也不会自动包含后续修改。[计划与接口](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/skills/yichen-jianying-edit/references/headless-macos.md)

## 当前结论

适合参考的场景是口播粗剪、模板化批量制作和 AI 生成内容向人工编辑工程交接。它能帮助减少重复操作；成片内容、字幕、声音与审美仍需人工检查。

当前使用 Windows，并未提出接入剪映工程或批量生产的实际需求，因此保留“配置驱动执行、AI 决策外接、人工精修”这一方向即可，暂不深入复现。复合工程保存、原生缺尾帧和跨机器兼容仍有已知限制，作者的特定机器验证不等于本机验证。[作者验证记录](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/docs/VERIFICATION.md)

上游是源码可见的个人非商业许可项目，不是整包 MIT / Apache-2.0 授权。客户交付、收入用途或公司运营等商业使用须事先取得作者书面授权；代码许可也不包含剪映、字体与素材的使用许可。[LICENSE](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/LICENSE)
