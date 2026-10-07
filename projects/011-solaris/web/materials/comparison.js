import {
  POWER_W, MAX_RECORDS, SAMPLES, PORTS, validateState, resetSample, selectSample,
  setSource, calculateRun, appendRun, sample,
} from './core.js';

export const COMPARISON_DOSES = Object.freeze([40, 80, 120]);

function dose(value) {
  if (typeof value !== 'number' || !COMPARISON_DOSES.includes(value)) {
    throw new Error('同热量对照只支持 40、80 或 120 J');
  }
  return value;
}

function metal(id) {
  if (id !== 'copper' && id !== 'aluminum') throw new Error('同热量对照只支持铜和铝');
  return SAMPLES[id];
}

/** A fresh, equal-dose comparison keeps the ice experiment and never reuses input IDs.
 *  The caller owns the single History transaction spanning both sequential heat inputs.
 */
export function prepareComparison(state, doseJ) {
  const current = validateState(state);
  dose(doseJ);
  let next = resetSample(resetSample(current, 'copper'), 'aluminum');
  if (next.records.length > MAX_RECORDS - 2) throw new Error('同热量对照需要至少两条可用热输入记录');
  if (next.nextId > 999_998) throw new Error('热输入记录编号不足以完成铜铝对照');
  next = selectSample(setSource(next, PORTS.find(port => port.id === 'copper').position), 'copper');
  return next;
}

/** The comparison dose is a stopping condition, separate from the sample's 60°C limit.
 *  All previews still use the ordinary 10 W, constant-Cp teaching calculation.
 */
export function calculateDoseRun(state, id, doseJ, requestedSeconds) {
  const current = validateState(state), spec = metal(id), target = dose(doseJ);
  if (typeof requestedSeconds !== 'number' || !Number.isFinite(requestedSeconds) || requestedSeconds < 0) {
    throw new Error('热输入时间必须为非负有限秒数');
  }
  const before = current.energies[id];
  if (before > target) throw new Error('样品已有热量超过对照剂量，请先重新开始对照');
  const remaining = target - before, targetSeconds = remaining / POWER_W;
  const run = calculateRun(current, id, Math.min(requestedSeconds, targetSeconds));
  // Quantize a reached target to its exact registered dose, including binary rounding at the final frame.
  const totalEnergyJ = requestedSeconds >= targetSeconds || run.totalEnergyJ >= target ? target : run.totalEnergyJ;
  const energyJ = totalEnergyJ - before, reading = sample(id, totalEnergyJ);
  return { ...run, energyJ, seconds: energyJ / POWER_W, totalEnergyJ,
    remainingSeconds: (spec.maxEnergyJ - totalEnergyJ) / POWER_W,
    complete: reading.complete, sample: reading, doseJ: target,
    targetReached: totalEnergyJ === target, doseRemainingSeconds: (target - totalEnergyJ) / POWER_W };
}

/** Commit the same truncated input shown by the preview; a zero input consumes no ledger slot or ID. */
export function appendDoseRun(state, id, doseJ, requestedSeconds) {
  const current = validateState(state), run = calculateDoseRun(current, id, doseJ, requestedSeconds);
  if (run.energyJ === 0) return current;
  const next = appendRun(current, id, run.seconds), record = next.records.at(-1);
  // appendRun performs the normal capacity/ID checks. Match its final row to the preview's exact dose
  // so a multiply/divide round trip cannot leave the next frame fractionally above that dose.
  next.energies[id] = run.totalEnergyJ;
  record.energyJ = run.energyJ; record.seconds = run.seconds;
  return validateState(next);
}
