# Upscayl 引导图阅读说明

[返回项目介绍](../README.md) · [静态图](../assets/upscayl-overview.png) · [原始图源](../assets/upscayl-overview.fragment.html)

`index.html` 是本次对话中同一张引导图的独立阅读版，包含全部样式与解释数据。它展示能力与原理，不执行 Upscayl 图片推理，也不需要安装模型或显卡依赖。

## 打开方式

下载本目录的 `index.html` 后，用浏览器打开。20 个模块均可点击，下方显示对应术语、作用、限制与官方来源。也可在仓库根目录运行一个仅监听本机的静态服务器：

```bash
python -m http.server 4190 --bind 127.0.0.1 --directory projects/002-upscayl/web
```

访问 `http://127.0.0.1:4190/`。Python 只用于可选预览；直接打开 HTML 不需要它。

## 来源与维护

- `../assets/upscayl-overview.fragment.html` 原样保存对话中的可编辑图源。
- `../assets/upscayl-overview.png` 保存同一图的默认概览，用于 GitHub Markdown 引导图和总索引封面。
- `index.html` 从该图源导出独立运行包装，保留模块内容与交互。
- 修改后应同步图源、阅读版和截图，检查模块切换、深浅主题、手机宽度与源码链接。
- 这里仅保存静态阅读内容；当前清单的 `publishDir` 为 `null`，本次没有创建新的线上 Pages 地址。

本轮浏览器检查与仓库检查结果见 [研究笔记](../notes/research.md#验证记录)。
