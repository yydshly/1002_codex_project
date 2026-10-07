import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const directory = new URL('../web/assets/landmark/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', directory), 'utf8'));
const data = await fs.readFile(new URL(manifest.runtime.file, directory));
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(data.length, manifest.runtime.bytes, 'Source byte count changed');
assert.equal(crypto.createHash('sha256').update(data).digest('hex'), manifest.runtime.sha256, 'Original asset hash changed');
assert.equal(manifest.runtime.sha256, '2158098219d3f2e8030d26edc3d7cdf119d1fb01f3d9a9bef62c4a45d8a2c49d', 'Published mirror digest changed');
assert.ok(data.length >= 84, 'Truncated STL header');
const triangles = data.readUInt32LE(80);
assert.equal(data.length, 84 + triangles * 50, 'Binary STL size does not match triangle count');
assert.equal(triangles, manifest.runtime.triangles);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let zeroNormals = 0, nearDegenerateFaces = 0;
for (let face = 0; face < triangles; face++) {
  const offset = 84 + face * 50;
  const normal = [0, 1, 2].map(axis => data.readFloatLE(offset + axis * 4));
  assert.ok(normal.every(Number.isFinite), `Non-finite normal ${face}`);
  if (Math.hypot(...normal) < 1e-8) zeroNormals++;
  assert.equal(data.readUInt16LE(offset + 48), 0, `Unexpected face attribute at ${face}`);
  const vertices = [0, 1, 2].map(vertex => [0, 1, 2].map(axis => {
    const value = data.readFloatLE(offset + 12 + vertex * 12 + axis * 4);
    assert.ok(Number.isFinite(value), `Non-finite vertex ${face}:${vertex}:${axis}`);
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    return value;
  }));
  const u = vertices[1].map((value, axis) => value - vertices[0][axis]);
  const v = vertices[2].map((value, axis) => value - vertices[0][axis]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (Math.hypot(...cross) < 1e-10) nearDegenerateFaces++;
}
for (let axis = 0; axis < 3; axis++) {
  assert.ok(Math.abs(min[axis] - manifest.inspection.bounds.min[axis]) < 1e-10, `Min bound ${axis}`);
  assert.ok(Math.abs(max[axis] - manifest.inspection.bounds.max[axis]) < 1e-10, `Max bound ${axis}`);
}
assert.equal(zeroNormals, manifest.inspection.zeroNormals);
assert.equal(nearDegenerateFaces, manifest.inspection.nearDegenerateFaces);
assert.equal(manifest.runtime.textures, 0);
assert.equal(manifest.runtime.externalResources, 0);
const license = await fs.readFile(new URL('LICENSE.md', directory), 'utf8');
assert.ok(license.includes('https://www.cooperhewitt.org/open-source-at-cooper-hewitt/mansionmodel/'));
assert.ok(license.includes('CC0'));
assert.ok((await fs.readFile(new URL('README.md', directory), 'utf8')).includes('exterior printing model'));
console.log(`Landmark CC0 source verified: ${triangles.toLocaleString('en-US')} triangles; ${data.length.toLocaleString('en-US')} bytes; source hash matches; all vertices finite; original ${zeroNormals} zero-normal faces preserved; no textures or external resources.`);
