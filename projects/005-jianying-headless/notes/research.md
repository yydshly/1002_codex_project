# Jianying Headless 研究笔记

研究日期：2026-10-03，Asia/Shanghai。上游：[mcncarl/jianying-headless](https://github.com/mcncarl/jianying-headless)。分析快照：[42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252](https://github.com/mcncarl/jianying-headless/commit/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252)。

## 最终定位

以配置文件驱动初步剪辑。剪映适配依赖对私有草稿格式与内部接口的反向分析；FFmpeg 使用公开命令行。内容决策由人工或外部 AI 提供，自动执行后仍由人检查、精修。

对当前工作，仅保留方向参考，暂不深入研究、安装复现或产品集成。“暂不值得深入投入”是结合当前用途的判断，不代表项目普遍没有研究价值。

## 方法与事实口径

本次阅读了固定快照的 README、平台入口、草稿与导出实现、计划格式、Windows 文档、项目身份、作者验证记录和许可证，并区分现役支持与诊断实验。

- **源码可确认**：平台分流、输入字段、验证与调用路径。
- **作者记录**：特定机器上的真实工程打开、保存、冷重开和导出结果；本次没有独立复验。
- **当前用途判断**：初步剪辑、方向参考和不继续深入，是本次整理结论。
- **未做的验证**：未安装或运行本项目，未生成草稿、导出视频、测试本机兼容或比较实际画面声音。图示表达理解，不构成成功运行证据。

本目录不收录上游源码、剪映引擎、效果资源、真实草稿或用户素材。

## 两条执行路径

| 层次 | macOS 剪映 | Windows FFmpeg |
| --- | --- | --- |
| 共同输入 | 结构化计划描述素材、片段、轨道和参数 | 结构化计划描述素材、片段、轨道和参数 |
| 适配过程 | 私有草稿结构映射、编解码、首页登记和内部引擎接口 | 确定性渲染时间线、滤镜图和公开命令行 |
| 输出 | 可编辑草稿；本机原生引擎导出 MP4 | MP4，不提供 Windows 剪映可编辑草稿 |
| 环境 | 匹配的 Apple Silicon Mac、剪映 11.5.0 / 11.4.2 与工具链 | Python、FFmpeg、FFprobe；文字需要本地字体 |
| 决策来源 | 人工或外部 AI | 人工或外部 AI |

配置承载剪辑意图，不能概括为“仅换配置就适配任意剪映版本”。原生路径还依赖草稿蓝图、codec、内部接口和精确运行身份。FFmpeg 后端无需逆向 FFmpeg，也不等同于 Windows 剪映接口适配。

新建草稿与编辑已有草稿采用不同入口；已有工程在独立副本中修改。素材、计划和结果通过哈希及结构检查固定身份。Mac 原生导出与 Windows FFmpeg 渲染是两个后端，不能把一种后端的能力承诺给另一种。

AI 不内置完成全部内容判断：库执行确定的计划；ASR 辅助接口依赖另行提供的执行器。人工在剪映中修改后，原计划和旧构建快照不会自动更新，没有现成双向同步。

## 证据索引

以下链接均固定到本次分析 commit，避免后续分支变化改写研究依据。

| 问题 | 证据 |
| --- | --- |
| 总体能力与平台定位 | [README.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/README.md) |
| 预览版本、适配版本、干净机器验收未完成 | [project.json](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/project.json) |
| 平台入口分流，Windows 原生编辑拒绝 | [headless_draft.py](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/skills/yichen-jianying-edit/scripts/headless_draft.py#L64) |
| 原生计划、映射与草稿构建 | [headless-macos.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/skills/yichen-jianying-edit/references/headless-macos.md)、[jy14_headless.py](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/engine/jy14_headless.py) |
| 编解码桥接与内部原生导出调用 | [jy14_codec.cpp](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/bridge/jy14_codec.cpp)、[native_export.cpp](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/engine/native_export.cpp) |
| Windows 输出与不支持项 | [windows-ffmpeg.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/docs/windows-ffmpeg.md)、[windows_portable.py](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/engine/windows_portable.py) |
| FFmpeg 滤镜图和命令行导出 | [ffmpeg_graph.py](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/engine/ffmpeg_graph.py)、[windows_export.py](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/engine/windows_export.py) |
| 已有工程副本与嵌套限制 | [edit-existing-macos.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/skills/yichen-jianying-edit/references/edit-existing-macos.md) |
| ASR 外部依赖和口播计划接口 | [plan-format.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/skills/yichen-jianying-edit/references/plan-format.md) |
| 作者实际验证、失败与未合入诊断 | [VERIFICATION.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/docs/VERIFICATION.md) |
| 个人非商业许可与分发边界 | [LICENSE](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/LICENSE)、[DISTRIBUTION-SCOPE.md](https://github.com/mcncarl/jianying-headless/blob/42b3d75b15bd9f3a9bb4c11b2f5205f7b4312252/docs/DISTRIBUTION-SCOPE.md) |

## 保留的边界

- 原生版本检查严格；作者的同机验证不能替代不同电脑或相同版本不同二进制的验收。
- 复合工程属于有限离线实验，可靠保存与正式首页登记没有成为完整支持；诊断候选不等于已合入修复。
- 原生缺尾帧问题尚未正式根治；严格帧数检查会拒绝失败输出，不能据此说渲染器问题已解决。
- 结构校验和完整解码不等于内容、视听质量、视觉无损转换或素材授权全部通过。
- 个别参考文档留有旧状态描述；字体进展应结合较新的作者验证记录阅读，不能把历史失败与当前记录混同。
- 根 LICENSE 允许个人学习与非商业个人工作流，商业用途须事先取得作者书面授权。第三方许可不使整个项目成为 MIT / Apache-2.0 授权，代码许可也不授予剪映、字体或素材权益。

## 可带走的思路

把“内容决策”与“时间线执行”分开；让人工或 AI 提供结构化计划，由不同后端执行；以素材快照、明确版本与结果验证降低交接歧义。当前只保存这一理解与图，不建立 Web demo，不深入复现或继续扩展研究。
