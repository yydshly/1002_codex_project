import { GARMENTS, SHOES, COLORS, POSES, VIEWS, History, initialState, parseState, serializeState, wearGarment, removeGarment, setColor, wearShoes, removeShoes, setShoeColor, setPose, setView, setCamera, resetState } from './core.js';
import { createFitting } from './scene.js';

const KEY = 'atelier-fitting-room-v2', LEGACY_KEY = 'atelier-fitting-room-v1';
const $ = id => document.getElementById(id);
let restored = initialState(), preservedRaw = false, migrated = false;
try { const current=localStorage.getItem(KEY), raw=current??localStorage.getItem(LEGACY_KEY);if(raw!==null){restored=parseState(raw);migrated=current===null;} }
catch { preservedRaw = true; }
const history = new History(restored);
const nearFoot=state=>state.view==='shoe-detail'||(state.camera.target[1]<=.45&&Math.hypot(...state.camera.position.map((p,i)=>p-state.camera.target[i]))<=3);
let category=nearFoot(restored)||(!restored.garment&&restored.shoes)?'shoes':'garment';
let scene = null, drag = null, external = null, cameraActive = false, cameraTimer = null, toastTimer = null;
const defaults = { 'tee-01': 'ivory', 'jacket-01': 'moss', 'court-01':'ivory', 'boot-01':'ink' };
const garmentName = id => [...GARMENTS,...SHOES].find(g => g.id === id)?.name || '尚未穿上展样';
const colorName = id => COLORS.find(c => c.id === id)?.name || '展示基体';

function notice(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3300); }
function persist(explicit = false) {
  if (preservedRaw && !explicit) { $('save-status').textContent = '旧搭配未覆盖'; return; }
  try { localStorage.setItem(KEY, serializeState(history.pending?.state || history.current)); preservedRaw = false; $('save-status').textContent = '搭配已保存在本机'; }
  catch { $('save-status').textContent = '保存失败，可下载JSON'; }
}
function releaseExternal() {
  const current = external; external = null;
  if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
}
const applyItem=(state,item)=>item.kind==='shoes'?wearShoes(state,item.id,item.color):wearGarment(state,item.id,item.color);
function refresh(changeCamera = false) {
  const active = !!history.pending;
  const preview = !!(drag?.valid && drag.moved);
  const state = preview ? applyItem(history.pending.state, drag) : history.current;
  if (scene) { scene.apply(state, { camera: changeCamera, preview }); scene.setCameraInteraction(!drag && !$('json-dialog').open && !$('snapshot-dialog').open); }
  const slot=category==='shoes'?state.shoes:state.garment;
  Object.assign($('stage').dataset, { ready: String(!!scene), dragActive: String(!!drag), dropValid: String(preview), cameraActive: String(cameraActive), wornId: state.garment?.id || '', pose: state.pose, color: state.garment?.color || '', shoesId:state.shoes?.id||'',shoeColor:state.shoes?.color||'',category,migrated:String(migrated) });
  $('current-garment').textContent = (preview ? '预览 · ' : '') + garmentName(slot?.id);
  $('current-color').textContent=colorName(slot?.color);$('outfit-upper').textContent=state.garment?garmentName(state.garment.id):'上装 · 未选择';$('outfit-shoes').textContent=state.shoes?garmentName(state.shoes.id):'鞋履 · 未选择';
  $('fit-explanation').textContent = preview ? '位置合适。松开鼠标穿上；Esc 或取消会恢复之前的整套搭配。' : category==='shoes' ? slot?'整双鞋已贴合登记脚型。靠近脚部，检查鞋口、后跟与鞋底；上装保持原样。':'拖动台上的一双鞋到人体脚部，左右脚一起穿上；放在上身或空处不会生效。':state.garment ? '衣款已贴合登记人体。检查正面、背面与举臂后的袖腋，再决定保留哪一款。' : '选择一件衣服，拖到人体胸腹区域；在空处松手不会穿上。';
  $('fabric-name').textContent = slot ? colorName(slot.color) : '穿上后可调整';
  $('view-name').textContent = VIEWS[state.view]?.name || '自由观察';
  $('phase').textContent=drag?preview?'位置合适 · 松手穿上':category==='shoes'?'拖向脚部 · Esc 可取消':'拖向上身 · Esc 可取消':slot?`${garmentName(slot.id)} · ${POSES.find(p=>p.id===state.pose).name}`:category==='shoes'?'拖动一双鞋，开始搭配':'拖动一件上装，开始试穿';
  $('drag-feedback').hidden = !drag;
  $('drag-feedback').dataset.valid = String(preview);
  $('drag-message').textContent = drag?.reason || '把衣服移到人体胸腹区域';
  $('drag-detail').textContent=preview?category==='shoes'?'仅替换整双鞋 · 松手完成 · 上装保留':'将替换当前上装 · 松手完成 · Esc 恢复':category==='shoes'?'到脚部才穿上 · 空处松手恢复原搭配':'移到上身才会穿上 · 空处松手恢复原搭配';
  $('step-pick').classList.toggle('active', !!drag); $('step-drop').classList.toggle('active', preview); $('step-wear').classList.toggle('active', !drag && !!slot);
  $('undo').disabled = !scene || !history.canUndo; $('redo').disabled = !scene || !history.canRedo;
  $('inspect-shoes').hidden=category!=='shoes'&&!nearFoot(state);$('inspect-shoes').textContent=nearFoot(state)?'回到总览 ↗':'近看鞋脚 ↗';$('inspect-shoes').disabled=!scene||active;
  $('remove').disabled = !scene || active || !slot; $('cancel-drag').disabled = !drag;
  for (const id of ['snapshot', 'reset']) $(id).disabled = !scene || active;
  for (const id of ['save', 'backup']) $(id).disabled = !scene;
  for (const element of document.querySelectorAll('button[data-wear], button[data-pose], button[data-view], button[data-category]')) element.disabled = !scene || active;
  for (const element of document.querySelectorAll('button[data-color]')) { element.disabled = !scene || active || !slot; element.setAttribute('aria-pressed', String(slot?.color === element.dataset.color)); }
  for (const element of document.querySelectorAll('button[data-pose]')) element.setAttribute('aria-pressed', String(state.pose === element.dataset.pose));
  for (const element of document.querySelectorAll('button[data-view]')) element.setAttribute('aria-pressed', String(state.view === element.dataset.view));
  for(const element of document.querySelectorAll('[data-item]')){element.dataset.worn=String((element.dataset.kind==='shoes'?state.shoes:state.garment)?.id===element.dataset.item);element.setAttribute('aria-disabled',String(!scene||active));}
  for(const element of document.querySelectorAll('button[data-category]'))element.setAttribute('aria-pressed',String(category===element.dataset.category));
  $('garment-options').hidden=category!=='garment';$('shoe-options').hidden=category!=='shoes';$('remove').textContent=category==='shoes'?'脱下整双鞋':'脱下上装';$('step-drop').textContent=category==='shoes'?'02 到脚部':'02 到上身';$('sample-heading').textContent=category==='shoes'?'两双展样':'两款展样';$('slot-description').textContent=category==='shoes'?'左右脚一起替换':'同一上装位置';$('color-heading').textContent=category==='shoes'?'鞋面配色':'面料配色';$('color-description').textContent=category==='shoes'?'只改变鞋面；鞋底、鞋带与金属细节保持原色。':'主面料与同材质胸袋一起换色；包边、缝线与金属保持原色。';$('stage').classList.toggle('footwear-mode',category==='shoes');$('stage-instruction').textContent=nearFoot(state)?category==='shoes'?'近看鞋口、后跟与鞋底。拖空白改变方向；回总览继续拖展样。':'镜头正靠近脚部。回到总览继续拖上装，也可切换鞋履观察。':category==='shoes'?'按住台上的鞋，拖向人体脚部。左右脚一起穿上，再靠近检查。':'按住展样，拖向人体上身。从袖口到背面，检查同一件衣服。';$('caption-title').textContent=category==='shoes'?'同一脚型，两种轮廓':'同一体型，两种剪裁';$('caption-detail').textContent=category==='shoes'?'拖到脚部 · 整双换款 · 近看鞋脚':'拖到上身 · 多方向观察 · 举臂检查';
}
function cancelActive(message = '已取消当前操作，恢复原搭配') {
  clearTimeout(cameraTimer); cameraTimer = null;
  const cameraBaseline = cameraActive ? history.pending?.state.camera : null;
  drag = null; cameraActive = false; scene?.abortPointer(); releaseExternal(); history.cancel();
  if (cameraBaseline) scene?.cancelCamera(cameraBaseline);
  refresh(true); if (message) notice(message);
}
function finishCamera() {
  clearTimeout(cameraTimer); cameraTimer = null;
  if (!cameraActive || scene?.cameraHeld) return;
  cameraActive = false;
  try { history.commit(); persist(); refresh(); }
  catch (error) { refresh(true); notice(error.message); }
}
function edit(label, fn, message = '') {
  if (!scene || drag || scene.cameraHeld) return false;
  finishCamera();
  try { const changed = history.edit(label, fn); refresh(true); if (changed) persist(); if (message) notice(changed ? message : '当前搭配已是这个选择'); return true; }
  catch (error) { refresh(true); notice(error.message); return false; }
}
function beginDrag(value) {
  if (!scene || drag || scene.cameraHeld || $('json-dialog').open || $('snapshot-dialog').open) return false;
  finishCamera(); if (!history.begin(value.kind==='shoes'?'拖动整双鞋到人体脚部':'拖动衣服到人体上身')) return false;
  clearTimeout(toastTimer); $('toast').hidden = true;
  drag = { ...value, valid: false, moved: false, reason:value.kind==='shoes'?'把整双鞋移到人体脚部':'把衣服移到人体胸腹区域' }; refresh(); return true;
}
function endDrag(result) {
  if (!drag) return;
  const current = drag; drag = null; releaseExternal();
  if (result.valid && result.moved) {
    history.current = applyItem(history.pending.state,current);
    const changed = history.commit(); refresh(); if (changed) persist(); notice(changed ? `已穿上${garmentName(current.id)}` : '已穿着同一款、同一颜色');
  } else { history.cancel(); refresh(true); notice(result.moved ? '未放到对应人体区域，已恢复原搭配' : '按住展样拖到对应区域，再松手试穿'); }
}
function travel(direction) {
  if (history.pending) { cancelActive(); return; }
  if (history[direction]()) { refresh(true); persist(); notice(direction === 'undo' ? '已撤销上一项试衣操作' : '已重做试衣操作'); }
}

for (const [index, item] of [...GARMENTS,...SHOES].entries()) {
  const kind=index<2?'garment':'shoes';
  const card = document.createElement('article'); card.className = 'garment-option'; card.dataset.item=item.id;card.dataset.kind=kind;if(kind==='garment')card.dataset.garment=item.id;else card.dataset.shoe=item.id;
  const number = document.createElement('span'); number.className = 'option-number'; number.textContent = `0${index + 1}`;
  const name = document.createElement('strong'); name.textContent = item.name;
  const description = document.createElement('small'); description.textContent = ['短袖 · 圆领 · 袖口与下摆','长袖 · 包边圆口 · 拉链与口袋','低帮 · 系带 · 独立鞋底','短靴 · 鞋口 · 后跟与厚底'][index];
  const button = document.createElement('button'); button.textContent = `穿上 ${item.name}`; button.dataset.wear = item.id;
  button.addEventListener('click', () => edit('穿上展样', state => applyItem(state,{id:item.id,kind,color:defaults[item.id]}), `已穿上${item.name}`));
  const copy = document.createElement('div'); copy.append(name, description); card.append(number, copy, button); $(kind==='shoes'?'shoe-options':'garment-options').append(card);
  card.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('button') || !scene || history.pending) return; event.preventDefault(); if (scene.beginExternal(event, item.id)) { external = { element: card, pointerId: event.pointerId }; card.setPointerCapture(event.pointerId); } });
  card.addEventListener('pointermove', event => { if (external?.element === card && external.pointerId === event.pointerId) scene.updateExternal(event); });
  card.addEventListener('pointerup', event => { if (external?.element === card && external.pointerId === event.pointerId) scene.endExternal(event); });
  card.addEventListener('pointercancel', () => { if (external?.element === card) cancelActive(); });
  card.addEventListener('lostpointercapture', () => { if (external?.element === card) cancelActive(); });
}
for (const item of COLORS) { const button = document.createElement('button'); button.className = 'color-option'; button.dataset.color = item.id; button.setAttribute('aria-label', `配色：${item.name}`); button.title = item.name; const swatch = document.createElement('i'); swatch.style.background = item.color; button.append(swatch); button.addEventListener('click', () => edit('更换面料颜色', state => category==='shoes'?setShoeColor(state,item.id):setColor(state,item.id))); $('color-options').append(button); }
for (const item of POSES) { const button = document.createElement('button'); button.dataset.pose = item.id; button.textContent = item.name; button.addEventListener('click', () => edit('更换人体检查姿态', state => setPose(state, item.id))); $('pose-options').append(button); }
for (const [id, item] of Object.entries(VIEWS)) { const button = document.createElement('button'); button.dataset.view = id; button.textContent = item.name; button.addEventListener('click',()=>{if(id==='shoe-detail'){if(!scene||history.pending)return;category='shoes';scene.setGallery(category);}edit('更换观察方向',state=>setView(state,id));}); $('view-options').append(button); }
$('undo').addEventListener('click', () => travel('undo')); $('redo').addEventListener('click', () => travel('redo'));
for(const button of document.querySelectorAll('button[data-category]'))button.addEventListener('click',()=>{if(history.pending)return;category=button.dataset.category;scene.setGallery(category);refresh();});
$('remove').addEventListener('click',()=>edit('脱下当前展样',category==='shoes'?removeShoes:removeGarment,category==='shoes'?'已脱下整双鞋':'已脱下上装'));
$('inspect-shoes').addEventListener('click',()=>edit('调整鞋脚观察',state=>setView(state,nearFoot(state)?'hero':'shoe-detail')));
$('cancel-drag').addEventListener('click', () => cancelActive());
$('reset').addEventListener('click', () => edit('恢复初始试衣间', resetState, '已恢复初始试衣间，可撤销'));
$('save').addEventListener('click', () => { if (history.pending) cancelActive('保存前已取消未完成操作'); persist(true); notice($('save-status').textContent); });
$('backup').addEventListener('click', () => { if (history.pending) cancelActive('打开备份前已取消未完成操作'); $('json-text').value = JSON.stringify(history.current, null, 2); $('json-message').textContent = '只保存当前稳定搭配；文件不包含真实人物尺寸或购物车。'; $('json-dialog').showModal(); scene.setCameraInteraction(false); });
for (const dialog of document.querySelectorAll('dialog')) { dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => scene?.setCameraInteraction(!drag)); }
$('import-json').addEventListener('click', () => {
  try { const next = parseState($('json-text').value); if (!edit('打开试衣搭配', () => next)) { $('json-message').textContent = '请先松开鼠标，再应用搭配；当前搭配没有改变。'; return; } if(nearFoot(next)){category='shoes';scene.setGallery(category);refresh();}persist(true); $('json-message').textContent = '搭配已应用：上装、整双鞋、配色、姿态与相机已一起恢复。搭配发生变化时可撤销本次打开。'; }
  catch (error) { $('json-message').textContent = `${error.message}；当前搭配没有改变。`; }
});
function download(content, name, type) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('download-json').addEventListener('click', () => download(JSON.stringify(history.current, null, 2), 'atelier-fitting.json', 'application/json'));
$('snapshot').addEventListener('click', () => { if (!scene || history.pending) return; $('snapshot-image').src = scene.screenshot(); $('snapshot-dialog').showModal(); scene.setCameraInteraction(false); });
$('download-snapshot').addEventListener('click', () => { const anchor = document.createElement('a'); anchor.href = $('snapshot-image').src; anchor.download = 'atelier-fitting.png'; anchor.click(); });
$('retry').addEventListener('click', () => location.reload());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && history.pending) { event.preventDefault(); cancelActive(); return; }
  if (event.target.closest('textarea,input,select') || $('json-dialog').open || $('snapshot-dialog').open) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo'); }
});
window.addEventListener('blur', () => { if (history.pending) cancelActive('窗口离开，未完成的操作已取消'); scene?.releaseCamera(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (history.pending) cancelActive('画面离开，未完成的操作已取消'); scene?.releaseCamera(); } });
window.addEventListener('pagehide', () => { if (history.pending) cancelActive(''); persist(); });
refresh();
try {
  scene = await createFitting($('canvas-host'), {
    dragStart: beginDrag,
    dragChange(result) { if (drag) { Object.assign(drag, result); refresh(); } },
    dragEnd: endDrag,
    dragCancel() { if (drag) cancelActive(); },
    cameraStart() { if (!scene || drag || $('json-dialog').open || $('snapshot-dialog').open) return; clearTimeout(cameraTimer); if (!cameraActive && history.begin('调整观察相机')) cameraActive = true; refresh(); },
    cameraChange(value) { if (!cameraActive || drag) return; try { history.current = setCamera(history.current, value); refresh(); } catch { cancelActive('相机已恢复到操作前的位置'); } },
    cameraEnd() { if (cameraActive) { clearTimeout(cameraTimer); cameraTimer = setTimeout(finishCamera, 140); } },
    cameraCancel() { if (cameraActive) cancelActive('相机操作已取消，恢复原视角'); },
    project(id, x, y, visible) { const label=$({'tee-01':'tee-label','jacket-01':'jacket-label','court-01':'court-label','boot-01':'boot-label'}[id]); label.style.left = `${x}px`; label.style.top = `${y}px`; label.hidden = !visible; },
  });
  $('loading').hidden=true;scene.setGallery(category);refresh(true);if(migrated&&!preservedRaw){persist();$('save-status').textContent='旧搭配已延续 · 可试鞋';}if(preservedRaw) notice('保存的旧搭配无法读取，已保留原文件；确认新搭配后可手动保存。');
} catch (error) { $('loading').hidden = true; $('load-error').hidden = false; $('error-detail').textContent = '请检查本地人体、服装和鞋履素材是否完整，然后重新打开。'; console.error('Fitting assets failed', error); }
