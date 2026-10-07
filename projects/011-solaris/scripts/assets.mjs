import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(project, 'web/studio');
const cache = path.join(project, 'assets/source-metadata');
const headers = { 'User-Agent': 'AtelierSceneWorkbench/0.1 asset-build' };
const manifest = { product: 'ATELIER', updatedAt: '2026-10-04', runtimeNetwork: 'local-only', files: [] };
const offline = process.argv.includes('--cached');
const models = ['sofa_02', 'modern_arm_chair_01', 'modern_coffee_table_02', 'modern_coffee_table_01', 'desk_lamp_arm_01', 'potted_plant_04'];

async function metadata(id) {
  const file = path.join(cache, `${id}.json`);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (offline || error.code !== 'ENOENT') throw error; }
  const response = await fetch(`https://api.polyhaven.com/files/${id}`, { headers });
  if (!response.ok) throw new Error(`Asset metadata ${id}: ${response.status}`);
  const data = await response.json();
  await writeFile(file, JSON.stringify(data, null, 2));
  return data;
}

async function download(relative, source, license = 'CC0 — Poly Haven') {
  const file = path.resolve(target, relative);
  if (!file.startsWith(target + path.sep)) throw new Error('Asset escaped product directory');
  await mkdir(path.dirname(file), { recursive: true });
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) {
    if (offline || error.code !== 'ENOENT') throw error;
    const response = await fetch(source, { headers });
    if (!response.ok) throw new Error(`Download ${relative}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(file, bytes);
  }
  manifest.files.push({ file: relative, source, license, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

await mkdir(cache, { recursive: true });
await mkdir(target, { recursive: true });
for (const id of models) {
  const data = await metadata(id);
  const gltf = data.gltf['1k'].gltf;
  await download(`assets/models/${id}/${id}.gltf`, gltf.url);
  // API-provided relative names are checked by download before writing.
  for (const [relative, info] of Object.entries(gltf.include)) await download(`assets/models/${id}/${relative}`, info.url);
  console.log(`Prepared ${id}`);
}
for (const [id, slots] of [['wood_floor', ['diff', 'nor_gl', 'rough']], ['fabric_pattern_07', ['diff', 'nor_gl', 'rough']]]) {
  const data = await metadata(id);
  for (const slot of slots) {
    const key = { diff: 'Diffuse', rough: 'Rough' }[slot] ?? slot;
    const entry = (data[key] ?? data[slot] ?? (slot === 'diff' ? data.col_1 : undefined))?.['1k']?.jpg;
    if (!entry) throw new Error(`Missing ${id}/${slot}`);
    await download(`assets/textures/${id}-${slot}.jpg`, entry.url);
  }
}

const existing = path.resolve(project, '../004-threejs-worlds/web');
await cp(path.join(existing, 'vendor'), path.join(target, 'vendor'), { recursive: true });
await mkdir(path.join(target, 'vendor/addons/controls'), { recursive: true });
await download('vendor/addons/controls/OrbitControls.js', 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/jsm/controls/OrbitControls.js', 'MIT — Three.js contributors');
for (const name of ['coastal-day.hdr', 'coastal-sunset.hdr']) {
  await mkdir(path.join(target, 'assets/environment'), { recursive: true });
  await copyFile(path.join(existing, 'assets', name), path.join(target, 'assets/environment', name));
  const origin = JSON.parse(await readFile(path.join(existing, 'assets/manifest.json'), 'utf8')).files.find(f => f.file === `assets/${name}`);
  manifest.files.push({ ...origin, file: `assets/environment/${name}` });
}
const upstreamAssets = JSON.parse(await readFile(path.join(existing, 'assets/manifest.json'), 'utf8')).files;
for (const entry of upstreamAssets.filter(f => f.file.startsWith('vendor/'))) manifest.files.push(entry);
const core = JSON.parse(await readFile(path.join(existing, 'vendor/manifest.json'), 'utf8'));
for (const entry of core.files) manifest.files.push({ ...entry, file: `vendor/${entry.file}`, license: 'MIT — Three.js contributors' });
await writeFile(path.join(target, 'assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.files.length} downloaded files; all runtime resources are local.`);
