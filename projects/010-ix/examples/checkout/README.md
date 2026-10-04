# 可运行的订单结算例子

商品金额不足 100 元时收取 10 元运费；达到 100 元免运费。三个业务函数分布在三个文件，调用链为 `submitOrder → checkoutOrder → calculateShipping`。

在此目录执行：

```powershell
node app.js 80
```

实际输出：`{"goods":80,"shipping":10,"payable":90}`。本例只使用 Node.js，没有 npm 依赖。

将 `shipping.js` 的 `amount >= 100` 改成 `amount >= 80`，再运行同一命令，应付金额变为 80 元。本次已实际运行两个版本，以及商品金额 79 / 100 元的边界用例；交付源码恢复为原始 100 元门槛。

[按步骤理解 Ix 的使用与原理](../../notes/checkout-walkthrough.md) · [实际 Node 运行记录](../../notes/checkout-example-run.json)

本机未安装 Ix 和 Docker，未对本例执行 Ix 建图。若按教程实测 Ix，请先将本例复制到本研究仓库外的独立目录，在新目录 `git init` 后建立图谱，以免沿用父仓库工作区。教程中的图关系为源码推导，不是实测 Ix 输出。
