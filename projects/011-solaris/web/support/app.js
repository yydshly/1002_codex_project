import {SupportScene} from './scene.js';
import {SUPPORT_WORKSPACE_KEY,MAX_SUPPORT_BACKUP_BYTES} from './state.js';
import {createSupportStorage} from './storage.js';
import {createSupportDraft} from './draft.js';
const $=id=>document.getElementById(id), clone=value=>structuredClone(value);
const draft=createSupportDraft();
let worker,view,analysis,reply,storage,mode='lamp',gesture=null,busy=true,initialized=false,failed=false,checkedText=null,downloadUrl=null,toastTimer,fileReadId=0,readingFile=false,conflictEpoch=0,savedPreview=null,saveProblem=false,navigating=false,pendingNavigation=null,navigationEpoch=0,beforeUnloadAttached=false;
const pending=new Map();let requestId=0;
function ask(type,payload={}){return new Promise((resolve,reject)=>{if(failed){reject(new Error('几何工作线程不可用，请重新打开工作台。'));return;}const id=++requestId;pending.set(id,{resolve,reject});worker.postMessage({id,type,payload});});}
function fatal(message){failed=true;if(gesture){gesture.cancelled=true;const id=gesture.pointerId;gesture=null;if($('canvas-host').hasPointerCapture(id))$('canvas-host').releasePointerCapture(id);}
  reply=null;busy=true;refreshControls();$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=`${message}。当前几何状态无法确认，请重新打开；已保存原文保持。`;
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
const reasons={
  'supported':'完整灯底与 2 mm 边距通过；当前验证不判断物理稳定性。',
  'footprint-uncovered':'完整灯底或 2 mm 边距越过台面边缘或缺口。',
  'sweep-uncovered':'整段移动路径跨过台面边缘或缺口。',
  'rotation-envelope-uncovered':'转灯的保守完整圆包络越过台面，原角度保留。',
  'conservative-aabb-collision':'灯体包络与原桌结构相交，原方案保留。',
  'conservative-aabb-sweep-collision':'灯体的移动包络与原桌结构相交。',
  'contact-height-mismatch':'接触高度误差超出 0.5 mm，不能可靠贴面。',
  'unsupported-transform':'这类变换超出当前可验证范围。',
  'no-horizontal-surface':'没有检测到符合规则的水平面。',
  'resource-limit':'几何计算超出本轮资源上限，不能确认这个位置。',
  'footprint-outside-surface':'整个灯底及 2 mm 边距未被台面完整支撑。',
  'translation-path-unsupported':'移动路径跨过台面缺口，不能直接穿过去。',
  'rotation-path-unsupported':'旋转保守包络未被台面完整支撑，保留原角度。',
  'lamp-obstacle-collision':'灯体包络与原桌结构相交，保留原位置。',
  'no-verified-position-in-finite-search':'当前有限位置搜索没有找到经过证明的位置。',
  'ambiguous':'检测到多个水平面，请明确选择要使用的台面。'
};
const explain=reason=>reasons[reason]??reason??'完整灯底与 2 mm 边距通过；当前验证不判断物理稳定性。';
function setBusy(value){busy=value;if(value){$('placement-title').textContent='正在核对完整灯底与关系…';$('placement-detail').textContent='计算在独立线程进行，结果返回后才能继续提交。';}refreshControls();}
function needsLeaveProtection(){const s=draft.getSnapshot();return !navigating&&(s.dirty||s.transactionActive||Boolean(gesture)||(s.hasState&&(s.pendingSelection||busy||saveProblem)));}
function beforeUnload(event){if(!needsLeaveProtection())return;event.preventDefault();event.returnValue='';}
function refreshDraftUI(){const s=draft.getSnapshot(),protect=needsLeaveProtection();
  if(protect&&!beforeUnloadAttached){window.addEventListener('beforeunload',beforeUnload);beforeUnloadAttached=true;}
  else if(!protect&&beforeUnloadAttached){window.removeEventListener('beforeunload',beforeUnload);beforeUnloadAttached=false;}
  const text=failed?(s.dirty?'工作台中断 · 草稿未保存':'工作台暂时不可用'):!initialized?'正在准备工作台':s.transactionActive||gesture?'正在拖动 · 尚未提交':s.pendingSelection?'请选择完整支撑台面':saveProblem?'本次保存未确认':s.externalChanged?'本机存档有变化':s.dirty?'本页有未保存修改':s.hasState?'方案与存档一致':'请选择支撑台面';
  if($('save-status').textContent!==text)$('save-status').textContent=text;
  $('save-status').dataset.state=protect?'unsaved':s.hasState?'saved':'pending';
  if($('leave-dialog').open){
    $('leave-summary').textContent=reply?.state?describeScheme(JSON.stringify({state:reply.state})):'台面选择尚未完成，原方案仍可用撤销找回。';
    $('leave-message').textContent=failed?'工作线程已中断，本页无法核查保存。可继续留在本页，或明确离开后用已保存版本重开。':busy?'正在核对操作，请等待结果；关闭提示会继续留在本页。':s.pendingSelection?'先继续编辑并选择台面，或撤销回完整方案，再保存或备份。':'保存后离开需写后核对成功；备份只打开方案文本，关闭备份后仍留在本页。';
    $('leave-save').disabled=!initialized||failed||busy||!reply?.state;
    $('leave-backup').disabled=!initialized||failed||busy||!reply?.state;
    $('leave-discard').disabled=busy&&!failed;
  }
}
function refreshControls(){const ready=initialized&&Boolean(reply?.state)&&!busy&&!gesture&&!failed;
  for(const id of ['save','backup','show-surface','lamp-turn-left','lamp-turn-right','table-turn-left','table-turn-right','table-width','table-depth','apply-size'])$(id).disabled=!ready;
  for(const button of document.querySelectorAll('[data-nudge]'))button.disabled=!ready;
  $('undo').disabled=!initialized||failed||busy||!reply?.status?.canUndo;$('redo').disabled=!initialized||failed||busy||!reply?.status?.canRedo;
  $('surface').disabled=!initialized||busy||failed||!analysis;for(const b of $('asset-options').children)b.disabled=!initialized||busy||failed;
  for(const b of document.querySelectorAll('[data-mode]'))b.disabled=!initialized||failed||busy;
  for(const id of ['top-view','home-view'])$(id).disabled=!initialized||failed||busy||Boolean(gesture);
  view&&(view.controls.enabled=initialized&&!failed&&mode==='orbit'&&!gesture&&!busy);
  refreshDraftUI();
}
async function render(result){if(failed)return;reply=result;const assetId=result.activeAssetId??result.state?.table.assetId;
  draft.observe(result.state,{pendingSelection:Boolean(result.status?.pendingSurfaceChoice),transactionActive:Boolean(result.status?.transactionActive)});
  const table=analysis?.tables.find(t=>t.asset.id===assetId);if(!table)return;
  $('asset-title').textContent=table.asset.label;$('asset-number').textContent=String(analysis.tables.indexOf(table)+1).padStart(2,'0');
  $('asset-source').href=table.asset.sourcePage;
  for(const b of $('asset-options').children)b.setAttribute('aria-pressed',String(b.dataset.asset===assetId));
  const faceSelect=$('surface');faceSelect.replaceChildren(new Option('请选择检测台面（换桌会重新放灯）',''));
  for(const face of [...(table.surfaces??[])].sort((a,b)=>b.height-a.height)){
    const verified=face.recommendation?.valid;
    faceSelect.append(new Option(`${(face.height*100).toFixed(1)} cm · ${verified?'有已验证位置':'暂未找到位置'} · ${face.triangleCount??face.triangles.length} 面`,face.id));
  }
  $('surface-count').textContent=`${table.surfaces?.length??0} 个候选`;
  const state=result.state;faceSelect.value=state?.table.assetId===assetId?state.table.surfaceId:'';
  $('placement-status').classList.toggle('invalid',result.ok===false||!state);
  $('placement-title').textContent=result.ok===false?'操作已拒绝，保留原方案':state?'完整灯底通过支撑检查':'请选择一个检测台面';
  $('placement-detail').textContent=explain(result.reason??(!state?'ambiguous':undefined));
  if(state){const t=state.table.transform,face=table.surfaces.find(s=>s.id===state.table.surfaceId);
    $('surface-height').textContent=`${((face.height*t.scale.y+t.y)*100).toFixed(1)} cm`;
    $('lamp-height').textContent=`${(52*state.lamp.scale).toFixed(1)} cm`;
    $('table-width').value=t.scale.x;$('table-depth').value=t.scale.z;
    const a=state.attachment.localAnchor;$('anchor-readout').textContent=`桌内灯根 X ${a.x.toFixed(3)} m / Z ${a.z.toFixed(3)} m · 灯底有自身偏移`;
  }else{$('surface-height').textContent='—';$('lamp-height').textContent='—';$('table-width').value=1;$('table-depth').value=1;$('anchor-readout').textContent='请选择一个检测台面；原方案保留，可撤销返回。';}
  refreshControls();await view.update(result);
}
async function operation(type,payload={}){if(!initialized||busy||failed)return;setBusy(true);await cancelDrag('切换操作前取消拖动');
  try {const result=await ask(type,payload);await render(result);if(failed)return;if(result.ok===false)toast(explain(result.reason));return result;}
  catch(error){toast(error.message);}finally{setBusy(false);}
}
async function edit(modify,label,sweep=false){if(!initialized||failed||!reply?.state||busy||gesture)return;const state=clone(reply.state);modify(state);return operation('apply',{state,detail:{label,sweep}});}
const worldToLocal=(x,z,t)=>({x:(Math.cos(t.yaw)*(x-t.x)-Math.sin(t.yaw)*(z-t.z))/t.scale.x,z:(Math.sin(t.yaw)*(x-t.x)+Math.cos(t.yaw)*(z-t.z))/t.scale.z});
function nudge(direction){const delta={left:[-.05,0],right:[.05,0],front:[0,.05],back:[0,-.05]}[direction];
  return edit(state=>{const t=state.table.transform,a=state.attachment.localAnchor,c=Math.cos(t.yaw),s=Math.sin(t.yaw);
    const x=t.x+c*a.x*t.scale.x+s*a.z*t.scale.z,z=t.z-s*a.x*t.scale.x+c*a.z*t.scale.z;
    state.attachment.localAnchor=worldToLocal(x+delta[0],z+delta[1],t);},'移动灯具 5 cm',true);
}
async function flushDrag(g){if(g.flushing)return g.flushing;
  g.flushing=(async()=>{while(g.latest&&!g.cancelled){const state=g.latest;g.latest=null;const result=await ask('update',{state});if(!g.cancelled)await render(result);}})();
  try{await g.flushing;}finally{g.flushing=null;}if(g.latest&&!g.cancelled)return flushDrag(g);
}
function finishDrag(cancel=false,reason='取消鼠标拖动'){const g=gesture;if(!g)return Promise.resolve();if(cancel){g.cancelled=true;g.cancelReason=reason;g.latest=null;}if(g.finishing)return g.finishPromise;
  g.finishing=true;g.finishPromise=(async()=>{
  if(cancel){g.cancelled=true;g.latest=null;}await g.beginPromise;
  if(cancel){if(g.flushing)await g.flushing;}else await flushDrag(g);
  const result=await ask(g.cancelled?'cancel':'commit',g.cancelled?{reason:g.cancelReason??reason}:{});
  gesture=null;if($('canvas-host').hasPointerCapture(g.pointerId))$('canvas-host').releasePointerCapture(g.pointerId);
  await render(result);if(result.rolledBack)toast('释放位置未通过，整次拖动已回到起点。');refreshControls();
  })().catch(error=>{fatal(error.message);});return g.finishPromise;
}
async function cancelDrag(reason){if(gesture)await finishDrag(true,reason);}
function wireCanvas(){const host=$('canvas-host');
  const candidate=(g,event)=>{const point=view.point(event,g.mode==='lamp'?view.surfaceHeight:0);if(!point)return null;
    const state=clone(g.baseline),dx=point.x-g.point.x,dz=point.z-g.point.z,t=state.table.transform;
    if(g.mode==='table'){t.x+=dx;t.z+=dz;}else{const a=state.attachment.localAnchor,c=Math.cos(t.yaw),s=Math.sin(t.yaw);
      const x=t.x+c*a.x*t.scale.x+s*a.z*t.scale.z,z=t.z-s*a.x*t.scale.x+c*a.z*t.scale.z;
      state.attachment.localAnchor=worldToLocal(x+dx,z+dz,t);}return state;
  };
  host.addEventListener('pointerdown',event=>{if(!initialized||failed||busy||gesture||!reply?.state||mode==='orbit'||event.button!==0||!view.pick(event,mode))return;
    event.preventDefault();host.focus();const point=view.point(event,mode==='lamp'?view.surfaceHeight:0);if(!point)return;
    const g={pointerId:event.pointerId,mode,baseline:clone(reply.state),point,latest:null,cancelled:false,flushing:null,finishing:false};gesture=g;
    view.controls.enabled=false;host.setPointerCapture(event.pointerId);refreshControls();g.beginPromise=ask('begin',{label:mode==='lamp'?'拖动灯具':'拖动桌子'}).then(async r=>{if(!r.ok){g.cancelled=true;gesture=null;if(host.hasPointerCapture(g.pointerId))host.releasePointerCapture(g.pointerId);}await render(r);}).catch(error=>fatal(error.message));
  });
  host.addEventListener('pointermove',event=>{const g=gesture;if(!g||g.finishing||g.pointerId!==event.pointerId)return;
    const state=candidate(g,event);if(!state){g.latest=null;finishDrag(true,'无法投影到支撑平面，回到起点');return;}
    g.latest=state;g.beginPromise.then(()=>{if(!g.cancelled)flushDrag(g).catch(error=>fatal(error.message));});
  });
  host.addEventListener('pointerup',event=>{const g=gesture;if(!g||g.pointerId!==event.pointerId||g.finishing)return;
    const state=candidate(g,event);if(!state){finishDrag(true,'释放坐标无法确认，回到起点');return;}g.latest=state;finishDrag(false);});
  for(const event of ['pointercancel','lostpointercapture'])host.addEventListener(event,()=>{if(gesture&&!gesture.finishing)finishDrag(true,'指针捕获中断，回到起点');});
  host.addEventListener('keydown',event=>{const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'back',ArrowDown:'front'}[event.key];if(direction&&mode==='lamp'){event.preventDefault();nudge(direction);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')cancelDrag('Escape 取消，回到起点');});
  window.addEventListener('blur',()=>cancelDrag('窗口失去焦点，回到起点'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrag('页面隐藏，回到起点');});
}
function setDownload(rawText){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([rawText],{type:'application/json'}));$('download').href=downloadUrl;$('download').removeAttribute('aria-disabled');}
function invalidateBackup(){checkedText=null;$('apply-backup').disabled=true;$('download').removeAttribute('href');$('download').setAttribute('aria-disabled','true');$('backup-message').textContent='内容已修改，必须重新检查；不会改动当前方案。';}
function cancelFileRead(){fileReadId++;readingFile=false;$('check-backup').disabled=false;return fileReadId;}
async function openBackup(){cancelFileRead();const result=await operation('export');if(!result?.ok)return;$('configuration').value=result.rawText;checkedText=result.rawText;setDownload(result.rawText);$('apply-backup').disabled=false;$('backup-message').textContent='当前方案已通过当前几何检查，可以下载或打开。';$('backup-dialog').showModal();}
function clearSavedPreview(){conflictEpoch++;savedPreview=null;$('open-saved').disabled=true;$('saved-configuration').value='';}
function describeScheme(rawText){try{const s=JSON.parse(rawText).state,t=s.table.transform,a=s.attachment.localAnchor;
  const label=analysis.tables.find(x=>x.asset.id===s.table.assetId)?.asset.label??s.table.assetId;
  return `${label} · 桌宽 ${t.scale.x.toFixed(2)} / 深 ${t.scale.z.toFixed(2)} · 灯位置 X ${a.x.toFixed(3)} / Z ${a.z.toFixed(3)} m`;
}catch{return '存档格式尚未核查';}}
function showSaveIssue(result){clearSavedPreview();$('save-status').textContent='本页尚未保存';
  saveProblem=true;if($('leave-dialog').open)$('leave-dialog').close();refreshDraftUI();
  $('conflict-title').textContent=result.code==='storage-conflict'?'本机已有变化的方案':'这次保存未能确认';
  $('conflict-local-summary').textContent=reply?.state?describeScheme(JSON.stringify({state:reply.state})):'当前方案仍保留';
  $('conflict-saved-summary').textContent=result.found===false?'本机已没有存档':result.restricted?'存档超出本页可检查范围':'请检查当前本机存档';
  $('conflict-message').textContent=`${result.reason}。本页方案保持，未自动覆盖其他版本。`;
  $('check-saved').disabled=!result.baselineKnown;$('open-saved').disabled=true;
  if(!$('save-conflict-dialog').open)$('save-conflict-dialog').showModal();
}
async function checkSaved(){if(busy||failed)return;clearSavedPreview();const epoch=conflictEpoch,observed=storage.checkCurrent();
  if(typeof observed.currentRaw!=='string'||observed.restricted){$('conflict-saved-summary').textContent=observed.currentRaw===null?'本机已没有存档':'当前存档无法检查';$('conflict-message').textContent=observed.reason??'暂无可打开存档，请先备份本页方案；重新打开工作台后可恢复备份。';return;}
  $('check-saved').disabled=true;$('conflict-message').textContent='正在检查当前存档；本页摆放保持。';
  try{const checked=await ask('checkBackup',{rawText:observed.currentRaw});if(epoch!==conflictEpoch||!$('save-conflict-dialog').open||failed)return;
    if(!checked.ok){$('conflict-message').textContent=`存档未通过：${explain(checked.reason)}。本页方案保持，请先备份。`;$('conflict-saved-summary').textContent='当前存档未通过几何与源检查';return;}
    const latest=storage.checkCurrent();if(latest.currentRaw!==observed.currentRaw){$('conflict-message').textContent='存档在检查期间再次变化，请重新检查；本页方案保持。';return;}
    savedPreview={rawText:observed.currentRaw};$('saved-configuration').value=observed.currentRaw;$('conflict-saved-summary').textContent=describeScheme(observed.currentRaw);
    $('open-saved').disabled=false;$('conflict-message').textContent='源模型、规则与完整支撑已通过。打开会替换本页显示，可撤销找回本页方案；尚未写入存档。';
  }catch(error){$('conflict-message').textContent=`检查失败：${error.message}。本页方案保持。`;}
  finally{if(epoch===conflictEpoch)$('check-saved').disabled=false;}
}
async function openSaved(){if(busy||failed||!savedPreview)return;const rawText=savedPreview.rawText,observed=storage.checkCurrent();
  if(observed.currentRaw!==rawText){clearSavedPreview();$('conflict-message').textContent='存档在检查后再次变化，请重新检查；本页方案保持。';return;}
  $('open-saved').disabled=true;const result=await operation('restore',{rawText});if(!result?.ok){clearSavedPreview();$('conflict-message').textContent='当前版本未能打开，保存基线保持，请重新检查。';return;}
  const accepted=storage.acceptCurrent(rawText);
  if(!accepted.ok){showSaveIssue(accepted);$('conflict-message').textContent=`${accepted.reason}。当前显示刚检查的版本，可撤销找回原方案；本页未写入，请重新检查。`;return;}
  draft.markSaved(result.state);saveProblem=false;refreshDraftUI();$('save-conflict-dialog').close();toast('已打开检查通过的存档；可撤销找回本页先前方案。');
}
async function saveCurrent(){const result=await operation('export');if(!result?.ok)return false;const saved=storage.save(result.rawText);
  if(saved.ok){draft.markSaved(result.state);saveProblem=false;refreshDraftUI();toast('已保存桌子、灯具与所选台面的关系。');return true;}
  showSaveIssue(saved);return false;
}
function clearNavigation(){pendingNavigation=null;navigationEpoch++;}
function navigateTo(destination){navigating=true;refreshDraftUI();try{location.assign(destination);}catch(error){navigating=false;refreshDraftUI();toast(`暂时无法离开：${error.message}`);}}
async function requestNavigation(destination){const epoch=++navigationEpoch;pendingNavigation=destination;await cancelDrag('离开前取消进行中的拖动');
  if(epoch!==navigationEpoch)return;
  if(!needsLeaveProtection()){clearNavigation();navigateTo(destination);return;}
  if(!$('leave-dialog').open)$('leave-dialog').showModal();refreshDraftUI();
}
function wireNavigation(){
  window.addEventListener('pageshow',()=>{navigating=false;refreshDraftUI();});
  document.addEventListener('click',event=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=event.target?.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    let destination,current;try{destination=new URL(link.href,location.href);current=new URL(location.href);}catch{return;}
    if(!['http:','https:'].includes(destination.protocol)||destination.href===current.href||(destination.origin===current.origin&&destination.pathname===current.pathname&&destination.search===current.search))return;
    if(!needsLeaveProtection())return;event.preventDefault();requestNavigation(destination.href);
  });
  $('leave-dialog').addEventListener('close',clearNavigation);
  $('leave-continue').onclick=()=>$('leave-dialog').close();
  $('leave-save').onclick=async()=>{if(!pendingNavigation||$('leave-save').disabled)return;const destination=pendingNavigation,epoch=navigationEpoch;
    const saved=await saveCurrent();if(saved&&epoch===navigationEpoch&&pendingNavigation===destination&&$('leave-dialog').open&&!needsLeaveProtection()){$('leave-dialog').close();navigateTo(destination);}
  };
  $('leave-backup').onclick=async()=>{if($('leave-backup').disabled)return;$('leave-dialog').close();await openBackup();};
  $('leave-discard').onclick=()=>{if(!pendingNavigation||$('leave-discard').disabled)return;const destination=pendingNavigation;$('leave-dialog').close();navigateTo(destination);};
}
function wireControls(){
  wireNavigation();
  $('retry').onclick=()=>location.reload();$('about').onclick=()=>$('about-dialog').showModal();$('technical').onclick=()=>$('technical-dialog').showModal();
  for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
  for(const b of document.querySelectorAll('[data-mode]'))b.onclick=async()=>{if(!initialized||failed||busy)return;await cancelDrag('切换模式，回到起点');if(failed)return;mode=b.dataset.mode;for(const x of document.querySelectorAll('[data-mode]'))x.setAttribute('aria-pressed',String(x===b));refreshControls();$('gesture-hint').textContent=mode==='orbit'?'拖动环绕 · 滚轮缩放 · 右键平移':mode==='table'?'拖动原桌模型 · 灯随桌移动 · Escape 取消':'拖动灯具 · 越边释放整次回到起点 · 方向键每步 5 cm';};
  $('top-view').onclick=async()=>{if(!initialized||failed||busy)return;await cancelDrag('切换视角，回到起点');if(!failed)view.top();};$('home-view').onclick=async()=>{if(!initialized||failed||busy)return;await cancelDrag('切换视角，回到起点');if(!failed)view.home();};
  $('surface').onchange=()=>{if($('surface').value)operation('selectSurface',{surfaceId:$('surface').value});};
  for(const b of document.querySelectorAll('[data-nudge]'))b.onclick=()=>nudge(b.dataset.nudge);
  for(const sign of ['left','right']){
    const angle=(sign==='left'?1:-1)*Math.PI/12;
    $(`lamp-turn-${sign}`).onclick=()=>edit(s=>s.lamp.yaw+=angle,'转灯 15°',true);
    $(`table-turn-${sign}`).onclick=()=>edit(s=>s.table.transform.yaw+=angle,'离散转桌 15°');
  }
  $('apply-size').onclick=()=>{const x=Number($('table-width').value),z=Number($('table-depth').value);
    if(![x,z].every(n=>Number.isFinite(n)&&n>=.5&&n<=1.5)){toast('请输入 0.5–1.5 的桌宽与桌深比例。');return;}
    edit(s=>{s.table.transform.scale.x=x;s.table.transform.scale.z=z;},'提交桌宽深比例');};
  $('show-surface').onclick=()=>{const show=$('show-surface').getAttribute('aria-pressed')!=='true';$('show-surface').setAttribute('aria-pressed',String(show));view.showSurface(show);};
  $('undo').onclick=()=>operation('undo');$('redo').onclick=()=>operation('redo');$('backup').onclick=openBackup;
  $('save').onclick=saveCurrent;
  $('check-saved').onclick=checkSaved;$('open-saved').onclick=openSaved;
  $('backup-local').onclick=async()=>{$('save-conflict-dialog').close();await openBackup();};
  $('save-conflict-dialog').addEventListener('close',clearSavedPreview);
  window.addEventListener('storage',event=>{if(event.key!==SUPPORT_WORKSPACE_KEY&&event.key!==null)return;if(!initialized||failed)return;
    clearSavedPreview();draft.markExternalChanged();refreshDraftUI();if($('save-conflict-dialog').open){$('check-saved').disabled=false;$('conflict-message').textContent='另一页面改变了本机存档，请重新检查；本页摆放保持。';}
  });
  $('backup-dialog').addEventListener('close',cancelFileRead);
  $('configuration').oninput=()=>{cancelFileRead();invalidateBackup();};
  $('open-file').onclick=()=>$('backup-file').click();
  $('backup-file').onchange=async()=>{const file=$('backup-file').files[0],id=cancelFileRead();$('backup-file').value='';if(!file)return;
    if(file.size>MAX_SUPPORT_BACKUP_BYTES){$('backup-message').textContent='文件超过64KiB，原文本与原方案保留。';return;}
    invalidateBackup();readingFile=true;$('check-backup').disabled=true;$('backup-message').textContent=`正在读取 ${file.name}，原文本与原方案保持；读取后请检查再打开。`;
    try{const rawText=await file.text();if(id!==fileReadId||!$('backup-dialog').open)return;if(new TextEncoder().encode(rawText).byteLength>MAX_SUPPORT_BACKUP_BYTES)throw new Error('文件超过64KiB');
      $('configuration').value=rawText;invalidateBackup();$('backup-message').textContent=`已读取 ${file.name}，请检查后再打开；当前方案保持。`;
    }catch(error){if(id===fileReadId)$('backup-message').textContent=`读取失败：${error.message}。原文本与原方案保留；请重新检查原文本再打开。`;}
    finally{if(id===fileReadId){readingFile=false;$('check-backup').disabled=false;}}
  };
  $('check-backup').onclick=async()=>{if(readingFile)return;const rawText=$('configuration').value,id=fileReadId;const result=await ask('checkBackup',{rawText});
    if(readingFile||id!==fileReadId||!$('backup-dialog').open||rawText!==$('configuration').value)return;
    checkedText=result.ok?rawText:null;$('apply-backup').disabled=!result.ok;$('backup-message').textContent=result.ok?'源文件、规则、台面与完整灯底均通过，尚未改动当前方案。':explain(result.reason);
    if(result.ok)setDownload(rawText);else $('download').removeAttribute('href');
  };
  $('apply-backup').onclick=async()=>{if(readingFile||checkedText!==$('configuration').value||checkedText===null)return;cancelFileRead();const result=await operation('restore',{rawText:checkedText});if(result?.ok){$('backup-dialog').close();toast('研究方案已按当前几何重新核查并打开。');}};
}
async function start(){wireControls();refreshControls();try{
  view=new SupportScene($('canvas-host'));worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  view.beforeResize=()=>cancelDrag('视口尺寸变化，回到起点');
  worker.onmessage=event=>{const value=event.data;if(value.progress||value.event==='progress'){$('loading-detail').textContent=value.progress??value.message;return;}const request=pending.get(value.id);if(request){pending.delete(value.id);value.error?request.reject(new Error(value.error)):request.resolve(value);}};
  worker.onerror=event=>{const message=event.message||'几何工作线程无法运行';fatal(message);for(const request of pending.values())request.reject(new Error(message));pending.clear();};
  storage=createSupportStorage(()=>localStorage);const loaded=storage.loadSnapshot(),savedRaw=loaded.currentRaw??null;
  const first=await ask('init',{savedRaw});analysis=first.analysis;if(!analysis)throw new Error(first.reason??'分析资料不可用');
  if(savedRaw!==null&&!first.savedRejected&&first.state)draft.markSaved(first.state);saveProblem=!loaded.ok;
  $('analysis-readout').textContent=JSON.stringify({policy:analysis.policy,lamp:{id:analysis.lamp.asset.id,source:analysis.lamp.asset.sourcePage,fingerprint:analysis.lamp.asset.sourceFingerprint,contactBounds:analysis.lamp.base.contactBounds},tables:analysis.tables.map(t=>({id:t.asset.id,fingerprint:t.asset.sourceFingerprint,candidateCount:t.surfaces?.length??0,verifiedPositions:t.surfaces?.filter(s=>s.recommendation.valid).length??0,reason:t.reason??null}))},null,2);
  $('analysis-summary').textContent='原夹装灯被语义核查排除；现在使用独立圆底管灯复核同三桌，不称新的未知模型测试集。每个未通过候选仍保留在菜单中。';
  for(const table of analysis.tables){const b=document.createElement('button');b.disabled=true;b.dataset.asset=table.asset.id;b.textContent=table.asset.label;const small=document.createElement('small');small.textContent=`${table.surfaces?.length??0} 个检测面`;b.append(small);b.onclick=()=>operation('selectAsset',{assetId:table.asset.id});$('asset-options').append(b);}
  await view.prepare(analysis);if(failed)return;await render(first);if(failed)return;initialized=true;setBusy(false);wireCanvas();$('loading').hidden=true;if(first.savedRejected)toast(`保存资料未通过：${first.savedRejected}。原保存文本保留。`);else if(!loaded.ok)toast(`${loaded.reason}。当前方案仍可编辑和下载。`);
}catch(error){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=error.message;}}
start();
