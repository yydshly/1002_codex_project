# 项目管理指南

## 添加和排序

在仓库根目录运行 `npm run new -- --slug <英文短名> --name "<项目名称>" --repo "<GitHub 仓库 URL>" --summary "<摘要>"`。

脚本从现有最大编号继续递增，创建 `projects/001-slug/` 等目录，并同步总 README。`slug` 使用小写英文字母、数字和短横线。编号至少三位，超过 999 会继续使用 1000、1001；按数字大小排序。

编号表示加入顺序，确定后不变。归档项目保留清单条目与目录，将 `status` 改为“已归档”，避免旧链接失效和编号被复用。不要删除历史条目来重新编号。

## 索引字段

`projects/catalog.json` 是 README 和 Web 总入口共同的数据源。修改后运行 `npm run sync`；CI 会检查生成的 README 是否与清单一致。

| 字段 | 说明 |
| --- | --- |
| `id` | 固定编号字符串，例如 `"001"` |
| `slug` | 目录后缀，例如 `example-repo` |
| `name` | 对外展示的项目名 |
| `summary` | 一句话介绍研究价值 |
| `source` | 上游 GitHub 仓库地址 |
| `status` | `待研究` / `研究中` / `已完成` / `已归档` |
| `tags` | 字符串数组，例如 `["AI", "前端"]` |
| `cover` | 封面相对仓库根目录的路径，未提供时为 `null` |
| `coverAlt` | 封面说明，有封面时必填 |
| `publishDir` | 项目内静态 Web 输出目录，未启用时为 `null` |
| `demo` | 已部署的外部演示地址，未提供时为 `null`；优先于 `publishDir` 用于索引链接 |

`directory` 由 `id` 与 `slug` 自动计算，无需填写。清单顶层 `repository` 是本库的 GitHub URL，`siteUrl` 是未来的 Pages 基础地址；如更换仓库或域名，修改这两项并重新同步、构建。

## 图片与说明

1. 将截图放入 `projects/001-slug/assets/`，建议使用 PNG、JPEG、WebP、GIF 或 SVG。
2. 在子项目 README 中用相对路径展示图片，例如 `![搜索结果页面，展示筛选与分页](assets/search.png)`。
3. 为总入口设置 `cover`，例如 `"projects/001-slug/assets/search.png"`，同时写明 `coverAlt`。
4. 运行 `npm run sync`。根 README 会显示该项目封面与摘要；网站构建时也会复制封面。

不要使用尚不存在的图片路径。一个项目的全部截图可放在子项目 README 中，总入口只展示一张封面。

## 研究与源码组织

`README.md` 放介绍、来源、版本、图片、复现步骤和结论；`notes/research.md` 放问题、架构、实验和证据。需要实现代码时，再按实际语言和框架增加目录，不预设所有项目使用相同技术栈。

优先记录上游链接与具体 commit。需要引入上游代码时，保留许可证、版权声明和修改说明。环境变量只提交不含秘密值的 `.env.example`。

## 常用检查

```bash
npm run sync
npm run check
npm test
npm run build
```

`check` 检查固定编号、目录匹配、README、封面、发布路径、URL 及根索引一致性。清单可以任意编辑顺序，输出始终按编号升序展示。
