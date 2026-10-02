import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalog, renderReadmeIndex, synchronize, buildSite, createProject, directoryOf } from '../lib/hub.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'research-hub-test-'));
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(root).startsWith('research-hub-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'projects'));
  await writeFile(path.join(root, 'projects/catalog.json'), JSON.stringify({
    repository: 'https://github.com/owner/research',
    siteUrl: 'https://owner.github.io/research/',
    projects: [],
  }));
  await writeFile(path.join(root, 'README.md'), '# Test hub\n\n<!-- PROJECTS:START -->\n<!-- PROJECTS:END -->\n\nKeep this prose.\n');
  await cp(path.join(repositoryRoot, 'templates'), path.join(root, 'templates'), { recursive: true });
  await cp(path.join(repositoryRoot, 'site'), path.join(root, 'site'), { recursive: true });
  await synchronize(root);
  return root;
}

async function mutate(root, callback) {
  const filename = path.join(root, 'projects/catalog.json');
  const catalog = JSON.parse(await readFile(filename, 'utf8'));
  callback(catalog);
  await writeFile(filename, JSON.stringify(catalog));
}

function options(slug = 'example', extra = {}) {
  return { slug, name: '示例项目', repo: 'https://github.com/owner/example_repo', summary: '研究设计和实现。', ...extra };
}

test('empty hub builds without fabricated projects', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const output = await readFile(path.join(root, '_site/index.html'), 'utf8');
  assert.match(output, /从第一个值得研究的项目开始/u);
  assert.match(output, /<html lang="zh-CN">/u);
  assert.doesNotMatch(output, /class="project-card"/u);
});

test('new projects retain archived numbers and generate working source links', async t => {
  const root = await fixture(t);
  const first = await createProject(root, options());
  assert.equal(directoryOf(first), '001-example');
  const readme = await readFile(path.join(root, 'projects/001-example/README.md'), 'utf8');
  assert.match(readme, /\(https:\/\/github\.com\/owner\/example_repo\)/u);
  assert.doesNotMatch(readme, /\{\{\w+\}\}/u);
  await mutate(root, catalog => { catalog.projects[0].status = '已归档'; });
  await synchronize(root);
  const second = await createProject(root, options('another'));
  assert.equal(second.id, '002');
  const index = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(index, /Keep this prose/u);
  assert.match(index, /已归档/u);
  await synchronize(root, true);
});

test('index sorts numeric IDs across the 999 boundary', async t => {
  const root = await fixture(t);
  const project = { name: 'Title', summary: 'Summary', status: '研究中', source: 'https://github.com/owner/repo', tags: [], demo: null, publishDir: null, cover: null };
  await mutate(root, catalog => { catalog.projects = ['1000', '010', '002'].map(id => ({ ...project, id, slug: `project-${id}` })); });
  for (const id of ['1000', '010', '002']) {
    const directory = path.join(root, 'projects', `${id}-project-${id}`);
    await mkdir(directory);
    await writeFile(path.join(directory, 'README.md'), '# Project');
  }
  const catalog = await readCatalog(root);
  const index = renderReadmeIndex(catalog);
  assert.ok(index.indexOf('| 002 |') < index.indexOf('| 010 |'));
  assert.ok(index.indexOf('| 010 |') < index.indexOf('| 1000 |'));
  await synchronize(root);
  const next = await createProject(root, options('next'));
  assert.equal(next.id, '1001');
});

test('cover and multiple Web outputs use independent project paths', async t => {
  const root = await fixture(t);
  await createProject(root, options('first'));
  await createProject(root, options('second', { name: '<script>alert(1)</script>' }));
  const coverPath = 'projects/001-first/assets/cover.svg';
  await writeFile(path.join(root, coverPath), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  for (const directory of ['001-first', '002-second']) {
    await writeFile(path.join(root, 'projects', directory, 'web/index.html'), `<h1>${directory}</h1>`);
  }
  await mutate(root, catalog => {
    catalog.projects.reverse();
    for (const project of catalog.projects) project.publishDir = `projects/${directoryOf(project)}/web`;
    const first = catalog.projects.find(project => project.id === '001');
    first.cover = coverPath;
    first.coverAlt = '示例画面';
    first.demo = 'https://example.com/demo';
  });
  await synchronize(root);
  const catalog = await readCatalog(root);
  assert.deepEqual(catalog.projects.map(project => project.id), ['001', '002']);
  await buildSite(root);
  assert.match(await readFile(path.join(root, '_site/projects/001-first/index.html'), 'utf8'), /001-first/u);
  assert.match(await readFile(path.join(root, '_site/projects/002-second/index.html'), 'utf8'), /002-second/u);
  assert.match(await readFile(path.join(root, '_site/assets/001-first.svg'), 'utf8'), /<svg/u);
  const index = await readFile(path.join(root, '_site/index.html'), 'utf8');
  assert.match(index, /href="https:\/\/example.com\/demo"/u);
  assert.match(index, /href="projects\/002-second\/"/u);
  assert.match(index, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(index, /<script>/u);
  await buildSite(root); // Rebuilding replaces the previous output safely.
});

test('duplicate slug and invalid repository do not add project entries', async t => {
  const root = await fixture(t);
  await createProject(root, options());
  await assert.rejects(createProject(root, options()), /slug 已存在/u);
  await assert.rejects(createProject(root, options('bad', { repo: 'https://example.com/owner/repo' })), /GitHub 仓库/u);
  assert.equal((await readCatalog(root)).projects.length, 1);
});

test('stale root index fails until synchronized', async t => {
  const root = await fixture(t);
  await createProject(root, options());
  await mutate(root, catalog => { catalog.projects[0].summary = '新的研究摘要'; });
  await assert.rejects(synchronize(root, true), /npm run sync/u);
  await synchronize(root);
  await synchronize(root, true);
});

test('invalid cover, missing entry point and cross-project publication fail', async t => {
  const root = await fixture(t);
  await createProject(root, options());
  await mutate(root, catalog => { catalog.projects[0].cover = 'projects/001-example/assets/missing.png'; });
  await assert.rejects(readCatalog(root), /ENOENT/u);
  await mutate(root, catalog => { catalog.projects[0].cover = null; catalog.projects[0].publishDir = 'projects/001-example/web'; });
  await assert.rejects(readCatalog(root), /ENOENT/u);
  await mutate(root, catalog => { catalog.projects[0].publishDir = 'templates/project'; });
  await assert.rejects(readCatalog(root), /对应子项目目录/u);
});

test('unregistered numbered directories are detected', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'projects/005-orphan'));
  await assert.rejects(readCatalog(root), /未登记/u);
});

test('published output rejects environment files', async t => {
  const root = await fixture(t);
  await createProject(root, options());
  await writeFile(path.join(root, 'projects/001-example/web/index.html'), '<h1>Demo</h1>');
  await writeFile(path.join(root, 'projects/001-example/web/.env'), 'EXAMPLE=fixture');
  await mutate(root, catalog => { catalog.projects[0].publishDir = 'projects/001-example/web'; });
  await assert.rejects(readCatalog(root), /不应发布/u);
});
