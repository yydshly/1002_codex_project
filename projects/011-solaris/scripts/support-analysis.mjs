import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL('../web/support/', import.meta.url);
const output = new URL('../notes/support-asset-analysis.json', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const start = performance.now();
const report = {
  format: 'atelier-support-registered-asset-analysis', version: 1, date: '2026-10-07', status: 'not-run',
  scope: 'Repeat static validation of the same three registered tables using a separately registered industrial desk lamp. The first clamp-mounted lamp produced a 3.527 mm lowest contact patch and failed product-use semantics. That historical report is retained. This is not a new unseen table test set; the frozen atelier-support-v1 geometry rules are unchanged. No asset-specific surface, anchor, or threshold is assigned.',
  representativeSelection: 'The script explicitly selects the highest detected candidate for representative checks; this declared test-case choice is never a runtime default or proof that other candidates are usable. All detected candidates and their recommendations/rejections are retained.',
  browserTaskValidation: 'Not run by this script. Pointer transactions, undo/redo, persistence, and real-browser tasks require separate evidence.',
  physicalMeaning: 'Geometry contact/coverage and conservative AABB collision only; neither physical stability, load capacity nor a guarantee that fastening is unnecessary.',
  policy: null, policySha256: null, sourceCodeSha256: {},
  history: { reportPath: 'notes/support-first-asset-analysis.json', originalLamp: 'desk_lamp_arm_01', reportSha256: null },
  inputManifests: {}, lamp: { valid: null, analysisRan: false }, tables: [], errors: [],
};
const TRANSFORMS = [
  { name: 'translation', transform: { x: 0.5, y: 0.1, z: -0.35, yaw: 0, scale: { x: 1, y: 1, z: 1 } } },
  { name: 'rotation-y-30-degrees', transform: { x: 0, y: 0, z: 0, yaw: Math.PI / 6, scale: { x: 1, y: 1, z: 1 } } },
  { name: 'uniform-table-scale-120-percent', transform: { x: 0, y: 0, z: 0, yaw: 0, scale: { x: 1.2, y: 1.2, z: 1.2 } } },
  { name: 'xz-axis-table-stretch', transform: { x: 0, y: 0, z: 0, yaw: 0, scale: { x: 1.15, y: 1, z: 0.9 } } },
];
async function readJson(relative) {
  const bytes = await fs.readFile(new URL(relative, base));
  return { value: JSON.parse(bytes.toString('utf8')), sha256: digest(bytes) };
}
function transformedAnchor(anchor, transform) {
  const c = Math.cos(transform.yaw), s = Math.sin(transform.yaw);
  const x = anchor[0] * transform.scale.x, z = anchor[1] * transform.scale.z;
  return [transform.x + c * x + s * z, transform.z - s * x + c * z];
}
function runRepresentative(table, lampBase, geometry) {
  if (!table.valid || !table.surfaces?.length) return { selected: false, reason: 'no-detected-surface', checks: [] };
  const surface = table.surfaces.slice().sort((a, b) => b.height - a.height || a.id.localeCompare(b.id))[0];
  const center = [(surface.bounds.min[0] + surface.bounds.max[0]) / 2, (surface.bounds.min[1] + surface.bounds.max[1]) / 2];
  const centerAnchor = center.map((n, i) => n - lampBase.contactOffset[i]);
  const centerResult = geometry.checkPlacement(surface, lampBase, { anchor: centerAnchor, yaw: 0, scale: 1, obstacles: surface.obstacles });
  const recommendation = surface.recommendation;
  const recommendedResult = recommendation.valid
    ? geometry.checkPlacement(surface, lampBase, { anchor: recommendation.anchor, yaw: recommendation.worldPose.yaw, scale: recommendation.worldPose.scale, obstacles: surface.obstacles })
    : { valid: false, reason: 'recommendation-unavailable', recommendation };
  const outsideAnchor = surface.bounds.max.map(n => n + 1);
  const outsideResult = geometry.checkPlacement(surface, lampBase, { anchor: outsideAnchor, yaw: 0, scale: 1, obstacles: surface.obstacles });
  const checks = [
    { name: 'base-center-at-surface-bounds-center', expectedValid: true, anchor: centerAnchor, result: centerResult, expectationMet: centerResult.valid === true },
    { name: 'common-verified-recommendation', expectedValid: true, anchor: recommendation.anchor ?? null, result: recommendedResult, expectationMet: recommendedResult.valid === true },
    { name: 'deterministic-outside-bounds-plus-one-meter', expectedValid: false, anchor: outsideAnchor, result: outsideResult, expectationMet: outsideResult.valid === false },
  ];
  const localAnchor = recommendation.valid ? recommendation.anchor : centerAnchor;
  const relativeYaw = recommendation.valid ? recommendation.worldPose.yaw : 0;
  const lampScale = recommendation.valid ? recommendation.worldPose.scale : 1;
  for (const fixture of TRANSFORMS) {
    try {
      const worldSurface = geometry.transformSurface(surface, fixture.transform);
      const worldMesh = geometry.transformTriangles(table.mesh.triangles, fixture.transform);
      const obstacles = geometry.tableObstacles(worldMesh, worldSurface);
      const anchor = transformedAnchor(localAnchor, fixture.transform);
      const result = geometry.checkPlacement(worldSurface, lampBase, { anchor, yaw: relativeYaw + fixture.transform.yaw, scale: lampScale, obstacles });
      checks.push({ name: fixture.name, expectedValid: true, tableTransform: fixture.transform,
        preservedLocalAnchor: localAnchor, worldAnchor: anchor, lampScaleUnchanged: lampScale,
        lampYaw: relativeYaw + fixture.transform.yaw, recomputedObstacleCount: obstacles.length,
        result, expectationMet: result.valid === true });
    } catch (error) {
      checks.push({ name: fixture.name, expectedValid: true, tableTransform: fixture.transform,
        preservedLocalAnchor: localAnchor, result: { valid: false, reason: error.message }, expectationMet: false });
    }
  }
  return { selected: true, selection: 'script-explicit-highest-candidate', surfaceId: surface.id,
    height: surface.height, localAnchor, checks, allExpectationsMet: checks.every(check => check.expectationMet) };
}

try {
  const [{ value: manifest, sha256: tablesSha }, { value: lamp, sha256: lampSha }] = await Promise.all([
    readJson('assets-manifest.json'), readJson('freestanding-lamp-manifest.json'),
  ]);
  report.inputManifests = { tables: { path: 'web/support/assets-manifest.json', sha256: tablesSha },
    lamp: { path: 'web/support/freestanding-lamp-manifest.json', sha256: lampSha } };
  report.lamp = { valid: null, analysisRan: false, assetId: lamp.id, sourceFingerprint: lamp.sourceFingerprint, sourcePage: lamp.sourcePage };
  report.tables = manifest.assets.map(asset => ({ id: asset.id, label: asset.label, sourcePage: asset.sourcePage,
    fingerprint: asset.sourceFingerprint, valid: null, analysisRan: false, reason: 'not-yet-analyzed' }));
  const sourcePaths = { geometry: '../web/support/geometry.js', mesh: '../web/support/mesh.js', load: '../web/support/load.js' };
  for (const [key, relative] of Object.entries(sourcePaths)) report.sourceCodeSha256[key] = digest(await fs.readFile(new URL(relative, import.meta.url)));
  report.policySha256 = digest(await fs.readFile(new URL('../notes/support-policy.md', import.meta.url)));
  report.history.reportSha256 = digest(await fs.readFile(new URL('../notes/support-first-asset-analysis.json', import.meta.url)));
  const [loader, geometry] = await Promise.all([import('../web/support/load.js'), import('../web/support/geometry.js')]);
  report.policy = geometry.SUPPORT_POLICY.version;
  report.policyParameters = geometry.SUPPORT_POLICY;
  const readBytes = async relative => new Uint8Array(await fs.readFile(new URL(relative, base)));
  let result;
  try {
    result = await loader.prepareSupport(manifest, lamp, readBytes, message => console.log(message));
  } catch (error) {
    // Record contact rejection without changing rules, choosing another lamp,
    // or silently falling back to the historical clamp-mounted source.
    report.errors.push({ stage: 'prepare-support', reason: error.message });
    try {
      const mesh = await loader.loadRegisteredMesh(lamp, readBytes, 0.52);
      const contact = geometry.analyzeLampBase(mesh.triangles);
      report.lamp = { ...report.lamp, ...contact, analysisRan: true,
        normalization: mesh.normalization, triangleCount: mesh.triangleCount };
    } catch (loadError) {
      report.lamp = { ...report.lamp, valid: false, analysisRan: false, reason: loadError.message };
    }
    for (const table of report.tables) table.reason = 'not-run-because-support-preparation-failed';
    report.status = 'failed-support-preparation';
  }
  if (result) {
    report.lamp = { ...report.lamp, valid: true, analysisRan: true,
      normalization: result.lamp.mesh.normalization, triangleCount: result.lamp.mesh.triangleCount,
      base: result.lamp.base, evidence: result.lamp.evidence };
    report.tables = result.tables.map(table => ({
      id: table.asset.id, label: table.asset.label, sourcePage: table.asset.sourcePage,
      fingerprint: table.asset.sourceFingerprint, analysisRan: true, valid: table.valid,
      reason: table.reason ?? null, normalization: table.mesh?.normalization,
      triangleCount: table.mesh?.triangleCount, status: table.status, usableSurfaces: table.usableSurfaces ?? 0,
      surfaces: table.surfaces?.map(surface => ({ id: surface.id, height: surface.height, heightRange: surface.heightRange,
        triangleCount: surface.triangleCount, bounds: surface.bounds, obstacleCount: surface.obstacles.length,
        recommendation: surface.recommendation })),
      representative: runRepresentative(table, result.lamp.base, geometry),
    }));
    report.status = report.tables.every(table => table.valid && table.representative.allExpectationsMet)
      ? 'static-representative-cases-passed' : 'partial-static-validation';
  }
} catch (error) {
  report.status = 'analysis-error';
  report.errors.push({ stage: 'script', reason: error.message });
}
report.elapsedMs = performance.now() - start;
report.summary = {
  registeredTableCount: report.tables.length,
  tableSourceAnalysisValidCount: report.tables.filter(table => table.valid === true).length,
  representativeAllExpectationsMetCount: report.tables.filter(table => table.representative?.allExpectationsMet).length,
  retainedCandidateCount: report.tables.reduce((sum, table) => sum + (table.surfaces?.length ?? 0), 0),
  retainedCandidateRecommendationRejections: report.tables.reduce((sum, table) => sum + (table.surfaces?.filter(surface => !surface.recommendation.valid).length ?? 0), 0),
  tableTaskCompletionClaim: 'No complete product-task claim. This report covers static geometry and explicit script cases only.',
};
// Original lamp manifest and first clamp-lamp report remain historical records.
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, policy: report.policy, elapsedMs: report.elapsedMs,
  lamp: { id: report.lamp.assetId, valid: report.lamp.valid, reason: report.lamp.reason ?? null },
  summary: report.summary, tables: report.tables.map(table => ({ id: table.id, valid: table.valid,
    reason: table.reason, representativePassed: table.representative?.allExpectationsMet ?? false,
    failedChecks: table.representative?.checks.filter(check => !check.expectationMet).map(check => ({ name: check.name, reason: check.result.reason })) ?? [] })),
}, null, 2));
if (report.status !== 'static-representative-cases-passed') process.exitCode = 1;
