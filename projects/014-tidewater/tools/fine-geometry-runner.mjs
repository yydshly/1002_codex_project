import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CODEX_ENTRY, PROVIDER, digest, validateControlInput, decodeImage } from './control-model-runner.mjs';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { validateCompletionRecipe } from '../web/scene-completion-core.js';
import { fineGeometrySchema, validateFineGeometry, validateFineScope, fineGeometryPatchSchema, validateFineGeometryPatch, mergeFineGeometryPatch, FINE_LIMITS } from '../web/fine-geometry-core.js';

const json = value => JSON.stringify(value, null, 2) + '\n';
export function validateFineControlInput(input) {
  const keys = ['plan', 'intent', 'views', 'baseRecipe', 'previousGeometry', 'scopeIds'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key)) || keys.slice(0, 4).some(key => !Object.hasOwn(input, key))) throw new Error('精细模型请求包含未知或缺少字段。');
  const original = validateControlInput({ plan: input.plan, intent: input.intent, views: input.views, mode: 'generate' });
  const baseRecipe = validateCompletionRecipe(input.baseRecipe, original.plan);
  // Fail before invoking a model when the source has no editable object targets.
  fineGeometrySchema(original.plan, baseRecipe);
  let previousGeometry = null, scopeIds = [];
  if (Object.hasOwn(input, 'previousGeometry') || Object.hasOwn(input, 'scopeIds')) {
    if (!Object.hasOwn(input, 'previousGeometry') || !Object.hasOwn(input, 'scopeIds')) throw new Error('局部几何请求须同时提供 previousGeometry 和 scopeIds。');
    previousGeometry = validateFineGeometry(input.previousGeometry, original.plan, { baseRecipe });
    scopeIds = validateFineScope(original.plan, input.scopeIds);
  }
  return { plan: original.plan, intent: original.intent, views: original.views, baseRecipe, mode: previousGeometry ? 'refine' : 'generate', previousGeometry, scopeIds };
}

function basePromptFor(input, images) {
  const plan = { ...input.plan };
  if (plan.reference) {
    const reference = decodeImage({ label: 'source', dataUrl: plan.reference.dataUrl });
    plan.reference = { name: plan.reference.name, width: plan.reference.width, height: plan.reference.height, imageSha256: reference.sha256, attachedView: images.find(image => image.sha256 === reference.sha256)?.label };
  }
  return `You are the real visual modeling controller completing an authored coastal 3D scene. Inspect all attached views, the complete source layout and the confirmed appearance recipe. Return only JSON matching the supplied component geometry schema. Do not call tools, run commands, inspect files, browse, write executable code, or return asset URLs. You design new actual component meshes in a bounded geometry language; this is NOT neural image-to-3D inference.\n\nUSER SPACE IS AUTHORITATIVE. The executor keeps every original stable ID, position, authored height, spatial envelope, terrain outline and lock. Include exactly one instance for every UNLOCKED cabin/lighthouse/palm/boat; no instance for land/water/road or locked objects. Copy each instance rotationDeg EXACTLY from its baseRecipe object. Reuse a coherent template for similar objects when appropriate; make separate templates where the user's intent requires distinct forms. Every template must be used.\n\nDESIGN THE FORMS YOURSELF, not just a fixed appearance preset: plausible roofs, structural walls, doors, framed windows, porches, lighthouse lantern glazing and balcony railings, naturally curved palm trunk and many thin individual fronds, shaped boat hull, gunwale and interior/deck details as relevant. Favor a readable coherent silhouette and physical continuity from all sides. Colors, roughness, metalness, procedural texture selection and small emissive surfaces should follow the scene intent and base palette. Glass may be transparent. Never claim photorealism, inferred neural textures, or passed visual inspection. Explain limitations in summary.\n\nGEOMETRY SEMANTICS:\n- Template coordinates are normalized to the original object's width/height/depth, Y-up: X/Z about -0.5..0.5, Y about 0..1; only modest eaves may exceed. center limits X/Z [-0.7,0.7], Y [-0.1,1.1]. size multiplies the unit primitive independently along each axis, range [.002,1.4]. rotationDeg is the part's local XYZ Euler angles. Instances only rotate around Y according to baseRecipe.\n- box has full dimensions [1,1,1]; ellipsoid is a sphere of radius .5; cylinder/cone have radius .5 and height 1 along Y; torus has major radius .375 and tube radius .125; gable-roof occupies a unit box. Their points and indices MUST be [].\n- curved-tube uses >=2 distinct consecutive points within [-1,1] per axis; points are normalized primitive-local centerline coordinates, tube radius .025 before size scaling. size controls local per-axis scaling.\n- leaf uses >=3 non-collinear primitive-local points for a thin leaf outline; indices [].\n- lathe uses >=2 distinct consecutive profile points [radius,y,0], radius 0..1, y -1..1; indices []. It revolves around local Y.\n- mesh uses 3..256 primitive-local vertices, each axis [-1,1], and 3..1536 indices in complete non-degenerate triangle triples. Indices must reference existing vertices. The executor applies the part's size, rotation and center after constructing the primitive. Use mesh for convincing hull contours and customized architectural details if useful.\n- repeat.count copies the whole part 1..64 times. Copy i adds i*step to center and i*turnDeg to XYZ Euler rotation; it does not rotate center around an origin. First and last centers MUST stay within the center limits. For a single part use count 1, step [0,0,0], turnDeg [0,0,0].\n- Every part field is required even if unused. segments is an integer 3..48; prefer 8..20 for small detail. There are at most 16 materials, 12 templates, 100 parts per template, and 2500 expanded render parts across ALL instances (including repeated template reuse). Keep the design efficient, preferably below 1000 expanded parts.\n- Material texture enum none/plaster/wood/rock/grass selects existing local procedural detail; these are not model-predicted image textures. emissive is a #RRGGBB color, use #000000 normally. opacity range .08..1. IDs must be short alphanumeric/underscore/hyphen tokens, references exact.\n\nATTACHED BINARY IMAGE ORDER:\n${json(images.map(({ label, sha256 }, index) => ({ number: index + 1, label, sha256 })))}\nAUTHORITATIVE INPUT:\n${json({ authorRequest: input.intent, sourceFingerprint: fingerprintPlan(input.plan), sourcePlan: plan, baseRecipe: input.baseRecipe })}`;
}
function geometryHandbook() {
  return `MANDATORY EXECUTOR GEOMETRY HANDBOOK — use these exact meanings, not guessed primitive semantics:
1. All coordinates are Y-up. A cylinder is centered at the origin, has radius 0.5 in X/Z and height 1 along Y. Its local bottom is Y=-0.5, top Y=+0.5. A cone has a FULL sharp apex at Y=+0.5 and radius-0.5 base at Y=-0.5. It is NOT a truncated cone. Lighthouse towers must be believable continuous SOLID columns, using cylinder or a lathe profile with positive top radius; use cone only for pointed roofs or other actual apex forms. Profile [radius,y,0] turns around local Y; choose actual bottom/top profile radii to build a tapered tower. Keep overlapping decorative bands on the tower surface, not detached disks.
2. A torus is initially a ring in the local XY plane with normal along local Z, major radius 0.375 and tube radius 0.125. size.X and size.Y determine its TWO RING DIAMETERS; size.Z controls tube depth. To make a horizontal circular railing ring, first use nearly equal size.X and size.Y (for example [0.6,0.6,0.025]), THEN rotationDeg.X=90. Do NOT use [diameter,thinHeight,diameter] before X=90: that flattens the ring into a strip. Small railing thickness also scales the torus's tube proportions; inspect the actual silhouette.
3. curved-tube has FIXED primitive-local radius 0.025 before independent XYZ size scaling. Its centerline is exactly the supplied points. The local radius is not a world-space radius and is not size.X itself. Design points and sizes together so the trunk/stem/rail is neither a needle nor a huge rod. Connected parts must touch the predicted end of the tube after all transforms.
4. leaf points are a true thin polygon outline. For natural palm leaves, spread the outline across local X/Z to express ACTUAL leaf width, while varying local Y to droop. Multiplying size.Z cannot create width if every supplied point.Z is zero. Author both sides of the outline with nonzero Z, or use a suitable explicit mesh. Use approximately 8–12 thin curved fronds in different directions, continuously attached to the crown; never substitute a ball for the fronds.
5. repeat rotates EACH COPY AROUND ITS OWN CENTER. It DOES NOT rotate a copy's center around an object or around a circular path. For circular balcony posts and lantern glazing posts, define each separate part.center explicitly on the circle (for example [r*cos(theta),height,r*sin(theta)] computed as ordinary numeric JSON values), each with count=1. Do not give a vertical post count>1, step=[0,0,0], turnDeg=[0,angle,0]: all those posts overlap in the exact same place. Linear repeats with nonzero step are allowed for row windows or columns.
6. A boat needs a coherent continuous hull with believable wall thickness and usable interior. Prefer explicitly shaped mesh sides, bottom, bow/stern and gunwale, with consistent adjoining vertices, enough sections to form smooth contours, and visible inner wall/deck surfaces. A closed extremely low-face wedge with boxes on top is not a convincing boat interior. Use separate inner and outer surfaces or suitably paired mesh walls when needed. Keep geometry editable and efficient; do not claim watertightness or visual acceptance merely because indices are valid.
7. ribbon is a continuous thin STRIP specified by alternating left/right section vertices: [L0,R0,L1,R1,L2,R2,...]. Supply an EVEN number of points, minimum 4 (two valid sections), normally 8–20 or more to describe a curved frond. Each section must have nonzero width; adjacent section centers must differ; both triangles [Li,Ri,Lnext] and [Ri,Rnext,Lnext] must be non-degenerate. indices MUST be []. The renderer connects the supplied stations directly with two triangles per span; it does NOT infer a curve, interpolate more stations, or add thickness. UV follows the section centerline arc length. size.Y scales the actual Y-coordinate rise/droop, NOT leaf thickness. For a palm frond, give left/right points with real Z width and varying Y droop; do not set size.Y=.02 merely to make a thin leaf, which would flatten all droop. The strip already has zero thickness and uses double-sided rendering. Vary stations, centers and rotations for a natural crown rather than mechanically copying ten identical equally spaced blades. All points get the SAME size->XYZ rotation->center transforms as mesh vertices.
8. Geometric connections must be computed AFTER size, XYZ rotation and center, then scaled into the authored envelope. For example, a trunk end point p becomes center+rotation(size*p); place the crown where it touches that actual end, not at an unrelated normalized Y. The curved-tube radius .025 before scaling can produce an overly thick .5m leaf rib in a 10m palm envelope with sizeX=1; use explicit fine mesh/ribbon structures or appropriately scaled tube/path coordinates for thin leaf midribs, keeping full frond length. Make all attachments continuous without secretly modifying the source envelope.
9. Every new form must agree from all supplied views. Check your chosen primitives and repeat transforms mentally against this handbook before final JSON. Findings from a user's inspection are actionable constraints for the next candidate; they do not authorize moving original entities or changing already-confirmed instance rotations.`;
}
function promptFor(input, images) {
  const body = `${geometryHandbook()}\n\n${basePromptFor(input, images)}`;
  if (!input.previousGeometry) return body;
  const scope = new Set(input.scopeIds), outsideInstances = input.previousGeometry.instances.filter(instance => !scope.has(instance.entityId));
  const outsideTemplateIds = new Set(outsideInstances.map(instance => instance.templateId));
  const outsideTemplates = input.previousGeometry.templates.filter(template => outsideTemplateIds.has(template.id));
  const outsideMaterialIds = new Set(outsideTemplates.flatMap(template => template.parts.map(part => part.material)));
  const outsideParts = outsideInstances.reduce((sum, instance) => sum + input.previousGeometry.templates.find(template => template.id === instance.templateId).parts.reduce((n, part) => n + part.repeat.count, 0), 0);
  return `${body}\n\nLOCAL GEOMETRY REFINEMENT OVERRIDE: In this mode, the full-scene coverage instruction above is REPLACED. Return tidewater-fine-geometry-patch.v1 and include instances for ONLY the exact scopeIds below, each once, no other objects. Design complete replacement templates for those scoped objects. The executor, not the model, preserves all outside instances, their component records, material definitions and rotations exactly. A shared old template will remain for outside objects; your changed local definition will be isolated under a fresh ID if necessary. Do not attempt to edit outside content or global scene environment. All instance rotationDeg values MUST equal their previousGeometry records. sourceFingerprint still binds the COMPLETE original sourcePlan.\n\nYou may use materials:[] and refer to a material ID from previousGeometry to borrow it unchanged. Declare only necessary new/changed materials. A changed material shared by an outside object will be isolated, so it consumes a new material slot. Obsolete dependencies used exclusively by scope may be removed during merging. Available remaining new template slots: ${FINE_LIMITS.templates - outsideTemplates.length}; new material slots: ${FINE_LIMITS.materials - outsideMaterialIds.size}; remaining expanded render-part budget for scope: ${FINE_LIMITS.renderedParts - outsideParts}. Preserve the requested improvements and efficiently reuse verified material IDs when capacity is small. Every emitted template must be used by at least one scoped instance.\n\nLOCAL AUTHORITATIVE INPUT:\n${json({ scopeIds: input.scopeIds, previousGeometry: input.previousGeometry })}`;
}

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false }).unref();
  else child.kill('SIGTERM');
}

export async function runFineGeometryJob(input, { id, jobDir, cliVersion, onProgress = () => {} }) {
  await mkdir(jobDir, { recursive: false });
  const images = [], startedAt = new Date().toISOString();
  let threadId = null, usage = null, observedModel = null, eventCount = 0, exitCode = null;
  const receipt = { format: 'tidewater-fine-geometry-receipt.v1', id, provider: PROVIDER, cliVersion, method: 'model-authored-component-meshes', generatedWholeSceneNeurally: false, mode: input.previousGeometry ? 'refine' : 'generate', scopeIds: input.scopeIds || [], preservedOutsideScope: input.previousGeometry ? false : null, previousGeometrySha256: input.previousGeometry ? digest(json(input.previousGeometry)) : null, startedAt, finishedAt: null, sourceFingerprint: fingerprintPlan(input.plan), planSha256: digest(json(input.plan)), baseRecipeSha256: digest(json(input.baseRecipe)), images, threadId, model: observedModel, usage, eventCount, exitCode, sandbox: 'read-only', tools: 'disabled', status: 'running' };
  await writeFile(path.join(jobDir, 'source-plan.json'), json(input.plan));
  await writeFile(path.join(jobDir, 'base-recipe.json'), json(input.baseRecipe));
  if (input.previousGeometry) await writeFile(path.join(jobDir, 'previous-geometry.json'), json(input.previousGeometry));
  for (const [index, view] of input.views.entries()) {
    const file = `view-${index + 1}.${view.extension}`; await writeFile(path.join(jobDir, file), view.bytes);
    images.push({ file, label: view.label, mime: view.mime, bytes: view.bytes.length, sha256: view.sha256 });
  }
  const prompt = promptFor(input, images), schema = input.previousGeometry ? fineGeometryPatchSchema(input.plan, input.previousGeometry, input.scopeIds, input.baseRecipe) : fineGeometrySchema(input.plan, input.baseRecipe);
  receipt.promptSha256 = digest(prompt); receipt.schemaSha256 = digest(json(schema));
  await writeFile(path.join(jobDir, 'request.json'), json({ mode: receipt.mode, scopeIds: receipt.scopeIds, intent: input.intent, sourceFingerprint: receipt.sourceFingerprint, images, baseRecipeSha256: receipt.baseRecipeSha256, previousGeometrySha256: receipt.previousGeometrySha256 }));
  await writeFile(path.join(jobDir, 'prompt.txt'), prompt);
  await writeFile(path.join(jobDir, 'schema.json'), json(schema));
  await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
  const args = [CODEX_ENTRY, 'exec', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--json', '--disable', 'shell_tool', '--disable', 'apply_patch_freeform', '--disable', 'multi_agent', '--output-schema', path.join(jobDir, 'schema.json'), '--output-last-message', path.join(jobDir, 'response.json')];
  for (const image of images) args.push('--image', path.join(jobDir, image.file)); args.push('-');
  let stdout = '', stderr = '', carry = '', stoppedReason = null;
  try {
    onProgress({ stage: 'starting', message: `${images.length} 张实际视图及原布局已准备，模型开始设计精细部件。`, eventCount });
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: jobDir, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      const timer = setTimeout(() => { stoppedReason = '精细建模任务超过 10 分钟。'; stopProcess(child); }, 10 * 60 * 1000);
      const event = line => {
        if (!line.trim()) return;
        let data; try { data = JSON.parse(line); } catch { return; } eventCount++;
        if (data.type === 'thread.started') threadId = data.thread_id || null;
        if (data.type === 'turn.completed') usage = data.usage || null;
        if (typeof data.model === 'string') observedModel = data.model;
        if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(data.item?.type)) { stoppedReason = '模型尝试使用禁止工具，精细任务已终止。'; stopProcess(child); }
        onProgress({ stage: 'inference', message: data.type === 'thread.started' ? '模型正在读取场景并设计几何与细节。' : data.type === 'turn.completed' ? '已收到真实模型部件，正在检查布局与几何预算。' : `模型事件：${data.type}`, eventCount, lastEventAt: new Date().toISOString(), threadId });
      };
      child.stdout.on('data', chunk => {
        const text = chunk.toString('utf8'); stdout += text; carry += text;
        if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) { stoppedReason = '精细模型事件输出超过限制。'; stopProcess(child); }
        let newline; while ((newline = carry.indexOf('\n')) >= 0) { event(carry.slice(0, newline)); carry = carry.slice(newline + 1); }
      });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); if (Buffer.byteLength(stderr) > 1024 * 1024) { stoppedReason = '精细模型错误输出超过限制。'; stopProcess(child); } });
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') { stoppedReason = error.message; stopProcess(child); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); exitCode = code; if (carry.trim()) event(carry); stoppedReason || code !== 0 ? reject(new Error(stoppedReason || `Codex CLI 返回 ${code}：${stderr.slice(-2000) || stdout.slice(-2000)}`)) : resolve(); });
      child.stdin.end(prompt, 'utf8');
    });
    const output = await readFile(path.join(jobDir, 'response.json')); if (output.length > 1024 * 1024) throw new Error('精细几何响应超过 1 MiB。');
    const raw = JSON.parse(output.toString('utf8')), options = { baseRecipe: input.baseRecipe };
    let geometry;
    if (input.previousGeometry) {
      await writeFile(path.join(jobDir, 'raw-patch.json'), output);
      receipt.rawPatchSha256 = digest(output);
      const patch = validateFineGeometryPatch(raw, input.plan, input.previousGeometry, input.scopeIds, options);
      await writeFile(path.join(jobDir, 'patch.json'), json(patch)); receipt.patchSha256 = digest(json(patch));
      geometry = mergeFineGeometryPatch(input.previousGeometry, patch, input.plan, input.scopeIds, options);
      await writeFile(path.join(jobDir, 'merged-geometry.json'), json(geometry)); receipt.mergedGeometrySha256 = digest(json(geometry)); receipt.preservedOutsideScope = true;
    } else geometry = validateFineGeometry(raw, input.plan, options);
    await writeFile(path.join(jobDir, 'geometry.json'), json(geometry));
    const renderedParts = geometry.instances.reduce((sum, instance) => sum + geometry.templates.find(template => template.id === instance.templateId).parts.reduce((n, part) => n + part.repeat.count, 0), 0);
    Object.assign(receipt, { status: 'succeeded', finishedAt: new Date().toISOString(), threadId, model: observedModel, usage, eventCount, exitCode, rawOutputSha256: digest(output), geometrySha256: digest(json(geometry)), consistency: { preservedIds: true, preservedSourcePlan: true, preservedLocks: true, preservedInstanceRotations: true, preservedOutsideScope: receipt.preservedOutsideScope, scopeIds: receipt.scopeIds, instances: geometry.instances.length, templates: geometry.templates.length, renderedParts, visualQuality: 'needs-user-review' } });
    await writeFile(path.join(jobDir, 'events.ndjson'), stdout); await writeFile(path.join(jobDir, 'stderr.log'), stderr); await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
    onProgress({ stage: 'complete', message: '模型设计的精细部件已通过原布局、引用与几何预算检查，等待渲染和视觉验收。', eventCount, lastEventAt: receipt.finishedAt });
    return { geometry, receipt };
  } catch (error) {
    const detail = String(error.message || error).slice(0, 4000);
    Object.assign(receipt, { status: 'failed', finishedAt: new Date().toISOString(), threadId, model: observedModel, usage, eventCount, exitCode, error: detail });
    await writeFile(path.join(jobDir, 'events.ndjson'), stdout); await writeFile(path.join(jobDir, 'stderr.log'), stderr); await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
    const failure = new Error(detail); failure.receipt = receipt; throw failure;
  }
}
