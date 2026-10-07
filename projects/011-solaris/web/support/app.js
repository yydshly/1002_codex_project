import {SupportScene} from './scene.js';
import {SUPPORT_WORKSPACE_KEY,MAX_SUPPORT_BACKUP_BYTES} from './state.js';
const $=id=>document.getElementById(id), clone=value=>structuredClone(value);
let worker,view,analysis,reply,mode='lamp',gesture=null,busy=false,failed=false,checkedText=null,downloadUrl=null,toastTimer,fileReadId=0,readingFile=false;
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
function refreshControls(){const ready=Boolean(reply?.state)&&!busy&&!gesture&&!failed;
  for(const id of ['save','backup','show-surface','lamp-turn-left','lamp-turn-right','table-turn-left','table-turn-right','table-width','table-depth','apply-size'])$(id).disabled=!ready;
  for(const button of document.querySelectorAll('[data-nudge]'))button.disabled=!ready;
  $('undo').disabled=busy||!reply?.status?.canUndo;$('redo').disabled=busy||!reply?.status?.canRedo;
  $('surface').disabled=busy||failed||!analysis;for(const b of $('asset-options').children)b.disabled=busy||failed;
  view&&(view.controls.enabled=mode==='orbit'&&!gesture&&!busy);
}
async function render(result){reply=result;const assetId=result.activeAssetId??result.state?.table.assetId;
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
async function operation(type,payload={}){if(busy)return;setBusy(true);await cancelDrag('切换操作前取消拖动');
  try {const result=await ask(type,payload);await render(result);if(result.ok===false)toast(explain(result.reason));return result;}
  catch(error){toast(error.message);}finally{setBusy(false);}
}
async function edit(modify,label,sweep=false){if(!reply?.state||busy||gesture)return;const state=clone(reply.state);modify(state);return operation('apply',{state,detail:{label,sweep}});}
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
  host.addEventListener('pointerdown',event=>{if(busy||gesture||!reply?.state||mode==='orbit'||event.button!==0||!view.pick(event,mode))return;
    event.preventDefault();host.focus();const point=view.point(event,mode==='lamp'?view.surfaceHeight:0);if(!point)return;
    const g={pointerId:event.pointerId,mode,baseline:clone(reply.state),point,latest:null,cancelled:false,flushing:null,finishing:false};gesture=g;
    view.controls.enabled=false;host.setPointerCapture(event.pointerId);refreshControls();g.beginPromise=ask('begin',{label:mode==='lamp'?'拖动灯具':'拖动桌子'}).then(async r=>{if(!r.ok){g.cancelled=true;gesture=null;}await render(r);}).catch(error=>fatal(error.message));
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
function wireControls(){
  $('retry').onclick=()=>location.reload();$('about').onclick=()=>$('about-dialog').showModal();$('technical').onclick=()=>$('technical-dialog').showModal();
  for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
  for(const b of document.querySelectorAll('[data-mode]'))b.onclick=async()=>{await cancelDrag('切换模式，回到起点');mode=b.dataset.mode;for(const x of document.querySelectorAll('[data-mode]'))x.setAttribute('aria-pressed',String(x===b));refreshControls();$('gesture-hint').textContent=mode==='orbit'?'拖动环绕 · 滚轮缩放 · 右键平移':mode==='table'?'拖动原桌模型 · 灯随桌移动 · Escape 取消':'拖动灯具 · 越边释放整次回到起点 · 方向键每步 5 cm';};
  $('top-view').onclick=()=>view.top();$('home-view').onclick=()=>view.home();
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
  $('save').onclick=async()=>{const result=await operation('export');if(!result?.ok)return;
    try{localStorage.setItem(SUPPORT_WORKSPACE_KEY,result.rawText);$('save-status').textContent='研究方案已保存';toast('已保存桌子、灯具与所选台面的关系。');}
    catch{toast('本机保存失败，方案仍保留，可以下载备份。');await openBackup();}
  };
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
async function start(){wireControls();try{
  view=new SupportScene($('canvas-host'));worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{const value=event.data;if(value.progress||value.event==='progress'){$('loading-detail').textContent=value.progress??value.message;return;}const request=pending.get(value.id);if(request){pending.delete(value.id);value.error?request.reject(new Error(value.error)):request.resolve(value);}};
  worker.onerror=event=>{const message=event.message||'几何工作线程无法运行';fatal(message);for(const request of pending.values())request.reject(new Error(message));pending.clear();};
  let savedRaw=null;try{savedRaw=localStorage.getItem(SUPPORT_WORKSPACE_KEY);}catch{}
  const first=await ask('init',{savedRaw});analysis=first.analysis;if(!analysis)throw new Error(first.reason??'分析资料不可用');
  $('analysis-readout').textContent=JSON.stringify({policy:analysis.policy,lamp:{id:analysis.lamp.asset.id,source:analysis.lamp.asset.sourcePage,fingerprint:analysis.lamp.asset.sourceFingerprint,contactBounds:analysis.lamp.base.contactBounds},tables:analysis.tables.map(t=>({id:t.asset.id,fingerprint:t.asset.sourceFingerprint,candidateCount:t.surfaces?.length??0,verifiedPositions:t.surfaces?.filter(s=>s.recommendation.valid).length??0,reason:t.reason??null}))},null,2);
  $('analysis-summary').textContent='原夹装灯被语义核查排除；现在使用独立圆底管灯复核同三桌，不称新的未知模型测试集。每个未通过候选仍保留在菜单中。';
  for(const table of analysis.tables){const b=document.createElement('button');b.dataset.asset=table.asset.id;b.textContent=table.asset.label;const small=document.createElement('small');small.textContent=`${table.surfaces?.length??0} 个检测面`;b.append(small);b.onclick=()=>operation('selectAsset',{assetId:table.asset.id});$('asset-options').append(b);}
  await view.prepare(analysis);await render(first);wireCanvas();$('loading').hidden=true;if(first.savedRejected)toast(`保存资料未通过：${first.savedRejected}。原保存文本保留。`);
}catch(error){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=error.message;}}
start();
