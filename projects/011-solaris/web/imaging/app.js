import { History, clone, initialState, validateState, fitView, zoomAt, panView, imagePoint, imageToScreen, screenToImage, measurementLength, calibrate, moveEndpoint } from './core.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#image-canvas'), host = $('#canvas-host'), ctx = canvas.getContext('2d');
const STORAGE = 'atelier-imaging-workspace-v1', histories = new Map(), images = new Map();
let assets = [], activeId = 'hand', tool = 'pan', selected = null, gesture = null, range = null, reference = null;
let viewport = {width: 1, height: 1}, ready = false, wheelTimer, saveTimer, toastTimer;
const history = () => histories.get(activeId), state = () => history().current;
const lengthText = m => { const {value, unit} = measurementLength(state(), m); return `${value.toFixed(1)} ${unit}`; };
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 2600); }
function pack() { return {format: 'atelier-imaging', version: 1, activeId, viewport: {...viewport}, states: Object.fromEntries([...histories].map(([id,h]) => [id,clone(h.pending?.state ?? h.current)]))}; }
function keys(value, expected) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== expected.length || Object.keys(value).some(k => !expected.includes(k))) throw new Error('工作区结构不符合当前版本'); }
function validateWorkspace(raw) {
  keys(raw, ['format','version','activeId','viewport','states']);
  if (raw.format !== 'atelier-imaging' || raw.version !== 1 || !assets.some(a => a.id === raw.activeId)) throw new Error('工作区版本或原片编号无效');
  keys(raw.viewport,['width','height']);
  if (!['width','height'].every(k => Number.isFinite(raw.viewport[k]) && raw.viewport[k] >= 1 && raw.viewport[k] <= 100000)) throw new Error('工作区视口尺寸无效');
  keys(raw.states,assets.map(a=>a.id));
  const next = {...raw, states: {}};
  for (const asset of assets) {
    const s = validateState(raw.states[asset.id]);
    if (s.imageId !== asset.id || s.image.width !== asset.width || s.image.height !== asset.height) throw new Error('原片编号或尺寸不匹配');
    if (s.appearance.brightness < -.8 || s.appearance.contrast < .25 || s.appearance.contrast > 4) throw new Error('显示参数超出当前面板范围');
    next.states[asset.id] = s;
  }
  return next;
}
function applyWorkspace(raw, record = false) {
  const next = validateWorkspace(raw); // Validate every image before changing any state.
  const shifted = Object.fromEntries(assets.map(asset => {const s = clone(next.states[asset.id]); s.view.offsetX = Math.max(-1000000,Math.min(1000000,s.view.offsetX+(viewport.width-next.viewport.width)/2)); s.view.offsetY = Math.max(-1000000,Math.min(1000000,s.view.offsetY+(viewport.height-next.viewport.height)/2)); return [asset.id,validateState(s)];}));
  cancelInteraction();
  for (const asset of assets) { const h = histories.get(asset.id); if (record) h.edit('打开工作区', () => shifted[asset.id]); else h.replace(shifted[asset.id]); }
  activeId = next.activeId; selected = null; reference = null;
}
function persist(explicit = false) {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE,JSON.stringify(pack())); $('#save-status').textContent = '已保存到本机'; if (explicit) toast('视角、校准与测量已保存'); }
  catch { $('#save-status').textContent = '保存空间不足'; toast('本机保存未完成，请复制工作区 JSON 备份'); }
}
function changed() { $('#save-status').textContent = '正在保存…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => persist(), 450); }
function edit(label, fn) { finishWheel(); cancelInteraction(); try { if (history().edit(label,fn)) changed(); refresh(); } catch(error) { toast(error.message); refresh(); } }
function drawLine(m, color, dashed = false, label = '') {
  const a=imageToScreen(state().view,m.a), b=imageToScreen(state().view,m.b);
  ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=1.5; ctx.setLineDash(dashed?[5,4]:[]); ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
  for(const p of [a,b]) {ctx.beginPath();ctx.arc(p.x,p.y,selected===m.id?4:3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#091317';ctx.lineWidth=1;ctx.stroke();}
  if(label){ctx.font='11px system-ui';const w=ctx.measureText(label).width;const x=Math.max(7,Math.min(viewport.width-w-16,(a.x+b.x)/2-w/2));const y=Math.max(19,Math.min(viewport.height-9,(a.y+b.y)/2-10));ctx.fillStyle='#10222bea';ctx.fillRect(x-5,y-13,w+10,19);ctx.fillStyle=color;ctx.fillText(label,x,y);}
  ctx.restore();
}
function draw() {
  if(!ready) return;
  const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewport.width,viewport.height);ctx.fillStyle='#080f13';ctx.fillRect(0,0,viewport.width,viewport.height);
  const s=state(), img=images.get(activeId);ctx.save();ctx.filter=`brightness(${1+s.appearance.brightness}) contrast(${s.appearance.contrast}) invert(${s.appearance.invert?1:0})`;ctx.drawImage(img,s.view.offsetX,s.view.offsetY,s.image.width*s.view.scale,s.image.height*s.view.scale);ctx.restore();
  for(const m of s.measurements)drawLine(m,m.id===selected?'#ffe1a4':'#82d6c5',false,lengthText(m));
  if(s.calibration)drawLine(s.calibration,'#d0b0f0',true,`参考 ${s.calibration.lengthMm} mm`);
  if(gesture?.kind==='new')drawLine({a:gesture.a,b:gesture.b},tool==='calibrate'?'#d0b0f0':'#ffe1a4',true);
  $('#zoom-value').textContent=`${Math.round(s.view.scale*100)}%`;
}
function refresh() {
  if(!ready)return; const s=state(),asset=assets.find(a=>a.id===activeId);
  $('#image-title').textContent=asset.title;$('#image-size').textContent=`${asset.width} × ${asset.height} px`;$('#source-link').href=asset.sourcePage;
  document.querySelectorAll('[data-image]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.image===activeId)));
  $('#brightness').value=s.appearance.brightness*100;$('#contrast').value=s.appearance.contrast*100;$('#brightness-value').textContent=`${Math.round(s.appearance.brightness*100)}`;$('#contrast-value').textContent=`${s.appearance.contrast.toFixed(2)}×`;$('#invert').setAttribute('aria-pressed',String(s.appearance.invert));
  $('#calibration-status').textContent=s.calibration?'手动校准 · mm':'未校准 · px';$('#clear-calibration').hidden=!s.calibration;$('#unit-badge').textContent=s.calibration?'用户参考校准 · mm':'原图坐标 · px';$('#measure-count').textContent=`${s.measurements.length} 条`;$('#undo').disabled=!history().past.length;$('#redo').disabled=!history().future.length;
  const list=$('#measurements');list.replaceChildren();
  if(!s.measurements.length){const p=document.createElement('p');p.className='empty';p.textContent='选择测量工具，在原片上拖出一条线。';list.append(p);}
  for(const m of s.measurements){const row=document.createElement('div');row.className=`measurement-row${selected===m.id?' selected':''}`;const select=document.createElement('button');select.className='select-measure';select.setAttribute('aria-label',`选择测量 ${m.id}`);const strong=document.createElement('strong');strong.textContent=lengthText(m);const small=document.createElement('small');small.textContent=`线段 ${m.id.slice(8)} · 原图坐标`;select.append(strong,small);select.onclick=()=>{selected=m.id;refresh();};const remove=document.createElement('button');remove.className='remove-measure';remove.textContent='×';remove.setAttribute('aria-label',`删除测量 ${m.id}`);remove.onclick=()=>{edit('删除测量',s=>{s.measurements=s.measurements.filter(x=>x.id!==m.id);});if(selected===m.id)selected=null;refresh();};row.append(select,remove);list.append(row);}
  draw();
}
function shiftView(view,next) { view.offsetX=Math.max(-1000000,Math.min(1000000,view.offsetX+(next.width-viewport.width)/2));view.offsetY=Math.max(-1000000,Math.min(1000000,view.offsetY+(next.height-viewport.height)/2)); }
function resize() {
  const box=host.getBoundingClientRect(), next={width:Math.max(1,Math.round(box.width-2)),height:Math.max(1,Math.round(box.height-2))};
  if(ready){cancelInteraction();for(const h of histories.values()){shiftView(h.current.view,next); // Shift all history views consistently, preserving undo after a resize.
    for(const item of [...h.past,...h.future]){shiftView(item.state.view,next);}}}
  viewport=next;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewport.width*dpr);canvas.height=Math.round(viewport.height*dpr);draw();
}
function position(e){const box=canvas.getBoundingClientRect();return{x:e.clientX-box.left,y:e.clientY-box.top};}
function inImage(p){const s=state(),q=screenToImage(s.view,p);return q.x>=0&&q.y>=0&&q.x<=s.image.width&&q.y<=s.image.height;}
function hit(p){const candidates=[...state().measurements].reverse();if(selected)candidates.sort((a,b)=>(a.id===selected?-1:0)-(b.id===selected?-1:0));for(const m of candidates){const a=imageToScreen(state().view,m.a),b=imageToScreen(state().view,m.b);for(const endpoint of ['a','b']){const q=endpoint==='a'?a:b;if(Math.hypot(p.x-q.x,p.y-q.y)<9)return{m,endpoint};}const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2)):0;if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<6)return{m,endpoint:null};}return null;}
function finishWheel(){clearTimeout(wheelTimer);if(history()?.pending&&!gesture&&!range){if(history().commit())changed();refresh();}}
function cancelInteraction(){clearTimeout(wheelTimer);if(gesture){if(canvas.hasPointerCapture(gesture.pointerId))canvas.releasePointerCapture(gesture.pointerId);gesture=null;}range=null;if(history()?.pending)history().cancel();if(ready)refresh();}
canvas.addEventListener('pointerdown',e=>{
  if(!ready||e.button!==0)return;finishWheel();cancelInteraction();canvas.focus();const p=position(e),s=state();
  const target=tool==='measure'?hit(p):null;
  if((tool==='measure'||tool==='calibrate')&&!target&&!inImage(p)){toast('请从原片范围内开始');return;}
  if(target){selected=target.m.id;history().begin('调整测量');gesture={kind:'move',pointerId:e.pointerId,start:p,original:clone(target.m),endpoint:target.endpoint};}
  else if(tool==='measure'||tool==='calibrate'){if(tool==='measure'&&s.measurements.length>=100){toast('最多保留 100 条测量');return;}const q=imagePoint(s.view,p,s.image);gesture={kind:'new',pointerId:e.pointerId,start:p,a:q,b:q};}
  else{history().begin(tool==='zoom'?'拖动缩放':'平移影像');gesture={kind:tool,pointerId:e.pointerId,start:p,view:clone(s.view)};}
  canvas.setPointerCapture(e.pointerId);draw();e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if(!ready)return;const p=position(e),s=state(),q=imagePoint(s.view,p,s.image);$('#coordinate-output').textContent=inImage(p)?`${Math.round(q.x)}, ${Math.round(q.y)} px`:'—';
  if(!gesture){canvas.style.cursor=tool==='pan'?'grab':tool==='zoom'?'ns-resize':hit(p)?'move':'crosshair';return;}
  if(e.pointerId!==gesture.pointerId)return;
  try { if(gesture.kind==='pan')s.view=panView(gesture.view,p.x-gesture.start.x,p.y-gesture.start.y);
  else if(gesture.kind==='zoom')s.view=zoomAt(gesture.view,gesture.start,Math.exp((gesture.start.y-p.y)*.006));
  else if(gesture.kind==='new')gesture.b=q;
  else if(gesture.endpoint)history().current=moveEndpoint(s,gesture.original.id,gesture.endpoint,q);
  else{const start=screenToImage(s.view,gesture.start),now=screenToImage(s.view,p),m=gesture.original;const dx=Math.max(-Math.min(m.a.x,m.b.x),Math.min(s.image.width-Math.max(m.a.x,m.b.x),now.x-start.x)),dy=Math.max(-Math.min(m.a.y,m.b.y),Math.min(s.image.height-Math.max(m.a.y,m.b.y),now.y-start.y));const item=s.measurements.find(x=>x.id===m.id);item.a={x:m.a.x+dx,y:m.a.y+dy};item.b={x:m.b.x+dx,y:m.b.y+dy};}
  draw(); } catch(error) { cancelInteraction();toast(error.message); }
});
canvas.addEventListener('pointerup',e=>{
  if(!gesture||e.pointerId!==gesture.pointerId)return;const g=gesture;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(g.kind==='new'){if(Math.hypot(g.b.x-g.a.x,g.b.y-g.a.y)<1){toast('拖出至少 1 像素的线段');refresh();return;}if(tool==='calibrate'){reference={a:g.a,b:g.b};$('#reference-pixels').textContent=`参考线在原图中的长度：${Math.hypot(g.b.x-g.a.x,g.b.y-g.a.y).toFixed(1)} px`;$('#reference-length').value='';$('#calibration-error').textContent='';$('#calibration-dialog').showModal();$('#reference-length').focus();}else{const used=new Set(state().measurements.map(m=>m.id));let n=1;while(used.has(`measure-${n}`))n++;const id=`measure-${n}`;selected=id;edit('新增测量',s=>{s.measurements.push({id,a:g.a,b:g.b});});}}
  else if(history().commit())changed();refresh();
});
canvas.addEventListener('pointercancel',cancelInteraction);
canvas.addEventListener('lostpointercapture',()=>{if(gesture)cancelInteraction();});
canvas.addEventListener('wheel',e=>{if(!ready||gesture||range)return;e.preventDefault();try {if(!history().pending)history().begin('滚轮缩放');state().view=zoomAt(state().view,position(e),Math.exp(Math.max(-700,Math.min(700,-e.deltaY))*.0015));draw();clearTimeout(wheelTimer);wheelTimer=setTimeout(finishWheel,180);}catch(error){cancelInteraction();toast(error.message);}},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{finishWheel();cancelInteraction();tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#tool-hint').textContent={pan:'拖动平移 · 滚轮围绕指针缩放',zoom:'按住并上下拖动 · 围绕起点缩放',measure:'拖出测量线 · 拖动端点调整 · 拖动线段平移',calibrate:'沿已知参考标尺拖动 · 输入可靠的实际长度'}[tool];canvas.style.cursor=tool==='pan'?'grab':tool==='zoom'?'ns-resize':'crosshair';}));
$('#fit').onclick=()=>edit('适合视口',s=>{s.view=fitView(s.image.width,s.image.height,viewport.width,viewport.height,22);});
$('#actual-size').onclick=()=>edit('原始尺寸',s=>{s.view=zoomAt(s.view,{x:viewport.width/2,y:viewport.height/2},1/s.view.scale);});
for(const id of ['brightness','contrast']){const input=$(`#${id}`);const finish=()=>{if(range===id){range=null;if(history().commit())changed();refresh();}};input.addEventListener('pointerdown',()=>{finishWheel();cancelInteraction();history().begin('调整显示');range=id;});input.addEventListener('input',()=>{const value=Number(input.value)/100;if(range!==id){cancelInteraction();history().begin('调整显示');range=id;}state().appearance[id]=value;draw();$(`#${id}-value`).textContent=id==='contrast'?`${state().appearance.contrast.toFixed(2)}×`:`${Math.round(state().appearance.brightness*100)}`;});input.addEventListener('change',finish);input.addEventListener('keyup',finish);input.addEventListener('blur',finish);}
window.addEventListener('pointerup',()=>{if(range){range=null;if(history().commit())changed();refresh();}});
$('#invert').onclick=()=>edit('反相显示',s=>{s.appearance.invert=!s.appearance.invert;});$('#reset-display').onclick=()=>edit('恢复灰度',s=>{s.appearance={brightness:0,contrast:1,invert:false};});
$('#clear-calibration').onclick=()=>edit('清除校准',s=>{s.calibration=null;});
$('#apply-calibration').onclick=()=>{try{const value=Number($('#reference-length').value);if(!reference||!$('#reference-length').value.trim())throw new Error('请输入可靠的已知参考长度');const next=calibrate(state(),reference.a,reference.b,value);edit('手动校准',()=>next);reference=null;$('#calibration-dialog').close();toast('已应用用户参考长度，当前单位 mm');}catch(error){$('#calibration-error').textContent=error.message;}};
$('#reference-length').addEventListener('keydown',e=>{if(e.key==='Enter')$('#apply-calibration').click();});
function undo(redo=false){finishWheel();cancelInteraction();const did=redo?history().redo():history().undo();if(did){changed();refresh();}}
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);$('#save').onclick=()=>{finishWheel();cancelInteraction();persist(true);};
$('#backup').onclick=()=>{finishWheel();cancelInteraction();$('#configuration').value=JSON.stringify(pack(),null,2);$('#config-error').textContent='';$('#backup-dialog').showModal();};
$('#restore-config').onclick=()=>{try{const value=$('#configuration').value;if(new Blob([value]).size>65536)throw new Error('工作区 JSON 上限为 64 KiB');applyWorkspace(JSON.parse(value),true);changed();refresh();$('#backup-dialog').close();toast('已打开工作区，各原片保留独立记录');}catch(error){$('#config-error').textContent=`无法应用：${error.message}`;}};
$('#download-config').onclick=()=>{const blob=new Blob([JSON.stringify(pack(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='atelier-imaging.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#snapshot').onclick=()=>{finishWheel();cancelInteraction();draw();$('#snapshot-image').src=canvas.toDataURL('image/png');$('#snapshot-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#calibration-dialog').addEventListener('close',()=>reference=null);
window.addEventListener('blur',()=>{if(ready)cancelInteraction();});
document.addEventListener('keydown',e=>{if(!ready)return;if(e.key==='Escape'){cancelInteraction();return;}if(e.target.closest('input,textarea,dialog'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('#save').click();}else if(e.key==='Delete'&&selected){const id=selected;edit('删除测量',s=>{s.measurements=s.measurements.filter(m=>m.id!==id);});selected=null;refresh();}});
async function init(){
  try{const response=await fetch('./assets/imaging/manifest.json');if(!response.ok)throw new Error('原片清单不可用');assets=(await response.json()).assets;
    await Promise.all(assets.map(async asset=>{const img=new Image();img.src=`./assets/imaging/${asset.file}`;await img.decode();if(img.naturalWidth!==asset.width||img.naturalHeight!==asset.height)throw new Error('原片尺寸与清单不一致');images.set(asset.id,img);}));
    resize();for(const asset of assets){const s=initialState(asset.width,asset.height,asset.id);s.view=fitView(asset.width,asset.height,viewport.width,viewport.height,22);histories.set(asset.id,new History(s));const b=document.createElement('button');b.className='image-card';b.dataset.image=asset.id;b.setAttribute('aria-label',`打开${asset.title}`);const img=document.createElement('img');img.src=`./assets/imaging/${asset.file}`;img.alt=asset.title;const div=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=asset.title;small.textContent=`${asset.width} × ${asset.height} · CC0`;div.append(strong,small);b.append(img,div);b.onclick=()=>{finishWheel();cancelInteraction();activeId=asset.id;selected=null;$('#coordinate-output').textContent='—';refresh();changed();};$('#image-library').append(b);}
    let stored=null;try{stored=localStorage.getItem(STORAGE);}catch{toast('本机存储不可用，可使用 JSON 备份工作区');}if(stored){try{applyWorkspace(JSON.parse(stored));$('#save-status').textContent='已恢复本机工作区';}catch{toast('旧工作区无法恢复，已保留原记录并打开原片');}}
    ready=true;$('#loading').hidden=true;refresh();new ResizeObserver(resize).observe(host);
  }catch(error){$('#loading').textContent=`无法准备影像：${error.message}`;}
}
init();
