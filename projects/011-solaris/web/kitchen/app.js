import { History, initialState, validateState, clone, TEMPLATES, MAX_ITEMS, BOWL, VIEWS, cameraForView, canDrop, addItem, removeItem, beginInspection } from './core.js';
import { createKitchen } from './scene.js';
import { createKitchenPhysics } from './physics.js';

const $ = id => document.getElementById(id);
const STORE = 'atelier-kitchen-workspace-v1';
const checks = createKitchenPhysics();
function checked(value) { const next = validateState(value); checks.reset(next.items); return next; }
let restored = initialState(), storageAvailable = true;
try { const saved = localStorage.getItem(STORE); if (saved) restored = checked(JSON.parse(saved)); } catch { storageAvailable = false; }
const history = new History(restored);
let scene, selected = null, activity = 'idle', pointer = null, cameraTimer, toastTimer, cameraGestureActive = false;
const labels = new Map();
for (const [id, t] of Object.entries(TEMPLATES)) {
  const label = document.createElement('span'); label.className = 'source-label'; label.textContent = t.name; label.dataset.source = id;
  $('source-labels').append(label); labels.set(id, label);
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(history.pending?.state ?? history.current)); storageAvailable = true; }
  catch { storageAvailable = false; }
}
const phaseText = { idle: '组合已稳定', dragging: '松开鼠标，放入碗内', settling: '食材落下与碰撞中', rising: '食材缓缓浮起', inspecting: '浮起观察 · 组合保持不变', returning: '沿原路径归位' };
function render() {
  $('phase').textContent = phaseText[activity];
  $('quantity').textContent = `${history.current.items.length} / ${MAX_ITEMS}`;
  $('stage').dataset.phase = activity;
  const item = history.current.items.find(i => i.id === selected);
  if (!item) selected = null;
  $('selection-name').textContent = item ? `${TEMPLATES[item.templateId].name} · ${item.id.split('-')[1]}` : '选一件碗中食材';
  $('inspection-note').textContent = activity === 'inspecting' || activity === 'rising' || activity === 'returning'
    ? '食材暂时浮起，镜头跟随检视。其余食材位置固定；归位后还原姿态与视角。'
    : '点击碗中食材可浮起检视；上方被挡住时，会提示更换对象。';
  $('undo').disabled = history.past.length === 0 && !history.pending;
  $('redo').disabled = history.future.length === 0 || !!history.pending;
  $('inspect').disabled = !item || activity !== 'idle';
  $('return').disabled = !['rising', 'inspecting'].includes(activity);
  $('cancel').disabled = activity === 'idle' && !history.pending;
  $('cancel').textContent = ['dragging','settling'].includes(activity) ? '取消投放 · Esc' : '取消观察 · Esc';
  $('remove').disabled = !item || activity !== 'idle';
  $('clear').disabled = !history.current.items.length || activity !== 'idle';
  document.querySelectorAll('[data-add]').forEach(b => b.disabled = activity !== 'idle' || history.current.items.length >= MAX_ITEMS);
  document.querySelectorAll('[data-view]').forEach(b => { b.disabled = activity !== 'idle'; b.setAttribute('aria-pressed', String(history.current.view === b.dataset.view)); });
  const list = $('item-list'); list.replaceChildren();
  for (const i of history.current.items) {
    const button = document.createElement('button'); button.className = 'ingredient-row'; button.type = 'button';
    button.dataset.item = i.id; button.setAttribute('aria-pressed', String(i.id === selected));
    const name = document.createElement('span'); name.textContent = TEMPLATES[i.templateId].name;
    const number = document.createElement('small'); number.textContent = `#${i.id.split('-')[1]}`;
    button.append(name, number); button.disabled = activity !== 'idle';
    button.addEventListener('click', () => { selected = i.id; render(); }); list.append(button);
  }
}
function setActivity(value) { activity = value; scene?.setInteractionEnabled(value === 'idle' || value === 'dragging'); render(); }
function finishCamera() {
  clearTimeout(cameraTimer);
  if (history.pending?.label !== '调整餐桌视角') return;
  history.current.camera = scene.getCamera(); history.current.view = 'custom';
  try { history.commit(); persist(); } catch (error) { scene.apply(history.current); toast(error.message); } render();
}
function cancelActivity({ announce = false } = {}) {
  clearTimeout(cameraTimer); pointer = null; cameraGestureActive = false;
  const cancellingCamera = history.pending?.label === '调整餐桌视角';
  scene?.cancelInspection(false);
  history.cancel(); scene?.apply(history.current); if(cancellingCamera)scene?.cancelCamera(history.current.camera); setActivity('idle'); persist();
  if (announce) toast('已恢复操作前的稳定组合');
}
function inspect(id = selected) {
  if (activity !== 'idle' || !id) return;
  finishCamera(); selected = id;
  try { const session = beginInspection(history.current, id); setActivity('rising'); scene.startInspection(session); }
  catch (error) { render(); toast(error.message); }
}
function startSettlement(next, label) {
  if (!history.pending) history.begin(label);
  history.current = next; setActivity('settling');
  try { scene.settle(next.items); } catch (error) { cancelActivity(); toast(error.message); }
}
try {
  scene = await createKitchen($('stage'), {
    projectSource(id, x, y, visible) { const label = labels.get(id); label.style.transform = `translate(${x}px,${y + 25}px) translate(-50%,0)`; label.hidden = !visible; },
    pointerDown(event, hit) {
      if (activity !== 'idle') return false;
      finishCamera();
      if (hit.kind === 'source' && history.current.items.length >= MAX_ITEMS) { toast('碗中最多支持 16 件食材，请先移除一件'); return true; }
      pointer = { hit, x: event.clientX, y: event.clientY, dragging: false, point: null };
      if (hit.kind === 'item') selected = hit.id; render(); return true;
    },
    pointerMove(event) {
      if (!pointer) return;
      if (!pointer.dragging && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y) > 6) {
        pointer.dragging = true; history.begin(pointer.hit.kind === 'source' ? '拖入食材' : '移动食材'); setActivity('dragging');
      }
      if (!pointer.dragging) return;
      const point = scene.dropPoint(event.clientX,event.clientY); pointer.point = point;
      if (point) scene.showPreview(pointer.hit.templateId, [point[0], BOWL.dropPlaneY, point[2]], { hideId:pointer.hit.kind === 'item' ? pointer.hit.id : null, valid:canDrop(pointer.hit.templateId,point) });
    },
    pointerUp(event) {
      if (!pointer) return;
      const gesture = pointer; pointer = null;
      if (!gesture.dragging) { if (gesture.hit.kind === 'item') inspect(gesture.hit.id); else toast('按住案板上的食材，拖到碗口内松开'); return; }
      const point = scene.dropPoint(event.clientX,event.clientY);
      if (!point || !canDrop(gesture.hit.templateId,point)) { cancelActivity(); toast('落点需在碗口内，已恢复原组合'); return; }
      const position = [point[0], BOWL.dropPlaneY, point[2]];
      try {
        let next;
        if (gesture.hit.kind === 'source') { next = addItem(history.current,gesture.hit.templateId,{position,quaternion:[0,0,0,1]}); selected=next.items.at(-1).id; }
        else { next=clone(history.current);next.items.find(i=>i.id===gesture.hit.id).position=position; }
        startSettlement(next,history.pending.label);
      } catch(error) { cancelActivity();toast(error.message); }
    },
    pointerCancel() { if (pointer || history.pending?.label !== '调整餐桌视角') cancelActivity(); },
    settled(items) {
      try { history.current.items=items; history.commit(); persist(); setActivity('idle'); toast('食材已稳定；这次拖放可一步撤销'); }
      catch (error) { cancelActivity(); toast(error.message); }
    },
    failed(message) { cancelActivity(); toast(`${message}。组合已恢复。`); },
    inspectionHeld() { setActivity('inspecting'); },
    inspectionEnd() { setActivity('idle'); toast('已精确归位，原组合没有改变'); },
    cameraStart(kind) { if (activity === 'idle') { cameraGestureActive=kind==='pointer';clearTimeout(cameraTimer); history.begin('调整餐桌视角'); } },
    cameraChange(value) { if(activity !== 'idle')return; if(!history.pending)history.begin('调整餐桌视角');history.current.camera=value;history.current.view='custom';clearTimeout(cameraTimer);if(!cameraGestureActive)cameraTimer=setTimeout(finishCamera,220); },
    cameraEnd(value,kind) { cameraGestureActive=false;if(activity!=='idle')return;if(kind==='pointer')finishCamera();else{clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,220);} },
  });
  scene.apply(history.current); $('loading').hidden = true; render();
  if (!storageAvailable) toast('本地存储不可用或旧记录无效，可使用 JSON 备份保存');
} catch (error) { $('loading').textContent = `场景未能载入：${error.message}。请检查本地资产后刷新。`; throw error; }

$('inspect').addEventListener('click', () => inspect());
$('return').addEventListener('click', () => { if (['rising','inspecting'].includes(activity)) { setActivity('returning');scene.returnInspection(); } });
$('cancel').addEventListener('click', () => cancelActivity({announce:true}));
$('undo').addEventListener('click', () => { const unfinished=!!history.pending;cancelActivity();if(unfinished){toast('已撤销当前未完成操作');return;}if(history.undo()){scene.apply(history.current);persist();render();toast('已撤销整个操作');} });
$('redo').addEventListener('click', () => { cancelActivity();if(history.redo()){scene.apply(history.current);persist();render();toast('已重做');} });
$('remove').addEventListener('click', () => { if(activity!=='idle'||!selected)return;finishCamera();const next=removeItem(history.current,selected);selected=null;startSettlement(next,'移除食材'); });
$('clear').addEventListener('click', () => { if(activity!=='idle')return;finishCamera();history.edit('清空备料碗',s=>{s.items=[];});selected=null;scene.apply(history.current);persist();render();toast('备料碗已清空，可撤销恢复'); });
document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
  if(activity!=='idle')return;finishCamera();
  try { const next=addItem(history.current,button.dataset.add,{position:[0,BOWL.dropPlaneY,0],quaternion:[0,0,0,1]});selected=next.items.at(-1).id;startSettlement(next,'辅助投放食材'); }
  catch(error){toast(error.message);}
}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  if(activity!=='idle')return;finishCamera();history.edit('切换餐桌视角',s=>{s.view=button.dataset.view;s.camera=cameraForView(s.view);});scene.apply(history.current);persist();render();
}));
$('save').addEventListener('click', () => { if(activity==='settling'||activity==='dragging'){toast('请等待食材稳定，或取消当前拖放后保存');return;}finishCamera();persist();toast(storageAvailable?'稳定组合与视角已保存；浮起观察不会写入存档':'本地存储不可用，请使用 JSON 备份'); });
$('backup').addEventListener('click', () => { if(activity!=='idle')cancelActivity();finishCamera();$('json-text').value=JSON.stringify(history.current,null,2);$('json-message').textContent='仅保存稳定组合、实例编号和相机；完整文件导入会检查容器边界及碰撞包络。';$('json-dialog').showModal(); });
$('import-json').addEventListener('click', () => {
  try { const text=$('json-text').value;if(new TextEncoder().encode(text).length>65536)throw new Error('工作区文件不得超过 64 KiB');const next=checked(JSON.parse(text));history.edit('导入料理组合',()=>next);scene.apply(history.current);persist();selected=null;render();$('json-message').textContent='导入成功。可撤销恢复之前的组合。'; }
  catch(error){$('json-message').textContent=`未导入：${error.message}`;}
});
$('close-json').addEventListener('click', () => $('json-dialog').close());
function download(name, content, type='application/json') { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
$('download-json').addEventListener('click', () => { try {const next=checked(JSON.parse($('json-text').value));download('atelier-kitchen.json',JSON.stringify(next,null,2));}catch(error){$('json-message').textContent=error.message;} });
$('snapshot').addEventListener('click', () => { if(activity==='settling'||activity==='dragging'){toast('请先等待稳定，或取消当前拖放');return;}finishCamera();$('snapshot-image').src=scene.screenshot();$('snapshot-dialog').showModal(); });
$('close-snapshot').addEventListener('click', () => $('snapshot-dialog').close());
$('download-snapshot').addEventListener('click', () => { const a=document.createElement('a');a.href=$('snapshot-image').src;a.download='atelier-kitchen.jpg';a.click(); });
window.addEventListener('keydown', event => {
  if(event.key==='Escape'&&!$('json-dialog').open&&!$('snapshot-dialog').open){if(activity!=='idle'||history.pending){cancelActivity({announce:true});event.preventDefault();}}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!['TEXTAREA','INPUT'].includes(document.activeElement?.tagName)){event.preventDefault();(event.shiftKey?$('redo'):$('undo')).click();}
});
window.addEventListener('blur', () => { if(pointer||activity==='dragging'||history.pending)cancelActivity();scene.abortPointer(); });
window.addEventListener('pagehide', () => persist());
