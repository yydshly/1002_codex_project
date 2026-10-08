import { readFile, writeFile, mkdir, stat, lstat, readdir, cp, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectWebPages, renderWebIndex, addReturnNavigation, checkPageLinks, excluded, pageGroups } from './web-index.mjs';

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
    if (project.sourceName !== undefined) plainText(project.sourceName, `${project.id} sourceName`);
    plainText(project.summary, `${project.id} summary`);
    if (project.summarySections !== undefined) {
      requireValue(Array.isArray(project.summarySections) && project.summarySections.length > 0, `${project.id} summarySections 必须是非空数组`);
      for (const section of project.summarySections) {
        requireValue(section !== null && typeof section === 'object' && !Array.isArray(section), `${project.id} summarySections 条目必须包含 title 和 text`);
        plainText(section.title, `${project.id} summarySections title`);
        plainText(section.text, `${project.id} summarySections text`);
      }
    }
    httpsUrl(project.source, `${project.id} source`);
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
    for (const relative of [...(project.publishExclude ?? []), ...Object.keys(project.publishDownloads ?? {})]) {
      requireValue(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.startsWith('/') && !relative.split('/').includes('..') && path.posix.normalize(relative) === relative, `${project.id} 发布排除路径不正确`);
    }
    for (const url of Object.values(project.publishDownloads ?? {})) httpsUrl(url, `${project.id} publishDownloads`);
    const pages = new Set();
    for (const page of project.webPages ?? []) {
      requireValue(project.publishDir && typeof page.path === 'string' && !pages.has(page.path), `${project.id} webPages 需要发布目录及唯一页面路径`);
      pages.add(page.path);
      const file = page.path.split(/[?#]/u)[0];
      await projectPath(root, `${project.publishDir}/${file}`, project, `${project.id} webPages`);
      requireValue(file.endsWith('.html') && !excluded(project, file), `${project.id} webPages 必须指向发布的 HTML`);
      plainText(page.title, `${project.id} webPages title`);
      if (page.group !== undefined) requireValue(pageGroups.includes(page.group), `${project.id} webPages group 不正确`);
      if (page.note !== undefined) plainText(page.note, `${project.id} webPages note`);
    }
    for (const page of project.localPages ?? []) {
      await projectPath(root, page.path, project, `${project.id} localPages`);
      plainText(page.title, `${project.id} localPages title`);
      plainText(page.note, `${project.id} localPages note`);
    }
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

function summaryMarkdown(project, separator = '\n\n') {
  return project.summarySections
    ? project.summarySections.map(section => `**${markdown(section.title)}：** ${markdown(section.text)}`).join(separator)
    : markdown(project.summary);
}

function summaryHtml(project) {
  return project.summarySections
    ? `<dl class="project-summary">${project.summarySections.map(section => `<div class="summary-section"><dt>${html(section.title)}</dt><dd>${html(section.text)}</dd></div>`).join('')}</dl>`
    : `<p>${html(project.summary)}</p>`;
}

export function renderReadmeIndex(catalog) {
  if (catalog.projects.length === 0) return '暂未添加研究项目。添加第一个项目后，这里会自动生成按编号排序的摘要、文档与演示索引。';
  const rows = catalog.projects.map(project => {
    const demo = demoUrl(catalog, project);
    return `| ${project.id} | [${markdown(project.name)}](projects/${directoryOf(project)}/README.md) | ${summaryMarkdown(project, '<br>')} | ${project.status} | [${markdown(project.sourceName ?? project.name)}](${markdownUrl(project.source)}) | ${demo ? `[演示](${markdownUrl(demo)})` : '—'} |`;
  });
  const previews = catalog.projects.filter(project => project.cover).map(project => `### ${project.id} · ${markdown(project.name)}\n\n${summaryMarkdown(project)}\n\n[![${markdown(project.coverAlt)}](${markdownUrl(project.cover)})](projects/${directoryOf(project)}/README.md)`);
  return ['| 编号 | 子项目 / 研究文档 | 摘要 | 状态 | 来源 | Web |', '| --- | --- | --- | --- | --- | --- |', ...rows, ...(previews.length ? ['', ...previews.map(preview => `${preview}\n`)] : [])].join('\n').trimEnd();
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

function renderSite(catalog, webProjects) {
  const projects = catalog.projects;
  const done = projects.filter(project => project.status === '已完成').length;
  const demos = projects.filter(project => demoUrl(catalog, project)).length;
  const cards = projects.map(project => {
    const directory = directoryOf(project);
    const demo = project.demo ?? (project.publishDir ? `projects/${directory}/` : null);
    const cover = project.cover ? `assets/${directory}${path.extname(project.cover).toLowerCase()}` : null;
    return `<article class="project-card">
      ${cover ? `<a class="cover" href="${html(demo ?? `${catalog.repository}/blob/HEAD/projects/${directory}/README.md`)}"><img src="${html(cover)}" alt="${html(project.coverAlt)}" loading="lazy"></a>` : `<div class="number-cover" aria-hidden="true"><span>${project.id}</span></div>`}
      <div class="card-content"><div class="card-meta"><span>PROJECT ${project.id}</span><span class="status">${html(project.status)}</span></div>
      <h2>${html(project.name)}</h2>${summaryHtml(project)}
      ${project.tags.length ? `<ul class="tags" aria-label="项目标签">${project.tags.map(tag => `<li>${html(tag)}</li>`).join('')}</ul>` : ''}
      <div class="card-links"><a href="${html(catalog.repository)}/blob/HEAD/projects/${directory}/README.md">研究文档 ↗</a><a href="${html(project.source)}">${html(project.sourceName ?? project.name)} ↗</a>${demo ? `<a class="demo-link" href="${html(demo)}">打开演示 ↗</a>` : ''}</div></div>
    </article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="按固定编号整理优秀 GitHub 项目的研究、复现、图片与 Web 演示。"><title>GitHub 项目研究库</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%2321654e'/%3E%3Ctext x='32' y='45' text-anchor='middle' font-family='Georgia' font-size='44' fill='white'%3ER%3C/text%3E%3C/svg%3E"><link rel="stylesheet" href="styles.css"></head>
<body>
  <header class="site-header"><a class="brand" href="./"><span class="brand-mark" aria-hidden="true">R</span> GitHub 项目研究库</a><nav aria-label="总站导航"><a href="#web-index">全部网页</a><a href="#catalog-title">研究摘要</a><a href="${html(catalog.repository)}">仓库与文档 ↗</a></nav></header>
  <main>
    <section class="hero"><p class="eyebrow">RESEARCH / BUILD / RECORD</p><h1>项目研究与网页总入口</h1><p class="hero-description">从这里进入全部研究网页、交互工作台与历史回放。<br>按项目编号查找，查看能力、运行条件与研究结论。</p>
    <div class="stats"><div><strong>${projects.length}</strong><span>研究项目</span></div><div><strong>${done}</strong><span>完成研究</span></div><div><strong>${demos}</strong><span>演示入口</span></div></div></section>
    ${renderWebIndex(webProjects)}
    <section class="catalog" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">PROJECT INDEX</p><h2 id="catalog-title">项目研究摘要</h2></div><span class="sort-note">按加入顺序 · 固定编号</span></div>
    ${projects.length ? `<div class="project-grid">${cards}</div>` : `<div class="empty-state"><span class="empty-number" aria-hidden="true">001</span><div><h3>从第一个值得研究的项目开始</h3><p>这里将展示项目摘要、研究状态、截图和 Web 演示。</p><a href="${html(catalog.repository)}/blob/HEAD/docs/project-guide.md">查看项目管理指南 ↗</a></div></div>`}
    </section>
  </main>
  <footer><span>持续研究 · 持续记录</span><a href="${html(catalog.repository)}">查看完整研究文档 ↗</a></footer>
<script type="module" src="hub.js"></script></body></html>\n`;
}

export async function buildSite(root) {
  const catalog = await synchronize(root, true);
  const webProjects = await collectWebPages(root, catalog);
  const output = path.resolve(root, '_site');
  requireValue(inside(path.resolve(root), output) && path.basename(output) === '_site', '构建输出必须是仓库内的 _site/');
  // Verify the exact resolved target before replacing previous build output.
  try { requireValue(!(await lstat(output)).isSymbolicLink(), '_site 不能是符号链接'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'index.html'), renderSite(catalog, webProjects));
  await cp(path.join(root, 'site/styles.css'), path.join(output, 'styles.css'));
  await cp(path.join(root, 'site/hub.js'), path.join(output, 'hub.js'));
  await cp(path.join(root, 'site/hub-return.css'), path.join(output, 'hub-return.css'));
  await writeFile(path.join(output, 'web-index.json'), `${JSON.stringify(webProjects, null, 2)}\n`);
  await writeFile(path.join(output, '.nojekyll'), '');
  for (const project of catalog.projects) {
    const directory = directoryOf(project);
    if (project.cover) await cp(path.join(root, project.cover), path.join(output, 'assets', `${directory}${path.extname(project.cover).toLowerCase()}`));
    if (project.publishDir) {
      const sourceRoot = path.join(root, project.publishDir);
      const destination = path.join(output, 'projects', directory);
      await cp(sourceRoot, destination, { recursive: true, filter: source => !excluded(project, path.relative(sourceRoot, source).split(path.sep).join('/')) });
      if (project.slug === 'tidewater') {
        // Frozen snapshots retain their source bytes; repair navigation only in published copies.
        async function repairArchive(folder) {
          for (const item of await readdir(folder, {withFileTypes:true})) {
            const file = path.join(folder,item.name);
            if (item.isDirectory()) await repairArchive(file);
            else if (item.name.endsWith('.html')) {
              const source = await readFile(file,'utf8');
              const updated = source.replace(/href="versions\/([^"]+)"/gu, (match, target) => {
                const link = path.posix.relative(path.relative(destination,path.dirname(file)).split(path.sep).join('/'), `versions/${target}`);
                return `href="${link}"`;
              });
              if (updated !== source) await writeFile(file,updated);
            }
          }
        }
        await repairArchive(path.join(destination,'versions'));
        const incremental = path.join(destination,'versions/2026-10-07-before-fine-scene/web/create.html');
        await writeFile(incremental, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>精细场景改进前 · 增量源码归档</title><link rel="stylesheet" href="../../../../../styles.css"></head><body><main><section class="hero"><h1>精细场景改进前的源文件</h1><p>这个版本保存了创作页面及生成模块的增量源文件，未冻结全部运行依赖。可查看原始代码，或打开依赖完整的只读场景。</p><p><a href="${html(catalog.repository)}/blob/HEAD/projects/${directory}/web/versions/2026-10-07-before-fine-scene/web/create.html">查看原始源码 ↗</a></p><p><a href="../../2026-10-05-scene-assembly-v1/snapshot.html">打开完整场景组装回放 ↗</a></p><p><a href="../../2026-10-07-fine-components-v5/index.html">打开已保存的精修场景 v5 ↗</a></p></section></main></body></html>`);
      }
      // Keep large, optional downloads available through Releases without copying them into Pages.
      if (project.publishDownloads) {
        async function rewriteDownloads(folder) {
          for (const item of await readdir(folder, { withFileTypes: true })) {
            const file = path.join(folder, item.name);
            if (item.isDirectory()) await rewriteDownloads(file);
            else if (item.name.endsWith('.html')) {
              const relative = path.relative(destination, file).split(path.sep).join('/');
              const source = await readFile(file, 'utf8');
              const updated = source.replace(/\bhref="([^"]+)"/gu, (match, href) => {
                const url = new URL(href, `https://hub.test/${relative}`);
                return project.publishDownloads[url.pathname.slice(1)] ? `href="${html(project.publishDownloads[url.pathname.slice(1)])}"` : match;
              });
              if (updated !== source) await writeFile(file, updated);
            }
          }
        }
        await rewriteDownloads(destination);
      }
    }
  }
  await addReturnNavigation(output, webProjects);
  await checkPageLinks(output);
  let totalBytes = 0;
  async function sizeOf(directory) {
    let bytes = 0;
    for (const item of await readdir(directory, {withFileTypes:true})) {
      const file = path.join(directory,item.name);
      bytes += item.isDirectory() ? await sizeOf(file) : (await stat(file)).size;
    }
    return bytes;
  }
  for (const project of catalog.projects.filter(p => p.publishDir)) {
    const directory = path.join(output,'projects',directoryOf(project));
    const manifestFile = path.join(directory,'publication-manifest.json');
    try {
      const manifest = JSON.parse(await readFile(manifestFile,'utf8'));
      const files = [];
      async function inventory(folder) {
        for (const item of await readdir(folder,{withFileTypes:true})) {
          const file = path.join(folder,item.name);
          if (item.isDirectory()) await inventory(file);
          else if (file !== manifestFile) {
            const bytes = await readFile(file);
            files.push({path:path.relative(directory,file).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
          }
        }
      }
      await inventory(directory);
      manifest.files = files.sort((a,b) => a.path.localeCompare(b.path));
      manifest.totalBytes = files.reduce((n,f) => n + f.bytes,0);
      await writeFile(manifestFile,`${JSON.stringify(manifest,null,2)}\n`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  totalBytes = await sizeOf(output);
  requireValue(totalBytes < 1_000_000_000, `Pages 发布包超过 1 GB：${totalBytes} 字节`);
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
    sourceName: options.sourceName === undefined ? options.name : options.sourceName,
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
  plainText(project.sourceName, 'sourceName');
  plainText(project.summary, 'summary');
  httpsUrl(project.source, 'source');
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
