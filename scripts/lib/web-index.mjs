import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const escape = value => String(value).replace(/[&<>"']/gu, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decodeTitle = value => value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, entity => {
  const named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const number = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3,-1),16) : Number(entity.slice(2,-1));
  return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
});
export const pageGroups = ['正式网页', '辅助与验证', '历史回放', '本机工具'];

export function excluded(project, relative) {
  return (project.publishExclude ?? []).some(p => relative === p || relative.startsWith(`${p}/`)) || Object.hasOwn(project.publishDownloads ?? {}, relative);
}

export async function collectWebPages(root, catalog) {
  const result = [];
  for (const project of catalog.projects) {
    const directory = `${project.id}-${project.slug}`;
    const entries = [];
    async function visit(relative = '') {
      for (const item of await readdir(path.join(root, project.publishDir, relative), { withFileTypes: true })) {
        const file = path.posix.join(relative, item.name);
        if (excluded(project, file)) continue;
        // Asset HTML is a source/license mirror, except standalone saved proposal viewers.
        if (file.startsWith('assets/') && file !== 'assets/camp-proposals' && !file.startsWith('assets/camp-proposals/')) continue;
        if (item.isDirectory()) await visit(file);
        else if (item.isFile() && file.endsWith('.html')) {
          const source = await readFile(path.join(root, project.publishDir, file), 'utf8');
          const match = source.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
          const title = match ? decodeTitle(match[1]).replace(/\s+/gu, ' ').trim() || file : file;
          const override = project.webPages?.find(p => p.path === file);
          const group = override?.group ?? (/^(versions|previous)\//u.test(file) || file === 'archived-demo.html' ? '历史回放'
            : /^(runtime|checks)\//u.test(file) || /(?:preview|studio|benchmark|portable|component)\.html$/u.test(file) ? '辅助与验证' : '正式网页');
          const note = override?.note ?? (group === '辅助与验证' ? '辅助页面；部分需要主页面传入数据。' : '');
          entries.push({ path: file, title: override?.title ?? title, group, note, href: `projects/${directory}/${file}` });
        }
      }
    }
    if (project.publishDir) await visit();
    for (const entry of project.webPages ?? []) {
      if (entries.some(p => p.path === entry.path)) continue;
      const file = entry.path.split(/[?#]/u)[0];
      await stat(path.join(root, project.publishDir, file));
      entries.push({ ...entry, note: entry.note ?? '', group: entry.group ?? '正式网页', href: `projects/${directory}/${entry.path}` });
    }
    for (const entry of project.localPages ?? []) {
      entries.push({ title: entry.title, note: entry.note, group: '本机工具', href: `${catalog.repository}/blob/HEAD/${entry.path}` });
    }
    entries.sort((a,b) => pageGroups.indexOf(a.group) - pageGroups.indexOf(b.group) || (a.path === 'index.html' ? -1 : b.path === 'index.html' ? 1 : a.href.localeCompare(b.href)));
    result.push({ id: project.id, name: project.name, entries });
  }
  return result;
}

export function renderWebIndex(projects) {
  const count = projects.reduce((n,p) => n + p.entries.filter(e => e.group !== '本机工具').length, 0);
  return `<section class="web-index" id="web-index" aria-labelledby="web-index-title"><div class="section-heading"><div><p class="eyebrow">ALL WEB PAGES</p><h2 id="web-index-title">全部网页入口</h2></div><span>${count} 个网页 · 按项目与用途整理</span></div>
    <label class="web-search">查找网页<input id="web-search" type="search" placeholder="输入编号、项目、页面或用途" autocomplete="off"></label><p id="web-search-status" role="status">${count} 个网页；需要本机服务的功能在入口旁注明。</p>
    <nav class="project-shortcuts" aria-label="项目快速定位">${projects.map(p => `<a href="#web-project-${p.id}">${p.id} ${escape(p.name.split(' · ')[0])}</a>`).join('')}</nav>
    ${projects.map(project => `<section class="web-project" id="web-project-${project.id}"><h3><span>${project.id}</span> ${escape(project.name)}</h3>${project.entries.length ? pageGroups.map(group => {
      const pages = project.entries.filter(e => e.group === group);
      if (!pages.length) return '';
      return `<details class="web-group"${group === '正式网页' ? ' open' : ''}><summary>${group} <span>${pages.length}</span></summary><ul>${pages.map(entry => `<li class="web-entry" data-search="${escape(`${project.id} ${project.name} ${entry.title} ${entry.path ?? ''} ${entry.note}`.toLowerCase())}"><a href="${escape(entry.href)}">${escape(entry.title)} ↗</a>${entry.note ? `<span>${escape(entry.note)}</span>` : ''}${entry.group === '本机工具' ? '<small>本机启动说明</small>' : ''}</li>`).join('')}</ul></details>`;
    }).join('') : '<p class="no-web">当前仅有研究文档，尚未制作独立网页。</p>'}</section>`).join('')}</section>`;
}

export async function addReturnNavigation(output, projects) {
  for (const project of projects) for (const entry of project.entries) {
    // Saved standalone deliveries keep their original file hashes intact.
    if (!entry.path || entry.path.startsWith('assets/') || entry.path.includes('?') || entry.path.includes('#') || entry.group === '辅助与验证') continue;
    const filename = path.join(output, entry.href);
    let source = await readFile(filename, 'utf8');
    const relative = path.posix.relative(path.posix.dirname(entry.href), '.') || '.';
    source = source.replace(/<\/head>/iu, `<link rel="stylesheet" href="${relative}/hub-return.css"></head>`)
      .replace(/<\/body>/iu, `<nav class="hub-return" aria-label="总站导航"><a href="${relative}/#web-project-${project.id}">← 返回总入口</a></nav></body>`);
    await writeFile(filename, source);
  }
}

export async function checkPageLinks(output) {
  const errors = [];
  let checked = 0;
  async function visit(directory) {
    for (const item of await readdir(directory, {withFileTypes:true})) {
      const file = path.join(directory,item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.name.endsWith('.html')) {
        const relative = path.relative(output,file).split(path.sep).join('/');
        if (relative.includes('/assets/') && !relative.includes('/camp-proposals/')) continue;
        const source = await readFile(file,'utf8');
        for (const match of source.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)) {
          const href = match[1].replaceAll('&amp;','&');
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(href)) continue;
          const url = new URL(href, `https://hub.test/${relative}`);
          if (!(url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) continue;
          checked++;
          try {
            const target = path.join(output,decodeURIComponent(url.pathname));
            const info = await stat(target);
            if (info.isDirectory()) await stat(path.join(target,'index.html'));
          } catch { errors.push(`${relative}: ${href}`); }
        }
      }
    }
  }
  await visit(output);
  if (errors.length) throw new Error(`网页链接失效（${errors.length}）：\n${errors.join('\n')}`);
  return checked;
}
