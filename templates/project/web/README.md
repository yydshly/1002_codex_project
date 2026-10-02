# {{id}} · {{name}} Web

这里存放该项目可选的 Web 源码或静态演示。开始实现时补充技术栈、环境和运行命令。

若直接提供 HTML/CSS/JS，将 `index.html` 和资源放在此目录，并在 `projects/catalog.json` 中设置：

```json
"publishDir": "projects/{{directory}}/web"
```

若使用框架，可将 `publishDir` 指向构建后的静态输出目录，例如 `projects/{{directory}}/web/dist`；每次运行总仓库的 `npm run build` 前先构建该应用，CI 发布也要添加对应构建步骤。

发布到 GitHub Pages 的应用路径为 `/1002_codex_project/projects/{{directory}}/`。设置正确的资源 base 路径；单页应用可使用 hash 路由。后端服务应另行部署，通过 `demo` 字段记录外部地址。

完整说明见 [部署指南](../../../docs/deployment.md)。
