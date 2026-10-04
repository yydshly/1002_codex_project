# Ix 代码图谱研究网页

本项目独立编写的中文静态说明页。核心是完整理解图，覆盖产品定位、数据库关联与深度、六组当前能力、展示效果、Bug / 性能辅助、四层扩展、八类产品方向和采用边界。另有八组文字解读、五种关系查询教学交互、具体命令和官方来源。

交互使用本页自建的六节点、五调用边样例。没有连接 Ix 后端；反向调用遍历只用于教学，不是上游 impact 的算法复现。图谱历史指索引修订，不等同于 Git commit。

## 本地查看

从仓库根目录运行 `npm run build`，再运行 `node scripts/serve.mjs --port 4194`，打开 `http://127.0.0.1:4194/projects/010-ix/`。也可以直接打开 `index.html`，复制命令功能在不同浏览器的本地文件模式下可能改为选中文本。

网页没有外部脚本、字体或运行时依赖，资源均用相对路径。沿用研究库现有 GitHub Pages 构建，当前没有推送或触发部署；清单中的配置链接不代表已经上线。

## 图与验证

`assets/ix-understanding.svg` 为可编辑矢量图，PNG 为其栅格化输出。原始图存放在子项目上级 `assets/`，网页保留发布副本。

本次图为 1800 × 4360，同一张 SVG 嵌入网页。九个按钮切换完整总览 / 八个分区的 viewBox；显示尺寸支持适应窗口、阅读尺寸、100% 和 125%。桌面默认适应窗口，小屏默认保留文字大小并可横向滑动，也可直接读文字说明。绿色区分当前事实，黄色区分展示设计和产品假设。

图的内容与排版源文件为 [build-understanding.mjs](../tools/build-understanding.mjs)。使用 Node 22+ 和 sharp 执行，可生成 SVG、PNG、网页副本、分区清单并更新 HTML 内嵌图。若 sharp 不在本地模块搜索路径，将 `IX_DIAGRAM_SHARP` 设为已安装模块的绝对目录。本次使用 Codex 已有依赖，没有新增 npm 包。

本次完整理解图更新的实际浏览器验证见 [summary-web-verification.json](../notes/summary-web-verification.json)；此前版本的 [web-verification.json](../notes/web-verification.json) 保留为历史记录，其 1600 × 1800 图像数据不代表当前版本。

当前版本通过 Codex 内置浏览器完成分区、缩放、文字解读、五种教学查询、四种尺寸布局及图片文字边界检查，并核对本地 HTTP 资源和 PNG 导出。37 项检查记录见 [summary-web-verification.json](../notes/summary-web-verification.json)，截图在 [assets/verification](../assets/verification)。验证只覆盖本研究网页，没有运行上游 Ix；初版验收记录独立保留。
