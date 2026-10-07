import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3 } from '../web/studio/vendor/three.module.js';

// Independent source, packed-buffer and posed-geometry verification; this is not browser QA.
const base = path.resolve(fileURLToPath(new URL('../web/underwater/assets/', import.meta.url)));
const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function inside(relative) {
  const target = path.resolve(base, relative);
  assert.ok(target.startsWith(base + path.sep), `Asset escapes registered root: ${relative}`);
  return target;
}
function archived(relative) {
  const target = path.resolve(projectRoot, relative);
  const archiveRoot = path.join(projectRoot, 'assets', 'underwater-source-archives') + path.sep;
  assert.ok(target.startsWith(archiveRoot), `Source archive escapes project root: ${relative}`);
  return target;
}
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const byteSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const reads = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
function parseGlb(relative) {
  const bytes = fs.readFileSync(inside(relative));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (kind === 0x004e4942) binary = chunk;
    offset += length + 8;
  }
  assert.equal(json.asset.version, '2.0');
  assert.ok(binary);
  assert.equal(json.buffers.length, 1);
  assert.ok(!json.buffers[0].uri);
  assert.ok(json.buffers[0].byteLength <= binary.length);
  assert.equal(json.images?.length || 0, 0, 'These sources use face colour rather than textures');
  const accessors = json.accessors.map(a => {
    assert.ok(!a.sparse);
    const view = json.bufferViews[a.bufferView], width = widths[a.type], bytesPerComponent = byteSizes[a.componentType];
    assert.equal(view.buffer, 0);
    assert.ok(width && bytesPerComponent);
    const stride = view.byteStride || width * bytesPerComponent;
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    assert.ok(start + (a.count - 1) * stride + width * bytesPerComponent <= binary.length);
    return Array.from({ length: a.count }, (_, row) => Array.from({ length: width }, (_, col) => {
      let value = binary[reads[a.componentType]](start + row * stride + col * bytesPerComponent);
      assert.ok(Number.isFinite(value));
      if (a.normalized) {
        if (a.componentType === 5121) value /= 255;
        else if (a.componentType === 5123) value /= 65535;
        else throw new Error('Unregistered normalized component');
      }
      return value;
    }));
  });
  return { json, accessors };
}
function pose({ json, accessors }, clip = null, time = 0) {
  const nodes = json.nodes.map(n => {
    const node = new Object3D();
    node.position.fromArray(n.translation || [0, 0, 0]);
    node.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
    node.scale.fromArray(n.scale || [1, 1, 1]);
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(node.position, node.quaternion, node.scale);
    return node;
  });
  json.nodes.forEach((n, i) => n.children?.forEach(child => nodes[i].add(nodes[child])));
  if (clip) for (const channel of clip.channels) {
    const s = clip.samplers[channel.sampler], times = accessors[s.input].map(v => v[0]), values = accessors[s.output];
    const interpolation = s.interpolation || 'LINEAR';
    assert.ok(['LINEAR', 'STEP'].includes(interpolation));
    assert.equal(times.length, values.length);
    let i = 0;
    while (i < times.length - 1 && times[i + 1] <= time) i++;
    let value = values[i];
    if (i < times.length - 1 && interpolation === 'LINEAR') {
      const alpha = Math.max(0, Math.min(1, (time - times[i]) / (times[i + 1] - times[i])));
      value = channel.target.path === 'rotation'
        ? new Quaternion().fromArray(value).slerp(new Quaternion().fromArray(values[i + 1]), alpha).toArray()
        : value.map((v, c) => v + (values[i + 1][c] - v) * alpha);
    }
    const node = nodes[channel.target.node];
    if (channel.target.path === 'translation') node.position.fromArray(value);
    else if (channel.target.path === 'rotation') node.quaternion.fromArray(value);
    else if (channel.target.path === 'scale') node.scale.fromArray(value);
    else throw new Error('Unexpected animation target');
  }
  json.scenes[json.scene || 0].nodes.forEach(i => nodes[i].updateMatrixWorld(true));
  return nodes;
}
function verticesFor(asset, nodes) {
  const { json, accessors } = asset, points = [];
  json.nodes.forEach((record, nodeIndex) => {
    if (!Number.isInteger(record.mesh)) return;
    const skin = Number.isInteger(record.skin) ? json.skins[record.skin] : null;
    const matrices = skin?.joints.map((joint, i) => new Matrix4().multiplyMatrices(nodes[joint].matrixWorld, new Matrix4().fromArray(accessors[skin.inverseBindMatrices][i])));
    for (const primitive of json.meshes[record.mesh].primitives) {
      const positions = accessors[primitive.attributes.POSITION];
      const joints = skin && accessors[primitive.attributes.JOINTS_0], weights = skin && accessors[primitive.attributes.WEIGHTS_0];
      positions.forEach((p, i) => {
        const point = new Vector3().fromArray(p);
        if (skin) {
          const result = new Vector3();
          assert.ok(Math.abs(weights[i].reduce((a, b) => a + b, 0) - 1) < 2e-6);
          for (let k = 0; k < 4; k++) if (weights[i][k]) {
            assert.ok(matrices[joints[i][k]]);
            result.addScaledVector(point.clone().applyMatrix4(matrices[joints[i][k]]), weights[i][k]);
          }
          points.push(result);
        } else points.push(point.applyMatrix4(nodes[nodeIndex].matrixWorld));
      });
    }
  });
  return points;
}

check('primary-source CC0 and complete original archives registered', () => {
  assert.deepEqual(manifest.sources.map(s => s.id).sort(), ['kenney-nature-kit', 'polyhaven-sand-01', 'quaternius-animated-fish']);
  for (const source of manifest.sources) {
    assert.equal(source.license, 'CC0-1.0');
    assert.match(source.licenseUrl, /creativecommons\.org\/publicdomain\/zero\/1\.0\//);
    assert.ok(source.author && source.pageUrl.startsWith('https://'));
  }
  assert.ok(manifest.files.some(f => f.repositoryPath === 'assets/underwater-source-archives/original/animated-fish.zip'));
  assert.ok(manifest.files.some(f => f.repositoryPath === 'assets/underwater-source-archives/original/kenney-nature-kit.zip'));
});
check('registered size/hash integrity including original licenses, source mesh, GLBs and JPGs', () => {
  for (const entry of manifest.files) {
    const relative = entry.path || entry.repositoryPath;
    const bytes = fs.readFileSync(entry.path ? inside(entry.path) : archived(entry.repositoryPath));
    assert.equal(bytes.length, entry.byteLength, relative);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, relative);
    if (entry.sourceMd5) assert.equal(crypto.createHash('md5').update(bytes).digest('hex'), entry.sourceMd5, relative);
  }
});
let fish;
check('four GLBs fully embedded with finite bounded buffer accessors', () => {
  for (const item of [manifest.fish, ...manifest.reefs]) parseGlb(item.path);
  fish = parseGlb(manifest.fish.path);
});
check('original fish faces preserved without mesh decimation', () => {
  const source = fs.readFileSync(archived(manifest.fish.originalObj), 'utf8').split(/\r?\n/);
  const faces = source.filter(l => l.startsWith('f '));
  assert.equal(source.filter(l => l.startsWith('v ')).length, 345);
  assert.equal(faces.length, 356);
  const originalTriangles = faces.reduce((total, line) => total + line.trim().split(/\s+/).length - 3, 0);
  const packedTriangles = fish.json.meshes.flatMap(m => m.primitives).reduce((total, p) => total + fish.accessors[p.indices].length / 3, 0);
  assert.equal(originalTriangles, 686);
  assert.equal(packedTriangles, originalTriangles);
});
check('six original bones and all swim channels preserved', () => {
  const skin = fish.json.skins[0];
  assert.equal(fish.json.skins.length, 1);
  assert.deepEqual(skin.joints.map(i => fish.json.nodes[i].name).sort(), ['Face', 'Root', 'Spine1', 'Spine2', 'Spine3', 'Tail']);
  assert.equal(fish.json.animations.length, 1);
  assert.equal(fish.json.animations[0].name, 'Swim');
  assert.equal(fish.json.animations[0].channels.length, 18);
  const duration = Math.max(...fish.json.animations[0].samplers.map(s => fish.accessors[s.input].at(-1)[0]));
  assert.ok(Math.abs(duration - 31 / 24) < 1e-6);
});
check('three original face-colour regions explicitly exported as PBR', () => {
  const expected = { Body: [.8000000715255737, .1362169086933136, .018566589802503586, 1], Stripes: [.8000000715255737, .7579959034919739, .6398285031318665, 1], Outline: [.046961650252342224, .046961650252342224, .046961650252342224, 1] };
  assert.equal(fish.json.materials.length, 3);
  for (const m of fish.json.materials) {
    assert.deepEqual(m.pbrMetallicRoughness.baseColorFactor, expected[m.name]);
    assert.equal(m.pbrMetallicRoughness.metallicFactor, 0);
  }
});
check('swim retains fixed root translation and complete position tracks', () => {
  const rootIndex = fish.json.nodes.findIndex(n => n.name === 'Root');
  const channel = fish.json.animations[0].channels.find(c => c.target.node === rootIndex && c.target.path === 'translation');
  assert.ok(channel);
  const values = fish.accessors[fish.json.animations[0].samplers[channel.sampler].output];
  for (const value of values) assert.deepEqual(value, values[0]);
});
let motionMaximumRadius = 0;
check('201 sampled packed swim poses remain inside .30 horizontal fish envelope', () => {
  const clip = fish.json.animations[0], center = new Vector3().fromArray(manifest.fish.sourceCenter), scale = manifest.fish.uniformScale;
  assert.equal(scale, .073);
  assert.deepEqual(manifest.fish.sourceCenter, [0, .3117998242378235, -.8143562078475952]);
  for (let i = 0; i <= 200; i++) {
    const t = (31 / 24) * i / 200, nodes = pose(fish, clip, t);
    for (const vertex of verticesFor(fish, nodes)) {
      const radius = Math.hypot(vertex.x - center.x, vertex.z - center.z) * scale;
      motionMaximumRadius = Math.max(motionMaximumRadius, radius);
      assert.ok(radius < .30, `Fish envelope violated at ${t}s`);
    }
  }
});
check('three original Kenney GLBs byte-for-byte unchanged', () => {
  assert.equal(manifest.reefs.length, 3);
  for (const item of manifest.reefs) assert.ok(fs.readFileSync(inside(item.path)).equals(fs.readFileSync(archived(item.originalPath))), item.path);
});
let reefGeometry;
check('each full rock mesh finite, material assignments present, usable base and radial envelope', () => {
  reefGeometry = manifest.reefs.map(item => {
    const asset = parseGlb(item.path), vertices = verticesFor(asset, pose(asset));
    const min = [0, 1, 2].map(a => Math.min(...vertices.map(p => p.getComponent(a)))), max = [0, 1, 2].map(a => Math.max(...vertices.map(p => p.getComponent(a))));
    const horizontalRadius = Math.max(...vertices.map(p => Math.hypot(p.x, p.z)));
    assert.ok(horizontalRadius > 0 && max[1] - min[1] > .5);
    assert.equal(asset.json.materials.length, 3);
    for (const mesh of asset.json.meshes) for (const p of mesh.primitives) assert.ok(asset.accessors[p.indices].length > 0 && Number.isInteger(p.material));
    return { id: item.id, sourceMin: min, sourceMax: max, horizontalRadius, height: max[1] - min[1] };
  });
});
check('official unmodified 1k sand maps match source MD5 and JPEG headers', () => {
  const maps = manifest.files.filter(f => f.path?.startsWith('textures/sand_01/'));
  assert.equal(maps.length, 3);
  for (const item of maps) {
    const bytes = fs.readFileSync(inside(item.path));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.ok(item.sourceUrl.startsWith('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_01/'));
    assert.ok(item.sourceMd5);
  }
});
console.log(JSON.stringify({ status: 'passed', checks: checks.length, completed: checks, posedSamples: 201, maximumPackedHorizontalFishRadius: motionMaximumRadius, fishSafetyRadius: .30, reefGeometry, limitations: ['Finite sampled original animation geometry only; not a mathematical continuous-time bound.', 'No water dynamics, fish biology, diver following, collision solver or browser/frame-time claims.'] }, null, 2));
