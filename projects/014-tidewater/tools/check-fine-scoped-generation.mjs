// Audit real scoped model jobs from their saved binary inputs, CLI events and
// response files. This never starts a service or invokes a model.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { validateCompletionRecipe } from '../web/scene-completion-core.js';
import { validateFineGeometry, validateFineScope, fineGeometryPatchSchema, validateFineGeometryPatch, mergeFineGeometryPatch, FINE_LIMITS } from '../web/fine-geometry-core.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), reportName = args.find(v=>v.startsWith('--report='))?.slice(9) ?? 'fine-scoped-generation-results.json';
if(!/^[a-z0-9-]+\.json$/u.test(reportName))throw new Error('Invalid report filename');
const requestedIds=args.filter(v=>!v.startsWith('--report='));
const jobIds = requestedIds.length ? requestedIds : ['2740da41-5b9a-448d-9198-23c3d0e99e1e', '40f03009-853b-40f3-b8dc-ca55f400e198'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const counts = geometry => ({ instances: geometry.instances.length, templates: geometry.templates.length, materials: geometry.materials.length, expandedParts: geometry.instances.reduce((sum, instance) => sum + geometry.templates.find(template => template.id === instance.templateId).parts.reduce((n, part) => n + part.repeat.count, 0), 0), ribbonDefinitions: geometry.templates.reduce((sum, template) => sum + template.parts.filter(part => part.primitive === 'ribbon').length, 0) });
function dependencies(geometry, instance) {
  const template = geometry.templates.find(item => item.id === instance.templateId);
  const materialIds = new Set(template.parts.map(part => part.material));
  return { instance, template, materials: geometry.materials.filter(material => materialIds.has(material.id)) };
}
function outside(geometry, scopeIds) {
  const scope = new Set(scopeIds), instances = geometry.instances.filter(instance => !scope.has(instance.entityId));
  const templateIds = new Set(instances.map(instance => instance.templateId)), templates = geometry.templates.filter(template => templateIds.has(template.id));
  const materialIds = new Set(templates.flatMap(template => template.parts.map(part => part.material)));
  return { instances, templates, materials: geometry.materials.filter(material => materialIds.has(material.id)) };
}

async function inspectJob(jobId) {
  if (!uuidPattern.test(jobId)) throw new Error('Invalid UUID job argument');
  const directory = path.join(project, 'assets', 'control-model', 'jobs', jobId);
  const required = ['receipt.json', 'request.json', 'source-plan.json', 'base-recipe.json', 'previous-geometry.json', 'raw-patch.json', 'response.json', 'patch.json', 'merged-geometry.json', 'geometry.json', 'schema.json', 'prompt.txt', 'events.ndjson'];
  const files = new Map(await Promise.all(required.map(async name => [name, await readFile(path.join(directory, name))])));
  const readJSON = name => JSON.parse(files.get(name).toString('utf8'));
  const receipt = readJSON('receipt.json'), request = readJSON('request.json'), plan = readJSON('source-plan.json'), base = readJSON('base-recipe.json');
  const previous = readJSON('previous-geometry.json'), raw = readJSON('raw-patch.json'), savedPatch = readJSON('patch.json'), merged = readJSON('merged-geometry.json'), geometry = readJSON('geometry.json');
  const checks = [];
  const check = (name, passed, details) => checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
  check('real scoped receipt identity and status', receipt.id === jobId && receipt.status === 'succeeded' && receipt.mode === 'refine' && receipt.method === 'model-authored-component-meshes' && receipt.generatedWholeSceneNeurally === false && receipt.exitCode === 0);
  const sourceFingerprint = fingerprintPlan(plan);
  const baseValid = validateCompletionRecipe(base, plan), options = { baseRecipe: baseValid };
  const previousValid = validateFineGeometry(previous, plan, options), scopeIds = validateFineScope(plan, request.scopeIds);
  check('full source fingerprint and exact request scope', [receipt.sourceFingerprint, request.sourceFingerprint, previous.sourceFingerprint, raw.sourceFingerprint, merged.sourceFingerprint].every(value => value === sourceFingerprint) && same(scopeIds, receipt.scopeIds) && same(scopeIds, receipt.consistency.scopeIds) && request.mode === 'refine', { sourceFingerprint, sourceEntities: plan.entities.length, scopeIds, scopeKinds: scopeIds.map(id => plan.entities.find(entity => entity.id === id).kind) });
  const hashFields = { 'source-plan.json': 'planSha256', 'base-recipe.json': 'baseRecipeSha256', 'previous-geometry.json': 'previousGeometrySha256', 'raw-patch.json': 'rawPatchSha256', 'response.json': 'rawOutputSha256', 'patch.json': 'patchSha256', 'merged-geometry.json': 'mergedGeometrySha256', 'geometry.json': 'geometrySha256', 'schema.json': 'schemaSha256', 'prompt.txt': 'promptSha256' };
  const hashes = {};
  for (const [file, field] of Object.entries(hashFields)) { const actual = sha(files.get(file)); hashes[file] = actual; check(`saved ${file} SHA-256`, actual === receipt[field], { actual, receipt: receipt[field] }); }
  check('request hashes bind the same original plan and prior candidate', request.baseRecipeSha256 === hashes['base-recipe.json'] && request.previousGeometrySha256 === hashes['previous-geometry.json']);
  check('raw patch is the untouched CLI response', files.get('raw-patch.json').equals(files.get('response.json')));
  const patchValid = validateFineGeometryPatch(raw, plan, previousValid, scopeIds, options);
  check('raw patch canonicalizes to persisted validated patch', same(patchValid, savedPatch) && sha(json(patchValid)) === hashes['patch.json']);
  check('patch contains only scope IDs, never outside or locked entities', same(patchValid.instances.map(instance => instance.entityId), scopeIds) && patchValid.instances.every(instance => !plan.entities.find(entity => entity.id === instance.entityId).locked), { patchInstances: patchValid.instances.length });
  const reconstructed = mergeFineGeometryPatch(previousValid, patchValid, plan, scopeIds, options);
  check('independent merge replay reproduces stored complete geometry', same(reconstructed, merged) && sha(json(reconstructed)) === hashes['merged-geometry.json']);
  check('complete API geometry and merged geometry are byte-identical', files.get('geometry.json').equals(files.get('merged-geometry.json')));
  const outsideBefore = outside(previous, scopeIds), outsideAfter = outside(merged, scopeIds);
  check('outside original instance records are strictly equal', same(outsideBefore.instances, outsideAfter.instances), { count: outsideBefore.instances.length, ids: outsideBefore.instances.map(instance => instance.entityId) });
  check('outside shared templates and every component record are strictly equal', same(outsideBefore.templates, outsideAfter.templates), { count: outsideBefore.templates.length, ids: outsideBefore.templates.map(template => template.id), beforeSha256: sha(json(outsideBefore.templates)), afterSha256: sha(json(outsideAfter.templates)) });
  check('outside referenced material records are strictly equal', same(outsideBefore.materials, outsideAfter.materials), { count: outsideBefore.materials.length, ids: outsideBefore.materials.map(material => material.id), beforeSha256: sha(json(outsideBefore.materials)), afterSha256: sha(json(outsideAfter.materials)) });
  check('every previous stable ID and rotation is retained', same(previous.instances.map(instance => ({ id: instance.entityId, rotationDeg: instance.rotationDeg })), merged.instances.map(instance => ({ id: instance.entityId, rotationDeg: instance.rotationDeg }))));
  const scopedChanges = scopeIds.map(entityId => {
    const before = dependencies(previous, previous.instances.find(instance => instance.entityId === entityId)), after = dependencies(merged, merged.instances.find(instance => instance.entityId === entityId));
    return { entityId, beforeSha256: sha(json(before)), afterSha256: sha(json(after)), changed: !same(before, after) };
  });
  check('scoped objects contain actual changed component/material dependencies', scopedChanges.every(item => item.changed), scopedChanges);
  const stats = counts(merged); check('whole scene remains within shared budgets', stats.materials <= FINE_LIMITS.materials && stats.templates <= FINE_LIMITS.templates && stats.expandedParts <= FINE_LIMITS.renderedParts, stats);
  const schema = fineGeometryPatchSchema(plan, previousValid, scopeIds, baseValid);
  check('stored output schema matches independently reconstructed scoped schema', same(schema, readJSON('schema.json')) && sha(json(schema)) === hashes['schema.json']);
  const events = files.get('events.ndjson').toString('utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const started = events.find(event => event.type === 'thread.started'), finished = events.find(event => event.type === 'turn.completed');
  const agentMessage = events.filter(event => event.item?.type === 'agent_message').at(-1)?.item?.text;
  check('real CLI event sequence identifies thread and completion usage', started?.thread_id === receipt.threadId && finished && same(finished.usage, receipt.usage) && events.length === receipt.eventCount, { threadId: started?.thread_id, eventTypes: events.map(event => event.type), usage: finished?.usage });
  check('model message JSON equals the persisted original patch', typeof agentMessage === 'string' && same(JSON.parse(agentMessage), raw));
  check('event stream contains no prohibited model tools', !events.some(event => ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(event.item?.type)));
  const imageChecks = [];
  check('request and receipt identify identical attached image records', same(request.images, receipt.images));
  for (const image of receipt.images) {
    if (!/^view-[1-4]\.(png|jpg|webp)$/u.test(image.file)) throw new Error('Unexpected image file name');
    const binary = await readFile(path.join(directory, image.file));
    const valid = binary.length === image.bytes && sha(binary) === image.sha256;
    const dimensions = image.mime === 'image/png' ? { width: binary.readUInt32BE(16), height: binary.readUInt32BE(20) } : null;
    imageChecks.push({ file: image.file, label: image.label, bytes: binary.length, sha256: sha(binary), dimensions, passed: valid });
    check(`attached actual ${image.file} byte length and SHA-256`, valid && (!dimensions || dimensions.width > 0 && dimensions.height > 0));
  }
  const prompt = files.get('prompt.txt').toString('utf8'), startMarker = 'AUTHORITATIVE INPUT:\n', separator = '\n\nLOCAL GEOMETRY REFINEMENT OVERRIDE:', localMarker = 'LOCAL AUTHORITATIVE INPUT:\n';
  const mainStart = prompt.indexOf(startMarker) + startMarker.length, mainEnd = prompt.indexOf(separator, mainStart), localStart = prompt.lastIndexOf(localMarker) + localMarker.length;
  const mainInput = JSON.parse(prompt.slice(mainStart, mainEnd).trim()), localInput = JSON.parse(prompt.slice(localStart).trim());
  check('actual saved prompt contains original intent, full layout, base recipe, prior geometry and scope', mainInput.authorRequest === request.intent && mainInput.sourceFingerprint === sourceFingerprint && same(mainInput.sourcePlan, plan) && same(mainInput.baseRecipe, base) && same(localInput.scopeIds, scopeIds) && same(localInput.previousGeometry, previous));
  return { id: jobId, passed: checks.every(item => item.passed), sourceFingerprint, scopeIds, sourceEntityCount: plan.entities.length, outsideEntityCount: outsideBefore.instances.length, modelProvider: receipt.provider, observedModel: receipt.model, startedAt: receipt.startedAt, finishedAt: receipt.finishedAt, elapsedSeconds: (Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt)) / 1000, stats, hashes, inputs: imageChecks, checks, limits: ['文件、参数及共享依赖一致性通过不代表写实品质、碰撞或拓扑已通过验收。', '范围外组件和材质记录保持，不保证其阴影、反射或最终像素完全不变。', '精细几何来自真实控制模型的部件设计；不是整场景神经图转 3D，CLI 未报告确切模型 ID。'] };
}

const results = [];
for (const id of jobIds) {
  try { results.push(await inspectJob(id)); }
  catch (error) { results.push({ id, passed: false, error: String(error.stack || error) }); }
}
const links = results.slice(1).map((current, index) => {
  const previous = results[index], passed = previous.hashes?.['merged-geometry.json'] === current.hashes?.['previous-geometry.json'] && previous.hashes?.['source-plan.json'] === current.hashes?.['source-plan.json'] && previous.hashes?.['base-recipe.json'] === current.hashes?.['base-recipe.json'];
  return { previousJobId: previous.id, currentJobId: current.id, passed, previousMergedSha256: previous.hashes?.['merged-geometry.json'], currentPreviousSha256: current.hashes?.['previous-geometry.json'], updatedInspectionImages: current.inputs?.slice(1).filter((image, i) => image.sha256 !== previous.inputs?.[i + 1]?.sha256).map(image => image.file) };
});
const report = { format: 'tidewater-scoped-fine-generation-check.v1', checkedAt: new Date().toISOString(), method: 'Read saved source and actual images; check CLI event/output evidence; validate and replay scoped merge; independently compare outside dependency records and all receipt hashes.', passed: results.every(result => result.passed) && links.every(link => link.passed), jobs: results, sequentialLineage: links };
await mkdir(path.join(project, 'checks'), { recursive: true });
await writeFile(path.join(project, 'checks', reportName), json(report));
console.log(JSON.stringify({ passed: report.passed, jobs: results.map(result => ({ id: result.id, passed: result.passed, stats: result.stats, failedChecks: result.checks?.filter(check => !check.passed), error: result.error })), sequentialLineage: links, report: 'checks/'+reportName }, null, 2));
if (!report.passed) process.exitCode = 1;
