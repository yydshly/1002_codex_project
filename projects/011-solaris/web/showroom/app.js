import { initialState, validateState, History, PAINTS, VIEWS, clone } from './core.js';
import { createShowroom } from './scene.js';

const $=id=>document.getElementById(id),key='atelier-car-showroom-v1';
let restored=initialState();try{const saved=localStorage.getItem(key);if(saved)restored=validateState(JSON.parse(saved));}catch{/* Keep an invalid old backup out of the live scene. */}
const history=new History(restored);let studio,autosaveTimer,toastTimer,cameraTimer,cameraEditing=false,cancelRange;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function persist(notify=false){try{localStorage.setItem(key,JSON.stringify(history.current));$('save-status').textContent='已保存在本机';if(notify)toast('配置已保存，可关闭后重新打开');return true;}catch{$('save-status').textContent='保存空间不足';if(notify)toast('本机保存失败，请备份 JSON 配置');return false;}}
function scheduleSave(){clearTimeout(autosaveTimer);$('save-status').textContent='配置已更新';autosaveTimer=setTimeout(()=>persist(),450);}
function refresh(apply=true,options={}){
  const state=history.current;if(apply)studio?.apply(state,options);
  $('paint-name').textContent=PAINTS.find(p=>p.id===state.paint).name;
  document.querySelectorAll('[data-paint]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paint===state.paint)));
  $('lights').setAttribute('aria-pressed',String(state.lights.on));$('light-power').value=state.lights.power;$('power-output').textContent=state.lights.power;
  $('hood').value=Math.round(state.hood*100);$('hood-output').textContent=state.hood===0?'已关闭':state.hood===1?'已打开':`${Math.round(state.hood*100)}%`;
  $('toggle-hood').textContent=state.hood>.5?'关闭引擎盖':'打开引擎盖';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
  $('view-name').textContent=state.view==='custom'?'自由视角':VIEWS[state.view].name;
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
}
function finishCamera(){clearTimeout(cameraTimer);if(!cameraEditing)return;cameraEditing=false;history.current.camera=studio.getCamera();try{if(history.commit())scheduleSave();}catch(error){toast(error.message);refresh();}refresh(false);}
function edit(label,fn){cancelRange?.();finishCamera();try{if(history.edit(label,fn)){refresh();scheduleSave();}}catch(error){toast(error.message);refresh();}}
for(const paint of PAINTS){const b=document.createElement('button');b.dataset.paint=paint.id;b.style.backgroundColor=paint.color;b.title=paint.name;b.setAttribute('aria-label',`车漆 ${paint.name}`);b.addEventListener('click',()=>edit('车身配色',state=>state.paint=paint.id));$('paint-options').append(b);}
for(const [id,view]of Object.entries(VIEWS)){const b=document.createElement('button');b.dataset.view=id;b.textContent=view.name;b.addEventListener('click',()=>chooseView(id));$('view-options').append(b);}
function chooseView(id){edit('观察视角',state=>{state.view=id;state.camera={position:[...VIEWS[id].position],target:[...VIEWS[id].target]};});}
document.querySelector('.split-buttons [data-view]').addEventListener('click',()=>chooseView('engine'));
$('reset-view').addEventListener('click',()=>chooseView('hero'));
$('lights').addEventListener('click',()=>edit('车灯开关',state=>state.lights.on=!state.lights.on));
$('toggle-hood').addEventListener('click',()=>edit('引擎盖开合',state=>state.hood=state.hood>.5?0:1));
function range(id,label,update){const input=$(id);let active=false;
  const cancel=()=>{if(!active)return;active=false;cancelRange=null;history.cancel();refresh();};
  const begin=()=>{finishCamera();if(!active){cancelRange?.();history.begin(label);active=true;cancelRange=cancel;}};
  const commit=()=>{if(!active)return;active=false;cancelRange=null;try{if(history.commit())scheduleSave();}catch(error){toast(error.message);}refresh(false);};
  input.addEventListener('pointerdown',begin);input.addEventListener('input',()=>{begin();update(history.current,Number(input.value));refresh(true,{camera:false});});
  input.addEventListener('change',commit);input.addEventListener('keyup',commit);input.addEventListener('blur',commit);
  input.addEventListener('pointerup',commit);window.addEventListener('pointerup',commit);input.addEventListener('pointercancel',cancel);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){cancel();event.preventDefault();}});
}
range('light-power','车灯亮度',(state,value)=>state.lights.power=value);range('hood','引擎盖开度',(state,value)=>state.hood=value/100);
function travel(direction){cancelRange?.();finishCamera();if(history[direction]()){refresh();scheduleSave();}}
$('undo').addEventListener('click',()=>travel('undo'));$('redo').addEventListener('click',()=>travel('redo'));
$('save').addEventListener('click',()=>{finishCamera();persist(true);});
document.addEventListener('keydown',event=>{if(event.target.matches('input,textarea')||document.querySelector('dialog[open]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(event.shiftKey?'redo':'undo');}
  if(event.key==='Escape'&&cameraEditing){cameraEditing=false;clearTimeout(cameraTimer);history.cancel();refresh();}
});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('about').addEventListener('click',()=>$('about-dialog').showModal());
$('backup').addEventListener('click',()=>{finishCamera();$('configuration').value=JSON.stringify(history.current,null,2);$('config-error').textContent='';$('backup-dialog').showModal();});
$('restore-config').addEventListener('click',()=>{try{const text=$('configuration').value;if(text.length>32000)throw new Error('配置超过 32 KB 上限');const next=validateState(JSON.parse(text));edit('打开配置',state=>{for(const k of Object.keys(state))delete state[k];Object.assign(state,clone(next));});$('backup-dialog').close();toast('配置已恢复，可以撤销这次操作');}catch(error){$('config-error').textContent=error instanceof SyntaxError?'JSON 格式无效，请复制完整配置':error.message;}});
$('download-config').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(history.current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='atelier-car-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('snapshot').addEventListener('click',()=>{finishCamera();if(!studio)return;$('snapshot-image').src=studio.screenshot();$('snapshot-dialog').showModal();});
$('retry').addEventListener('click',()=>location.reload());
window.addEventListener('pagehide',()=>{if(studio){finishCamera();persist();}});
window.addEventListener('blur',()=>{cancelRange?.();if(cameraEditing)finishCamera();});
async function boot(){try{studio=await createShowroom($('canvas-host'),{
    progress:value=>$('loading-progress').value=value,
    cameraStart:()=>{if(!studio)return;finishCamera();history.begin('自由视角');cameraEditing=true;},
    cameraChange:camera=>{if(!studio||!cameraEditing)return;history.current.camera=camera;history.current.view='custom';refresh(false);if(cameraTimer){clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,180);}},
    cameraEnd:()=>{if(cameraEditing){clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,180);}}
  });
  studio.apply(history.current,{instant:true});refresh(false);$('loading').hidden=true;document.body.dataset.ready='true';
  let down;
  const canvas=studio.renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{if(event.button===0)down={x:event.clientX,y:event.clientY,action:studio.pick(event.clientX,event.clientY)};else down=null;});
  canvas.addEventListener('pointerup',event=>{if(!down)return;const start=down;down=null;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5 || !start.action || start.action!==studio.pick(event.clientX,event.clientY))return;
    if(start.action==='lights')edit('点击车灯',state=>state.lights.on=!state.lights.on);
    if(start.action==='hood')edit('点击引擎盖',state=>state.hood=state.hood>.5?0:1);
  });
  canvas.addEventListener('pointermove',event=>{if(down)return;const action=studio.pick(event.clientX,event.clientY);canvas.style.cursor=action?'pointer':'grab';$('gesture-hint').textContent=action==='hood'?'点击引擎盖开合 · 拖动环绕车辆':action==='lights'?'点击灯具切换车灯 · 拖动环绕车辆':'拖动环绕 · 滚轮缩放 · 右键平移 · 点击灯具 / 引擎盖';});
  canvas.addEventListener('pointercancel',()=>down=null);
}catch(error){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=error.message;document.body.dataset.ready='error';console.error(error);}}
refresh(false);boot();
