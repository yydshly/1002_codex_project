import { History, SWATCHES, WALLS, initialProject, definition, dimensions, sceneObjects, clone, updateObject, worldPosition, parseCommand, validateProject, scaleLimits, resizeObject, duplicateObject, removeObject, restoreObject, replaceTable, GUIDE_STEPS, advanceGuide } from './core.js';
import { createStudio, ART_IMAGES } from './scene.js';

const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'atelier-workspace-v1', materialNames = { original: '原始', linen: '亚麻', weave: '提花' };
const paths = {
  undo:'M8 6 3 11l5 5M3 11h11a6 6 0 0 1 0 12',redo:'m16 6 5 5-5 5M21 11H10a6 6 0 0 0 0 12',compare:'M3 5h18v14H3zM12 5v14',save:'M5 3h13l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8',layers:'m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6',palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10zM7 8h.01M6 13h.01M11 6h.01M16 7h.01',room:'m3 8 9-5 9 5v11l-9 3-9-3zM3 8l9 5 9-5M12 13v9',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01',book:'M3 4h6l3 3 3-3h6v15h-6l-3 2-3-2H3zM12 7v14',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',cursor:'M5 3v17l5-5 4 7 3-2-4-6h7z',move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',rotate:'M20 8a8 8 0 1 0 0 8M20 3v6h-6',scale:'M4 10V4h6M14 4h6v6M20 14v6h-6M10 20H4v-6M4 4l6 6M20 20l-6-6',ruler:'m3 16 13-13 5 5L8 21zM7 12l3 3M10 9l2 2M13 6l3 3',top:'M3 3h18v18H3zM8 3v18M8 12h13',focus:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M12 8v8M8 12h8',camera:'M3 7h4l2-3h6l2 3h4v14H3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8',terminal:'m5 6 5 6-5 6M13 18h6',reset:'M4 10a8 8 0 1 1 1 7M4 4v6h6',lamp:'M9 3h6l4 8H5zM12 11v8M8 21h8',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',upload:'M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4',sofa:'M4 12V7h16v5M2 12h4v7h12v-7h4v8H2zM5 20v2M19 20v2',chair:'M6 3h12v10H6zM4 12v5h16v-5M6 17v5M18 17v5',table:'M3 7h18v4H3zM5 11v10M19 11v10',plant:'M8 16h8l-1 6H9zM12 16V5M12 10C4 11 3 3 3 3c8 0 9 7 9 7M12 13c8 0 9-9 9-9-8 0-9 9-9 9',art:'M3 4h18v16H3zM7 15l4-5 3 3 2-2 3 4M7 8h.01',rug:'M4 5h16v14H4zM1 6h3M1 10h3M1 14h3M1 18h3M20 6h3M20 10h3M20 14h3M20 18h3'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.room}"/></svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
let history = new History(initialProject()), slots = { a: null, b: null }, selected = 'sofa', tool = 'select', studio, drag = null, changedSinceSave = false;
let saveTimer, toastTimer, storageUnavailable = false, ready = false;
try {
  const cached = localStorage.getItem(KEY);
  if (cached) { const data = JSON.parse(cached); history.replace(data.project); for (const key of ['a', 'b']) if (data.slots?.[key]) slots[key] = validateSlot(data.slots[key]); }
} catch (error) { storageUnavailable = true; }

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3300); }
function validateSlot(slot) { if(typeof slot.thumbnail!=='string'||slot.thumbnail.length>2000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(slot.thumbnail))throw Error('方案缩略图无效');return {project:validateProject(slot.project),thumbnail:slot.thumbnail,date:typeof slot.date==='string'?slot.date.slice(0,30):'已导入'}; }
function cameraState() { if (studio) history.current.camera = studio.getCamera(); }
function persist(explicit = false) {
  clearTimeout(saveTimer); cameraState();
  try { localStorage.setItem(KEY, JSON.stringify({ project: history.current, slots })); changedSinceSave = false; storageUnavailable = false; $('#save-state').innerHTML = '<i></i>已保存在本机'; if (explicit) toast('方案已保存在此浏览器'); return true; }
  catch (error) { storageUnavailable = true; $('#save-state').textContent = '本地存储不可用'; if (explicit) toast('保存失败，请通过项目菜单导出文件备份'); return false; }
}
function markChanged() { changedSinceSave = true; $('#save-state').innerHTML = '<i></i>正在保存…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => persist(), 650); }
function edit(label, fn, applyCamera = false) {
  finishDrag(false); cameraState();
  try { const changed = history.run(label, p => { const before=JSON.stringify(p); fn(p); if(JSON.stringify(p)!==before)advanceGuide(p,label); }); studio?.apply(history.current, applyCamera); sync(); if (changed) markChanged(); return changed; }
  catch (error) { toast(error.message); return false; }
}
function select(id) { if (!definition(id, history.current) || history.current.objects[id]?.hidden) return; finishDrag(false); selected = id; studio?.select(id); sync(); inspector('object'); if (innerWidth < 900) $('#library').classList.remove('open'); }
function setTool(value) {
  finishDrag(false); tool = value; studio?.clearMeasure(); $('#measure-label').hidden = true;
  $$('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  toolHint();
  if (studio) studio.renderer.domElement.style.cursor = tool === 'select' ? 'default' : 'crosshair';
}
function toolHint(blocked = false) {
  $('#interaction-hint').textContent = blocked ? (tool === 'scale' ? '空间不足，先移动附近家具再放大' : '位置被家具占用，向空处移动') : { select:'点击选择 · 拖动空白旋转视角 · 滚轮缩放',move:'拖动对象移动 · Esc 取消 · 空白处调整视角',rotate:'水平拖动对象旋转 · Esc 取消',scale:'在对象上上下拖动调整大小 · 右侧滑块精调 · Esc 取消',measure:'点击地面两个点 · 再次点击开始新测量' }[tool];
}
function inspector(name) { $$('[data-inspector]').forEach(b => { const active = b.dataset.inspector === name; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); }); $$('[data-inspector-panel]').forEach(p => p.hidden = p.dataset.inspectorPanel !== name); }
function panel(name) {
  const already = $(`[data-panel="${name}"]`).classList.contains('active');
  $$('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name)); $$('[data-library]').forEach(p => p.hidden = p.dataset.library !== name);
  if (innerWidth < 900) $('#library').classList.toggle('open', !already || !$('#library').classList.contains('open'));
}
function fabricTarget() { if (definition(selected, history.current)?.fabric) return true; const target = sceneObjects(history.current).find(d => d.fabric); if (!target) { toast('请先恢复一件坐具'); return false; } select(target.id); return true; }
function material(value) { if (fabricTarget()) edit('更换材质', p => updateObject(p, selected, { material: value })); }
function color(value) { if (fabricTarget()) edit('更换颜色', p => updateObject(p, selected, { color: value })); }
const objectName = def => `${def.name}${def.id.includes('-') ? ' · '+def.id.split('-')[1] : ''}`;
let listSignature = '';
function refreshObjects(force = false) {
  const p = history.current, query = $('#object-search').value.trim(), defs = sceneObjects(p, true), signature = JSON.stringify([query, defs.map(d => [d.id, d.name, p.objects[d.id].hidden])]);
  if (!force && signature === listSignature) return; listSignature = signature;
  const list = $('#object-list'), removed = $('#removed-list'); list.replaceChildren(); removed.replaceChildren();
  for (const def of defs) {
    if (p.objects[def.id].hidden) { const b = document.createElement('button'); b.textContent = `恢复${objectName(def)}`; b.addEventListener('click', () => { if (edit('恢复已移除对象', state => restoreObject(state, def.id))) select(def.id); }); removed.append(b); continue; }
    if (!`${objectName(def)}${def.type}`.includes(query)) continue;
    const b = document.createElement('button'); b.className = 'object-item'; b.dataset.select = def.id; b.setAttribute('aria-label', `选择${objectName(def)}`);
    b.innerHTML = `<span class="object-icon">${icon(def.kind)}</span><div><strong>${objectName(def)}</strong><small>${def.type}${def.parent ? ' · 茶几上的灯' : ''}</small></div><span class="object-selected"></span>`;
    b.addEventListener('click', () => select(def.id)); list.append(b);
  }
  if (!list.children.length) { const note = document.createElement('p'); note.className = 'empty-results'; note.textContent = query ? '没有找到这个对象' : '可在下面恢复已移除对象'; list.append(note); }
  const count = sceneObjects(p).length, removedCount = defs.length - count;
  $('#object-count').textContent = String(count).padStart(2, '0'); $('#removed-objects').hidden = !removedCount; $('#removed-count').textContent = `已移除的对象 · ${removedCount}`;
}
function sync() {
  const p = history.current;
  if (!p.objects[selected] || p.objects[selected].hidden) { selected = sceneObjects(p)[0]?.id || null; studio?.select(selected); }
  refreshObjects(); $('#project-name').textContent = p.name;
  $('#guide-card').hidden=!p.guide.enabled;
  $('#guide-progress').textContent='已完成 '+p.guide.completed.length+' / '+GUIDE_STEPS.length+' · 自动保存在本机';
  const next=GUIDE_STEPS.find(s=>!p.guide.completed.includes(s.id));
  $('#guide-steps').innerHTML=GUIDE_STEPS.map(s=>'<li class="'+(p.guide.completed.includes(s.id)?'done':s===next?'current':'')+'"><span>'+ (p.guide.completed.includes(s.id)?'✓':'○')+'</span>'+s.name+'</li>').join('');
  $('#guide-hint').textContent=next?next.hint:'你的第一份方案已完成。可以继续探索，进度会随项目保存。';
  $('#object-controls').hidden = !selected; $('#empty-selection').hidden = !!selected; $('#focus').disabled = !selected;
  $$('[data-select]').filter(b => !b.classList.contains('object-item')).forEach(b => b.disabled = !!p.objects[b.dataset.select]?.hidden);
  if (selected) {
  const value = p.objects[selected], def = definition(selected, p), size = dimensions(p, selected);
  $('#selected-name').textContent = objectName(def); $('#selected-type').textContent = def.type; $('#selected-icon').innerHTML = icon(def.kind);
  $('#position-x').value = value.x.toFixed(2); $('#position-z').value = (def.wall ? value.y : value.z).toFixed(2); $('#z-label span').textContent = def.wall ? 'Y' : 'Z';
  $('#position-z').setAttribute('aria-label', def.wall ? '对象 Y 位置' : '对象 Z 位置');
  $('#rotation').value = Math.round(value.rotation * 180 / Math.PI); $('#rotation').disabled = def.wall; $('#rotation-output').textContent = `${Math.round(value.rotation * 180 / Math.PI)}°`;
  const limits = scaleLimits(p, selected);
  $('#scale').disabled = !def.scalable; $('#scale').max = Math.round(limits.max * 100); $('#scale').min = Math.round(limits.min * 100); $('#scale').value = Math.round(value.scale * 100); $('#scale-output').textContent = `${Math.round(value.scale * 100)}%`;
  for (const [axis, key] of [['x','width'],['z','depth'],['y','height']]) $('#dimension-'+axis).value = size[key].toFixed(2);
  $('#dimension-label').textContent = '宽、深、高可独立调整 · 各轴 50–150%';
  $('#fabric-group').hidden = !def.fabric; $('#art-group').hidden = def.kind !== 'art'; $('#lamp-group').hidden = def.kind !== 'lamp'; $('#table-group').hidden = def.kind !== 'table';
  $('#duplicate-object').disabled = !!def.parent;
  $$('[data-table-variant]').forEach(b => b.classList.toggle('active', b.dataset.tableVariant === value.variant));
  if (def.fabric) { $('#material-name').textContent = materialNames[value.material]; $('#color-name').textContent = SWATCHES.find(s => s.id === value.color).name; }
  $$('.object-item').forEach(b => b.classList.toggle('active', b.dataset.select === selected));
  $$('[data-material]').forEach(b => b.classList.toggle('active', b.dataset.material === value.material));
  $$('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === value.color));
  $$('[data-wall]').forEach(b => b.classList.toggle('active', b.dataset.wall === p.environment.wall));
  $$('[data-art]').forEach(b => b.classList.toggle('active', b.dataset.art === value.artwork && !value.customImage));
  }
  const e = p.environment, time = `${String(Math.floor(e.hour)).padStart(2,'0')}:${String(Math.round((e.hour % 1) * 60)).padStart(2,'0')}`;
  $('#hour').value = e.hour; $('#hour-output').textContent = time; $('#sun-time').textContent = time;
  $('#sun-angle').value = e.sun; $('#sun-output').textContent = `${e.sun}°`; $('#lamp-power').value = e.lampPower; $('#lamp-output').textContent = e.lampPower;
  $('#lamp-switch').setAttribute('aria-pressed', String(e.lampOn)); $('#environment-lamp span:last-child').textContent = `阅读灯已${e.lampOn ? '开启' : '关闭'}`;
  const sunPos = (e.sun + 90) / 180; $('#sun-handle').style.left = `${10 + sunPos * 75}%`; $('#sun-handle').style.top = `${80 - Math.sin(sunPos * Math.PI) * 56}px`;
  $('#undo').disabled = !history.past.length; $('#redo').disabled = !history.future.length;
  for (const key of ['a','b']) {
    const data = slots[key]; $(`[data-load-slot="${key}"]`).disabled = !data;
    $('#date-'+key).textContent = data ? data.date : '尚未保存'; const thumb = $('#thumb-'+key); if (data) { thumb.style.backgroundImage = `url("${data.thumbnail}")`; thumb.querySelector('span').hidden = true; }
    else { thumb.style.backgroundImage = ''; thumb.querySelector('span').hidden = false; }
  }
}
function buildLibrary() {
  $('#object-search').addEventListener('input', () => { refreshObjects(true); sync(); }); sync();
  const desc = { original:'保留模型原有纹理', linen:'细密纤维 · 柔和哑光', weave:'立体织纹 · 丰富层次' };
  $('#material-library').innerHTML = Object.keys(materialNames).map(key => `<button class="material-card" data-material="${key}"><span class="material-texture ${key}"></span><span><strong>${materialNames[key]}</strong><small>${desc[key]}</small></span></button>`).join('');
  $('#material-options').innerHTML = Object.keys(materialNames).map(key => `<button class="material-option" data-material="${key}" aria-label="${materialNames[key]}材质"><span class="material-texture ${key}"></span><small>${materialNames[key]}</small></button>`).join('');
  $$('[data-material]').forEach(b => b.addEventListener('click', () => material(b.dataset.material)));
  $('#library-colors').innerHTML = SWATCHES.map(s => `<button class="swatch-card" data-color="${s.id}" style="--swatch:${s.color}" aria-label="${s.name}"><span></span><small>${s.name}</small></button>`).join('');
  $('#object-colors').innerHTML = SWATCHES.map(s => `<button class="color-swatch" data-color="${s.id}" style="--swatch:${s.color}" title="${s.name}" aria-label="${s.name}"></button>`).join('');
  $$('[data-color]').forEach(b => b.addEventListener('click', () => color(b.dataset.color)));
  $('#wall-colors').innerHTML = WALLS.map((s,i) => `<button class="color-swatch" data-wall="${s}" style="--swatch:${s}" aria-label="${['暖灰泥','浅苔绿','砂岩','暖白'][i]}墙面" title="${['暖灰泥','浅苔绿','砂岩','暖白'][i]}"></button>`).join('');
  $$('[data-wall]').forEach(b => b.addEventListener('click', () => edit('墙面换色', p => p.environment.wall = b.dataset.wall)));
}
buildLibrary();
$$('[data-panel]').forEach(b => b.addEventListener('click', () => panel(b.dataset.panel)));
$$('[data-inspector]').forEach(b => b.addEventListener('click', () => inspector(b.dataset.inspector)));
$$('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$$('[data-select]').filter(b => !b.classList.contains('object-item')).forEach(b => b.addEventListener('click', () => select(b.dataset.select)));

function commitEdit() {
  if(history.pending && JSON.stringify(history.pending.before)!==JSON.stringify(history.current)) advanceGuide(history.current,history.pending.label);
  return history.commit();
}
function finishDrag(commit = true) {
  if (sunDrag !== null) finishSunDrag(commit);
  if (!drag) return; const had = drag; drag = null;
  if (commit) { if (commitEdit()) markChanged(); } else history.cancel();
  if (commit && had.blocked) toast(tool === 'scale' ? '空间不足，先移动附近家具再放大' : '位置被其他家具占用');
  if (studio) { studio.controls.enabled = true; studio.apply(history.current); try { studio.renderer.domElement.releasePointerCapture(had.pointer); } catch {} }
  sync();
}
function wireCanvas() {
  const canvas = studio.renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (tool === 'measure') { const p = studio.planePoint(event.clientX,event.clientY); if (!p || Math.abs(p.x) > 3 || Math.abs(p.z) > 2.5) return; event.stopImmediatePropagation(); studio.controls.enabled = false; studio.setMeasure(p); canvas.setPointerCapture(event.pointerId); return; }
    const id = studio.pick(event.clientX,event.clientY);
    if (!id) { if (innerWidth < 900) $('#library').classList.remove('open'); return; }
    select(id); if (tool === 'select') return;
    event.stopImmediatePropagation(); studio.controls.enabled = false; canvas.setPointerCapture(event.pointerId);
    const def = definition(id, history.current); if (tool === 'scale' && !def.scalable) { toast('这个对象暂不支持缩放'); studio.controls.enabled = true; return; }
    if (tool === 'rotate' && def.wall) { toast('挂画保持贴墙，可使用移动或缩放工具'); studio.controls.enabled = true; return; }
    cameraState(); history.begin({ move:'移动对象',rotate:'旋转对象',scale:'调整尺寸' }[tool]);
    drag = { pointer:event.pointerId, id, startX:event.clientX, startY:event.clientY, start:clone(history.current.objects[id]), point:studio.planePoint(event.clientX,event.clientY,id), moved:false };
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const def = definition(drag.id, history.current), patch = {}, dx = event.clientX-drag.startX, dy = event.clientY-drag.startY;
    if (tool === 'move') { const point = studio.planePoint(event.clientX,event.clientY,drag.id); if (!point || !drag.point) return; let x=point.x-drag.point.x,z=point.z-drag.point.z;
      if (def.parent) { const parent = history.current.objects[def.parent]; const c=Math.cos(parent.rotation),s=Math.sin(parent.rotation); [x,z]=[(x*c-z*s)/(parent.scale*parent.stretch.x),(x*s+z*c)/(parent.scale*parent.stretch.z)]; }
      patch.x=drag.start.x+x; if (def.wall) patch.y=drag.start.y+point.y-drag.point.y; else patch.z=drag.start.z+z;
    } else if (tool === 'rotate') patch.rotation=drag.start.rotation+dx*.009;
    else if (tool === 'scale') patch.scale=drag.start.scale*Math.exp(-dy*.006);
    const result = updateObject(history.current,drag.id,patch); drag.blocked = result.blocked; toolHint(result.blocked); if (!result.blocked) drag.moved ||= result.changed;
    studio.apply(history.current); sync();
  }, true);
  canvas.addEventListener('pointerup', event => { if (drag?.pointer===event.pointerId) finishDrag(true); else studio.controls.enabled=true; }, true);
  canvas.addEventListener('pointercancel', () => finishDrag(false), true);
  canvas.addEventListener('lostpointercapture', () => { if (drag) finishDrag(false); studio.controls.enabled=true; }, true);
  studio.controls.addEventListener('end', () => { if (ready && !drag) { cameraState(); markChanged(); } });
}
function bindRange(id, label, mutate) {
  const el = $(id); let active = false;
  const begin = () => { if (active) return; finishDrag(false); cameraState(); history.begin(label); active=true; };
  el.addEventListener('input', () => { begin(); try { mutate(history.current,Number(el.value)); studio?.apply(history.current); sync(); } catch(error){ toast(error.message); } });
  const end = () => { if (!active) return; active=false; if (commitEdit()) markChanged(); sync(); };
  el.addEventListener('change',end); el.addEventListener('blur',end);
  el.addEventListener('keydown',event=>{ if(event.key==='Escape'){active=false;history.cancel();studio?.apply(history.current);sync();} });
}
bindRange('#rotation','旋转对象',(p,v)=>updateObject(p,selected,{rotation:v*Math.PI/180}));
bindRange('#scale','调整尺寸',(p,v)=>{const result=updateObject(p,selected,{scale:v/100});if(result.blocked)toast('空间不足，先移动附近家具再放大');});
bindRange('#hour','调整时间',(p,v)=>p.environment.hour=v);
bindRange('#sun-angle','调整太阳方向',(p,v)=>p.environment.sun=v);
bindRange('#lamp-power','调整阅读灯亮度',(p,v)=>p.environment.lampPower=v);
for (const [selector,key] of [['#position-x','x'],['#position-z','z']]) $(selector).addEventListener('change',()=>{edit('输入对象位置',p=>{const result=updateObject(p,selected,{[key==='z'&&definition(selected,p).wall?'y':key]:Number($(selector).value)}); if(result.blocked) toast('位置被其他家具占用');});});
for (const axis of ['x','y','z']) {
  const el=$('#dimension-'+axis);
  const submit=()=>{const meters=Number(el.value);edit('调整独立尺寸',p=>{const result=resizeObject(p,selected,axis,meters);if(result.blocked)toast('尺寸与附近家具冲突，请先调整位置');});};
  el.addEventListener('change',submit);el.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit();el.blur();}});
}
$('#duplicate-object').addEventListener('click', () => { let id; if (edit('复制对象', p => id = duplicateObject(p, selected))) { select(id); toast('已在附近空位创建副本，可以撤销'); } });
$('#remove-object').addEventListener('click', () => { if (!selected) return; if (edit('移除对象', p => removeObject(p, selected))) toast('已移除，可在左侧恢复或撤销'); });
$$('[data-table-variant]').forEach(b => b.addEventListener('click', () => edit('替换茶几型号', p => replaceTable(p, selected, b.dataset.tableVariant))));
const switchLamp=()=>edit('切换阅读灯',p=>p.environment.lampOn=!p.environment.lampOn);
$('#lamp-switch').addEventListener('click',switchLamp); $('#environment-lamp').addEventListener('click',switchLamp);
$('#reset-object').addEventListener('click',()=>{const initial=initialProject();edit('恢复对象',p=>{const def=definition(selected,p), before=p.objects[selected], base=clone(initial.objects[def.kind]); if(def.kind==='table')replaceTable(p,selected,'glass'); if(selected!==def.kind)Object.assign(base,{x:before.x,y:before.y,z:before.z,parent:before.parent}); const result=updateObject(p,selected,{...base,...(def.kind==='art'?{customImage:null}:{})}); if(result.blocked)throw Error('初始位置被家具占用，请先腾出空间');});});
$('#undo').addEventListener('click',()=>{finishDrag(false);const label=history.undo();if(label){studio?.apply(history.current,true);sync();markChanged();toast(`已撤销：${label}`);}});
$('#redo').addEventListener('click',()=>{finishDrag(false);const label=history.redo();if(label){studio?.apply(history.current,true);sync();markChanged();toast(`已重做：${label}`);}});
$('#save').addEventListener('click',()=>{finishDrag(true);if(persist(true)&&advanceGuide(history.current,'保存方案')){persist();sync();}inspector('versions');});
$('#retry').addEventListener('click',()=>location.reload());
function view(name) { if(!studio)return; finishDrag(false); cameraState(); edit('切换视角',p=>p.camera=name==='top'?{position:[0,10.8,.02],target:[0,0,0]}:initialProject().camera,true); }
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
$('#focus').addEventListener('click',()=>{if(!studio||!selected)return;const pos=worldPosition(history.current,selected),size=dimensions(history.current,selected);edit('聚焦对象',p=>{const d=Math.max(size.width,size.height)*2.5;p.camera={position:[pos.x+d*.9,pos.y+d*.7,pos.z+d],target:[pos.x,pos.y+size.height*.5,pos.z]};},true);});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
$('#snapshot').addEventListener('click',async()=>{if(!studio)return;finishDrag(true);try{const image=await studio.screenshot();$('#snapshot-image').src=image;$('#snapshot-dialog').showModal();const a=document.createElement('a');a.href=image;a.download='atelier-scene.jpg';a.click();toast('场景图片已生成，可在预览中保存');}catch(error){toast('图片生成失败：'+error.message);}});
function preset(kind) { const p=initialProject(); if(kind==='evening'){p.environment.hour=18.5;p.environment.sun=-25;p.environment.lampPower=16;p.objects.sofa.color='clay';p.objects.chair.color='ivory';p.objects.chair.material='linen';p.objects.art.artwork='line';} if(kind==='sage'){p.environment.hour=9;p.environment.sun=-40;p.environment.wall='#c9cfbf';p.objects.sofa.color='sage';p.objects.art.artwork='blue';} return validateProject(p); }
$$('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const name=history.current.name,cam=history.current.camera,guide=clone(history.current.guide);edit('应用场景氛围',p=>Object.assign(p,preset(b.dataset.preset),{name,camera:cam,guide}));toast('已应用氛围，可继续编辑或撤销');}));
$$('[data-save-slot]').forEach(b=>b.addEventListener('click',async()=>{if(!studio)return;finishDrag(true);cameraState();const key=b.dataset.saveSlot,capture=clone(history.current);b.disabled=true;try{const thumbnail=await studio.screenshot(capture,false);slots[key]={project:capture,thumbnail,date:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})};sync();persist();toast(`已存入方案 ${key.toUpperCase()}`);}catch(error){toast('方案保存失败：'+error.message);}finally{b.disabled=false;}}));
$$('[data-load-slot]').forEach(b=>b.addEventListener('click',()=>{const data=slots[b.dataset.loadSlot];if(!data)return;edit('应用保存方案',p=>Object.assign(p,clone(data.project)),true);toast(`已应用方案 ${b.dataset.loadSlot.toUpperCase()}`);}));
async function compare(){if(!studio)return;if(!slots.a||!slots.b){inspector('versions');toast('先将两种设计分别存入方案 A 与 B');return;}finishDrag(true);studio.controls.enabled=false;try{$('#compare-a').src=await studio.screenshot(slots.a.project,true);$('#compare-b').src=await studio.screenshot(slots.b.project,true);$('#compare-name-a').textContent='A · '+slots.a.project.name;$('#compare-name-b').textContent='B · '+slots.b.project.name;$('#compare-overlay').hidden=false;}catch(error){toast('比较失败：'+error.message);studio.controls.enabled=true;}}
$('#compare').addEventListener('click',compare);$('#compare-panel').addEventListener('click',compare);$('#compare-close').addEventListener('click',()=>{$('#compare-overlay').hidden=true;if(studio)studio.controls.enabled=true;});
function commandToggle(open){$('#command-bar').hidden=!open;if(open)$('#command-input').focus();}
$('#command-toggle').addEventListener('click',()=>commandToggle($('#command-bar').hidden));$('#command-close').addEventListener('click',()=>commandToggle(false));
$('#command-bar').addEventListener('submit',event=>{event.preventDefault();try{const cmd=parseCommand($('#command-input').value,selected);if(['color','move'].includes(cmd.kind)&&(!history.current.objects[cmd.id]||history.current.objects[cmd.id].hidden))throw Error('请先恢复这个对象');const changed=edit('文字指令',p=>{if(cmd.kind==='color'){if(!definition(cmd.id,p).fabric)throw Error('请选择沙发或阅读椅换色');updateObject(p,cmd.id,{color:cmd.color});selected=cmd.id;studio?.select(selected);}if(cmd.kind==='move'){const delta={左:[-1,0],右:[1,0],前:[0,1],后:[0,-1]}[cmd.direction];const o=p.objects[cmd.id];const result=updateObject(p,cmd.id,{x:o.x+delta[0]*cmd.distance,z:o.z+delta[1]*cmd.distance});if(result.blocked)throw Error('目标位置被家具占用');selected=cmd.id;studio?.select(selected);}if(cmd.kind==='hour')p.environment.hour=cmd.hour;if(cmd.kind==='lamp')p.environment.lampOn=cmd.on;});if(changed){toast('指令已应用，可以撤销');$('#command-input').value='';commandToggle(false);}}catch(error){toast(error.message);}});
let sunDrag=null; const handle=$('#sun-handle');
function finishSunDrag(commit) { if(sunDrag===null)return;const pointer=sunDrag;sunDrag=null;if(commit){if(commitEdit())markChanged();}else{history.cancel();studio?.apply(history.current);}try{handle.releasePointerCapture(pointer);}catch{}sync(); }
handle.addEventListener('pointerdown',event=>{event.preventDefault();finishDrag(false);cameraState();history.begin('拖动太阳');sunDrag=event.pointerId;handle.setPointerCapture(event.pointerId);});
handle.addEventListener('pointermove',event=>{if(sunDrag!==event.pointerId)return;const rect=$('#sun-preview').getBoundingClientRect();history.current.environment.sun=Math.round(Math.max(-90,Math.min(90,((event.clientX-rect.left)/rect.width-.1)/.75*180-90)));studio?.apply(history.current);sync();});
handle.addEventListener('pointerup',()=>finishSunDrag(true));
handle.addEventListener('pointercancel',()=>finishSunDrag(false));
handle.addEventListener('lostpointercapture',()=>finishSunDrag(false));
$('#art-upload').addEventListener('change',async event=>{const file=event.target.files[0],target=selected;if(!file||definition(target,history.current)?.kind!=='art')return;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15_000_000)throw Error('请选择 15 MB 以内的 JPG、PNG 或 WebP 图片');const image=await createImageBitmap(file);if(image.width*image.height>50000000){image.close();throw Error('图片分辨率过大');}const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=596;const ratio=canvas.width/canvas.height;let sx=0,sy=0,sw=image.width,sh=image.height;if(sw/sh>ratio){sw=sh*ratio;sx=(image.width-sw)/2;}else{sh=sw/ratio;sy=(image.height-sh)/2;}canvas.getContext('2d').drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height);image.close();let data=canvas.toDataURL('image/jpeg',.8);if(data.length>600000)data=canvas.toDataURL('image/jpeg',.55);if(data.length>600000)throw Error('图片过大，请降低分辨率');edit('更换个人画作',p=>updateObject(p,target,{customImage:data}));toast('图片已居中裁切并应用，仅在本机处理');}catch(error){toast(error.message);}event.target.value='';});
for(const id of ['#project-menu','#brand-menu']) $(id).addEventListener('click',()=>{$('#rename-input').value=history.current.name;$('#project-dialog').showModal();});
$('#rename').addEventListener('click',()=>{const name=$('#rename-input').value.trim();if(!name)return;edit('更新项目名称',p=>p.name=name);$('#project-dialog').close();});
$('#guide-start').addEventListener('click',()=>{edit('打开操作引导',p=>p.guide.enabled=true);$('#help-dialog').close();panel('objects');});
$('#guide-close').addEventListener('click',()=>edit('收起操作引导',p=>p.guide.enabled=false));
$('#guide-restart').addEventListener('click',()=>edit('重新开始引导',p=>p.guide.completed=[]));
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#about-button').addEventListener('click',event=>{event.preventDefault();$('#about-dialog').showModal();});
$('#export-project').addEventListener('click',()=>{finishDrag(true);cameraState();const content=JSON.stringify({format:'atelier-project',version:1,project:history.current,slots},null,2);$('#project-json').value=content;$('#export-fallback').hidden=false;download('atelier-project.json',content,'application/json');toast('已开始导出，项目数据也可复制备份');});
$('#copy-project').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#project-json').value);toast('项目数据已复制');}catch{$('#project-json').focus();$('#project-json').select();toast('请按 Ctrl+C 复制选中的项目数据');}});
$('#import-project').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8_000_000)throw Error('项目文件过大');const data=JSON.parse(await file.text());if(data.format!=='atelier-project'||data.version!==1)throw Error('请选择 ATELIER 项目文件');const project=validateProject(data.project);const imported={a:null,b:null};for(const key of ['a','b'])if(data.slots?.[key])imported[key]=validateSlot(data.slots[key]);edit('打开项目文件',p=>Object.assign(p,project),true);slots=imported;sync();persist();$('#project-dialog').close();toast('项目已打开');}catch(error){toast(error.message);}event.target.value='';});
$('#reset-project').addEventListener('click',()=>{edit('恢复初始客厅',p=>Object.assign(p,initialProject()),true);$('#project-dialog').close();toast('已恢复初始客厅，可以撤销');});
document.addEventListener('keydown',event=>{
  const typing=event.target.closest('input,textarea');
  if(event.key==='Escape'){if(drag||sunDrag!==null)finishDrag(false);else if(!$('#compare-overlay').hidden)$('#compare-close').click();else commandToggle(false);return;}
  if(typing||document.querySelector('dialog[open]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'#redo':'#undo').click();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('#save').click();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();if(selected)$('#duplicate-object').click();return;}
  if(event.key==='Delete'){if(selected)$('#remove-object').click();return;}
  const shortcuts={v:'select',g:'move',r:'rotate',s:'scale'};if(shortcuts[event.key.toLowerCase()])setTool(shortcuts[event.key.toLowerCase()]);
  if(event.key==='/'){event.preventDefault();commandToggle(true);}
});
window.addEventListener('blur',()=>finishDrag(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDrag(false);if(ready)persist();}});
window.addEventListener('pagehide',()=>{if(ready)persist();});
async function boot() {
  try {
    studio=await createStudio($('#canvas-host'),{
      progress:(n)=>$('#loading-progress').style.width=`${Math.round(n*100)}%`,
      frame:(pos,measure)=>{const label=$('#selection-label');label.hidden=!pos.visible||!ready||tool==='measure';label.textContent=selected?objectName(definition(selected,history.current)):'';label.style.left=`${Math.max(8,Math.min($('#canvas-host').clientWidth-label.offsetWidth-8,pos.x-label.offsetWidth/2))}px`;label.style.top=`${Math.max(165,pos.y)}px`;const m=$('#measure-label');m.hidden=!measure||tool!=='measure';if(measure){m.textContent=measure.text;m.style.left=`${measure.x}px`;m.style.top=`${measure.y}px`;}} ,
      contextLost:()=>{$('#canvas-error').hidden=false;$('#error-detail').textContent='绘图上下文已丢失。请重新打开，已保存的项目会恢复。';}
    });
    history.replace(history.current);studio.apply(history.current,true);studio.select(selected);wireCanvas();ready=true;$('#loading').hidden=true;
    $('#art-options').innerHTML=Object.entries(ART_IMAGES).map(([key,image])=>`<button class="art-option" data-art="${key}" style="background-image:url('${image}')" aria-label="${{earth:'大地色构成',blue:'蓝色构成',line:'线与圆'}[key]}"></button>`).join('');
    $$('[data-art]').forEach(b=>b.addEventListener('click',()=>edit('更换画作',p=>updateObject(p,selected,{artwork:b.dataset.art,customImage:null}))));
    for(const name of ['day','evening','sage']) $(`[data-preset="${name}"] .scene-art`).style.backgroundImage=`url("${await studio.screenshot(preset(name),false)}")`;
    sync();if(storageUnavailable)toast('无法恢复本地记录，可以导出项目文件备份');
  }catch(error){$('#loading').hidden=true;$('#canvas-error').hidden=false;$('#error-detail').textContent='请确认浏览器支持 WebGL，且本地家具和材质文件已完整构建。'+error.message;console.error(error);}
}
boot();
