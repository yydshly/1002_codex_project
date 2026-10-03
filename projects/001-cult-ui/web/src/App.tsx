import { useEffect, useState, type ComponentType } from "react";
import CatalogDialog, {
  localPreviewCount,
  variantCount,
} from "./components/CatalogDialog";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  GitFork as Github,
  Layers,
  Menu,
  Moon,
  MousePointer2,
  PackageOpen,
  PanelTop,
  Search,
  Sparkles,
  Sun,
  Terminal,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  capabilities,
  categories,
  sourceInfo,
  catalogCounts,
  deprecatedAliases,
  unregisteredSourceFiles,
  type Capability,
  type Category,
} from "./data";
import {
  ShiftCardDemo,
  TextAnimateDemo,
  DockDemo,
  TabsDemo,
  BorderBeamDemo,
  KanbanDemo,
} from "./components/Demos";

const demos: Record<string, ComponentType> = {
  shift: ShiftCardDemo,
  text: TextAnimateDemo,
  dock: DockDemo,
  tabs: TabsDemo,
  beam: BorderBeamDemo,
  kanban: KanbanDemo,
};
const demoDescriptions = [
  {
    id: "shift",
    title: "卡片，也可以有下一幕",
    english: "Shift Card",
    tag: "状态 · 布局过渡",
    tip: "点击展开按钮，查看内容与布局的变化。",
  },
  {
    id: "text",
    title: "让文字有自己的节奏",
    english: "Text Animate",
    tag: "Variants · 错峰",
    tip: "切换动画预设，再播放一次。",
  },
  {
    id: "dock",
    title: "跟着指针，轻轻放大",
    english: "MacOS Dock",
    tag: "MotionValue · 弹簧",
    tip: "移入图标，或用 Tab 键逐个聚焦。",
  },
  {
    id: "tabs",
    title: "切换方向，也有反馈",
    english: "Direction Aware Tabs",
    tag: "方向 · 进入退出",
    tip: "切换标签，观察内容滑入的方向。",
  },
  {
    id: "beam",
    title: "一束光，勾勒出边界",
    english: "Border Beam",
    tag: "CSS 机制示意",
    tip: "暂停流光，理解渐变与遮罩的组合。",
  },
  {
    id: "kanban",
    title: "任务流转，保持连贯",
    english: "Kanban Board",
    tag: "拖放 · Layout",
    tip: "拖动任务，或用卡片上的按钮移动。",
  },
];
const mechanisms = [
  {
    id: "registry",
    title: "源码分发",
    icon: PackageOpen,
    subtitle: "安装的是源码，接下来由你掌控。",
    description:
      "注册表 JSON 描述组件文件、npm 依赖和其他组件依赖。shadcn CLI 读取这些信息，按照项目配置将源码写到本地，并安装所需依赖。",
    points: [
      "组件文件进入你的代码仓库",
      "按需安装对应依赖",
      "更新时主动拉取并审查差异",
    ],
    file: "terminal",
    code: "# 在已初始化 shadcn 的 React 项目中运行\nnpx shadcn@latest add https://www.cult-ui.com/r/shift-card.json\n\n# 组件源码写入本地项目\ncomponents/ui/shift-card.tsx\n\n# 后续直接修改这个文件",
  },
  {
    id: "react",
    title: "状态与样式",
    icon: Blocks,
    subtitle: "把交互表达成状态，把外观交给主题。",
    description:
      "React 保存展开、悬停、选择等状态，组件根据状态渲染内容。Tailwind 负责布局和外观，shadcn 主题变量让配色与暗色模式融入你的项目。",
    points: [
      "事件改变 React 状态",
      "Props 定义内容和行为",
      "主题变量统一配色与圆角",
    ],
    file: "state-example.tsx · 机制示意",
    code: 'const [expanded, setExpanded] = useState(false)\n\n<button onClick={() => setExpanded(!expanded)}>\n  {expanded ? "收起" : "展开"}\n</button>\n\n<div className="bg-card text-card-foreground">\n  {expanded && <Detail />}\n</div>',
  },
  {
    id: "motion",
    title: "动画与过渡",
    icon: Zap,
    subtitle: "状态跳到了终点，动画补上中间的过程。",
    description:
      "Motion 为位置、尺寸与透明度生成连续过渡。弹簧让移动有惯性，AnimatePresence 管理退出，layoutId 将不同状态中的同一元素连接起来。",
    points: [
      "Variants 组织不同动画状态",
      "Stagger 控制元素出现节奏",
      "Layout / layoutId 处理布局变化",
    ],
    file: "motion-example.tsx · 机制示意",
    code: '<motion.div\n  layout\n  animate={{ opacity: 1, y: expanded ? 0 : 12 }}\n  transition={{ type: "spring", stiffness: 220 }}\n>\n  <AnimatePresence>\n    {expanded && <motion.div exit={{ opacity: 0 }} />}\n  </AnimatePresence>\n</motion.div>',
  },
  {
    id: "rendering",
    title: "图形与渲染",
    icon: Layers,
    subtitle: "有些效果来自像素计算与浏览器合成。",
    description:
      "玻璃与纹理组件结合 SVG 滤镜、遮罩和 CSS 混合；分形网格可以逐帧绘制 Canvas。液态金属等首屏通过 Paper Design 着色器渲染，地球使用 COBE。React 负责参数与生命周期，图形库负责画出像素。",
    points: [
      "CSS / SVG 滤镜、遮罩和混合层",
      "Canvas / WebGL 按帧渲染图形",
      "按需加载并释放画布与事件资源",
    ],
    file: "shader-example.tsx · 机制示意",
    code: 'import { LiquidMetal } from "@paper-design/shaders-react"\n\n// 原版 Hero Liquid Metal 将这些参数交给图形库\n<LiquidMetal\n  colorBack="#f5f5f5"\n  colorTint="#b7b7b7"\n  speed={0.4}\n  distortion={0.1}\n/>\n\n// 位移弹簧与 GPU 着色器解决不同层面的视觉变化',
  },
];
const useCases = [
  {
    icon: PanelTop,
    name: "产品官网与落地页",
    when: "做官网、产品发布页或个人作品集，需要有辨识度的展示片段时。",
    description: "从首屏、标题、产品卡片到设备模型，快速组合一段完整的产品表达。",
    tags: ["Hero 首屏", "文字动效", "设备模型"],
    suitable: "适合个人开发者、设计师与产品小团队",
  },
  {
    icon: Sparkles,
    name: "AI 与 SaaS 应用",
    when: "已有聊天或 SaaS 业务，准备打磨输入、结果展示和等待反馈时。",
    description: "组合提示词输入、结果卡片、进度与通知，把已有业务状态表达清楚。",
    tags: ["Prompt 输入", "建议卡片", "侧边面板"],
    suitable: "适合有业务接口的前端与 AI 产品开发者",
  },
  {
    icon: Workflow,
    name: "个人工具与应用工作台",
    when: "做管理后台、编辑器或个人工具，需要稳定的操作路径时。",
    description: "用表单、标签页、抽屉、看板和图表，组织设置、任务与信息。",
    tags: ["表单控件", "拖拽看板", "Tabs / Drawer"],
    suitable: "适合应用开发者与内部工具团队",
  },
  {
    icon: MousePointer2,
    name: "原型与交互研究",
    when: "想尝试一种交互、学习动画，或改善已有 shadcn 页面的细节时。",
    description: "先体验原版，再阅读状态、布局和动画的实现，挑一块改成自己的用法。",
    tags: ["展开卡片", "Dock", "引导流程"],
    suitable: "适合学习者、原型作者与现有 React 项目",
  },
];

const capabilityDirections = [
  {
    icon: Sparkles,
    name: "AI 输入与输出",
    categories: ["AI 输入", "AI 生成界面"],
    description: "组织提示词、附件、选项、消息和代码，把输入与结果呈现清楚。",
    examples: "Prompt Composer · Prompt Library · Choice Poll · Code Block",
  },
  {
    icon: Workflow,
    name: "应用操作与流程",
    categories: ["应用与工作台", "表单控件", "反馈与状态", "导航与浮层", "引导与流程"],
    description: "用表单、导航、状态反馈和步骤引导，连接用户完成任务的过程。",
    examples: "Kanban · Halo 表单 / 进度 · Tabs · Family Drawer",
  },
  {
    icon: MousePointer2,
    name: "按钮与信息卡片",
    categories: ["按钮", "卡片"],
    description: "让操作入口更清晰，让摘要、详情与次级动作有自然的展示层次。",
    examples: "Shift Card · Cutout Card · Border Beam Button · Halo Card",
  },
  {
    icon: PanelTop,
    name: "产品与内容展示",
    categories: ["落地页", "媒体与设备模型", "文字排版"],
    description: "组合首屏、文字节奏、设备外框和媒体，让产品更容易被看懂。",
    examples: "Shader Hero · Browser Window · 3D Carousel · Text Animate",
  },
  {
    icon: Layers,
    name: "图形与视觉背景",
    categories: ["插画", "背景与视觉效果"],
    description: "以拓扑插画解释概念，用光束、玻璃、点阵和地球建立视觉氛围。",
    examples: "SVG 插画 · Grid Beam · Fluted Glass · Globe",
  },
  {
    icon: PackageOpen,
    name: "基础控件与背景补充",
    categories: ["补充注册项"],
    description: "保留官方注册表中的基础选择框、提示框和动态渐变，便于继续组合。",
    examples: "base-select · base-tooltip · bg-animated-gradient",
  },
];

const personalValues = [
  {
    title: "更快开始一段界面",
    description: "下次遇到输入、导航、卡片或首屏需求，先找已有实现，再把时间用在自己的产品内容与业务上。",
  },
  {
    title: "源码可以自己改",
    description: "拿到本地 .tsx 文件后，能调整结构、文案、样式和行为，让组件适合自己的应用。",
  },
  {
    title: "把动效变成可理解的规律",
    description: "从距离映射、状态切换、布局过渡和图形渲染中学习方法，之后能独立组合新的交互。",
  },
  {
    title: "积累自己的组件资产",
    description: "把验证过、改造过的组件放进自己的代码库，在后续项目复用，并按需要维护与更新。",
  },
];

function CopyButton({
  text,
  label = "复制代码",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <button
      className="copy-button"
      type="button"
      onClick={copy}
      aria-label={label}
    >
      {status === "copied" ? <Check size={15} /> : <Copy size={15} />}
      <span aria-live="polite">
        {status === "copied"
          ? "已复制"
          : status === "failed"
            ? "请选择文字复制"
            : "复制"}
      </span>
    </button>
  );
}

export default function App() {
  const [category, setCategory] = useState<Category>("全部");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Capability | null>(null);
  const [mechanism, setMechanism] = useState(0);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries.find((entry) => entry.isIntersecting);
        if (first) setActiveSection(first.target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    document
      .querySelectorAll("main section[id]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const filtered = capabilities.filter(
    (item) =>
      (category === "全部" || item.category === category) &&
      `${item.name} ${item.english} ${item.description} ${item.mechanism} ${item.tags?.join(" ")} ${item.dependencies?.join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const visible =
    showAll || category !== "全部" || query ? filtered : filtered.slice(0, 16);
  const currentMechanism = mechanisms[mechanism];
  const navigationList = filtered.some((item) => item.id === selected?.id)
    ? filtered
    : capabilities;
  const nav = [
    { id: "overview", label: "认识 Cult UI", icon: Layers },
    { id: "understanding", label: "理解与能力地图", icon: BookOpen },
    { id: "capabilities", label: "全量组件", icon: Blocks },
    { id: "demos", label: "原理实验", icon: MousePointer2 },
    { id: "principles", label: "底层原理", icon: Workflow },
    { id: "scenarios", label: "使用与个人价值", icon: PanelTop },
  ];
  const inspectDemo = (id: string) =>
    setSelected(capabilities.find((item) => item.demo === id) ?? null);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#overview">
        跳到主要内容
      </a>
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={() => setMenuOpen(false)}
        >
          <span className="brand-mark" aria-hidden="true">
            <span /> <i />
          </span>
          <span>
            cult<span className="brand-light"> / lab</span>
          </span>
        </a>
        <div className="project-label">
          <span className="orange-dot" /> OPEN SOURCE RESEARCH
        </div>
        <div className="sidebar-caption">
          探索目录 <span>001</span>
        </div>
        <nav aria-label="页面导航">
          {nav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              className={activeSection === id ? "is-active" : ""}
              href={`#${id}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {activeSection === id && <ChevronRight size={15} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <a
          className="sidebar-source"
          href="https://www.cult-ui.com/docs"
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={16} />
          官方组件文档
          <ArrowUpRight size={15} />
        </a>
        <a
          className="sidebar-source"
          href={sourceInfo.repo}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          上游 GitHub
          <ArrowUpRight size={15} />
        </a>
        <div className="sidebar-bottom">
          <div className="research-badge">
            <Code2 size={17} />
            <span>
              从效果，到实现。<small>一份可以动手探索的研究</small>
            </span>
          </div>
          <div className="sidebar-meta">
            <span>RESEARCH 001</span>
            <span>2026.10</span>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="收起导航"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="打开导航"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
            >
              <Menu size={20} />
            </button>
            <span>项目研究</span>
            <ChevronRight size={13} />
            <strong>Cult UI</strong>
            <span className="header-number">001</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? "切换浅色主题" : "切换深色主题"}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <span className="header-divider" />
            <a href={sourceInfo.repo} target="_blank" rel="noreferrer">
              <Github size={16} />
              <span>查看源码</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main>
          <section className="hero knowledge-hero" id="overview">
            <div className="hero-copy">
              <div className="hero-eyebrow">
                <span className="pill">
                  <span className="orange-dot" /> CULT UI
                </span>
                <span>从完整地图，到自己的产品</span>
              </div>
              <h1>
                可复制的界面，
                <br />
                <span className="accent-text">
                  可改造的体验<span className="title-period">。</span>
                </span>
              </h1>
              <p className="hero-description">
                Cult UI 提供可复制、可改造的 React 组件与局部视觉 / 交互源码。
                从按钮、表单、卡片与 AI 界面，到首屏、设备模型和图形效果，
                你可以挑一块放进自己的项目，再接上内容与业务。
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#understanding">
                  先看能力地图 <ArrowRight size={17} />
                </a>
                <a className="text-button" href="#capabilities">
                  体验原版组件 <ArrowDown size={16} />
                </a>
              </div>
              <div className="hero-footnote">
                <span className="stacked-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>React · Tailwind CSS · Motion / 图形渲染</span>
                <span className="footnote-dot">·</span>
                <span>MIT 开源</span>
              </div>
            </div>
            <figure className="hero-map-card">
              <figcaption>
                <span><BookOpen size={16} /> CULT UI 能力地图</span>
                <a href="./cult-ui-capability-map.png" target="_blank" rel="noreferrer">
                  打开原图 <ArrowUpRight size={14} />
                </a>
              </figcaption>
              <a className="hero-map-preview" href="#understanding" aria-label="前往完整能力地图与阅读说明">
                <img
                  src="./cult-ui-capability-map.png"
                  width="1560"
                  height="4438"
                  alt="Cult UI 中文能力地图，整理组件方向、实现机制、使用场景与个人价值"
                  decoding="async"
                />
                <span>查看完整图，沿着需求找到方向 <ArrowDown size={15} /></span>
              </a>
              <div className="hero-map-caption">
                <span>有哪些能力？如何实现？什么时候用？</span>
                <a href="#understanding">顺着这张图阅读 <ArrowRight size={14} /></a>
              </div>
            </figure>
          </section>
          <div className="stats-strip">
            <div>
              <strong>{capabilities.length}</strong>
              <p>
                全量目录 <span>逐项核对源码与文档</span>
              </p>
            </div>
            <div>
              <strong>{localPreviewCount}</strong>
              <p>
                原版组件预览 <span>固定版本 · 本地运行</span>
              </p>
            </div>
            <div>
              <strong>{variantCount}</strong>
              <p>
                可运行示例 <span>原版用法与基础控件接入</span>
              </p>
            </div>
            <div>
              <strong className="stat-license">
                MIT <ArrowUpRight size={19} />
              </strong>
              <p>
                开源许可 <span>可查看与修改源码</span>
              </p>
            </div>
          </div>

          <section className="content-section understanding-section" id="understanding">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 / A MAP FOR YOUR NEXT PROJECT</p>
                <h2>一张图，找到你的使用方向。</h2>
                <p>
                  先认识能力与边界，再按具体需求选择组件。地图覆盖 14 个官方分类与补充注册项，
                  下方目录可以逐项体验、读原理、查源码。
                </p>
              </div>
              <a className="map-original-link" href="./cult-ui-capability-map.png" target="_blank" rel="noreferrer">
                打开原图放大阅读 <ExternalLink size={15} />
              </a>
            </div>
            <details className="capability-map-reader">
              <summary>
                <span className="map-reader-icon"><BookOpen size={20} /></span>
                <span><strong>展开完整中文能力图</strong><small>能力方向 → 底层机制 → 场景 → 个人价值 → 以后何时用</small></span>
                <ChevronRight className="map-reader-chevron" size={20} />
              </summary>
              <div className="map-reading-note">
                <p>完整保留原图。可在图内横向滚动查看细节，也可打开原图，用浏览器放大阅读。</p>
                <a href="./cult-ui-capability-map.png" target="_blank" rel="noreferrer">打开原图 <ArrowUpRight size={14} /></a>
              </div>
              <div className="capability-map-scroll" tabIndex={0} role="region" aria-label="完整能力图，可横向滚动">
                <img
                  src="./cult-ui-capability-map.png"
                  width="1560"
                  height="4438"
                  alt="完整 Cult UI 能力地图：134 个官方文档组件和 3 个补充注册项，涵盖 14 类能力、实现机制、适用场景和个人价值"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </details>

            <div className="understanding-grid">
              <article>
                <span className="understanding-label">能力 / WHAT</span>
                <h3>交付的是一块可以使用的界面</h3>
                <p>既有输入、选择、导航、反馈等操作控件，也有卡片、首屏、媒体模型、插画与背景效果。可以局部采用，也可以自行组合。</p>
              </article>
              <article>
                <span className="understanding-label">交付 / SOURCE</span>
                <h3>拿到源码，继续改成自己的用法</h3>
                <p>shadcn CLI 根据 Registry 将 .tsx 文件与依赖加入项目。内容、布局、主题与交互由本地代码控制，后续更新由自己检查合并。</p>
              </article>
              <article>
                <span className="understanding-label">实现 / HOW</span>
                <h3>状态、样式和渲染共同产生效果</h3>
                <p>React 管结构与状态，Tailwind / CSS 管布局与外观；按组件需要使用 Motion、SVG、Canvas 或 WebGL，表达变化与绘制图形。</p>
              </article>
            </div>

            <div className="direction-heading">
              <div><h3>按你想做的事情，找到一组能力。</h3><p>下面六个方向覆盖全部 {capabilities.length} 项，点一下即可筛选对应分类。</p></div>
              <a className="text-button" href="#principles">继续看底层原理 <ArrowRight size={15} /></a>
            </div>
            <div className="direction-grid">
              {capabilityDirections.map(({ icon: Icon, ...direction }) => (
                <article className="direction-card" key={direction.name}>
                  <div className="direction-card-heading">
                    <span className="direction-icon"><Icon size={20} /></span>
                    <span className="direction-count">{capabilities.filter((item) => direction.categories.includes(item.category)).length} 项</span>
                  </div>
                  <h4>{direction.name}</h4>
                  <p>{direction.description}</p>
                  <small>{direction.examples}</small>
                  <div className="direction-categories">
                    {direction.categories.map((item) => (
                      <a key={item} href="#capabilities" onClick={() => { setCategory(item); setQuery(""); setShowAll(false); }}>
                        {item} <ArrowUpRight size={11} />
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section
            className="content-section capabilities-section"
            id="capabilities"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / COMPLETE COMPONENT CATALOG</p>
                <h2>找到一块，体验它的真实用法。</h2>
                <p>
                  完整覆盖 {capabilities.length} 个有效组件与 {variantCount} 个可运行示例。
                  点开组件，查看原版效果、实现机制、使用场景和接入依赖。
                </p>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索组件或原理…"
                  aria-label="搜索组件"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="清空搜索">
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            <div className="catalog-toolbar">
              <div className="category-tabs" aria-label="按能力筛选">
                {categories.map((item) => (
                  <button
                    key={item}
                    className={category === item ? "is-active" : ""}
                    aria-pressed={category === item}
                    onClick={() => {
                      setCategory(item);
                      setShowAll(false);
                    }}
                  >
                    {item}{" "}
                    <span>
                      {item === "全部"
                        ? capabilities.length
                        : capabilities.filter(
                            (component) => component.category === item,
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              <span className="results-count" aria-live="polite">
                {filtered.length} 个组件
              </span>
            </div>
            <div className="catalog-coverage">
              <p>
                <strong>
                  {catalogCounts.documentedComponents} 个官方文档组件 +{" "}
                  {catalogCounts.undocumentedCanonicalUiEntries} 个补充注册项
                </strong>
                ，按固定版本逐项枚举。每项均有中文说明、原理、场景、依赖和源码入口。
              </p>
              <p>
                包含 {catalogCounts.canonicalExampleEntries}{" "}
                个原版官方示例，以及 2
                个基础控件接入示例。官网的“150+”与本页枚举口径不同；旧别名不重复计数。
              </p>
              <details>
                <summary>查看旧名称映射与未注册源码文件</summary>
                <p>
                  {deprecatedAliases.length}{" "}
                  个旧名称仍在注册表中，指向现有组件；例如旧 animated-* 系列对应
                  Halo 系列。
                </p>
                <div className="catalog-aliases">
                  {deprecatedAliases.map((alias) => (
                    <span key={alias.name}>
                      {alias.name} → {alias.canonicalRegistryName}
                    </span>
                  ))}
                </div>
                <p style={{ marginTop: 12 }}>
                  另有 {unregisteredSourceFiles.length}{" "}
                  个源码文件未列入当前可安装组件目录，保留来源供研究：
                </p>
                <div className="catalog-aliases">
                  {unregisteredSourceFiles.map((file) => (
                    <span key={file.path}>
                      <a href={file.sourceUrl} target="_blank" rel="noreferrer">
                        {file.path.split("/").at(-1)} ↗
                      </a>
                    </span>
                  ))}
                </div>
              </details>
            </div>
            <div className="capability-grid">
              {visible.map((item) => (
                <button
                  className="capability-card"
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <div className="capability-card-head">
                    <span
                      className={`category-symbol symbol-${((categories.indexOf(item.category) - 1) % 5) + 1}`}
                    >
                      <CategoryIcon category={item.category} />
                    </span>
                    <ArrowUpRight size={15} />
                  </div>
                  <span className="component-english">{item.english}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="capability-card-footer">
                    <span>{item.category}</span>
                    {item.registryName && (
                      <span className="has-demo">
                        <span className="live-dot" /> 原版预览
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="empty-results">
                <Search size={26} />
                <h3>没有找到匹配组件</h3>
                <p>试试“文字”“卡片”或 Motion。</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setCategory("全部");
                  }}
                >
                  重置筛选 <ArrowRight size={15} />
                </button>
              </div>
            )}
            {category === "全部" && !query && filtered.length > 16 && (
              <button
                className="show-more"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "收起目录" : `展开全部 ${filtered.length} 个组件`}
                <ArrowDown
                  size={16}
                  style={{ transform: showAll ? "rotate(180deg)" : undefined }}
                />
              </button>
            )}
          </section>

          <section className="content-section demos-section" id="demos">
            <div className="section-heading">
              <div>
                <p className="eyebrow">03 / INTERACTION PLAYGROUND</p>
                <h2>拆开交互，理解实现。</h2>
                <p>六个简化实验，配合全量原版预览理解基础机制。</p>
              </div>
              <span className="section-tag">
                <MousePointer2 size={14} /> 试着动一动
              </span>
            </div>
            <div className="demo-grid">
              {demoDescriptions.map((demo, index) => {
                const Demo = demos[demo.id];
                return (
                  <article className="demo-card" key={demo.id}>
                    <div className="demo-card-top">
                      <span className="demo-index">0{index + 1}</span>
                      <span className="demo-type">{demo.tag}</span>
                    </div>
                    <div className={`demo-stage stage-${demo.id}`}>
                      <Demo />
                    </div>
                    <div className="demo-card-body">
                      <span className="component-english">{demo.english}</span>
                      <h3>{demo.title}</h3>
                      <p>{demo.tip}</p>
                      <button
                        className="principle-link"
                        onClick={() => inspectDemo(demo.id)}
                      >
                        看看它如何工作 <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="replica-note">
              <Code2 size={16} />
              <p>
                以上为依据上游原理编写的轻量研究复现；流光边框为 CSS
                机制示意。完整组件源码、API 与依赖请查看上游。
              </p>
            </div>
          </section>

          <section
            className="content-section principles-section"
            id="principles"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">04 / UNDER THE HOOD</p>
                <h2>看起来复杂，实现有迹可循。</h2>
                <p>从源码分发、状态与动画，到滤镜、Canvas 和 WebGL。</p>
              </div>
              <span className="section-tag">
                <Workflow size={14} /> 机制拆解
              </span>
            </div>
            <div className="pipeline" aria-label="组件安装与运行流程">
              <div>
                <PackageOpen size={20} />
                <strong>Registry JSON</strong>
                <span>源码与依赖声明</span>
              </div>
              <ArrowRight className="pipeline-arrow" size={18} />
              <div>
                <Terminal size={20} />
                <strong>shadcn CLI</strong>
                <span>复制文件 · 安装依赖</span>
              </div>
              <ArrowRight className="pipeline-arrow" size={18} />
              <div>
                <Code2 size={20} />
                <strong>本地 .tsx 源码</strong>
                <span>你拥有并修改代码</span>
              </div>
              <ArrowRight className="pipeline-arrow" size={18} />
              <div>
                <MousePointer2 size={20} />
                <strong>浏览器交互</strong>
                <span>React 状态 · Motion</span>
              </div>
            </div>
            <div
              className="mechanism-tabs"
              role="tablist"
              aria-label="实现层次"
            >
              {mechanisms.map((item, index) => (
                <button
                  id={`mechanism-tab-${index}`}
                  key={item.id}
                  role="tab"
                  aria-selected={mechanism === index}
                  aria-controls="mechanism-panel"
                  onClick={() => setMechanism(index)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowLeft"
                    ) {
                      event.preventDefault();
                      const next =
                        (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          mechanisms.length) %
                        mechanisms.length;
                      setMechanism(next);
                      document.getElementById(`mechanism-tab-${next}`)?.focus();
                    }
                  }}
                  tabIndex={mechanism === index ? 0 : -1}
                >
                  <item.icon size={17} />
                  <span>0{index + 1}</span>
                  {item.title}
                </button>
              ))}
            </div>
            <div
              className="mechanism-panel"
              id="mechanism-panel"
              role="tabpanel"
              aria-labelledby={`mechanism-tab-${mechanism}`}
            >
              <div className="mechanism-copy">
                <span className="mechanism-number">0{mechanism + 1}</span>
                <h3>{currentMechanism.subtitle}</h3>
                <p>{currentMechanism.description}</p>
                <ul>
                  {currentMechanism.points.map((point) => (
                    <li key={point}>
                      <CheckCheck size={16} />
                      {point}
                    </li>
                  ))}
                </ul>
                <a
                  href={
                    mechanism === 0
                      ? "https://www.cult-ui.com/docs/installation"
                      : mechanism === 1
                        ? "https://www.cult-ui.com/docs"
                        : mechanism === 2
                          ? "https://motion.dev/docs/react-animation"
                          : "https://www.cult-ui.com/docs/components/hero-liquid-metal"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  查阅原始文档 <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="code-pane">
                <div className="code-toolbar">
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{currentMechanism.file}</span>
                  <CopyButton text={currentMechanism.code} />
                </div>
                <pre>
                  <code>{currentMechanism.code}</code>
                </pre>
                <div className="code-bottom">
                  <span className="live-dot" />
                  {mechanism === 0
                    ? "源码交付 · 按需安装 · 主动更新"
                    : "用于解释机制的精简代码示例"}
                </div>
              </div>
            </div>
          </section>

          <section className="content-section scenarios-section" id="scenarios">
            <div className="section-heading">
              <div>
                <p className="eyebrow">05 / WHEN TO USE & PERSONAL VALUE</p>
                <h2>以后遇到这些需求，就从这里开始。</h2>
                <p>按你的项目阶段和需求选一块，让界面、信息与操作更容易被理解。以下是基于组件能力的场景判断。</p>
              </div>
            </div>
            <div className="scenario-grid">
              {useCases.map(({ icon: Icon, ...item }, index) => (
                <article className="scenario-card" key={item.name}>
                  <div className="scenario-top">
                    <span className="scenario-icon">
                      <Icon size={22} />
                    </span>
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{item.name}</h3>
                  <div className="scenario-when"><span>何时用</span><p>{item.when}</p></div>
                  <p>{item.description}</p>
                  <div className="scenario-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="scenario-fit">
                    <Check size={14} />
                    {item.suitable}
                  </div>
                </article>
              ))}
            </div>

            <div className="personal-value-section">
              <div className="direction-heading"><div><h3>对个人开发者与小团队，价值在这里。</h3><p>从现成界面起步，也能积累自己的代码与交互理解。</p></div></div>
              <div className="personal-value-grid">
                {personalValues.map((value, index) => (
                  <article key={value.title}>
                    <span>0{index + 1}</span>
                    <h4>{value.title}</h4>
                    <p>{value.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="scope-grid">
              <article className="scope-note">
                <span className="scope-icon"><Workflow size={19} /></span>
                <div>
                  <h3>界面表达与业务服务，分别接入</h3>
                  <p>AI 输入、投票、协作头像与网关插画负责前端表达。模型调用、数据保存、多人同步、权限、计费与真实 API 路由，由你自己的业务服务处理。</p>
                </div>
              </article>
              <article className="scope-note">
                <span className="scope-icon"><Code2 size={19} /></span>
                <div>
                  <h3>把组件带入自己的项目，也负责后续维护</h3>
                  <p>检查实际依赖和框架适配，按项目调整主题与行为。更新时审查源码差异，并在目标手机、键盘操作与减少动效偏好下验证体验。</p>
                </div>
              </article>
            </div>

            <ol className="adoption-path" aria-label="从研究到采用的四个步骤">
              <li><span>1</span><div><strong>看地图，确定需求</strong><small>先找到适合的能力方向</small></div></li>
              <li><span>2</span><div><strong>体验原版，读懂原理</strong><small>观察效果与真实交互</small></div></li>
              <li><span>3</span><div><strong>查源码，检查适配</strong><small>核对依赖、结构与运行环境</small></div></li>
              <li><span>4</span><div><strong>改造接入，持续复用</strong><small>接上业务并积累本地组件</small></div></li>
            </ol>
          </section>

          <section className="source-section" aria-labelledby="source-title">
            <div>
              <span className="eyebrow">TRACEABLE RESEARCH</span>
              <h2 id="source-title">每个结论，都有出处。</h2>
              <p>
                研究日期 {sourceInfo.date} · 上游 commit{" "}
                <a
                  href={`${sourceInfo.repo}/tree/${sourceInfo.commit}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {sourceInfo.commit.slice(0, 7)} <ArrowUpRight size={12} />
                </a>{" "}
                · {sourceInfo.license} 许可
              </p>
            </div>
            <div className="source-links">
              <a
                href="https://www.cult-ui.com/docs"
                target="_blank"
                rel="noreferrer"
              >
                官方文档 <ArrowUpRight size={15} />
              </a>
              <a href={sourceInfo.repo} target="_blank" rel="noreferrer">
                上游仓库 <ArrowUpRight size={15} />
              </a>
            </div>
          </section>
        </main>
        <footer className="page-footer">
          <span>
            CULT / LAB <span>·</span> 开源项目研究 001
          </span>
          <span>理解原理，创造自己的交互。</span>
          <a href="#overview">回到顶部 ↑</a>
        </footer>
      </div>
      <CatalogDialog
        item={selected}
        dark={dark}
        close={() => setSelected(null)}
        canNavigate={navigationList.length > 1}
        adjacent={(direction) => {
          const list = navigationList;
          const index = list.findIndex((item) => item.id === selected?.id);
          setSelected(list[(index + direction + list.length) % list.length]);
        }}
      />
    </div>
  );
}

function CategoryIcon({ category }: { category: Category }) {
  const Icon = category.startsWith("AI")
    ? Sparkles
    : /导航|引导/.test(category)
      ? MousePointer2
      : /背景|文字/.test(category)
        ? Zap
        : /落地页|媒体|插画/.test(category)
          ? PanelTop
          : Blocks;
  return <Icon size={19} />;
}
