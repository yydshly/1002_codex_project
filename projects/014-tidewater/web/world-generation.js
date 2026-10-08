import { createWorldRecipe, validateWorldRecipe, transitionWorldTask, summarizeWorldRecipe, worldBindingMatchesSource, assertWorldApplicable, confirmedAssetChecksum } from './world-generation-core.js';
import { ASSET_KINDS, createAssetJob, validateAssetJob, assertAssetApplicable } from './asset-generation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { ensureRealisticScene, getRealisticScene, setRealisticAssetMode, showRealisticAssetView } from './realistic/app.js';

const $ = id => document.getElementById(id);
const CATALOG_URL = new URL('./assets/neural/world-assets-v1.json', import.meta.url);
const names = { land: '陆地', water: '水域', road: '道路', cabin: '小屋', lighthouse: '灯塔', palm: '棕榈', boat: '船只' };
const statusNames = { pending: '待载入', running: '正在载入', succeeded: '已完成', failed: '失败', preserved: '保持锁定', 'awaiting-asset': '待精细资产' };
const sourceNames = { 'neural-3d': '神经模型生成', 'scanned-asset': '真实扫描素材', 'procedural-geometry': '布局程序几何', 'coarse-preserved': '原粗模 · 已锁定' };
let recipe = null, candidateScene = null, busy = false, applied = false, active = false, disposed = false;
let revision = -1, booting = false, booted = false, restoring = false, savedRecord = null;
let previousOverrides = [], touched = new Set(), limitations = [], lastEnvironment = null;
let displaySettings = { palm: 'original' };
const assetResources = new Map();

function sourcePlan() {
  if (!window.creationStudio?.ready) throw new Error('布局正在恢复，请稍后再试。');
  return window.creationStudio.plan;
}
function status(message, error = false) {
  $('world-status').textContent = message;
  $('world-error').hidden = !error; $('world-error').textContent = error ? message : '';
}
function announce(next) {
  if (active === next) return;
  active = next; window.dispatchEvent(new CustomEvent('world-session-active', { detail: { active: next } }));
}
function currentBinding() {
  if (!recipe || !window.creationStudio?.ready) return false;
  try { return worldBindingMatchesSource(recipe, sourcePlan()); } catch { return false; }
}
function canApply() {
  if (!recipe || candidateScene !== getRealisticScene() || !candidateScene || !active || applied || busy) return false;
  try { assertWorldApplicable(recipe, sourcePlan()); return true; } catch { return false; }
}
function controls() {
  const ready = !!window.creationStudio?.ready, current = !!candidateScene && candidateScene === getRealisticScene();
  $('world-build').disabled = !ready || busy || !sourcePlan().entities.length;
  $('world-apply').disabled = !canApply();
  $('world-revert').disabled = busy || !active;
  $('world-hero').disabled = busy || !current;
  $('world-coarse').disabled = busy || !current;
  $('world-export').disabled = busy || !recipe;
  const palmsLoaded = !!recipe?.tasks.some(task => task.kind === 'palm' && task.source.assetId && task.status === 'succeeded');
  $('world-foliage').disabled = busy || !palmsLoaded;
  $('world-foliage-note').hidden = !palmsLoaded;
}
function sourceDetail(task) {
  if (!task.source.assetId) return task.status === 'awaiting-asset' ? '精细资产尚未完成，沿用上一版' : task.locked ? '形状 / 位置 / 高度保持原样' : '按用户轮廓生成真实网格';
  const asset = recipe.catalog.find(item => item.id === task.source.assetId);
  if (task.kind === 'palm' && task.status === 'succeeded' && displaySettings.palm === 'original') return `神经候选已载入；当前显示原版程序几何 · ${asset.provenance.model}`;
  return asset.entityId ? `${asset.provenance.model} · 第 06 步已确认，仅此对象 · 任务 ${asset.provenance.taskId}` : `${asset.provenance.model} · 共享资产 ${asset.id}`;
}
function cell(text, small) {
  const td = document.createElement('td'); td.append(document.createTextNode(text));
  if (small) { const detail = document.createElement('small'); detail.textContent = small; td.append(detail); }
  return td;
}
function render() {
  if (!recipe) { controls(); return; }
  const summary = summarizeWorldRecipe(recipe);
  const visibleGenerated = candidateScene === getRealisticScene() && active ? candidateScene?.getStats().visibleGeneratedAssets || 0 : 0;
  const palmsLoaded = recipe.tasks.some(task => task.kind === 'palm' && task.source.assetId && task.status === 'succeeded');
  $('world-summary').textContent = `${summary.total} 个原布局对象 · ${summary.locked} 个保持锁定 · ${summary.neuralReady} 个已载入模型资产 / 当前显示 ${visibleGenerated} 个神经资产 · ${summary.uniqueAssets} 份实际使用的精细资产 · ${summary.succeeded} 项已载入或建立${summary.awaitingAsset ? ` · ${summary.awaitingAsset} 项仍待精细资产` : ''}${summary.failed ? ` · ${summary.failed} 项失败` : ''}。完成仅表示载入与适配；写实质量仍需验收。${displaySettings.palm === 'original' && palmsLoaded ? '棕榈当前显示原版程序叶片；神经树冠保留作对照。' : ''}${applied ? '这一版已独立保存。' : '确认保存前均为候选效果。'}`;
  const rows = recipe.tasks.map(task => {
    const row = document.createElement('tr'); row.dataset.entityId = task.entityId; row.dataset.status = task.status;
    const point = task.placement.points[0], coordinate = task.placement.points.length === 1 ? `X ${point.x.toFixed(2)} / Z ${point.z.toFixed(2)} 米` : `${task.placement.points.length} 个原轮廓点`;
    const sourceName = task.kind === 'palm' && task.status === 'succeeded' && displaySettings.palm === 'original' ? '当前程序叶片 · 神经候选可对照' : sourceNames[task.source.method];
    row.append(cell(names[task.kind], task.entityId), cell(`${coordinate} · 高度 ${task.placement.height} 米`, task.locked ? '已锁定：保持原形态' : '原 ID / 布局 / 高度保留'), cell(sourceName, sourceDetail(task)));
    const taskStatus = task.status === 'succeeded' ? task.source.assetId ? '已载入' : '已建立' : statusNames[task.status];
    const result = cell(taskStatus, task.error || (task.output?.triangles ? `${task.output.triangles.toLocaleString()} 三角形` : ''));
    result.dataset.status = task.status; row.append(result); return row;
  });
  $('world-task-list').replaceChildren(...rows);
  $('world-source-details').textContent = JSON.stringify({
    format: recipe.format, sourceFingerprint: recipe.sourceFingerprint,
    summary, assets: recipe.catalog, capabilityGaps: recipe.capabilityGaps,
    environment: lastEnvironment, display: { ...displaySettings }, visibleGeneratedAssets: visibleGenerated, limitations,
    tasks: recipe.tasks.map(({ sourceEntity, placement, ...task }) => ({ ...task, placement })),
    conditioning: '精细资产是已完成模型推理的真实 GLB；本按钮按原布局载入与适配这些资产，不会声称逐实例重新推理。',
    portability: 'JSON 保存布局、资产来源、校验值和适配状态。GLB / 贴图以本地链接引用；JSON 本身不是含全部二进制资源的完整工程包。',
  }, null, 2);
  controls();
}
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tidewater-world-assets.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('versions', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function stored(method, key, value) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('versions', method === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('versions'); const request = method === 'put' ? store.put(value) : store[method](key);
      let result; request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('本地整场景保存中断。'));
    });
  } finally { db.close(); }
}
function releaseAssets() {
  assetResources.clear();
}
async function verifyBlob(blob, asset) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > 64 * 1048576) throw new Error('模型 GLB 缺失或超过 64 MiB。');
  if (asset.bytes !== null && blob.size !== asset.bytes) throw new Error('模型文件大小与真实生成记录不一致。');
  const binary = await blob.arrayBuffer(), header = new DataView(binary);
  if (binary.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== binary.byteLength) throw new Error('生成结果不是完整有效的 GLB 2 文件。');
  if (asset.sha256 !== null) {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', binary))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== asset.sha256) throw new Error('模型 SHA-256 与保存的来源记录不一致。');
  }
  return blob;
}
async function resourceFor(asset, restoredAssets = []) {
  if (assetResources.has(asset.id)) return assetResources.get(asset.id).promise;
  const entry = { promise: null, blob: null };
  entry.promise = (async () => {
    let blob = restoredAssets.find(item => item.id === asset.id)?.blob;
    if (!blob) {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(`精细资产下载失败（HTTP ${response.status}）。`);
      const length = Number(response.headers.get('Content-Length'));
      if (length > 64 * 1048576) throw new Error('模型文件超过 64 MiB。');
      blob = await response.blob();
    }
    await verifyBlob(blob, asset);
    entry.blob = blob; return entry;
  })();
  assetResources.set(asset.id, entry);
  return entry.promise;
}
async function loadCatalog() {
  const response = await fetch(CATALOG_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`实际资产清单读取失败（HTTP ${response.status}）。`);
  const data = await response.json();
  if (data.format !== 'tidewater-world-assets.v1' || !Array.isArray(data.assets) || !Array.isArray(data.limitations) || data.limitations.some(item => typeof item !== 'string' || item.length > 2000)) throw new Error('整场景资产来源清单无效。');
  return data;
}
async function confirmedAssets(plan, publishedAssets = []) {
  // Only records written by the single-asset confirmation action are reused.
  // Unsaved candidates are neither read from the scene nor accepted as recipe inputs.
  const fingerprint = fingerprintPlan(plan), entities = plan.entities.filter(entity => ASSET_KINDS.includes(entity.kind) && !entity.locked);
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tidewater-neural-assets.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('replacements', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const transaction = db.transaction('replacements', 'readonly'), store = transaction.objectStore('replacements'), result = [];
      for (const entity of entities) {
        const request = store.get(`${fingerprint}:${entity.id}`);
        request.onsuccess = () => { if (request.result) result.push({ entity, record: request.result }); };
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('已确认对象存档读取失败。'));
      transaction.onabort = () => reject(transaction.error || new Error('已确认对象存档读取中断。'));
    });
  } finally { db.close(); }
  const catalog = [], assets = [];
  for (const { entity, record } of records) {
    const job = assertAssetApplicable(validateAssetJob(record.job), plan);
    if (job.binding.entityId !== entity.id || record.key !== `${fingerprint}:${entity.id}` || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) throw new Error(`第 06 步「${entity.id}」存档绑定无效，暂不覆盖已确认对象。`);
    if (![0, 90, 180, 270].includes(record.rotation)) throw new Error(`第 06 步「${entity.id}」朝向记录无效。`);
    const checksum = confirmedAssetChecksum(job, record.receipt, publishedAssets);
    const blob = await verifyBlob(record.blob, checksum);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
    const referenceUrl = typeof job.referenceImage === 'string' && (/^\/(?!\/)/u.test(job.referenceImage) || /^https:\/\//u.test(job.referenceImage)) ? job.referenceImage : null;
    catalog.push({ id: job.id, kind: entity.kind, entityId: entity.id, method: 'neural-3d', url: job.output.glbUrl, referenceUrl,
      rotationY: record.rotation * Math.PI / 180, bytes: blob.size, sha256: digest,
      provenance: { provider: job.output.provider, model: job.output.model, taskId: job.output.taskId, license: job.output.license, source: job.output.glbUrl } });
    assets.push({ id: job.id, blob });
  }
  if (fingerprintPlan(sourcePlan()) !== fingerprint) throw new Error('读取已确认资产期间布局已改变，请重新完善。');
  return { catalog, assets };
}
function assertCurrentScene() {
  if (!candidateScene || candidateScene !== getRealisticScene() || !currentBinding() || fingerprintPlan(candidateScene.sourcePlan) !== recipe.sourceFingerprint) throw new Error('生成期间源布局或预览已改变。请按当前布局重新完善，旧草案保留。');
}
async function snapshotPrevious(scene, retained = []) {
  const result = [];
  for (const record of scene.getAssetOverrides?.() || []) {
    let blob = retained.find(item => item.entityId === record.entityId)?.blob;
    if (!blob) {
      const response = await fetch(record.url);
      if (!response.ok) throw new Error(`此前对象 ${record.entityId} 的模型无法读取，暂不覆盖这一版。`);
      blob = await response.blob();
    }
    await verifyBlob(blob, { bytes: null, sha256: null });
    result.push({ entityId: record.entityId, url: record.url, blob, status: record.status, rotationDegrees: record.rotationDegrees, display: record.display === 'original' ? 'original' : 'generated' });
  }
  return result;
}
async function restorePrevious() {
  const scene = candidateScene;
  if (!scene || scene !== getRealisticScene()) return [];
  const originals = previousOverrides;
  for (const entityId of touched) scene.revertAssetOverride(entityId);
  touched.clear();
  if (scene.setWorldQuality) await scene.setWorldQuality(false);
  for (const previous of previousOverrides) {
    const entity = scene.sourcePlan.entities.find(item => item.id === previous.entityId);
    if (!entity || entity.locked) continue;
    try {
      const spec = createAssetJob(scene.sourcePlan, entity.id, { id: 'world-revert' }).spec;
      const previewURL = previous.blob instanceof Blob ? URL.createObjectURL(previous.blob) : previous.url;
      try { await scene.previewAssetOverride(entity.id, previewURL, spec); }
      finally { if (previous.blob instanceof Blob) URL.revokeObjectURL(previewURL); }
      scene.setAssetRotation(entity.id, previous.rotationDegrees);
      scene.setAssetDisplay?.(entity.id, previous.display || 'generated');
      if (previous.status === 'committed') scene.commitAssetOverride(entity.id);
    } catch (error) { throw new Error(`此前 ${names[entity.kind]} 候选暂未恢复：${error.message}`); }
  }
  previousOverrides = [];
  return originals;
}
async function execute(catalog, restoredAssets = [], restoreSaved = false) {
  const plan = sourcePlan();
  if (!plan.entities.length) throw new Error('先画出区域或放置对象，再完善场景。');
  const next = createWorldRecipe(plan, catalog);
  announce(true);
  const retained = candidateScene && candidateScene === getRealisticScene() ? await restorePrevious() : [];
  releaseAssets();
  recipe = next; applied = false; touched = new Set(); lastEnvironment = null; render();
  status('读取真实资产，并按每个原对象的布局约束完善场景…');
  candidateScene = await ensureRealisticScene(); assertCurrentScene();
  previousOverrides = await snapshotPrevious(candidateScene, retained); assertCurrentScene();
  if (typeof candidateScene.setWorldQuality !== 'function') throw new Error('整场景环境模块尚未就绪；原布局保留。');
  await candidateScene.setWorldQuality(true); assertCurrentScene();
  lastEnvironment = candidateScene.getStats().worldEnvironment || null;
  for (const original of [...recipe.tasks]) {
    if (disposed) throw new Error('页面已关闭。');
    if (original.status !== 'pending') continue;
    assertCurrentScene();
    recipe = transitionWorldTask(recipe, original.entityId, 'running'); render();
    status(`正在完善 ${names[original.kind]} · ${original.entityId}…`);
    try {
      let triangles = null;
      if (original.source.assetId) {
        const asset = recipe.catalog.find(item => item.id === original.source.assetId);
        const resource = await resourceFor(asset, restoredAssets); assertCurrentScene();
        const previewURL = URL.createObjectURL(resource.blob);
        let result;
        try { result = await candidateScene.previewAssetOverride(original.entityId, previewURL, original.placement.spec); }
        finally { URL.revokeObjectURL(previewURL); }
        touched.add(original.entityId); assertCurrentScene();
        candidateScene.setAssetRotation(original.entityId, asset.rotationY * 180 / Math.PI);
        if (typeof candidateScene.setAssetDisplay !== 'function') throw new Error('资产显示对照模块尚未就绪。');
        candidateScene.setAssetDisplay(original.entityId, original.kind === 'palm' ? displaySettings.palm : 'generated');
        triangles = result.stats?.triangles;
      } else {
        const geometry = candidateScene.getStats().sourceGeometry?.find(item => item.entityId === original.entityId && item.kind === original.kind);
        if (!geometry || !Number.isSafeInteger(geometry.triangles) || geometry.triangles <= 0) throw new Error('源对象没有可验证的非空场景几何，不能标记完成。');
        triangles = geometry.triangles;
      }
      assertCurrentScene();
      recipe = transitionWorldTask(recipe, original.entityId, 'succeeded', { output: { entityId: original.entityId, method: original.source.method, assetId: original.source.assetId, triangles } });
    } catch (error) {
      if (touched.has(original.entityId)) { candidateScene?.revertAssetOverride(original.entityId); touched.delete(original.entityId); }
      recipe = transitionWorldTask(recipe, original.entityId, 'failed', { error: String(error.message || error).slice(0, 1000) });
      render();
      if (!currentBinding() || candidateScene !== getRealisticScene()) throw error;
    }
    render();
  }
  assertCurrentScene();
  setRealisticAssetMode('realistic'); showRealisticAssetView('hero'); $('world-coarse').setAttribute('aria-pressed', 'false');
  const summary = summarizeWorldRecipe(recipe);
  if (restoreSaved) {
    assertWorldApplicable(recipe, sourcePlan());
    for (const task of recipe.tasks.filter(item => item.status === 'succeeded' && item.source.assetId)) candidateScene.commitAssetOverride(task.entityId);
    applied = true;
  }
  render();
  if (summary.failed) status(`整片候选已显示，${summary.failed} 项未完成。查看清单中的实际错误后可以重试；本版暂不能确认。`, true);
  else status(`${restoreSaved ? '已恢复独立保存的整片场景' : '整片候选已放回原布局'}：${summary.neuralReady} 个模型资产，${summary.awaitingAsset ? `${summary.awaitingAsset} 项仍待精细资产。` : '全部已有资产已载入。'}请换角度检查效果。`);
}
async function build() {
  if (busy || !window.creationStudio?.ready) return;
  busy = true; controls();
  try {
    const catalog = await loadCatalog(); limitations = catalog.limitations;
    const confirmed = await confirmedAssets(sourcePlan(), catalog.assets);
    await execute([...catalog.assets, ...confirmed.catalog], confirmed.assets);
    $('realistic-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { status(`整场景完善未完成：${error.message}。原绘笔草案保留。`, true); }
  finally { busy = false; render(); }
}
async function apply() {
  if (busy || !recipe) return;
  busy = true; controls();
  try {
    const valid = assertWorldApplicable(recipe, sourcePlan()); assertCurrentScene();
    const assets = valid.catalog.filter(asset => valid.tasks.some(task => task.source.assetId === asset.id && task.status === 'succeeded')).map(asset => ({ id: asset.id, blob: assetResources.get(asset.id)?.blob }));
    if (assets.some(item => !(item.blob instanceof Blob))) throw new Error('候选二进制模型缺失，无法保存可恢复版本。');
    const record = { key: valid.sourceFingerprint, recipe: valid, assets, limitations: [...limitations], display: { ...displaySettings }, environment: lastEnvironment, savedAt: new Date().toISOString() };
    await stored('put', null, record); assertCurrentScene();
    for (const task of valid.tasks.filter(item => item.status === 'succeeded' && item.source.assetId)) candidateScene.commitAssetOverride(task.entityId);
    savedRecord = record; applied = true;
    status('已独立保存整片场景和实际 GLB；刷新后可恢复同一布局。原绘笔草案、上一版和第 06 步存档均保留。');
  } catch (error) { status(`这一版没有确认完成：${error.message}`, true); }
  finally { busy = false; render(); }
}
async function revert() {
  if (busy || !active) return;
  busy = true; controls();
  try {
    await restorePrevious();
    if (recipe) await stored('delete', recipe.sourceFingerprint);
    releaseAssets(); applied = false; savedRecord = null; candidateScene = null;
    announce(false);
    if (recipe) recipe = createWorldRecipe(recipe.sourcePlan, recipe.catalog);
    status('已还原上一步场景。整场景保存记录已撤销；第 06 步已确认资产存档、原布局与历史版本保留。');
  } catch (error) { status(`还原暂未完成：${error.message}`, true); }
  finally { busy = false; render(); }
}
async function restore(record) {
  if (!record || restoring || busy || !window.creationStudio?.ready) return;
  restoring = true; busy = true; controls();
  try {
    const valid = validateWorldRecipe(record.recipe); assertWorldApplicable(valid, sourcePlan());
    if (!Array.isArray(record.assets) || record.assets.length > 124) throw new Error('保存的整场景模型记录无效。');
    savedRecord = record; limitations = Array.isArray(record.limitations) ? record.limitations.filter(item => typeof item === 'string').slice(0, 20) : [];
    displaySettings = { palm: record.display?.palm === 'generated' ? 'generated' : 'original' };
    $('world-foliage').value = displaySettings.palm;
    announce(true); await execute(valid.catalog, record.assets, true);
  } catch (error) { status(`保存的整片场景暂未恢复：${error.message}。保留真实失败状态，可重试。`, true); }
  finally { restoring = false; busy = false; render(); }
}
async function bootstrap() {
  if (booting || booted || !window.creationStudio?.ready) return;
  booting = true;
  try {
    const fingerprint = fingerprintPlan(sourcePlan()), record = await stored('get', fingerprint);
    if (fingerprint !== fingerprintPlan(sourcePlan()) || disposed) return;
    booted = true;
    if (record) {
      const valid = validateWorldRecipe(record.recipe); assertWorldApplicable(valid, sourcePlan());
      savedRecord = record; recipe = createWorldRecipe(sourcePlan(), valid.catalog); announce(true); render();
      await restore(record);
    }
  } catch (error) { booted = true; status(`本地整场景存档暂未读取：${error.message}`, true); }
  finally { booting = false; controls(); }
}
function watch() {
  if (!window.creationStudio?.ready) { controls(); return; }
  bootstrap();
  if (revision !== window.creationStudio.revision) {
    revision = window.creationStudio.revision;
    if (recipe && !currentBinding()) {
      applied = false; status('源布局已改变。整片预览仍是上次快照；请重新完善当前布局，避免位置、尺寸或锁定错位。'); render();
    }
  }
  controls();
}
$('world-build').addEventListener('click', build);
$('world-apply').addEventListener('click', apply);
$('world-revert').addEventListener('click', revert);
$('world-foliage').addEventListener('change', () => {
  if (busy) return;
  displaySettings = { palm: $('world-foliage').value === 'generated' ? 'generated' : 'original' };
  if (candidateScene === getRealisticScene() && candidateScene && active) {
    try {
      for (const task of recipe.tasks.filter(item => item.kind === 'palm' && item.status === 'succeeded' && item.source.assetId)) candidateScene.setAssetDisplay(task.entityId, displaySettings.palm);
      applied = false;
      status(displaySettings.palm === 'original' ? '棕榈改用原版程序细叶。真实生成树冠仍已载入，可随时切换比较；重新确认保存后记住选择。' : '当前显示神经模型原始树冠。请检查薄叶重建形成的厚实树冠；重新确认保存后记住选择。');
    } catch (error) { status(`树冠对照暂未切换：${error.message}`, true); }
  }
  render();
});
$('world-hero').addEventListener('click', () => {
  setRealisticAssetMode('realistic'); showRealisticAssetView('hero'); $('world-coarse').setAttribute('aria-pressed', 'false');
  $('realistic-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('world-coarse').addEventListener('click', () => {
  const coarse = $('world-coarse').getAttribute('aria-pressed') !== 'true';
  setRealisticAssetMode(coarse ? 'coarse' : 'realistic'); $('world-coarse').setAttribute('aria-pressed', String(coarse));
  $('realistic-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('world-export').addEventListener('click', () => {
  if (!recipe || busy) return;
  const exported = { format: 'tidewater-world-export.v1', exportedAt: new Date().toISOString(), recipe: validateWorldRecipe(recipe), limitations,
    environment: lastEnvironment, display: { ...displaySettings }, saved: applied, renderer: candidateScene === getRealisticScene() ? candidateScene?.getViewState?.() : null,
    portability: '本 JSON 记录布局、资产链接与 SHA-256、来源和任务状态；二进制模型和贴图仍由本地链接引用，不是完整场景工程包。' };
  const link = $('world-download'); link.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exported, null, 2))}`;
  link.download = 'tidewater-whole-scene.v1.json'; link.hidden = false; link.click();
});
window.addEventListener('realistic-scene-ready', () => {
  if (!busy && savedRecord && currentBinding()) restore(savedRecord);
  else if (!busy && active && candidateScene && candidateScene !== getRealisticScene()) {
    candidateScene = null; applied = false; status('预览已重新构建。点击完善场景重新载入整片候选，保存记录保留。'); controls();
  }
});
window.addEventListener('realistic-mode-changed', () => { if (recipe) render(); });
const watcher = setInterval(watch, 750); controls(); watch();
window.addEventListener('pagehide', () => { disposed = true; clearInterval(watcher); releaseAssets(); }, { once: true });
