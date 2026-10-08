import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(project, 'web/realistic/assets');
const metadataRoot = path.join(project, 'assets/realistic-source-metadata');
const offline = process.argv.includes('--cached');
const maxBytes = 30 * 1024 * 1024;
const headers = { 'User-Agent': 'TidewaterRealisticSceneExperiment/0.1 asset-build' };
const licenseUrl = 'https://polyhaven.com/license';
const materials = ['coast_sand_01', 'grass_ground', 'rocky_terrain', 'painted_plaster_wall', 'wood_floor'];
const models = ['rock_moss_set_01', 'grass_bermuda_01'];
const manifest = {
  format: 'tidewater-realistic-assets.v1',
  generatedAt: new Date().toISOString(),
  runtimeNetwork: 'local-only',
  origin: 'Existing CC0 materials and scanned models selected and assembled by the coding model; these files are not AI-generated assets.',
  license: 'CC0-1.0',
  licenseUrl,
  materials: {},
  models: {},
  environments: {},
  files: [],
};
let totalBytes = 0;

async function fetchBytes(url) {
  if (offline) throw new Error(`Missing cached resource: ${url}`);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function metadata(id, endpoint = 'files') {
  const file = path.join(metadataRoot, `${id}-${endpoint}.json`);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await fetchBytes(`https://api.polyhaven.com/${endpoint}/${id}`);
  const value = JSON.parse(bytes.toString('utf8'));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

async function download(relative, entry, assetId) {
  const file = path.resolve(assetRoot, relative);
  if (!file.startsWith(assetRoot + path.sep)) throw new Error(`Unsafe asset path: ${relative}`);
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await fetchBytes(entry.url);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  if (entry.size !== undefined && bytes.length !== entry.size) throw new Error(`Wrong asset size: ${relative}`);
  if (entry.md5 && createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error(`Asset source checksum mismatch: ${relative}`);
  totalBytes += bytes.length;
  if (totalBytes > maxBytes) throw new Error('Realistic asset bundle exceeded 30 MiB budget');
  manifest.files.push({ file: relative, assetId, source: entry.url, license: 'CC0-1.0', licenseUrl, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  return relative;
}

await mkdir(assetRoot, { recursive: true });
await mkdir(metadataRoot, { recursive: true });

for (const id of materials) {
  const files = await metadata(id);
  const info = await metadata(id, 'info');
  const paths = {};
  for (const [slot, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['rough', 'Rough']]) {
    const entry = files[key]?.['1k']?.jpg;
    if (!entry) throw new Error(`Material ${id} is missing the ${slot} JPG map`);
    const relative = `textures/${id}-${slot}.jpg`;
    // Reuse the exact previously downloaded CC0 wood maps where available.
    if (id === 'wood_floor') {
      try {
        const prior = await readFile(path.resolve(project, `../011-solaris/web/studio/assets/textures/${id}-${slot}.jpg`));
        await mkdir(path.join(assetRoot, 'textures'), { recursive: true });
        await writeFile(path.join(assetRoot, relative), prior);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    paths[slot] = await download(relative, entry, id);
  }
  manifest.materials[id] = { name: info.name ?? id, page: `https://polyhaven.com/a/${id}`, authors: info.authors, resolution: '1k', dimensionsMm: info.dimensions, paths };
  console.log(`Prepared material ${id}`);
}

for (const id of models) {
  const files = await metadata(id);
  const info = await metadata(id, 'info');
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry) throw new Error(`Model ${id} has no 1k glTF`);
  const file = await download(`models/${id}/${id}.gltf`, entry, id);
  for (const [relative, include] of Object.entries(entry.include ?? {})) await download(`models/${id}/${relative}`, include, id);
  manifest.models[id] = { name: info.name ?? id, page: `https://polyhaven.com/a/${id}`, authors: info.authors, resolution: '1k', file, tris: info.tris };
  if (files.Alpha?.['1k']?.png) {
    // The upstream glTF does not wire the separate foliage mask into its material.
    manifest.models[id].alphaMap = await download(`models/${id}/textures/${id}_alpha_1k.png`, files.Alpha['1k'].png, id);
    manifest.models[id].alphaTest = 0.45;
  }
  console.log(`Prepared model ${id}`);
}

const priorRoot = path.resolve(project, '../011-solaris/web/studio');
const priorManifest = JSON.parse(await readFile(path.join(priorRoot, 'assets/manifest.json'), 'utf8'));
for (const name of ['coastal-day.hdr', 'coastal-sunset.hdr']) {
  const relative = `environment/${name}`;
  const prior = priorManifest.files.find(entry => entry.file === `assets/environment/${name}`);
  if (!prior?.source || !prior.license.startsWith('CC0')) throw new Error(`Unknown HDR provenance: ${name}`);
  const bytes = await readFile(path.join(priorRoot, prior.file));
  if (createHash('sha256').update(bytes).digest('hex') !== prior.sha256) throw new Error(`Existing HDR checksum mismatch: ${name}`);
  await mkdir(path.join(assetRoot, 'environment'), { recursive: true });
  await writeFile(path.join(assetRoot, relative), bytes);
  await download(relative, { url: prior.source, size: prior.bytes }, name);
  const id = name === 'coastal-day.hdr' ? 'kloofendal_48d_partly_cloudy_puresky' : 'qwantani_sunset_puresky';
  manifest.environments[name.replace('.hdr', '')] = { file: relative, page: `https://polyhaven.com/a/${id}`, source: prior.source, license: prior.license };
}

manifest.totalBytes = totalBytes;
await writeFile(path.join(assetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${manifest.files.length} verified files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB, all available locally.`);
