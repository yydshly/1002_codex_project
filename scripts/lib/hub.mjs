import { readFile, writeFile, mkdir, stat, lstat, readdir, cp, rm, realpath } from 'node:fs/promises';
import path from 'node:path';

export const statuses = ['待研究', '研究中', '已完成', '已归档'];
const startMarker = '<!-- PROJECTS:START -->';
const endMarker = '<!-- PROJECTS:END -->';
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function plainText(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/u.test(value), `${label} 必须是非空单行文字`);
}

function httpsUrl(value, label, github = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} 必须是有效 URL`); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password, `${label} 必须使用 HTTPS`);
  if (github) requireValue(url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+\/?$/u.test(url.pathname) && !url.search && !url.hash, `${label} 必须指向一个 GitHub 仓库`);
  return url;
}

export function directoryOf(project) {
  return `${project.id}-${project.slug}`;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function projectPath(root, relative, project, label) {
  requireValue(typeof relative === 'string' && !relative.includes('\\') && !path.posix.isAbsolute(relative) && path.posix.normalize(relative) === relative, `${label} 必须是规范的仓库相对路径`);
  const projectRoot = path.resolve(root, 'projects', directoryOf(project));
  const absolute = path.resolve(root, relative);
  requireValue(inside(projectRoot, absolute), `${label} 必须位于对应子项目目录内`);
  const actualRoot = await realpath(projectRoot);
  const actual = await realpath(absolute);
  requireValue(inside(actualRoot, actual), `${label} 不能通过符号链接指向项目外`);
  return absolute;
}

async function validatePublishFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    requireValue(!entry.isSymbolicLink(), `发布目录不支持符号链接：${entry.name}`);
    requireValue(!['node_modules', '.git'].includes(entry.name) && !entry.name.startsWith('.env'), `发布目录包含不应发布的文件：${entry.name}；请使用静态构建输出目录`);
    if (entry.isDirectory()) await validatePublishFiles(path.join(directory, entry.name));
    else requireValue(entry.isFile(), `发布目录只能包含普通文件：${entry.name}`);
  }
}

export async function readCatalog(root) {
  const catalog = JSON.parse(await readFile(path.join(root, 'projects/catalog.json'), 'utf8'));
  httpsUrl(catalog.repository, 'repository', true);
  const site = httpsUrl(catalog.siteUrl, 'siteUrl');
  requireValue(!site.search && !site.hash && catalog.siteUrl.endsWith('/'), 'siteUrl 必须以 / 结尾且不包含查询参数或锚点');
  requireValue(Array.isArray(catalog.projects), 'projects 必须是数组');
  const ids = new Set();
  const slugs = new Set();
  for (const project of catalog.projects) {
    requireValue(typeof project.id === 'string' && /^\d{3,}$/u.test(project.id), '项目编号必须是至少三位的数字字符串');
    const number = Number(project.id);
    requireValue(Number.isSafeInteger(number) && number > 0 && String(number).padStart(3, '0') === project.id, `编号格式不正确：${project.id}`);
    requireValue(!ids.has(project.id), `项目编号重复：${project.id}`);
    ids.add(project.id);
    requireValue(typeof project.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.slug), `slug 格式不正确：${project.slug}`);
    requireValue(!slugs.has(project.slug), `项目 slug 重复：${project.slug}`);
    slugs.add(project.slug);
    plainText(project.name, `${project.id} name`);
    plainText(project.summary, `${project.id} summary`);
    httpsUrl(project.source, `${project.id} source`, true);
    requireValue(statuses.includes(project.status), `${project.id} status 不在支持的状态中`);
    requireValue(Array.isArray(project.tags), `${project.id} tags 必须是数组`);
    for (const tag of project.tags) plainText(tag, `${project.id} tag`);
    const projectDirectory = path.join(root, 'projects', directoryOf(project));
    requireValue((await lstat(projectDirectory)).isDirectory(), `项目目录必须是普通目录：${directoryOf(project)}`);
    requireValue((await stat(path.join(projectDirectory, 'README.md'))).isFile(), `${project.id} 缺少 README.md`);
    if (project.cover != null) {
      const cover = await projectPath(root, project.cover, project, `${project.id} cover`);
      requireValue(project.cover.startsWith(`projects/${directoryOf(project)}/assets/`), `${project.id} cover 必须放在该项目的 assets/ 中`);
      requireValue((await lstat(cover)).isFile() && imageExtensions.has(path.extname(cover).toLowerCase()), `${project.id} cover 必须是普通图片文件`);
      plainText(project.coverAlt, `${project.id} coverAlt`);
    }
    if (project.publishDir != null) {
      const publishDirectory = await projectPath(root, project.publishDir, project, `${project.id} publishDir`);
      requireValue((await lstat(publishDirectory)).isDirectory(), `${project.id} publishDir 必须是普通目录`);
      requireValue((await stat(path.join(publishDirectory, 'index.html'))).isFile(), `${project.id} 发布目录缺少 index.html`);
      await validatePublishFiles(publishDirectory);
    }
    if (project.demo != null) httpsUrl(project.demo, `${project.id} demo`);
  }
  // Detect unregistered numbered directories before assigning a new number.
  for (const entry of await readdir(path.join(root, 'projects'), { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{3,}-/u.test(entry.name)) {
      requireValue(catalog.projects.some(project => directoryOf(project) === entry.name), `项目目录未登记到清单：${entry.name}`);
    }
  }
  catalog.projects.sort((a, b) => Number(a.id) - Number(b.id));
  return catalog;
}

function html(value) {
  return String(value).replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function markdown(value) {
  return html(value).replace(/([\\`*_[\]{}|])/gu, '\\$1');
}

function markdownUrl(value) {
  return value.replace(/[\s<>()[\]"']/gu, character => encodeURIComponent(character).replace(/[()']/gu, literal => `%${literal.charCodeAt(0).toString(16).toUpperCase()}`));
}

export function demoUrl(catalog, project) {
  return project.demo ?? (project.publishDir ? `${catalog.siteUrl}projects/${directoryOf(project)}/` : null);
}

export function renderReadmeIndex(catalog) {
  if (catalog.projects.length === 0) return '暂未添加研究项目。添加第一个项目后，这里会自动生成按编号排序的摘要、文档与演示索引。';
  const rows = catalog.projects.map(project => {
    const demo = demoUrl(catalog, project);
    return `| ${project.id} | [${markdown(project.name)}](projects/${directoryOf(project)}/README.md) | ${markdown(project.summary)} | ${project.status} | [源码](${markdownUrl(project.source)}) | ${demo ? `[演示](${markdownUrl(demo)})` : '—'} |`;
  });
  const previews = catalog.projects.filter(project => project.cover).map(project => `### ${project.id} · ${markdown(project.name)}\n\n${markdown(project.summary)}\n\n[![${markdown(project.coverAlt)}](${markdownUrl(project.cover)})](projects/${directoryOf(project)}/README.md)`);
  return ['| 编号 | 子项目 / 研究文档 | 摘要 | 状态 | 上游 | Web |', '| --- | --- | --- | --- | --- | --- |', ...rows, ...(previews.length ? ['', ...previews.map(preview => `${preview}\n`)] : [])].join('\n').trimEnd();
}

function replaceIndex(readme, index) {
  requireValue(readme.split(startMarker).length === 2 && readme.split(endMarker).length === 2, 'README 必须包含且只包含一对 PROJECTS 标记');
  const start = readme.indexOf(startMarker) + startMarker.length;
  const end = readme.indexOf(endMarker);
  requireValue(start < end, 'README 索引标记顺序不正确');
  return `${readme.slice(0, start)}\n${index}\n${readme.slice(end)}`;
}

export async function synchronize(root, check = false) {
  const catalog = await readCatalog(root);
  const readmePath = path.join(root, 'README.md');
  const current = await readFile(readmePath, 'utf8');
  const expected = replaceIndex(current, renderReadmeIndex(catalog));
  if (check) requireValue(current === expected, 'README 索引与清单不一致，请运行 npm run sync');
  else if (current !== expected) await writeFile(readmePath, expected);
  return catalog;
}

function renderSite(catalog) {
  const projects = catalog.projects;
  const done = projects.filter(project => project.status === '已完成').length;
  const demos = projects.filter(project => demoUrl(catalog, project)).length;
  const cards = projects.map(project => {
    const directory = directoryOf(project);
    const demo = project.demo ?? (project.publishDir ? `projects/${directory}/` : null);
    const cover = project.cover ? `assets/${directory}${path.extname(project.cover).toLowerCase()}` : null;
    return `<article class="project-card">
      ${cover ? `<a class="cover" href="${html(catalog.repository)}/blob/HEAD/projects/${directory}/README.md"><img src="${html(cover)}" alt="${html(project.coverAlt)}" loading="lazy"></a>` : `<div class="number-cover" aria-hidden="true"><span>${project.id}</span></div>`}
      <div class="card-content"><div class="card-meta"><span>PROJECT ${project.id}</span><span class="status">${html(project.status)}</span></div>
      <h2>${html(project.name)}</h2><p>${html(project.summary)}</p>
      ${project.tags.length ? `<ul class="tags" aria-label="项目标签">${project.tags.map(tag => `<li>${html(tag)}</li>`).join('')}</ul>` : ''}
      <div class="card-links"><a href="${html(catalog.repository)}/blob/HEAD/projects/${directory}/README.md">研究文档 ↗</a><a href="${html(project.source)}">上游仓库 ↗</a>${demo ? `<a class="demo-link" href="${html(demo)}">打开演示 ↗</a>` : ''}</div></div>
    </article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="按固定编号整理优秀 GitHub 项目的研究、复现、图片与 Web 演示。"><title>GitHub 项目研究库</title><link rel="stylesheet" href="styles.css"></head>
<body>
  <header class="site-header"><a class="brand" href="./"><span class="brand-mark" aria-hidden="true">R</span> GitHub 项目研究库</a><a href="${html(catalog.repository)}">仓库与文档 ↗</a></header>
  <main>
    <section class="hero"><p class="eyebrow">RESEARCH / BUILD / RECORD</p><h1>发现好项目，<br>研究它如何工作。</h1><p class="hero-description">记录优秀开源项目的设计思路、复现过程与研究结论。<br>按固定编号持续积累，让每一次探索都有迹可循。</p>
    <div class="stats"><div><strong>${projects.length}</strong><span>研究项目</span></div><div><strong>${done}</strong><span>完成研究</span></div><div><strong>${demos}</strong><span>演示入口</span></div></div></section>
    <section class="catalog" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">PROJECT INDEX</p><h2 id="catalog-title">项目索引</h2></div><span class="sort-note">按加入顺序 · 固定编号</span></div>
    ${projects.length ? `<div class="project-grid">${cards}</div>` : `<div class="empty-state"><span class="empty-number" aria-hidden="true">001</span><div><h3>从第一个值得研究的项目开始</h3><p>这里将展示项目摘要、研究状态、截图和 Web 演示。</p><a href="${html(catalog.repository)}/blob/HEAD/docs/project-guide.md">查看项目管理指南 ↗</a></div></div>`}
    </section>
  </main>
  <footer><span>持续研究 · 持续记录</span><a href="${html(catalog.repository)}">查看完整研究文档 ↗</a></footer>
</body></html>\n`;
}

export async function buildSite(root) {
  const catalog = await synchronize(root, true);
  const output = path.resolve(root, '_site');
  requireValue(inside(path.resolve(root), output) && path.basename(output) === '_site', '构建输出必须是仓库内的 _site/');
  // Verify the exact resolved target before replacing previous build output.
  try { requireValue(!(await lstat(output)).isSymbolicLink(), '_site 不能是符号链接'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'index.html'), renderSite(catalog));
  await cp(path.join(root, 'site/styles.css'), path.join(output, 'styles.css'));
  await writeFile(path.join(output, '.nojekyll'), '');
  for (const project of catalog.projects) {
    const directory = directoryOf(project);
    if (project.cover) await cp(path.join(root, project.cover), path.join(output, 'assets', `${directory}${path.extname(project.cover).toLowerCase()}`));
    if (project.publishDir) await cp(path.join(root, project.publishDir), path.join(output, 'projects', directory), { recursive: true });
  }
  return catalog;
}

export async function createProject(root, options) {
  const catalog = await synchronize(root, true);
  const max = Math.max(0, ...catalog.projects.map(project => Number(project.id)));
  requireValue(Number.isSafeInteger(max + 1), '项目编号超出安全整数范围');
  const project = {
    id: String(max + 1).padStart(3, '0'),
    slug: options.slug,
    name: options.name,
    summary: options.summary ?? '待补充研究价值与主要能力。',
    source: options.repo,
    status: '待研究',
    tags: [],
    cover: null,
    coverAlt: '',
    publishDir: null,
    demo: null,
  };
  requireValue(typeof project.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.slug), 'slug 必须使用小写英文字母、数字和短横线');
  requireValue(!catalog.projects.some(existing => existing.slug === project.slug), `slug 已存在：${project.slug}`);
  plainText(project.name, 'name');
  plainText(project.summary, 'summary');
  httpsUrl(project.source, 'repo', true);
  const directory = directoryOf(project);
  const destination = path.join(root, 'projects', directory);
  const fields = { ...project, directory };
  // Read and render all templates before any writes, so missing templates leave no partial project.
  const templates = await Promise.all(['README.md', 'notes/research.md', 'web/README.md'].map(async relative => {
    const content = await readFile(path.join(root, 'templates/project', relative), 'utf8');
    return { relative, content: content.replace(/\{\{(\w+)\}\}/gu, (_, key) => key === 'source' ? markdownUrl(fields[key]) : markdown(fields[key])) };
  }));
  await mkdir(destination);
  for (const template of templates) {
    const target = path.join(destination, template.relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, template.content);
  }
  await mkdir(path.join(destination, 'assets'));
  await writeFile(path.join(destination, 'assets/.gitkeep'), '');
  catalog.projects.push(project);
  await writeFile(path.join(root, 'projects/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  await synchronize(root);
  return project;
}
