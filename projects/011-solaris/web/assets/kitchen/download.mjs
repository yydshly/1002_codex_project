// Build-time only. No external request is made by the product runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { Box3, Matrix4, Vector3, Quaternion } from '../../studio/vendor/three.module.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const cache = path.resolve(root, '../../..', '.cache');
const headers = { 'User-Agent': 'ATELIER-KitchenWorkbench/0.6-local-asset-build' };
const definitions = [
  { id: 'avocado', sourceId: 'food_avocado_01', name: '鳄梨', presentation: 'Whole ripe Hass avocado, uncut and unpeeled' },
  { id: 'onion', sourceId: 'yellow_onion', name: '黄洋葱', presentation: 'Whole yellow onion with papery skin, unpeeled' },
  { id: 'lemon', sourceId: 'lemon', name: '柠檬', presentation: 'Whole lemon with rind, unsliced' },
  { id: 'apple', sourceId: 'food_apple_01', name: '红苹果', presentation: 'Whole red apple with stem, unsliced' }
];
async function metadataCache(name, url) {
  await fs.mkdir(cache, { recursive: true });
  try { return JSON.parse(await fs.readFile(path.join(cache, name), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}: ${url}`);
  const value = await response.json();
  await fs.writeFile(path.join(cache, name), JSON.stringify(value));
  return value;
}
const index = await metadataCache('kitchen-polyhaven-index.json', 'https://api.polyhaven.com/assets?t=models');
const manifest = { schemaVersion: 1, assetLibrary: 'Poly Haven', license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license', downloadedAt: '2026-10-05', runtimeRequiresNetwork: false, resolution: '1k', models: [], files: [] };
const hash = (algorithm, data) => crypto.createHash(algorithm).update(data).digest('hex');
async function download(relative, source) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe relative asset: ${relative}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  let data;
  try { data = await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!data) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(source.url, { headers, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${source.url}`);
        data = Buffer.from(await response.arrayBuffer());
        if (data.length !== source.size || hash('md5', data) !== source.md5) throw new Error(`Source checksum mismatch: ${relative}`);
        await fs.writeFile(target, data); break;
      } catch (error) { lastError = error; }
    }
    if (!data) throw lastError;
  }
  if (data.length !== source.size || hash('md5', data) !== source.md5) throw new Error(`Existing source checksum mismatch: ${relative}`);
  manifest.files.push({ file: relative.replaceAll('\\', '/'), source: source.url, license: 'CC0-1.0', bytes: data.length, upstreamMd5: source.md5, sha256: hash('sha256', data) });
  return data;
}
for (const definition of definitions) {
  const metadata = await metadataCache(`kitchen-${definition.sourceId}-files.json`, `https://api.polyhaven.com/files/${definition.sourceId}`);
  const source = metadata.gltf['1k'].gltf, folder = `models/${definition.sourceId}`;
  const file = `${folder}/${definition.sourceId}.gltf`;
  const bytes = await download(file, source), document = JSON.parse(bytes);
  const entries = Object.entries(source.include);
  for (let start = 0; start < entries.length; start += 4) await Promise.all(entries.slice(start, start + 4).map(([relative, item]) => download(`${folder}/${relative}`, item)));
  const bounds = new Box3();
  const meshDetails = [];
  function visit(id, parent) {
    const node = document.nodes[id], local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]));
    const transform = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const box = new Box3(); let triangles = 0;
      for (const primitive of document.meshes[node.mesh].primitives) {
        const accessor = document.accessors[primitive.attributes.POSITION];
        box.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(transform));
        triangles += (primitive.indices !== undefined ? document.accessors[primitive.indices].count : accessor.count) / 3;
      }
      bounds.union(box);
      meshDetails.push({ node: node.name || `node-${id}`, mesh: node.mesh, triangles, min: box.min.toArray(), max: box.max.toArray() });
    }
    for (const child of node.children || []) visit(child, transform);
  }
  for (const node of document.scenes[document.scene || 0].nodes) visit(node, new Matrix4());
  const size = bounds.getSize(new Vector3()).toArray();
  manifest.models.push({ ...definition, file, gltf: file, source: `https://polyhaven.com/a/${definition.sourceId}`, sourceFiles: `https://api.polyhaven.com/files/${definition.sourceId}`, authors: Object.keys(index[definition.sourceId].authors), bytes: source.size + Object.values(source.include).reduce((sum, item) => sum + item.size, 0), license: 'CC0-1.0', resolution: '1k', unit: 'metres per glTF 2.0; individual source asset scale, not food portion weight', axis: '+Y up after original node transforms', nodes: document.nodes.length, meshes: document.meshes.length, materials: document.materials.length, textures: document.images.length, triangles: meshDetails.reduce((sum, mesh) => sum + mesh.triangles, 0), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size }, meshDetails, centerAndGroundTranslation: [-bounds.getCenter(new Vector3()).x, -bounds.min.y, -bounds.getCenter(new Vector3()).z], changes: 'None; original glTF, binary geometry and JPEG textures retained. No fake ingredient substitutes, slices, peels or generated food texture.' });
  console.log(`Downloaded ${definition.id}: ${manifest.models.at(-1).bytes} bytes; ${meshDetails.reduce((sum, mesh) => sum + mesh.triangles, 0)} triangles; size ${size}`);
}
manifest.files.sort((a, b) => a.file.localeCompare(b.file));
manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Kitchen source assets: ${manifest.models.length} models; ${manifest.files.length} original files; ${manifest.totalBytes} bytes.`);
