import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { makeStoredZip, crc32, safeArchivePath, inspectBinaryGLTF, inspectGeometryTree, shareIdenticalSnapshotGeometries, repackBinaryGLTFLosslessly } from '../web/scene-delivery-core.js';

assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
for (const invalid of ['/outside', '../outside', 'nested/../outside', 'C:/outside', 'nested\\outside', 'empty//part', 'nul\0file']) {
  assert.throws(() => safeArchivePath(invalid));
}
assert.throws(() => makeStoredZip([{ path: 'a', bytes: new Uint8Array() }, { path: 'a', bytes: new Uint8Array() }]));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tidewater-delivery-'));
const archive = path.join(temporary, 'fixture.zip');
await fs.writeFile(archive, makeStoredZip([
  { path: 'index.html', bytes: new TextEncoder().encode('<h1>Scene</h1>') },
  { path: 'models/场景.bin', bytes: new Uint8Array([0, 255, 13, 10, 42]) },
]));
const deliverySource = await fs.readFile(new URL('../web/scene-delivery.js', import.meta.url), 'utf8');
const inventorySource = deliverySource.slice(deliverySource.indexOf('export const PORTABLE_RUNTIME_FILES'), deliverySource.indexOf('const encode')).replace('export const', 'const');
const inventory = vm.runInNewContext(`${inventorySource} PORTABLE_RUNTIME_FILES`);
const packaged = new Set(inventory);
for (const file of inventory) {
  const source = await fs.readFile(new URL(`../web/${file}`, import.meta.url));
  if (file.endsWith('.js')) {
    const withoutDocs = source.toString().replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    for (const match of withoutDocs.matchAll(/^\s*import(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gmu)) {
      const specifier = match[1];
      const target = specifier === 'three' ? 'realistic/vendor/three.module.js' : specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) : null;
      assert.ok(target && packaged.has(target), `Missing runtime dependency: ${file} -> ${specifier}`);
    }
  } else if (file.endsWith('.gltf')) {
    const model = JSON.parse(source);
    for (const resource of [...(model.buffers ?? []), ...(model.images ?? [])]) {
      if (!resource.uri) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), resource.uri));
      assert.ok(packaged.has(target), `Missing model resource: ${file} -> ${resource.uri}`);
    }
  }
}
const serverSource = deliverySource.slice(deliverySource.indexOf('const launchNode'), deliverySource.indexOf('const launchPython'));
const serverPath = path.join(temporary, 'serve.mjs');
await fs.writeFile(serverPath, vm.runInNewContext(`${serverSource} launchNode`));
const serverSyntax = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
assert.equal(serverSyntax.status, 0, serverSyntax.stderr);
const python = process.env.TIDEWATER_TEST_PYTHON || 'C:/Users/yun68/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const checked = spawnSync(python, ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("models/场景.bin")==bytes([0,255,13,10,42]); assert z.read("index.html")==b"<h1>Scene</h1>"; print("ZIP independent reader passed")', archive], { encoding: 'utf8' });
assert.equal(checked.status, 0, checked.stderr);
function glbFixture(json, payload = new Uint8Array(4)) {
  const encoded = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(encoded.length / 4) * 4;
  const binLength = Math.ceil(payload.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + padded + 8 + binLength), bytes = new Uint8Array(buffer), view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + padded); bytes.set(encoded, 20);
  view.setUint32(20 + padded, binLength, true); view.setUint32(24 + padded, 0x004e4942, true); bytes.set(payload, 28 + padded);
  return buffer;
}
const fixture = glbFixture({ asset: { version: '2.0' }, nodes: [{ extras: { sourceId: 'my-cabin' } }], buffers: [{ byteLength: 4 }] });
assert.deepEqual(inspectBinaryGLTF(fixture).sourceIds, ['my-cabin']);
const corrupted = fixture.slice(0); new DataView(corrupted).setUint32(8, 0, true);
assert.throws(() => inspectBinaryGLTF(corrupted));
assert.throws(() => inspectBinaryGLTF(glbFixture({ asset: { version: '2.0' }, buffers: [{ uri: 'https://external.test/geometry.bin' }] })));
const oneImage = new Uint8Array(256).map((_, index) => index), twoImages = new Uint8Array(512);
twoImages.set(oneImage); twoImages.set(oneImage, 256);
const duplicateImages = glbFixture({ asset: { version: '2.0' }, buffers: [{ byteLength: 512 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 256 }, { buffer: 0, byteOffset: 256, byteLength: 256 }],
  images: [{ bufferView: 0, mimeType: 'image/png' }, { bufferView: 1, mimeType: 'image/png' }],
  nodes: [{ extras: { sourceId: 'preserved-source' } }] }, twoImages);
const repackedImages = await repackBinaryGLTFLosslessly(duplicateImages), repackedData = inspectBinaryGLTF(repackedImages.buffer);
assert.equal(repackedImages.stats.reusedBufferViews, 1); assert.equal(repackedData.json.bufferViews.length, 2);
assert.equal(repackedData.json.bufferViews[0].byteOffset, repackedData.json.bufferViews[1].byteOffset);
assert.deepEqual(repackedData.json.images.map(image => image.bufferView), [0, 1]);
assert.deepEqual(repackedData.sourceIds, ['preserved-source']);
assert.deepEqual(new Uint8Array(repackedImages.buffer, repackedData.binaryByteOffset, 256), oneImage);
assert.ok(repackedImages.buffer.byteLength < duplicateImages.byteLength);
twoImages[300] ^= 1;
const differentImages = glbFixture({ asset: { version: '2.0' }, buffers: [{ byteLength: 512 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 256 }, { buffer: 0, byteOffset: 256, byteLength: 256 }] }, twoImages);
assert.equal((await repackBinaryGLTFLosslessly(differentImages)).buffer, differentImages);
const positions = { itemSize: 3, count: 3, array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  getX: index => positions.array[index * 3], getY: index => positions.array[index * 3 + 1], getZ: index => positions.array[index * 3 + 2] };
const mesh = { isMesh: true, userData: { sourceId: 'my-cabin' }, matrix: { elements: [1, 0, 0, 1] },
  geometry: { attributes: { position: positions }, getAttribute: () => positions, index: { array: new Uint16Array([0, 1, 2]), count: 3 } },
  material: { roughness: .8, metalness: .1, opacity: 1, color: { r: .6, g: .4, b: .2 } } };
const root = { traverse: callback => callback(mesh), updateMatrixWorld: () => {} };
assert.equal(inspectGeometryTree(root, ['my-cabin']).triangles, 1);
assert.throws(() => inspectGeometryTree(root, ['missing-source']));
mesh.geometry.index.array[2] = 9; assert.throws(() => inspectGeometryTree(root)); mesh.geometry.index.array[2] = 2;
positions.array[1] = NaN; assert.throws(() => inspectGeometryTree(root)); positions.array[1] = 0;
mesh.material.roughness = Infinity; assert.throws(() => inspectGeometryTree(root));
function duplicateGeometry(delta = 0) {
  const position = { itemSize: 3, count: 3, normalized: false, array: new Float32Array([0, 0, 0, 1 + delta, 0, 0, 0, 1, 0]) };
  return { name: '', userData: {}, attributes: { position }, index: { itemSize: 1, count: 3, array: new Uint16Array([0, 1, 2]) },
    groups: [], drawRange: { start: 0, count: Infinity }, morphAttributes: {} };
}
const repeated = [0, 0, .001].map((delta, index) => ({ geometry: duplicateGeometry(delta), userData: { sourceId: `entity-${index}` }, matrix: { elements: [index, 0, 0, 1] } }));
const uniqueNormal = duplicateGeometry(); uniqueNormal.attributes.normal = { itemSize: 3, count: 3, array: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]) };
const uniqueGroups = duplicateGeometry(); uniqueGroups.groups.push({ start: 0, count: 3, materialIndex: 0 });
const uniqueAttributeMode = duplicateGeometry(); uniqueAttributeMode.attributes.position.isInstancedBufferAttribute = true; uniqueAttributeMode.attributes.position.meshPerAttribute = 2;
repeated.push({ geometry: uniqueNormal }, { geometry: uniqueGroups }, { geometry: uniqueAttributeMode });
const dedup = await shareIdenticalSnapshotGeometries({ traverse: callback => repeated.forEach(callback) });
assert.equal(repeated[0].geometry, repeated[1].geometry);
assert.notEqual(repeated[0].geometry, repeated[2].geometry);
assert.notEqual(repeated[0].geometry, repeated[3].geometry);
assert.notEqual(repeated[0].geometry, repeated[4].geometry);
assert.notEqual(repeated[0].geometry, repeated[5].geometry);
assert.deepEqual(repeated.slice(0, 3).map(node => node.userData.sourceId), ['entity-0', 'entity-1', 'entity-2']);
assert.deepEqual(repeated.slice(0, 3).map(node => node.matrix.elements[0]), [0, 1, 2]);
assert.equal(dedup.geometriesBefore, 6); assert.equal(dedup.geometriesAfter, 5); assert.ok(dedup.sharedAttributeBytes > 0);
await fs.rm(archive); await fs.rm(serverPath); await fs.rmdir(temporary);
console.log(checked.stdout.trim());
console.log('GLB integrity, finite geometry, material, source ID and archive path checks passed.');
console.log(`Runtime dependency closure passed: ${inventory.length} files; Node launch script syntax passed.`);
console.log('Exact geometry byte sharing passed; different positions, normals and groups remain independent; node IDs and transforms preserved.');
console.log('Lossless BIN repack passed; identical image bytes shared, view/image IDs retained, different image bytes unchanged.');
