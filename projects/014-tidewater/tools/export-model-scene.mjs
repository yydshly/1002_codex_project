// Export the UI-captured authored scene through the same model geometry builder.
// No browser, service credentials or model API is involved in this operation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../web/creation-core.js';
import { validateModelCandidate, fingerprintPlan, createSceneGLB, MODEL_SCENE_LIMITS } from '../web/model-scene-core.js';
import { buildModelGeometry, MODEL_VERTEX_STRIDE } from '../web/model-scene-assets.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const settings = { context: 'assets/model-scene-source-context.json', output: 'assets/model-scene-coastal.glb' };
try {
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--context', '--output'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('用法：node tools/export-model-scene.mjs [--context project-relative-or-absolute.json] [--output project-relative-or-absolute.glb]');
    }
    settings[key.slice(2)] = args[index + 1];
  }
  await main();
} catch (error) {
  console.error(`模型场景导出失败：${error.message}`);
  process.exitCode = 1;
}

function positionSlice(geometry, record, end = record.end) {
  const positions = [];
  for (let vertex = record.start; vertex < end; vertex += 1) {
    const offset = vertex * MODEL_VERTEX_STRIDE;
    positions.push(...geometry.data.subarray(offset, offset + 3));
  }
  return positions;
}
function decodeGLB(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'valid GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'glTF 2');
  assert.equal(view.getUint32(8, true), bytes.byteLength, 'declared total length');
  const jsonLength = view.getUint32(12, true);
  assert.equal(jsonLength % 4, 0, 'aligned JSON chunk');
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'JSON chunk type');
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const binaryHeader = 20 + jsonLength;
  assert.equal(view.getUint32(binaryHeader + 4, true), 0x004e4942, 'BIN chunk type');
  assert.equal(binaryHeader + 8 + view.getUint32(binaryHeader, true), bytes.byteLength, 'binary coverage');
  return document;
}

async function main() {
  const contextFile = path.resolve(projectRoot, settings.context);
  const outputFile = path.resolve(projectRoot, settings.output);
  if (path.extname(outputFile).toLowerCase() !== '.glb') throw new Error('导出文件必须以 .glb 结尾。');
  const context = JSON.parse(await readFile(contextFile, 'utf8'));
  const plan = validatePlan(context.plan);
  const sourceFingerprint = fingerprintPlan(plan);
  assert.equal(context.sourceFingerprint, sourceFingerprint, 'captured plan fingerprint must match its exact source');
  const candidateFile = path.join(projectRoot, 'web', 'model-scene-candidate.json');
  const candidate = validateModelCandidate(JSON.parse(await readFile(candidateFile, 'utf8')), plan);
  const original = JSON.stringify(plan);
  const coarse = buildModelGeometry(plan);
  const crafted = buildModelGeometry(plan, candidate);
  const checks = [];
  function check(name, work) { work(); checks.push({ name, pass: true }); }
  check('authored world, points, IDs, elevations, refinements and locks remain unchanged', () => assert.equal(JSON.stringify(plan), original));
  check('every original entity has the same geometry record ID', () => {
    assert.deepEqual([...crafted.records.keys()], plan.entities.map(entity => entity.id));
    assert.deepEqual([...coarse.records.keys()], [...crafted.records.keys()]);
  });
  check('original land base vertices and bounds are exactly preserved', () => {
    for (const entity of plan.entities.filter(item => item.kind === 'land')) {
      const before = coarse.records.get(entity.id), after = crafted.records.get(entity.id);
      assert.equal(after.baseTriangles, before.baseTriangles);
      assert.deepEqual(after.baseBounds, before.baseBounds);
      assert.deepEqual(positionSlice(crafted, after, after.start + after.baseTriangles * 3),
        positionSlice(coarse, before, before.start + before.baseTriangles * 3));
    }
  });
  check('water and road vertices retain their exact original positions and elevations', () => {
    for (const entity of plan.entities.filter(item => ['water', 'road'].includes(item.kind))) {
      assert.deepEqual(positionSlice(crafted, crafted.records.get(entity.id)), positionSlice(coarse, coarse.records.get(entity.id)));
    }
  });
  check('crafted marker geometry remains around the authored marker centres', () => {
    for (const entity of plan.entities.filter(item => ['cabin', 'lighthouse', 'palm', 'boat'].includes(item.kind))) {
      const record = crafted.records.get(entity.id);
      const x = (entity.points[0].x - .5) * plan.world.width, z = (entity.points[0].y - .5) * plan.world.depth;
      assert.ok(record.bounds.min.x <= x && record.bounds.max.x >= x, `${entity.id} X centre`);
      assert.ok(record.bounds.min.z <= z && record.bounds.max.z >= z, `${entity.id} Z centre`);
    }
  });
  check('locking actual source entities preserves their complete coarse mesh and colors', () => {
    const lockedPlan = structuredClone(plan);
    for (const entity of lockedPlan.entities) entity.locked = true;
    const before = buildModelGeometry(lockedPlan), after = buildModelGeometry(lockedPlan, candidate);
    for (const entity of lockedPlan.entities) {
      const a = before.records.get(entity.id), b = after.records.get(entity.id);
      assert.deepEqual(after.data.subarray(b.start * MODEL_VERTEX_STRIDE, b.end * MODEL_VERTEX_STRIDE),
        before.data.subarray(a.start * MODEL_VERTEX_STRIDE, a.end * MODEL_VERTEX_STRIDE));
    }
  });
  check('removing the model look restores the same original coarse geometry', () => {
    assert.deepEqual(buildModelGeometry(plan).data, coarse.data);
  });
  const vertexCount = crafted.data.length / MODEL_VERTEX_STRIDE;
  const triangleCount = vertexCount / 3;
  assert.ok(Number.isInteger(triangleCount) && triangleCount > 0 && triangleCount <= MODEL_SCENE_LIMITS.triangles);
  const positions = new Float32Array(vertexCount * 3), normals = positions.slice(), colors = positions.slice();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const input = vertex * MODEL_VERTEX_STRIDE, output = vertex * 3;
    positions.set(crafted.data.subarray(input, input + 3), output);
    const normal = crafted.data.subarray(input + 3, input + 6), length = Math.hypot(...normal);
    assert.ok(Number.isFinite(length) && length > 1e-7, 'every exported normal has a valid direction');
    normals.set(Array.from(normal, value => value / length), output);
    colors.set(crafted.data.subarray(input + 6, input + 9), output);
  }
  const groups = [...crafted.records.values()].filter(record => record.end > record.start)
    .map(record => ({ id: record.id, start: record.start, count: record.end - record.start }));
  const firstEntityStart = groups.length ? Math.min(...groups.map(group => group.start)) : vertexCount;
  if (firstEntityStart > 0) {
    const usedIds = new Set(groups.map(group => group.id));
    let seaId = 'background-ocean', suffix = 1;
    while (usedIds.has(seaId)) seaId = `background-ocean-${suffix++}`;
    groups.unshift({ id: seaId, start: 0, count: firstEntityStart });
  }
  const bytes = createSceneGLB({ positions, normals, colors, groups }, { title: candidate.title });
  const document = decodeGLB(bytes);
  check('GLB preserves each authored object as an individually named selectable node and mesh', () => {
    for (const entity of plan.entities) {
      const node = document.nodes.find(item => item.name === entity.id);
      assert.ok(node, `exported node ${entity.id}`);
      assert.equal(document.meshes[node.mesh].extras.sourceEntityId, entity.id);
    }
    assert.equal(document.scenes[0].nodes.length, document.nodes.length);
  });
  check('GLB object attributes cover every triangle, including the background sea', () => {
    const exportedVertices = document.meshes.reduce((sum, mesh) => sum
      + document.accessors[mesh.primitives[0].attributes.POSITION].count, 0);
    assert.equal(exportedVertices, vertexCount);
    assert.ok(document.nodes.some(node => node.name.startsWith('background-ocean')));
    assert.ok(bytes.byteLength <= MODEL_SCENE_LIMITS.bytes);
  });
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, bytes);
  const writtenBytes = new Uint8Array(await readFile(outputFile));
  check('written GLB is byte-identical to the validated candidate export', () => assert.deepEqual(writtenBytes, bytes));
  const report = {
    generatedAt: new Date().toISOString(), source: path.relative(projectRoot, contextFile).split(path.sep).join('/'),
    output: path.relative(projectRoot, outputFile).split(path.sep).join('/'), candidateId: candidate.id,
    sourceFingerprint, authoredEntities: plan.entities.length, sourceLockedEntities: plan.entities.filter(entity => entity.locked).length,
    coarseTriangles: coarse.data.length / MODEL_VERTEX_STRIDE / 3, candidateTriangles: triangleCount,
    vertexCount, glbNodes: document.nodes.length, glbMeshes: document.meshes.length, glbBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'), checks,
  };
  await writeFile(path.join(projectRoot, 'checks', 'model-scene-artifact-results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outputFile, authoredEntities: report.authoredEntities, triangles: triangleCount,
    glbNodes: report.glbNodes, bytes: bytes.byteLength, checks: `${checks.length}/${checks.length}`, sourceFingerprint }));
}
