import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlan, validatePlan } from '../web/creation-core.js';
import { makeRefinement } from '../web/creation-refinement.js';
import { MODEL_SCENE_LIMITS, validateModelCandidate, fingerprintPlan, makeModelContext, createSceneGLB } from '../web/model-scene-core.js';

const clone = value => JSON.parse(JSON.stringify(value));
function candidate() {
  return {
    version: 1, id: 'model-coastal-1', title: '温暖海岸', direction: '保留布局，完善建筑和植被的形态。',
    provenance: { method: 'coding-model', label: '当前编码模型', generatedAt: '2026-10-05T01:00:00.000Z' },
    recipe: {
      assetKit: 'coastal-v1', seed: 17,
      palette: { water: '#4A97B7', land: '#4c885f', sand: '#e0cc91', plaster: '#efeee4', roof: '#a86043', timber: '#765c42', foliage: '#497851' },
      lighting: 'warm-day', detail: 2,
    },
    notes: ['建筑位置与陆地轮廓保持一致。'],
  };
}
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function triangle() {
  return { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], colors: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
}
function decodeGLB(output) {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(output.subarray(20, 20 + jsonLength)).trim());
  const chunk = 20 + jsonLength;
  return { view, json, jsonLength, binLength: view.getUint32(chunk, true), binType: view.getUint32(chunk + 4, true), binOffset: chunk + 8 };
}

test('model look data validates independently and never changes the authored plan', () => {
  const plan = frozen(createDemoPlan());
  const originalPlan = clone(plan), input = frozen(candidate());
  const result = validateModelCandidate(input, plan);
  assert.deepEqual(plan, originalPlan);
  assert.equal(result.recipe.palette.water, '#4a97b7');
  assert.notEqual(result, input);
  assert.notEqual(result.recipe.palette, input.recipe.palette);
  assert.notEqual(result.notes, input.notes);
  result.recipe.palette.land = '#ffffff';
  result.notes.push('another');
  assert.equal(input.recipe.palette.land, '#4c885f');
  assert.equal(input.notes.length, 1);
  assert.equal(plan.entities[0].points[0].x, originalPlan.entities[0].points[0].x);
});

test('candidate requires each field, rejects extra plan/code/URL payload fields at every level', () => {
  const plan = createDemoPlan();
  for (const key of Object.keys(candidate())) {
    const input = candidate(); delete input[key];
    assert.throws(() => validateModelCandidate(input, plan), /缺少/);
  }
  for (const input of [
    { ...candidate(), plan }, { ...candidate(), source: 'execute()' }, { ...candidate(), assetUrl: 'https://example.com/file.glb' },
    { ...candidate(), provenance: { ...candidate().provenance, providerKey: 'secret' } },
    { ...candidate(), recipe: { ...candidate().recipe, code: 'eval()' } },
    { ...candidate(), recipe: { ...candidate().recipe, palette: { ...candidate().recipe.palette, extra: '#ffffff' } } },
  ]) assert.throws(() => validateModelCandidate(input, plan), /未知/);
});

test('candidate rejects unsupported versions, kits, numeric types and palette formats', () => {
  const plan = createDemoPlan();
  for (const version of [0, 2, '1', null]) assert.throws(() => validateModelCandidate({ ...candidate(), version }, plan), /版本/);
  for (const seed of [-1, 2 ** 32, NaN, Infinity, 2.5, '17']) {
    const input = candidate(); input.recipe.seed = seed;
    assert.throws(() => validateModelCandidate(input, plan), /uint32/);
  }
  for (const [key, value] of [['assetKit', 'remote-kit'], ['detail', 3], ['detail', '2'], ['lighting', 'night']]) {
    const input = candidate(); input.recipe[key] = value;
    assert.throws(() => validateModelCandidate(input, plan));
  }
  for (const color of ['red', '#fff', '#12345678', 'https://example.com/texture', null]) {
    const input = candidate(); input.recipe.palette.water = color;
    assert.throws(() => validateModelCandidate(input, plan), /颜色/);
  }
  const limits = candidate(); limits.recipe.seed = 0xffffffff;
  assert.equal(validateModelCandidate(limits, plan).recipe.seed, 0xffffffff);
});

test('candidate bounds prose and rejects invalid source dates and sparse/accessor input', () => {
  const plan = createDemoPlan();
  for (const [key, value] of [['title', ''], ['title', 'x'.repeat(121)], ['direction', 'x'.repeat(2001)], ['id', '../scene'], ['title', 'bad\u0000title']]) {
    const input = candidate(); input[key] = value;
    assert.throws(() => validateModelCandidate(input, plan));
  }
  for (const generatedAt of ['yesterday', '2026-02-30T01:00:00.000Z', '2026-10-05T01:00:00Z', 0]) {
    const input = candidate(); input.provenance.generatedAt = generatedAt;
    assert.throws(() => validateModelCandidate(input, plan), /时间/);
  }
  for (const notes of [new Array(1), Array(13).fill('x'), ['x'.repeat(281)], [null]]) {
    assert.throws(() => validateModelCandidate({ ...candidate(), notes }, plan));
  }
  const notes = ['valid']; notes.extra = 'hidden payload';
  assert.throws(() => validateModelCandidate({ ...candidate(), notes }, plan), /未知/);
  let invoked = false;
  const getterInput = candidate();
  Object.defineProperty(getterInput, 'title', { enumerable: true, get() { invoked = true; return 'getter'; } });
  assert.throws(() => validateModelCandidate(getterInput, plan), /可序列化/);
  assert.equal(invoked, false);
  const hiddenInput = candidate(); Object.defineProperty(hiddenInput, 'hidden', { value: 1 });
  assert.throws(() => validateModelCandidate(hiddenInput, plan), /未知/);
});

test('model context carries exact canonical geometry, heights, locks and separate contract', () => {
  const source = createDemoPlan();
  source.entities[0].locked = true;
  source.entities[0].refinement = makeRefinement('rocky', 2, 99);
  source.intent = '保持道路，增强建筑形态';
  const original = clone(source);
  const context = makeModelContext(frozen(source));
  assert.deepEqual(context.plan, validatePlan(original));
  assert.deepEqual(context.lockedEntityIds, ['island-west']);
  assert.equal(context.sourceFingerprint, fingerprintPlan(original));
  assert.match(context.brief, /island-west/);
  assert.match(context.outputContract.delivery, /Do not return executable code/);
  context.plan.entities[0].points[0].x = .01;
  context.lockedEntityIds.pop(); context.outputContract.paletteKeys.pop();
  assert.deepEqual(source, original);
  assert.equal(makeModelContext(original).outputContract.paletteKeys.length, 7);
});

test('fingerprint ignores object key insertion order, detects every serialized plan layer', () => {
  const source = createDemoPlan();
  const reordered = JSON.parse(JSON.stringify(source, Object.keys(source))); // This deliberately truncates nested fields; must reject.
  assert.throws(() => fingerprintPlan(reordered));
  const reverse = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(reverse) : Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)]))
    : value;
  assert.equal(fingerprintPlan(source), fingerprintPlan(reverse(source)));
  const changes = [
    plan => { plan.name += '新'; }, plan => { plan.intent = '新方向'; }, plan => { plan.entry = 'image'; },
    plan => { plan.world.width += 1; }, plan => { plan.world.depth += 1; },
    plan => { plan.style.waterColor = '#ffffff'; }, plan => { plan.style.lighting = 'sunset'; },
    plan => { plan.entities[0].height += 1; }, plan => { plan.entities[0].locked = true; },
    plan => { plan.entities[0].points[0].x += .001; }, plan => { plan.entities.reverse(); },
    plan => { plan.entities[0].refinement = makeRefinement('tropical', 1, 1); },
    plan => { plan.reference = { name: 'ref.png', width: 1, height: 1, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }; },
  ];
  for (const change of changes) {
    const changed = clone(source); change(changed);
    assert.notEqual(fingerprintPlan(changed), fingerprintPlan(source));
  }
  assert.throws(() => validateModelCandidate(candidate(), { ...source, entities: null }));
});

test('GLB has valid header, aligned JSON and BIN chunks and exact attribute bytes', () => {
  const mesh = frozen(triangle());
  const output = createSceneGLB(mesh, { title: '候选场景' });
  assert.ok(output instanceof Uint8Array);
  const { view, json, jsonLength, binLength, binType, binOffset } = decodeGLB(output);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), output.byteLength);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  assert.equal(jsonLength % 4, 0); assert.equal(binOffset % 4, 0);
  assert.equal(binType, 0x004e4942); assert.equal(binLength, 108);
  assert.equal(binOffset + binLength, output.byteLength);
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.scenes[0].name, '候选场景');
  assert.deepEqual(json.meshes[0].primitives[0].attributes, { POSITION: 0, NORMAL: 1, COLOR_0: 2 });
  assert.deepEqual(json.accessors[0].min, [0, 0, 0]);
  assert.deepEqual(json.accessors[0].max, [1, 1, 0]);
  for (let attribute = 0; attribute < 3; attribute += 1) {
    assert.equal(json.bufferViews[attribute].byteOffset, attribute * 36);
    assert.equal(json.accessors[attribute].count, 3);
    assert.equal(json.accessors[attribute].componentType, 5126);
    const original = [mesh.positions, mesh.normals, mesh.colors][attribute];
    for (let index = 0; index < 9; index += 1) assert.equal(view.getFloat32(binOffset + attribute * 36 + index * 4, true), original[index]);
  }
  assert.deepEqual(mesh, triangle());
});

test('GLB supports typed arrays, linear colors and individually selectable original entities', () => {
  const mesh = Object.fromEntries(Object.entries(triangle()).map(([key, values]) => [key, new Float32Array([...values, ...values])]));
  mesh.colors[0] = .25;
  mesh.groups = [{ id: 'land-west', start: 0, count: 3 }, { id: 'cabin-west', start: 3, count: 3 }];
  const { json, view, binOffset } = decodeGLB(createSceneGLB(mesh));
  assert.deepEqual(json.scenes[0].extras.entityGroups, mesh.groups);
  assert.deepEqual(json.nodes.map(node => node.name), ['land-west', 'cabin-west']);
  assert.deepEqual(json.nodes.map(node => node.mesh), [0, 1]);
  assert.deepEqual(json.scenes[0].nodes, [0, 1]);
  assert.equal(json.meshes[0].extras.sourceEntityId, 'land-west');
  assert.equal(json.meshes[1].extras.sourceEntityId, 'cabin-west');
  assert.equal(json.accessors[0].count, 3);
  assert.equal(json.accessors[3].byteOffset, 36);
  assert.equal(view.getFloat32(binOffset + mesh.positions.byteLength * 2, true), .25);
  mesh.groups[0].id = 'changed';
  assert.equal(json.scenes[0].extras.entityGroups[0].id, 'land-west');
  assert.equal(json.buffers[0].uri, undefined);
});

test('GLB grouping preserves ungrouped gaps with deterministic IDs and correct per-object bounds', () => {
  const base = triangle();
  const mesh = { positions: [], normals: [], colors: [], groups: [{ id: 'unassigned-1', start: 3, count: 3 }, { id: 'cabin', start: 9, count: 3 }] };
  for (let triangleIndex = 0; triangleIndex < 5; triangleIndex += 1) {
    mesh.positions.push(...base.positions.map((value, component) => component % 3 === 0 ? value + triangleIndex * 10 : value));
    mesh.normals.push(...base.normals); mesh.colors.push(...base.colors);
  }
  const output = createSceneGLB(mesh);
  assert.deepEqual(output, createSceneGLB(mesh));
  const { json } = decodeGLB(output);
  assert.deepEqual(json.nodes.map(node => node.name), ['unassigned-2', 'unassigned-1', 'unassigned-3', 'cabin', 'unassigned-4']);
  assert.deepEqual(json.scenes[0].nodes, [0, 1, 2, 3, 4]);
  let exportedVertices = 0;
  for (let index = 0; index < json.meshes.length; index += 1) {
    const primitive = json.meshes[index].primitives[0];
    const position = json.accessors[primitive.attributes.POSITION];
    const normal = json.accessors[primitive.attributes.NORMAL];
    const color = json.accessors[primitive.attributes.COLOR_0];
    assert.equal(position.byteOffset, index * 36);
    assert.equal(position.count, 3);
    assert.equal(normal.byteOffset, position.byteOffset); assert.equal(color.byteOffset, position.byteOffset);
    assert.deepEqual(position.min, [index * 10, 0, 0]);
    assert.deepEqual(position.max, [index * 10 + 1, 1, 0]);
    exportedVertices += position.count;
  }
  assert.equal(exportedVertices, mesh.positions.length / 3);
  assert.equal(json.meshes[0].extras.sourceEntityId, null);
  assert.equal(json.nodes[1].extras.sourceEntityId, 'unassigned-1');
  const noGroups = decodeGLB(createSceneGLB({ ...base, groups: [] })).json;
  assert.deepEqual(noGroups.nodes.map(node => node.name), ['unassigned-1']);
  assert.equal(noGroups.accessors[0].count, 3);
});

test('GLB rejects malformed geometry, nonfinite components, colors and nonunit normals', () => {
  for (const key of ['positions', 'normals', 'colors']) {
    for (const value of [null, [], [0, 0, 0], new DataView(new ArrayBuffer(12)), ['x', ...triangle()[key].slice(1)]]) {
      const mesh = triangle(); mesh[key] = value;
      assert.throws(() => createSceneGLB(mesh));
    }
    for (const component of [NaN, Infinity, -Infinity]) {
      const mesh = triangle(); mesh[key][0] = component;
      assert.throws(() => createSceneGLB(mesh), /无效/);
    }
  }
  const mismatch = triangle(); mismatch.colors.push(...mismatch.colors);
  assert.throws(() => createSceneGLB(mismatch), /数量/);
  for (const component of [-.01, 1.01]) {
    const mesh = triangle(); mesh.colors[0] = component;
    assert.throws(() => createSceneGLB(mesh), /无效/);
  }
  const normal = triangle(); normal.normals[2] = .5;
  assert.throws(() => createSceneGLB(normal), /归一化/);
  assert.throws(() => createSceneGLB({ ...triangle(), source: 'code' }), /未知/);
  assert.throws(() => createSceneGLB(triangle(), { title: 'x', url: 'remote' }), /未知/);
});

test('GLB rejects invalid overlapping, duplicate or excessive object groups', () => {
  const invalid = [
    [{ id: 'x', start: 0, count: 4 }], [{ id: 'x', start: 1, count: 3 }], [{ id: 'x', start: -3, count: 3 }],
    [{ id: 'x', start: 0, count: 6 }], [{ id: 'x', start: 0, count: 0 }],
    [{ id: 'x', start: 0, count: 3 }, { id: 'y', start: 0, count: 3 }],
    [{ id: 'x', start: 0, count: 3 }, { id: 'x', start: 0, count: 3 }],
    [{ id: '../remote', start: 0, count: 3 }], Array(1025).fill({ id: 'x', start: 0, count: 3 }),
  ];
  for (const groups of invalid) assert.throws(() => createSceneGLB({ ...triangle(), groups }));
});

test('GLB enforces the triangle budget before allocating an export', () => {
  const overBudget = new Float32Array((MODEL_SCENE_LIMITS.triangles + 1) * 9);
  assert.throws(() => createSceneGLB({ ...triangle(), positions: overBudget }), /三角形/);
  const atBudget = new Float32Array(MODEL_SCENE_LIMITS.triangles * 9);
  const normals = atBudget.slice();
  for (let index = 2; index < normals.length; index += 3) normals[index] = 1;
  const output = createSceneGLB({ positions: atBudget, normals, colors: atBudget });
  const { json, binLength } = decodeGLB(output);
  assert.equal(json.accessors[0].count, MODEL_SCENE_LIMITS.triangles * 3);
  assert.equal(binLength, atBudget.byteLength * 3);
  assert.ok(output.byteLength <= MODEL_SCENE_LIMITS.bytes);
});
