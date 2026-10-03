import fs from "node:fs/promises";
import path from "node:path";
import ts from "../web/node_modules/typescript/lib/typescript.js";

// Reads TypeScript syntax as data. Does not execute the downloaded registry or
// any upstream build/postinstall script. Re-run after refreshing the fixed cache.
const project = path.resolve(import.meta.dirname, "..");
const sha = "67a66c6ac1cd240914ba688a907611b3437a7a2b";
const sourceRoot = path.join(project, ".cache/cult-upstream/apps/www");
const outRoot = path.join(project, "web/src/upstream");
const vendorRoot = path.join(outRoot, "vendor");
const slash = value => value.replaceAll("\\", "/");
await fs.mkdir(outRoot, { recursive: true });
const publicAssets = new Set();
async function listPublic(dir, relative = "") {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const child = slash(path.join(relative, entry.name));
    if (["r", "registry"].includes(child.split("/")[0])) continue;
    if (entry.isDirectory()) await listPublic(path.join(dir, entry.name), child);
    else publicAssets.add(`/${child}`);
  }
}
await listPublic(path.join(sourceRoot, "public"));
await fs.writeFile(path.join(outRoot, "public-assets.json"), JSON.stringify([...publicAssets].sort(), null, 2));

function literal(node) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties
    .filter(ts.isPropertyAssignment).map(prop => [prop.name.text, literal(prop.initializer)]));
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
  return undefined;
}
async function registryArray(file, name) {
  const source = ts.createSourceFile(file, await fs.readFile(path.join(sourceRoot, file), "utf8"), ts.ScriptTarget.Latest, true);
  let value;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) value = literal(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!Array.isArray(value)) throw new Error(`Cannot parse ${name} in ${file}`);
  return value;
}
const ui = await registryArray("registry/ui.ts", "ui");
const allExamples = await registryArray("registry/examples.ts", "examples");
const examples = allExamples.filter(item => item.files?.length);
const aliases = Object.fromEntries(allExamples.filter(item => !item.files?.length).map(item => [item.name, item.registryDependencies?.[0]?.split("/").at(-1)?.replace(/\.json$/, "")]));
const registry = [...ui, ...examples];
const packages = new Map();
const files = new Map();
const missing = [];
const adaptationImports = new Set(["next/image", "next/link", "next/dynamic", "next/navigation"]);
const packageName = specifier => specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
async function resolveLocal(file, specifier) {
  const base = specifier.startsWith("@/") ? specifier.slice(2) : slash(path.join(path.dirname(file), specifier));
  for (const suffix of ["", ".tsx", ".ts", ".jsx", ".js", ".json", "/index.tsx", "/index.ts"]) {
    const result = base + suffix;
    try { const stat = await fs.stat(path.join(sourceRoot, result)); if (stat.isFile()) return result; } catch {}
  }
  return null;
}
const adapterPaths = { "next/image": "adapters/next-image.tsx", "next/link": "adapters/next-link.tsx", "next/dynamic": "adapters/next-dynamic.tsx", "next/navigation": "adapters/next-navigation.ts" };
async function visitFile(file) {
  if (files.has(file)) return;
  const absolute = path.join(sourceRoot, file);
  let code;
  try { code = await fs.readFile(absolute, "utf8"); } catch { missing.push({ file, reason: "missing source" }); return; }
  files.set(file, { code, replacements: [] });
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const references = [];
  function collect(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) references.push(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0])) references.push(node.arguments[0]);
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
      const value = node.text;
      const pathname = value.split(/[?#]/)[0];
      const asset = publicAssets.has(pathname) || (ts.isTemplateHead(node) && value.length > 1 && [...publicAssets].some(asset => asset.startsWith(value)));
      if (asset && value.startsWith("/")) files.get(file).replacements.push({ start: node.getStart(parsed) + 1, end: node.getStart(parsed) + 2, value: "./" });
    }
    ts.forEachChild(node, collect);
  }
  collect(parsed);
  for (const node of references) {
    const specifier = node.text;
    let dest;
    if (adaptationImports.has(specifier)) dest = path.join(outRoot, adapterPaths[specifier]);
    else if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const local = await resolveLocal(file, specifier);
      if (!local) { missing.push({ file, specifier, reason: "unresolved local import" }); continue; }
      dest = path.join(vendorRoot, local);
      await visitFile(local);
    } else {
      if (ts.isImportDeclaration(node.parent) && node.parent.importClause?.isTypeOnly) continue;
      const pkg = packageName(specifier);
      if (!packages.has(pkg)) packages.set(pkg, new Set());
      packages.get(pkg).add(file);
      continue;
    }
    let relative = slash(path.relative(path.dirname(path.join(vendorRoot, file)), dest));
    if (!relative.startsWith(".")) relative = `./${relative}`;
    files.get(file).replacements.push({ start: node.getStart(parsed) + 1, end: node.getEnd() - 1, value: relative });
  }
}
for (const item of examples) for (const file of item.files ?? []) await visitFile(file.path);
await visitFile("components/ui/toaster.tsx");
for (const [file, { code, replacements }] of files) {
  let output = code;
  for (const patch of replacements.sort((a, b) => b.start - a.start)) output = output.slice(0, patch.start) + patch.value + output.slice(patch.end);
  output = output.replace(/url\((["']?)(\/[^\s)"']+)\1\)/g, (match, quote, asset) => publicAssets.has(asset.split(/[?#]/)[0]) ? `url(${quote}.${asset}${quote})` : match);
  if (/\.tsx?$/.test(file)) output = `// @ts-nocheck\n// Vendored from Cult UI ${sha}: apps/www/${file}\n// Integration edits: relative imports/public asset URLs and explicit Next adapters.\n${output}`;
  const dest = path.join(vendorRoot, file);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, output);
}

const upstreamPackage = JSON.parse(await fs.readFile(path.join(sourceRoot, "package.json"), "utf8"));
const dependencyManifest = Object.fromEntries([...packages].filter(([name]) => !["react", "react-dom", "motion", "lucide-react"].includes(name)).sort(([a], [b]) => a.localeCompare(b)).map(([name, usedBy]) => [name, { version: upstreamPackage.dependencies[name] ?? upstreamPackage.devDependencies[name] ?? "latest", usedBy: [...usedBy] }]));
// The isolated document uses the authentic upstream stylesheet and its plugins.
for (const name of ["next-themes", "sonner", "geist", "dither-plugin", "@tailwindcss/typography", "tailwindcss-animate"]) dependencyManifest[name] ??= { version: upstreamPackage.dependencies[name] ?? "latest", usedBy: ["preview shell / upstream globals.css"] };
await fs.writeFile(path.join(outRoot, "dependencies.json"), JSON.stringify(dependencyManifest, null, 2));

const docsRoot = path.join(sourceRoot, "content/docs/components");
const manifest = {};
const exampleNames = new Set(examples.map(item => item.name));
for (const name of await fs.readdir(docsRoot)) {
  if (!name.endsWith(".mdx")) continue;
  const slug = name.slice(0, -4);
  const text = await fs.readFile(path.join(docsRoot, name), "utf8");
  const previews = [];
  for (const match of text.matchAll(/<ComponentPreview\b([\s\S]*?)\/?\s*>/g)) {
    const example = match[1].match(/\bname=["']([^"']+)["']/)?.[1];
    if (!example || previews.some(item => item.name === example)) continue;
    const title = match[1].match(/\b(?:description|title)=["']([^"']+)["']/)?.[1] ?? example.replaceAll("-", " ");
    previews.push({ name: example, title, kind: "official" });
  }
  const unknown = previews.filter(item => !exampleNames.has(item.name));
  manifest[slug] = { examples: previews.filter(item => exampleNames.has(item.name)), ...(unknown.length ? { status: `上游文档引用未注册的示例：${unknown.map(item => item.name).join(", ")}` } : {}) };
  if (!previews.length) manifest[slug].status = "上游此文档未提供独立 ComponentPreview 示例";
}
await fs.writeFile(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
manifest["bg-animated-gradient"] = { examples: [{name: "bg-animated-gradient-demo", title: "官方默认示例", kind: "official"}] };
for (const name of ["base-select", "base-tooltip"]) manifest[name] = { examples: [{ name: `${name}-integration`, title: "本项目接入示例", kind: "integration" }], status: "上游无独立 demo；使用原始组件 API 接入" };
await fs.writeFile(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
const modules = examples.map(item => ({ name: item.name, kind: "official", path: item.files?.[0]?.path, files: item.files ?? [], dependencies: item.registryDependencies ?? [], source: `https://github.com/nolly-studio/cult-ui/blob/${sha}/apps/www/${item.files?.[0]?.path}` }));
for (const name of ["base-select", "base-tooltip"]) modules.push({ name: `${name}-integration`, kind: "integration", path: `integrations/${name}.tsx`, source: `https://github.com/nolly-studio/cult-ui/blob/${sha}/apps/www/registry/default/ui/${name}.tsx` });
await fs.writeFile(path.join(outRoot, "examples.json"), JSON.stringify(modules, null, 2));
await fs.writeFile(path.join(outRoot, "aliases.json"), JSON.stringify(aliases, null, 2));
await fs.writeFile(path.join(outRoot, "loaders.ts"), `// Generated by scripts/build-upstream-preview.mjs. Original examples; two clearly labeled API integrations.\nexport const loaders: Record<string, () => Promise<any>> = {\n${modules.map(item => `  ${JSON.stringify(item.name)}: () => import(${JSON.stringify(item.kind === "official" ? `./vendor/${item.path}` : `./${item.path}`)}),`).join("\n")}\n};\n`);
const globals = await fs.readFile(path.join(sourceRoot, "styles/globals.css"), "utf8");
await fs.writeFile(path.join(outRoot, "upstream.css"), `/* Authentic upstream theme and utilities, scoped by the separate iframe document. */\n${globals.replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./vendor";\n@source "./integrations";')}`);
const fontFiles = [
  ["Geist", "geist-sans/Geist-Variable.woff2", "100 900"],
  ["Geist Mono", "geist-mono/GeistMono-Variable.woff2", "100 900"],
  ...["Square", "Grid", "Circle", "Triangle", "Line"].map(name => [`Geist Pixel ${name}`, `geist-pixel/GeistPixel-${name}.woff2`, "400"]),
];
await fs.writeFile(path.join(outRoot, "fonts.css"), `/* The same seven Geist font families used by the fixed upstream root layout. */\n${fontFiles.map(([family, file, weight]) => `@font-face { font-family: ${JSON.stringify(family)}; src: url(${JSON.stringify(`../../node_modules/geist/dist/fonts/${file}`)}) format("woff2"); font-weight: ${weight}; font-style: normal; font-display: swap; }`).join("\n")}\n`);

// Preserve paths used by official examples. Never overwrite existing project
// public assets (e.g. the research application's favicon).
async function copyPublic(dir, relative = "") {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (child.startsWith("r") && ["r", "registry"].includes(child.split(path.sep)[0])) continue;
    if (entry.isDirectory()) await copyPublic(path.join(dir, entry.name), child);
    else {
      const dest = path.join(project, "web/public", child);
      try { await fs.access(dest); } catch { await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(path.join(dir, entry.name), dest); }
    }
  }
}
await copyPublic(path.join(sourceRoot, "public"));
await fs.writeFile(path.join(outRoot, "integration-report.json"), JSON.stringify({ sha, uiCount: ui.length, officialExamples: examples.length, integrationExamples: 2, deprecatedExampleAliases: Object.keys(aliases).length, previewEntries: modules.length, docs: 134, canonicalUiKeys: Object.keys(manifest).length, copiedFiles: files.size, packageCount: Object.keys(dependencyManifest).length, adaptedImports: [...adaptationImports], missing }, null, 2));
console.log(JSON.stringify({ examples: examples.length, docs: Object.keys(manifest).length, copiedFiles: files.size, dependencies: Object.keys(dependencyManifest), missing }, null, 2));
