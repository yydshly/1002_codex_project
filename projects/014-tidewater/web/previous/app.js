import { ASSET_DEFS, createScene, validateScene, applyOperations, parseInstruction } from './scene-core.js';

const $ = id => document.getElementById(id);
const frame = $('world-frame'), storageKey = 'tidewater-studio.v1';
const clone = value => structuredClone(value);
let scene = createScene(), selectedId = 'lighthouse', ready = false, revision = 0;
const undoStack = [], redoStack = [], records = [];
let toastTimer;
const types = { boat:'原场景渔船', lighthouse:'新增灯塔', cabin:'新增小屋', palm:'新增棕榈' };
const icons = {boat:'◈',lighthouse:'▥',cabin:'⌂',palm:'♧'};
const envFields = {timeOfDay:'time',windSpeed:'wind',swell:'swell',cloudCover:'cloud'};

function toast(message, error=false) {
  clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false;
  $('toast').classList.toggle('is-error',error);
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},error?6500:3500);
}
function api(){return frame.contentWindow?.tidewaterEditor;}
function save(silent=false){
  try { localStorage.setItem(storageKey,JSON.stringify(scene)); if(!silent)toast('场景已保存到当前浏览器'); return true; }
  catch(e){if(!silent)toast('浏览器存储不可用；仍可导出场景文件。',true);return false;}
}
try { const saved=localStorage.getItem(storageKey);if(saved){const candidate=JSON.parse(saved);validateScene(candidate);scene=candidate;} }
catch(e){toast('已忽略无效的本地场景，使用港湾预设。',true);}

function syncWorld(resetCamera=false){
  if(!ready)return;
  const runtime=api();runtime.apply(clone(scene));runtime.select(selectedId);
  if(resetCamera)runtime.camera(scene.camera.preset);
}
function timeLabel(value){const total=Math.round(value*60);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function envOutput(key,value){
  const formats={timeOfDay:timeLabel,windSpeed:v=>`${v} m/s`,swell:v=>Number(v).toFixed(2),cloudCover:v=>`${Math.round(v*100)}%`};
  $(`${envFields[key]}-value`).textContent=formats[key](Number(value));
}
function render(){
  $('scene-name').value=scene.name;$('preset-select').value=scene.preset;
  for(const[key,id]of Object.entries(envFields)){$(`env-${id}`).value=scene.environment[key];envOutput(key,scene.environment[key]);}
  const list=$('object-list');list.replaceChildren();
  for(const item of scene.objects){
    const def=ASSET_DEFS.find(d=>d.id===item.id),button=document.createElement('button');
    button.type='button';button.className='object-item';button.dataset.id=item.id;
    button.classList.toggle('is-selected',item.id===selectedId);button.setAttribute('aria-pressed',String(item.id===selectedId));
    const icon=document.createElement('span');icon.className='object-icon';icon.textContent=icons[def.type];
    const label=document.createElement('span');label.className='object-label';
    const name=document.createElement('span');name.className='object-name';name.textContent=item.name;
    const meta=document.createElement('span');meta.className='object-meta';meta.textContent=item.visible?types[def.type]:'已隐藏';
    label.append(name,meta);button.append(icon,label);
    if(item.locked){const lock=document.createElement('span');lock.className='object-lock';lock.textContent='▣';lock.setAttribute('aria-label','已锁定');button.append(lock);}
    button.addEventListener('click',()=>select(item.id));list.append(button);
  }
  const item=scene.objects.find(o=>o.id===selectedId);
  $('empty-selection').hidden=!!item;$('object-properties').hidden=!item;
  $('selected-name').textContent=item?.name||'未选择对象';
  $('selected-type').textContent=item?types[ASSET_DEFS.find(d=>d.id===item.id).type]:'';
  if(item){
    for(const key of ['x','z','rotation','scale']){$(`obj-${key}`).value=item[key];$(`obj-${key}`).disabled=item.locked;}
    $('obj-visible').checked=item.visible;$('obj-visible').disabled=item.locked;$('obj-locked').checked=item.locked;
  }
  $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;
  document.querySelectorAll('[data-camera]').forEach(button=>{const active=button.dataset.camera===scene.camera.preset;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
  $('scene-status').textContent=revision?`第 ${revision} 次修改 · ${save(true)?'已自动保存':'可导出保存'}`:'场景已就绪 · 本地保存';
  $('state-json').textContent=JSON.stringify(scene,null,2);
  $('change-list').replaceChildren();
  for(const record of records.slice(0,3)){const li=document.createElement('li');li.textContent=record;$('change-list').append(li);}
  if(!records.length){const li=document.createElement('li');li.className='empty-change';li.textContent='你的修改会显示在这里，并可撤销。';$('change-list').append(li);}
  $('capture').disabled=!ready;$('enter-world').disabled=!ready;
}
function select(id){if(!scene.objects.some(o=>o.id===id))throw new Error('对象不存在。');selectedId=id;if(ready)api().select(id);render();}
function commit(next,label,resetCamera=false){
  validateScene(next);
  if(JSON.stringify(next)===JSON.stringify(scene)){toast('场景已经处于这个状态');return false;}
  undoStack.push(clone(scene));if(undoStack.length>50)undoStack.shift();redoStack.length=0;
  scene=clone(next);revision++;records.unshift(label);syncWorld(resetCamera);render();toast(label);return true;
}
function execute(operations,label='已调整场景'){
  const result=applyOperations(scene,operations,selectedId?{selectedId}:{});
  return commit(result.scene,label,operations.some(op=>op.type==='camera'));
}
function submitInstruction(text){const parsed=parseInstruction(text,scene,selectedId);execute(parsed.operations,parsed.summary);return parsed;}
function history(from,to,label){
  if(!from.length)return false;to.push(clone(scene));scene=from.pop();revision++;records.unshift(label);syncWorld(true);render();toast(label);return true;
}
const attempt = fn => {try{return fn();}catch(e){toast(e.message,true);render();return false;}};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function fileName(){return scene.name.replace(/[\\/:*?"<>|]/g,'-').slice(0,60)||'海岛';}

for(const[key,id]of Object.entries(envFields)){
  const input=$(`env-${id}`);
  input.addEventListener('input',()=>envOutput(key,input.value));
  input.addEventListener('change',()=>attempt(()=>execute([{type:'environment',values:{[key]:Number(input.value)}}],`调整${{timeOfDay:'时间',windSpeed:'风速',swell:'涌浪',cloudCover:'云量'}[key]}`)));
}
for(const key of ['x','z','rotation','scale','visible','locked']){
  const input=$(`obj-${key}`);input.addEventListener('change',()=>attempt(()=>execute([{type:'object',id:selectedId,values:{[key]:['visible','locked'].includes(key)?input.checked:Number(input.value)}}],`调整${scene.objects.find(o=>o.id===selectedId).name}`)));
}
$('scene-name').addEventListener('change',()=>attempt(()=>commit({...clone(scene),name:$('scene-name').value.trim()},'重命名场景')));
$('preset-select').addEventListener('change',()=>attempt(()=>execute([{type:'preset',preset:$('preset-select').value}],'切换环境预设')));
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>attempt(()=>{
  const changed=execute([{type:'camera',preset:button.dataset.camera}],'切换镜头');if(!changed&&ready)api().camera(button.dataset.camera);
})));
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$('prompt-input').value=button.dataset.prompt;$('prompt-input').focus();}));
$('apply-prompt').addEventListener('click',()=>attempt(()=>submitInstruction($('prompt-input').value)));
$('prompt-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();attempt(()=>submitInstruction(e.currentTarget.value));}});
$('undo').addEventListener('click',()=>history(undoStack,redoStack,'撤销上一步'));
$('redo').addEventListener('click',()=>history(redoStack,undoStack,'重做上一步'));
$('save-scene').addEventListener('click',()=>save());
$('new-scene').addEventListener('click',()=>attempt(()=>commit(createScene(scene.preset),'新建场景（可撤销）',true)));
$('export-scene').addEventListener('click',()=>download(new Blob([JSON.stringify(scene,null,2)],{type:'application/json'}),`${fileName()}.json`));
$('import-scene').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>65536)throw new Error('场景文件应小于 64 KB。');const candidate=JSON.parse(await file.text());validateScene(candidate);commit(candidate,'导入场景',true);}
  catch(error){toast(`导入失败：${error.message}`,true);}finally{e.target.value='';}
});
$('capture').addEventListener('click',async()=>{if(!ready)return;try{$('capture').disabled=true;toast('正在捕获当前 3D 画面…');const blob=await api().capture();if(!blob)throw new Error('截图未生成');download(blob,`${fileName()}.png`);toast('截图已导出');}catch(e){toast(`截图失败：${e.message}`,true);}finally{$('capture').disabled=!ready;}});
$('enter-world').addEventListener('click',()=>{if(ready){api().enter();toast('WASD 移动，鼠标转向，Esc 返回编辑');}});
$('toggle-inspector').addEventListener('click',()=>{$('state-json').textContent=JSON.stringify(scene,null,2);$('state-dialog').showModal();});
$('close-state').addEventListener('click',()=>$('state-dialog').close());
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();e.shiftKey?history(redoStack,undoStack,'重做上一步'):history(undoStack,redoStack,'撤销上一步');}});
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.source!=='tidewater-runtime')return;
  const m=e.data;
  if(m.type==='progress')$('runtime-status').textContent=`${m.text} · ${Math.round(m.value*100)}%`;
  if(m.type==='ready'){ready=true;syncWorld(true);$('loading-hint').hidden=true;$('runtime-status').textContent='实时 WebGPU · 编辑';render();}
  if(m.type==='select')attempt(()=>select(m.id));
  if(m.type==='stats')$('runtime-status').textContent=`实时 WebGPU · ${m.mode}${m.fps?' · '+m.fps+' FPS':''}`;
  if(m.type==='error'){ready=false;render();$('loading-hint').hidden=false;$('runtime-status').textContent='3D 预览启动失败';$('loading-hint').replaceChildren();const p=document.createElement('p');p.textContent=`${m.message}。请在支持 WebGPU 的 Chrome / Edge 中打开，关闭占用显卡的页面后刷新重试。`;$('loading-hint').append(p);toast(m.message,true);}
  if(m.type==='explore')$('enter-world').textContent=m.active?'漫游中 · Esc 返回':'进入漫游 ↗';
});
window.studio={get scene(){return clone(scene);},get selectedId(){return selectedId;},get ready(){return ready;},get revision(){return revision;},select,execute,submitInstruction,undo:()=>history(undoStack,redoStack,'撤销上一步'),redo:()=>history(redoStack,undoStack,'重做上一步')};
render();
// Catch a ready event that arrived before this module finished initializing.
if(api()?.ready){ready=true;syncWorld(true);$('loading-hint').hidden=true;render();}
