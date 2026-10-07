import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3 } from '../web/studio/vendor/three.module.js';

const base = fileURLToPath(new URL('../web/assets/skate/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const reads = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
const expectedBones = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];
const requiredClips = { 'skate': 0.5166666507720947, 'skate-stand': 0.5, 'skate-air': 0.6666666865348816, 'skate-grab': 0.5, 'jump': 0.5, 'fall': 0.3333333432674408, 'crouch': 0.1666666716337204 };

function inside(relative) {
  assert.equal(typeof relative, 'string');
  const target = path.resolve(base, relative);
  assert.ok(target.startsWith(base), `Asset escapes registered root: ${relative}`);
  return target;
}

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
    offset += 8 + length;
  }
  assert.equal(json.asset.version, '2.0');
  assert.ok(binary);
  assert.equal(json.buffers.length, 1);
  assert.ok(!json.buffers[0].uri);
  assert.ok(json.buffers[0].byteLength <= binary.length);
  const accessors = json.accessors.map(a => {
    assert.ok(!a.sparse, 'This registered pack has no sparse accessors');
    const view = json.bufferViews[a.bufferView], width = sizes[a.type], bytesPerComponent = componentSizes[a.componentType];
    assert.equal(view.buffer, 0);
    assert.ok(width && bytesPerComponent);
    const stride = view.byteStride || width * bytesPerComponent;
    const offset = (view.byteOffset || 0) + (a.byteOffset || 0);
    assert.ok(offset + (a.count - 1) * stride + width * bytesPerComponent <= binary.length);
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) => {
      const value = binary[reads[a.componentType]](offset + i * stride + c * bytesPerComponent);
      assert.ok(Number.isFinite(value));
      return value;
    }));
  });
  return { json, accessors };
}

function pose({ json, accessors }, clip, time) {
  const nodes = json.nodes.map(n => {
    const node = new Object3D();
    node.position.fromArray(n.translation || [0, 0, 0]);
    node.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
    node.scale.fromArray(n.scale || [1, 1, 1]);
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(node.position, node.quaternion, node.scale);
    return node;
  });
  json.nodes.forEach((n, i) => n.children?.forEach(child => nodes[i].add(nodes[child])));
  for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler], times = accessors[sampler.input].map(v => v[0]), values = accessors[sampler.output];
    assert.equal(sampler.interpolation || 'LINEAR', 'LINEAR');
    let i = 0;
    while (i < times.length - 1 && times[i + 1] < time) i++;
    let value = values[i];
    if (i < times.length - 1) {
      const alpha = Math.max(0, Math.min(1, (time - times[i]) / (times[i + 1] - times[i])));
      value = channel.target.path === 'rotation'
        ? new Quaternion().fromArray(value).slerp(new Quaternion().fromArray(values[i + 1]), alpha).toArray()
        : value.map((v, c) => v + (values[i + 1][c] - v) * alpha);
    }
    const node = nodes[channel.target.node];
    if (channel.target.path === 'translation') node.position.fromArray(value);
    if (channel.target.path === 'rotation') node.quaternion.fromArray(value);
    if (channel.target.path === 'scale') node.scale.fromArray(value);
  }
  json.scenes[json.scene || 0].nodes.forEach(i => nodes[i].updateMatrixWorld(true));
  return nodes;
}

function soleAnalysis(parsed, clip, time) {
  const { json, accessors } = parsed, nodes = pose(parsed, clip, time);
  const primitive = json.meshes[0].primitives[0], skin = json.skins[0];
  const positions = accessors[primitive.attributes.POSITION], joints = accessors[primitive.attributes.JOINTS_0], weights = accessors[primitive.attributes.WEIGHTS_0];
  const bind = accessors[skin.inverseBindMatrices].map(v => new Matrix4().fromArray(v));
  const matrices = skin.joints.map((node, i) => new Matrix4().multiplyMatrices(nodes[node].matrixWorld, bind[i]));
  const soles = [1, 2].map(joint => {
    const vertices = [];
    for (let i = 0; i < positions.length; i++) {
      if (positions[i][1] > 0.001 || !joints[i].some((v, k) => v === joint && weights[i][k] > 0.9)) continue;
      const result = new Vector3();
      for (let k = 0; k < 4; k++) if (weights[i][k]) result.add(new Vector3().fromArray(positions[i]).applyMatrix4(matrices[joints[i][k]]).multiplyScalar(weights[i][k]));
      vertices.push(result);
    }
    assert.ok(vertices.length);
    const center = vertices.reduce((v, point) => v.add(point), new Vector3()).divideScalar(vertices.length);
    return { joint: expectedBones[joint], originalSoleVertexCount: vertices.length, center: center.toArray(), yRange: [Math.min(...vertices.map(v => v.y)), Math.max(...vertices.map(v => v.y))] };
  });
  return { seconds: time, rootPosition: nodes[1].position.toArray(), rootQuaternion: nodes[1].quaternion.toArray(), soles };
}

assert.equal(manifest.author, 'Kenney');
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.sourcePage, 'https://kenney.nl/assets/mini-skate');
assert.match(fs.readFileSync(inside(manifest.licensePath), 'utf8'), /Creative Commons Zero, CC0/);
for (const file of manifest.files) {
  const bytes = fs.readFileSync(inside(file.path));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha256(bytes), file.sha256, file.path);
}
assert.equal(manifest.runtimeFiles.length, 21);
assert.equal(manifest.models.length, 20);
let triangles = 0;
const characterAnalyses = [];
for (const model of manifest.models) {
  const parsed = parseGlb(model.path), { json, accessors } = parsed;
  const original = model.path.replace('models/', 'original/Models/GLB format/');
  assert.deepEqual(fs.readFileSync(inside(model.path)), fs.readFileSync(inside(original)), `${model.path} differs from original distribution`);
  for (const image of json.images || []) {
    assert.equal(image.uri, 'Textures/colormap.png');
    assert.ok(fs.existsSync(inside(path.posix.join(path.posix.dirname(model.path), image.uri))));
  }
  let modelTriangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode || 4, 4);
    const positions = accessors[primitive.attributes.POSITION], indices = accessors[primitive.indices].flat();
    assert.ok(indices.every(i => i >= 0 && i < positions.length));
    assert.equal(indices.length % 3, 0);
    modelTriangles += indices.length / 3;
    if (primitive.attributes.WEIGHTS_0 !== undefined) {
      const joints = accessors[primitive.attributes.JOINTS_0];
      accessors[primitive.attributes.WEIGHTS_0].forEach((weights, i) => {
        assert.ok(Math.abs(weights.reduce((s, v) => s + v, 0) - 1) < 1e-4);
        assert.ok(joints[i].every(j => j >= 0 && j < 7));
      });
    }
  }
  assert.equal(modelTriangles, model.triangles);
  triangles += modelTriangles;
  if (!model.path.includes('character-skate-')) { assert.ok(!json.skins?.length && !json.animations?.length); continue; }
  assert.equal(json.skins.length, 2);
  assert.equal(json.animations.length, 29);
  assert.ok(!json.nodes.some(n => /foot|knee|ankle/i.test(n.name)));
  json.skins.forEach(s => assert.deepEqual(s.joints.map(i => json.nodes[i].name), expectedBones));
  for (const animation of json.animations) {
    for (const sampler of animation.samplers) {
      const times = accessors[sampler.input].map(v => v[0]);
      assert.equal(times[0], 0);
      assert.ok(times.every((value, i) => i === 0 || value > times[i - 1]));
      assert.equal(times.length, accessors[sampler.output].length);
    }
  }
  assert.ok(!json.animations.some(a => /ollie|takeoff|land/i.test(a.name)));
  const analysed = Object.entries(requiredClips).map(([name, seconds]) => {
    const clip = json.animations.find(a => a.name === name);
    assert.ok(clip, `Missing real clip ${name}`);
    const duration = Math.max(...clip.samplers.map(s => accessors[s.input].at(-1)[0]));
    assert.ok(Math.abs(duration - seconds) < 1e-7);
    return { name, duration, frames: [0, 0.25, 0.5, 0.75, 1].map(fraction => soleAnalysis(parsed, clip, duration * fraction)) };
  });
  const air = analysed.find(a => a.name === 'skate-air');
  assert.deepEqual(air.frames[0].soles, air.frames.at(-1).soles);
  assert.ok(air.frames.every(f => f.rootPosition.every(v => v === 0)), 'Native air clip must not be misreported as root takeoff motion');
  characterAnalyses.push({ path: model.path, sha256: manifest.runtimeFiles.find(f => f.path === model.path).sha256, clips: analysed });
}
const texture = fs.readFileSync(inside('models/Textures/colormap.png'));
assert.equal(texture.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
const report = {
  schema: 1, assetLicense: 'CC0-1.0', author: 'Kenney', method: 'Read the original GLB channels; sample LINEAR translations/scales and quaternion slerp; evaluate jointWorld × inverseBind matrices on original y<=0.001 sole vertices with >=0.9 dominant leg influence. These are geometric sample points, not foot bones or physical contact constraints.',
  coordinateSystem: 'Right handed glTF, Y up; board length along Z. Model units describe these stylized source meshes, not verified human body measurements.',
  boundary: 'skate-air loops with zero root translation; no native ollie/takeoff/landing clip and no foot/knee/ankle joints. Original clips and preserved geometry cannot by themselves certify a complete ollie, foot IK or obstacle-safe physics.',
  characters: characterAnalyses,
};
if (process.argv.includes('--report')) fs.writeFileSync(inside('rig-analysis.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ result: 'PASS', manifestFiles: manifest.files.length, runtimeModels: manifest.models.length, runtimeFiles: manifest.runtimeFiles.length, runtimeBytes: manifest.runtimeFiles.reduce((sum, file) => sum + file.bytes, 0), triangles, characters: characterAnalyses.length, clipsPerCharacter: 29, uniqueJointsPerCharacter: 7, reportGenerated: process.argv.includes('--report') }));
