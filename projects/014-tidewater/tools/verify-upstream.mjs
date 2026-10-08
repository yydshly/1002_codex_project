// Read-only verification by default. --write-manifest explicitly rebuilds only the manifest,
// requiring the pinned archive's local source and byte-identical vendored copies first.
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '4811ba48d795197de5621985f404e765c0b7c0ef';
const REPOSITORY = 'https://github.com/dgreenheck/tidewater';
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_RELATIVE = `.runtime/source/tidewater-${COMMIT}`;
const RUNTIME_RELATIVE = 'web/runtime';
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'checks', 'upstream-manifest.json');
const SOURCE_ROOT = path.join(PROJECT_ROOT, SOURCE_RELATIVE);
const RUNTIME_ROOT = path.join(PROJECT_ROOT, RUNTIME_RELATIVE);
const NOTICES = ['LICENSE', 'CREDITS.md'];
const slash = (value) => value.split(path.sep).join('/');
const args = process.argv.slice(2);
if (args.some((arg) => !['--write-manifest', '--manifest-only'].includes(arg))
  || (args.includes('--write-manifest') && args.includes('--manifest-only'))) {
  console.error('用法：node tools/verify-upstream.mjs [--manifest-only | --write-manifest]');
  process.exitCode = 1;
} else {
  try { await main(); }
  catch (error) { console.error(`上游校验失败：${error.message}`); process.exitCode = 1; }
}

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function listFiles(root, relative = '') {
  const files = [];
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const item = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`不接受符号链接：${slash(item)}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, item));
    else if (entry.isFile()) files.push(slash(item));
    else throw new Error(`不接受非常规文件：${slash(item)}`);
  }
  return files.sort();
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\')
    || relative.split('/').some((part) => !part || part === '.' || part === '..') || path.isAbsolute(relative)) {
    throw new Error(`清单路径不合法：${String(relative)}`);
  }
  const resolved = path.resolve(root, relative);
  const within = path.relative(root, resolved);
  if (path.isAbsolute(within) || within === '..' || within.startsWith(`..${path.sep}`)) throw new Error('清单路径超出根目录。');
  return resolved;
}

async function digest(root, relative) {
  const target = safePath(root, relative);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`不是常规文件：${relative}`);
  const buffer = await readFile(target);
  return { sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.byteLength };
}

function counts(files) {
  return {
    sourceFiles: files.filter((file) => file.category === 'source').length,
    publicFiles: files.filter((file) => file.category === 'public').length,
    noticeFiles: files.filter((file) => file.category === 'notice').length,
    totalFiles: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
  };
}

async function buildManifest() {
  if (!await exists(SOURCE_ROOT)) throw new Error(`重建清单需要 ${SOURCE_RELATIVE}，默认校验不需要该目录。`);
  const sources = await listFiles(path.join(SOURCE_ROOT, 'src'));
  const assets = await listFiles(path.join(SOURCE_ROOT, 'public'));
  const publicRoots = (await readdir(path.join(SOURCE_ROOT, 'public'), { withFileTypes: true }))
    .map((entry) => ({ path: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const entries = [
    ...sources.map((file) => ({ category: 'source', upstream: `src/${file}`, vendored: `src/${file}` })),
    ...assets.map((file) => ({ category: 'public', upstream: `public/${file}`, vendored: file })),
    ...NOTICES.map((file) => ({ category: 'notice', upstream: file, vendored: file })),
  ].sort((a, b) => a.upstream.localeCompare(b.upstream, 'en'));
  const files = [];
  for (const entry of entries) files.push({ ...entry, ...await digest(SOURCE_ROOT, entry.upstream) });
  return {
    manifestVersion: 1,
    hashAlgorithm: 'sha256',
    upstream: {
      project: 'Tidewater', repository: REPOSITORY, commit: COMMIT,
      archive: `https://codeload.github.com/dgreenheck/tidewater/zip/${COMMIT}`,
    },
    runtimeRoot: RUNTIME_RELATIVE,
    optionalSourceRoot: SOURCE_RELATIVE,
    license: {
      code: 'MIT', copyright: 'Copyright (c) 2026 DRG Software Solutions LLC',
      retainedLicense: 'web/runtime/LICENSE', retainedCredits: 'web/runtime/CREDITS.md',
      thirdPartyAssets: 'Third-party assets retain the individual licenses documented in CREDITS.md and their asset directories; this is not a blanket MIT license for every asset.',
      retainedAssetNotices: assets.filter((file) => /(?:^|\/)(?:CREDITS\.md|LICENSE[^/]*)$/.test(file)).map((file) => `web/runtime/${file}`),
    },
    scope: 'All upstream src files, all public files copied to the runtime root, and LICENSE/CREDITS.md. Local index.html and editor-bridge.js are outside the upstream-copy scope.',
    publicRoots,
    counts: counts(files),
    files,
  };
}

function validateManifest(manifest) {
  if (manifest.manifestVersion !== 1 || manifest.hashAlgorithm !== 'sha256'
    || manifest.upstream?.commit !== COMMIT || manifest.upstream?.repository !== REPOSITORY
    || manifest.runtimeRoot !== RUNTIME_RELATIVE || manifest.optionalSourceRoot !== SOURCE_RELATIVE
    || !Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.publicRoots)) {
    throw new Error('清单版本、来源或路径与固定上游版本不符。');
  }
  const upstream = new Set(), vendored = new Set();
  for (const file of manifest.files) {
    safePath(SOURCE_ROOT, file.upstream); safePath(RUNTIME_ROOT, file.vendored);
    if (upstream.has(file.upstream) || vendored.has(file.vendored)) throw new Error('清单含重复路径。');
    upstream.add(file.upstream); vendored.add(file.vendored);
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error(`清单摘要不合法：${file.upstream}`);
    const mappingValid = file.category === 'source' ? file.upstream.startsWith('src/') && file.upstream === file.vendored
      : file.category === 'public' ? file.upstream === `public/${file.vendored}`
        : file.category === 'notice' && NOTICES.includes(file.upstream) && file.upstream === file.vendored;
    if (!mappingValid) throw new Error(`清单分类或复制映射不合法：${file.upstream}`);
  }
  if (JSON.stringify(manifest.counts) !== JSON.stringify(counts(manifest.files))) throw new Error('清单文件数量或总字节数不符。');
  if (!NOTICES.every((notice) => upstream.has(notice))) throw new Error('清单缺少保留的许可证或署名。');
  const roots = new Set();
  for (const root of manifest.publicRoots) {
    if (typeof root.path !== 'string' || !/^[\w.-]+$/.test(root.path) || ['.', '..', 'src', ...NOTICES, 'index.html', 'editor-bridge.js'].includes(root.path)
      || !['directory', 'file'].includes(root.kind) || roots.has(root.path)) throw new Error('清单 public 根目录不合法。');
    roots.add(root.path);
  }
  for (const file of manifest.files.filter((entry) => entry.category === 'public')) {
    if (!roots.has(file.vendored.split('/')[0])) throw new Error(`公开资产缺少根目录记录：${file.upstream}`);
  }
}

function sameInventory(actual, expected, label, problems) {
  const got = new Set(actual), want = new Set(expected);
  for (const item of want) if (!got.has(item)) problems.push(`${label}缺少：${item}`);
  for (const item of got) if (!want.has(item)) problems.push(`${label}有未登记文件：${item}`);
}

async function verify(manifest, withSource) {
  validateManifest(manifest);
  const problems = [];
  const sourceFiles = manifest.files.filter((file) => file.category === 'source');
  const publicFiles = manifest.files.filter((file) => file.category === 'public');
  sameInventory(await listFiles(path.join(RUNTIME_ROOT, 'src')), sourceFiles.map((file) => file.vendored.slice(4)), 'runtime/src ', problems);
  for (const root of manifest.publicRoots) {
    const actual = root.kind === 'directory' ? (await listFiles(path.join(RUNTIME_ROOT, root.path))).map((file) => `${root.path}/${file}`) : [root.path];
    const expected = publicFiles.filter((file) => file.vendored === root.path || file.vendored.startsWith(`${root.path}/`)).map((file) => file.vendored);
    sameInventory(actual, expected, `runtime/${root.path} `, problems);
  }
  if (withSource) {
    sameInventory(await listFiles(path.join(SOURCE_ROOT, 'src')), sourceFiles.map((file) => file.upstream.slice(4)), '上游 src ', problems);
    sameInventory(await listFiles(path.join(SOURCE_ROOT, 'public')), publicFiles.map((file) => file.upstream.slice(7)), '上游 public ', problems);
  }
  for (const file of manifest.files) {
    for (const [root, relative, label] of [[RUNTIME_ROOT, file.vendored, 'runtime'], ...(withSource ? [[SOURCE_ROOT, file.upstream, '上游副本']] : [])]) {
      try {
        const actual = await digest(root, relative);
        if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes) problems.push(`${label}哈希/字节数不符：${relative}`);
      } catch (error) { problems.push(`${label}读取失败：${relative} (${error.code || error.message})`); }
    }
  }
  if (problems.length) throw new Error(`${problems.length} 项不一致：\n${problems.slice(0, 20).join('\n')}${problems.length > 20 ? '\n…' : ''}`);
  return manifest.counts;
}

async function main() {
  const writing = args.includes('--write-manifest');
  const manifest = writing ? await buildManifest() : JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const withSource = !args.includes('--manifest-only') && await exists(SOURCE_ROOT);
  const result = await verify(manifest, withSource);
  // Write only after every copied source/asset/notice matches the pinned source.
  if (writing) { await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'); console.log('已生成 checks/upstream-manifest.json'); }
  console.log(`上游 ${COMMIT}：${result.sourceFiles} 个源码文件、${result.publicFiles} 个公开资产、${result.noticeFiles} 个许可/署名文件，${result.totalFiles} 个文件 SHA-256 全部一致。`);
  console.log(withSource ? '已同时核验 vendored runtime 与本地固定版本上游副本。' : '按清单独立校验完成；未依赖 .runtime 临时源码目录。');
}
