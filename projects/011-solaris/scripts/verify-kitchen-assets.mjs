import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { Box3, Matrix4, Vector3, Quaternion } from '../web/studio/vendor/three.module.js';

const root = path.resolve(fileURLToPath(new URL('../web/assets/kitchen/', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.runtimeRequiresNetwork, false);
assert.deepEqual(manifest.models.map(model => model.id).sort(), ['apple', 'avocado', 'lemon', 'onion']);
const fileData = new Map();
function safeFile(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(!relative.includes('\\') && !relative.startsWith('/') && !relative.split('/').includes('..') && !/^[a-z]+:/i.test(relative), `Unsafe asset path ${relative}`);
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(root + path.sep));
  return resolved;
}
function jpegSize(data) {
  assert.equal(data.readUInt16BE(0), 0xffd8, 'JPEG signature missing');
  let offset = 2;
  while (offset + 4 < data.length) {
    assert.equal(data[offset++], 0xff, 'JPEG marker missing');
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= data.length, 'Truncated JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)];
    offset += length;
  }
  throw new Error('JPEG has no supported frame dimensions');
}
for (const file of manifest.files) {
  assert.equal(file.license, 'CC0-1.0');
  assert.ok(file.source.startsWith('https://dl.polyhaven.org/file/ph-assets/Models/'));
  assert.ok(!fileData.has(file.file), `Duplicate manifest file ${file.file}`);
  const data = await fs.readFile(safeFile(file.file));
  assert.equal(data.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), file.sha256, `SHA-256 ${file.file}`);
  assert.equal(crypto.createHash('md5').update(data).digest('hex'), file.upstreamMd5, `Official MD5 ${file.file}`);
  if (file.file.endsWith('.jpg')) assert.deepEqual(jpegSize(data), [1024, 1024], `1k texture ${file.file}`);
  fileData.set(file.file, data);
}
assert.equal([...fileData.values()].reduce((sum, data) => sum + data.length, 0), manifest.totalBytes);
let primitives = 0, textureReferences = 0, triangles = 0;
for (const model of manifest.models) {
  assert.equal(model.license, 'CC0-1.0');
  assert.equal(model.source, `https://polyhaven.com/a/${model.sourceId}`);
  assert.ok(model.authors.length > 0);
  assert.equal(model.file, model.gltf);
  const prefix = path.posix.dirname(model.file);
  function resource(uri) {
    assert.equal(typeof uri, 'string');
    assert.ok(!uri.includes('..') && !/^(https?:|data:|\/)/.test(uri), `Non-local glTF resource ${uri}`);
    const relative = `${prefix}/${uri}`;
    safeFile(relative); assert.ok(fileData.has(relative), `Unmanifested glTF resource ${relative}`);
    return fileData.get(relative);
  }
  const document = JSON.parse(fileData.get(model.file));
  assert.equal(document.asset.version, '2.0');
  assert.ok(!(document.extensionsRequired || []).some(name => /draco|meshopt|basisu/i.test(name)), 'External compression dependency');
  assert.equal(document.nodes.length, model.nodes);
  assert.equal(document.meshes.length, model.meshes);
  assert.equal(document.materials.length, model.materials);
  assert.equal(document.images.length, model.textures);
  const buffers = document.buffers.map(buffer => {
    const data = resource(buffer.uri); assert.equal(data.length, buffer.byteLength); return data;
  });
  for (const view of document.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= buffers[view.buffer].length, 'Buffer view out of range');
  for (const image of document.images) { jpegSize(resource(image.uri)); textureReferences++; }
  let modelTriangles = 0;
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, 'Expected triangle topology');
    assert.ok(!primitive.extensions?.KHR_draco_mesh_compression, 'Geometry must load without Draco');
    const accessor = document.accessors[primitive.attributes.POSITION], view = document.bufferViews[accessor.bufferView], binary = buffers[view.buffer];
    assert.equal(accessor.type, 'VEC3'); assert.equal(accessor.componentType, 5126);
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < accessor.count; vertex++) for (let axis = 0; axis < 3; axis++) {
      const value = binary.readFloatLE(offset + vertex * stride + axis * 4);
      assert.ok(Number.isFinite(value), 'Non-finite source vertex');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(min[axis] - accessor.min[axis]) < 1e-7, 'Declared minimum does not match vertices');
      assert.ok(Math.abs(max[axis] - accessor.max[axis]) < 1e-7, 'Declared maximum does not match vertices');
    }
    const indices = primitive.indices !== undefined ? document.accessors[primitive.indices] : null;
    const count = indices ? indices.count : accessor.count;
    assert.equal(count % 3, 0);
    if (indices) {
      const indexView = document.bufferViews[indices.bufferView], data = buffers[indexView.buffer];
      const methods = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4] };
      const [method, width] = methods[indices.componentType] || [];
      assert.ok(method && indices.type === 'SCALAR');
      const indexOffset = (indexView.byteOffset || 0) + (indices.byteOffset || 0);
      for (let index = 0; index < count; index++) assert.ok(data[method](indexOffset + index * width) < accessor.count, 'Index exceeds source vertex count');
    }
    modelTriangles += count / 3; primitives++;
  }
  assert.equal(modelTriangles, model.triangles); triangles += modelTriangles;
  const bounds = new Box3();
  function visit(index, parent) {
    const node = document.nodes[index], local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]));
    const transform = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
      const accessor = document.accessors[primitive.attributes.POSITION];
      bounds.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(transform));
    }
    for (const child of node.children || []) visit(child, transform);
  }
  for (const index of document.scenes[document.scene || 0].nodes) visit(index, new Matrix4());
  assert.deepEqual(bounds.min.toArray(), model.bounds.min);
  assert.deepEqual(bounds.max.toArray(), model.bounds.max);
  assert.deepEqual(bounds.getSize(new Vector3()).toArray(), model.bounds.size);
  assert.ok(model.bounds.size.every(value => value > 0 && value < 0.3), 'Unexpected whole-food dimensions');
}
assert.equal(manifest.files.length, 20);
assert.equal(textureReferences, 12);
console.log(`Kitchen source assets verified: ${manifest.models.length} CC0 models, ${manifest.files.length} files, ${triangles} triangles, ${primitives} primitives, ${textureReferences} local 1k JPEG textures, ${manifest.totalBytes} bytes. All upstream MD5 and local SHA-256 digests match; geometry and node bounds verified; no CDN or decoder required at runtime.`);
