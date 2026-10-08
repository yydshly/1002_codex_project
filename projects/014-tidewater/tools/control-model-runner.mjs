import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validatePlan } from '../web/creation-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { completionSchema, validateCompletionRecipe, completionConsistency } from '../web/scene-completion-core.js';

export const CODEX_ENTRY = 'C:/Users/yun68/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js';
export const PROVIDER = 'Codex CLI / ChatGPT';
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const executeFile = promisify(execFile);
export const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const validText = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

function strictFields(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}须为对象。`);
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) throw new Error(`${label}包含未知或缺少字段。`);
}

export function decodeImage(view) {
  strictFields(view, ['label', 'dataUrl'], ['label', 'dataUrl'], '视图');
  if (!validText(view.label, 120)) throw new Error('视图名称无效。');
  const match = typeof view.dataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(view.dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new Error('视图只支持 PNG/JPEG/WebP base64。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== match[2]) throw new Error('图片过大或 base64 编码无效。');
  const signature = match[1] === 'png' ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR'
    : match[1] === 'jpeg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!signature) throw new Error('图片文件签名与声明格式不符。');
  if (match[1] === 'png') {
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192) throw new Error('PNG 图片尺寸无效。');
  }
  return { label: view.label.trim(), mime: `image/${match[1]}`, extension: match[1] === 'jpeg' ? 'jpg' : match[1], bytes, sha256: digest(bytes) };
}

export function validateControlInput(input) {
  strictFields(input, ['plan', 'intent', 'views', 'mode', 'previousRecipe', 'scopeIds'], ['plan', 'intent', 'views', 'mode'], '控制模型请求');
  const plan = validatePlan(input.plan);
  if (!plan.entities.length) throw new Error('先创建布局对象，再提交场景任务。');
  if (!validText(input.intent, 6000, true)) throw new Error('创作说明须为不超过 6000 字符的文本。');
  if (!['generate', 'refine'].includes(input.mode)) throw new Error('任务模式无效。');
  if (!Array.isArray(input.views) || input.views.length < 1 || input.views.length > 4) throw new Error('须提供 1 到 4 张布局／粗模视图。');
  const views = input.views.map(decodeImage);
  if (new Set(views.map(view => view.label)).size !== views.length) throw new Error('视图名称须唯一。');
  // An authored source image is also sent as a binary image, never as base64 tokens.
  if (plan.reference) {
    const reference = decodeImage({ label: '原始参考图', dataUrl: plan.reference.dataUrl });
    if (!views.some(view => view.sha256 === reference.sha256)) {
      if (views.length >= 4) throw new Error('4 张视图中须包含原始参考图。');
      views.push(reference);
    }
  }
  let previousRecipe = null, scopeIds = [];
  if (input.mode === 'refine') {
    previousRecipe = validateCompletionRecipe(input.previousRecipe, plan);
    const byId = new Map(plan.entities.map(entity => [entity.id, entity]));
    if (!Array.isArray(input.scopeIds) || !input.scopeIds.length || input.scopeIds.length > plan.entities.length || new Set(input.scopeIds).size !== input.scopeIds.length || input.scopeIds.some(id => !byId.has(id) || byId.get(id).locked)) throw new Error('局部任务须指定有效且未锁定的对象。');
    scopeIds = [...input.scopeIds];
  } else if ((input.previousRecipe !== undefined && input.previousRecipe !== null) || (input.scopeIds !== undefined && (!Array.isArray(input.scopeIds) || input.scopeIds.length))) throw new Error('初次场景任务不能包含局部修改记录。');
  return { plan, intent: input.intent, views, mode: input.mode, previousRecipe, scopeIds };
}

export async function probeControlModel() {
  try {
    const version = await executeFile(process.execPath, [CODEX_ENTRY, '--version'], { windowsHide: true, timeout: 10000, maxBuffer: 65536 });
    const login = await executeFile(process.execPath, [CODEX_ENTRY, 'login', 'status'], { windowsHide: true, timeout: 10000, maxBuffer: 65536 });
    const available = /logged in/i.test(`${login.stdout}\n${login.stderr}`);
    return { available, provider: PROVIDER, cliVersion: version.stdout.trim(), ...(available ? {} : { error: 'Codex CLI 尚未登录。' }) };
  } catch (error) {
    return { available: false, provider: PROVIDER, cliVersion: null, error: `Codex CLI 不可用：${String(error.message).slice(0, 400)}` };
  }
}

function schemaFor(input) {
  const schema = completionSchema(input.plan);
  if (input.mode === 'refine') {
    for (const [key, value] of Object.entries(input.previousRecipe.environment)) schema.properties.environment.properties[key].const = value;
    for (const item of schema.properties.objects.items.anyOf) {
      if (input.scopeIds.includes(item.properties.id.const)) continue;
      const previous = input.previousRecipe.objects.find(object => object.id === item.properties.id.const);
      for (const [key, value] of Object.entries(previous)) item.properties[key].const = value;
    }
  }
  return schema;
}

function promptFor(input, images) {
  const plan = { ...input.plan };
  if (plan.reference) {
    const source = decodeImage({ label: 'source', dataUrl: plan.reference.dataUrl });
    plan.reference = { name: plan.reference.name, width: plan.reference.width, height: plan.reference.height, imageSha256: source.sha256, attachedView: images.find(image => image.sha256 === source.sha256)?.label };
  }
  return `You are the real visual control model for an authored coastal 3D scene. Inspect every attached image and the complete source geometry below. Return only a JSON scene recipe matching the supplied schema. Do not call any tools, run commands, inspect files, browse, or write code.\n\nThe user's geometry is authoritative: preserve every stable ID, kind, number, point/outline, position, authored height and lock. Output every original object exactly once in source order. Output no coordinates, asset URLs, new entities, code, or inferred replacement geometry. Choose supported treatments, coherent material/accent colors, roughness, rotation, detail density and small relief; the executor directly uses original geometry. Locked objects must use preserve and rotation 0. Use attached overview/back views to avoid appearance choices that contradict other sides. Original reference images express appearance only; they do not override authored geometry. Do not claim new meshes, texture inference or proven visual quality; notes describe executable choices and limitations. Use the same language as the user's request (Chinese when it is empty).\n\n${input.mode === 'refine' ? 'LOCAL REFINEMENT: change only the selected scope object records. Copy global environment and every object record outside scope EXACTLY from previousRecipe, including notes. Still output ALL source objects. Title/summary may describe this local change.' : 'FULL SCENE: design the environment and every unlocked object as one coherent scene, guided by the natural-language intent and images.'}\n\nATTACHED IMAGE ORDER (images are attached as binary inputs):\n${JSON.stringify(images.map(({ label, sha256 }, index) => ({ number: index + 1, label, sha256 })))}\n\nAUTHORITATIVE REQUEST DATA:\n${json({ mode: input.mode, authorRequest: input.intent, sourceFingerprint: fingerprintPlan(input.plan), sourcePlan: plan, scopeIds: input.scopeIds, previousRecipe: input.previousRecipe })}`;
}

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false }).unref();
  else child.kill('SIGTERM');
}

export async function runControlJob(input, { id, jobDir, cliVersion, onProgress = () => {} }) {
  await mkdir(jobDir, { recursive: false });
  const startedAt = new Date().toISOString(), images = [];
  let threadId = null, usage = null, observedModel = null, eventCount = 0, exitCode = null;
  const receipt = { format: 'tidewater-control-model-receipt.v1', id, provider: PROVIDER, cliVersion, mode: input.mode, startedAt, finishedAt: null, sourceFingerprint: fingerprintPlan(input.plan), planSha256: digest(json(input.plan)), images, scopeIds: input.scopeIds, threadId, model: observedModel, usage, eventCount, exitCode, sandbox: 'read-only', tools: 'disabled', status: 'running' };
  await writeFile(path.join(jobDir, 'source-plan.json'), json(input.plan));
  if (input.previousRecipe) await writeFile(path.join(jobDir, 'previous-recipe.json'), json(input.previousRecipe));
  for (const [index, view] of input.views.entries()) {
    const file = `view-${index + 1}.${view.extension}`;
    await writeFile(path.join(jobDir, file), view.bytes);
    images.push({ file, label: view.label, mime: view.mime, bytes: view.bytes.length, sha256: view.sha256 });
  }
  const prompt = promptFor(input, images), schema = schemaFor(input);
  receipt.promptSha256 = digest(prompt); receipt.schemaSha256 = digest(json(schema));
  await writeFile(path.join(jobDir, 'request.json'), json({ mode: input.mode, intent: input.intent, sourceFingerprint: receipt.sourceFingerprint, scopeIds: input.scopeIds, images, previousRecipeSha256: input.previousRecipe ? digest(json(input.previousRecipe)) : null }));
  await writeFile(path.join(jobDir, 'prompt.txt'), prompt);
  await writeFile(path.join(jobDir, 'schema.json'), json(schema));
  await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
  const args = [CODEX_ENTRY, 'exec', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--json', '--disable', 'shell_tool', '--disable', 'apply_patch_freeform', '--disable', 'multi_agent', '--output-schema', path.join(jobDir, 'schema.json'), '--output-last-message', path.join(jobDir, 'response.json')];
  for (const image of images) args.push('--image', path.join(jobDir, image.file));
  args.push('-');
  let stdout = '', stderr = '', carry = '', stoppedReason = null;
  try {
    onProgress({ stage: 'starting', message: `正在启动 ${cliVersion}；${images.length} 张实际视图已准备。`, eventCount });
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: jobDir, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      const timer = setTimeout(() => { stoppedReason = '控制模型任务超过 10 分钟。'; stopProcess(child); }, 10 * 60 * 1000);
      const event = line => {
        if (!line.trim()) return;
        let data; try { data = JSON.parse(line); } catch { return; }
        eventCount++;
        if (data.type === 'thread.started') threadId = data.thread_id || null;
        if (data.type === 'turn.completed') usage = data.usage || null;
        if (typeof data.model === 'string') observedModel = data.model;
        if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(data.item?.type)) { stoppedReason = '模型尝试使用本任务禁止的工具，任务已终止。'; stopProcess(child); }
        onProgress({ stage: 'inference', message: data.type === 'thread.started' ? '控制模型会话已开始，正在读取完整布局及多视角图片。' : data.type === 'turn.completed' ? '真实模型返回已收到，正在校验对象与修改范围。' : `模型事件：${data.type}`, eventCount, lastEventAt: new Date().toISOString(), threadId });
      };
      child.stdout.on('data', chunk => {
        const text = chunk.toString('utf8'); stdout += text; carry += text;
        if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) { stoppedReason = '控制模型事件输出超过限制。'; stopProcess(child); }
        let newline; while ((newline = carry.indexOf('\n')) >= 0) { event(carry.slice(0, newline)); carry = carry.slice(newline + 1); }
      });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); if (Buffer.byteLength(stderr) > 1024 * 1024) { stoppedReason = '控制模型错误输出超过限制。'; stopProcess(child); } });
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') { stoppedReason = error.message; stopProcess(child); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); exitCode = code; if (carry.trim()) event(carry); stoppedReason || code !== 0 ? reject(new Error(stoppedReason || `Codex CLI 返回 ${code}：${stderr.slice(-2000) || stdout.slice(-2000)}`)) : resolve(); });
      child.stdin.end(prompt, 'utf8');
    });
    const output = await readFile(path.join(jobDir, 'response.json'));
    if (output.length > 1024 * 1024) throw new Error('控制模型场景响应超过 1 MiB。');
    const rawRecipe = JSON.parse(output.toString('utf8'));
    const recipe = validateCompletionRecipe(rawRecipe, input.plan, input.previousRecipe ? { previousRecipe: input.previousRecipe, scopeIds: input.scopeIds } : {});
    const consistency = completionConsistency(input.plan, recipe, input.previousRecipe, input.scopeIds);
    await writeFile(path.join(jobDir, 'recipe.json'), json(recipe));
    Object.assign(receipt, { status: 'succeeded', finishedAt: new Date().toISOString(), threadId, model: observedModel, usage, eventCount, exitCode, rawOutputSha256: digest(output), recipeSha256: digest(json(recipe)), consistency });
    await writeFile(path.join(jobDir, 'events.ndjson'), stdout); await writeFile(path.join(jobDir, 'stderr.log'), stderr); await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
    onProgress({ stage: 'complete', message: '真实模型配方已通过稳定 ID、原布局及修改范围校验，等待查看效果。', eventCount, lastEventAt: receipt.finishedAt });
    return { recipe, receipt };
  } catch (error) {
    const detail = String(error.message || error).slice(0, 4000);
    Object.assign(receipt, { status: 'failed', finishedAt: new Date().toISOString(), threadId, model: observedModel, usage, eventCount, exitCode, error: detail });
    await writeFile(path.join(jobDir, 'events.ndjson'), stdout); await writeFile(path.join(jobDir, 'stderr.log'), stderr); await writeFile(path.join(jobDir, 'receipt.json'), json(receipt));
    const failure = new Error(detail); failure.receipt = receipt; throw failure;
  }
}
