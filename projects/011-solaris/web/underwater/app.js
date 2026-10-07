import { WATER_BOUNDS, REEFS, MAX_RECORDS, MAX_PATH_POINTS, MAX_DIVER_PATH_POINTS, History, initialState, parseState, serializeState, canMove, appendDrag, resetFish, setView, setCamera, canFishPastDiver } from './workspace.js';
import { DIVER_RADIUS, FOLLOW_DISTANCE, planFollow, advanceFollower, canDiverMove } from './follower.js';
import { createUnderwater } from './scene.js';

const KEY='atelier-underwater-workspace-v2', LEGACY_KEY='atelier-underwater-workspace-v1', $=id=>document.getElementById(id), STEP=1/60;
let saved=null, unreadable=false, migrated=false;
try{const raw=localStorage.getItem(KEY);const legacy=raw===null?localStorage.getItem(LEGACY_KEY):null;if(raw||legacy){saved=parseState(raw||legacy);migrated=!!legacy;}}catch{unreadable=true;}
const history=new History(saved||initialState());
let scene=null, drag=null, follow=null, accumulator=0, cameraTimer=null, toastTimer=null, outcome='initial', settledStatus='ready', stableKey='',stablePlan;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function persist({explicit=false}={}){
  if(unreadable&&!explicit){$('save-status').textContent='旧记录未覆盖';return;}
  try{localStorage.setItem(KEY,serializeState(history.pending?.state||history.current));unreadable=false;migrated=false;$('save-status').textContent='已保存在本机';}
  catch{toast('本机存储未能写入，仍可用JSON保留位置');$('save-status').textContent='尚未保存';}
}
const svgNS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs={}){const node=document.createElementNS(svgNS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;}
const map=svgNode('svg',{viewBox:'0 0 260 172',role:'img','aria-label':'鱼与潜水员的俯视位置示意，仅显示状态'});
const mapX=x=>12+(x-WATER_BOUNDS.minX)/(WATER_BOUNDS.maxX-WATER_BOUNDS.minX)*236;
const mapZ=z=>12+(z-WATER_BOUNDS.minZ)/(WATER_BOUNDS.maxZ-WATER_BOUNDS.minZ)*148;
map.append(svgNode('rect',{x:12,y:12,width:236,height:148,rx:4,class:'map-boundary'}));
for(const reef of REEFS){const common={cx:mapX(reef.position[0]),cy:mapZ(reef.position[1])};map.append(svgNode('circle',{...common,r:(reef.radius+DIVER_RADIUS)*236/(WATER_BOUNDS.maxX-WATER_BOUNDS.minX),class:'map-avoidance'}));map.append(svgNode('circle',{...common,r:reef.radius*236/(WATER_BOUNDS.maxX-WATER_BOUNDS.minX),class:'map-reef'}));}
const mapTrail=svgNode('polyline',{class:'map-trail'}), mapFollow=svgNode('polyline',{class:'map-follow'}),mapFish=svgNode('polygon',{points:'7,0 -4,-4 -4,4',class:'map-fish'}),mapDiver=svgNode('polygon',{points:'8,0 -5,-5 -3,0 -5,5',class:'map-diver'}),mapGhost=svgNode('circle',{r:6,class:'map-ghost',visibility:'hidden'});
map.append(mapTrail,mapFollow,mapFish,mapDiver,mapGhost);$('water-map').append(map);
const operation=()=>drag||follow;
function currentFish(){if(follow)return follow.fish;if(!drag)return history.current.fish;const p=drag.path.at(-1),previous=drag.path.at(-2);return{position:p,heading:previous?Math.atan2(-(p[1]-previous[1]),p[0]-previous[0]):drag.startHeading};}
const currentDiver=()=>operation()?.diver||history.current.diver;
function idlePlan(){const key=JSON.stringify([history.current.fish,history.current.diver]);if(key!==stableKey){stableKey=key;stablePlan=planFollow(history.current.diver,history.current.fish.position);}return stablePlan;}
function renderMotion(){
  const active=operation(), fish=currentFish(), diver=currentDiver(), path=active?.path||history.current.records.at(-1)?.path||[];
  const observing=history.pending?.label==='观察水下视角',plan=active?.plan||idlePlan(),show=$('show-follow-route').checked;
  const distance=Math.hypot(fish.position[0]-diver.position[0],fish.position[1]-diver.position[1]);
  const status=active?plan.status:history.current.records.at(-1)?.diver.legacy?'ready':plan.status==='blocked'?'blocked':plan.status==='arrived'?'arrived':'ready';
  $('stage').dataset.cameraActive=String(observing);$('stage').dataset.followActive=String(!!follow);
  $('position-x').textContent=fish.position[0].toFixed(2);$('position-z').textContent=fish.position[1].toFixed(2);$('heading-value').textContent=Math.round(fish.heading*180/Math.PI)+'°';
  for(const[id,pose]of [['fish-label',fish],['diver-label',diver]]){const node=$(id);node.dataset.x=String(pose.position[0]);node.dataset.z=String(pose.position[1]);node.dataset.heading=String(pose.heading);node.dataset.active=String(!!active);}
  $('fish-label').querySelector('span').textContent=drag?'位置随指针 · 松手追随':follow?'落点固定 · 等待追随':'按住鱼体拖动';
  const words={ready:'准备跟随',moving:'正在追随',detour:'正在绕礁',turning:'到位转向',arrived:'已到安全站位',blocked:'跟随受阻 · 原位停留'};
  $('follow-status').textContent=words[status];$('follow-status').dataset.status=status;$('diver-label').querySelector('span').textContent=words[status];
  $('follow-distance').textContent=distance.toFixed(2);$('follow-target').textContent=FOLLOW_DISTANCE.toFixed(2);$('diver-angle').textContent=Math.round(diver.heading*180/Math.PI)+'°';
  $('follow-distance').dataset.value=String(distance);
  $('follow-explanation').textContent=status==='blocked'?(plan.reason||'当前水层没有安全通路；移动鱼后重新规划。'):follow?'鱼的落点已固定，潜水员沿安全路径到位后一起保存。':drag?'潜水员按有限速度追随；目标间距为1.00，实际距离会随操作变化。':status==='arrived'?'潜水员已停稳并朝向鱼；可继续拖鱼或撤销整次联动。':'拖动鱼，观察潜水员的转向、追随与避礁；鱼不能拖穿潜水员。';
  mapFish.setAttribute('transform',`translate(${mapX(fish.position[0])} ${mapZ(fish.position[1])}) rotate(${-fish.heading*180/Math.PI})`);
  mapDiver.setAttribute('transform',`translate(${mapX(diver.position[0])} ${mapZ(diver.position[1])}) rotate(${-diver.heading*180/Math.PI})`);
  mapTrail.setAttribute('points',path.map(p=>`${mapX(p[0])},${mapZ(p[1])}`).join(' '));
  const route=active?active.plan.route:history.current.records.at(-1)?.diver.path||[];mapFollow.setAttribute('points',show?route.map(p=>`${mapX(p[0])},${mapZ(p[1])}`).join(' '):'');
  map.setAttribute('aria-label',`鱼X ${fish.position[0].toFixed(2)}、Z ${fish.position[1].toFixed(2)}；潜水员X ${diver.position[0].toFixed(2)}、Z ${diver.position[1].toFixed(2)}；当前间距${distance.toFixed(2)}，${words[status]}。`);
  mapGhost.setAttribute('visibility',drag&&!drag.valid?'visible':'hidden');if(drag&&!drag.valid){mapGhost.setAttribute('cx',mapX(drag.candidate[0]));mapGhost.setAttribute('cy',mapZ(drag.candidate[1]));}
  $('drag-feedback').hidden=!active;$('drag-feedback').dataset.valid=String(drag?.valid??true);
  $('drag-message').textContent=drag?(drag.valid?'鱼随指针 · 潜水员追随':drag.reason):words[status];
  $('drag-detail').textContent=drag?(drag.valid?'松手后等待潜水员停稳 · Esc 取消两者':'在非法目标松手，将恢复两者整个起点'):'鱼已松手 · 仍可继续拖鱼或 Esc 取消整次联动';
  $('phase').textContent=drag?(drag.valid?'正在直接拖鱼 · 联动预览':'目标受阻 · 松手将取消'):follow?'正在完成追随 · Esc 整段取消':observing?'正在观察水域 · Esc 恢复视角':outcome==='committed'?(settledStatus==='blocked'?'鱼位保留 · 潜水员受阻':'联动已保留 · 可一次撤销'):outcome==='cancelled'?'鱼与潜水员已恢复起点':outcome==='zero'?'无净移动 · 不新增联动':'按住鱼体，开始联动';
  $('step-pick').classList.toggle('active',!!drag);$('step-drag').classList.toggle('active',!!drag&&drag.path.length>1);$('step-drop').classList.toggle('active',!!follow);$('step-follow').classList.toggle('active',!active&&outcome==='committed');
  $('gesture-status').textContent=active?(drag&&!drag.valid?drag.reason+'；非法松手将恢复两者。':'鱼由你的手控制，潜水员沿安全路线追随。'):history.current.nextId>=1_000_000?'编号已耗尽，当前联动仍可查看和备份。':history.current.records.length>=MAX_RECORDS?'记录已满；可备份后恢复初始位置继续。':outcome==='committed'?'一段联动已保留；一次撤销恢复鱼、潜水员与轨迹。':'原摆尾和踢腿是姿态表现，位置由直接拖动与跟随规则控制。';
  scene?.apply(history.current,{camera:false,fish,diver,path,followRoute:show?route:[],ghost:drag&&!drag.valid?drag.candidate:null,speed:active?.speed||0});
}
function refresh(){
  const active=!!operation();$('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo;$('cancel-drag').disabled=!active;$('reset').disabled=!scene||(!history.current.records.length&&!active);$('snapshot').disabled=!scene||active;
  scene?.setCameraInteraction(!active);
  document.querySelectorAll('[data-view]').forEach(button=>{button.disabled=active;button.setAttribute('aria-pressed',String(button.dataset.view===history.current.view));});
  $('record-count').textContent=`${history.current.records.length} / 40`;$('record-list').replaceChildren();
  if(!history.current.records.length){const p=document.createElement('p');p.className='empty-record';p.textContent='尚未保留联动。拖鱼并松手，等待潜水员停稳。';$('record-list').append(p);}
  else for(const record of history.current.records.toReversed()){const row=document.createElement('div');row.className='record';const title=document.createElement('span');title.textContent=`${String(record.id).padStart(2,'0')} · ${record.diver.legacy?'原单鱼移动':'鱼与潜水员联动'}`;const detail=document.createElement('small'),from=record.path[0],to=record.path.at(-1);detail.textContent=`鱼 (${from[0].toFixed(2)}, ${from[1].toFixed(2)}) → (${to[0].toFixed(2)}, ${to[1].toFixed(2)})`;row.append(title,detail);$('record-list').append(row);}
  renderMotion();
}
function finishCamera(){clearTimeout(cameraTimer);if(history.pending?.label==='观察水下视角'&&!scene?.cameraHeld){try{if(history.commit())persist();}catch(error){toast(error.message);scene?.setCamera(history.current.camera);}refresh();}}
function cancel({notice=true}={}){const pending=!!operation()||!!history.pending;drag=null;follow=null;accumulator=0;clearTimeout(cameraTimer);scene?.abortPointer();if(history.pending)history.cancel();scene?.cancelCamera?.(history.current.camera);scene?.setCamera(history.current.camera);if(pending)outcome='cancelled';refresh();if(notice&&pending)toast('已取消整次联动，鱼与潜水员完整恢复');}
function startDrag(){
  if(follow){drag={...follow,valid:true,candidate:[...follow.fish.position],reason:''};delete drag.fish;follow=null;refresh();return true;}
  finishCamera();if(history.pending)cancel({notice:false});
  if(history.current.records.length>=MAX_RECORDS||history.current.nextId>=1_000_000){toast('记录容量或编号已满，这次联动未开始');refresh();return false;}
  history.begin('鱼与潜水员联动');accumulator=0;
  const diver=structuredClone(history.current.diver);drag={path:[[...history.current.fish.position]],startHeading:history.current.fish.heading,valid:true,candidate:[...history.current.fish.position],reason:'',diver,diverPath:[[...diver.position]],plan:planFollow(diver,history.current.fish.position),speed:0,elapsed:0};outcome='initial';refresh();return true;
}
function updateDrag(candidate){
  if(!drag)return;drag.candidate=[...candidate];const last=drag.path.at(-1),check=canFishPastDiver(last,candidate,drag.diver);drag.valid=check.valid;drag.reason=check.reason;
  if(!check.valid){renderMotion();return;}if(last[0]===candidate[0]&&last[1]===candidate[1]){renderMotion();return;}
  const before=drag.path.at(-2);if(before){const dx=candidate[0]-before[0],dz=candidate[1]-before[1],length=Math.hypot(dx,dz),deviation=length===0?Infinity:Math.abs((last[0]-before[0])*dz-(last[1]-before[1])*dx)/length,projection=(last[0]-before[0])*dx+(last[1]-before[1])*dz;if(deviation<.008&&projection>=0&&projection<=length*length&&canMove(before,candidate).valid)drag.path.pop();}
  if(drag.path.length>=MAX_PATH_POINTS){drag.valid=false;drag.reason='这段鱼的轨迹太长，请分次完成联动';renderMotion();return;}
  drag.path.push([...candidate]);drag.plan=planFollow(drag.diver,currentFish().position);renderMotion();
}
function appendDiverSample(active,point){
  const last=active.diverPath.at(-1);if(last[0]===point[0]&&last[1]===point[1])return;const before=active.diverPath.at(-2);
  if(before){const dx=point[0]-before[0],dz=point[1]-before[1],length=Math.hypot(dx,dz),deviation=length===0?Infinity:Math.abs((last[0]-before[0])*dz-(last[1]-before[1])*dx)/length,projection=(last[0]-before[0])*dx+(last[1]-before[1])*dz;if(deviation<.0008&&projection>=0&&projection<=length*length&&canDiverMove(before,point).valid)active.diverPath.pop();}
  if(active.diverPath.length>=MAX_DIVER_PATH_POINTS)throw new Error('这段跟随轨迹太长，请分次完成联动');active.diverPath.push([...point]);
}
function finishDrag(){
  if(!drag)return;if(!drag.valid){const reason=drag.reason;cancel({notice:false});toast(reason+'；鱼与潜水员已回到整个起点');return;}
  const baseline=history.pending.state.fish.position,last=drag.path.at(-1);
  if(drag.path.length<2||(last[0]===baseline[0]&&last[1]===baseline[1])){cancel({notice:false});outcome='zero';refresh();toast('鱼没有净移动，整次联动未入账');return;}
  follow={...drag,fish:currentFish()};drag=null;follow.plan=planFollow(follow.diver,follow.fish.position);refresh();
}
function commitFollow(){
  const completed=follow;follow=null;
  try{history.current=appendDrag(history.current,completed.path,{from:history.pending.state.diver,to:completed.diver,path:completed.diverPath});const changed=history.commit();settledStatus=completed.plan.status;outcome=changed?'committed':'zero';if(changed)persist();refresh();toast(settledStatus==='blocked'?'鱼位已保留；潜水员安全停留，移动鱼可重新寻找通路':'鱼与潜水员已停稳；整段联动可一次撤销');}
  catch(error){history.cancel();outcome='cancelled';refresh();toast(error.message+'，两者已恢复起点');}
}
function tick(dt){
  if(!operation()){accumulator=0;return;}accumulator+=dt;
  try{while(accumulator>=STEP&&operation()){accumulator-=STEP;const active=operation(),before=active.diver.position,next=advanceFollower(active.plan,active.diver,STEP);active.diver=next.pose;active.plan=next.plan;active.speed=Math.hypot(before[0]-next.pose.position[0],before[1]-next.pose.position[1])/STEP;appendDiverSample(active,next.pose.position);if(follow){active.elapsed+=STEP;if(active.elapsed>45)throw new Error('跟随未能及时停稳');if(next.settled){commitFollow();return;}}}renderMotion();}
  catch(error){cancel({notice:false});toast(error.message+'，整次联动已恢复');}
}
function edit(label,fn,{camera=false,propagate=false}={}){if(operation())cancel({notice:false});finishCamera();try{if(history.edit(label,fn))persist();outcome='initial';if(camera)scene?.setCamera(history.current.camera);refresh();return true;}catch(error){if(propagate)throw error;toast(error.message);refresh();return false;}}
$('cancel-drag').addEventListener('click',()=>cancel());$('reset').addEventListener('click',()=>edit('恢复初始鱼与潜水员',resetFish));$('show-follow-route').addEventListener('change',renderMotion);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>edit('切换水下视角',state=>setView(state,button.dataset.view),{camera:true})));
for(const action of ['undo','redo'])$(action).addEventListener('click',()=>{if(operation()||history.pending){cancel();return;}if(history[action]()){outcome='initial';scene?.setCamera(history.current.camera);persist();refresh();toast(action==='undo'?'已撤销整次联动':'已重做整次联动');}});
$('save').addEventListener('click',()=>{if(operation())cancel({notice:false});finishCamera();persist({explicit:true});refresh();});
$('backup').addEventListener('click',()=>{if(operation())cancel({notice:false});finishCamera();$('json-text').value=serializeState(history.current);$('json-message').textContent='';$('json-dialog').showModal();});
$('import-json').addEventListener('click',()=>{try{const next=parseState($('json-text').value);edit('打开水下联动工作区',()=>next,{camera:true,propagate:true});$('json-dialog').close();toast('已恢复鱼、潜水员、路径记录与视角');}catch(error){$('json-message').textContent='没有应用：'+error.message;}});
$('download-json').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([serializeState(history.current)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='atelier-underwater-follow.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);});
$('snapshot').addEventListener('click',()=>{if(!scene||operation())return;$('snapshot-image').src=scene.screenshot();$('snapshot-dialog').showModal();});
$('download-snapshot').addEventListener('click',()=>{const link=document.createElement('a');link.href=$('snapshot-image').src;link.download='atelier-underwater-follow.png';link.click();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));$('retry').addEventListener('click',()=>location.reload());
window.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if(event.key==='Escape'){cancel();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}});
window.addEventListener('blur',()=>cancel({notice:false}));document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel({notice:false});});window.addEventListener('pagehide',()=>persist());
refresh();
try{
  scene=await createUnderwater($('canvas-host'),{project(x,y,visible){$('fish-label').style.left=x+'px';$('fish-label').style.top=y+'px';$('fish-label').hidden=!visible;},projectDiver(x,y,visible){$('diver-label').style.left=x+'px';$('diver-label').style.top=y+'px';$('diver-label').hidden=!visible;},tick,dragStart:startDrag,dragChange:updateDrag,dragEnd:finishDrag,dragCancel:()=>cancel({notice:false}),cameraStart(){if(!operation()&&history.pending?.label!=='观察水下视角'){history.begin('观察水下视角');refresh();}},cameraChange(value){if(!operation()&&history.pending?.label==='观察水下视角'){try{history.current=setCamera(history.current,value);clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,140);}catch(error){toast(error.message);scene?.setCamera(history.current.camera);}}},cameraEnd(){if(!operation()){clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,70);}}});
  scene.apply(history.current);$('loading').hidden=true;refresh();if(unreadable)toast('原有记录无法校验，尚未覆盖；可备份当前联动');else if(migrated){$('save-status').textContent='旧单鱼记录已读取';toast('已读取原单鱼记录；旧文件保留，潜水员从安全站位开始');}
}catch(error){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=error.message;console.error(error);}
