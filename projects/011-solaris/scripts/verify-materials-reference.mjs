import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { POWER_W, SAMPLES, initialState, sample, calculateRun, appendRun } from '../web/materials/core.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const references = JSON.parse(fs.readFileSync(path.join(project, 'web/materials/reference-data.json'), 'utf8'));
const studioManifest = JSON.parse(fs.readFileSync(path.join(project, 'web/studio/assets/manifest.json'), 'utf8'));
const checks = [];
const check = (name, run) => { run(); checks.push(name); };
const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, got ${actual}`);
};

// Independent reference inputs, not read from the runtime model or the public data file.
// NIST Chemistry WebBook, solid Shomate coefficients, Chase1998:
// https://webbook.nist.gov/cgi/cbook.cgi?ID=C7440508&Mask=2
// https://webbook.nist.gov/cgi/cbook.cgi?ID=C7429905&Mask=2
const SCIENCE = {
  copper: { molarMass: 63.546, coefficients: [17.72891, 28.09870, -31.25289, 13.97243, 0.068611],
    url: 'https://webbook.nist.gov/cgi/cbook.cgi?ID=C7440508&Mask=2', range: [298, 1358] },
  aluminum: { molarMass: 26.9815386, coefficients: [28.08920, -5.414849, 8.560423, 3.427370, -0.277375],
    url: 'https://webbook.nist.gov/cgi/cbook.cgi?ID=C7429905&Mask=2', range: [298, 933] },
};
const REFERENCE_TEMPERATURE_K = 298.15, ABSORBED_POWER_W = 10, DEFAULT_CLOCK_RATE = 1;
const CLOCK_RATES = [1, 4];
// Harvey2019, standard atmospheric pressure101.325kPa, iceIh:
// https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=926353
const ICE_MASS_G = 1, FUSION_J_PER_G = 333.4;
const expectedCp = ({ molarMass, coefficients: [A, B, C, D, E] }) => {
  const t = REFERENCE_TEMPERATURE_K / 1000;
  const molarCp = A + B * t + C * t ** 2 + D * t ** 3 + E / t ** 2;
  return molarCp / molarMass * 1000;
};

check('fixed absorbed power and default teaching clock units', () => {
  assert.equal(POWER_W, ABSORBED_POWER_W);
  assert.equal(references.model.absorbedPowerW, ABSORBED_POWER_W);
  assert.equal(references.model.teachingClockRate, DEFAULT_CLOCK_RATE);
  assert.equal(references.schema, 1);
});

check('optional clock rates preserve teaching seconds,energy and physical parameters', () => {
  assert.deepEqual(references.model.teachingClockRates, CLOCK_RATES);
  const teachingSeconds = 2, expectedEnergyJ = ABSORBED_POWER_W * teachingSeconds;
  for (const id of ['copper', 'aluminum', 'ice']) {
    const expected = calculateRun(initialState(), id, teachingSeconds);
    near(expected.energyJ, expectedEnergyJ);
    for (const rate of CLOCK_RATES) {
      const wallSeconds = teachingSeconds / rate;
      near(wallSeconds * rate, teachingSeconds);
      const observed = calculateRun(initialState(), id, wallSeconds * rate);
      assert.deepEqual(observed, expected);
      const recorded = appendRun(initialState(), id, wallSeconds * rate);
      near(recorded.records[0].seconds, teachingSeconds);
      near(recorded.records[0].energyJ, expectedEnergyJ);
    }
  }
});

const outcomes = {};
for (const [id, science] of Object.entries(SCIENCE)) {
  const cp = expectedCp(science), expectedEnergy = 0.01 * cp * 35;
  const ref = references.samples[id], spec = SAMPLES[id];
  check(`${id}: published Shomate inputs and derived mass heat capacity`, () => {
    assert.equal(ref.source.url, science.url);
    assert.equal(ref.referenceTemperatureK, REFERENCE_TEMPERATURE_K);
    assert.equal(ref.molarMassGPerMol, science.molarMass);
    assert.deepEqual(['A', 'B', 'C', 'D', 'E'].map(key => ref.cpDerivation.coefficients[key]), science.coefficients);
    assert.deepEqual(ref.cpDerivation.publishedSolidRangeK, science.range);
    near(ref.heatCapacityJPerKgK, cp);
    near(spec.heatCapacityJPerKgK, cp);
  });
  check(`${id}:10g,25C start and60C teaching limit`, () => {
    assert.equal(ref.massG, 10); assert.equal(spec.massG, 10); assert.equal(spec.massKg, 0.01);
    assert.equal(ref.initialTemperatureC, 25); assert.equal(spec.initialTemperatureC, 25);
    assert.equal(ref.limitTemperatureC, 60); assert.equal(spec.limitTemperatureC, 60);
    near(spec.maxEnergyJ, expectedEnergy);
    const start = sample(id, 0);
    assert.equal(start.temperatureC, 25); assert.equal(start.meltFraction, 0); assert.equal(start.complete, false);
    const partial = sample(id, spec.maxEnergyJ / 2);
    near(partial.temperatureC, 25 + (spec.maxEnergyJ / 2) / (0.01 * cp));
    near(partial.temperatureC, 42.5); assert.equal(partial.phase, 'solid');
    const end = sample(id, spec.maxEnergyJ);
    assert.equal(end.temperatureC, 60); assert.equal(end.complete, true); assert.equal(end.meltFraction, 0);
    assert.throws(() => sample(id, spec.maxEnergyJ + 1));
  });
  check(`${id}: stop time,energy accounting and no input beyond limit`, () => {
    const expectedSeconds = expectedEnergy / ABSORBED_POWER_W;
    const run = calculateRun(initialState(), id, expectedSeconds + 1);
    near(run.energyJ, expectedEnergy); near(run.totalEnergyJ, expectedEnergy); near(run.seconds, expectedSeconds);
    assert.equal(run.sample.temperatureC, 60); assert.equal(run.complete, true);
    const endState = appendRun(initialState(), id, expectedSeconds + 1);
    near(endState.records[0].energyJ, expectedEnergy);
    near(endState.records[0].seconds, expectedSeconds);
    assert.deepEqual(appendRun(endState, id, 1), endState);
    outcomes[id] = { heatCapacityJPerKgK: cp, stopEnergyJ: expectedEnergy, teachingSeconds: expectedSeconds,
      wallSecondsAt1x: expectedSeconds / DEFAULT_CLOCK_RATE, wallSecondsAt4x: expectedSeconds / CLOCK_RATES[1] };
  });
}

check('ice: primary phase-change datum and explicitly different initial state', () => {
  const ref = references.samples.ice, spec = SAMPLES.ice;
  assert.equal(ref.source.url, 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=926353');
  assert.equal(ref.pressureKPa, 101.325);
  assert.equal(ref.fusionJPerG, FUSION_J_PER_G);
  assert.equal(spec.latentHeatJPerG, FUSION_J_PER_G);
  assert.equal(ref.massG, ICE_MASS_G); assert.equal(spec.massG, ICE_MASS_G); assert.equal(spec.massKg, 0.001);
  assert.equal(ref.initialTemperatureC, 0); assert.equal(spec.initialTemperatureC, 0);
  assert.equal(spec.limitTemperatureC, 0); assert.equal(spec.maxEnergyJ, ICE_MASS_G * FUSION_J_PER_G);
});

check('ice:0C plateau at0%,50% and100% melting; no heated-water extension', () => {
  for (const fraction of [0, 0.5, 1]) {
    const current = sample('ice', ICE_MASS_G * FUSION_J_PER_G * fraction);
    assert.equal(current.temperatureC, 0);
    near(current.meltFraction, fraction); near(current.remainingFraction, 1 - fraction);
    assert.equal(current.complete, fraction === 1);
  }
  assert.throws(() => sample('ice', ICE_MASS_G * FUSION_J_PER_G + 1));
});

check('ice: half-melt and full-melt time and clamped energy accounting', () => {
  const halfEnergy = ICE_MASS_G * FUSION_J_PER_G / 2, halfSeconds = halfEnergy / ABSORBED_POWER_W;
  assert.equal(halfEnergy, 166.7); near(halfSeconds, 16.67);
  near(halfSeconds / DEFAULT_CLOCK_RATE, 16.67);
  near(halfSeconds / CLOCK_RATES[1], 4.1675);
  const half = calculateRun(initialState(), 'ice', halfSeconds);
  near(half.totalEnergyJ, 166.7); near(half.sample.meltFraction, 0.5); assert.equal(half.sample.temperatureC, 0);
  const stopSeconds = ICE_MASS_G * FUSION_J_PER_G / ABSORBED_POWER_W;
  const full = calculateRun(initialState(), 'ice', stopSeconds + 10);
  assert.equal(full.energyJ, 333.4); near(full.seconds, 33.34); assert.equal(full.sample.temperatureC, 0);
  assert.equal(full.complete, true);
  const endState = appendRun(initialState(), 'ice', stopSeconds + 10);
  assert.deepEqual(appendRun(endState, 'ice', 10), endState);
  outcomes.ice = { fusionJPerG: FUSION_J_PER_G, halfEnergyJ: halfEnergy, halfTeachingSeconds: halfSeconds,
    halfWallSecondsAt1x: halfSeconds / DEFAULT_CLOCK_RATE, halfWallSecondsAt4x: halfSeconds / CLOCK_RATES[1],
    stopEnergyJ: 333.4, stopTeachingSeconds: stopSeconds,
    stopWallSecondsAt1x: stopSeconds / DEFAULT_CLOCK_RATE, stopWallSecondsAt4x: stopSeconds / CLOCK_RATES[1] };
});

const expectedAssets = [
  'assets/textures/wood_floor-diff.jpg', 'assets/textures/wood_floor-nor_gl.jpg',
  'assets/textures/wood_floor-rough.jpg', 'assets/environment/coastal-day.hdr',
];
assert.deepEqual(references.appearance.reusedAssets.map(asset => asset.file), expectedAssets);
let assetBytes = 0;
for (const file of expectedAssets) check(`preserved original CC0 asset:${file}`, () => {
  const entry = studioManifest.files.find(item => item.file === file);
  assert.ok(entry, `Unregistered original ${file}`);
  assert.match(entry.license, /CC0/);
  assert.ok(entry.source.startsWith('https://dl.polyhaven.org/file/ph-assets/'));
  const bytes = fs.readFileSync(path.join(project, 'web/studio', file));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assetBytes += bytes.length;
});

console.log(JSON.stringify({ result: 'PASS', checks: checks.length, defaultTeachingClockRate: DEFAULT_CLOCK_RATE,
  teachingClockRates: CLOCK_RATES, physicalSamples: 3, assetFiles: expectedAssets.length,
  assetBytes, outcomes, boundary: 'Constant25C metal Cp and zero-loss teaching model; default1x and optional4x are declared clock conversions, not changes to absorbed10W power. Asset/physics checks do not certify UI or real combustion/heat-transfer behavior.' }));
