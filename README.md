# GitHub 项目研究库

记录近期发现的优秀 GitHub 项目：理解设计思路、复现核心能力、整理研究结论，并按需提供 Web 演示。

这里是总入口。每个子项目都有固定编号、独立研究文档、图片和可选演示；首页只保留摘要与索引，具体分析放在子项目内。

## 子项目索引

编号按加入顺序递增，归档后保留编号。目录、README 和展示网站使用同一份 [项目清单](projects/catalog.json)。

<!-- PROJECTS:START -->
暂未添加研究项目。添加第一个项目后，这里会自动生成按编号排序的摘要、文档与演示索引。
<!-- PROJECTS:END -->

## 添加项目

需要 Node.js 22 或更新版本；管理脚本无需安装依赖。

```bash
npm run new -- --slug example-repo --name "项目名称" --repo "https://github.com/owner/repo" --summary "一句话说明研究价值"
```

脚本自动分配下一个编号，例如 `001-example-repo`，创建研究文档、图片目录和 Web 目录，并更新上方索引。命令中的名称和地址是占位示例，请替换为实际项目。

后续编辑子项目文档与 `projects/catalog.json`，再运行：

```bash
npm run sync   # 更新 README 的摘要、图片与索引
npm run check  # 检查编号、路径、图片和索引一致性
npm run build  # 生成展示入口与各子项目静态 Web 到 _site/
```

## 目录结构

```text
projects/
  catalog.json             # 唯一项目清单，按固定编号排序
  001-project-slug/        # 添加首个项目后创建
    README.md              # 项目介绍、来源、图片、复现步骤、结论
    notes/research.md      # 深入分析、实验记录和待验证问题
    assets/                # 截图、封面、架构图等
    web/                   # 可选的 Web 源码或静态演示
templates/project/         # 新项目使用的文档模板
scripts/                   # 编号、索引同步、检查与网站生成
site/                      # 总展示入口的样式
docs/                      # 项目组织与部署约定
.github/workflows/         # 索引检查和手动 Pages 发布
_site/                     # 构建产物，不提交
```

## Web 展示

已准备 GitHub Pages 发布工作流。启用后，总入口地址为 `https://yydshly.github.io/1002_codex_project/`，子项目使用 `projects/001-project-slug/` 等独立子路径。当前仅完成初始化，尚未发布网站。

支持项目内静态 Web 和外部演示链接。添加应用时再确定技术栈和构建命令，详见 [部署指南](docs/deployment.md)。

## 研究约定

- 编号固定、不复用；研究顺序按编号展示，停止研究时将状态设为“已归档”。
- 记录上游仓库、研究时的版本或 commit、许可证，以及本仓库做了哪些改动。
- 总 README 保持摘要；图片存入对应子项目的 `assets/`，完整分析写在项目文档和研究笔记中。
- 复现前写清环境、运行命令和验证结果；尚未验证的结论明确标注。

详细说明见 [项目管理指南](docs/project-guide.md)。
