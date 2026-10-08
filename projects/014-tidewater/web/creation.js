import { createPlan, createDemoPlan, validatePlan, applyPlanOperations, summarizePlan, buildGenerationBrief } from './creation-core.js';
import { waterLevel } from './creation-surfaces.js';
import { makeRefinement, generateLandDetails } from './creation-refinement.js';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const kinds = { land: '陆地', water: '水面', road: '道路', cabin: '小屋', lighthouse: '灯塔', palm: '棕榈', boat: '船只' };
const icons = { land: '▰', water: '≈', road: '╱', cabin: '⌂', lighthouse: '▥', palm: '♧', boat: '◈' };
const markerKinds = new Set(['cabin', 'lighthouse', 'palm', 'boat']);
const entryFromURL = new URL(location.href).searchParams.get('entry') === 'image' ? 'image' : 'layout';
const canvas = $('layout-canvas'), ctx = canvas.getContext('2d'), previewFrame = $('creation-frame');
let plan = createPlan(entryFromURL), selectedId = null, tool = entryFromURL === 'image' ? 'lighthouse' : 'land';
let boardView = entryFromURL === 'image' ? 'reference' : 'layout', revision = 0;
let image = null, imageKey = null, gesture = null, previewReady = false, previewRequested = false, previewDirty = false, previewError = false;
let previewEntityIds = new Set();
let toastTimer, persistTimer, saveQueue = Promise.resolve(), loading = true, lastSavedPlanJSON = '';
const past = [], future = [];
const refinementNames = { tropical: '热带海岸', rocky: '岩岸草甸', garden: '花园岛' };
let refinementCandidate = null, refinementView = 'after', refinementContext = '', refinementSeed = 1;

function toast(message, error = false) {
  clearTimeout(toastTimer); $('creation-toast').textContent = message; $('creation-toast').hidden = false;
  $('creation-toast').classList.toggle('error', error);
  toastTimer = setTimeout(() => { $('creation-toast').hidden = true; }, error ? 6500 : 3500);
}
function attempt(action) {
  try { return action(); } catch (error) { toast(error.message, true); render(); return false; }
}
const dbPromise = new Promise((resolve, reject) => {
  if (!window.indexedDB) { reject(new Error('当前浏览器不支持本地草案保存')); return; }
  const request = indexedDB.open('tidewater-creation-lab.v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('无法打开本地草案存储'));
  request.onblocked = () => reject(new Error('请关闭旧的创作实验页面后重试保存'));
});
dbPromise.catch(() => {});
async function readDraft() {
  const db = await dbPromise;
  return await new Promise((resolve, reject) => {
    const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法读取本地草案'));
  });
}
function persist(explicit = false) {
  if (loading) return Promise.resolve(false);
  const snapshot = clone(plan), savedRevision = revision;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const serialized = JSON.stringify(snapshot);
    // Viewing a saved draft in another tab must not overwrite later edits on pagehide.
    if (serialized !== lastSavedPlanJSON) {
      const db = await dbPromise;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({ plan: snapshot, savedAt: new Date().toISOString() }, 'current');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(new Error('本地存储不可用，请导出方案文件保存'));
        tx.onabort = () => reject(new Error('保存没有完成，请导出方案文件保存'));
      });
      lastSavedPlanJSON = serialized;
    }
    if (savedRevision === revision) $('project-status').textContent = `第 ${revision} 次修改 · 已保存到本机`;
    if (explicit) toast('创作草案已保存，原海岛存档保留');
    return true;
  }).catch(error => {
    $('project-status').textContent = '本地保存不可用 · 请导出方案';
    if (explicit) toast(error.message, true);
    return false;
  });
  return saveQueue;
}
function scheduleSave() {
  clearTimeout(persistTimer); $('project-status').textContent = `第 ${revision} 次修改 · 等待保存`;
  persistTimer = setTimeout(() => persist(), 350);
}
function commit(next, label) {
  next = validatePlan(next);
  if (JSON.stringify(next) === JSON.stringify(plan)) return false;
  const hadCandidate = !!refinementCandidate;
  refinementCandidate = null; refinementView = 'after';
  past.push(clone(plan)); if (past.length > 30) past.shift(); future.length = 0;
  plan = next; revision++;
  if (selectedId && !plan.entities.some(entity => entity.id === selectedId)) selectedId = null;
  previewDirty = true; render(); scheduleSave(); updatePreview(hadCandidate);
  if (label) toast(label);
  return true;
}
function execute(operations, label) { return commit(applyPlanOperations(plan, operations), label); }
function restore(from, to, label) {
  if (!from.length) return false;
  const hadCandidate = !!refinementCandidate;
  refinementCandidate = null; refinementView = 'after';
  to.push(clone(plan)); plan = from.pop(); revision++; selectedId = null; gesture = null;
  previewDirty = true; render(); scheduleSave(); updatePreview(hadCandidate); toast(label); return true;
}
function center(entity) {
  return entity.points.reduce((sum, point) => ({ x: sum.x + point.x / entity.points.length, y: sum.y + point.y / entity.points.length }), { x: 0, y: 0 });
}
function translatedPoints(entity, dx, dy) {
  const minX = Math.min(...entity.points.map(point => point.x)), maxX = Math.max(...entity.points.map(point => point.x));
  const minY = Math.min(...entity.points.map(point => point.y)), maxY = Math.max(...entity.points.map(point => point.y));
  dx = Math.max(-minX, Math.min(1 - maxX, dx)); dy = Math.max(-minY, Math.min(1 - maxY, dy));
  return entity.points.map(point => ({ x: point.x + dx, y: point.y + dy }));
}
function select(id) {
  const nextId = plan.entities.some(entity => entity.id === id) ? id : null;
  if (refinementCandidate && nextId !== refinementCandidate.targetId) cancelRefinement();
  selectedId = nextId;
  renderInspector(); drawCanvas();
  if (previewReady) postPreview({ type: 'select', id: previewEntityIds.has(selectedId) ? selectedId : null });
}
function postPreview(message) {
  previewFrame.contentWindow?.postMessage({ source: 'tidewater-creation', ...message }, location.origin);
}
function updatePreview(force = false) {
  if (!previewRequested || !previewReady || (!force && !$('auto-preview').checked)) return;
  const visiblePlan = refinementCandidate && refinementView === 'after' ? refinementCandidate.plan : plan;
  previewEntityIds = new Set(visiblePlan.entities.map(entity => entity.id));
  postPreview({ type: 'plan', plan: clone(visiblePlan) }); postPreview({ type: 'select', id: previewEntityIds.has(selectedId) ? selectedId : null });
  previewDirty = false; renderPreviewStatus();
}
function renderPreviewStatus() {
  const state = $('preview-state'); state.classList.remove('ready', 'dirty');
  if (previewError) { state.textContent = '预览不可用'; state.classList.add('dirty'); }
  else if (!previewRequested) state.textContent = '尚未生成';
  else if (!previewReady) state.textContent = '准备预览…';
  else if (refinementCandidate) { state.textContent = refinementView === 'after' ? '候选细化 · 未应用' : '修改前 · 候选未应用'; state.classList.add('dirty'); }
  else if (previewDirty) { state.textContent = '布局已修改'; state.classList.add('dirty'); }
  else { state.textContent = `${plan.entities.length} 个区域 / 对象`; state.classList.add('ready'); }
  $('generate-preview').disabled = !plan.entities.length;
  $('generate-preview').textContent = previewRequested ? '更新 3D 粗模 ↗' : '生成 3D 粗模 ↗';
}
function loadReferenceImage() {
  const key = plan.reference?.dataUrl || null;
  if (key === imageKey) return;
  imageKey = key; image = null;
  if (!key) return;
  const pending = new Image();
  pending.onload = () => { if (key !== imageKey) return; image = pending; drawCanvas(); };
  pending.onerror = () => { if (key === imageKey) toast('参考图片无法解码，请重新选择图片', true); };
  pending.src = key;
}
function renderInspector() {
  const list = $('entity-list'); list.replaceChildren();
  plan.entities.forEach((entity, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'entity-item'; button.dataset.entityId = entity.id;
    button.classList.toggle('is-selected', entity.id === selectedId); button.setAttribute('aria-pressed', String(entity.id === selectedId));
    const label = document.createElement('span'); label.textContent = `${icons[entity.kind]} ${kinds[entity.kind]} ${index + 1}`;
    const meta = document.createElement('small'); meta.textContent = entity.locked ? '已锁定' : entity.kind === 'water' ? `水位 ${waterLevel(plan, entity)} 米` : `${entity.height} 米`;
    button.append(label, meta); button.addEventListener('click', () => select(entity.id)); list.append(button);
  });
  const entity = plan.entities.find(item => item.id === selectedId);
  $('selection-fields').hidden = !entity; $('selection-empty').hidden = !!entity;
  $('selection-heading').textContent = entity ? `${kinds[entity.kind]} · ${entity.id}` : '选择一个对象';
  if (entity) {
    const c = center(entity);
    $('entity-x').value = ((c.x - .5) * plan.world.width).toFixed(1);
    $('entity-z').value = ((c.y - .5) * plan.world.depth).toFixed(1);
    $('entity-height').value = entity.height; $('entity-locked').checked = entity.locked;
    $('height-label').textContent = entity.kind === 'water' ? '最低水位' : '高度';
    $('water-height-help').hidden = entity.kind !== 'water';
    if (entity.kind === 'water') $('water-height-help').textContent = `自动贴合相交陆地的最高表面，当前水位 ${waterLevel(plan, entity)} 米。调整最低水位可以抬高水面。`;
    for (const id of ['entity-x', 'entity-z', 'entity-height', 'delete-entity']) $(id).disabled = entity.locked;
  }
  renderRefinement();
}

function selectedLand() { return plan.entities.find(entity => entity.id === selectedId && entity.kind === 'land'); }
function refinementConfig() {
  return { ...makeRefinement($('refine-preset').value, Number($('refine-density').value), refinementSeed), beach: $('refine-beach').checked, rocks: $('refine-rocks').checked, vegetation: $('refine-vegetation').checked };
}
function writeRefinementSettings(config) {
  $('refine-preset').value = config.preset; $('refine-density').value = config.density;
  $('refine-beach').checked = config.beach; $('refine-rocks').checked = config.rocks; $('refine-vegetation').checked = config.vegetation;
  refinementSeed = config.seed;
}
function renderRefinement() {
  const entity = selectedLand(), target = $('refine-target');
  target.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '选择画布中的一块陆地'; target.append(placeholder);
  plan.entities.forEach((item, index) => {
    if (item.kind !== 'land') return;
    const option = document.createElement('option'); option.value = item.id;
    option.textContent = `陆地 ${index + 1}${item.refinement ? ` · ${refinementNames[item.refinement.preset]}` : ''}${item.locked ? ' · 已锁定' : ''}`;
    target.append(option);
  });
  target.value = entity?.id || ''; target.disabled = loading || !plan.entities.some(item => item.kind === 'land');
  const context = entity ? `${entity.id}:${JSON.stringify(entity.refinement || null)}` : '';
  if (context !== refinementContext) { refinementContext = context; writeRefinementSettings(entity?.refinement || makeRefinement('tropical', 2, 1)); }
  const allowed = !!entity && !entity.locked && !loading;
  for (const id of ['refine-preset', 'refine-density', 'refine-beach', 'refine-rocks', 'refine-vegetation', 'preview-refinement', 'reroll-refinement']) $(id).disabled = !allowed;
  $('remove-refinement').disabled = !allowed || !entity.refinement;
  $('refine-target-note').textContent = !entity ? '在画布、3D 或此处选择陆地。' : entity.locked ? '这块陆地已锁定，请在对象属性中解锁后细化。' : `${entity.id} · 轮廓与已有布局保持不变`;
  const pending = !!refinementCandidate;
  for (const id of ['refine-before', 'refine-after', 'apply-refinement', 'cancel-refinement', 'preview-refine-before', 'preview-refine-after']) $(id).disabled = !pending;
  $('preview-refinement-compare').hidden = !pending;
  for (const id of ['refine-before', 'preview-refine-before']) $(id).setAttribute('aria-pressed', String(pending && refinementView === 'before'));
  for (const id of ['refine-after', 'preview-refine-after']) $(id).setAttribute('aria-pressed', String(!pending || refinementView === 'after'));
  $('refine-status').textContent = pending ? '候选已生成，尚未应用' : entity?.locked ? '已锁定 · 细化暂停' : entity?.refinement ? `已应用 · ${refinementNames[entity.refinement.preset]}` : '先确认布局，再试一种外观。';
  $('refine-summary').textContent = pending ? `${refinementNames[refinementCandidate.config.preset]} · ${refinementCandidate.details} 个装饰细节。切换修改前与候选效果，在上方 3D 中比较。` : '候选效果可以比较；应用后才保存到草案。';
}
function ensurePreview() {
  if (!plan.entities.length) return;
  if (!previewRequested || previewError) {
    previewRequested = true; previewError = false; previewReady = false; previewFrame.hidden = false; $('preview-empty').hidden = true;
    previewFrame.src = `creation-preview.html?load=${Date.now()}`; renderPreviewStatus();
  } else updatePreview(true);
}
function previewRefinement(reroll = false) {
  const entity = selectedLand(); if (!entity) throw new Error('请先选择一块陆地。');
  if (entity.locked) throw new Error('这块陆地已锁定，请先解锁。');
  if (reroll) refinementSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  const config = refinementConfig(), next = applyPlanOperations(plan, [{ type: 'update', id: entity.id, values: { refinement: config } }]);
  const details = generateLandDetails(next, next.entities.find(item => item.id === entity.id));
  refinementCandidate = { plan: next, targetId: entity.id, revision, config, details: details.decorations.length }; refinementView = 'after';
  ensurePreview(); renderRefinement(); renderPreviewStatus();
  toast('候选效果已送到上方 3D，比较后应用即可保存');
}
function cancelRefinement(label) {
  if (!refinementCandidate) return;
  refinementCandidate = null; refinementView = 'after'; renderRefinement(); updatePreview(true); renderPreviewStatus();
  if (label) toast(label);
}
function render() {
  document.querySelectorAll('[data-entry]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.entry === plan.entry)));
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
  $('reference-panel').hidden = plan.entry !== 'image'; $('reference-warning').hidden = boardView !== 'reference';
  $('view-layout').setAttribute('aria-pressed', String(boardView === 'layout'));
  $('view-reference').setAttribute('aria-pressed', String(boardView === 'reference'));
  $('plan-name').value = plan.name; $('plan-intent').value = plan.intent;
  $('undo-plan').disabled = !past.length; $('redo-plan').disabled = !future.length;
  $('world-size').textContent = `${plan.world.width} × ${plan.world.depth} 米`;
  $('entity-count').textContent = String(plan.entities.length);
  $('lighting').value = plan.style.lighting; $('water-color').value = plan.style.waterColor; $('land-color').value = plan.style.landColor;
  $('remove-reference').disabled = !plan.reference;
  $('reference-info').textContent = plan.reference ? `${plan.reference.name} · ${plan.reference.width} × ${plan.reference.height} · 图片已保存在方案中` : '上传 PNG、JPEG 或 WebP，在图上标记对象，再到布局中校正空间。';
  const summary = summarizePlan(plan);
  $('plan-summary').textContent = summary.entityCount ? Object.entries(summary.counts).filter(([, count]) => count).map(([kind, count]) => `${count} ${kinds[kind]}`).join(' · ') : '尚未放置区域或对象。';
  $('empty-board').hidden = !!plan.entities.length || (boardView === 'reference' && !!plan.reference);
  $('empty-board').querySelector('strong').textContent = boardView === 'reference' ? '选择一张参考图，再标记关键对象。' : '先画一块陆地，或放一个对象。';
  $('empty-board').querySelector('p').textContent = boardView === 'reference' ? '图片表达外观；标记的空间关系可以在俯视布局里校正。' : '按住拖动画轮廓，松开后闭合。也可以载入两岛示例，试试移动和锁定。';
  $('tool-help').textContent = tool === 'select' ? '选择对象后拖动可移动；锁定对象会保留位置。' : markerKinds.has(tool) ? `点击画布放置${kinds[tool]}；之后用选择工具移动。` : tool === 'road' ? '按住拖动绘制道路；它会成为真实 3D 路段。' : tool === 'water' ? '拖动画水面轮廓，松开后闭合；陆地上的水面会自动贴合地表。' : `按住拖动绘制${kinds[tool]}轮廓，松开后自动闭合。`;
  loadReferenceImage(); renderInspector(); drawCanvas(); renderPreviewStatus();
}
function path(points, close = false) {
  ctx.beginPath(); points.forEach((point, index) => { if (index) ctx.lineTo(point.x * canvas.width, point.y * canvas.height); else ctx.moveTo(point.x * canvas.width, point.y * canvas.height); });
  if (close) ctx.closePath();
}
function drawEntity(entity, selected = false, draft = false) {
  ctx.save(); const points = entity.points;
  if (entity.kind === 'land' || entity.kind === 'water') {
    path(points, true); ctx.fillStyle = entity.kind === 'land' ? plan.style.landColor + (boardView === 'reference' ? '80' : 'bd') : plan.style.waterColor + 'a0';
    ctx.fill(); ctx.lineWidth = selected ? 5 : 2; ctx.strokeStyle = selected ? '#c28b35' : entity.kind === 'land' ? '#52765b' : '#347b89';
    if (draft) ctx.setLineDash([8, 5]); ctx.stroke();
  } else if (entity.kind === 'road') {
    path(points); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = selected ? 15 : 12; ctx.strokeStyle = selected ? '#c28b35' : '#8c8372'; ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = '#eee2bf'; ctx.setLineDash([9, 8]); ctx.stroke();
  } else {
    const point = points[0], x = point.x * canvas.width, y = point.y * canvas.height;
    ctx.fillStyle = selected ? '#f8e4b4' : '#fffef2'; ctx.strokeStyle = selected ? '#c28b35' : '#3f7364'; ctx.lineWidth = selected ? 4 : 2;
    ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#315e52'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '25px "Segoe UI", "Microsoft YaHei", sans-serif'; ctx.fillText(icons[entity.kind], x, y - 1);
  }
  const c = center(entity); ctx.fillStyle = '#315c4c'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '19px "Segoe UI", "Microsoft YaHei", sans-serif';
  const labelY = markerKinds.has(entity.kind) ? c.y * canvas.height + 30 : c.y * canvas.height + 6;
  ctx.fillText(`${kinds[entity.kind]}${entity.locked ? ' · 锁定' : ''}`, c.x * canvas.width, labelY);
  ctx.restore();
}
function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e2eeea'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (boardView === 'reference' && image) {
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height), w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.fillStyle = '#fffef21f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.strokeStyle = '#c6dcd3'; ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += canvas.width / 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += canvas.height / 15) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }
  const display = gesture?.type === 'move' && gesture.points ? plan.entities.map(entity => entity.id === gesture.entity.id ? { ...entity, points: gesture.points } : entity) : plan.entities;
  for (const kind of ['land', 'water']) for (const entity of display.filter(entity => entity.kind === kind)) drawEntity(entity, entity.id === selectedId);
  for (const entity of display.filter(entity => entity.kind === 'road')) drawEntity(entity, entity.id === selectedId);
  for (const entity of display.filter(entity => markerKinds.has(entity.kind))) drawEntity(entity, entity.id === selectedId);
  if (gesture?.type === 'draw' && gesture.points.length) drawEntity({ kind: gesture.kind, points: gesture.points, locked: false }, false, true);
}
function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}
function polygonContains(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function hitTest(point) {
  for (const entity of [...plan.entities].reverse().filter(entity => markerKinds.has(entity.kind))) if (Math.hypot(point.x - entity.points[0].x, (point.y - entity.points[0].y) * .75) < .03) return entity;
  for (const entity of [...plan.entities].reverse().filter(entity => entity.kind === 'road')) if (entity.points.slice(1).some((b, index) => segmentDistance(point, entity.points[index], b) < .012)) return entity;
  for (const kind of ['water', 'land']) {
    const entity = [...plan.entities].reverse().find(entity => entity.kind === kind && polygonContains(point, entity.points));
    if (entity) return entity;
  }
}
function newId(kind) { return `${kind}-${crypto.randomUUID().slice(0, 8)}`; }
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); const point = pointFromEvent(event);
  if (tool === 'select') {
    const entity = hitTest(point); select(entity?.id);
    if (entity && !entity.locked) { gesture = { type: 'move', pointerId: event.pointerId, start: point, entity: clone(entity), points: null }; canvas.setPointerCapture(event.pointerId); }
    else if (entity?.locked) toast('这个对象已锁定，请先解锁');
  } else if (markerKinds.has(tool)) {
    const id = newId(tool);
    if (attempt(() => execute([{ type: 'add', entity: { id, kind: tool, points: [point] } }], `已放置${kinds[tool]}`))) select(id);
  } else {
    gesture = { type: 'draw', pointerId: event.pointerId, kind: tool, points: [point] }; canvas.setPointerCapture(event.pointerId); drawCanvas();
  }
});
canvas.addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const point = pointFromEvent(event);
  if (gesture.type === 'move') gesture.points = translatedPoints(gesture.entity, point.x - gesture.start.x, point.y - gesture.start.y);
  else {
    const last = gesture.points.at(-1);
    if (Math.hypot(point.x - last.x, point.y - last.y) > .008 && gesture.points.length < 200) gesture.points.push(point);
  }
  drawCanvas();
});
canvas.addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const completed = gesture; gesture = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (completed.type === 'move') {
    if (completed.points) attempt(() => execute([{ type: 'update', id: completed.entity.id, values: { points: completed.points } }], '已移动选中对象'));
  } else {
    const end = pointFromEvent(event), last = completed.points.at(-1);
    if (Math.hypot(end.x - last.x, end.y - last.y) > .002) completed.points.push(end);
    if (completed.kind !== 'road' && completed.points.length > 3 && Math.hypot(end.x - completed.points[0].x, end.y - completed.points[0].y) < .02) completed.points.pop();
    const id = newId(completed.kind);
    if (attempt(() => execute([{ type: 'add', entity: { id, kind: completed.kind, points: completed.points } }], `已绘制${kinds[completed.kind]}`))) select(id);
  }
  drawCanvas();
});
canvas.addEventListener('pointercancel', () => { gesture = null; drawCanvas(); });

document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => { tool = button.dataset.tool; gesture = null; render(); }));
document.querySelectorAll('[data-entry]').forEach(button => button.addEventListener('click', () => {
  const entry = button.dataset.entry; boardView = entry === 'image' ? 'reference' : 'layout';
  attempt(() => execute([{ type: 'entry', entry }]));
  const url = new URL(location.href); url.searchParams.set('entry', entry); history.replaceState(null, '', url); render();
}));
$('view-layout').addEventListener('click', () => { boardView = 'layout'; render(); });
$('view-reference').addEventListener('click', () => { boardView = 'reference'; render(); });
$('undo-plan').addEventListener('click', () => restore(past, future, '已撤销布局修改'));
$('redo-plan').addEventListener('click', () => restore(future, past, '已重做布局修改'));
$('plan-name').addEventListener('change', () => attempt(() => execute([{ type: 'rename', name: $('plan-name').value.trim() }], '已修改作品名称')));
$('plan-intent').addEventListener('change', () => attempt(() => execute([{ type: 'intent', intent: $('plan-intent').value }], '已保存外观要求')));
$('new-plan').addEventListener('click', () => { cancelRefinement(); selectedId = null; attempt(() => commit(createPlan(plan.entry), '已新建空白方案，可撤销')); });
$('load-demo').addEventListener('click', () => {
  cancelRefinement();
  const demo = createDemoPlan(plan.entry); demo.reference = clone(plan.reference); demo.intent = plan.intent; demo.style = clone(plan.style);
  selectedId = null; attempt(() => commit(demo, '已载入两岛示例，可继续编辑')); boardView = 'layout'; render();
});
$('clear-layout').addEventListener('click', () => {
  const operations = plan.entities.filter(entity => !entity.locked).map(entity => ({ type: 'remove', id: entity.id }));
  if (!operations.length) { toast('没有可清除的对象，锁定内容会保留'); return; }
  attempt(() => execute(operations, '已清除未锁定对象，可撤销'));
});
for (const [field, axis, size] of [['entity-x', 'x', 'width'], ['entity-z', 'y', 'depth']]) $(field).addEventListener('change', () => attempt(() => {
  const entity = plan.entities.find(item => item.id === selectedId); if (!entity) return;
  const value = Number($(field).value); if (!Number.isFinite(value)) throw new Error('坐标必须是有限数值');
  const c = center(entity), delta = value / plan.world[size] + .5 - c[axis];
  execute([{ type: 'update', id: entity.id, values: { points: translatedPoints(entity, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0) } }], '已调整对象位置');
}));
$('entity-height').addEventListener('change', () => attempt(() => execute([{ type: 'update', id: selectedId, values: { height: Number($('entity-height').value) } }], '已调整对象高度')));
$('entity-locked').addEventListener('change', () => attempt(() => execute([{ type: 'update', id: selectedId, values: { locked: $('entity-locked').checked } }], $('entity-locked').checked ? '已锁定对象' : '已解锁对象')));
$('delete-entity').addEventListener('click', () => attempt(() => execute([{ type: 'remove', id: selectedId }], '已删除对象，可撤销')));
for (const [id, key] of [['lighting', 'lighting'], ['water-color', 'waterColor'], ['land-color', 'landColor']]) $(id).addEventListener('change', () => attempt(() => execute([{ type: 'style', values: { [key]: $(id).value } }], '已调整粗模外观')));
$('generate-preview').addEventListener('click', ensurePreview);
$('refine-target').addEventListener('change', () => select($('refine-target').value || null));
$('preview-refinement').addEventListener('click', () => attempt(() => previewRefinement()));
$('reroll-refinement').addEventListener('click', () => attempt(() => previewRefinement(true)));
$('refine-preset').addEventListener('change', () => {
  const defaults = makeRefinement($('refine-preset').value, Number($('refine-density').value), refinementSeed);
  writeRefinementSettings(defaults); cancelRefinement('方向已修改，请重新预览');
});
for (const id of ['refine-density', 'refine-beach', 'refine-rocks', 'refine-vegetation']) $(id).addEventListener('change', () => cancelRefinement('参数已修改，请重新预览'));
for (const [id, view] of [['refine-before', 'before'], ['refine-after', 'after'], ['preview-refine-before', 'before'], ['preview-refine-after', 'after']]) $(id).addEventListener('click', () => {
  if (!refinementCandidate) return; refinementView = view; updatePreview(true); renderRefinement();
});
$('cancel-refinement').addEventListener('click', () => cancelRefinement('候选已取消，原草案保留'));
$('apply-refinement').addEventListener('click', () => attempt(() => {
  if (!refinementCandidate) return;
  if (refinementCandidate.revision !== revision || refinementCandidate.targetId !== selectedId) throw new Error('布局或目标已修改，请重新生成候选。');
  const next = refinementCandidate.plan;
  commit(next, '已应用区域细化，可撤销；草案将自动保存');
  refinementCandidate = null; refinementView = 'after'; renderRefinement(); updatePreview(true);
}));
$('remove-refinement').addEventListener('click', () => attempt(() => {
  const entity = selectedLand(); if (!entity?.refinement) return;
  execute([{ type: 'update', id: entity.id, values: { refinement: null } }], '已移除细化，轮廓与其他对象保留，可撤销'); updatePreview(true);
}));
$('auto-preview').addEventListener('change', () => { if ($('auto-preview').checked) updatePreview(true); });
document.querySelectorAll('[data-preview-camera]').forEach(button => button.addEventListener('click', () => { if (previewReady) postPreview({ type: 'camera', preset: button.dataset.previewCamera }); }));
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== previewFrame.contentWindow || event.data?.source !== 'tidewater-creation-preview') return;
  if (event.data.type === 'ready') { previewReady = true; previewError = false; updatePreview(true); }
  if (event.data.type === 'select') select(event.data.id);
  if (event.data.type === 'error') { previewReady = false; previewError = true; renderPreviewStatus(); toast(`3D 粗模预览：${event.data.message}`, true); }
});

async function referenceFromBlob(blob, name) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  if (blob.size > 12 * 1024 * 1024) throw new Error('参考图片应小于 12 MB');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192) throw new Error('图片边长应不超过 8192 像素');
    const ratio = Math.min(1, 1400 / bitmap.width, 1100 / bitmap.height), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * ratio)); c.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = c.getContext('2d'); context.fillStyle = '#fffef9'; context.fillRect(0, 0, c.width, c.height); context.drawImage(bitmap, 0, 0, c.width, c.height);
    let dataUrl = c.toDataURL('image/jpeg', .85);
    if (dataUrl.length > 2 * 1024 * 1024) dataUrl = c.toDataURL('image/jpeg', .6);
    if (dataUrl.length > 2 * 1024 * 1024) throw new Error('图片压缩后仍过大，请选择较小图片');
    return { name: name.slice(0, 160), dataUrl, width: c.width, height: c.height };
  } finally { bitmap.close(); }
}
async function applyReference(blob, name) {
  const reference = await referenceFromBlob(blob, name);
  execute([{ type: 'reference', reference }, { type: 'entry', entry: 'image' }], '图片已载入，可人工标记并校正布局');
  boardView = 'reference'; tool = 'lighthouse'; render();
}
$('upload-reference').addEventListener('click', () => $('reference-file').click());
$('reference-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { await applyReference(file, file.name); } catch (error) { toast(`图片读取失败：${error.message}`, true); }
  finally { event.target.value = ''; }
});
$('example-reference').addEventListener('click', async () => {
  const button = $('example-reference'); button.disabled = true;
  try { const response = await fetch('assets/workbench-sunset.png'); if (!response.ok) throw new Error('示例图片不可用'); await applyReference(await response.blob(), '原海岛工作台日落截图'); }
  catch (error) { toast(error.message, true); } finally { button.disabled = false; }
});
$('remove-reference').addEventListener('click', () => attempt(() => execute([{ type: 'reference', reference: null }], '已移除参考图，布局保留')));

function download(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function fileName() { return plan.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || '场景方案'; }
$('save-plan').addEventListener('click', async () => { if (document.activeElement === $('plan-intent')) $('plan-intent').blur(); clearTimeout(persistTimer); await persist(true); });
$('export-plan').addEventListener('click', () => download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), `${fileName()}.creation.json`));
$('import-plan').addEventListener('click', () => $('plan-file').click());
$('plan-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 3 * 1024 * 1024) throw new Error('方案文件应小于 3 MB');
    const next = validatePlan(JSON.parse(await file.text()));
    if (next.reference) { const decoded = await createImageBitmap(await (await fetch(next.reference.dataUrl)).blob()); if (decoded.width !== next.reference.width || decoded.height !== next.reference.height) { decoded.close(); throw new Error('参考图尺寸与方案不符'); } decoded.close(); }
    commit(next, '已导入创作方案，可撤销'); boardView = next.entry === 'image' ? 'reference' : 'layout'; render();
  } catch (error) { toast(`导入失败：${error.message}`, true); }
  finally { event.target.value = ''; }
});
$('show-brief').addEventListener('click', () => { $('brief-text').value = buildGenerationBrief(plan); $('brief-dialog').showModal(); });
$('close-brief').addEventListener('click', () => $('brief-dialog').close());
$('copy-brief').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('brief-text').value); toast('生成说明已复制'); }
  catch { $('brief-text').focus(); $('brief-text').select(); toast('请手动复制选中的说明，或下载文本'); }
});
$('download-brief').addEventListener('click', () => download(new Blob([$('brief-text').value], { type: 'text/plain;charset=utf-8' }), `${fileName()}-生成说明.txt`));
window.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || $('brief-dialog').open) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? restore(future, past, '已重做') : restore(past, future, '已撤销'); }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); attempt(() => execute([{ type: 'remove', id: selectedId }], '已删除对象，可撤销')); }
});
window.addEventListener('pagehide', () => { clearTimeout(persistTimer); persist(); });
window.creationStudio = {
  get plan() { return clone(plan); }, get selectedId() { return selectedId; }, get revision() { return revision; }, get ready() { return !loading; }, get previewReady() { return previewReady; },
  get refinementCandidate() { return refinementCandidate ? clone(refinementCandidate.plan) : null; }, get refinementView() { return refinementView; },
  execute, select, undo: () => restore(past, future, '已撤销'), redo: () => restore(future, past, '已重做'), save: () => persist(),
};
render();
try {
  // Keep a browser-side copy of the original editor configuration; never overwrite its key.
  const original = localStorage.getItem('tidewater-studio.v1'), backupKey = 'tidewater-studio.before-creation-inputs';
  if (original && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, original);
} catch { /* The source and visual baseline are also preserved as workspace files. */ }
try {
  const saved = await readDraft();
  if (saved?.plan) { plan = validatePlan(saved.plan); plan.entry = entryFromURL; lastSavedPlanJSON = JSON.stringify(plan); $('project-status').textContent = '已恢复本机创作草案'; }
  else $('project-status').textContent = '新草案 · 原海岛存档保留';
} catch (error) { $('project-status').textContent = '本地草案不可用 · 可以导出方案保存'; toast(error.message, true); }
finally { loading = false; render(); }
// Explicit transfer from the camp editor; the original draft has a persistent
// backup before commit, and the normal undo/history path remains available.
const campTransfer=new URL(location.href).searchParams.get('campTransfer');
if(campTransfer&&/^[0-9a-f-]{36}$/u.test(campTransfer)){
  try{
    const raw=sessionStorage.getItem(`tidewater-camp-transfer:${campTransfer}`);
    if(raw){const transfer=JSON.parse(raw),next=validatePlan(transfer.plan),savedBeforeTransfer=await readDraft(),backup=savedBeforeTransfer?.plan?validatePlan(savedBeforeTransfer.plan):clone(plan),db=await dbPromise;
      await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({plan:backup,savedAt:new Date().toISOString()},`camp-backup:${campTransfer}`);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      commit(next,'已引入营地布局，原草案已备份；可以撤销');await persist();sessionStorage.removeItem(`tidewater-camp-transfer:${campTransfer}`);
    }
    $('camp-transfer-banner').hidden=false;
    $('camp-restore-draft').addEventListener('click',async()=>{try{const db=await dbPromise,backup=await new Promise((resolve,reject)=>{const req=db.transaction('drafts').objectStore('drafts').get(`camp-backup:${campTransfer}`);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(!backup?.plan)throw new Error('未找到备份草案。');commit(validatePlan(backup.plan),'原草案已恢复，营地提案保持');await persist();$('camp-transfer-banner').hidden=true;}catch(e){toast(e.message,true);}});
  }catch(e){toast(`营地布局未导入：${e.message}`,true);}
}
