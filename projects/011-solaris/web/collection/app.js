import {PRODUCTS,PRODUCT_IDS,PREFERENCES,SCENES,SCENE_TASKS,initialState,validateState,validateCheckpoint,History,swapProducts,togglePin,toggleWishlist,selectProduct,planPreference,applyPreference,resolveIntent} from './core.js';
import {createProductRenderer} from './render-products.js';
import {createCollectionStorage} from './storage.js';
import {initializeWorkspaceBackup} from './workspace-ui.js';
const $=id=>document.getElementById(id), STORE='atelier-collection-workspace-v1', TRIP='atelier-collection-trip-v1', MAX_JSON=64*1024;
let backend;try{backend=window.localStorage;}catch{}
const persistence=createCollectionStorage(backend,{storeKey:STORE,tripKey:TRIP});
let restored=initialState(),restoreError=!persistence.ready;
try{const saved=persistence.currentRaw;if(saved!==null&&saved!==undefined){if(saved.length>MAX_JSON)throw Error();restored=validateState(JSON.parse(saved));}}catch{restoreError=true;}
const history=new History(restored);let photography=null,view='three-quarter',gesture=null,preferencePlan=null,destination=null,downloadUrl=null,tripDownloadUrl=null,toastTimer,preserveUnreadable=restoreError,storageConflict=false;
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4200);}
function tripNeedsRecovery(){if(!persistence.ready||persistence.currentTripRaw===null)return false;try{if(!persistence.tripReadable)throw Error();validateCheckpoint(JSON.parse(persistence.currentTripRaw));return false;}catch{return true;}}
function storageIssue(result){
  if(result.status==='conflict')storageConflict=true;
  $('sync-warning').hidden=false;
  $('sync-trip-backup').hidden=!persistence.ready||!tripNeedsRecovery();
  $('sync-message').textContent=storageConflict?'另一窗口已更新陈列或场景检查点。当前窗口暂停写入，避免覆盖新记录。':result.status==='trip-unreadable'?'返回检查点损坏，陈列仍可编辑和保存。可下载原始检查点；选定任务后，用“重建检查点并进入”明确替换该记录。':result.status==='unreadable'?'本机记录无法读取，原记录已保留。可先备份当前窗口，或打开有效陈列文件后明确保存。':'本机存储暂时不可用。请先备份当前窗口，再尝试读取最新陈列。';
  $('save-status').textContent=storageConflict?'有更新待读取':'请备份陈列';
  render();
}
function persist(explicit=false){
  if(storageConflict||(preserveUnreadable&&!explicit))return false;
  const result=persistence.save(validateState(history.pending?.state??history.current),{replaceUnreadable:explicit});
  if(!result.ok){storageIssue(result);return false;}
  preserveUnreadable=false;$('sync-warning').hidden=true;$('save-status').textContent='已保存在本机';if(tripNeedsRecovery())storageIssue({status:'trip-unreadable'});if(explicit)toast('陈列、锁定与选品已保存');return true;
}
function edit(label,fn,explicit=false){
  if(storageConflict){toast('请先备份当前窗口并读取最新陈列');return false;}
  cancelDrag();try{history.run(label,fn);render();return persist(explicit);}catch(error){toast(error.message);render();return false;}
}
function checkExternalUpdate(){
  if(!persistence.ready)return;
  try{if(backend.getItem(STORE)!==persistence.currentRaw||backend.getItem(TRIP)!==persistence.currentTripRaw){cancelDrag();storageIssue({status:'conflict'});}}catch{storageIssue({status:'unavailable'});}
}
function loadLatest(){
  cancelDrag();const result=persistence.refresh();
  if(!result.ok){storageIssue(result);return;}
  try{
    const raw=persistence.currentRaw;if(raw!==null&&raw.length>MAX_JSON)throw Error();
    const latest=raw===null?initialState():validateState(JSON.parse(raw));
    history.replace(latest);storageConflict=false;preserveUnreadable=false;preferencePlan=null;destination=null;
    for(const id of ['preference-dialog','travel-dialog','scene-task-dialog','json-dialog'])if($(id).open)$(id).close();
    $('sync-warning').hidden=true;$('save-status').textContent='已读取最新陈列';$('return-status').textContent='已读取本机最新陈列；当前窗口的预览与撤销历史已清空。';render();if(tripNeedsRecovery())storageIssue({status:'trip-unreadable'});toast('最新陈列已读取，可继续编辑');
  }catch{preserveUnreadable=true;storageIssue({status:'unreadable'});}
}
function button(text,label,fn){const item=document.createElement('button');item.type='button';item.textContent=text;if(label)item.setAttribute('aria-label',label);item.addEventListener('click',fn);return item;}
function render(){
  const state=history.current;
  $('catalog').replaceChildren();state.order.forEach((id,index)=>{
    const product=PRODUCTS[id],card=document.createElement('article');card.className='product-card'+(id===state.selected?' selected':'')+(state.pinned.includes(id)?' locked':'');card.dataset.id=id;card.tabIndex=0;card.setAttribute('role','listitem');card.setAttribute('aria-label',`陈列位${index+1}：${product.name}${state.pinned.includes(id)?'，已锁定':''}`);
    const slot=document.createElement('span');slot.className='card-slot';slot.textContent=String(index+1).padStart(2,'0');card.append(slot);
    const image=document.createElement('img');image.className='product-picture';image.draggable=false;image.alt=`${product.name} · 真实授权模型渲染`;if(photography)image.src=photography.images[id];card.append(image);
    if(state.pinned.includes(id)){const pin=document.createElement('span');pin.className='pin-indicator';pin.textContent='位置已锁';card.append(pin);}
    const info=document.createElement('div');info.className='product-card-info';const name=document.createElement('span'),title=document.createElement('strong'),category=document.createElement('small');title.textContent=product.name;category.textContent=product.category;name.append(title,category);info.append(name,button(state.wishlist.includes(id)?'●':'＋',`${state.wishlist.includes(id)?'移出':'加入'}选品：${product.name}`,event=>{event.stopPropagation();edit('更新选品清单',s=>toggleWishlist(s,id));}));card.append(info);
    card.addEventListener('pointerdown',startDrag);card.addEventListener('keydown',event=>{if(event.target!==card)return;if(['Enter',' '].includes(event.key)){event.preventDefault();edit('选择设计素材',s=>selectProduct(s,id));}});$('catalog').append(card);
  });
  const product=PRODUCTS[state.selected],index=state.order.indexOf(state.selected);$('selected-number').textContent=`${String(index+1).padStart(2,'0')} / 06`;$('detail-name').textContent=product.name;$('detail-category').textContent=product.category;$('detail-description').textContent=product.description;$('source-link').href=product.sourceUrl;
  $('detail-tags').replaceChildren(...product.tags.map(tag=>{const span=document.createElement('span');span.textContent=tag;return span;}));
  if(photography){$('detail-image').src=photography.render(state.selected,view);$('detail-image').alt=`${product.name} · ${view==='front'?'正面':view==='side'?'侧面':'斜侧'}真实模型渲染`;}
  $('wishlist-toggle').textContent=state.wishlist.includes(state.selected)?'已在选品清单 · 移除':'加入选品清单 ＋';$('pin-toggle').textContent=state.pinned.includes(state.selected)?'解除当前陈列位锁定':'锁定当前陈列位';$('slot').value=String(index);$('wishlist-count').textContent=`${state.wishlist.length} / 6`;
  $('wishlist-items').replaceChildren();if(!state.wishlist.length){const empty=document.createElement('p');empty.textContent='留住喜欢的设计素材。';$('wishlist-items').append(empty);}else for(const id of state.wishlist)$('wishlist-items').append(button(PRODUCTS[id].name,`查看选品：${PRODUCTS[id].name}`,()=>edit('选择设计素材',s=>selectProduct(s,id))));
  document.querySelectorAll('[data-preference]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.preference===state.preference)));
  document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.view===view)));
  $('undo').disabled=storageConflict||!history.canUndo;$('redo').disabled=storageConflict||!history.canRedo;
  for(const id of ['save','wishlist-toggle','pin-toggle','move-slot','import-json'])$(id).disabled=storageConflict;
  $('enter-scene').disabled=storageConflict||preserveUnreadable||!persistence.ready;
  $('enter-scene').textContent=tripNeedsRecovery()?'重建检查点并进入 ↗':'保存并进入 ↗';
  document.querySelectorAll('[data-preference],.product-card-info button,#wishlist-items button').forEach(item=>item.disabled=storageConflict);
  const recent=$('recent-scene');recent.hidden=!state.lastScene;if(state.lastScene)recent.textContent=`继续上次：${SCENES[state.lastScene].name} ↗`;
  $('arrangement-note').textContent=state.preference==='all'?'拖动只改变陈列位置；选品清单和锁定位置独立保留。':`${PREFERENCES[state.preference].name} · 按登记标签整理；${state.pinned.length} 个锁定位置与 ${state.wishlist.length} 个选品保留。`;
}
function startDrag(event){
  if(storageConflict||event.button!==0||event.target.closest('button')||gesture||document.querySelector('dialog[open]'))return;
  const card=event.currentTarget,id=card.dataset.id;card.focus({preventScroll:true});
  gesture={pointer:event.pointerId,id,card,start:[event.clientX,event.clientY],dragging:false,target:null};card.setPointerCapture(event.pointerId);
  if(event.pointerType==='mouse')event.preventDefault();
}
function moveDrag(event){
  if(!gesture||gesture.pointer!==event.pointerId)return;
  if(!gesture.dragging){if(Math.hypot(event.clientX-gesture.start[0],event.clientY-gesture.start[1])<6)return;if(history.current.pinned.includes(gesture.id)){cancelDrag();toast('这个陈列位已锁定，请先解除锁定');return;}history.begin('拖动交换陈列');gesture.dragging=true;gesture.card.classList.add('dragging');const ghost=$('drag-ghost');ghost.querySelector('img').src=photography?.images[gesture.id]||'';ghost.querySelector('strong').textContent=PRODUCTS[gesture.id].name;ghost.hidden=false;}
  event.preventDefault();$('drag-ghost').style.left=`${event.clientX+12}px`;$('drag-ghost').style.top=`${event.clientY+12}px`;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.product-card');gesture.target=target?.dataset.id||null;document.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));if(target&&gesture.target!==gesture.id)target.classList.add('drop-target');
}
function endDrag(event){
  if(!gesture||gesture.pointer!==event.pointerId)return;const active=gesture;gesture=null;$('drag-ghost').hidden=true;
  if(active.card.hasPointerCapture(event.pointerId))active.card.releasePointerCapture(event.pointerId);
  if(!active.dragging){edit('选择设计素材',s=>selectProduct(s,active.id));return;}
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.product-card')?.dataset.id;
  try{if(!target||target===active.id){history.cancel();toast('没有交换位置，原陈列已保持');}else{history.current=selectProduct(swapProducts(history.current,active.id,target),active.id);history.commit();persist();toast('两个陈列位已交换，可一步撤销');}}catch(error){history.cancel();toast(error.message);}render();
}
function cancelDrag(){if(!gesture)return;const active=gesture;gesture=null;if(active.card.hasPointerCapture(active.pointer))active.card.releasePointerCapture(active.pointer);if(active.dragging)history.cancel();$('drag-ghost').hidden=true;render();}
document.addEventListener('pointermove',moveDrag,{passive:false});document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',event=>{if(gesture?.pointer===event.pointerId)cancelDrag();});document.addEventListener('lostpointercapture',event=>{if(gesture?.pointer===event.pointerId)cancelDrag();});window.addEventListener('blur',()=>{cancelDrag();persist();});
$('wishlist-toggle').addEventListener('click',()=>edit('更新选品清单',s=>toggleWishlist(s,s.selected)));$('pin-toggle').addEventListener('click',()=>edit('锁定陈列位置',s=>togglePin(s,s.selected)));$('move-slot').addEventListener('click',()=>edit('交换陈列位置',s=>swapProducts(s,s.selected,s.order[Number($('slot').value)])));
document.querySelectorAll('[data-view]').forEach(item=>item.addEventListener('click',()=>{cancelDrag();view=item.dataset.view;render();}));
document.querySelectorAll('[data-preference]').forEach(item=>item.addEventListener('click',()=>{
  cancelDrag();try{preferencePlan=planPreference(history.current,item.dataset.preference);$('preference-title').textContent=`为${PREFERENCES[preferencePlan.preference].name}整理`;$('preference-description').textContent='先看位置与理由，再决定是否应用。原陈列此刻保持。';$('preference-list').replaceChildren();preferencePlan.order.forEach((id,index)=>{const reason=preferencePlan.reasons.find(item=>item.id===id),li=document.createElement('li'),position=document.createElement('span'),img=document.createElement('img'),info=document.createElement('span'),name=document.createElement('strong'),why=document.createElement('small');position.className='position';position.textContent=String(index+1).padStart(2,'0');img.alt=PRODUCTS[id].name;img.src=photography?.images[id]||'';name.textContent=PRODUCTS[id].name;why.textContent=reason.reason;info.append(name,why);li.append(position,img,info);$('preference-list').append(li);});$('preference-dialog').showModal();}catch(error){toast(error.message);}
}));
$('apply-preference').addEventListener('click',()=>{if(!preferencePlan)return;if(storageConflict)return;const key=preferencePlan.preference;$('preference-dialog').close();edit('按明确偏好整理',s=>applyPreference(s,key));toast('整理已应用，锁定位置与选品清单保持');});
document.querySelectorAll('[data-close]').forEach(item=>item.addEventListener('click',()=>$(item.dataset.close).close()));
function previewScene(id){
  cancelDrag();if(!Object.hasOwn(SCENES,id)){destination=null;toast('这个去向尚未登记，请从场景任务中选择');return;}
  destination={...SCENES[id]};const task=SCENE_TASKS[id];
  if($('scene-task-dialog').open)$('scene-task-dialog').close();
  $('travel-title').textContent=task.title;$('travel-description').textContent=`将在${destination.name}完成这项任务。取消预览会保持当前陈列。`;
  $('travel-operation').textContent=task.operation;$('travel-expected').textContent=task.expected;$('travel-boundary').textContent=task.boundary;
  $('travel-dialog').showModal();
}
$('intent-form').addEventListener('submit',event=>{event.preventDefault();const matched=resolveIntent($('intent').value);if(!matched){destination=null;toast('请选择一个场景任务，或输入明确去向，例如：去水下、去材料、去滑板');return;}previewScene(matched.sceneId);});
document.querySelectorAll('[data-destination]').forEach(item=>item.addEventListener('click',()=>previewScene(item.dataset.destination)));
$('recent-scene').addEventListener('click',()=>{if(history.current.lastScene)previewScene(history.current.lastScene);});
$('all-scene-tasks').addEventListener('click',()=>{cancelDrag();$('scene-task-dialog').showModal();});
for(const id of ['underwater','materials','skate','living','showroom','imaging','landmark','kitchen','creative']){
  const task=SCENE_TASKS[id],card=document.createElement('article');card.className='scene-task-card';
  const title=document.createElement('h3'),operation=document.createElement('p'),expected=document.createElement('p');
  title.textContent=task.title;operation.textContent=task.operation;expected.textContent=task.expected;
  const action=button(`查看任务：${SCENES[id].name} ↗`,null,()=>previewScene(id));
  card.append(title,operation,expected,action);$('scene-task-list').append(card);
}
$('enter-scene').addEventListener('click',()=>{
  if(!destination||storageConflict||preserveUnreadable)return;cancelDrag();
  try{
    const shop=validateState({...history.current,lastScene:destination.sceneId}),random=new Uint8Array(8);crypto.getRandomValues(random);
    const token=Array.from(random,x=>x.toString(16).padStart(2,'0')).join(''),checkpoint=validateCheckpoint({version:1,token,sceneId:destination.sceneId,shop});
    const result=persistence.enter(checkpoint,shop,{replaceUnreadableTrip:tripNeedsRecovery()});if(!result.ok){storageIssue(result);toast('尚未进入场景，请先处理存储提示');return;}
    history.current=shop;preserveUnreadable=false;$('travel-dialog').close();location.assign(`${destination.path}?from=collection&trip=${token}`);
  }catch(error){toast(`场景检查点未能保存：${error.message}`);}
});
$('undo').addEventListener('click',()=>{if(storageConflict)return;if(gesture){cancelDrag();return;}history.undo();render();persist();});$('redo').addEventListener('click',()=>{if(storageConflict)return;if(gesture){cancelDrag();return;}history.redo();render();persist();});$('save').addEventListener('click',()=>{cancelDrag();persist(true);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){cancelDrag();return;}if(event.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(storageConflict)return;if(gesture){cancelDrag();return;}event.shiftKey?history.redo():history.undo();render();persist();}});
function updateDownload(){
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(new Blob([$('json-text').value],{type:'application/json'}));$('download-json').href=downloadUrl;
}
function openBackup(){cancelDrag();$('json-text').value=JSON.stringify(history.current);$('json-message').textContent='';updateDownload();$('json-dialog').showModal();}
$('json-text').addEventListener('input',updateDownload);
$('backup').addEventListener('click',openBackup);$('sync-backup').addEventListener('click',openBackup);$('sync-refresh').addEventListener('click',loadLatest);
$('sync-trip-backup').addEventListener('click',()=>{
  $('trip-raw').value=persistence.currentTripRaw??'';if(tripDownloadUrl)URL.revokeObjectURL(tripDownloadUrl);
  tripDownloadUrl=URL.createObjectURL(new Blob([$('trip-raw').value],{type:'application/json'}));$('download-trip-raw').href=tripDownloadUrl;$('trip-backup-dialog').showModal();
});
$('import-json').addEventListener('click',()=>{if(storageConflict)return;try{if(new TextEncoder().encode($('json-text').value).length>MAX_JSON)throw Error('陈列文件不能超过64KB');const next=validateState(JSON.parse($('json-text').value));if(edit('打开陈列文件',()=>next,true)){$('json-dialog').close();toast('完整陈列已恢复，可一步撤销');}else $('json-message').textContent='当前窗口已读取该文件，但尚未保存。请保留备份并处理存储提示。';}catch(error){$('json-message').textContent=`没有应用：${error.message}`;}});
function restoreJourney(){const resume=new URLSearchParams(location.search).get('resume');if(!resume)return;try{const trip=validateCheckpoint(JSON.parse(persistence.currentTripRaw||'null'));if(!/^[0-9a-f]{16}$/.test(resume)||resume!==trip.token)throw Error();const saved=JSON.stringify(history.current),checkpoint=JSON.stringify(trip.shop);$('return-status').textContent=saved===checkpoint?`已从${SCENES[trip.sceneId].name}返回；陈列、锁定与选品完整保留。`:'已返回选品台；保留本机最新陈列，不覆盖其他窗口后续编辑。';}catch{$('return-status').textContent='已打开本机陈列；这个返回检查点已失效。';}}
window.addEventListener('storage',event=>{if(event.storageArea===backend&&[STORE,TRIP,null].includes(event.key))checkExternalUpdate();});
window.addEventListener('focus',checkExternalUpdate);
initializeWorkspaceBackup({storage:backend,beforeOpen:cancelDrag,onRestored:result=>{if(result.ok&&result.writtenIds.includes('collection'))loadLatest();else if(!result.ok)checkExternalUpdate();}});
render();restoreJourney();if(restoreError)storageIssue({status:persistence.ready?'unreadable':'unavailable'});else if(tripNeedsRecovery())storageIssue({status:'trip-unreadable'});
try{photography=await createProductRenderer();cancelDrag();$('loading').hidden=true;render();}catch(error){$('loading').textContent='模型未能加载，请刷新后重试';toast(`素材载入失败：${error.message}`);}
window.addEventListener('pagehide',()=>{cancelDrag();persist();});
