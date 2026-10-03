# 001 · Cult UI 研究笔记

[返回项目介绍](../README.md) · [Web 运行说明](../web/README.md)

## 研究边界与证据口径

研究日期为 **2026-10-03（Asia/Shanghai）**。研究固定上游 commit **67a66c6ac1cd240914ba688a907611b3437a7a2b**。通过官方导航、全部 134 份 MDX、registry 与实际源码交叉核验，目录覆盖 134 个官方文档组件及 3 个有效补充注册项；旧别名不重复计数。本地预览接入固定版本的真实官方示例与必要框架适配。

- **事实**：来自上游 README、官方目录、固定 commit 源码和许可证；以下链接给出直接来源。
- **研究判断**：产品适用性、工程取舍和性能影响分析，依据组件形态及实现机制推导。
- **本地预览**：目录采用固定版本上游真实示例与其组件；Next.js 运行时、字体和网络资源按本地 Vite 环境适配。没有把任意简化视觉冒充全部官方组件。原有六个研究实验只用于代表机制剖析。
- **验证范围**：研究源码的证据不等于本地浏览器验收，也不等于全部上游组件质量承诺。

上游 README 宣称 **150+ 免费动画组件**；本研究采用可审计口径：官方文档 134 项，有效 registry UI 137 项（另含 3 项基础/背景补充），154 条 UI 记录中的 17 个 deprecated aliases 不重复计数。官方非别名示例共 136 个，示例和复合 API 部件不作为额外独立组件。官方在线文档为阅读时的发布状态，可能与 Git commit 中个别生成文件不同。[上游 README](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/README.md)、[官方文档目录](https://www.cult-ui.com/docs)

## 理解与选用结论

Cult UI 的定位是 **可复制、可修改的 React 组件和视觉效果源码**。它擅长局部界面的精致呈现：让展开、切换、输入、等待和结果更容易观察，或为营销内容增加视觉辨识度。shadcn Registry 是分发方式；安装后组件由消费项目运行和维护。

![全能力地图：137 项组件的分类、原理、场景和选用路线](../assets/cult-ui-capability-map.png)

[查看大图](../assets/cult-ui-capability-map.png) · [SVG 矢量版](../assets/cult-ui-capability-map.svg)

完整能力可以沿五条任务线理解：产品操作涵盖表单、反馈和工作台；交互组织涵盖导航、浮层和引导；AI 界面组织提示词和结果；局部视觉涵盖按钮、卡片、文字和背景；营销展示涵盖落地页、插图、媒体和设备模型。它们覆盖全部 14 个官方叶分类，另有 3 个基础/背景补充项，逐项证据见下方目录。

技术上，React 状态与事件决定界面变化，CSS / Tailwind / SVG 建立布局和外观，Motion 处理弹簧、进入退出与布局连续性。Canvas 和 WebGL 负责需要逐帧绘制或像素采样的部分；COBE、Paper Design、Three.js 是具体渲染依赖。Base UI、Radix、Vaul 等补足表单和浮层行为。技术由组件选择，不是一个统一场景引擎。

前端开发者有现成 React 项目和明确局部任务时可以直接选源码；设计与产品团队可用真实示例比较状态和节奏；学习者可沿“观察效果—读机制—改源码—验证任务”复用本次研究。137 项目录与 138 个预览形成选型地图和开发素材，但用户研究仍需检验真实任务是否更顺畅，不能用视觉演示代替可用性结论。

值得接入的条件是：某个界面任务需要更清楚的反馈或合适的视觉表现，技术栈与主题能适配，并愿意维护本地源码。AI、投票、协作、网关和安全相关组件提供界面或示意，模型执行、业务权限、数据保存和多人同步仍由应用实现。Cult UI 不提供沉浸式整站场景编排；完整 3D 世界、游戏或连续叙事需要独立的场景设计与开发。

## 理解整理与网页发布准备（2026-10-03）

网页增加明确的源码组件定位、能力图导读与完整图阅读、六个方向入口、使用时机、个人价值和采用路径。总索引摘要同步说明能力、技术、场景及价值，封面使用本次生成的能力图，源库链接保持指向 nolly-studio/cult-ui。

依赖重新安装通过；137 项/138 示例完整性校验、TypeScript、多入口 Vite、总站构建、README 索引检查和根 9 个测试通过。桌面验证六方向计数合计 137、15 分类入口、能力图展开与键盘收起、分类筛选和 Halo Switch 原版 iframe 加载；深色主题与使用价值区域通过。390px 下外层文档宽度与可用宽度同为 375px，手机导航切换正常，完整图可在 333px 容器内横向阅读 840px 图幅。总索引摘要、图封面、原库链接与项目入口均验证，未记录控制台错误。

本轮页面证据：[新版首屏](../assets/understanding-overview.png)、[手机能力图](../assets/understanding-mobile.png)、[总站索引](../assets/index-guide.png)。线上发布结果以 GitHub Actions 部署记录和随后真实页面验收为准，本段不将本地通过等同于已部署。

## 研究问题

1. Cult UI 提供哪些界面能力？AI 界面与实际 AI 后端的边界在哪里？
2. 组件如何安装、进入应用、参与运行和被项目维护？
3. React 状态、Motion、Tailwind 与 CSS 分别负责什么？
4. 哪些动效能够帮助用户理解信息变化，哪些只是装饰？
5. 源码复制模式在框架适配、权限、升级、移动端与可访问性上意味着什么？

## 能力目录

[完整目录审计](full-catalog-audit.json) 记录导航、文档、安装名、源码和示例映射；[机制与依赖审计](mechanisms-audit.json) 为每项保存中文功能、独立机制、场景、技术标签、实际 import 闭包与适配审查。人工中文原稿为 [mechanism-copy.tsv](mechanism-copy.tsv)。

| 口径 | 数量 | 含义 |
| --- | --- | --- |
| 官方文档组件 | 134 | 固定 commit 的独立导航叶项，与 134 份组件 MDX 一一匹配 |
| 有效注册 UI | 137 | 134 个文档组件加 3 个无独立文档的补充项 |
| 上游 UI 记录 | 154 | 包含 17 个旧别名；别名不新增能力 |
| 官方有效示例 | 136 | 153 条 example 记录排除 17 个旧示例别名 |
| 本项目接入示例 | 2 | 为 base-select 和 base-tooltip 组合实际 API 的示例，不称为官方 example |
| 未注册源码附录 | 4 | 保留源文件证据，不计入独立官方目录 |
| 公开 registry block | 0 | blocks.ts 另声明 1 个认证块，但未进入主发布 registry |

真实预览的接入清单为 **136 个官方示例 + 2 个本项目 API 接入示例**；构建与逐项浏览器验收结果以后续记录为准，不能把接入数量等同于已通过交互认证。公开 AI SDK Agents 模式不计入本库。

### 官方分类覆盖

| 分类 | 文档组件数 |
| --- | --- |
| AI 输入 | 6 |
| AI 生成界面 | 11 |
| 应用与工作台 | 5 |
| 表单控件 | 8 |
| 反馈与状态 | 5 |
| 导航与浮层 | 11 |
| 引导与流程 | 5 |
| 按钮 | 9 |
| 卡片 | 11 |
| 落地页 | 12 |
| 插画 | 15 |
| 媒体与设备模型 | 10 |
| 背景与视觉效果 | 14 |
| 文字排版 | 12 |

### 134 个官方组件的机制与场景

下表的功能和机制来自固定版本文档与源码，场景是研究建议。技术标签来自静态导入与源码识别，依赖的逐项完整证据在机制审计 JSON；部分依赖由本地组件间接引入。SVG 插图仅展示拓扑或状态，不执行网关路由、部署、安全验证或 AI 工作流。

| 组件与官方文档 | 独立机制 | 典型场景 | 技术标签 |
| --- | --- | --- | --- |
| [提示词编辑器](https://www.cult-ui.com/docs/components/prompt-composer) | Base UI 负责输入行为，Paper Design Warp 渲染助手头像，React 连接输入、附件与发送事件。 | AI 聊天、Agent 控制台和消息输入。 | React、Motion、SVG、WebGL、Shader、Paper Design、Base UI |
| [光晕搜索框](https://www.cult-ui.com/docs/components/halo-search) | 输入状态管理文本和清空操作，渐变外壳与 Paper Design Warp 头像呈现活动反馈。 | 站内搜索、命令栏和 AI 提问。 | React、Motion、SVG、WebGL、Shader、Paper Design、CSS |
| [提示词库](https://www.cult-ui.com/docs/components/prompt-library) | Command 执行列表搜索，Popover 展示模板，Dialog 新增内容，Hover Card 呈现预览；选择通过回调输出。 | AI 聊天模板和团队常用提示词。 | React、Radix UI、Clipboard API |
| [AI 指令选择器](https://www.cult-ui.com/docs/components/ai-instructions) | Popover 放置 Command 搜索列表，React 管理指令选中状态，Dialog 承载新增指令输入。 | 助手系统指令、回答风格和 Agent 规则设置。 | React、Radix UI |
| [AI 流体头像](https://www.cult-ui.com/docs/components/ai-blob-warp) | Paper Design Warp WebGL 着色器填充圆形遮罩；离屏或减少动态效果时暂停渲染。 | 聊天助手头像、语音 Agent 活动指示和品牌形象。 | React、Motion、WebGL、Shader、Paper Design |
| [光晕文件拖放区](https://www.cult-ui.com/docs/components/halo-dropzone) | 原生文件选择和拖放产生文件列表，Motion 反馈悬停与拖入，文件类型映射为图标。 | 附件表单、文档上传和 AI 输入。 | React、Motion、SVG、原生拖放 |
| [选项投票](https://www.cult-ui.com/docs/components/choice-poll) | 受控或非受控选择状态记录答案，票数换算结果条宽度；组合组件组织选项与结果。 | 意见反馈、社区投票和应用问卷。 | React、Radix UI |
| [功能偏好投票](https://www.cult-ui.com/docs/components/feature-poll) | 组合选项维护单选或多选状态，结果票数映射成进度条；支持键盘切换与选择。 | 更新日志、路线图和产品调研。 | React、Radix UI |
| [投票容器](https://www.cult-ui.com/docs/components/poll-widget) | 组合投票根状态、选项与结果组件，容器模式决定挂载位置，Motion 提供切换反馈和键盘支持。 | 文章反馈、社区问卷和应用内调研。 | React、Motion、SVG、Radix UI |
| [功能投票列表](https://www.cult-ui.com/docs/components/feature-voting) | 受控或非受控票数状态决定排序，组合按钮提供增减票反馈；保存与防重复投票交给业务。 | 公开路线图、反馈社区和更新页面。 | React、Radix UI |
| [点赞计票列表](https://www.cult-ui.com/docs/components/vote-tally) | 受控或非受控根状态记录票数，可访问按钮更新结果，排序函数决定列表次序。 | 需求板、路线图和社区点子收集。 | React、Radix UI |
| [Agent 建议卡片堆叠](https://www.cult-ui.com/docs/components/agent-suggest-card-stack) | SVG 组织多张建议卡、进度条和操作按钮，以 React 属性切换展示状态；呈现工作流而不执行 Agent。 | AI 代码审查产品官网、Agent 工作流说明和产品导览。 | React、SVG |
| [对话气泡](https://www.cult-ui.com/docs/components/speech-bubble) | 复合内容区与 SVG 尾巴拼接气泡轮廓，cursor 装饰呈现人物或助手说话位置。 | AI 消息、导览提示和角色对话。 | React、SVG |
| [可排序列表](https://www.cult-ui.com/docs/components/sortable-list) | Motion Reorder 维护列表顺序与拖动布局，React 更新完成状态和删除结果。 | 任务、播放列表和引导清单。 | React、Motion、Radix UI、Motion Reorder |
| [代码块](https://www.cult-ui.com/docs/components/code-block) | React 切换代码标签，Motion 处理方向过渡；复制控件把当前片段写入剪贴板。 | SDK 安装指南、开发文档与营销代码示例。 | React、Motion、Clipboard API |
| [终端动画](https://www.cult-ui.com/docs/components/terminal-animation) | 受控或非受控播放状态驱动字符与输出时间线，复合命令部件组织场景；不执行 shell 命令。 | CLI 文档、安装指南和开发工具首屏。 | React、Radix UI、IntersectionObserver |
| [文件类型图标](https://www.cult-ui.com/docs/components/file-icons) | 内联 SVG 渲染不同文件标记，扩展名辅助函数把文件名称映射到对应图标。 | 文件树、安装命令和代码文档。 | React、SVG |
| [分析折线图](https://www.cult-ui.com/docs/components/analytics-chart) | SVG 路径绘制曲线、网格与数据点，指针进入数据点时定位详情卡片。 | 流量趋势、产品使用量与监控指标。 | React、SVG |
| [拖拽看板](https://www.cult-ui.com/docs/components/kanban-board) | 原生 HTML 拖放更新任务所属列，Motion layout/layoutId 连接位置变化，next/image 展示头像。 | 项目管理、问题跟踪和迭代计划。 | React、Motion、SVG、Next.js 适配、原生拖放 |
| [计时器](https://www.cult-ui.com/docs/components/timer) | useTimer 记录经过时间，格式化函数转换显示单位，复合部件组合标签、数值与状态。 | 生成进度、录音、运动和运行时长。 | React |
| [协作头像](https://www.cult-ui.com/docs/components/collab-avatar) | React 派生首字母和头像颜色，Motion 入场并读取减少动态效果偏好；在线状态由业务传入。 | 协作编辑器、白板和共享文档。 | React、Motion |
| [协作工具栏](https://www.cult-ui.com/docs/components/collab-toolbar) | 组合工具按钮、分隔线和头像插槽，data-slot 标记支持一致样式；动作由外部回调实现。 | 编辑器顶栏、设计画布和协作白板。 | React、SVG |
| [颜色选择器](https://www.cult-ui.com/docs/components/color-picker) | Popover 容器组合色相、饱和度、亮度滑块；颜色转换保持十六进制和 HSL 输入同步。 | 主题编辑器、品牌配置和设计工具。 | React、Motion、Radix UI |
| [光晕输入框](https://www.cult-ui.com/docs/components/halo-input) | Base UI 提供输入行为，Motion 处理渐变外壳与状态反馈，invalid 属性改变错误样式。 | 联系表单、个人设置和多行输入。 | React、Motion、Shader、Base UI、CSS |
| [光晕字段布局](https://www.cult-ui.com/docs/components/halo-field) | 组合 shadcn Field 原语，把标签、说明和错误插槽绑定到输入控件布局。 | 设置表单、注册和资料编辑。 | React、Radix UI |
| [光晕选择框](https://www.cult-ui.com/docs/components/halo-select) | Base UI Select 管理弹层、选择与键盘行为，Motion 编排标签和触发器加载反馈。 | 设置、筛选和模型选择。 | React、Motion、SVG、Base UI |
| [光晕开关](https://www.cult-ui.com/docs/components/halo-switch) | Base UI Switch 提供 checked 状态与语义，Motion 驱动圆形滑块，外壳形成渐变边缘。 | 通知、深色模式和功能设置。 | React、Motion、Base UI、CSS |
| [光晕分段控件](https://www.cult-ui.com/docs/components/halo-segmented) | Base UI Toggle Group 管理单选行为，Motion 弹簧移动选中滑块到活动项。 | 视图模式、计费周期和时间范围。 | React、Motion、Base UI |
| [光晕切换按钮组](https://www.cult-ui.com/docs/components/halo-toggle-group) | Base UI Toggle Group 处理选择，Motion 根据选中项布局平滑移动背景滑块。 | 列表网格、对齐和紧凑模式切换。 | React、Motion、Base UI |
| [流光边框输入框](https://www.cult-ui.com/docs/components/border-beam-input) | Base UI 提供输入行为，border-beam 包在独立外壳生成底边或全边框光带。 | AI 提问、搜索和邮件订阅输入。 | React、Base UI、border-beam |
| [光晕徽标](https://www.cult-ui.com/docs/components/halo-badge) | Motion 控制边缘和状态点动画，tabular-nums 保持计数更新时宽度稳定。 | 通知数、在线状态和 AI 任务标签。 | React、Motion、SVG |
| [光晕进度条](https://www.cult-ui.com/docs/components/halo-progress) | Base UI Progress 提供语义，Motion 弹簧更新确定进度宽度；未知进度使用循环移动条纹。 | 上传、分步表单和生成等待。 | React、Motion、Base UI |
| [光晕全局提示](https://www.cult-ui.com/docs/components/halo-toast) | 根布局挂载 Sonner toaster，helper 推送消息；自定义 rim 和关闭控件统一通知样式。 | 全局保存反馈、请求失败和可撤销操作。 | React、Motion |
| [光晕内联通知](https://www.cult-ui.com/docs/components/halo-notification) | 通知内容由 React 本地状态显示，AnimatePresence 管理挂载退出，Motion 编排图标与文字反馈。 | 页面内提示、任务消息和局部错误。 | React、Motion、Base UI |
| [灵动岛](https://www.cult-ui.com/docs/components/dynamic-island) | 复合 React 组件传递内容与尺寸状态，Motion 动画连接小型状态条和展开面板。 | 通知、计时、媒体控制和任务状态。 | React、Motion |
| [方向感知标签页](https://www.cult-ui.com/docs/components/direction-aware-tabs) | 比较新旧选项顺序得到方向，AnimatePresence 管理进入退出，测量内容高度后动画调整外壳。 | 设置面板、价格切换和功能讲解。 | React、Motion |
| [光晕标签页](https://www.cult-ui.com/docs/components/halo-tabs) | Base UI Tabs 管理选中和面板语义，CSS 过渡移动渐变指示器到当前选项。 | 仪表盘、设置和代码预览切换。 | React、Base UI、CSS |
| [渐变按钮组](https://www.cult-ui.com/docs/components/gradient-button-group) | Motion 让活动标记在按钮之间过渡，next-themes 切换亮暗主题，分层背景生成渐变质感。 | 仪表盘工具栏和应用区段切换。 | React、Motion、SVG、next-themes、CSS |
| [桌面式 Dock](https://www.cult-ui.com/docs/components/dock) | MotionValue 保存指针位置，useTransform 把距离映射为尺寸，useSpring 平滑图标宽度。 | 应用入口、作品集导航和快捷工具栏。 | React、Motion |
| [变形 Popover](https://www.cult-ui.com/docs/components/popover) | React 复合部件共享开关状态，Motion layout 过渡按钮与面板尺寸，点击外部关闭。 | 快速笔记、菜单和内联反馈。 | React、Motion |
| [弹出表单](https://www.cult-ui.com/docs/components/popover-form) | Motion layout 动画连接触发器与表单，点击外部关闭，提交状态控制成功反馈。 | 反馈、候补名单和快速联系。 | React、Motion、SVG |
| [浮动面板](https://www.cult-ui.com/docs/components/floating-panel) | 上下文共享开关状态，Motion 连接触发器和面板布局；Escape 关闭，内容由组合插槽提供。 | 快速笔记、内联反馈和工具栏操作。 | React、Motion |
| [多视图抽屉](https://www.cult-ui.com/docs/components/family-drawer) | Vaul 管理底部抽屉与手势，Motion 过渡不同视图和测量后的内容高度。 | 移动设置、账户操作和连续确认步骤。 | React、Motion、SVG、Radix UI、Vaul |
| [展开侧栏](https://www.cult-ui.com/docs/components/side-panel) | 开关状态控制侧栏宽度与内容挂载，Motion 编排展开过程，自定义 toggle 连接用户操作。 | 产品视频、了解更多和次级详情。 | React、Motion |
| [变形输入面板](https://www.cult-ui.com/docs/components/morph-surface) | 受控或非受控开关决定表面形态，Motion 连接按钮与 textarea；Escape 关闭，Cmd+Enter 提交。 | 快速反馈、笔记和内联表单。 | React、Motion、SVG |
| [可展开全屏](https://www.cult-ui.com/docs/components/expandable-screen) | 触发器和全屏面板共享 Motion layoutId，React 开关状态决定挂载哪种布局。 | 商品详情、注册表单和产品引导。 | React、Motion |
| [分步引导组件](https://www.cult-ui.com/docs/components/onboarding) | 根组件通过 Context 共享步骤状态，复合子组件根据当前步骤更新指示器、选项和提示。 | 注册、首次设置和账户个性化。 | React、Radix UI |
| [产品引导弹层](https://www.cult-ui.com/docs/components/intro-disclosure) | 响应式切换 Dialog/Drawer，步骤状态驱动内容和进度，localStorage 记录已关闭提示。 | 新用户导览和功能更新公告。 | React、Motion、SVG、Radix UI、Vaul、Next.js 适配、localStorage、媒体 |
| [展开式向导](https://www.cult-ui.com/docs/components/wizard-expandable) | 步骤状态配合校验函数限制前进，Motion 连接不同表单布局，键盘事件处理导航。 | 注册、账户设置和结算引导。 | React、Motion、Base UI、Radix UI |
| [可展开工具栏](https://www.cult-ui.com/docs/components/toolbar-expandable) | Motion 过渡工具栏与面板布局，Radix Scroll Area 承载长内容，步骤状态控制当前提示。 | 功能导览、首次引导和紧凑设置。 | React、Motion、Radix UI |
| [浮动展开按钮](https://www.cult-ui.com/docs/components/family-button) | 按钮与展开面板共享布局形态，Motion 在图标和内容容器之间执行尺寸与透明度过渡。 | 快捷创建、浮动操作和移动分享菜单。 | React、Motion |
| [拟物按钮](https://www.cult-ui.com/docs/components/neumorph-button) | 阴影与背景叠层产生凹凸质感，Motion 模拟按压，intent/size 状态选择外观与加载反馈。 | 表单提交、工具栏和触感界面。 | React、Motion、CSS |
| [触感纹理按钮](https://www.cult-ui.com/docs/components/texture-button) | CSS 边框、渐变和阴影构成表面，Radix Slot 支持 asChild，variant/size 选择按钮配置。 | 表单、对话框和仪表盘动作。 | React、Radix UI、CSS |
| [动态背景按钮](https://www.cult-ui.com/docs/components/bg-animate-button) | CSS 锥形渐变构成背景层，CVA 选择样式变体，Radix Slot 的 asChild 复用调用方元素。 | 注册、订阅和营销页面的主要操作。 | React、Radix UI、CSS |
| [流光边框按钮](https://www.cult-ui.com/docs/components/border-beam-button) | border-beam 包提供边框动效，外壳包裹 shadcn Button 并保持内部按钮交互。 | AI 输入栏、升级提示和引导流程的主要操作。 | React、border-beam |
| [金属按钮](https://www.cult-ui.com/docs/components/metal-button) | metal-fx 库渲染动态金属边缘，内层保留 shadcn Button 语义及点击行为。 | 首屏重点操作和产品发布。 | React、WebGL、Shader、metal-fx |
| [宇宙渐变按钮](https://www.cult-ui.com/docs/components/cosmic-button) | 独立渐变边框层随悬停扩张，多态 as 属性决定渲染链接还是按钮。 | 发布公告和产品首屏操作。 | React、CSS |
| [有机曲线按钮](https://www.cult-ui.com/docs/components/organic-button) | SVG 端部与中间内容拼接外形，主题变量决定颜色，Radix Slot 支持 asChild 链接。 | 营销行动按钮和导航链接。 | React、SVG、Radix UI |
| [光晕按钮](https://www.cult-ui.com/docs/components/halo-button) | 按钮外壳叠加动态渐变边缘，Motion 错开文字进入；loading 状态切换指示器与操作状态。 | 表单提交、对话框和 AI 发送操作。 | React、Motion、SVG、Base UI、CSS |
| [复制按钮](https://www.cult-ui.com/docs/components/copy-button) | 优先调用 Clipboard API，旧环境用回退复制方式；成功状态通过 Motion 切换复制与勾选图标。 | 代码片段、API Key 和分享链接。 | React、Motion、Clipboard API |
| [简洁图片卡片](https://www.cult-ui.com/docs/components/minimal-card) | 复合卡片插槽组织图片与文字，Next.js Image 处理图像尺寸和加载。 | 博客预览、商品网格和作品画廊。 | React、Next.js 适配 |
| [切角卡片](https://www.cult-ui.com/docs/components/cutout-card) | 复合卡片将切角、标记和内容分层，Motion 控制悬停时的操作显露与位移。 | 作品集、图片画廊和模板展示。 | React、Motion、SVG、Radix UI、Next.js 适配 |
| [触感纹理卡片](https://www.cult-ui.com/docs/components/texture-card) | 复合 Card 插槽组织分区，边框、内阴影与渐变模拟拟物表面，separator 分隔内容。 | 设置面板、登录、定价和数据卡片。 | React、CSS |
| [悬停展开卡片](https://www.cult-ui.com/docs/components/shift-card) | isHovered 切换内容高度目标值，Motion 插值高度，AnimatePresence 管理摘要与详情出现退出。 | 商品、团队和功能列表。 | React、Motion |
| [折角卡片](https://www.cult-ui.com/docs/components/folded-card) | 复合 React 卡片插槽分离预览、徽标和页脚，装饰图层生成折角及虚线网格。 | 模板画廊、博客索引和资源目录。 | React、SVG、Next.js 适配 |
| [立体阴影卡片](https://www.cult-ui.com/docs/components/shadow-card) | 复合卡片用多层背景与边缘叠层模拟厚度，装饰插槽加入竖排标签和网格视觉。 | 功能卡、价格方案和营销区域。 | React、Radix UI |
| [有机营销卡片](https://www.cult-ui.com/docs/components/organic-card) | 复合插槽拼接图片与 SVG 色带，可选 Next.js Link 让整卡成为链接。 | 案例、功能亮点和营销内容网格。 | React、SVG、Next.js 适配 |
| [紧凑有机卡片](https://www.cult-ui.com/docs/components/organic-card-small) | SVG 切口装饰图像边缘，Motion 控制卡片反馈并遵循减少动态效果，组合分类和日期。 | 新闻、博客和相关文章网格。 | React、Motion、SVG、Next.js 适配 |
| [光晕卡片](https://www.cult-ui.com/docs/components/halo-card) | 独立 rim 与 surface 分层显示边缘和内容，header/content/footer 插槽保留卡片组合能力。 | 推荐套餐、公告与 AI 结果面板。 | React、Motion、Base UI |
| [流光边框卡片](https://www.cult-ui.com/docs/components/border-beam-card) | border-beam 包围绕 Card 复合结构生成光带；外壳轨道、圆角和 overflow 控制光效范围。 | 推荐价格方案、活跃任务和重点公告。 | React、border-beam |
| [可展开卡片](https://www.cult-ui.com/docs/components/expandable) | 组合上下文管理展开状态，react-use-measure 测量内容，Motion 插值尺寸和细节显露。 | 活动卡、商品卡和仪表盘摘要。 | React、Motion |
| [抖色首屏](https://www.cult-ui.com/docs/components/hero-dithering) | Paper Design Dithering WebGL shader 生成点阵抖色视觉，桌面和移动布局分别提供视觉容器。 | 开发工具和产品主页首屏。 | React、SVG、WebGL、Shader、Paper Design |
| [色彩面板首屏](https://www.cult-ui.com/docs/components/hero-color-panels) | Paper Design ColorPanels shader 绘制视觉区，React 组合正文、CTA 与技术徽标。 | 产品发布页和品牌官网首屏。 | React、SVG、WebGL、Shader、Paper Design |
| [热力图首屏](https://www.cult-ui.com/docs/components/hero-heatmap) | Paper Design Heatmap WebGL shader 绘制发光热区，React 分栏布局容纳正文和按钮。 | SaaS 官网、数据产品和发布页面。 | React、SVG、WebGL、Shader、Paper Design |
| [液态金属首屏](https://www.cult-ui.com/docs/components/hero-liquid-metal) | Paper Design LiquidMetal WebGL shader 通过图形采样产生金属反射，首屏插槽组合 CTA 与徽标。 | 创意产品发布、品牌首页和活动首屏。 | React、SVG、WebGL、Shader、Paper Design |
| [静态径向渐变首屏](https://www.cult-ui.com/docs/components/hero-static-radial-gradient) | Paper Design StaticRadialGradient shader 绘制固定径向配色，React 布局组合标题、CTA 和技术徽标。 | 需要柔和背景的产品官网。 | React、SVG、WebGL、Shader、Paper Design |
| [媒体背景](https://www.cult-ui.com/docs/components/bg-media) | 媒体元素负责图像或视频播放，覆盖层调节正文对比度，React 状态连接播放控件。 | 活动页、影像作品集与媒体主导的首屏。 | React、媒体 |
| [分析产品首屏](https://www.cult-ui.com/docs/components/marketing-hero-analytics) | SVG 图表与 React 数据列表组成首屏，指针触发图表详情，日志面板模拟分析工作台。 | 分析、监控和开发工具官网。 | React、SVG |
| [代码功能区](https://www.cult-ui.com/docs/components/marketing-feature-code) | 复合区域插槽组合功能说明与代码面板，复制按钮读取片段，样式突出代码和具体功能关系。 | SDK、API 配置和开发者功能说明。 | React、Clipboard API |
| [滚动吸附功能区](https://www.cult-ui.com/docs/components/feature-sticky-section) | IntersectionObserver 记录面板进入视区，触发器滚动到对应内容，sticky 布局固定导航。 | 长页面功能讲解和开源项目展示。 | React、SVG、Radix UI、Next.js 适配、IntersectionObserver |
| [功能步骤轮播](https://www.cult-ui.com/docs/components/feature-carousel) | 步骤状态连接标题与截图，Motion 编排切换，next/image 承载响应式演示图片。 | 产品落地页、流程教学和功能导览。 | React、Motion、SVG、Next.js 适配 |
| [品牌标志轮播](https://www.cult-ui.com/docs/components/logo-carousel) | SVG 标志按列排列，Motion 错开入场与轮换，周期更新每列当前标志。 | 客户墙、合作伙伴和集成展示。 | React、Motion、SVG |
| [推文网格](https://www.cult-ui.com/docs/components/tweet-grid) | 网格或多列布局排布嵌入推文，外部 tweet 组件按 ID 获取展示数据；网络请求并非静态内容。 | 客户评价、社区和社交证明。 | React |
| [网关端点插图](https://www.cult-ui.com/docs/components/gateway-endpoint-illustration) | SVG 端点与扇出连线组成拓扑，颜色属性统一模型节点和连接线；不发送 API 请求。 | 多模型 API 网关介绍和产品官网。 | React、SVG |
| [网关路由插图](https://www.cult-ui.com/docs/components/gateway-route-illustration) | SVG 弧线把模型节点围绕网关排布，复合节点与颜色属性呈现不同路由关系。 | AI 网关、模型路由和服务说明。 | React、SVG |
| [网关汇聚插图](https://www.cult-ui.com/docs/components/gateway-svg-illustration) | SVG hub 布局连接外围线路和中心网关，通过主题颜色区分路径与节点。 | 请求流程、网关开销和延迟说明。 | React、SVG |
| [插图功能网格](https://www.cult-ui.com/docs/components/illustration-card-grid) | 网格容器排列标题和说明，内置 SVG 插图组件放入卡片视觉区，属性定制图文内容。 | 网关产品、故障转移和功能营销区。 | React、SVG |
| [多人光标插图](https://www.cult-ui.com/docs/components/illustration-cursor) | requestAnimationFrame 按帧更新 SVG 光标位置，标签跟随游标；仅模拟多人协作视觉。 | 编辑器、白板和设计工具官网。 | React、SVG |
| [评论气泡插图](https://www.cult-ui.com/docs/components/illustration-comment-bubble) | SVG 绘制头像、代码片段和评论气泡，通过布局叠加光标；不连接实时消息服务。 | 协作、代码审查和消息产品功能区。 | React、SVG |
| [流式渲染插图](https://www.cult-ui.com/docs/components/illustration-fluid-rendering) | SVG 浏览器与平台节点通过连线组合，主题颜色和图标插槽允许替换品牌与内容。 | 无头电商、CMS 和内容渲染说明。 | React、SVG |
| [部署地球插图](https://www.cult-ui.com/docs/components/illustration-globe-vercel) | SVG 地球与部署状态按时间或按钮切换，重播控件重新触发展示序列；不执行部署。 | 托管、边缘网络和部署产品介绍。 | React、SVG |
| [图表插图](https://www.cult-ui.com/docs/components/illustration-graph) | SVG 轴线和曲线路径描绘图形，强调区域与标记叠层展示异常位置。 | 监控、可观察性和分析产品官网。 | React、SVG |
| [自动插图标签页](https://www.cult-ui.com/docs/components/tabs-illustration-vercel) | 标签状态与定时进度连接，SVG 动态插图随活动项切换，用户操作可以改变当前视图。 | AI 产品首屏和功能介绍。 | React、SVG |
| [电路板插图](https://www.cult-ui.com/docs/components/circuit-board) | SVG 路径定义芯片和电路轨迹，Motion 与 CSS keyframes 让线路高亮沿路径移动。 | AI、硬件、基础设施与开发工具官网。 | React、Motion、SVG、CSS |
| [AI 工作负载插图](https://www.cult-ui.com/docs/components/fluid-ai-workloads) | SVG 定义卡片、分支连接线和节点，填充与描边属性调整主题；只说明拓扑不调度算力。 | AI 基础设施、算力定价和产品文档。 | React、SVG |
| [安全检查插图](https://www.cult-ui.com/docs/components/security-checkpoint) | React 插槽组织标题、信息和验证卡，装饰线层执行动画；不会真正验证机器人或用户权限。 | 防护产品介绍、检查中页面和营销安全区。 | React |
| [融合气泡](https://www.cult-ui.com/docs/components/merging-bubbles) | SVG 轮廓绘制相交气泡与连接部位，图标插槽和尺寸属性表现两种产品结合。 | 集成能力、伙伴公告和联合方案。 | React、SVG |
| [WebGL 地球](https://www.cult-ui.com/docs/components/globe) | COBE 在 Canvas WebGL 中绘制球体，指针拖动改变旋转参数，next-themes 提供主题配色。 | CDN 地图、部署区域、航线与全球业务。 | React、Motion、SVG、Canvas、WebGL、COBE、next-themes |
| [浏览器窗口模型](https://www.cult-ui.com/docs/components/mock-browser-window) | React 组合地址栏、侧栏与内容插槽，主题和窗口样式属性替换外壳细节。 | 应用截图、嵌入演示和文档预览。 | React、SVG |
| [iPhone 设备模型](https://www.cult-ui.com/docs/components/apple-iphone-17-pro) | React 内容插槽嵌入设备屏幕，框体颜色及灵动岛尺寸属性控制装饰结构。 | 移动应用发布页、作品集与产品案例。 | React、Motion、SVG |
| [Apple 键盘插图](https://www.cult-ui.com/docs/components/apple-keyboard) | 网格排布键帽，按压状态改变键帽外观，Tabler 图标表示媒体键功能。 | 快捷键指南、效率工具和开发工具宣传。 | React |
| [Apple Watch 模型](https://www.cult-ui.com/docs/components/apple-watch-ultra) | 局部状态驱动表盘内容，Motion 连续旋转和过渡模拟表冠与指南针响应。 | 运动、户外和可穿戴应用展示。 | React、Motion |
| [复古 Mac 模型](https://www.cult-ui.com/docs/components/mac-screen) | 响应式框体保持设备比例，屏幕插槽裁切媒体到 CRT 内部，装饰层形成复古机身。 | 复古产品演示、作品集和动图展示。 | React |
| [Pro Display XDR 模型](https://www.cult-ui.com/docs/components/apple-pro-display-xdr) | React 屏幕插槽与显示模式组成设备外壳，Motion 控制内置 macOS Dock 的反馈。 | 桌面应用发布页和产品功能演示。 | React、Motion、SVG、Base UI、Radix UI、Next.js 适配 |
| [三维图片轮播](https://www.cult-ui.com/docs/components/three-d-carousel) | CSS perspective/rotateY/translateZ 将图片放入三维环，Motion 将拖动距离映射为旋转并处理展开布局。 | 摄影、产品图片和视觉作品集。 | React、Motion、CSS |
| [悬停视频预览](https://www.cult-ui.com/docs/components/hover-video-player) | 鼠标或触屏事件控制 video 播放，按需要加载媒体；Motion 切换覆盖层，浏览器 API 提供画中画。 | 视频图库、课程封面和产品演示缩略图。 | React、Motion、Radix UI、Next.js 适配、IntersectionObserver、媒体 |
| [YouTube 视频播放器](https://www.cult-ui.com/docs/components/youtube-video-player) | 点击后挂载 YouTube iframe，Motion 过渡缩略图与模态面板，关闭时卸载媒体。 | 教程、产品演示和视频评价。 | React、Motion、媒体 |
| [加载提示轮播](https://www.cult-ui.com/docs/components/loading-carousel) | Embla 管理轮播位置和导航，定时器控制自动前进，Motion 呈现进度与内容过渡。 | 加载屏、首次引导和长任务等待。 | React、Motion、Embla、Next.js 适配 |
| [网格光束](https://www.cult-ui.com/docs/components/grid-beam) | Canvas 按帧绘制网格光束，useGridBeam 抽出渲染逻辑；SVG 分隔器可组合页面边缘。 | 价格表、功能网格和首屏背景。 | React、SVG、Canvas |
| [分形点阵背景](https://www.cult-ui.com/docs/components/bg-animated-fractal-grid) | Canvas 绘制网格点，以指针距离改变波动和光晕；噪声叠层丰富背景。 | 产品首屏、功能区域和交互背景。 | React、Motion、SVG、Canvas |
| [Canvas 分形网格](https://www.cult-ui.com/docs/components/canvas-fractal-grid) | Canvas 按帧绘制点阵与噪声，Motion 连接交互状态；质量预设调节绘制密度和效果。 | 首屏背景、产品页面和创意交互区。 | React、Motion、SVG、Canvas |
| [条纹网格背景](https://www.cult-ui.com/docs/components/stripe-bg-guides) | 按列构建背景轨迹，Motion 根据方向、随机延迟和 easing 沿网格移动亮段。 | 首屏、营销功能区和文档页头。 | React、Motion |
| [镜头模糊着色器](https://www.cult-ui.com/docs/components/shader-lens-blur) | Three.js 创建 WebGL 场景，shader 读取指针与时间参数，进行颜色混合、模糊和折射采样。 | 创意作品集、产品背景和交互首屏。 | React、Motion、Canvas、WebGL、Shader、Three.js、next-themes |
| [SVG 几何形状](https://www.cult-ui.com/docs/components/svg-shapes) | 静态 SVG paths/lines 组成几何轮廓，currentColor 继承文本颜色并允许缩放。 | 首屏艺术、背景和装饰边框。 | React、SVG |
| [动态 SVG 几何](https://www.cult-ui.com/docs/components/svg-shapes-animated) | Motion 连接 SVG 路径长度与视区状态，逐步绘制描边，并响应减少动态效果偏好。 | 滚动叙事、页面背景和几何首屏。 | React、Motion、SVG |
| [SVG 分隔带](https://www.cult-ui.com/docs/components/svg-bands) | SVG 路径定义不同边带轮廓，flip 属性改变朝向，颜色跟随当前主题。 | 首屏下沿、章节分隔和页脚装饰。 | React、SVG |
| [纹理覆盖层](https://www.cult-ui.com/docs/components/texture-overlay) | 纯 CSS gradients 生成重复图案，透明度和图案变体控制纹理叠加程度。 | 卡片、首屏背景和章节分区。 | React、CSS |
| [扭曲玻璃分隔](https://www.cult-ui.com/docs/components/distorted-glass) | SVG feTurbulence 生成分形噪声，feDisplacementMap 用噪声偏移背景像素形成折射。 | 吸顶页头下沿和页面分区过渡。 | React、SVG |
| [纹理背景容器](https://www.cult-ui.com/docs/components/bg-image-texture) | 独立背景层承载纹理图片，通过透明度混合到内容容器且保持正文层独立。 | 卡片表面、首屏背景和报价区。 | React |
| [边缘渐进模糊](https://www.cult-ui.com/docs/components/edge-blur) | 叠加多个 backdrop-filter 图层，mask-image 决定各层覆盖范围和渐进模糊强度。 | 吸顶导航、底部工具栏和长滚动页面。 | React、CSS |
| [抖色图片](https://www.cult-ui.com/docs/components/dither-image) | 包装 next/image，以 dither-plugin 的 Tailwind 工具应用 CSS Bayer 图案，遮罩控制受影响区域。 | 编辑照片、作品集网格和复古首屏。 | React、SVG、Next.js 适配、CSS、媒体 |
| [长虹玻璃效果](https://www.cult-ui.com/docs/components/fluted-glass) | Paper Design FlutedGlass WebGL 着色器按肋条方向与参数采样图片，形成扭曲和玻璃纹理。 | 视觉首屏、产品图片和分区背景。 | React、WebGL、Shader、Paper Design |
| [文字进入动画](https://www.cult-ui.com/docs/components/text-animate) | 字符或单词拆成 motion.span，容器 staggerChildren 设置先后次序，variants 控制位移和透明度。 | 首屏标题、章节标题和公告横幅。 | React、Motion |
| [打字机文字](https://www.cult-ui.com/docs/components/typewriter) | React 时间状态推进字符和短语索引，Motion 显示键入与闪烁光标反馈。 | 首屏标语、AI 产品介绍和欢迎文字。 | React、Motion |
| [滚动数字](https://www.cult-ui.com/docs/components/rolling-number) | Motion 弹簧将旧值插值到新值，格式函数把连续数值转换成精度、货币或自定义文字。 | 指标、价格、计数与实时统计。 | React、Motion |
| [逐字像素标题](https://www.cult-ui.com/docs/components/pixel-heading-character) | 逐字符拆分标题并按动画模式切换 Geist pixel font-family，产生像素字形变化。 | 开发工具首屏、复古视觉和品牌标题。 | React、Geist 字体、CSS |
| [逐词像素标题](https://www.cult-ui.com/docs/components/pixel-heading-word) | 按词拆分标题，指针悬停改变该词 font-family；无需额外动画库。 | 产品标题、章节标题和文字标志。 | React、Geist 字体、CSS |
| [像素关键词段落](https://www.cult-ui.com/docs/components/pixel-paragraph-words) | 按词匹配内容，将关键词包装进 Geist 像素字体 span，正文保持普通字体。 | 首屏文案、产品标语和功能关键词。 | React、Geist 字体 |
| [反向像素段落](https://www.cult-ui.com/docs/components/pixel-paragraph-words-inverse) | 匹配选定词语，将其 font-family 改为 sans 或 mono，其余正文保留 Geist 像素字体。 | 介绍文字、短标语和重点提示。 | React、Geist 字体、CSS |
| [GIF 文字](https://www.cult-ui.com/docs/components/text-gif) | background-clip:text 让 GIF 只在文字轮廓内可见，颜色回退与尺寸字重属性控制显示。 | 活动宣传、趣味品牌标题和视觉首屏。 | React、SVG、Next.js 适配 |
| [渐变标题](https://www.cult-ui.com/docs/components/gradient-heading) | bg-clip-text 把 CSS 渐变裁入文字，CVA 管理预设外观，asChild 允许复用语义元素。 | 产品首屏和营销章节标题。 | React、Radix UI、CSS |
| [拟物眉题标签](https://www.cult-ui.com/docs/components/neumorph-eyebrow) | CSS 内阴影构造凹陷表面，颜色 intent 与文本插槽生成标题上方的小型标签。 | 发布标签、产品分类和章节眉题。 | React、CSS |
| [LED 灯板](https://www.cult-ui.com/docs/components/lightboard) | Canvas 把字符字体映射成亮暗网格，逐帧移动绘制窗口，指针输入改变灯点。 | 状态横幅、文字滚动条和趣味首屏。 | React、Canvas |
| [手绘箭头](https://www.cult-ui.com/docs/components/squiggle-arrow) | SVG path 定义不同手绘曲线，variant 和方向参数选择形态并调整箭头位置。 | 截图标注、CTA 指引和产品导览。 | React、SVG |

### 3 个有效补充注册项

这三项在 registry/ui.ts 中有效注册，但固定版本没有独立官方文档页面，因而单列。

| 补充项与固定源码 | 机制 | 场景 |
| --- | --- | --- |
| [动态径向渐变](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/bg-animated-gradient.tsx) | useAnimation 将渐变色点和中心坐标转换为 background 关键帧，Motion 以 reverse 模式无限循环。 | 产品背景、品牌视觉和柔和动态区域。 |
| [基础选择框](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/base-select.tsx) | Select Root/Trigger/Popup/Item 组合选择逻辑与弹层定位，Hugeicons 绘制箭头和选中标记。 | 设置和筛选下拉框，以及其他组件的基础依赖。 |
| [基础提示框](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/base-tooltip.tsx) | Tooltip Provider 统一延迟，Trigger 与 Popup 处理锚点提示，Radix Slot 支持 asChild 复用按钮。 | 图标按钮说明、工具栏提示和内部组件依赖。 |

### 未注册源码附录

- expandable-card.tsx
- glow-button.tsx
- shader-shape-lens-blur copy.tsx
- type-animate.tsx

它们存在于上游源码目录，未作为 registry:ui 项进入固定版本主目录；不凭文件名将其追加为官方文档组件。[来源与排除依据](full-catalog-audit.json)

表中的 AI 分类是界面组织方式。模型推理、流式协议、Agent 工具调用、鉴权、计费与数据保存均不是这些 UI 名称自动带来的能力。完整 AI 应用模式属于独立的 AI SDK Agents。[上游说明](https://github.com/nolly-studio/cult-ui#built-with-cult-ui)
## 架构与数据流

### 1. 源码分发

Cult UI 使用 shadcn registry 分发组件。CLI 读取组件条目及其文件/依赖描述，把源码写入消费项目，并按条目处理依赖。之后运行的是本地组件和实际依赖，不需要统一的 Cult UI 云端运行时。[官方安装说明](https://www.cult-ui.com/docs/installation)、[shadcn registry 机制](https://ui.shadcn.com/docs/registry)

~~~bash
npx shadcn@latest add https://www.cult-ui.com/r/shift-card.json
~~~

也可以在 components.json 中定义 @cult-ui 命名空间后按名字安装。该命令用于说明上游的接入方式，本地研究演示没有通过它安装所有组件。

固定源码的 [registry/index.ts](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/index.ts) 将 UI 与 examples 条目汇总；[shift-card 生成 JSON](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/public/registry/styles/default/shift-card.json) 包含名称、文件内容和条目类型。此旧生成文件中的 dependencies 是空字符串，不能据此断言组件不需要 Motion；对应源码实际导入 motion/react。在线 /r 路径与仓库中旧生成路径应分别核验。

**研究判断**：源码分发降低定制门槛，但复制后更新需要本地 diff、回归检查与合并；本地改动不会自动被上游版本覆盖或修正。

### 2. 界面运行

~~~text
鼠标 / 键盘 / 点击 / 拖放
          ↓
React state：展开、选择、任务归属
MotionValue：指针位置、距离、连续数值
          ↓
motion props / variants / AnimatePresence / CSS 动画
          ↓
浏览器布局与绘制
          ↑
Tailwind utility + CSS 主题变量 + 局部样式
~~~

React 处理业务状态和 DOM 结构。Motion 将目标值转换为连续运动，管理进入退出和布局过渡。Tailwind 与 shadcn 主题 token 组织颜色、圆角和间距；部分新组件也包含内联设计值，不能理解为所有尺寸和颜色都已变量化。不同组件有不同依赖，例如 react-use-measure、next/image 和 border-beam。

MotionValue 可在更新样式时绕过 React 每帧重新渲染，适合指针跟随；这不消除浏览器绘制成本，也不意味着所有动画都自动由 GPU 处理。[MotionValue 官方文档](https://motion.dev/docs/react-motion-value)

## 六种机制的源码证据

所有源码链接固定到同一研究 commit。

### Shift Card：离散状态驱动高度动画

[shift-card.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/shift-card.tsx) 用 isHovered 表示卡片是否展开；内容区域高度在 38 与 194 之间变化，transition 使用 duration、delay 和 ease。AnimatePresence 包裹条件内容；外层还有进入、悬停缩放与点击/tap 处理。

**实验目的**：观察摘要与详情之间的过渡。研究复现不沿用固定尺寸和复杂阴影，必要操作采用可点击的真实控件，便于键盘和触屏使用。

**取舍判断**：height 动画会引起布局变化。动态文本长度和小屏尺寸需要重新测量，固定高度可能裁切内容。

### Text Animate：拆分文字与逐项延时

[text-animate.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/text-animate.tsx) 用 Array.from(text) 得到字符数组，把每个字符放入 motion.span；某些类型再按词分组。容器 variants 中的 staggerChildren 与 delayChildren 决定时间顺序，子节点控制透明度、位移、缩放等。

**实验目的**：通过重播观察文字先后出现；这是 DOM 与时间编排，不涉及模型生成。

**取舍判断**：长文本会产生大量节点。Array.from 按码点拆分，对复杂 emoji 或组合字符不等同于完整字素分割。正式产品应保持辅助技术能读取完整文本，并在减少动态效果模式中直接显示内容。

### Dock：距离映射与弹簧

[dock.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/dock.tsx) 使用 Context 共享 mouseX、hovered 等信息；图标中心通过 getBoundingClientRect 计算。useTransform 把 [-150, 0, 150] 的指针距离映射到 [40, 80, 40] 的宽度，useSpring 对变化平滑处理。点击还有上下弹跳和活动指示。

**实验目的**：展示“距离越近尺寸越大”的连续关系。本地只研究主要放大机制，不复现上游全部展开与跳动逻辑。

**取舍判断**：应保持坐标系一致；上游 pageX 与 bounds.x 的组合在横向滚动环境中值得额外检查。尺寸变化会影响布局；触屏无持续悬停，功能入口仍应能够直接点击。

### Direction Aware Tabs：方向与退出时序

[direction-aware-tabs.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/direction-aware-tabs.tsx) 比较新旧 tab ID 的大小得到 +1 或 -1。内容初始 x 为 300 × direction，退出 x 为 -300 × direction；AnimatePresence 的 custom 传递方向，layoutId 将选中标记在不同选项间连起来。react-use-measure 提供内容高度，外壳随内容变化。

**实验目的**：让选项顺序与内容运动方向一致。本地以选项索引计算方向并简化测量逻辑。

**取舍判断**：如果业务 ID 与视觉顺序不一致，直接比较 ID 会给出错误方向；应比较数组索引。正式组件还需要 ARIA tabs 语义、焦点控制与键盘切换。

### Border Beam：封装依赖与本地 CSS 复现

[border-beam-card.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/border-beam-card.tsx) 从 border-beam 导入 BorderBeam 与类型，包装 shadcn Card 的复合 API，并调整外壳、1px 轨道、内外圆角与 overflow，以呈现光带与泛光。

**事实边界**：此固定版本的 Cult UI 文件主要是依赖封装；不能把本地 CSS 写法当作上游 border-beam 包的完整内部实现，也不能宣称 Cult UI 当前存在独立 border-beam.tsx。

**实验目的**：本地采用 CSS 渐变和旋转表现“装饰层运动、内容层固定”的视觉机制，明确标注为简化复现。

**取舍判断**：持续装饰应提供暂停或减少动态效果。溢出、圆角、阴影和背景对比决定光带是否被裁切或干扰阅读。

### Kanban：数据迁移与布局动画

[kanban-board.tsx](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/apps/www/registry/default/ui/kanban-board.tsx) 以 ColumnData、CardData 和 DragState 组织数据；原生 draggable、onDragStart、onDragOver 和 onDrop 管理拖放，Motion 的 layout 与 layoutId 展示卡片重新布局。组件导入 next/image 并使用 useReducedMotion；该 hook 在所读卡片代码中用于消除逐项 delay，没有直接清除所有位移和弹簧。

**实验目的**：把任务从原列移除并加入目标列，观察数量和位置一起变化；本地为内存数据，并提供拖放之外的移动入口。

**取舍判断**：移动操作必须防止任务丢失和重复。原生 HTML 拖放在触屏和键盘操作上需要替代控件。Vite 无 next/image，需要换普通图像或本地头像展示；正式业务还需要持久化、权限校验和并发更新策略。

## 使用场景与工程判断

| 场景 | 适配度判断 | 适合借鉴的能力 | 接入时要解决的问题 |
| --- | --- | --- | --- |
| 产品官网 / 作品集 | 高 | 标题、卡片、Hero、媒体展示 | 控制动画密度，移动端读取顺序 |
| SaaS / AI 产品 | 高 | 输入、结果、面板、导航、反馈 | 接入业务状态、鉴权与实际 AI 后端 |
| 快速原型 | 高 | 可修改源码与组合式组件 | 后续维护、依赖与升级策略 |
| 管理后台 | 局部适用 | Tabs、Kanban、通知、图表 | 高频操作可访问性、真实大数据性能 |
| 内容密集或低性能设备 | 谨慎选择 | 静态外观、少量状态反馈 | 降低节点、滤镜、持续装饰和尺寸动画 |

以上为研究判断。组件能展示任务板，不等于内置任务管理系统；能展示投票，不等于自带票据持久化或防重复投票；能展示协作头像，不等于内置多人同步服务。

## 权限、性能与减少动态效果

**权限边界**：静态展示没有用户账户、模型密钥、服务器权限或远端写入。生产应用的显示/隐藏控件仅是 UI 行为，后端仍必须校验数据访问和修改权限。通过 shadcn CLI 安装源码与依赖时，应检查实际变更、包来源和框架相关导入。

**性能边界**：优先对小区域使用 transform 与 opacity；height、width、复杂阴影、blur 和多层渐变仍可能触发布局或绘制。MotionValue 减少 React 渲染，并不能代替目标设备上的 Performance 测量。本研究不提供 FPS、内存、低端设备、SSR 或全组件兼容性结论。

**减少动态效果边界**：遵循系统 prefers-reduced-motion 时，位移、缩放、持续光带及弹跳应单独停用或替换成静态状态。MotionConfig 或 useReducedMotion 只能覆盖相关 Motion 配置，CSS keyframes 和第三方动画还需要单独处理。[Motion 官方说明](https://motion.dev/docs/react-use-reduced-motion)

**本地实现**：motion-preference.ts 用 useSyncExternalStore 订阅 matchMedia 的 change 事件，将系统偏好同步到根 MotionConfig 与六个实验；样式表也包含 prefers-reduced-motion 媒体查询。额外订阅解决所锁定 Motion 版本的 useReducedMotion 只读取初始化值的边界。Dock 在减少动效偏好下使用固定尺寸，Border Beam 停止旋转，文字与标签切换取消位移或时长。页面没有专门的全局动效开关；光带播放/暂停只作用于该实验。上述为源码确认；本次浏览器的系统偏好为 false，未更改用户系统设置实测减少动效。

**可访问性边界**：关键动作使用 button 或 form 控件、可见焦点和可理解的文本；拖放应有键盘/触屏替代入口。研究页面的手动检查不能替代完整屏幕阅读器与 WCAG 验收。

## 实验记录

首轮记录针对 28 项选集和六个研究实验，作为历史证据保留；本轮全量目录与真实官方示例的运行验收另记。

| 日期 | 版本 / 环境 | 实验 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 2026-10-03 | 上游 HEAD 67a66c6ac1cd240914ba688a907611b3437a7a2b | 实时只读 git ls-remote | 已获取 HEAD，并以 GitHub API/raw 文件复核 | 固定 commit 与源码链接 |
| 2026-10-03 | 同一 commit | 读取 MIT 许可及六种代表机制源码 | 已确认版权、依赖、状态与动效机制 | 本笔记“六种机制的源码证据” |
| 2026-10-03 | 同一 commit，全量目录 | 134 个文档组件与 3 个补充项的逐项机制、依赖和场景 | 137 条人工中文机制齐全；实际 TS import 闭包零未解析本地导入 | mechanisms-audit.json、mechanism-copy.tsv、build-mechanisms-audit.mjs |
| 2026-10-03 | 本地 React / Vite 研究页 | TypeScript、Vite 与总站构建 | 已通过；根 npm run build 自动构建子项目并聚合 | web 构建命令包含 tsc --noEmit 与 vite build |
| 2026-10-03 | 根项目 | catalog 检查与脚本测试 | npm run check 已通过，npm test 的 9 个测试已通过 | 根验证记录 |
| 2026-10-03 | 本地 Node 预览服务 | 总站与子路径预览 | 默认 4173 被占用；以 node scripts/serve.mjs --port 4187 启动 | [实际预览地址](http://localhost:4187/projects/001-cult-ui/) |
| 2026-10-03 | Codex 本地浏览器，1440 × 1000 | Shift 展开/收起、文字预设/重播、Dock 选择、Tabs 切换、Beam 暂停、Kanban 按钮移动 | 全部通过；Tabs ArrowRight 从制作切到发布，移动后列计数同步变化 | [交互截图](../assets/interactions.jpg) |
| 2026-10-03 | 同一浏览器 | 原生 Kanban 拖放 | 将“打磨首屏文案”拖入进行中，列计数从 2/1/1 变为 1/2/1，无重复或丢失 | 浏览器任务列文本观察 |
| 2026-10-03 | 同一浏览器 | 目录筛选、搜索、详情与代码复制 | 营销筛选 6 项；Motion 搜索 13 项；无结果时可重置；展开目录 28 项；详情来源固定 SHA，Escape 关闭；复制显示已复制 | DOM 状态与上游链接检查 |
| 2026-10-03 | 1440 × 1000 / 390 × 844 | 深浅主题、手机布局和导航 | 主题切换正常；手机无横向溢出，菜单打开/跳转收起正常 | [桌面](../assets/preview.jpg)、[手机](../assets/mobile-preview.jpg)、[原理](../assets/principles.jpg) |
| 2026-10-03 | 浏览器开发日志 / 代码审查 | 控制台与减少动效 | 无控制台 error/warn；系统减少动效当前 false，仅核查 hook、MotionConfig 与媒体查询，未切换系统设置实测 | 浏览器日志与 web/src 源码 |

## 已有证据支持的结论

- Cult UI 是源码分发式 React 组件集合，主要价值来自可修改的外观和交互实现。
- 交互动效采用 React 状态、Motion 与 CSS；另有静态 SVG、Canvas 和 WebGL 渲染，组件名称不代表额外智能能力。
- 当前代表组件间存在依赖和框架差异，不能把“能复制源码”理解为任意项目零适配。
- 全量 137 项目录与机制已由源码证据覆盖；真实示例接入、性能、无障碍与长期维护仍需按验证结果分别判断。

## 待验证问题与局限

全量预览采用官方示例和最小框架适配；每个示例的构建、渲染与交互结果由本轮验收补充。尚未完成 SSR、完整浏览器兼容性或无障碍审计。未核验第三方 border-beam 内部算法，未测量真实业务规模下的动画性能。在线目录和源码以后可能继续更新，后续研究应重新记录 commit 和验证时间。

## 许可证原文

以下保留所研究上游版本 LICENSE.md 的原文，版权行按文件本身记录，不用 README 的品牌署名替换。[固定版本许可证](https://github.com/nolly-studio/cult-ui/blob/67a66c6ac1cd240914ba688a907611b3437a7a2b/LICENSE.md)

~~~text
MIT License

Copyright (c) 2023 Jordan-Gilliam

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
~~~

第三方运行依赖仍适用各自许可证；上述 MIT 文本只记录 Cult UI 上游授权。


## 本轮全量展示验收

2026-10-03，在固定 commit 67a66c6ac1cd240914ba688a907611b3437a7a2b 基础上完成本地全量接入。

- 完整性脚本 `web/scripts/check-catalog.mjs` 校验 137 项（134 文档 + 3 补充注册项）均有独立说明、机制、场景、依赖及可达预览；136 个非别名官方示例和 2 个基础 API 接入示例全部关联，17 个旧示例别名不重复计数。
- 通过 Codex 浏览器逐项打开全部 138 个示例，初始渲染结果为 138 ready / 0 error。修正子路径资源问题后复验 12 项，卡片、抖色图片、轮播、视频封面、设备模型、Heatmap 和 Liquid Metal 素材均可加载。[逐项记录](runtime-preview-audit.json)
- 桌面 1440 × 1000 与手机 390 × 844 的目录无横向溢出；展开 137 项、14 项背景分类、搜索与重置、详情原理与源码页、安装命令复制、深浅主题和手机导航通过。Base Select 从“灵感整理”切至“制作中”，Halo Switch 使用空格键从 on 切至 off。
- TypeScript、Vite 多入口构建、总站聚合、目录检查及根 9 个测试通过。主页面按需打开一个隔离预览，WebGL 图形不在目录中同时运行。
- 原版组件使用必要的 Next 图片与路由适配、真实仓库素材和 Geist 字体。为 React 19 peer 兼容升级 Embla React / Autoplay 至 8.6.0、React Wrap Balancer 至 1.1.1；源码仍固定于研究 commit。

上述为全量初始渲染与代表性交互验证，未穷举每个组件全部配置和交互，也未作完整设备性能、SSR、屏幕阅读器或跨浏览器认证。首轮减少动效的系统偏好未切换，本轮亦未修改用户系统设置。
