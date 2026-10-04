# Ix 从源码到查询结果、图形展示的完整路径

[返回项目介绍](../README.md) · [订单示例操作步骤](checkout-walkthrough.md) · [实际 Node 运行记录](checkout-example-run.json)

Ix 先把目标仓库中的定义、导入与调用转为结构记录，再把可解析的关系写成持久化图。终端、AI 工具和浏览器从图中取有限范围的数据，分别呈现文字、结构化记录或图形。**解析源码、保存图、查询图、绘制图，是四件不同的工作。**

本文区分三种证据：**源码事实**是公开实现或官方文档明确写出的行为；**概念记录**是依照字段和规则推演的示例摘录；**实际执行**只指已有 Node 订单示例运行。本项目未安装或运行 Ix、未启动其后端、未获得真实 Ix 查询结果。核验日期为 2026-10-04；链接指向可变 `main`，浏览可能存在缓存，未取得固定提交 SHA。

## 原 Ix 仓库中，各模块负责什么

| 模块 | 主要职责 | 核验入口 |
| --- | --- | --- |
| `ix-cli/src/cli/commands/ingest.ts` | 文件发现、增量判断、调度解析、解析关系、构建与提交 patch | [发现文件](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L234) |
| `core-ingestion/src/parse-worker.ts` | worker 接收路径与源码，调用 `parseFile` | [worker](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/parse-worker.ts#L1) |
| `core-ingestion/src/queries.ts` | 按语言匹配定义、导入、调用等语法节点 | [JavaScript 查询](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/queries.ts#L95) |
| `core-ingestion/src/index.ts` | `parseFile` 输出文件记录；`resolveEdges` 解析跨文件目标 | [parseFile](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L2213)、[resolveEdges](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L3417) |
| `core-ingestion/src/patch-builder.ts` | 为节点、边、chunk 与 patch 生成 ID，转换为图写入操作 | [builder](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts#L399) |
| `ix-cli/src/client/api.ts` | 把客户端请求转为后端 HTTP 请求 | [HTTP 客户端](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/client/api.ts#L239) |
| `ix-cli/src/cli/resolve.ts`、其他命令模块 | 解析用户输入目标，选择查询方向、谓词和深度，整理结果 | [目标解析](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/resolve.ts) |
| `ix-cli/src/cli/format.ts`、`explain/` | 格式化输出；根据结构事实生成解释 | [格式](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/format.ts)、[解释流程](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/explain.ts#L36) |
| `ix-cli/src/mcp/server.ts` | 暴露 MCP 工具，复用 CLI 的查询命令 | [MCP server](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts) |
| `ix-cli/src/cli/commands/view.ts` | 提供 Compass 的 SPA，代理 `/v1/*` 请求并附加范围信息 | [官方代理说明](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#L1) |

Scala memory-layer 后端源码在私有 `Ix-memory` 仓库，公开仓库无法核验其完整数据库实现、查询算法或布局实现。安装使用公开镜像，与 ArangoDB 一起运行。[后端边界](https://github.com/ix-infrastructure/Ix/blob/main/CONTRIBUTING.md#backend-development)、[Docker 组成](https://github.com/ix-infrastructure/Ix/blob/main/docker-compose.standalone.yml)

## 1. 选定目标仓库，发现文件并判断变化

源码事实：CLI 优先通过 Git 发现已跟踪与未忽略的未跟踪文件，失败后才遍历目录；检查支持的格式、路径边界、大小和生成文件等条件。绝对路径用于本机读文件，送入解析器和 patch 的路径是工作区相对路径，不把本机绝对路径当作源码 URI。

已有成功摄取基线时，先根据 mtime 跳过未变文件，再对变化文件计算完整 SHA-256，与后端保存的 source hash 比较。内容未变可跳过，内容变化才继续解析；删除文件进入删除补丁流程。解析或提交有错误时，不写入新的成功基线。[mtime 与 hash](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L1063)、[变化文件路径](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L1473)

本例使用当前真实文件；为方便表达，以下**概念记录假定它们位于独立演示工作区根目录**，不声称已经复制或建图。完整扫描还可能包含 `package.json` 等文件。

| 文件 | 定义位置 | 明确调用 |
| --- | --- | --- |
| [app.js](../examples/checkout/app.js) | `submitOrder`，3–6 行 | 第 4 行调用 `checkoutOrder` |
| [checkout.js](../examples/checkout/checkout.js) | `checkoutOrder`，3–5 行 | 第 4 行调用 `calculateShipping` |
| [shipping.js](../examples/checkout/shipping.js) | `calculateShipping`，1–3 行 | 第 2 行计算运费；无内部用户函数调用 |

## 2. 用语法树识别结构，不执行订单业务

源码事实：`parseFile(filePath, source)` 选择语言 grammar，执行 `parser.parse`，随后用 `query.matches(tree.rootNode)` 匹配语法节点。JavaScript 查询识别函数声明、导入语句和调用表达式。先收集定义，再收集导入与调用；后者利用行区间找到调用所处的函数。[parse 与两次处理](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L2259)

例如 `calculateShipping(amount)` 是一个调用表达式：函数名为 `calculateShipping`，它出现在 `checkoutOrder` 的定义范围内，因此可以形成 `checkoutOrder CALLS calculateShipping`。语法树保留源码位置，让后续阅读能回到定义。

**Ix 在这一步没有执行 `amount >= 100 ? 0 : 10`。** 调用关系不保存“80 元订单运费为 10 元”这个运行结果；“满 100 元免邮”需要读取函数正文或运行程序才能确认。函数的完整正文也不能直接等同于默认 `ix map` 写入数据库的全部内容。

## 3. 从单文件中抽取符号、导入与尚未解析的调用

源码事实：文件结果含 `entities`、`relationships`、`chunks`、import binding 和文件角色等。符号记录名字、类型、定义行和容器；关系先使用名字标识两端，尚不保证跨文件目标已找到。调用会按 caller→callee 去重，并过滤部分内建调用。[记录类型](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L145)

以下是 `checkout.js` 的**概念摘录，不是真实 Ix 输出**；省略语言、角色等重复字段：

```js
{
  filePath: "checkout.js",
  entities: [
    { name: "checkout.js", kind: "file" },
    { name: "checkoutOrder", kind: "function", lineStart: 3, lineEnd: 5 },
    { name: "shipping.js", kind: "module", lineStart: 1, lineEnd: 1 }
  ],
  importBindings: [{
    pkg: "./shipping.js", local: "calculateShipping", imported: "calculateShipping"
  }],
  relationships: [
    { srcName: "checkout.js", dstName: "checkoutOrder", predicate: "CONTAINS" },
    { srcName: "checkout.js", dstName: "shipping.js",
      predicate: "IMPORTS", importRaw: "./shipping.js" },
    { srcName: "checkoutOrder", dstName: "calculateShipping", predicate: "CALLS" }
  ]
}
```

`CALLS` 此时只有名字，还未指明 `calculateShipping` 究竟属于哪个文件。import binding 保留“本文件的局部名字 → 提供模块中的公开名字”，以便处理同名、别名和导出关系。chunk 则记录语义片段的范围与 hash，不是一次实际函数调用的日志。

## 4. 建索引，再把名字解析成跨文件目标

源码事实：`resolveEdges` 使用符号表、文件路径与导入索引。为支持分批解析，CLI 可以预建覆盖仓库的全局索引，让当前批次找到批次外的定义。解析优先使用明确导入，再尝试有限的一跳 re-export 和全局唯一同名；歧义与常见方法名会被过滤。[索引结构](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L3141)

本例可把核心符号表理解为以下**概念映射**，它不是后端实际返回的 JSON：

```text
submitOrder       → app.js       / submitOrder
checkoutOrder     → checkout.js  / checkoutOrder
calculateShipping → shipping.js  / calculateShipping
```

`checkout.js` 明确导入 `./shipping.js`，提供文件又定义了 `calculateShipping`。据此可推演得到下面这条**解析后记录**：

```js
{
  srcFilePath: "checkout.js", srcName: "checkoutOrder",
  dstFilePath: "shipping.js", dstName: "calculateShipping",
  dstQualifiedKey: "calculateShipping", predicate: "CALLS", confidence: 0.9
}
```

`app.js` 的调用同理可以连到 `checkout.js`，构成 `submitOrder → checkoutOrder → calculateShipping`。明确导入、一次再导出、全局唯一名称的规则值是 0.9、0.8、0.5；它们不是实测准确率，也不代表编译器完整类型推断。[分层解析](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L3417)、[相对导入路径](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts#L4014)

## 5. 把记录转换为节点、边和版本化 Patch

源码事实：`buildPatchWithResolution` 为实体生成 `UpsertNode`，为关系生成 `UpsertEdge`；跨文件关系的目标 ID 来自**真正定义目标的文件**。ID 使用确定性 hash：符号 ID 依赖工作区、归一化路径和限定名字；边 ID 还含两端名字与谓词；patch ID 含路径、内容 hash 与提取器版本；chunk ID 还含起始行。[ID helpers](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts#L7)

以下为**符号化、简化的 Patch**：`N`、`E` 表示 ID 计算，不是可运行函数；尖括号是待由真实运行填入的值，完整操作已省略。

```js
{
  patchId: "<由路径、内容 hash、提取器版本生成>",
  actor: "ix/ingestion", timestamp: "<实际摄取时间>",
  source: { uri: "checkout.js", sourceHash: "<完整文件 SHA-256>",
    extractor: "<实际提取器版本>", sourceType: "code", workspaceId: "<工作区 ID>" },
  baseRev: 0,
  ops: [
    { type: "UpsertNode", id: N("checkout.js", "checkoutOrder"),
      kind: "function", name: "checkoutOrder",
      attrs: { line_start: 3, line_end: 5, language: "javascript" } },
    { type: "UpsertEdge", id: E("checkout.js", "checkoutOrder", "calculateShipping", "CALLS"),
      src: N("checkout.js", "checkoutOrder"), dst: N("shipping.js", "calculateShipping"),
      predicate: "CALLS", attrs: {} }
  ],
  replaces: ["<应替换的旧 patch ID>"], intent: "Parsed checkout.js"
}
```

这是图写入指令，不是原文件的副本。完整 builder 还可生成 chunk、claim 等操作；**普通 `ix map` 默认 topology-only 摄取，会过滤 chunk nodes 和 claims**，不能说每个函数正文都进入数据库。[默认模式](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/map.ts#L55)、[过滤](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L301)

当前 builder 未把 resolver 的 0.9 等值逐条保存到 edge attrs；上面 `attrs: {}` 有意保持源码事实。[跨文件目标与边操作](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts#L552)

改免邮门槛会改变 source hash 和 patch，通常保留函数节点 ID；改名、移动文件可能改变身份。`replaces` 指出旧 patch；删除实体还需客户端进行删除协调。因此“增量”不是只把新节点不断追加而从不清理。[Patch 外层字段](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts#L598)

## 6. 通过 HTTP 提交，后端保存图与 revision

源码事实：通常批量 `POST /v1/patches/bulk`，body 是 `{ patches }`；包含删除或批量失败时可以逐文件 `POST /v1/patch`。客户端读取 `status`、`rev`，更新本次 `latestRev`。**graph revision 是图谱版本，不是 Git commit**，本次没有实际 revision 可报告。[单个提交](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/client/api.ts#L239)、[批量提交](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/client/api.ts#L306)、[调度与 rev](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/ingest.ts#L1276)

本地运行由 Scala memory-layer 提供 HTTP API，ArangoDB 保存图，Docker volume 使数据跨进程保存。公开实现能证明客户端发什么数据、调用什么接口；私有后端内部的完整存储与遍历细节不能凭客户端反推为已核实。

## 7. CLI 如何把名字变成查询结果

用户输入 `ix callers calculateShipping`，首先要把名字解析为明确实体 ID；随后查询这个 ID 的邻接关系，而不是重新解析所有源码。完整 UUID 可直接获取实体，短 ID 前缀需解析，名字通过带工作区范围的 search 得到候选。同名候选可能来自多个文件，应使用路径、类型或明确 ID 消歧；仍有歧义时需要选择，不能把第一个候选自动当成目标。[目标解析入口](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/resolve.ts#L1003)、[名字搜索](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/resolve.ts#L383)

图查询在已存的边上指定方向、谓词和跳数。callers 查入向，callees 查出向；两者都使用 `['CALLS', 'REFERENCES']`，扩展接口返回 `nodes` 与 `edges`。方向与深度限制构成结构切片，不是完整拓扑闭包。图中没有结果时，可使用本地 `rg` 查文本候选，并标记 `resultSource: 'text'`、`text_fallback_used`；这种候选不能当作已解析的调用边。[扩展接口](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#L411)、[callers 查询](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/callers.ts#L55)、[callees 查询](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/callers.ts#L159)

**impact 默认深度是 1，当前命令最大支持 3。** 对叶子符号会按指定跳数查反向 `CALLS` 与 `REFERENCES` 等结构信息，再依据规则解释风险；图健康状态也会影响是否给出风险判断。本例直接调用者是 `checkoutOrder`；要把间接调用者 `submitOrder` 纳入候选，需要显式查看两跳：

```powershell
ix impact calculateShipping --depth 2
```

这是应该检查的潜在影响范围，不是“这些代码一定坏了”，也不能证明未出现的代码绝不受影响。[深度选项](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/impact.ts#L26)、[叶子符号分析](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/impact.ts#L482)

拿到数据后，CLI 根据命令选择 `text`、`json` 或 `llm` 渲染。文字便于人读，JSON 便于程序处理，LLM 格式压缩为结构记录；格式化不会凭空增加图中缺失的事实。[格式约定](https://github.com/ix-infrastructure/Ix/blob/main/docs/llm-format.md)

## 8. explain 的自然语言从哪里来

公开 CLI 的流程是 `collectFacts → inferRole → inferImportance → renderExplanation`：读取目标、调用者、被调用者、导入与来源等事实，根据规则推断角色与重要性，然后拼出解释、上下文与使用者等内容。**此流程不是必然调用大模型生成一段回答**，也不意味着已经完整理解业务需求。[explain 流程](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/explain.ts#L29)、[事实采集](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/explain/facts.ts#L364)

如果图过期或调用目标未解析，应把相关诊断一并读入判断。`ix read` 读取函数正文可帮助确认免邮门槛；图关系负责缩小阅读范围，业务含义仍需要阅读与验证。

## 9. MCP 怎样把同一能力交给 AI

`ix mcp` 提供 stdio MCP server。AI 调用工具时，server 把参数转成 CLI 命令参数，交给 runner，再把结果包装为 MCP 内容。默认 runner 在同一进程中重建 Commander 程序、解析参数并捕获输出；设置 `IX_MCP_SUBPROCESS=1` 才选择子进程。因此它复用 CLI 的目标解析、查询和格式化流程，不需要 AI 每次从整库重新推导调用链。[MCP 实现](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)、[默认 runner](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/runner.ts#L517)

`ix context` 也先解析实体，再并行收集结构事实、按节点 ID 获取后端 context，并检查图健康状态；还可加入本地文本相关引用与 Git cochanges。CLI 按确定性顺序组装 bundle，再根据实体、关系、证据与字符预算裁剪，输出 text、JSON 或 LLM 格式。这样控制交给 AI 的上下文范围；未被收录的内容不能据此判定不存在。MCP 的 context 工具复用这条流程。[命令流程](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/context.ts#L459)、[事实采集](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/context.ts#L1581)、[bundle 与预算](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/context.ts#L1935)

例如 Agent 可以先查询运费函数及其调用者，再读取目标源码、修改门槛、运行测试。MCP 接入本身不会保证查询完整，也不会自动证明业务修改正确。

## 10. Compass 怎样把图数据变成页面

官方接口文档说明：`ix view` 提供本地 SPA，默认可视化代理端口为 8080；它把 `/v1/*` 请求转发到 8090 的后端，并加上 workspace/system 范围头。可视化与 CLI 读取同一份后端图。[端口与代理](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#L40)、[范围头](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#L65)

可以用通用图形页面机制理解：页面取回节点 ID、名字、类型及关系两端，给节点分配屏幕位置，用边连接对应节点，呈现标签和详情，并在用户选择目标时请求局部数据。**这段是通用绘制说明，不是已核验的 Compass 具体布局算法或绘图库。** 不应指定 force layout、D3、Cytoscape 等未核实实现；本项目中文展示页也是独立教学页面，不是上游 Compass 截图。

架构图还可读取 `/v1/map` 的层级区域结果。**公开 `map` 命令帮助声明：在带权重的文件耦合图上用 Louvain 聚类，生成多层 `Region` 与 `IN_REGION` 关系。** 这是官方公开声明，可以据此理解文件如何汇成区域；具体私有后端如何构造权重、选择参数和完成聚类，尚未审计。聚类产生区域，也不能据此推断 Compass 的屏幕坐标布局。[map 命令帮助](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/map.ts#L143)、[map 接口](https://github.com/ix-infrastructure/Ix/blob/main/docs/api/README.md#L157)

## 11. 从结构候选回到真实业务结果

已有 Node 记录验证：原门槛 100，80 元订单运费 10、应付 90；临时把门槛改为 80 后，运费 0、应付 80。验证后源文件已恢复门槛 100。[运行记录](checkout-example-run.json)

对应 Ix 的预期是：更新映射后，函数源码对应新规则，而 `submitOrder → checkoutOrder → calculateShipping` 的调用结构保持不变。前者是已运行的业务结果；后者是依照代码推演、尚待真实 Ix 建图验证的结构预期。二者一起使用，才能把“找到应该检查的代码”推进到“确认修改后的行为”。
