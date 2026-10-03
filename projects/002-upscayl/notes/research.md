# 002 · Upscayl 原理与关键词研究笔记

[返回项目介绍](../README.md) · [原引导图](../assets/upscayl-overview.png) · [交互阅读版](../web/index.html)

本笔记把讨论中的概念整理为可追溯的学习路径。研究日期为 **2026-10-03（Asia/Shanghai）**；事实来自固定源码与官方论文，场景和后期价值属于研究判断。文档与图的验证不等于已经验证 Upscayl 在本机的图片效果。

## 概念关系与价值归属

机器学习通过数据调整模型参数；深度学习使用多层神经网络完成这一过程。在本项目中，模型是用于图像超分辨率的专用视觉模型，不能因为使用神经网络就把它等同于通用大语言模型。

Upscayl 的应用价值来自界面、文件与任务管理、模型选择、本机部署和跨平台分发。Real-ESRGAN 等上游方法负责图像恢复的网络与训练思路；社区模型还有各自的训练来源。NCNN、Vulkan 与 GPU 属于执行模型的框架、接口和硬件层。[应用依赖](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/package.json)、[推理后端](https://github.com/upscayl/upscayl-ncnn/tree/0beb39028a0ddd83250e845b4c3333c0675e3b97)、[神经网络教程](https://docs.pytorch.org/tutorials/beginner/basics/buildmodel_tutorial.html)

## 专业关键词

| 名词 | 含义 | 与本项目的关系 |
| --- | --- | --- |
| 深度学习 | 通过多层神经网络从数据学习参数 | 用训练数据建立图像输入到输出的映射 |
| 神经网络 | 多层计算单元组成的可参数化系统 | 接收低质量图片并生成预测结果 |
| 网络结构 | 各层如何排列、连接和执行计算 | 决定模型的计算方式 |
| 参数、权重 | 网络中可调整的数值 | 训练的主要结果；推理时通常固定 |
| CNN | 卷积神经网络；用可学习的小窗口提取局部特征 | 处理图像边缘、线条与纹理 |
| SR | Super-Resolution，超分辨率 | 从低分辨率预测高分辨率图片 |
| Blind SR | 输入的劣化过程在使用时未知 | 不表示训练没有高清参考答案 |
| HR / GT | 高清图 / 参考真值 | 提供训练目标 |
| LR / LQ | 低分辨率图 / 低质量图 | 提供模型输入 |
| ESRGAN | Enhanced Super-Resolution GAN | 超分辨率模型的一条技术路线 |
| Real-ESRGAN | 面向真实世界复杂劣化的扩展方法 | 训练数据合成和恢复方法的重要参考 |
| RRDB | 残差中的残差密集块 | 经典 Real-ESRGAN 生成器采用；不是全部模型的统一结构 |
| GAN | 生成对抗网络训练框架 | 联合训练生成器 G 和判别器 D |
| 生成器 G | 根据输入生成预测结果的网络 | 使用时负责图片增强 |
| 判别器 D | 学习区分真实图与生成图的网络 | 在训练中提供真实性反馈 |
| U-Net | 带跳跃连接的编码器与解码器结构 | 经典模型的判别器采用，提供局部反馈 |
| 损失函数 | 将目标与结果的差异变成评分 | 定义模型学习的目标 |
| 反向传播 | 计算损失对各参数的梯度 | 为参数更新提供方向信息 |
| Adam | 根据梯度更新参数的优化方法 | 官方训练采用的优化器 |
| 训练 | 用许多样本学习参数 | 发生在模型开发阶段 |
| 推理 | 用已训练参数处理新输入 | 发生在用户使用 Upscayl 时 |
| 微调 | 在已有参数上继续训练 | 用自己的领域数据适配模型 |
| PyTorch / CUDA | 训练框架 / NVIDIA GPU 计算平台 | 官方模型训练环境，与本应用推理环境不同 |
| NCNN | 神经网络推理框架 | 加载部署模型并执行网络算子 |
| Vulkan | 访问 GPU 的底层接口 | 本后端调用显卡计算的接口 |
| GPU / VRAM | 显卡 / 显存 | 提供并行计算及中间数据存储 |
| Tile | 带周边区域的分块 | 降低单次推理的显存需求，结果随后拼合 |
| IPC | 进程间通信 | 界面向 Electron 主进程传递请求 |
| CLI | 命令行接口 | 供脚本调用推理后端 |

基础训练概念依据 [PyTorch 自动微分教程](https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html)，GAN 定义依据 [原始论文](https://arxiv.org/abs/1406.2661)，网络结构依据 [Real-ESRGAN 论文方法部分](https://arxiv.org/html/2107.10833v2#S3.SS4)；部署术语对应下面的后端源码。

## 上游模型如何训练

以下针对经典 Real-ESRGAN，不概括全部社区权重。

1. **准备高清参考图**。官方训练采用 DF2K（DIV2K + Flickr2K）与 OST。可以只提供高清图，在训练中在线合成低质量输入。
2. **制造更接近现实的劣化**。混合模糊、缩放、噪声与 JPEG 压缩，重复组合；sinc 滤波模拟振铃与过冲，使输入不只包含理想缩小后的图片。
3. **先训练基础恢复能力**。从已有 ESRGAN 参数继续训练，用 L1 损失得到 Real-ESRNet。
4. **再联合训练 G 与 D**。使用 Real-ESRNet 初始化生成器，并加入感知损失与 GAN 损失。生成器努力生成自然的高清预测，判别器学习识别生成痕迹。
5. **按损失更新参数**。前向预测后计算损失，通过反向传播得到梯度，再由 Adam 等优化器调整权重。反复用不同样本执行；用未参与训练的样本评估泛化效果。
6. **保存并转换部署模型**。保存训练好的生成器，将兼容结构转换为 NCNN 所需格式；使用阶段通常不再需要判别器。

数据与两阶段训练依据 [官方训练指南](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/docs/Training.md)；损失与优化器配置见 [训练配置](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/options/train_realesrgan_x4plus.yml)；高阶劣化见 [论文方法](https://arxiv.org/html/2107.10833v2#S3.SS2)；部署转换见 [Upscayl 转换指南](https://github.com/upscayl/upscayl/wiki/Model-Conversion-Guide)。未在本仓库执行这些训练步骤。

| 损失 | 主要关注 | 需要理解的取舍 |
| --- | --- | --- |
| L1 像素损失 | 预测与参考像素的绝对差异 | 数值接近不等于所有纹理都自然 |
| 感知损失 | 视觉网络提取的特征是否相近 | 比较特征，不是让人实时给图片打分 |
| 对抗损失 | 判别器对生成结果的反馈 | 鼓励逼真纹理，也可能出现人工细节 |

这套组合试图兼顾保真与观感。GAN 是训练方法，CNN 是网络结构类别，两者不属于同一层次。GAN 的“对抗”发生在模型训练中，不是用户每次放大图片时让两个网络重新比赛。[训练配置](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/options/train_realesrgan_x4plus.yml)、[GAN 定义](https://arxiv.org/abs/1406.2661)

## 本机推理调用链与源码证据

| 模块 | 责任 | 固定源码 |
| --- | --- | --- |
| 应用依赖与分发 | Electron、React、Next.js、TypeScript，打包后端与模型资源 | [package.json](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/package.json) |
| IPC 桥接 | 界面与主进程沟通 | [preload.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/preload.ts) |
| 单张任务 | 输入路径、模型、参数、输出命名与回传 | [image-upscayl.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/commands/image-upscayl.ts) |
| 参数与进程 | 构造命令，启动本机推理程序 | [get-arguments.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/utils/get-arguments.ts)、[spawn-upscayl.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/utils/spawn-upscayl.ts) |
| Double | 将第一遍输出再次传入推理 | [double-upscayl.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/electron/commands/double-upscayl.ts) |
| 模型清单与倍率 | 七个内置 4× 模型，UI 尺寸倍率选择 | [models-list.ts](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/common/models-list.ts)、[select-image-scale.tsx](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/renderer/components/sidebar/settings-tab/select-image-scale.tsx) |
| 后端调度与缩放 | 读图、GPU 与块大小选择、后处理尺寸调整、保存 | [main.cpp](https://github.com/upscayl/upscayl-ncnn/blob/0beb39028a0ddd83250e845b4c3333c0675e3b97/src/main.cpp) |
| 实际模型执行 | 加载 .param/.bin、Vulkan 推理、分块与拼合 | [realesrgan.cpp](https://github.com/upscayl/upscayl-ncnn/blob/0beb39028a0ddd83250e845b4c3333c0675e3b97/src/realesrgan.cpp) |

`.param` 描述部署网络结构，`.bin` 保存权重。NCNN 负责执行网络，Vulkan 提供 GPU 计算接口。CPU 同时承担文件、进程和部分数据处理，不能把全部业务逻辑概括为“显卡执行”。分块降低显存压力，但并不会消除整张输出的内存、磁盘与时间成本。

## 后期采用与学习路线

以下为研究建议：

- **素材阶段**：选 5 张真实常用图，比较同显示尺寸的原图与输出；记录文字、线条、人物及纹理变化。先确定是否改善自己的交付结果。
- **自动化阶段**：读 CLI 参数，用预训练模型建立批处理；设计任务队列、资源限额、重试与原图保留策略。
- **工程阶段**：读界面到子进程的请求链，再研究模型加载、分块、错误回传和跨平台打包。
- **算法阶段**：读数据合成与损失配置；只有通用模型在目标领域表现不足、且拥有适当数据和算力时，再考虑微调。

先区分业务目标、模型能力和基础设施，再选择要研究的层。类似组织方式可以迁移到其他 AI 工具，但其他任务可能采用 Transformer、扩散模型等不同结构，本项目的 CNN/GAN 路线不能直接套用到所有 AI 应用。

## 验证记录

| 日期 | 范围 | 结果与口径 |
| --- | --- | --- |
| 2026-10-03 | 上游源码 | 通过实时 git ls-remote 记录三个仓库 HEAD；与 README、模型列表、配置和后端源码交叉核对 |
| 2026-10-03 | 对话原引导图 | 20 个模块的选择与说明更新通过；736px 与 320px 下无横向溢出，未发现 JavaScript 错误 |
| 2026-10-03 | 仓库归档 | 原 HTML 片段逐字保存，PNG 沿用同一图的默认概览截图；独立阅读版由同一片段导出 |
| 2026-10-03 | 独立 HTML | 浏览器直接打开本地文件；20 个模块均可切换，17 个文档内部文件链接存在；深浅主题的 736px 与 320px 图宽均无横向溢出，来源链接可打开新页，无 JavaScript 或控制台错误 |
| 2026-10-03 | 仓库检查 | `npm run sync`、`npm run check`、`npm test`（9/9）与 `npm run build` 均通过；未运行 Upscayl 图片推理 |

图源 SHA-256 为 `de7cd2ecda2c96bc764f9cdf45e01359297214f7f0a8576f05c9f9b73f6278f3`；PNG SHA-256 为 `be8b586eace60334d8b94961593c5e509676d8fc36d4e48fb06d85e9ed605acf`。图中分支箭头是概念导读，损失到网络表示训练反馈；完整的算法控制流以源码为准。图源中的动态分支链接保留原对话内容，正文的固定 commit 链接用于长期追溯。

## 待验证问题与局限

- 本机 GPU 是否兼容、不同模型的实际速度、显存峰值与输出质量，尚未实测。
- 未运行 Upscayl 桌面应用、CLI、模型转换或训练，没有将概念研究写成成功复现。
- 未核实应用安装包实际捆绑的后端二进制与独立后端 HEAD 的对应关系。
- 当前七个模型名单与源码快照相关，未来版本可能变化；社区模型训练配方及权重许可需要逐个研究。
- 引导图与文档归档可用于后续阅读；是否值得接入真实业务，需要素材效果和维护成本验证。

## 参考资料与许可

- [Upscayl 固定版本 README](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/README.md)：定位、安装与 FAQ。
- [Upscayl 模型指南](https://github.com/upscayl/upscayl/wiki/Guide)：自定义模型及倍率；Wiki 内容可能继续更新。
- [Real-ESRGAN 官方训练文档](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/docs/Training.md)：两阶段训练、数据与微调。
- [Real-ESRGAN 论文](https://arxiv.org/html/2107.10833v2)：算法方法与局限。
- [GAN 原始论文](https://arxiv.org/abs/1406.2661)：生成器与判别器的联合训练框架。
- [应用 AGPL-3.0](https://github.com/upscayl/upscayl/blob/a00d55fee90e0f9435d5eaa86e76700df8199af8/LICENSE)、[后端 AGPL-3.0](https://github.com/upscayl/upscayl-ncnn/blob/0beb39028a0ddd83250e845b4c3333c0675e3b97/LICENSE)、[Real-ESRGAN BSD-3-Clause](https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/LICENSE)：记录各软件来源许可，不代表全部模型权重具有相同许可。
