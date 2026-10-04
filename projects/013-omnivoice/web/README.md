# 013 · OmniVoice 中文知识网页

[返回项目介绍](../README.md) · [研究笔记](../notes/research.md) · [研究库部署指南](../../../docs/deployment.md)

这是对 OmniVoice 能力、原理和部署方式的静态总结，依据 2026-10-04 核查的公开资料制作。使用 HTML、CSS、原生 JavaScript，不需要前端依赖安装，不加载语音模型，也不生成真实声音。

## 展示内容

页面汇总条件语音生成、三种声音模式、输入输出、离散编码与权重的区别、双向 Transformer、训练与推理、补全过程、部署和许可，并提供官方来源。

掩码与注意力交互使用预设教学状态，帮助观察未知编码逐渐减少和当前上下文的作用；不是模型预测、真实注意力权重、性能测试或语音服务。

## 文件

| 文件／目录 | 作用 |
| --- | --- |
| `index.html` | 内容、结构与来源 |
| `styles.css` | 响应式视觉与交互状态 |
| `app.js` | 模式、掩码补全与注意力等教学交互 |
| `assets/` | 网页使用的本地静态资源 |
| `../assets/omnivoice-overview.png` | 项目文档与目录总览图 |
| `../assets/omnivoice-overview.svg` | 总览图矢量版本 |

## 本地预览

在研究库根目录使用 Node.js ≥ 22：

```bash
node scripts/catalog.mjs build
node scripts/serve.mjs --port 4193
```

打开 `http://127.0.0.1:4193/projects/013-omnivoice/`，总索引位于 `http://127.0.0.1:4193/`。

构建将发布目录复制到 `_site/projects/013-omnivoice/`。修改网页后重新构建、刷新；端口被占用时按部署指南更换。浏览本页面无需安装 OmniVoice 或下载权重。

## 静态发布

清单配置：

```json
"publishDir": "projects/013-omnivoice/web"
```

资源使用相对路径，以适配 GitHub Pages 子路径 `/1002_codex_project/projects/013-omnivoice/`。构建只说明生成静态产物；是否已经对外发布，以实际部署结果为准。

本项目随研究库现有 GitHub Pages 流程发布，不单独创建模型服务器。若需实际语音生成服务，应另行安装、加载权重与部署推理入口，见[项目介绍](../README.md#如何部署)。

## 内容维护

技术解释保留官方来源；上游变化后重新核查访问日期、模型／Codec 结构、依赖、采样与许可。新增真实音频或性能数字时应记录版本、设备、输入、参数和验证方法。

当前未运行模型，教学效果不能作为音质或速度证据。文字、总览图是本次资料整理，未引入上游模型实现。
