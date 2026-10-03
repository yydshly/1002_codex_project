import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const audit = JSON.parse(
  await readFile(new URL("notes/full-catalog-audit.json", root), "utf8"),
);
const lines = (
  await readFile(new URL("notes/mechanism-copy.tsv", root), "utf8")
)
  .trim()
  .split(/\r?\n/)
  .slice(1);
const copy = Object.fromEntries(
  lines.map((line) => {
    const [id, name, description, mechanism, scenario] = line.split("\t");
    if (!scenario) throw new Error(`Missing research copy: ${id}`);
    return [id, { name, description, mechanism, scenario }];
  }),
);
const mechanismAudit = JSON.parse(
  await readFile(new URL("notes/mechanisms-audit.json", root), "utf8"),
);
const detailed = Object.fromEntries(
  [...mechanismAudit.components, ...mechanismAudit.supplemental].map((item) => [
    item.slug,
    item,
  ]),
);
const extras = {
  "bg-animated-gradient": {
    name: "动态渐变背景",
    description: "在背景颜色之间持续平滑过渡，可配置渐变颜色。",
    mechanism:
      "Motion 在多组线性渐变背景之间插值，以持续循环的时间轴改变颜色；容器尺寸和内容由 React 属性传入。",
    scenario: "官网装饰背景、品牌色展示和简单视觉过渡。",
  },
  "base-select": {
    name: "基础选择框",
    description: "为 Halo Select 提供选择菜单、选项、分组与滚动按钮。",
    mechanism:
      "封装 Base UI Select 的 Root、Trigger、Positioner、Popup 和 Item，管理选择、焦点与键盘导航；Hugeicons 绘制箭头与选中标记。",
    scenario: "自定义下拉选择框、分组选项和 Halo Select 的基础结构。",
  },
  "base-tooltip": {
    name: "基础工具提示",
    description: "为图标或设备模型控件提供悬停与聚焦提示。",
    mechanism:
      "Base UI Tooltip 负责触发、延迟、定位与 Portal；Radix Slot 支持复用触发元素，Tailwind 定义提示面板与箭头样式。",
    scenario: "图标按钮说明、设备模型工具栏和需要补充文字的紧凑控件。",
  },
};
const demos = {
  "shift-card": "shift",
  "text-animate": "text",
  dock: "dock",
  "direction-aware-tabs": "tabs",
  "border-beam-card": "beam",
  "kanban-board": "kanban",
};
function tags(item, description) {
  const content = `${description.mechanism} ${item.dependencies.join(" ")}`;
  const tags = [];
  for (const [test, name] of [
    [/Motion|motion|弹簧|AnimatePresence|layoutId/, "Motion"],
    [/SVG|路径|遮罩/, "SVG / 遮罩"],
    [/Canvas|WebGL|着色器|shader|cobe|paper-design/i, "Canvas / WebGL"],
    [/Base UI|base-ui|Radix|radix/i, "交互原语"],
    [/CSS|渐变|滤镜|纹理|transform/, "CSS / 滤镜"],
    [/状态|受控|选择|输入|焦点/, "React 状态"],
  ])
    if (test.test(content)) tags.push(name);
  return tags.length ? tags : ["React / Tailwind"];
}
const components = [
  ...audit.components,
  ...audit.appendix.unlistedComponents,
].map((item) => {
  const description = copy[item.id] || extras[item.id];
  if (!description) throw new Error(`Missing component: ${item.id}`);
  return {
    id: item.id,
    english: item.english,
    category: item.category,
    ...description,
    source: item.sourceUrl,
    ...(item.docs ? { docs: item.docs } : {}),
    registryName: item.registryName,
    dependencies: detailed[item.id]?.dependencies || [
      ...item.dependencies,
      ...(item.registryDependencies || []).map((name) => `shadcn: ${name}`),
    ],
    tags: detailed[item.id]?.tags || tags(item, description),
    ...(demos[item.id] ? { demo: demos[item.id] } : {}),
  };
});
if (
  components.length !== audit.counts.canonicalRegistryUiEntries ||
  new Set(components.map((item) => item.id)).size !== components.length
)
  throw new Error("Catalog count or IDs mismatch");
const output = {
  sourceInfo: {
    repo: audit.repo,
    commit: audit.commit,
    date: audit.date,
    license: "MIT",
    upstreamCount: "150+（官方标注）",
  },
  categories: [
    "全部",
    ...audit.categories.map((item) => item.name),
    "补充注册项",
  ],
  capabilities: components,
  counts: audit.counts,
  aliases: audit.appendix.deprecatedUiAliases,
  unregisteredSourceFiles: audit.appendix.unregisteredSourceFiles,
};
await writeFile(
  new URL("web/src/catalog.json", root),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  `Generated ${components.length} components (${audit.counts.documentedComponents} documented + ${audit.counts.undocumentedCanonicalUiEntries} supplemental).`,
);
