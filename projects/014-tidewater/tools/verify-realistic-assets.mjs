import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'web/realistic/assets');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const checks = [];
const modelStats = {};
let verifiedBytes = 0;

assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.runtimeNetwork, 'local-only');
assert.equal(Object.keys(manifest.materials).length, 5);
assert.equal(Object.keys(manifest.models).length, 2);
assert.equal(Object.keys(manifest.environments).length, 2);
checks.push({ name: 'Expected CC0 bundle: five materials, two models and two environments', passed: true });

for (const entry of manifest.files) {
  const file = path.resolve(root, entry.file);
  assert.ok(file.startsWith(root + path.sep), `Path escapes asset directory: ${entry.file}`);
  assert.equal(entry.license, 'CC0-1.0');
  assert.equal(new URL(entry.source).hostname, 'dl.polyhaven.org');
  const bytes = await readFile(file);
  assert.equal(bytes.length, entry.bytes, `Size mismatch: ${entry.file}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Hash mismatch: ${entry.file}`);
  verifiedBytes += bytes.length;
}
assert.equal(verifiedBytes, manifest.totalBytes);
assert.ok(verifiedBytes < 30 * 1024 * 1024);
checks.push({ name: 'Every local asset matches its recorded source hash and bundle stays below 30 MiB', passed: true });

for (const [id, item] of Object.entries(manifest.models)) {
  const file = path.resolve(root, item.file);
  const gltf = JSON.parse(await readFile(file, 'utf8'));
  for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    assert.ok(resource.uri && !resource.uri.includes('://') && !resource.uri.startsWith('data:'), 'Runtime model must use relative local resources');
    const resourcePath = path.resolve(path.dirname(file), resource.uri);
    assert.ok(resourcePath.startsWith(root + path.sep));
    const resourceBytes = await readFile(resourcePath);
    if (resource.byteLength !== undefined) assert.equal(resourceBytes.length, resource.byteLength);
    assert.ok(manifest.files.some(entry => path.resolve(root, entry.file) === resourcePath), 'glTF resource must have provenance');
  }
  const tris = gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((subtotal, primitive) => subtotal + (gltf.accessors[primitive.indices]?.count ?? gltf.accessors[primitive.attributes.POSITION].count) / 3, 0), 0);
  assert.ok(tris > 0);
  modelStats[id] = { meshCount: gltf.meshes.length, triangles: tris };
  checks.push({ name: `${id}: all glTF buffers and textures resolve locally`, passed: true });
}

const grass = manifest.models.grass_bermuda_01;
assert.ok(grass.alphaMap);
const mask = await readFile(path.join(root, grass.alphaMap));
assert.equal(mask.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.ok(grass.alphaTest > 0 && grass.alphaTest < 1);
checks.push({ name: 'Grass has a verified PNG cutout mask for the upstream opaque glTF material', passed: true });

const report = { format: 'tidewater-realistic-asset-checks.v1', checkedAt: new Date().toISOString(), passed: checks.length, total: checks.length, files: manifest.files.length, bytes: verifiedBytes, modelStats, checks };
await mkdir(path.join(project, 'checks'), { recursive: true });
await writeFile(path.join(project, 'checks/realistic-asset-results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
