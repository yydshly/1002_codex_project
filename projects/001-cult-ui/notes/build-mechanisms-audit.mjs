import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const notesRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(notesRoot, '..');
const argument = process.argv.find(value => value.startsWith('--source-root='));
const upstreamRoot = path.resolve(argument?.split('=').slice(1).join('=') ?? path.join(projectRoot, '.cache/cult-upstream/apps/www'));
const requireFromWeb = createRequire(path.join(projectRoot, 'web/package.json'));
const ts = requireFromWeb('typescript');
const catalog = JSON.parse(fs.readFileSync(path.join(notesRoot, 'full-catalog-audit.json'), 'utf8'));
const copyLines = fs.readFileSync(path.join(notesRoot, 'mechanism-copy.tsv'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
const copy = new Map(copyLines.slice(1).map(line => {
  const [slug, name, description, mechanism, scenario] = line.split('\t');
  if (![slug, name, description, mechanism, scenario].every(Boolean)) throw new Error('Incomplete copy row: ' + slug);
  return [slug, { name, description, mechanism, scenario }];
}));
const rootExists = fs.existsSync(upstreamRoot);
if (!rootExists) throw new Error('Missing source root: ' + upstreamRoot + '. Supply --source-root=<upstream apps/www directory>.');
const fileMemo = new Map();
const exts = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '/index.tsx', '/index.ts', '/index.js'];
function resolveModule(specifier, importer) {
  if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return null;
  const base = specifier.startsWith('@/') ? path.join(upstreamRoot, specifier.slice(2)) : path.resolve(path.dirname(importer), specifier);
  const candidates = [base, ...exts.map(ext => base + ext)];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}
function readModule(filename) {
  if (fileMemo.has(filename)) return fileMemo.get(filename);
  const content = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [];
  for (const statement of ast.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) imports.push(statement.moduleSpecifier.text);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const result = { content, imports: [...new Set(imports)] };
  fileMemo.set(filename, result);
  return result;
}
function relativeSource(filename) { return 'apps/www/' + path.relative(upstreamRoot, filename).replaceAll('\\', '/'); }
function packageName(specifier) { return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]; }
function collect(entryPaths) {
  const seen = new Set(), externals = new Set(), unresolved = new Set(), directImports = new Set();
  function walk(filename, direct = false) {
    if (seen.has(filename)) return;
    seen.add(filename);
    const module = readModule(filename);
    for (const specifier of module.imports) {
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const target = resolveModule(specifier, filename);
        if (target && /\.(tsx?|jsx?|mjs)$/.test(target)) walk(target);
        else if (!target) unresolved.add(specifier);
      } else {
        externals.add(specifier);
        if (direct) directImports.add(specifier);
      }
    }
  }
  for (const sourcePath of entryPaths ?? []) {
    const filename = path.join(upstreamRoot, sourcePath.replace(/^apps\/www\//, ''));
    if (!fs.existsSync(filename)) throw new Error('Missing source: ' + sourcePath);
    walk(filename, true);
  }
  return { files: [...seen], externalImports: [...externals].sort(), directImports: [...directImports].sort(), unresolvedLocalImports: [...unresolved].sort() };
}
function analyze(item, documented) {
  const wording = copy.get(item.slug);
  if (!wording) throw new Error('Missing authored metadata: ' + item.slug);
  const closure = collect(item.sourcePaths);
  const directSource = (item.sourcePaths ?? []).map(sourcePath => readModule(path.join(upstreamRoot, sourcePath.replace(/^apps\/www\//, ''))).content).join('\n');
  const declared = item.dependencies ?? [];
  const importedPackages = closure.externalImports.map(packageName);
  const dependencies = [...new Set([...declared, ...importedPackages].filter(value => value && value !== 'react' && value !== 'react-dom'))].sort();
  const evidenceText = item.descriptionEn + ' ' + wording.mechanism + ' ' + closure.externalImports.join(' ');
  const tags = ['React'];
  const addTag = (predicate, tag) => { if (predicate) tags.push(tag); };
  addTag(dependencies.some(value => value === 'motion' || value === 'framer-motion'), 'Motion');
  addTag(/SVG|\bsvg\b|feTurbulence|feDisplacementMap/.test(directSource + evidenceText), 'SVG');
  addTag(/canvas|getContext\(|Canvas/.test(directSource + evidenceText), 'Canvas');
  addTag(/WebGL|webgl/.test(evidenceText + directSource) || dependencies.some(value => ['three', '@paper-design/shaders-react', 'cobe', 'metal-fx'].includes(value)), 'WebGL');
  addTag(/shader|着色器|glsl|ShaderMaterial/.test(evidenceText + directSource), 'Shader');
  addTag(dependencies.includes('cobe'), 'COBE');
  addTag(dependencies.includes('three'), 'Three.js');
  addTag(dependencies.includes('@paper-design/shaders-react'), 'Paper Design');
  addTag(dependencies.includes('@base-ui/react'), 'Base UI');
  addTag(dependencies.some(value => value.startsWith('@radix-ui/')), 'Radix UI');
  addTag(dependencies.includes('vaul'), 'Vaul');
  addTag(dependencies.some(value => value.includes('embla')), 'Embla');
  addTag(dependencies.includes('next'), 'Next.js 适配');
  addTag(dependencies.includes('next-themes'), 'next-themes');
  addTag(dependencies.includes('geist'), 'Geist 字体');
  addTag(dependencies.includes('border-beam'), 'border-beam');
  addTag(dependencies.includes('metal-fx'), 'metal-fx');
  addTag(/CSS|渐变|阴影|font-family|mask-image|backdrop-filter/.test(evidenceText), 'CSS');
  addTag(/draggable|dataTransfer|onDrop=/.test(directSource), '原生拖放');
  addTag(/Reorder/.test(directSource), 'Motion Reorder');
  addTag(/IntersectionObserver/.test(directSource), 'IntersectionObserver');
  addTag(/localStorage/.test(directSource), 'localStorage');
  addTag(/navigator\.clipboard/.test(directSource), 'Clipboard API');
  addTag(/<video|<iframe|HTMLVideoElement/.test(directSource), '媒体');
  const reviewNotes = [];
  if (closure.externalImports.some(value => value.startsWith('next/'))) reviewNotes.push('源码导入 Next.js 模块；Vite 本地预览需要保留行为的 Image/Link/font/navigation 适配，不应仅删除组件。');
  if (tags.includes('WebGL')) reviewNotes.push('需要可用 WebGL 上下文；懒加载并按离屏/减少动效偏好控制渲染，目标设备上另测GPU与功耗。');
  if (tags.includes('Canvas')) reviewNotes.push('Canvas 视觉不自动生成可访问DOM内容；关键说明应保留文本，并核验尺寸、像素比和绘制频率。');
  if (/useReducedMotion|prefers-reduced-motion/.test(directSource)) reviewNotes.push('直接源码包含减少动态效果处理，但不能据此推断所有子组件与CSS动画都已停用。');
  else if (tags.includes('Motion') || tags.includes('Shader')) reviewNotes.push('直接源码未检出减少动态效果处理；本地接入需审查持续动画和第三方渲染。');
  if (/https?:\/\//.test(directSource)) reviewNotes.push('直接源码出现外部URL；示例媒体/数据可能依赖网络，预览需明确可用资源或回退状态。');
  if (item.slug === 'tweet-grid') reviewNotes.push('推文嵌入依赖外部服务和浏览器策略；真实离线预览只能保留布局和明确的加载状态，不能伪造真实推文。');
  if (/illustration|agent-suggest-card-stack|security-checkpoint|fluid-ai-workloads|circuit-board/.test(item.slug)) reviewNotes.push('这是界面插图/示意，不提供实际网关路由、AI执行、部署、安全验证或多人同步后端。');
  if (/poll|voting|vote-tally|kanban/.test(item.slug)) reviewNotes.push('状态和计数属于前端呈现；持久化、防重复提交与访问权限由业务系统负责。');
  if (!documented) reviewNotes.push('有效 registry 项目，固定版本无独立官方文档页面；机制依据实际源码，不重复算作官方134页。');
  return {
    slug: item.slug, id: item.id, name: wording.name, english: item.english, category: item.category,
    description: wording.description, mechanism: wording.mechanism, scenario: wording.scenario,
    tags: [...new Set(tags)], dependencies, registryDeclaredDependencies: declared,
    registryDependencies: item.registryDependencies ?? [], directImports: closure.directImports,
    transitiveExternalImports: closure.externalImports, sourceClosure: closure.files.map(relativeSource).sort(),
    unresolvedLocalImports: closure.unresolvedLocalImports, documented,
    docsUrl: item.docsUrl, docsSourceUrl: item.docsSourceUrl ?? null,
    sourceUrl: item.sourceUrl, sourcePaths: item.sourcePaths, registryName: item.registryName,
    registryUrl: item.registryUrl, previewNames: item.previewNames ?? [], exampleNames: item.exampleNames ?? [],
    reviewNotes, evidencePolicy: '中文功能与机制归纳来自固定commit文档和实际源码imports；场景为研究建议，运行质量需另验。'
  };
}
const components = catalog.components.map(item => analyze(item, true));
const supplemental = catalog.appendix.unlistedComponents.map(item => analyze(item, false));
const stats = {};
for (const item of [...components, ...supplemental]) for (const tag of item.tags) stats[tag] = (stats[tag] ?? 0) + 1;
const output = {
  schemaVersion: 1, commit: catalog.commit, date: catalog.date, timezone: catalog.timezone,
  scope: '134 documented official components plus 3 canonical supplemental registry items; deprecated aliases excluded.',
  counts: { documented: components.length, supplemental: supplemental.length, total: components.length + supplemental.length },
  metadataPolicy: { description: '中文译述官方功能，必要时区分插图与业务能力。', mechanism: '逐slug人工编写；由固定commit文档及源码核验。', scenario: '本项目研究判断。', dependencies: 'registry声明与本地静态import闭包合并，包含经本地组件引入的包；不代表所有包必须无条件加载。', tags: '依据直接源码、文档及依赖静态识别。', runtime: '真实演示渲染与交互质量由浏览器验收确认。' },
  tagCounts: stats,
  previewReview: {
    checkedDate: '2026-10-03',
    sourcePath: 'apps/www/components/component-preview.tsx',
    behavior: '普通组件在官方文档内直接渲染 Index[name].component；只有type=block分支引用/view/name iframe。',
    probes: [
      { url: 'https://www.cult-ui.com/docs/components/dock', status: 200, xFrameOptions: null, contentSecurityPolicy: null },
      { url: 'https://www.cult-ui.com/r/dock.json', status: 200, contentType: 'application/json' },
      ...['/preview/dock-demo','/preview/dock','/view/dock-demo','/view/dock','/view/kanban-board-demo'].map(route => ({url:'https://www.cult-ui.com'+route,status:404}))
    ],
    conclusion: '没有核验到可复用的独立官方组件iframeURL。当前docs页无X-Frame-Options/CSP头，但整页嵌入依赖在线服务且不是独立预览，不能承诺长期允许。',
    localRecommendation: '使用固定commit registry/default/example真实示例与其import闭包；保留上游UI/CSS行为，以最小适配替代Next运行时并懒加载重型依赖。',
    registryInstallation: 'npx shadcn@latest add https://www.cult-ui.com/r/{registryName}.json；该在线分发地址不固定SHA，需和固定commit复核。'
  },
  components, supplemental
};
fs.writeFileSync(path.join(notesRoot, 'mechanisms-audit.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({counts:output.counts, tagCounts:stats, unresolved: [...components,...supplemental].filter(item=>item.unresolvedLocalImports.length).map(item=>({slug:item.slug,imports:item.unresolvedLocalImports}))}, null, 2));
