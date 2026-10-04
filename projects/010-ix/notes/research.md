# 010 · Ix · 研究笔记

[返回项目介绍](../README.md) · [中文说明页](../web/index.html)

**能力**：公开 CLI 与 MCP 可建立和查询代码关系图，围绕具体符号提取结构、依赖、影响和上下文。

**原理**：静态语法提取、分层关系解析、带来源的图补丁、本地数据库和有限子图检索组成处理链路。

**使用场景**：接手仓库、评估重构、沿入口检查代码、架构研究和 AI 辅助开发；场景判断由实现推导。

**价值**：持续保存代码结构，使人和 Agent 复用同一索引，查询结果能回到源码核对。

**边界**：私有 Scala 后端、Pro 项目记忆与云语义搜索各有独立边界；静态关系近似不等于运行时追踪。本次未启动真实 Ix。

## 研究问题与证据方法

本次回答能做什么、怎样从代码生成结果、适合什么工作。重点区分结构记忆与模型记忆、图谱影响与必然故障、context 与自由问答、公开 API 与默认 OSS 功能。

- 核对日期：2026-10-04，Asia/Shanghai。
- 对象：公开 `main` 文档与关键源码；未取得可信 commit SHA，未锁定固定提交。
- 文档与源码观察为事实；场景、技术局限和价值是推断；运行质量、速度、token 节省和生产效果未实测。
- 浏览可能使用缓存，不声明各文件在同一时刻来自相同提交；资料有差异时说明差异，实际采用应核对已安装版本。
- 未 clone、安装或执行 Ix，未启动 Docker，未配置其 MCP、skill、Pro、云服务或 GitHub 令牌。
- 本地网页和总览图是说明材料，交互使用自编示例，不能作为 Ix 运行证据。

来源元数据保存在 [sources.json](sources.json) 和 [upstream-snapshot.json](upstream-snapshot.json)。

## 架构与关键实现

| 层 | 位置 / 技术 | 输入 → 输出 | 核对的职责 |
| --- | --- | --- | --- |
| 摄取编排 | `ix-cli/src/cli/commands/ingest.ts` | 文件 → 待解析 / 删除集合 | 增量基线、批量解析和提交 |
| 语法提取 | `core-ingestion/src/index.ts`、`queries.ts`、Tree-sitter | 文本 → 符号、调用、导入、包含记录 | 按语言提取语法节点 |
| 引用解析 | `resolveEdges` | 提取记录 → 可解析的目标连接 | 导入、再导出和唯一名称规则 |
| 图补丁 | `core-ingestion/src/patch-builder.ts` | 记录 → 实体、边和来源操作 | ID、patch 构造与去重基础 |
| 持久服务 | Scala memory-layer + ArangoDB | patch → 持久图与 revision | 公开接口可见，内部实现未公开 |
| 结构检索 | CLI 命令与共享 API | 明确目标 → 邻域、路径、影响或上下文 | 有限查询及结果呈现 |
| MCP 适配 | `ix-cli/src/mcp/server.ts` | tool 参数 → CLI → tool 结果 | 参数 schema、格式和上下文预算 |
| 可视化 | Compass、`ix view` | 后端图 → 浏览器视图 | proxy 与工作区 / system 范围 |

证据：[摄取](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts)、[语法查询](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/queries.ts)、[提取与解析](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts)、[patch](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts)、[MCP](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)。

### 增量摄取与图谱新鲜度

CLI 的摄取流程利用成功基线，先做 mtime 跳过，再做 hash 比较，随后解析和提交；删除文件会清理对应实体及关系。运行存在错误时，不保存新的成功基线。[ingest](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L1062)

跨仓库 stitching 要完整的包生产者 / 消费者注册。增量 map、解析缺失或运行错误可能跳过该步，原有注册可能保留；“map 成功”不等于所有跨仓库边最新。应观察处理、skip、error 和 stitch 状态，而不只看退出码。[ingest](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts)、[API stitch](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#post-v1stitch)

### 解析语法与解析引用是两步

Tree-sitter 可以识别函数定义、调用表达式和导入语句，但源码里的 `validate()` 不天然含唯一目标。Ix 后续在符号与导入信息间解析引用，才能形成可导航的边。

`resolveEdges` 分层使用明确导入、有限一跳再导出、同语言全局唯一名称；常见的 `get` / `map` / `then` 或多个候选可能跳过。对应规则 confidence 为 `0.9`、`0.8`、`0.5`，**不是实测准确率**。[resolveEdges](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L3416)

还需要区分解析时的规则值与保存的边属性。`buildPatchWithResolution` 未把该 confidence 原样保存到每条边：构造的 `UpsertEdge` 使用空 attrs，claim confidence 为 null。不能宣称查询结果可以逐边显示上述分数。[patch-builder](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts)

由静态与启发式解析可推断：反射、依赖注入、运行时插件、动态 import、宏和框架约定需要额外证据；0 个或多个候选也会影响关系覆盖。我们没有量化误报 / 漏报。缺边不等于没关系，图路径不等于实际执行记录。

### ID、来源与图谱修订

符号 ID 由工作区、规范化路径和 qualified name 参与 SHA-256 计算；patch ID 结合来源路径、内容 hash 和提取器版本，并利用 `replaces` 替换旧 patch。chunk ID 包含 startLine，移动、改名和重排后并非所有实体都永久保留 ID。[patch-builder](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts#L6)

API 模型含来源路径、source hash、extractor、`createdRev` / `deletedRev`；patch 提交返回数字 `rev`，diff 接收 `fromRev` / `toRev`。这是**后端图谱修订号**，不是 Git commit；一次摄取也可能提交多份 patch。`ix diff 1 5` 不能解释为比较第 1 和第 5 个 Git 提交。[API 模型](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#data-models)

### 结构记忆、模型与业务记忆

本地图谱跨 CLI 和 Agent 会话保留，减少从全文重新搜索结构的工作。外部模型通过工具拿到上下文；索引的存在不会自动更新模型权重。

上游更广义的 memory 叙述包含决策、目标等，但 OSS 和 Pro 命令边界不同。API 出现 decisions / intents 字段，不足以证明普通 OSS 用户能完整记录和恢复这些业务记忆。

### 本地镜像与私有后端

Compose 启动 ArangoDB 和 `ghcr.io/ix-infrastructure/ix-memory-layer:latest`，端口绑定 loopback，图数据保存到 named volume。ArangoDB 当前固定精确 patch 版本，memory-layer 则用 `latest`；后续复现应记录实际 release / digest。[Compose](https://github.com/ix-infrastructure/Ix/blob/main/docker-compose.standalone.yml)

贡献说明明确 Scala backend 在私有 `ix-infrastructure/Ix-memory` 开发，发布镜像公开可获取；`ix-memory-layer` 是 artifact 名，不能据此找到可 clone 的完整后端。我们能核对公开解析、客户端和接口，无法审计后端查询、评分与存储的全部内部实现。[后端开发说明](https://github.com/ix-infrastructure/Ix/blob/main/CONTRIBUTING.md#backend-development)

## 能力与边界核对

### CLI、MCP 与 Pro

`registerOssCommands()` 注册 map/watch、符号与关系命令、impact/trace、架构命令、history/diff/patches 及 context 等。query/search 等部分命令在高级帮助中隐藏，隐藏不等于 Pro。[OSS 注册](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/register/oss.ts)

MCP 的 OSS 表包含 23 项；`ix_context` 接受图谱历史修订、实体、关系、证据和字符预算。`read` 可直接读取明确路径，因此不能把所有读取概括为仅访问图。MCP 是工具适配层，主机中的 hooks、skills 和 slash commands 仍有独立机制。[MCP 实现](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)、[整合说明](https://github.com/ix-infrastructure/Ix/blob/main/docs/mcp-plugin-consolidation.md)

CLI Pro 列表包含 briefing、bug、decide/decisions、goal/goals、plan/plans、task/tasks、truth、workflow；无 Pro 时仅返回 `requires Ix Pro` 的 stub。MCP 只在 Pro 包加载后注册 briefing、decisions、decide；独立 `@ix/pro` 的内部实现不在此仓库。[注册](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/register/oss.ts)、[MCP](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)

### 三种查询入口

| 入口 | 观察到的含义 | 可用边界 |
| --- | --- | --- |
| `context <target>` / `ix_context` | 具体目标的有限、确定性上下文包 | OSS 注册存在，仍需要可用后端和图谱 |
| `query` | 旧结构问答；参考文档标记弃用，MCP 排除 | OSS CLI 仍注册，但不作为推荐 Agent 工作流 |
| `/v1/search/semantic` | 对 term 做 embedding 后按相似度检索 | 要求 cloud extraction service；未配置返回 503 |

来源：[命令参考](https://github.com/ix-infrastructure/Ix/blob/main/skills/ix/references/commands.md)、[MCP 整合](https://github.com/ix-infrastructure/Ix/blob/main/docs/mcp-plugin-consolidation.md)、[API semantic](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#post-v1searchsemantic)。不推断 semantic 所属的商业套餐；证实的是服务依赖。

### 同名与静态影响范围

同名符号可能有多条路径，短 ID 也可能 ambiguous。先核对 kind、路径与 ID，再查询明确目标；不能把首个搜索候选自动当成正确目标。

`trace` 和 `impact` 使用代码图关系，给出值得阅读或回归的候选范围。由调用边连接到目标，不意味着运行时一定执行；没连接到目标，也不能证明绝不受影响。真实风险仍取决于外部契约、动态关系、编译、测试和运行行为。

README 与部分较早文档对 `reset --workspace` 是否开放有差异，说明资料可能跨版本。复现时核对安装版本 `--help` 和源码，不在普通理解流程中执行清理。[README](https://github.com/ix-infrastructure/Ix#commands)、[API reset](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#reset)

## 用于理解的例子

假设有 `loginHandler → authenticate → verifyToken` 和 `renewSession → verifyToken`。围绕 verifyToken 查询 callers 可提示上游，impact 把它们列入检查候选，context 只取目标与有限邻接关系，避免读取全部认证代码。

这是说明用的假设，**不是本次真实 Ix 输出**。实际项目可能有字符串注册、动态实现、跨服务请求或解析失败；示意网页也使用自编数据并应明确标注。

## 使用价值与采用判断

| 观察 / 推断 | 可能的帮助 | 本次未证明 |
| --- | --- | --- |
| 持久图谱 | 复用同一目标结构 | 时间节省与维护成本 |
| 来源和实体 ID | 回到源码核对证据 | 所有关系正确、动态边完整 |
| 有限上下文与 `llm` 输出 | 控制工具输出量 | 模型成功率和实际 token 节省 |
| CLI / MCP / Compass 共用 | 人与 Agent 共享结构 | 所有环境的多客户端稳定性 |
| 增量摄取 | 减少重复处理 | 大仓库内存、延迟、恢复表现 |

README 的 token 节省来自项目方内部测量，明确不是公开 benchmark；本次未复测。savings 的 naive 文件读取估算也不替代同任务 A/B 对比。[README Results](https://github.com/ix-infrastructure/Ix#results)、[命令参考 savings](https://github.com/ix-infrastructure/Ix/blob/main/skills/ix/references/commands.md#session-metrics)

宜先用小仓库验证定位与关系，再评价大型项目和 Agent 任务。结构问题多、反复分析同一仓库时可能有价值；动态插件、反射和跨服务协议应结合其他证据。

## 实验记录

| 日期 | 对象 / 环境 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 2026-10-04 | Ix 公开 main | 文档、注册、MCP、解析/patch、摄取、API、Compose、贡献说明交叉阅读 | 确认能力、链路与边界 | 引用及 sources.json |
| 2026-10-04 | Windows 本研究仓库 | 编写中文 Markdown、来源清单和说明材料 | 形成研究档案；无后端实验 | projects/010-ix |
| 未执行 | 测试仓库与真实后端 | 安装、map、调用验证、增量更新、性能对比 | 待验证 | 无实测输出 |

前两行记录源码观察和本地说明编写，不能视为 Ix 后端通过测试。

## 后续复现与判断标准

1. 记录 Node / Docker / Ix CLI、backend release / digest、graph schema、工作区路径，不只记 latest。
2. 小仓库至少含跨文件明确导入、同名函数、一次再导出、动态调用和删除文件。
3. map 后保存处理、skip/error、patch 与图谱 revision。
4. 对照人工预期检查 callers/imports/trace/impact，分别记正确、误连、漏连、不可解析。
5. 改动和删除文件后再 map，核对实体、边和基线；跨仓库独立观察 stitch 状态。
6. 同问题对比传统搜索与 Ix，记录输出体积、调用数、耗时、答案和代码修改正确性。
7. 编译、测试和运行验证修改；impact 只帮助安排优先检查范围。

操作起点见 [项目介绍](../README.md#以后怎样复现真实-ix)。本次未执行以上步骤。

## 当前结论

公开证据支持将 Ix 定位为持久的代码结构图与目标导向查询工具，供 CLI、MCP 和可视化共享。合理承诺是提供结构证据与检查候选；私有后端、独立 Pro、云依赖和静态解析覆盖决定了采用前须验证的范围。

## 参考资料

- [Ix README](https://github.com/ix-infrastructure/Ix)：定位、处理模型、入口、部署和内部效果声明。
- [Ix 命令参考](https://github.com/ix-infrastructure/Ix/blob/main/skills/ix/references/commands.md)：CLI 用法、context、savings、query 弃用。
- [OSS / Pro 注册](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/register/oss.ts)：公开命令与 Pro stub。
- [MCP server](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)：工具、上下文预算与 Pro gating。
- [MCP 文档](https://github.com/ix-infrastructure/Ix/blob/main/docs/mcp.md)：客户端注册与进程隔离。
- [MCP 整合](https://github.com/ix-infrastructure/Ix/blob/main/docs/mcp-plugin-consolidation.md)：弃用 query 与宿主 hooks/skills 边界。
- [语法查询](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/queries.ts)：Tree-sitter query。
- [core-ingestion](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts)：提取与关系解析。
- [patch-builder](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts)：ID 与 patch 构造。
- [ingest](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts)：增量和提交。
- [HTTP API](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md)：来源、revision、stitch、semantic 与 proxy。
- [Compose](https://github.com/ix-infrastructure/Ix/blob/main/docker-compose.standalone.yml)：镜像、volume、端口。
- [CONTRIBUTING](https://github.com/ix-infrastructure/Ix/blob/main/CONTRIBUTING.md)：私有 Scala 后端与公开镜像。
- [LICENSE](https://github.com/ix-infrastructure/Ix/blob/main/LICENSE)：Apache-2.0。
