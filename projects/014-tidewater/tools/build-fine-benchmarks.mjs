// Hand-authored spatial fixtures and static validation only. No model,
// image generator, browser, renderer or service is started by this command.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validatePlan } from '../web/creation-core.js';
import { createAssetJob } from '../web/asset-generation-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { waterLevel } from '../web/creation-surfaces.js';
import { createTerrainField, contains, edgeDistance, worldPoint } from '../web/realistic/terrain.js';
import { createDetailedTerrainField } from '../web/realistic/world-terrain.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(project, 'assets', 'fine-benchmarks');
const webOutput = path.join(project, 'web', 'assets', 'fine-benchmarks');
const p = (x, y) => ({ x, y });
const region = (id, kind, points, height) => ({ id, kind, points: points.map(([x, y]) => p(x, y)), height, locked: false });
const marker = (id, kind, x, y, height, locked = false) => ({ id, kind, points: [p(x, y)], height, locked });
const base = (name, world, intent, entities, lighting = 'day') => ({ version: 1, name, entry: 'layout', intent, world,
  style: { lighting, waterColor: '#3d939d', landColor: '#779451' }, reference: null, entities });
const cases = [
  { id: 'narrow-coast', file: '01-narrow-coast.plan.json', purpose: '横向窄岸、沿岸道路、不同建筑高度和少量树船，检查小空间包络适配。',
    plan: base('基准 01 · 窄岸小屋与灯塔', { width: 150, depth: 90 }, '保留狭长海岸的全部轮廓与对象位置。沿岸小屋和灯塔应有连贯的墙体、屋顶与灯室；两株树自然展开，两条船保留水上位置。细节尺度适合 150×90 米布局，不新增岛屿、树或船。', [
      region('narrow-land', 'land', [[.06,.28],[.20,.25],[.38,.26],[.62,.31],[.65,.43],[.55,.57],[.34,.58],[.14,.55],[.06,.44]], 2),
      region('narrow-bay', 'water', [[.10,.66],[.92,.66],[.92,.95],[.10,.95]], 0),
      region('narrow-path', 'road', [[.26,.446],[.36,.46],[.49,.46],[.57,.445]], .12),
      marker('narrow-cabin', 'cabin', .26, .39, 6.2),
      marker('narrow-lighthouse', 'lighthouse', .57, .39, 15),
      marker('narrow-palm-west', 'palm', .14, .40, 10.5), marker('narrow-palm-east', 'palm', .42, .43, 11.2),
      marker('narrow-boat-west', 'boat', .44, .80, 1.8), marker('narrow-boat-east', 'boat', .73, .82, 2.2),
    ]) },
  { id: 'dual-island-lock', file: '02-dual-island-lock.plan.json', purpose: '竖向双岛、中央航道、各岛独立道路和锁定灯塔，检查锁定与跨岛语义隔离。',
    plan: base('基准 02 · 双岛航道与锁定灯塔', { width: 120, depth: 180 }, '保留两座岛与中间航道。北岛灯塔已锁定，维持原对象、原形状、原位置和高度；不生成或替换它。仅完善两间小屋、两株树和两条船。各岛道路保持在陆地，不把航道改成桥，不增删任何对象。', [
      region('dual-north-island', 'land', [[.10,.13],[.30,.10],[.39,.21],[.40,.41],[.31,.53],[.15,.54],[.07,.37],[.08,.21]], 3),
      region('dual-south-island', 'land', [[.65,.43],[.81,.40],[.92,.50],[.91,.75],[.82,.89],[.67,.87],[.61,.72],[.62,.55]], 2.5),
      region('dual-navigation-channel', 'water', [[.45,.09],[.56,.09],[.56,.93],[.45,.93]], 0),
      region('dual-north-path', 'road', [[.25,.41],[.31,.36],[.33,.29],[.29,.255]], .15),
      region('dual-south-path', 'road', [[.78,.688],[.74,.64],[.72,.55]], .15),
      marker('dual-north-cabin', 'cabin', .25, .38, 6.6), marker('dual-south-cabin', 'cabin', .78, .72, 6.1),
      marker('dual-fixed-lighthouse', 'lighthouse', .29, .22, 16, true),
      marker('dual-north-palm', 'palm', .18, .45, 10), marker('dual-south-palm', 'palm', .83, .55, 9.5),
      marker('dual-channel-boat-north', 'boat', .49, .34, 1.6), marker('dual-channel-boat-south', 'boat', .52, .65, 1.9),
    ]) },
  { id: 'small-harbor', file: '03-small-harbor.plan.json', purpose: '正方形小港、凹岸轮廓、只有一株树且没有灯塔，检查不同对象组合与船体近景。',
    plan: base('基准 03 · 少树小港与双屋', { width: 120, depth: 120 }, '保留凹形港岸和开放水域。两间小屋、一株树与三条船组成安静的小港；不要自动添加灯塔或更多棕榈。建筑接地，船的内外船体、船沿和甲板连贯，航道保持开放。原路径仍沿陆地行走，不生成没有支撑的码头。', [
      region('harbor-land', 'land', [[.10,.15],[.84,.15],[.88,.29],[.61,.34],[.50,.40],[.48,.68],[.35,.81],[.17,.77],[.10,.55]], 1.8),
      region('harbor-water', 'water', [[.56,.44],[.70,.38],[.90,.38],[.93,.64],[.83,.84],[.58,.87],[.54,.69]], 0),
      region('harbor-footpath', 'road', [[.28,.30],[.38,.32],[.43,.40],[.40,.55],[.325,.60]], .10),
      marker('harbor-upper-cabin', 'cabin', .28, .26, 6.2), marker('harbor-inner-cabin', 'cabin', .28, .60, 6),
      marker('harbor-single-palm', 'palm', .69, .24, 9),
      marker('harbor-boat-inlet', 'boat', .66, .50, 1.7), marker('harbor-boat-outer', 'boat', .79, .62, 1.9), marker('harbor-boat-inner', 'boat', .65, .78, 1.6),
    ], 'sunset') },
];

function footprint(spec, point, plan) {
  const halfX = spec.width / plan.world.width / 2, halfY = spec.depth / plan.world.depth / 2;
  return [-1, 1].flatMap(x => [-1, 1].map(y => p(point.x + x * halfX, point.y + y * halfY)));
}
function inRegion(point, region, plan) { return contains(worldPoint(point, plan), region.points.map(vertex => worldPoint(vertex, plan))); }
function polygonArea(points, plan) {
  const doubled = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0);
  return Math.abs(doubled) * .5 * plan.world.width * plan.world.depth;
}
function auditPlan(input, benchmarkId) {
  const plan = validatePlan(input), before = JSON.stringify(plan), sourceFingerprint = fingerprintPlan(plan);
  const lands = plan.entities.filter(entity => entity.kind === 'land'), waters = plan.entities.filter(entity => entity.kind === 'water'), roads = plan.entities.filter(entity => entity.kind === 'road');
  assert.ok(lands.length && waters.length && roads.length);
  const terrain = createTerrainField(plan), details = createDetailedTerrainField(plan, terrain), envelopes = [], lockedIds = [];
  for (const water of waters) assert.equal(waterLevel(plan, water), water.height, `${water.id} unexpectedly overlaps raised land`);
  for (const entity of plan.entities.filter(entity => ['cabin','lighthouse','palm','boat'].includes(entity.kind))) {
    let spec;
    if (entity.locked) {
      lockedIds.push(entity.id); assert.throws(() => createAssetJob(plan, entity.id), /锁定/u);
      assert.equal(entity.kind, 'lighthouse'); spec = { width: 5.2, depth: 5.2, height: entity.height };
    } else {
      const job = createAssetJob(plan, entity.id, { id: `check-${benchmarkId}-${entity.id}` });
      assert.equal(job.binding.sourceFingerprint, sourceFingerprint); spec = job.spec;
    }
    const point = entity.points[0], corners = footprint(spec, point, plan), supportRegions = entity.kind === 'boat' ? waters : lands;
    assert.ok(supportRegions.some(region => [point, ...corners].every(corner => inRegion(corner, region, plan))), `${entity.id} envelope crosses the authored support region`);
    if (entity.kind === 'boat') assert.ok([point, ...corners].every(corner => lands.every(land => !inRegion(corner, land, plan))), `${entity.id} touches land`);
    else assert.ok([point, ...corners].every(corner => waters.every(water => !inRegion(corner, water, plan))), `${entity.id} overlaps water`);
    const position = worldPoint(point, plan), region = supportRegions.find(region => inRegion(point, region, plan));
    const shoreClearance = edgeDistance(position, region.points.map(vertex => worldPoint(vertex, plan)));
    const rendererSupport = entity.kind === 'boat' ? terrain.waterAt(position.x, position.z).level : terrain.support(position.x, position.z);
    assert.ok(Number.isFinite(rendererSupport));
    if (entity.kind !== 'boat') assert.equal(details.height(position.x, position.z), terrain.height(position.x, position.z), 'Detail terrain moved a protected object anchor');
    envelopes.push({ entityId: entity.id, kind: entity.kind, locked: entity.locked, width: spec.width, depth: spec.depth, height: spec.height,
      planAnchor: spec.anchor ?? null, rendererSupport, shoreClearanceMetres: Number(shoreClearance.toFixed(3)),
      footprintWithinSupportRegion: true, corners });
  }
  for (const road of roads) for (let segment = 0; segment < road.points.length - 1; segment++) {
    const first = worldPoint(road.points[segment], plan), last = worldPoint(road.points[segment + 1], plan), dx = last.x - first.x, dz = last.z - first.z, length = Math.hypot(dx, dz);
    for (let sample = 0; sample <= 20; sample++) for (const side of [-1, 0, 1]) {
      const x = first.x + dx * sample / 20 - side * dz / length * 1.25, z = first.z + dz * sample / 20 + side * dx / length * 1.25;
      assert.ok(terrain.landAt(x, z) && !terrain.waterAt(x, z), `${road.id} leaves dry land`);
      assert.equal(details.height(x, z), terrain.height(x, z), 'Detail terrain moved a protected road surface');
    }
  }
  for (let first = 0; first < envelopes.length; first++) for (let next = first + 1; next < envelopes.length; next++) {
    const a = envelopes[first], b = envelopes[next], pa = plan.entities.find(entity => entity.id === a.entityId).points[0], pb = plan.entities.find(entity => entity.id === b.entityId).points[0];
    const overlapX = Math.abs(pa.x - pb.x) * plan.world.width < (a.width + b.width) / 2;
    const overlapZ = Math.abs(pa.y - pb.y) * plan.world.depth < (a.depth + b.depth) / 2;
    assert.ok(!(overlapX && overlapZ), `${a.entityId} and ${b.entityId} overlap in plan-space envelopes`);
  }
  assert.equal(JSON.stringify(plan), before, 'Validation changed the authored plan');
  return { plan, sourceFingerprint, expected: { entityCount: plan.entities.length,
    kindCounts: Object.fromEntries(['land','water','road','cabin','lighthouse','palm','boat'].map(kind => [kind, plan.entities.filter(entity => entity.kind === kind).length])),
    fineTargetIds: envelopes.filter(envelope => !envelope.locked).map(envelope => envelope.entityId), lockedIds,
    preservedRegionIds: [...lands, ...waters, ...roads].map(region => region.id) },
    staticValidation: { planSchema: 'passed', assetRequests: 'passed', lockedAssetRequests: 'rejected-as-required',
      planSpaceFootprints: 'passed', nonOverlappingObjectEnvelopes: 'passed', roadSupportSamples: 'passed',
      originalWaterLevels: 'passed', protectedAnchorAndRoadMicrorelief: 'passed',
      rendererVisualQuality: 'not-run', modelGeneration: 'not-run', glbExportAndPortableReplay: 'not-run' },
    regions: [...lands, ...waters].map(region => ({ id: region.id, kind: region.kind, areaSquareMetres: Number(polygonArea(region.points, plan).toFixed(3)), authoredHeight: region.height })), envelopes };
}

await fs.mkdir(output, { recursive: true });
if (!process.argv.includes('--verify')) await fs.mkdir(webOutput, { recursive: true });
const entries = [];
for (const benchmark of cases) {
  const audited = auditPlan(benchmark.plan, benchmark.id), data = `${JSON.stringify(audited.plan, null, 2)}\n`;
  if (process.argv.includes('--verify')) {
    const stored = JSON.parse(await fs.readFile(path.join(output, benchmark.file), 'utf8'));
    assert.deepEqual(stored, audited.plan); // Fixture edits require explicit regeneration.
    const published = await fs.readFile(path.join(webOutput, benchmark.file), 'utf8');
    assert.equal(published, data, 'Browser fixture must exactly match the source fixture');
  } else {
    await fs.writeFile(path.join(output, benchmark.file), data);
    await fs.writeFile(path.join(webOutput, benchmark.file), data);
  }
  entries.push({ id: benchmark.id, name: benchmark.plan.name, file: benchmark.file, purpose: benchmark.purpose,
    world: benchmark.plan.world, sha256: createHash('sha256').update(data).digest('hex'), ...audited, plan: undefined });
}
const manifest = { format: 'tidewater-fine-benchmark-set.v1', authoredBy: 'hand-authored-spatial-fixtures',
  input: 'semantic-layout / coarse-scene', referenceImages: false, modelSuccessRate: null,
  evaluationStatus: 'static-validated; real-model-and-browser-evaluation-pending', cases: entries };
if (!process.argv.includes('--verify')) {
  const data = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(path.join(output, 'manifest.json'), data); await fs.writeFile(path.join(webOutput, 'manifest.json'), data);
} else {
  const expectedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  assert.equal(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'), expectedManifest);
  assert.equal(await fs.readFile(path.join(webOutput, 'manifest.json'), 'utf8'), expectedManifest);
}
console.log(JSON.stringify({ benchmarkCases: entries.map(entry => ({ id: entry.id, fingerprint: entry.sourceFingerprint, entities: entry.expected.entityCount, fineTargets: entry.expected.fineTargetIds.length, lockedIds: entry.expected.lockedIds })), staticValidation: 'passed', modelGeneration: 'not-run', glbReplay: 'not-run' }, null, 2));
