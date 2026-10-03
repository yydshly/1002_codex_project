# 002 · Upscayl 图片超分辨率研究

**能力：** 本地 AI 图片放大与细节增强，支持单张和文件夹批量处理。

**原理：** 调用预训练视觉模型，通过 NCNN 与 Vulkan GPU 在本机执行推理，放大图片并预测细节。

**使用场景：** 设计、展示与打印素材加工，以及重复图片处理的自动化。

**价值：** 改善素材交付尺寸，并学习如何把模型、显卡计算、文件管理与任务界面组合成产品。

**边界：** 预测纹理不等于恢复真实信息；本项目尚未实测图片质量或显卡性能。

依据：[上游说明](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/README.md)

[返回总索引](../../README.md) · [深入研究与关键词](notes/research.md) · [交互引导图 HTML](web/index.html) · [引导图运行说明](web/README.md)

## 引导图

沿用本次讨论中已经生成的同一张图，覆盖应用能力、上游训练、本机推理、专业词汇和后期价值。PNG 可在 GitHub 文档中直接阅读；HTML 下载后可独立打开，点击 20 个模块查看解释与来源。

![Upscayl 能力与原理总览：应用能力、上游模型训练、本机 GPU 推理、关键词、后期意义与能力边界](assets/upscayl-overview.png)

[查看原尺寸图片](assets/upscayl-overview.png) · [交互版](web/index.html) · [原始可编辑图源](assets/upscayl-overview.fragment.html)

## 项目信息与研究范围

| 项目 | 内容 |
| --- | --- |
| 固定编号 | 002 |
| 研究日期 | 2026-10-03，Asia/Shanghai |
| 上游应用 | [upscayl/upscayl](https://github.com/upscayl/upscayl) |
| 应用研究 commit | [a00d55fee90e0f9435d5eaa86e76700df8199af8](https://github.com/upscayl/upscayl/commit/a00d55fee90e0f9435d5eaa86e76700df8199af8) |
| 本次核对的正式发布版 | [v2.15.0](https://github.com/upscayl/upscayl/releases/tag/v2.15.0)；源码分析另以固定 commit 为准 |
| 推理后端 | [upscayl-ncnn，0beb39028a0ddd83250e845b4c3333c0675e3b97](https://github.com/upscayl/upscayl-ncnn/commit/0beb39028a0ddd83250e845b4c3333c0675e3b97) |
| 训练方法参考 | [Real-ESRGAN，a4abfb2979a7bbff3f69f58f58ae324608821e27](https://github.com/xinntao/Real-ESRGAN/commit/a4abfb2979a7bbff3f69f58f58ae324608821e27) |
| 软件许可证 | [应用 AGPL-3.0](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/LICENSE)、[后端 AGPL-3.0](https://github.com/upscayl/upscayl-ncnn/blob/0beb39028a0ddd83250e845b4c3333c0675e3b97/LICENSE)；模型权重需分别核实 |
| 本仓库成果 | 中文理解文档、固定源码证据、原引导图及独立 HTML 阅读版 |
| 验证范围 | 文档、源码与图的阅读交互；尚未安装 Upscayl、实测图片质量、测量显卡性能或训练模型 |

这是应用与算法的研究归档。官网同时介绍其他云端产品，本研究的能力范围以本地桌面仓库为准。后端快照是独立仓库的研究版本，不代表已经核实它就是 v2.15.0 安装包内的二进制版本。

## 能力与实际价值

| 能力 | 可以解决什么问题 | 需要怎样理解 |
| --- | --- | --- |
| 图片超分辨率 | 已有图片内容合适，但像素尺寸不足 | 增大尺寸并预测纹理，不保证找回真实原貌 |
| 单张与文件夹批量 | 素材库需要重复处理 | 应用统一管理输入、模型、参数、进度和输出 |
| 多模型与自定义模型 | 不同素材需要比较不同输出风格、速度 | 只能导入后端兼容的模型，不是任意模型都能直接加载 |
| 倍率与自定义尺寸 | 需要指定交付尺寸 | 原生模型输出与后处理缩放需要分开 |
| Double Upscayl | 需要对第一遍结果再次处理 | 再次推理可能增加尺寸，也可能放大伪影 |
| 对比预览与格式导出 | 检查并交付处理结果 | 支持 PNG、JPG、WebP；保留原图进行比较 |
| 本地跨平台处理 | 希望在自己的电脑完成图片推理 | 面向 Windows、macOS、Linux；需要兼容 GPU 与驱动 |

以上功能依据 [应用说明](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/README.md)、[发布说明](https://github.com/upscayl/upscayl/releases/tag/v2.15.0)、[模型与倍率指南](https://github.com/upscayl/upscayl/wiki/Guide)及[导出格式代码](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/renderer/components/sidebar/settings-tab/select-image-format.tsx)。场景收益仍需用自己的图片验证。

当前源码列出七个内置 4× 模型：Standard、Lite、High Fidelity、Remacri、Ultramix Balanced、Ultrasharp、Digital Art。**4× 指宽、高各乘四**，例如 `512×512 → 2048×2048`，像素总数变为 16 倍。界面的其他输出倍率可涉及普通重采样；Double 是把第一遍结果再运行一次模型。尺寸倍率与清晰度、真实性不是同一个指标。[模型列表](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/common/models-list.ts)、[参数构造](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/utils/get-arguments.ts)、[双遍处理](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/commands/double-upscayl.ts)

## 底层原理与模块职责

可以沿两条路径理解它：**上游先训练模型；用户随后调用模型进行推理。** CNN 等网络结构与学好的参数共同组成模型。显卡负责并行计算；驱动安装、程序配置、模型加载与文件管理由操作系统及软件完成。

| 层次 | 相关技术 | 职责 |
| --- | --- | --- |
| 业务目标 | 图像超分辨率 SR | 定义输入图片与希望得到的高分辨率结果 |
| 学习方法 | 深度学习、CNN、Real-ESRGAN | 从数据学习低质量图到高清预测的映射 |
| 训练与参数更新 | L1、感知损失、GAN、反向传播、Adam | 对预测评分，计算梯度，调整参数 |
| 模型产物 | 网络结构、权重、NCNN 格式 | 保存并部署已学好的计算系统 |
| 桌面应用 | Electron、React、Next.js、TypeScript | 界面、文件、设置与任务管理 |
| 进程调用 | IPC、子进程、upscayl-ncnn | 将界面请求交给本机 C++ 推理后端 |
| 推理框架 | NCNN | 加载模型，执行神经网络算子 |
| 计算接口与硬件 | Vulkan、GPU、显存 | 调用显卡并行计算，分块控制显存需求 |
| 输出处理 | 拼接、重采样、图片编码 | 合并结果，调整交付尺寸并保存文件 |

运行链路为：`输入图片 → 界面设置 → IPC → 本机后端 → NCNN 加载模型 → Vulkan/GPU 推理 → 拼接与按需缩放 → 输出图片`。[应用依赖](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/package.json)、[启动后端](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/utils/spawn-upscayl.ts)、[模型加载与分块推理](https://github.com/upscayl/upscayl-ncnn/blob/0beb39028a0ddd83250e845b4c3333c0675e3b97/src/realesrgan.cpp)

训练支线以经典 Real-ESRGAN 为例：从高清参考图合成低质量输入，模型预测高清图，再用误差反馈更新参数。GAN 训练时包含生成器与判别器，日常增强图片通常只执行训练好的生成器。不同社区模型可能有不同的结构与训练方法。[官方训练说明](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/docs/Training.md)

## 对后期工作的意义

以下是结合当前研究目标的判断，实际收益取决于素材和业务。

| 目标 | 可获得的价值 | 建议动作 |
| --- | --- | --- |
| 网页、PPT、封面与内容素材 | 处理内容合适但尺寸不足的图片；作为 AI 生成图的后续加工步骤 | 先用 5 张常用图片比较原图与 4× 输出，检查文字、线条及人物细节 |
| 重复素材处理与自动化 | 将图片增强接入自己的处理流程 | 从 upscayl-ncnn CLI 入手，补齐任务队列、资源控制、失败重试和结果检查 |
| 理解 AI 的训练方法 | 认识数据、结构、损失与参数如何决定输出 | 阅读上游训练代码；有明确领域需求和数据后再考虑微调 |
| 开发自己的 AI 工具 | 学习模型格式转换、本机推理、进程调用与跨平台产品化 | 顺着界面请求到后端执行的调用链阅读，而不是把桌面 GUI 当作 SDK |

建议路径是：**用预训练模型验证业务收益 → 学会 CLI 批处理 → 理解训练与推理模块 → 按实际需求尝试领域微调或开发工具**。[CLI 后端](https://github.com/upscayl/upscayl-ncnn/tree/0beb39028a0ddd83250e845b4c3333c0675e3b97)、[领域微调说明](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/docs/Training.md#finetune-real-esrgan-on-your-own-dataset)

## 使用边界与复用条件

- **真实性**：新增像素不等于新增真实信息。文字、细线、几何结构与纹理可能被改写；需要事实保真的材料应保留并依据原始文件。
- **输入质量**：严重失焦或完全模糊的图片不适合依赖 Upscayl 恢复；Logo、图表等优先找矢量或重新导出。
- **硬件与成本**：核对 GPU/Vulkan 兼容性；显存、内存、磁盘和处理时间都要按实际图片验证。部分核显可用，不应简单概括为“只能独显”。
- **开源复用**：应用、后端与各模型分别核实许可证。Real-ESRGAN 上游代码的 BSD-3-Clause 与 Upscayl 应用的 AGPL-3.0 不是同一许可。

输入限制来自 [Upscayl FAQ](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/README.md#-faq)，伪影与线条问题来自 [论文限制](https://arxiv.org/html/2107.10833v2#S4.SS4)；硬件与许可证分别见 [兼容性列表](https://github.com/upscayl/upscayl/wiki/Compatibility-List)、[应用许可](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/LICENSE)及 [Real-ESRGAN 许可](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/LICENSE)。

## 本地阅读与验证

这次归档无需安装 Upscayl 或下载模型。直接阅读本 README、研究笔记与 PNG；交互版运行方式见 [web/README.md](web/README.md)。

根仓库检查使用 `npm run sync`、`npm run check`、`npm test` 和 `npm run build`。具体源码快照、图的来源及实测范围记录在 [研究笔记](notes/research.md#验证记录)。图源保留原对话版本，图中部分上游链接仍指向可变分支；正式研究证据以本文及笔记中的固定 commit 链接为准。

## 来源与本仓库改动

本仓库新增中文研究说明与原引导图归档，未复制 Upscayl 应用源码、可执行文件或模型权重，也未实现图片增强引擎。HTML 是同一张引导图的独立阅读版本，准备供本地打开；本次仅提交 Git 仓库，尚未将它发布到 GitHub Pages。
