# 项目管理指南

## 添加和排序

在仓库根目录运行 `npm run new -- --slug <英文短名> --name "<项目名称>" --repo "<来源 HTTPS URL>" --source-name "<来源名称>" --summary "<摘要>"`。来源可以是 GitHub 仓库或公开网站；省略 `--source-name` 时默认使用项目名称。

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
| `summarySections` | 可选的分项摘要数组，每项包含非空单行 `title` 与 `text`；填写后，README 与 Web 优先显示分项摘要，加粗标题 |
| `source` | 来源的 HTTPS 地址，可以是 GitHub 仓库或网站 |
| `sourceName` | 索引和 Web 显示的来源名称，如 `Cult UI`、`X-Twitter-Downloader`；可选，旧条目省略时使用 `name`，显式填写时必须是非空单行文字 |
| `status` | `待研究` / `研究中` / `已完成` / `已归档` |
| `tags` | 字符串数组，例如 `["AI", "前端"]` |
| `cover` | 封面相对仓库根目录的路径，未提供时为 `null` |
| `coverAlt` | 封面说明，有封面时必填 |
| `publishDir` | 项目内静态 Web 输出目录，未启用时为 `null` |
| `demo` | 已部署的外部演示地址，未提供时为 `null`；优先于 `publishDir` 用于索引链接 |
| `webPages` | 可选的页面说明/逻辑入口数组：`path` 为发布目录内 HTML 路径，可含 query/hash；`title` 为名称，`group` 为用途，`note` 为运行条件 |
| `localPages` | 依赖本机服务的入口说明数组：`title`、项目内文档 `path`、运行条件 `note`；总站链接到启动说明 |
| `publishExclude` | 发布目录内保留在本机、无需复制到 Pages 的路径；不删除源文件 |
| `publishDownloads` | 大文件的路径与 HTTPS 下载地址映射；构建排除本体并将 HTML 下载链接改为远端资产地址 |

`directory` 由 `id` 与 `slug` 自动计算，无需填写。清单顶层 `repository` 是本库的 GitHub URL，`siteUrl` 是未来的 Pages 基础地址；如更换仓库或域名，修改这两项并重新同步、构建。

总站构建时自动发现发布目录中的独立 HTML，生成“正式网页、辅助与验证、历史回放、本机工具”四组入口及 `web-index.json`。素材许可证镜像不作为网页入口，已保存提案的独立查看页会保留。新增网页无需手工抄写目录；通过 `webPages` 补充名称、用途、运行条件和图片/绘笔等查询参数入口。正式网页与历史页会加入返回总站导航。发布构建会检查全部相对 HTML/目录链接，失效时阻止发布。

## 摘要阅读格式

已有研究按「能力、原理、使用场景、价值」整理摘要，每项独立呈现并加粗标题。能力说明能做什么；原理说明依靠什么技术、输入如何变成输出；使用场景说明具体用途；价值说明对当前研究与后续开发的意义。已有明确限制或采用判断时，另列「边界」或「当前结论」，保留已验证与未验证的范围。

```json
"summarySections": [
  { "title": "能力", "text": "项目能完成的具体工作与输出。" },
  { "title": "原理", "text": "实现这些能力的技术与处理过程。" },
  { "title": "使用场景", "text": "适合采用的实际任务。" },
  { "title": "价值", "text": "对当前研究与后续开发的意义。" }
]
```

`summary` 保留简短介绍，新建项目仍可通过 `--summary` 填写。研究完成后再补充 `summarySections`，避免在一句话中堆叠所有内容。子项目 README 的开头使用相同的加粗标题与段落顺序；完整分析放在后面的对应章节。

## 图片与说明

1. 将截图放入 `projects/001-slug/assets/`，建议使用 PNG、JPEG、WebP、GIF 或 SVG。
2. 在子项目 README 中用相对路径展示图片，例如 `![搜索结果页面，展示筛选与分页](assets/search.png)`。
3. 为总入口设置 `cover`，例如 `"projects/001-slug/assets/search.png"`，同时写明 `coverAlt`。
4. 运行 `npm run sync`。根 README 会显示该项目封面与摘要；网站构建时也会复制封面。

不要使用尚不存在的图片路径。一个项目的全部截图可放在子项目 README 中，总入口只展示一张封面。

## 研究与源码组织

`README.md` 放介绍、来源、版本、图片、复现步骤和结论；`notes/research.md` 放问题、架构、实验和证据。需要实现代码时，再按实际语言和框架增加目录，不预设所有项目使用相同技术栈。

来源链接使用来源名称作为显示文字，不统一写“源码”。仓库来源优先记录具体 commit；网站来源记录访问日期、公开资料与实测证据，不虚构后台源码、版本或许可证。需要引入上游代码时，保留许可证、版权声明和修改说明。环境变量只提交不含秘密值的 `.env.example`。

## 常用检查

```bash
npm run sync
npm run check
npm test
npm run build
```

`check` 检查固定编号、目录匹配、README、封面、发布路径、URL 及根索引一致性。清单可以任意编辑顺序，输出始终按编号升序展示。
