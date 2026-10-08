import { ASSET_KINDS, createAssetJob, transitionAssetJob, assertAssetApplicable, bindingMatchesSource, validateAssetJob } from './asset-generation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { ensureRealisticScene, getRealisticScene, showRealisticAssetView, setRealisticAssetMode } from './realistic/app.js';

const $ = id => document.getElementById(id);
const names = { cabin: '小屋', lighthouse: '灯塔', palm: '棕榈', boat: '船只' };
const defaultBriefs = {
  cabin: '海边写实小屋，旧木门窗、白色灰泥墙和自然磨损的屋顶；整体结构可信，适合近距离、多角度观察。',
  lighthouse: '海岸灯塔，风化灰泥墙、连续塔身和完整灯室；检查背面门窗及顶部结构。',
  palm: '海岸棕榈树，连续树干和自然弯曲的薄叶片；重点检查树冠厚度与背面形态。',
  boat: '海岸小船，可信的船壳、船舱与船沿；检查内外结构及与水面的接合。',
};
const builtinReference = kind => new URL(`./assets/neural/${kind}-reference-v1.png`, import.meta.url).pathname;
const builtinAsset = kind => new URL(`./assets/neural/${kind}-generated-v1.glb`, import.meta.url).pathname;
let localReady = false;
let revision = -1, busy = false, job = null, glbBlob = null, receipt = null;
let referenceBlob = null, referenceURL = null, candidateURL = null, applied = false;
const retainedCandidateURLs = new Set();
let restoring = false, controller = null, previewScene = null;
let worldSessionActive = false;
let checkingLocalService = false;
function defaultBrief(kind) {
  if (defaultBriefs[kind] && Object.values(defaultBriefs).includes($('asset-appearance').value)) $('asset-appearance').value = defaultBriefs[kind];
}

function sourcePlan() {
  if (!window.creationStudio?.ready) throw new Error('布局正在恢复，请稍后再试。');
  return window.creationStudio.plan;
}
function status(text, error = false) {
  $('asset-status').textContent = text;
  $('asset-error').hidden = !error;
  $('asset-error').textContent = error ? text : '';
}
function controls() {
  const target = $('asset-target').value;
  const occupied = busy || restoring || worldSessionActive;
  const eligible = !!target && !occupied;
  $('asset-load-candidate').disabled = !eligible;
  $('asset-generate').disabled = !eligible || ($('asset-provider').value === 'local' && !localReady);
  $('asset-provider').disabled = occupied;
  $('asset-target').disabled = occupied;
  $('asset-reference-file').disabled = occupied;
  $('asset-appearance').disabled = occupied;
  const matches = job && bindingMatchesSource(job, sourcePlan());
  const visible = matches && previewScene === getRealisticScene() && job.binding.entityId === target;
  $('asset-apply').disabled = occupied || !visible || applied;
  $('asset-revert').disabled = occupied || !job;
  $('asset-rotation').disabled = occupied || !visible;
  $('asset-candidate-view').disabled = busy || restoring || !visible;
  $('asset-return-coarse').disabled = busy || !getRealisticScene();
}
function details(extra = {}) {
  $('asset-job-details').textContent = JSON.stringify({
    source: job?.binding, request: job?.appearanceBrief,
    conditioning: '模型使用参考图片。文字要求用于记录；本接口不接收文字提示。',
    output: job?.output, providerReceipt: receipt, ...extra,
  }, null, 2);
}
function comparisonSaved(saved) {
  $('asset-comparison').textContent = $('asset-comparison').textContent.replace(/候选尚未保存。|已独立保存。/g, saved ? '已独立保存。' : '候选尚未保存。');
}
function updateTargets() {
  if (!window.creationStudio?.ready) return;
  if (revision === window.creationStudio.revision) return;
  revision = window.creationStudio.revision;
  const previous = $('asset-target').value;
  const entities = sourcePlan().entities.filter(e => ASSET_KINDS.includes(e.kind));
  $('asset-target').replaceChildren(...entities.map(e => {
    const option = document.createElement('option'); option.value = e.id;
    option.textContent = `${names[e.kind]} · ${e.id.slice(-8)}${e.locked ? ' · 已锁定' : ''}`;
    option.disabled = e.locked; return option;
  }));
  const selected = entities.find(e => e.id === previous && !e.locked) || entities.find(e => e.kind === 'cabin' && !e.locked) || entities.find(e => !e.locked);
  $('asset-target').value = selected?.id || '';
  if (selected) defaultBrief(selected.kind);
  if (selected && !referenceBlob) { $('asset-reference-image').src = builtinReference(selected.kind); $('asset-reference-image').alt = `${names[selected.kind]}的模型输入参考图；这是图片，生成结果需在3D中检查。`; }
  if (job && !bindingMatchesSource(job, sourcePlan())) {
    status('布局已改变。上次候选不能继续应用，请按当前布局重新选择或生成。');
    // The old snapshot remains visible until its scene is explicitly rebuilt.
  }
  controls();
}
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tidewater-neural-assets.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('replacements', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function stored(method, key, value) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('replacements', method === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('replacements');
      const request = method === 'put' ? store.put(value) : store[method](key);
      let result; request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('本地保存中断。'));
    });
  } finally { db.close(); }
}
function keyFor(j = job) { return `${j.binding.sourceFingerprint}:${j.binding.entityId}`; }
function releaseCandidateURL() {
  if (candidateURL?.startsWith('blob:')) retainedCandidateURLs.add(candidateURL);
  candidateURL = null;
  releaseUnusedCandidateURLs();
}
function releaseUnusedCandidateURLs(all = false) {
  const live = new Set(all ? [] : getRealisticScene()?.getAssetOverrides?.().map(record => record.url) || []);
  for (const url of retainedCandidateURLs) {
    if (all || (url !== candidateURL && !live.has(url))) {
      URL.revokeObjectURL(url); retainedCandidateURLs.delete(url);
    }
  }
}
async function preview(record, blob, metadata, reveal = true) {
  if (worldSessionActive) throw new Error('整场景版本正在检查。先在第 07 步还原，才能单独编辑资产。');
  assertAssetApplicable(record, sourcePlan());
  const targetScene = await ensureRealisticScene();
  assertAssetApplicable(record, targetScene.sourcePlan);
  if (job && previewScene && !applied) previewScene.revertAssetOverride(job.binding.entityId);
  releaseCandidateURL();
  candidateURL = URL.createObjectURL(blob);
  const stats = await targetScene.previewAssetOverride(record.binding.entityId, candidateURL, record.spec);
  releaseUnusedCandidateURLs();
  if (worldSessionActive) { targetScene.revertAssetOverride(record.binding.entityId); throw new Error('已切换到整场景检查，单资产预览已停止。'); }
  // Never attach a result to a draft that changed while the asset was loading.
  if (!bindingMatchesSource(record, sourcePlan())) {
    targetScene.revertAssetOverride(record.binding.entityId); releaseCandidateURL();
    throw new Error('加载期间布局已改变，候选未应用。');
  }
  job = record; glbBlob = blob; receipt = metadata; previewScene = targetScene; applied = false;
  $('asset-appearance').value = record.appearanceBrief;
  $('asset-target').value = record.binding.entityId;
  $('asset-rotation').value = '0';
  setRealisticAssetMode('realistic'); showRealisticAssetView(record.binding.kind === 'lighthouse' ? 'lighthouse' : record.binding.kind === 'palm' ? 'palms' : record.binding.kind === 'boat' ? 'boats' : 'cabin');
  $('asset-download').href = record.output.glbUrl.startsWith('/') ? record.output.glbUrl : candidateURL;
  $('asset-download').download = `${record.binding.kind}-${record.output.taskId}.glb`;
  $('asset-download').hidden = false;
  $('asset-provider-details').textContent = `${record.output.provider} · ${record.output.model} · 任务 ${record.output.taskId}`;
  $('asset-comparison').textContent = `真实生成的 GLB · ${stats.stats.triangles.toLocaleString()} 个三角形 · ${(blob.size / 1048576).toFixed(2)} MiB。位置沿用原对象，尺寸等比装入粗模包络。候选尚未保存。`;
  details({ fitting: stats });
  status('模型资产已放回原对象位置。上方场景可旋转检查；确认替换后独立保存。');
  if (reveal) $('realistic-panel').scrollIntoView({ behavior:'smooth', block:'start' });
}
async function loadBuiltin() {
  if (busy || restoring || worldSessionActive) return;
  busy = true; controls();
  status('读取本轮已完成的真实模型结果；此操作不会再消耗生成额度…');
  try {
    const targetKind=sourcePlan().entities.find(e=>e.id===$('asset-target').value)?.kind;
    const reference=builtinReference(targetKind),assetPath=builtinAsset(targetKind);
    const pending = createAssetJob(sourcePlan(), $('asset-target').value, { appearanceBrief: $('asset-appearance').value, referenceImage: reference });
    const [manifestResponse, blobResponse] = await Promise.all([
      fetch(new URL(`./assets/neural/${targetKind}-generated-v1.manifest.json`, import.meta.url)), fetch(assetPath),
    ]);
    if (!manifestResponse.ok || !blobResponse.ok) throw new Error('本地生成结果加载失败。');
    const manifest = await manifestResponse.json(), blob = await blobResponse.blob();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2,'0')).join('');
    if (blob.size !== manifest.asset.bytes || digest !== manifest.asset.sha256) throw new Error('生成结果与保存记录不一致。');
    if (referenceURL) URL.revokeObjectURL(referenceURL);
    referenceURL = null; referenceBlob = null; $('asset-reference-file').value = '';
    $('asset-reference-image').src = reference;
    const complete = transitionAssetJob(transitionAssetJob(pending, 'running'), 'succeeded', { output: {
      method: 'neural-3d', provider: manifest.provenance.provider, model: manifest.provenance.model,
      taskId: manifest.provenance.generationTaskId, glbUrl: assetPath,
      license: '模型及软件 MIT；参考图由图像模型生成；输出来源与材质限制见任务记录。', prompt: pending.prompt,
    } });
    await preview(complete, blob, { ...manifest.provenance, bytes: manifest.asset.bytes, sha256: manifest.asset.sha256, reuse: '加载本轮已完成结果，不是重新推理', limits: manifest.limitations });
  } catch (error) { status(`候选未完成：${error.message}`, true); }
  finally { busy = false; controls(); }
}
async function generate() {
  if (busy || restoring || worldSessionActive) return;
  busy = true; controller = new AbortController(); controls();
  const local=$('asset-provider').value==='local';
  status(local?'准备在本机 GPU 上用参考图片生成 3D…':'准备把参考图片发送到 Microsoft 官方 TRELLIS.2 服务…');
  $('asset-provider-details').textContent = local ? '本次请求：本机 GPU · stabilityai/TripoSR。等待真实模型任务结果。' : '本次请求：Microsoft 官方 · TRELLIS.2。等待真实模型任务结果。';
  let running;
  try {
    const kind=sourcePlan().entities.find(e=>e.id===$('asset-target').value)?.kind;
    const reference=builtinReference(kind);
    const pending = createAssetJob(sourcePlan(), $('asset-target').value, { appearanceBrief: $('asset-appearance').value, referenceImage: referenceBlob ? null : reference });
    running = transitionAssetJob(pending, 'running');
    const imageBlob = referenceBlob || await (await fetch(reference)).blob();
    const generateAsset=local?(await import('./local-3d-provider.js')).generateLocal3DAsset:(await import('./trellis-provider.js')).generateTrellisAsset;
    const result = await generateAsset({ imageBlob, kind, signal: controller.signal, onProgress: event => {
      status(typeof event === 'string' ? event : event.message || event.detail || event.stage || '模型任务正在执行…');
      if (event?.taskId) $('asset-provider-details').textContent = `${local ? '本机 GPU · stabilityai/TripoSR' : 'Microsoft 官方 · TRELLIS.2'} · 任务 ${event.taskId}`;
    } });
    const complete = transitionAssetJob(running, 'succeeded', { output: {
      method: 'neural-3d', provider: result.provider, model: result.model,
      taskId: result.taskId, glbUrl: result.remoteUrl, license: result.license, prompt: pending.prompt,
    } });
    if (result.glbUrl?.startsWith('blob:')) URL.revokeObjectURL(result.glbUrl);
    await preview(complete, result.glbBlob, result.receipt);
  } catch (error) {
    receipt = error.receipt || receipt;
    if (running) details({ failedTask: transitionAssetJob(running, 'failed', { error: String(error.message).slice(0,1000) }) });
    status(`生成没有完成：${error.message}。原布局与上一步效果保留。`, true);
  } finally { busy = false; controller = null; controls(); }
}
async function apply() {
  if (busy || restoring || worldSessionActive || !job) return;
  busy = true; controls();
  try {
    assertAssetApplicable(job, sourcePlan());
    if ($('asset-target').value !== job.binding.entityId) throw new Error('请先选择候选对应的对象。');
    if (previewScene !== getRealisticScene()) throw new Error('预览已更新，请重新加载候选。');
    const rotation = Number($('asset-rotation').value);
    await stored('put', null, { key: keyFor(), job, blob: glbBlob, receipt, rotation, savedAt: new Date().toISOString() });
    previewScene.commitAssetOverride(job.binding.entityId); applied = true;
    status(`已确认并独立保存模型${names[job.binding.kind]}。刷新后生成同一布局场景即可恢复；随时可以还原上一步。`);
    comparisonSaved(true);
  } catch (error) { status(`没有保存：${error.message}`, true); }
  finally { busy = false; controls(); }
}
async function revert() {
  if (!job || busy || restoring || worldSessionActive) return;
  busy = true; controls();
  try {
    await stored('delete', keyFor());
    previewScene?.revertAssetOverride(job.binding.entityId);
    job = null; applied = false; previewScene = null; glbBlob = null; receipt = null;
    releaseCandidateURL(); $('asset-download').hidden = true;
    $('asset-comparison').textContent = '已恢复上一步的小屋。绘笔草案和历史快照均保留。';
    status('已还原上一步。仍可再次载入同一模型结果比较。');
  } catch (error) { status(`还原未完成：${error.message}`, true); }
  finally { busy = false; controls(); }
}
async function restore() {
  if (restoring || busy || worldSessionActive || !window.creationStudio?.ready) return;
  restoring = true;
  controls();
  try {
    const plan = sourcePlan(); const scene = getRealisticScene();
    for (const entity of plan.entities.filter(e => ASSET_KINDS.includes(e.kind) && !e.locked)) {
      const record = await stored('get', `${fingerprintPlan(plan)}:${entity.id}`);
      if (worldSessionActive) return;
      if (!record) continue;
      const valid = validateAssetJob(record.job); assertAssetApplicable(valid, plan);
      if (!(record.blob instanceof Blob) || record.blob.size > 80*1048576) throw new Error('已保存资产格式无效。');
      if (scene !== getRealisticScene()) return;
      await preview(valid, record.blob, record.receipt, false);
      const rotation = [0,90,180,270].includes(record.rotation) ? record.rotation : 0;
      scene.setAssetRotation(entity.id, rotation); $('asset-rotation').value = String(rotation);
      scene.commitAssetOverride(entity.id); applied = true;
      comparisonSaved(true);
      status('已恢复这份布局上独立保存的模型资产。可旋转检查或还原上一步。');
    }
  } catch (error) { status(`保存的资产暂未恢复：${error.message}`, true); }
  finally { restoring = false; controls(); }
}
$('asset-load-candidate').addEventListener('click', loadBuiltin);
$('asset-generate').addEventListener('click', generate);
$('asset-apply').addEventListener('click', apply);
$('asset-revert').addEventListener('click', revert);
$('asset-target').addEventListener('change', () => {
  const kind=sourcePlan().entities.find(e=>e.id===$('asset-target').value)?.kind;
  defaultBrief(kind);
  if(kind&&!referenceBlob){$('asset-reference-image').src=builtinReference(kind);$('asset-reference-image').alt=`${names[kind]}的模型输入参考图；这是图片，生成结果需在3D中检查。`;}
  $('asset-candidate-view').textContent=`查看${names[kind]||'对象'}`;controls();
});
$('asset-provider').addEventListener('change', controls);
$('asset-rotation').addEventListener('change', () => {
  if (job && previewScene) {
    try {
      const stats = previewScene.setAssetRotation(job.binding.entityId, Number($('asset-rotation').value));
      applied = false; comparisonSaved(false); details({ fitting: stats }); controls();
      status('已调整候选朝向，请旋转检查并确认保存。');
    } catch (error) { status(error.message, true); }
  }
});
$('asset-candidate-view').addEventListener('click', () => {
  setRealisticAssetMode('realistic'); showRealisticAssetView(job?.binding.kind === 'lighthouse' ? 'lighthouse' : job?.binding.kind === 'palm' ? 'palms' : job?.binding.kind === 'boat' ? 'boats' : 'cabin');
  $('realistic-panel').scrollIntoView({ behavior:'smooth', block:'start' });
});
$('asset-return-coarse').addEventListener('click', () => {
  setRealisticAssetMode('coarse'); $('realistic-panel').scrollIntoView({ behavior:'smooth', block:'start' });
});
$('asset-reference-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8*1048576) {
    event.target.value = ''; status('请选择不超过 8 MiB 的 PNG、JPEG 或 WebP 图片。', true); return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width > 8192 || bitmap.height > 8192) { bitmap.close(); throw new Error('图片边长不能超过 8192 像素。'); }
    bitmap.close(); referenceBlob = file;
    if (referenceURL) URL.revokeObjectURL(referenceURL);
    referenceURL = URL.createObjectURL(file); $('asset-reference-image').src = referenceURL;
    status(`参考图已改为「${file.name}」。点击生成时由所选服务处理；本机 GPU 模式在本机处理图片。`); controls();
  } catch (error) { status(`图片未采用：${error.message}`, true); }
});
window.addEventListener('realistic-scene-ready', restore);
window.addEventListener('world-session-active', event => {
  worldSessionActive = Boolean(event.detail?.active);
  if(worldSessionActive) { controller?.abort(); status('当前在第 07 步检查整场景版本。还原后可继续单独编辑资产。'); }
  else status('整场景版本已还原。可以继续选择参考图，单独生成和检查对象。');
  if(window.creationStudio?.ready) controls();
  if(!worldSessionActive && getRealisticScene()) restore();
});
$('asset-load-candidate').disabled = true;
$('asset-generate').disabled = true;
const watcher = setInterval(updateTargets, 750); updateTargets();
async function checkLocalService() {
  if (checkingLocalService) return;
  checkingLocalService = true; $('asset-local-recheck').disabled = true;
  $('asset-local-health').textContent = '正在检查本机模型服务…';
  try {
    const module = await import('./local-3d-provider.js');
    const health = await module.getLocal3DHealth({ signal: AbortSignal.timeout(5000) });
    localReady = health.status === 'ready';
    $('asset-local-health').textContent = localReady ? `本机服务就绪 · ${health.model} · 图片在本机处理` : health.status === 'checking' ? '本机服务正在检查模型与 GPU。稍后可重新检查。' : `本机服务未就绪：${health.error || health.status || '未知状态'}。`;
  } catch {
    localReady = false;
    $('asset-local-health').textContent = '本机服务未连接。启动项目隔离服务后点击重新检查，或选择 Microsoft 官方服务。';
  } finally {
    checkingLocalService = false; $('asset-local-recheck').disabled = false;
    if (window.creationStudio?.ready) controls();
  }
}
$('asset-local-recheck').addEventListener('click', checkLocalService);
checkLocalService();
window.addEventListener('pagehide', () => {
  clearInterval(watcher); controller?.abort(); releaseCandidateURL();
  releaseUnusedCandidateURLs(true);
  if (referenceURL) URL.revokeObjectURL(referenceURL);
}, { once:true });
