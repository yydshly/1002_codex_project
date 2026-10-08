import { createDemoPlan, validatePlan, summarizePlan } from './creation-core.js';
import { validateModelCandidate, makeModelContext, fingerprintPlan, createSceneGLB } from './model-scene-core.js';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const frame = $('model-scene-frame');
const kinds = { land: '陆地', water: '水面', road: '道路', cabin: '小屋', lighthouse: '灯塔', palm: '棕榈', boat: '船只' };
let plan = null, sourceFingerprint = '', candidate = null, authoredCandidate = null;
let view = 'coarse', selectedId = null, ready = false, rendered = false, accepted = false;
let loading = true, sourceLabel = '', toastTimer, exportTimer, exportRequest = null, fileURL = null, currentStats = null;
let previewGeneration = 0, lastRenderedGeneration = 0;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('model-toast').textContent = message;
  $('model-toast').classList.toggle('error', error);
  $('model-toast').hidden = false;
  toastTimer = setTimeout(() => { $('model-toast').hidden = true; }, error ? 6500 : 3800);
}
function showError(error) {
  toast(error?.message || '操作没有完成，请重试。', true);
}
function post(message) {
  frame.contentWindow?.postMessage({ source: 'tidewater-model-preview', ...message }, location.origin);
}
function hasGeometry() { return !!plan?.entities.length; }
function candidateIsVisible() { return view === 'candidate' && !!candidate; }
function recipeNeedsPreview() {
  return !!candidate && (candidate.recipe.lighting !== $('candidate-lighting').value
    || candidate.recipe.detail !== Number($('candidate-detail').value));
}
function safeName(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').slice(0, 70) || 'tidewater';
}
function releaseDownload() {
  if (fileURL) URL.revokeObjectURL(fileURL);
  fileURL = null;
  $('ready-download').hidden = true;
  $('ready-download').removeAttribute('href');
}
function download(data, name, mime = 'application/json') {
  releaseDownload();
  fileURL = URL.createObjectURL(new Blob([data], { type: mime }));
  const anchor = $('ready-download');
  anchor.href = fileURL; anchor.download = name; anchor.hidden = false;
  anchor.textContent = `文件已准备好：${name} ↓`;
  anchor.click();
}

// A read never creates or upgrades the original creator's database.
async function readCreationDraft() {
  if (!window.indexedDB) throw new Error('浏览器不支持本地存储，请导入方案 JSON。');
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    if (!databases.some(database => database.name === 'tidewater-creation-lab.v1')) return null;
  }
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tidewater-creation-lab.v1');
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => missing ? resolve(null) : reject(new Error('无法读取创作草案，请导入方案 JSON。'));
    request.onblocked = () => reject(new Error('创作草案正被升级，请稍后重试。'));
  });
  if (!db) return null;
  try {
    if (!db.objectStoreNames.contains('drafts')) return null;
    return await new Promise((resolve, reject) => {
      const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('无法读取当前草案，请导入方案 JSON。'));
    });
  } finally { db.close(); }
}
const modelDatabase = new Promise((resolve, reject) => {
  if (!window.indexedDB) { reject(new Error('无法独立保存本轮方案，请导出 JSON。')); return; }
  const request = indexedDB.open('tidewater-model-lab.v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('previews');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('无法打开模型方案存储，请导出 JSON。'));
  request.onblocked = () => reject(new Error('请关闭旧的模型方案页面后重试保存。'));
});
modelDatabase.catch(() => {});
async function readSavedCandidate() {
  const db = await modelDatabase;
  return new Promise((resolve, reject) => {
    const request = db.transaction('previews', 'readonly').objectStore('previews').get('current');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('无法读取已保存的模型方案。'));
  });
}
async function saveCandidate(record) {
  const db = await modelDatabase;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('previews', 'readwrite');
    if (record) tx.objectStore('previews').put(record, 'current');
    else tx.objectStore('previews').delete('current');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('方案保存失败，请导出 JSON。'));
    tx.onabort = () => reject(new Error('方案保存没有完成，请导出 JSON。'));
  });
}
function bundle() {
  return {
    format: 'tidewater-model-scene.v1', fingerprint: sourceFingerprint,
    plan: clone(plan), candidate: candidate ? clone(candidate) : null, savedAt: new Date().toISOString(),
  };
}

function renderCandidateInfo() {
  const info = candidate || authoredCandidate;
  if (!info) return;
  $('direction-heading').textContent = info.title;
  $('candidate-direction').textContent = info.direction;
  $('palette-swatches').replaceChildren(...Object.entries(info.recipe.palette).map(([key, color]) => {
    const swatch = document.createElement('span'); swatch.style.backgroundColor = color;
    swatch.title = `${key}: ${color}`; return swatch;
  }));
  $('candidate-notes').replaceChildren(...info.notes.map(note => {
    const item = document.createElement('li'); item.textContent = note; return item;
  }));
}
function renderContext() {
  $('layout-name').textContent = plan?.name || '尚未载入布局';
  $('layout-size').textContent = plan ? `${plan.world.width} × ${plan.world.depth} 米` : '—';
  $('layout-count').textContent = plan ? `${plan.entities.length} 个` : '—';
  $('layout-locks').textContent = plan ? `${plan.entities.filter(entity => entity.locked).length} 个对象` : '—';
  const counts = {};
  $('object-list').replaceChildren(...(plan?.entities || []).map(entity => {
    counts[entity.kind] = (counts[entity.kind] || 0) + 1;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'object-chip';
    button.dataset.id = entity.id; button.setAttribute('aria-pressed', String(selectedId === entity.id));
    const name = document.createElement('span'); name.textContent = `${kinds[entity.kind]} ${counts[entity.kind]}`;
    const id = document.createElement('code'); id.textContent = entity.id;
    button.append(name, id);
    if (entity.locked) {
      const lock = document.createElement('span'); lock.className = 'lock-indicator'; lock.textContent = '锁定'; button.append(lock);
    }
    button.addEventListener('click', () => selectEntity(entity.id));
    return button;
  }));
  if (plan) $('context-text').value = JSON.stringify(makeModelContext(plan), null, 2);
}
function selectEntity(id) {
  selectedId = plan?.entities.some(entity => entity.id === id) ? id : null;
  document.querySelectorAll('.object-chip').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === selectedId)));
  const entity = plan?.entities.find(entity => entity.id === selectedId);
  $('selected-object').textContent = entity
    ? `已选中 ${kinds[entity.kind]} · ${entity.id} · 原高度 ${entity.height} 米${entity.locked ? ' · 已锁定，几何沿用粗模' : ''}`
    : '在 3D 中点击对象，核对它的原始 ID。';
  if (ready) post({ type: 'select', id: selectedId });
}
function renderControls() {
  const available = hasGeometry() && !loading;
  $('preview-candidate').disabled = !available || !authoredCandidate;
  $('view-coarse').disabled = !available;
  $('view-candidate').disabled = !available || !candidate;
  $('view-coarse').setAttribute('aria-pressed', String(!candidateIsVisible()));
  $('view-candidate').setAttribute('aria-pressed', String(candidateIsVisible()));
  $('scene-heading').textContent = candidateIsVisible() ? '本轮 3D 候选' : '原始粗模';
  $('comparison-note').textContent = candidate ? '沿用同一布局，可随时比较。' : '先确认空间，再查看方案。';
  $('apply-candidate').disabled = !candidate || accepted || !rendered || !candidateIsVisible() || loading || recipeNeedsPreview();
  $('reset-candidate').disabled = !candidate || loading;
  $('show-context').disabled = !plan || loading;
  $('export-candidate').disabled = !candidate || loading;
  $('export-glb').disabled = !available || !rendered || !!exportRequest;
  $('refresh-draft').disabled = loading;
  $('import-layout').disabled = loading;
  $('candidate-lighting').disabled = loading || !authoredCandidate;
  $('candidate-detail').disabled = loading || !authoredCandidate;
  document.querySelectorAll('[data-camera]').forEach(button => { button.disabled = !available || !ready; });
  if (recipeNeedsPreview()) {
    $('accept-state').textContent = '参数已修改 · 等待重新预览';
    $('accept-note').textContent = '点击“预览本轮方案”，查看新参数后再保存。当前 3D 仍显示上一份候选。';
  } else if (accepted) {
    $('accept-state').textContent = '本轮方案已独立保存';
    $('accept-note').textContent = '再次打开时，原布局一致才会恢复这份候选。';
  } else if (candidate) {
    $('accept-state').textContent = '候选预览 · 尚未保存';
    $('accept-note').textContent = '比较并确认后保存本轮方案；原绘笔草案继续保留。';
  } else {
    $('accept-state').textContent = '候选尚未生成预览';
    $('accept-note').textContent = '比较后独立保存方案，原绘笔草案继续保留。';
  }
}
function showView(nextView) {
  view = nextView === 'candidate' && candidate ? 'candidate' : 'coarse';
  rendered = false; currentStats = null; releaseDownload();
  $('scene-loading').hidden = !hasGeometry();
  $('render-state').classList.remove('error');
  $('render-state').textContent = ready ? '正在构建…' : '准备 WebGPU…';
  $('geometry-stats').textContent = '等待预览';
  renderControls();
  if (!ready || !hasGeometry()) return;
  previewGeneration += 1;
  post({ type: 'plan', plan: clone(plan), candidate: candidateIsVisible() ? clone(candidate) : null, generation: previewGeneration });
  post({ type: 'select', id: selectedId });
}
async function loadPlan(nextPlan, label, importedCandidate = null) {
  const validated = validatePlan(nextPlan);
  const fingerprint = fingerprintPlan(validated);
  // Validate before changing any visible state, including imports.
  const imported = importedCandidate ? validateModelCandidate(importedCandidate, validated) : null;
  plan = validated; sourceFingerprint = fingerprint; sourceLabel = label;
  candidate = imported; accepted = false; selectedId = null; rendered = false;
  releaseDownload();
  const summary = summarizePlan(plan);
  const distribution = Object.entries(summary.counts).filter(([, count]) => count).map(([kind, count]) => `${count} ${kinds[kind]}`).join(' · ');
  $('source-status').textContent = `${label} · ${distribution || '布局为空'}`;
  $('scene-empty').hidden = hasGeometry();
  $('load-demo').hidden = hasGeometry();
  if (!hasGeometry()) {
    $('empty-heading').textContent = '这个布局还没有对象。';
    $('empty-note').textContent = '返回绘笔页面画出空间，或明确载入两岛示例开始体验。';
  }
  if (!imported) {
    try {
      const saved = await readSavedCandidate();
      if (saved?.candidate) {
        if (saved.fingerprint === fingerprint && fingerprintPlan(validatePlan(saved.plan)) === fingerprint) {
          candidate = validateModelCandidate(saved.candidate, plan); accepted = true;
          $('source-status').textContent += ' · 已恢复对应候选';
        } else {
          $('source-status').textContent += ' · 旧候选与当前布局不一致，未恢复';
          toast('布局已变化，旧候选保留在独立存档中。请对当前布局重新预览本轮方案。');
        }
      }
    } catch (error) { toast(`${error.message} 当前布局仍可预览。`, true); }
  }
  const info = candidate || authoredCandidate;
  if (info) {
    $('candidate-lighting').value = info.recipe.lighting;
    $('candidate-detail').value = String(info.recipe.detail);
  }
  loading = false;
  renderContext(); renderCandidateInfo(); selectEntity(null);
  showView(candidate ? 'candidate' : 'coarse');
}
async function refreshDraft(initial = false) {
  loading = true; renderControls();
  try {
    const draft = await readCreationDraft();
    if (!draft?.plan) {
      if (!initial && plan) {
        toast('本机没有已保存的创作草案，当前载入的布局继续保留。');
      } else {
        plan = null; candidate = null; accepted = false;
        $('source-status').textContent = '未找到本机创作草案 · 可导入 JSON 或载入示例';
        $('empty-heading').textContent = '先给方案一份空间结构。';
        $('empty-note').textContent = '返回绘笔页面保存布局，或导入已有 JSON，也可以载入两岛示例。';
        $('scene-empty').hidden = false; $('load-demo').hidden = false;
        $('render-state').textContent = '尚未载入布局';
        renderContext();
      }
      loading = false; renderControls(); return;
    }
    await loadPlan(draft.plan, '本机已保存布局');
    if (!initial) toast('已读取最新草案，原绘笔方案没有改动。');
  } catch (error) {
    loading = false;
    if (!plan) {
      $('empty-heading').textContent = '暂时无法读取本机布局。';
      $('empty-note').textContent = error.message;
      $('load-demo').hidden = false;
      $('source-status').textContent = '读取失败 · 请导入 JSON 或载入示例';
    }
    renderControls(); showError(error);
  }
}

$('preview-candidate').addEventListener('click', () => {
  try {
    const next = clone(authoredCandidate);
    next.recipe.lighting = $('candidate-lighting').value;
    next.recipe.detail = Number($('candidate-detail').value);
    candidate = validateModelCandidate(next, plan); accepted = false;
    renderCandidateInfo(); showView('candidate');
  } catch (error) { showError(error); }
});
$('view-coarse').addEventListener('click', () => showView('coarse'));
$('view-candidate').addEventListener('click', () => showView('candidate'));
for (const id of ['candidate-lighting', 'candidate-detail']) {
  $(id).addEventListener('change', renderControls);
}
$('refresh-draft').addEventListener('click', () => refreshDraft());
$('load-demo').addEventListener('click', async () => {
  loading = true; renderControls();
  try { await loadPlan(createDemoPlan(), '明确载入的两岛示例'); }
  catch (error) { loading = false; renderControls(); showError(error); }
});
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => post({ type: 'camera', camera: button.dataset.camera })));
$('apply-candidate').addEventListener('click', async () => {
  if (!candidate || !rendered || !candidateIsVisible() || recipeNeedsPreview()) return;
  loading = true; renderControls();
  try {
    await saveCandidate(bundle()); accepted = true;
    toast('本轮方案已独立保存，原绘笔草案保留。');
  } catch (error) { showError(error); }
  finally { loading = false; renderControls(); }
});
$('reset-candidate').addEventListener('click', async () => {
  if (!candidate) return;
  loading = true; renderControls();
  try {
    await saveCandidate(null); candidate = null; accepted = false;
    renderCandidateInfo(); showView('coarse');
    toast('已移除独立候选，原绘笔草案保留。');
  } catch (error) { showError(error); }
  finally { loading = false; renderControls(); }
});
$('import-layout').addEventListener('click', () => $('layout-file').click());
$('layout-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  loading = true; renderControls();
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('方案 JSON 须小于 4 MB。');
    const parsed = JSON.parse(await file.text());
    if (parsed.format === 'tidewater-model-scene.v1') {
      await loadPlan(parsed.plan, `已导入 ${file.name}`, parsed.candidate);
    } else await loadPlan(parsed, `已导入 ${file.name}`);
    toast('已载入独立实验，没有写入绘笔草案。');
  } catch (error) { loading = false; renderControls(); showError(error); }
});
$('export-candidate').addEventListener('click', () => {
  if (!candidate) return;
  download(JSON.stringify(bundle(), null, 2), `${safeName(plan.name)}-model-scene.json`);
  toast('方案 JSON 已准备好，包含原布局快照与本轮候选。');
});
$('export-glb').addEventListener('click', () => {
  if (!hasGeometry() || !rendered || exportRequest) return;
  const requestId = `glb-${Date.now()}-${previewGeneration}`;
  exportRequest = { id: requestId, generation: previewGeneration, view, name: `${safeName(plan.name)}-${candidateIsVisible() ? 'candidate' : 'coarse'}.glb` };
  renderControls();
  post({ type: 'export', requestId });
  exportTimer = setTimeout(() => {
    if (exportRequest?.id !== requestId) return;
    exportRequest = null; renderControls(); toast('导出超时，请确认 3D 预览已就绪后重试。', true);
  }, 15000);
});
$('show-context').addEventListener('click', () => {
  if (!plan) return;
  $('context-text').value = JSON.stringify(makeModelContext(plan), null, 2);
  $('copy-status').textContent = '';
  $('context-dialog').showModal();
});
$('close-context').addEventListener('click', () => $('context-dialog').close());
$('copy-context').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('context-text').value);
    $('copy-status').textContent = '已复制';
  } catch {
    $('context-text').focus(); $('context-text').select();
    $('copy-status').textContent = '请按 Ctrl+C 复制选中的上下文';
  }
});
$('download-context').addEventListener('click', () => {
  if (plan) download($('context-text').value, `${safeName(plan.name)}-context.json`);
});

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'tidewater-model-preview') return;
  const message = event.data;
  if (message.type === 'ready') {
    ready = true;
    if (hasGeometry()) showView(view);
    else renderControls();
  } else if (message.type === 'updated') {
    const stats = message.stats || message;
    if (stats.generation && (stats.generation < lastRenderedGeneration || stats.generation < previewGeneration)) return;
    lastRenderedGeneration = stats.generation || previewGeneration;
    rendered = Number(stats.renderedGeneration || 0) >= Number(stats.generation || 1); currentStats = stats;
    $('scene-loading').hidden = rendered;
    $('render-state').classList.remove('error');
    $('render-state').textContent = rendered ? (candidateIsVisible() ? '真实 3D · 候选方案' : '真实 3D · 原始粗模') : '正在构建真实 3D…';
    $('geometry-stats').textContent = `${Number(stats.triangles || 0).toLocaleString()} 三角面${candidateIsVisible() ? ` · ${stats.upgraded || 0} 个对象增强` : ''}`;
    renderControls();
  } else if (message.type === 'select') {
    selectEntity(message.id);
  } else if (message.type === 'exported') {
    if (!exportRequest || message.requestId !== exportRequest.id) return;
    const requested = exportRequest; exportRequest = null; clearTimeout(exportTimer);
    try {
      if (requested.generation !== previewGeneration || requested.view !== view) throw new Error('视图已经变化，请重新导出当前视图。');
      const bytes = createSceneGLB(message.mesh, { title: candidateIsVisible() ? candidate.title : plan.name });
      download(bytes, requested.name, 'model/gltf-binary');
      toast(`GLB 已准备好 · ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) { showError(error); }
    renderControls();
  } else if (message.type === 'errors' || message.type === 'error') {
    if (exportRequest && (!message.requestId || message.requestId === exportRequest.id)) {
      exportRequest = null; clearTimeout(exportTimer);
    }
    $('scene-loading').hidden = true; rendered = false;
    $('render-state').textContent = '预览暂不可用'; $('render-state').classList.add('error');
    renderControls(); toast(message.message || message.error || 'WebGPU 预览没有完成，请换用支持 WebGPU 的浏览器。', true);
  }
});
window.addEventListener('beforeunload', releaseDownload);

const candidateRequest = fetch('model-scene-candidate.json').then(response => {
  if (!response.ok) throw new Error('本轮模型方案未能载入。');
  return response.json();
}).then(value => {
  authoredCandidate = validateModelCandidate(value, plan || createDemoPlan());
  if (!candidate) {
    $('candidate-lighting').value = authoredCandidate.recipe.lighting;
    $('candidate-detail').value = String(authoredCandidate.recipe.detail);
  }
  renderCandidateInfo(); renderControls();
}).catch(error => { $('candidate-direction').textContent = '本轮方案暂不可用；仍可检查原始布局。'; showError(error); });
await Promise.allSettled([candidateRequest, refreshDraft(true)]);
renderControls();
