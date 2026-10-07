import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix4, Quaternion, Vector3 } from '../web/studio/vendor/three.module.js';

// Verify reused files against the existing source registry, without copying,
// downloading, rewriting or silently replacing a model or texture.
const studio = path.resolve(fileURLToPath(new URL('../web/studio/', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(studio, 'assets/manifest.json'), 'utf8'));
const models = [
  ['sofa', 'sofa_02', 2728],
  ['chair', 'modern_arm_chair_01', 8916],
  ['table-glass', 'modern_coffee_table_01', 4504],
  ['table-solid', 'modern_coffee_table_02', 13645],
  ['lamp', 'desk_lamp_arm_01', 24102],
  ['plant', 'potted_plant_04', 8929],
];
const prefixes = models.map(([, source]) => `assets/models/${source}/`);
const entries = manifest.files.filter(entry => prefixes.some(prefix => entry.file.startsWith(prefix)) || entry.file === 'assets/environment/coastal-day.hdr');
assert.equal(manifest.runtimeNetwork, 'local-only');
assert.equal(entries.length, 37, 'Complete six model folders and one local HDR');
const dataByFile = new Map();

function safePath(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(!relative.includes('\\') && !relative.startsWith('/') && !relative.split('/').includes('..') && !/^[a-z]+:/i.test(relative), `Non-local resource: ${relative}`);
  const resolved = path.resolve(studio, relative);
  assert.ok(resolved.startsWith(studio + path.sep));
  return resolved;
}
function resource(base, uri) {
  assert.equal(typeof uri, 'string');
  const relative = `${base}/${uri}`;
  safePath(relative);
  assert.ok(dataByFile.has(relative), `Resource absent from source registry: ${relative}`);
  return dataByFile.get(relative);
}
function jpegSize(data) {
  assert.equal(data.readUInt16BE(0), 0xffd8);
  assert.equal(data.readUInt16BE(data.length - 2), 0xffd9, 'JPEG end marker');
  let offset = 2;
  while (offset + 4 < data.length) {
    assert.equal(data[offset++], 0xff);
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= data.length, 'Truncated JPEG');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)];
    offset += length;
  }
  throw new Error('Missing JPEG frame dimensions');
}

for (const entry of entries) {
  assert.ok(entry.license.startsWith('CC0 — Poly Haven'), `Source license: ${entry.file}`);
  assert.ok(entry.source.startsWith('https://dl.polyhaven.org/file/ph-assets/'), `Official asset source: ${entry.file}`);
  assert.ok(!dataByFile.has(entry.file));
  const data = await fs.readFile(safePath(entry.file));
  assert.equal(data.length, entry.bytes, `Byte count: ${entry.file}`);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256, `SHA-256: ${entry.file}`);
  dataByFile.set(entry.file, data);
}
const hdr = dataByFile.get('assets/environment/coastal-day.hdr');
assert.match(hdr.subarray(0, 300).toString('ascii'), /#\?RADIANCE/);
assert.match(hdr.subarray(0, 300).toString('ascii'), /FORMAT=32-bit_rle_rgbe/);

let triangles = 0, textureCount = 0;
const report = [];
for (const [id, source, expectedTriangles] of models) {
  const base = `assets/models/${source}`;
  const gltf = JSON.parse(dataByFile.get(`${base}/${source}.gltf`));
  assert.equal(gltf.asset.version, '2.0');
  assert.ok(!(gltf.extensionsRequired || []).some(extension => /draco|meshopt|basisu/i.test(extension)), 'No extra decoder dependency');
  assert.equal((gltf.animations || []).length, 0, 'Source carries no animation clips');
  const buffers = gltf.buffers.map(buffer => {
    const data = resource(base, buffer.uri);
    assert.equal(data.length, buffer.byteLength);
    return data;
  });
  for (const view of gltf.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= buffers[view.buffer].length, 'Buffer view range');
  for (const image of gltf.images) {
    assert.deepEqual(jpegSize(resource(base, image.uri)), [1024, 1024], 'Complete local 1k source texture');
    textureCount++;
  }
  for (const texture of gltf.textures) assert.ok(gltf.images[texture.source], 'Texture source exists');
  for (const material of gltf.materials) {
    for (const texture of [material.normalTexture, material.occlusionTexture, material.emissiveTexture, material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture]) {
      if (texture) assert.ok(gltf.textures[texture.index], 'PBR material texture exists');
    }
  }
  let count = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    assert.ok(!primitive.extensions?.KHR_draco_mesh_compression);
    assert.ok(gltf.materials[primitive.material], 'Source primitive keeps its material');
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    assert.equal(accessor.type, 'VEC3');
    assert.equal(accessor.componentType, 5126);
    const view = gltf.bufferViews[accessor.bufferView], data = buffers[view.buffer];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    assert.ok(offset + (accessor.count - 1) * stride + 12 <= (view.byteOffset || 0) + view.byteLength);
    for (let vertex = 0; vertex < accessor.count; vertex++) for (let axis = 0; axis < 3; axis++) {
      const value = data.readFloatLE(offset + vertex * stride + axis * 4);
      assert.ok(Number.isFinite(value), 'Finite original vertex');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(min[axis] - accessor.min[axis]) < 1e-6);
      assert.ok(Math.abs(max[axis] - accessor.max[axis]) < 1e-6);
    }
    const indices = primitive.indices === undefined ? null : gltf.accessors[primitive.indices];
    const indexCount = indices?.count ?? accessor.count;
    assert.equal(indexCount % 3, 0);
    if (indices) {
      const indexView = gltf.bufferViews[indices.bufferView], indexData = buffers[indexView.buffer];
      const [method, bytes] = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4] }[indices.componentType] || [];
      assert.ok(method && indices.type === 'SCALAR');
      const start = (indexView.byteOffset || 0) + (indices.byteOffset || 0);
      for (let index = 0; index < indexCount; index++) assert.ok(indexData[method](start + index * bytes) < accessor.count, 'Index references an original vertex');
    }
    count += indexCount / 3;
  }
  assert.equal(count, expectedTriangles);
  const bounds = new Box3(), reached = new Set();
  function visit(index, parent, ancestors = new Set()) {
    assert.ok(!ancestors.has(index), 'Acyclic scene hierarchy');
    const node = gltf.nodes[index]; assert.ok(node);
    reached.add(index);
    const local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      bounds.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(world));
    }
    const next = new Set(ancestors).add(index);
    for (const child of node.children || []) visit(child, world, next);
  }
  for (const index of gltf.scenes[gltf.scene || 0].nodes) visit(index, new Matrix4());
  assert.equal(reached.size, gltf.nodes.length, 'Every original node is retained in the scene');
  assert.ok(bounds.getSize(new Vector3()).toArray().every(value => Number.isFinite(value) && value > 0));
  const modelBytes = entries.filter(entry => entry.file.startsWith(base + '/')).reduce((sum, entry) => sum + entry.bytes, 0);
  report.push({ id, source, triangles: count, meshes: gltf.meshes.length, materials: gltf.materials.length, textures: gltf.images.length, bytes: modelBytes, rawBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
  triangles += count;
}
assert.equal(triangles, 62824);
assert.equal(textureCount, 24);
const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
assert.equal(totalBytes, 13845953);
console.log(JSON.stringify({ status: 'passed', models: report, files: entries.length, triangles, textureCount, totalBytes, sourceManifest: 'web/studio/assets/manifest.json', runtimeNetwork: 'local-only', browserVisualReview: 'recorded separately' }, null, 2));
