# CAD 交互预览

## 理解总览网页与一张图

[overview/index.html](telescope-demo/overview/index.html)是可独立发布的静态总览：能力、原理、效果、价值、实际配件输入、瓶颈、实测与资料十部分。无外部前端依赖；图像、整理数据和实验报告均在页面目录内。PNG / SVG 可下载，目标模板可复制。

启动下述本地服务后，打开返回地址的 `overview/`。本地页面可跳回望远镜演示；作为独立静态站点阅读时，入口指向本地复现说明。仓库展示站点的 006 页面使用这个静态目录。

更新内容后运行 `uv run --frozen python scripts/build-understanding.py`，内容源为 [understanding.json](../notes/understanding.json)。

## 望远镜完整流程演示

在子项目根目录运行 `uv run --frozen python scripts/serve_telescope_demo.py`，打开输出的 `demo_url`。页面回放八个真实建模步骤，标明输入、负责人、动作和交接对象，并嵌入插件 CAD Viewer，可切换整体装配、分解结构和调焦伸出 20 mm 的保存模型。它读取实际构建、验收及修正前后的记录；步骤按钮不会调用语言模型或重建模型。

模型源码、重建命令、假设与能力边界见 [完整过程记录](../notes/telescope-demo.md)。

## 直接使用插件查看器

本实验使用插件自带的本地 CAD Viewer。它读取已经生成的 STEP、STL 和 GLB 文件，支持旋转、选取、测量和剖切。

在子项目根目录运行：

```powershell
uv run --frozen cadgen viewer --host 127.0.0.1 --json --detach
```

使用命令返回的 URL；文件面板包含基础实验和望远镜的 STEP 模型及导出网格。模型源码更新后，执行相应的 [基础实验脚本](../scripts/run-demo.ps1) 或 [望远镜脚本](../scripts/run-telescope-demo.ps1) 重新生成，再查看结果。

本地服务器需要保持运行。本次 Codex 工具进程退出会终止其后台子进程，因此实验期间保留了父进程等待；从你自己的终端启动时可直接按上述命令使用。

安装、模型说明和验证结果见 [子项目文档](../README.md)。
