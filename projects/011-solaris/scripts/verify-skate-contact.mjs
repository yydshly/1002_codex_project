import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Matrix4, Object3D, Quaternion, Vector3 } from '../web/studio/vendor/three.module.js';
import { sampleJump, jumpDuration } from '../web/skate/core.js';

// This is an independent original-geometry check, not WebGL acceptance or foot IK.
// It checks the two conservative sole support points used by scene.js and all original board vertices.
const sceneSource = fs.readFileSync(new URL('../web/skate/scene.js', import.meta.url), 'utf8');
function sceneNumber(name) {
  const match = sceneSource.match(new RegExp(`\\b${name}\\s*=\\s*([.\\d]+)`));
  assert.ok(match, `Registered scene constant ${name} missing`);
  return Number(match[1]);
}
const SCALE = sceneNumber('SCALE'), DECK_Y = sceneNumber('DECK_Y'), FLOOR_Y = sceneNumber('FLOOR_Y');
assert.equal(SCALE, 1.8); assert.equal(FLOOR_Y, .01);
const HEIGHTS = [.3, .7, 1.1], STEPS = 1000, TOLERANCE = 1e-8;
const assetRoot = new URL('../web/assets/skate/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const reads = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };

function parseGlb(relative) {
  const bytes = fs.readFileSync(new URL(relative, assetRoot));
  const record = manifest.files.find(file => file.path === relative);
  assert.ok(record, `Source manifest entry missing for ${relative}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256, 'Geometry must match the registered original');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const size = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= bytes.length);
    const chunk = bytes.subarray(offset + 8, offset + 8 + size);
    if (kind === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (kind === 0x004e4942) binary = chunk;
    offset += 8 + size;
  }
  assert.ok(json && binary); assert.equal(json.buffers.length, 1); assert.ok(!json.buffers[0].uri);
  const accessors = json.accessors.map(accessor => {
    assert.ok(!accessor.sparse);
    const view = json.bufferViews[accessor.bufferView], width = dimensions[accessor.type], size = sizes[accessor.componentType];
    assert.equal(view.buffer, 0); assert.ok(width && size);
    const stride = view.byteStride || width * size, start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    assert.ok(start + (accessor.count - 1) * stride + width * size <= binary.length);
    return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: width }, (_, column) => {
      const value = binary[reads[accessor.componentType]](start + row * stride + column * size);
      assert.ok(Number.isFinite(value));
      return value;
    }));
  });
  return { json, accessors };
}

function nodesFor({ json, accessors }, clip = null, time = 0) {
  const nodes = json.nodes.map(record => {
    const node = new Object3D();
    node.position.fromArray(record.translation || [0, 0, 0]);
    node.quaternion.fromArray(record.rotation || [0, 0, 0, 1]);
    node.scale.fromArray(record.scale || [1, 1, 1]);
    if (record.matrix) new Matrix4().fromArray(record.matrix).decompose(node.position, node.quaternion, node.scale);
    return node;
  });
  json.nodes.forEach((record, index) => record.children?.forEach(child => nodes[index].add(nodes[child])));
  if (clip) for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler], times = accessors[sampler.input].map(value => value[0]), values = accessors[sampler.output];
    assert.equal(sampler.interpolation || 'LINEAR', 'LINEAR');
    let index = 0;
    while (index < times.length - 1 && times[index + 1] < time) index++;
    let value = values[index];
    if (index < times.length - 1) {
      const alpha = Math.max(0, Math.min(1, (time - times[index]) / (times[index + 1] - times[index])));
      value = channel.target.path === 'rotation'
        ? new Quaternion().fromArray(value).slerp(new Quaternion().fromArray(values[index + 1]), alpha).toArray()
        : value.map((component, i) => component + (values[index + 1][i] - component) * alpha);
    }
    const node = nodes[channel.target.node];
    if (channel.target.path === 'translation') node.position.fromArray(value);
    else if (channel.target.path === 'rotation') node.quaternion.fromArray(value);
    else if (channel.target.path === 'scale') node.scale.fromArray(value);
    else throw new Error('Unexpected registered animation channel');
  }
  json.scenes[json.scene || 0].nodes.forEach(index => nodes[index].updateMatrixWorld(true));
  return nodes;
}

const rider = parseGlb('models/character-skate-boy.glb'), board = parseGlb('models/skateboard.glb');
const { json, accessors } = rider, body = json.nodes.find(node => node.name === 'body-mesh');
assert.ok(body && Number.isInteger(body.mesh) && Number.isInteger(body.skin));
const primitive = json.meshes[body.mesh].primitives[0], skin = json.skins[body.skin];
assert.equal(json.meshes[body.mesh].primitives.length, 1);
const positions = accessors[primitive.attributes.POSITION], joints = accessors[primitive.attributes.JOINTS_0], weights = accessors[primitive.attributes.WEIGHTS_0];
const inverseBind = accessors[skin.inverseBindMatrices].map(value => new Matrix4().fromArray(value));
const stand = json.animations.find(clip => clip.name === 'skate-stand'), air = json.animations.find(clip => clip.name === 'skate-air');
assert.ok(stand && air);
const airDuration = Math.max(...air.samplers.map(sampler => accessors[sampler.input].at(-1)[0]));
const boardNodes = nodesFor(board), boardVertices = [];
board.json.nodes.forEach((node, index) => {
  if (!Number.isInteger(node.mesh)) return;
  for (const part of board.json.meshes[node.mesh].primitives) {
    for (const position of board.accessors[part.attributes.POSITION]) {
      boardVertices.push(new Vector3().fromArray(position).applyMatrix4(boardNodes[index].matrixWorld).multiplyScalar(SCALE));
    }
  }
});
assert.ok(boardVertices.length > 100);
const rawDeckVertices = boardVertices.filter(vertex => Math.abs(vertex.y / SCALE - DECK_Y) < 1e-7);
assert.ok(rawDeckVertices.length >= 3, 'Original board must have a flat, unmodified deck');

function matricesFor(nodes) {
  return skin.joints.map((index, joint) => new Matrix4().multiplyMatrices(nodes[index].matrixWorld, inverseBind[joint]));
}
function vertexWorld(index, matrices) {
  const result = new Vector3();
  for (let component = 0; component < 4; component++) {
    if (!weights[index][component]) continue;
    result.add(new Vector3().fromArray(positions[index]).applyMatrix4(matrices[joints[index][component]])
      .multiplyScalar(weights[index][component] * SCALE));
  }
  return result;
}
const standingNodes = nodesFor(rider, stand), standingMatrices = matricesFor(standingNodes);
const soleIndices = ['leg-left', 'leg-right'].map(name => {
  const joint = skin.joints.findIndex(index => json.nodes[index].name === name);
  assert.ok(joint >= 0);
  const candidates = positions.map((_, index) => ({ index,
    influence: joints[index].reduce((sum, value, component) => sum + (value === joint ? weights[index][component] : 0), 0),
  })).filter(value => value.influence > .8).map(value => ({ index: value.index, y: vertexWorld(value.index, standingMatrices).y }));
  const lowest = Math.min(...candidates.map(value => value.y));
  return candidates.filter(value => value.y <= lowest + .006 * SCALE).map(value => value.index);
});
assert.deepEqual(soleIndices.map(indices => indices.length), [12, 18]);

function originalSolePoints(sample) {
  const standing = nodesFor(rider, stand), flying = nodesFor(rider, air, sample.time % airDuration);
  standing.forEach((node, index) => {
    // Missing stand translation tracks use the original bind property with the remaining weight,
    // matching the AnimationMixer's original-value contribution for the air leg translations.
    node.position.lerp(flying[index].position, sample.crouch);
    node.quaternion.slerp(flying[index].quaternion, sample.crouch);
    node.scale.lerp(flying[index].scale, sample.crouch);
  });
  json.scenes[json.scene || 0].nodes.forEach(index => standing[index].updateMatrixWorld(true));
  const matrices = matricesFor(standing);
  return soleIndices.map(indices => indices.map(index => vertexWorld(index, matrices)));
}

const results = [];
for (const height of HEIGHTS) {
  const duration = jumpDuration(height);
  let minimumBoardY = Infinity, maximumSupportError = 0, minimumSampledSoleClearance = Infinity, maximumCorrection = 0;
  let lowestBeforeCorrection = Infinity;
  for (let step = 0; step <= STEPS; step++) {
    const sample = sampleJump(duration * step / STEPS, height), points = originalSolePoints(sample);
    const centers = points.map(vertices => vertices.reduce((sum, value) => sum.add(value), new Vector3()).multiplyScalar(1 / vertices.length));
    const up = new Vector3(0, 1, 0), axis = centers[0].clone().sub(centers[1]).normalize();
    const normal = up.clone().addScaledVector(axis, -up.dot(axis)).normalize();
    let supports;
    for (let iteration = 0; iteration < 4; iteration++) {
      supports = points.map(vertices => vertices.reduce((lowest, value) => value.dot(normal) < lowest.dot(normal) ? value : lowest));
      axis.copy(supports[0]).sub(supports[1]).normalize();
      normal.copy(up).addScaledVector(axis, -up.dot(axis)).normalize();
    }
    assert.ok(normal.y > 0 && Math.abs(normal.length() - 1) < TOLERANCE);
    const midpoint = supports[0].clone().add(supports[1]).multiplyScalar(.5);
    const actorShift = DECK_Y * SCALE + sample.boardY - midpoint.y;
    midpoint.y += actorShift;
    const lateral = new Vector3().crossVectors(normal, axis).normalize(), basis = new Matrix4().makeBasis(lateral, normal, axis);
    const boardPosition = midpoint.clone().addScaledVector(normal, -DECK_Y * SCALE);
    const before = boardVertices.map(vertex => vertex.clone().applyMatrix4(basis).add(boardPosition));
    const beforeMin = Math.min(...before.map(vertex => vertex.y));
    const correction = Math.max(0, FLOOR_Y - beforeMin);
    boardPosition.y += correction;
    const actualBoard = boardVertices.map(vertex => vertex.clone().applyMatrix4(basis).add(boardPosition));
    const actualDeck = rawDeckVertices[0].clone().applyMatrix4(basis).add(boardPosition);
    const shiftedPoints = points.map(vertices => vertices.map(vertex => vertex.clone().add(new Vector3(0, actorShift + correction, 0))));
    const shiftedSupports = supports.map(vertex => vertex.clone().add(new Vector3(0, actorShift + correction, 0)));
    const minimum = Math.min(...actualBoard.map(vertex => vertex.y));
    const errors = shiftedSupports.map(vertex => Math.abs(vertex.clone().sub(actualDeck).dot(normal)));
    const soleMinimum = Math.min(...shiftedPoints.flat().map(vertex => vertex.clone().sub(actualDeck).dot(normal)));
    assert.ok(minimum >= FLOOR_Y - TOLERANCE, `Board penetrates floor at height ${height}, t=${sample.time}`);
    assert.ok(errors.every(error => error < TOLERANCE), `Support point misses original deck at height ${height}, t=${sample.time}`);
    // This checks only the chosen original sole sampling vertices. It does not certify the complete foot surface.
    assert.ok(soleMinimum >= -TOLERANCE, `Another sampled sole vertex is below the deck at height ${height}, t=${sample.time}`);
    minimumBoardY = Math.min(minimumBoardY, minimum);
    maximumSupportError = Math.max(maximumSupportError, ...errors);
    minimumSampledSoleClearance = Math.min(minimumSampledSoleClearance, soleMinimum);
    maximumCorrection = Math.max(maximumCorrection, correction);
    lowestBeforeCorrection = Math.min(lowestBeforeCorrection, beforeMin);
  }
  results.push({ height, samples: STEPS + 1, minimumBoardY, maximumSupportError,
    minimumSampledSoleClearance, maximumCorrection, lowestBeforeCorrection });
}
console.log(JSON.stringify({
  result: 'PASS', method: 'Original GLB vertex / inverse-bind sampling of the registered stand-air blend and common floor correction',
  source: fileURLToPath(new URL('models/character-skate-boy.glb', assetRoot)),
  samples: results.reduce((sum, result) => sum + result.samples, 0), boardVertices: boardVertices.length,
  soleVertices: soleIndices.map(indices => indices.length), floorY: FLOOR_Y, tolerance: TOLERANCE, results,
  boundary: 'Only two conservative sole support points and sampled sole vertices; not complete foot IK, athlete biomechanics, collision physics or browser acceptance.',
}));
