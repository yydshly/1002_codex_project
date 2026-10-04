# 用一次订单运费修改理解 Ix

[返回项目介绍](../README.md) · [实际示例代码](../examples/checkout/app.js) · [Node 运行记录](checkout-example-run.json)

情境：商品 80 元，当前满 100 元免邮，否则运费 10 元；现在要改成满 80 元免邮。示例的 Node 程序已经实际运行；本机没有可用的 Ix CLI 和 Docker，本次没有安装它们。下文 Ix 命令是可复现的操作步骤，关系结果是由源码推导的预期，不是伪造的 CLI 输出。

## 1. 先看真实代码与业务结果

[shipping.js](../examples/checkout/shipping.js) 决定运费：

```javascript
export function calculateShipping(amount) {
  return amount >= 100 ? 0 : 10;
}
```

[checkout.js](../examples/checkout/checkout.js) 明确导入该函数，计算应付金额：

```javascript
import { calculateShipping } from './shipping.js';
export function checkoutOrder(amount) {
  return amount + calculateShipping(amount);
}
```

[app.js](../examples/checkout/app.js) 的 `submitOrder` 调用 `checkoutOrder`，再输出商品金额、运费和应付金额。[package.json](../examples/checkout/package.json) 启用 ES modules，没有 npm 依赖。

```powershell
node app.js 80
```

在示例目录执行时，原门槛的实际结果为 `{"goods":80,"shipping":10,"payable":90}`；临时把门槛改为 80 后，实际结果为 `{"goods":80,"shipping":0,"payable":80}`。验证后已恢复门槛 100，当前源码仍是原规则；详细环境与结果见运行记录。

## 2. 准备独立工作区与工具

正式试 Ix 时，把示例复制到本研究仓库外的一个新空目录，并初始化 Git，避免示例被识别为父仓库的一部分。以下复制和初始化步骤本次未执行：

```powershell
$demoRoot = 'F:\ix-checkout-demo'
New-Item -ItemType Directory -Path $demoRoot
Copy-Item -Path 'F:\codex_project\1002_codex_project\projects\010-ix\examples\checkout\*' -Destination $demoRoot
Set-Location $demoRoot
git init
```

Windows 先准备 Node.js 22+、Git 和正在运行的 Docker Desktop。官方安装命令为：

```powershell
irm https://ix-infra.com/install.ps1 | iex
ix --version
ix status
ix docker start
ix doctor
```

后端已正常运行时可跳过 `docker start`。`status` 查是否可达，`doctor` 检查服务、数据库与图谱。普通流程不需要 `ix init` 或 `ix setup`；`init` 已弃用。[安装与命令说明](https://github.com/ix-infrastructure/Ix#install)、[先决条件](https://github.com/ix-infrastructure/Ix/blob/main/docs/prerequisites.md)、[注册源码](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/register/oss.ts)

## 3. 把当前源码建成图

```powershell
ix map .
```

这一步先摄取文件，再生成结构地图：Tree-sitter 识别函数、导入和调用；解析器沿明确导入把目标连起来；图补丁记录实体、关系、来源与更新；本地 Scala memory-layer 和 ArangoDB 保存结果，后续命令查询这份图。解析源码不需要先提交 Git commit。[map 实现](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/map.ts)、[解析器](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/index.ts)、[Patch](https://github.com/ix-infrastructure/Ix/blob/main/core-ingestion/src/patch-builder.ts)

从这个真实例子的导入和函数调用，可推导应检查的静态链路：`submitOrder → checkoutOrder → calculateShipping`。这不是实际请求追踪；若建图没有得到预期边，应查看解析与提交状态，再回到源码核对。

## 4. 找准函数，逐步查询关系

在演示工作区根目录执行：

```powershell
ix search calculateShipping --kind function --limit 10 --format json
ix locate calculateShipping
ix read calculateShipping
ix callers calculateShipping
ix callees checkoutOrder
ix trace submitOrder
ix impact calculateShipping --depth 2
ix context calculateShipping --format json
```

| 操作 | 本例想确认什么 | 依据源码的预期 |
| --- | --- | --- |
| search / locate / read | 是否找对运费函数 | 指向 shipping.js 的定义，并读取门槛 |
| callers | 谁直接调用它 | checkoutOrder |
| callees | 结算函数调用谁 | calculateShipping |
| trace | 哪些函数形成关联链 | submitOrder、checkoutOrder、calculateShipping |
| impact --depth 2 | 修改前优先检查什么 | 沿已识别关联检查两层，结算函数与提交入口等候选；不代表必然故障 |
| context | 给 Agent 哪些局部信息 | 目标相关实体、关系与证据；实际字段以返回结果为准 |

这张表是待验证目标，没有模拟 Ix 输出。若同名候选不止一个，先核对 JSON 中的类型、路径和完整 entity ID，再用明确 ID 继续；不要自动选第一项。[命令参考](https://github.com/ix-infrastructure/Ix/blob/main/skills/ix/references/commands.md)、[上下文接口](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/mcp/server.ts)

## 5. 改规则，刷新图，再验证业务

把独立副本 shipping.js 的 `amount >= 100` 改为 `amount >= 80`，然后执行：

```powershell
ix map .
ix read calculateShipping
ix impact calculateShipping --depth 2
node app.js 80
```

更新图谱让查询对应新源码；Node 运行则验证真实应付金额，两者承担不同工作。这个修改只改变函数内部门槛，因此调用链应保持不变，应付金额由 90 变为 80。Ix 的结构图帮助找范围，真正的业务结果由运行与测试确认。

源码核对补充：`impact` 的默认深度为 1。本例使用 `--depth 2`，是为了进一步检查间接上游的 `submitOrder`；不能将默认结果理解为全部传递依赖。[impact 实现](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/impact.ts#L26)

持续编辑可在另一个终端运行 `ix watch`；普通手动刷新用 `ix map .` 即可，当前 map 没有 `--force`。这里的图谱 revision 不是 Git commit。[map](https://github.com/ix-infrastructure/Ix/blob/main/ix-cli/src/cli/commands/map.ts)、[watch 用法](https://github.com/ix-infrastructure/Ix#commands)

## 6. 可选：让 Codex 查询同一图谱

```powershell
codex mcp add ix-memory -- ix mcp
```

之后可让 Agent 先查询 calculateShipping 的调用方和上下文，再修改门槛并运行验证。MCP 只是把图查询工具接给 Agent；本例基础查询无需 Pro 或云语义搜索。Scala 后端源码在私有仓库，公开安装使用发布镜像。[MCP 文档](https://github.com/ix-infrastructure/Ix/blob/main/docs/mcp.md)、[后端边界](https://github.com/ix-infrastructure/Ix/blob/main/CONTRIBUTING.md#backend-development)
