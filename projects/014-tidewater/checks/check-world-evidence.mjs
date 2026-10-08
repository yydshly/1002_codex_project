// Verify actual public-UI exports; this does not drive or change the browser.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const project = new URL('../', import.meta.url);
const json = async path => JSON.parse((await readFile(new URL(path, project), 'utf8')).replace(/^\uFEFF/, ''));
const [source, exported, effect, before, reverted, ui, local, smoke] = await Promise.all([
  'assets/world-generation-source-plan.json', 'assets/world-final.recipe.json',
  'assets/world-final.effect.json', 'assets/world-confirmed-before-v1.json',
  'assets/world-reverted-confirmed-v1.json', 'checks/world-ui-observations.json',
  'assets/local-gpu-browser-generation-final-v1.json', 'checks/local-service-smoke-results.json',
].map(json));
const recipe = exported.recipe, checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('Complete original draft, entry and all 25 entities remain unchanged', equal(source, recipe.sourcePlan) && equal(source, effect.plan) && source.entry === 'image' && recipe.tasks.length === 25);
check('Every task keeps its original ID and complete source object', recipe.tasks.every(task => equal(task.sourceEntity, source.entities.find(e => e.id === task.entityId))));
check('All 25 tasks loaded real geometry or established layout geometry', recipe.tasks.every(task => task.status === 'succeeded' && task.output.triangles > 0));
check('17 actual neural instances are loaded with honest default palm display', effect.assetOverrides.length === 17 && exported.display.palm === 'original' && effect.assetOverrides.filter(a => a.display === 'original').length === 8 && effect.renderer.visibleGeneratedAssets === 9);
check('Confirmed boat uses the actual new local GPU task for only that object', recipe.tasks.find(t => t.entityId === 'boat-0da1d0f1').source.provenance.taskId === ui.taskId && local.output.taskId === ui.taskId);
check('Six other boats retain the explicitly shared default asset', recipe.tasks.filter(t => t.kind === 'boat' && t.entityId !== 'boat-0da1d0f1').length === 6 && recipe.tasks.filter(t => t.kind === 'boat' && t.entityId !== 'boat-0da1d0f1').every(t => t.source.assetId === 'triposr-boat-v1'));
check('Confirmed cabin retains the real TRELLIS task', recipe.tasks.find(t => t.entityId === 'cabin-eee16daa').source.provenance.taskId === '7731f838b77c48b69c074368a1cc8bdd');
const task = await json(`web/assets/neural/local-jobs/${ui.taskId}/task.json`);
const binary = await readFile(new URL('web' + task.output.glbUrl, project));
check('Actual persisted CUDA task succeeded with verified binary output', task.status === 'succeeded' && task.output.receipt.method === 'neural-3d' && task.output.receipt.gpuPeakAllocatedMiB > 0 && task.output.bytes === binary.length && createHash('sha256').update(binary).digest('hex') === task.output.sha256);
check('Model conditioning truthfully records image only', local.providerReceipt.input.sendsTextPrompt === false && local.conditioning.includes('不接收文字提示'));
const modelIds = value => value.assetOverrides.map(a => a.entityId).sort();
check('Repeat assembly and revert preserve both confirmed local replacements', ui.repeatAssemblySucceeded && before.assetOverrides.length === 2 && equal(modelIds(before), modelIds(reverted)) && equal(before.plan, reverted.plan) && reverted.renderer.worldQuality === false && reverted.assetOverrides.every(a => a.status === 'committed'));
check('Saved whole-scene version really restored after refresh', exported.saved && ui.restoredStatus.startsWith('已恢复独立保存的整片场景') && exported.recipe.sourceFingerprint === effect.sourceFingerprint);
check('Coarse comparison and raw tree comparison report actual visible counts', ui.coarseVisibleCountObserved === 0 && ui.realisticVisibleCountObserved === 9 && ui.rawPalmVisibleCountObserved === 17 && ui.treeChoiceSurvivedRefresh);
check('Day/sunset, backside inspection and restore input lock were observed', ui.lightingDayAndSunsetObserved && ui.backsideViewsObserved.includes('lighthouse') && ui.backsideViewsObserved.includes('boat') && ui.restoreTemporarilyDisabledAssetTarget);
check('All HTTP/integrity/preservation smoke checks pass', smoke.results.length === 12 && smoke.results.every(r => r.passed));
const unit = await readFile(new URL('checks/world-unit-results.txt', project), 'utf8');
check('All 166 meaningful Node regressions pass', /# pass 166\b/.test(unit) && /# fail 0\b/.test(unit));
const output = {
  format: 'tidewater-world-browser-evidence.v1', verifiedAt: new Date().toISOString(),
  sourceFingerprint: recipe.sourceFingerprint, sourceEntry: source.entry, checks,
  performanceAtCapturedView: effect.renderer.performance,
  quality: { state: 'candidate-needs-visual-correction', neuralPalm: 'thin-frond reconstruction failed visual inspection; original procedural fronds are the default', limits: ['single-image unseen geometry remains inferred', 'TripoSR RGB is not independent generated PBR', 'terrain and water are controlled procedural geometry', 'JSON is not a complete portable binary scene package', 'FPS is one local view measurement, not a device guarantee'] },
  screenshots: ['assets/world-current-page-v1.png', 'assets/world-lighthouse-back-v1.png', 'assets/world-boat-back-v1.png', 'assets/world-palm-neural-original-v1.png', 'assets/world-sunset-candidate-v1.png'],
};
await writeFile(new URL('checks/world-browser-results.json', project), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passed: checks.filter(c => c.passed).length, total: checks.length, failed: checks.filter(c => !c.passed) }));
if (checks.some(c => !c.passed)) process.exitCode = 1;
