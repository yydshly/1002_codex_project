import test from 'node:test';
import assert from 'node:assert/strict';
import { fineGeometryDiagnostics } from '../web/fine-geometry-core.js';
const part = () => ({ id: 'railposts', primitive: 'cylinder', size: [.02, .2, .02], rotationDeg: [0, 0, 0], points: [], repeat: { count: 8, step: [0, 0, 0], turnDeg: [0, 45, 0] } });
const bundle = value => ({ templates: [{ id: 'tower', parts: [value] }] });
test('same-center Y-rotated vertical post repeats are deterministic repair findings', () => {
  const input = bundle(part()), before = JSON.stringify(input), result = fineGeometryDiagnostics(input);
  assert.equal(result.needsRepair, true); assert.match(result.warnings[0], /tower\/railposts.*原位重复/); assert.equal(JSON.stringify(input), before);
});
test('linear, individually positioned or tilted repeats are not circular-post mistakes', () => {
  for (const mutate of [value => value.repeat.step = [.1, 0, 0], value => value.repeat.count = 1, value => value.repeat.turnDeg = [30, 0, 0], value => value.id = 'rotating-leaf', value => value.size = [.2, .2, .2]]) {
    const value = part(); mutate(value); assert.equal(fineGeometryDiagnostics(bundle(value)).needsRepair, false);
  }
});
test('horizontal torus dimensions use pre-rotation X/Y ring diameters', () => {
  const value = { ...part(), id: 'rail-ring', primitive: 'torus', size: [.6, .02, .6], rotationDeg: [90, 0, 0] };
  assert.equal(fineGeometryDiagnostics(bundle(value)).needsRepair, true);
  value.size = [.6, .6, .02]; assert.deepEqual(fineGeometryDiagnostics(bundle(value)), { needsRepair: false, warnings: [] });
  value.size = [.6, .02, .6]; value.rotationDeg = [0, 0, 0]; assert.equal(fineGeometryDiagnostics(bundle(value)).needsRepair, false);
  value.rotationDeg = [-90, 0, 0]; assert.equal(fineGeometryDiagnostics(bundle(value)).needsRepair, true);
});
test('zero-Z leaf outline is advisory and genuine X/Z width clears the warning', () => {
  const value = { ...part(), id: 'frond', primitive: 'leaf', size: [1, .6, .2], points: [[0, 0, 0], [.4, .2, 0], [1, -.3, 0]] };
  const result = fineGeometryDiagnostics(bundle(value)); assert.equal(result.needsRepair, false); assert.match(result.warnings[0], /Z.*仅为朝向提示/);
  value.id = 'oarblade'; assert.deepEqual(fineGeometryDiagnostics({ templates: [{ id: 'boat', parts: [value] }] }), { needsRepair: false, warnings: [] }); value.id = 'frond';
  value.points[1][2] = .1; assert.deepEqual(fineGeometryDiagnostics(bundle(value)), { needsRepair: false, warnings: [] });
});
test('diagnostics handle missing optional data and combine independent findings without mutation', () => {
  assert.deepEqual(fineGeometryDiagnostics(null), { needsRepair: false, warnings: [] });
  assert.deepEqual(fineGeometryDiagnostics({ templates: [{ parts: [{ id: 'incomplete' }] }] }), { needsRepair: false, warnings: [] });
  const input = { templates: [{ id: 'tower', parts: [part(), { ...part(), id: 'ring', primitive: 'torus', size: [.6, .02, .6], rotationDeg: [90, 0, 0] }] }] };
  const before = JSON.stringify(input), result = fineGeometryDiagnostics(input); assert.equal(result.needsRepair, true); assert.equal(result.warnings.length, 2); assert.equal(JSON.stringify(input), before);
});
