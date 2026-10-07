import { SAMPLES, PORTS, MAX_RECORDS, History, initialState, validateState, sample, calculateRun, appendRun, targetAt, setSource, setView, selectSample, resetSample, resetSamples } from './core.js';
import { createMaterials } from './scene.js';
import { COMPARISON_DOSES, prepareComparison, calculateDoseRun, appendDoseRun } from './comparison.js';
import { createComparisonView } from './comparison-view.js';

const KEY='atelier-materials-workspace-v1',$=id=>document.getElementById(id);
let clockRate=1;
let saved=null,unreadable=false;
try{const raw=localStorage.getItem(KEY);if(raw)saved=validateState(JSON.parse(raw));}catch{unreadable=true;}
const history=new History(saved||initialState());
let scene=null,active=null,dragging=false,dragValid=true,frameId=null,cameraTimer=null,lastPaint=0,toastTimer;
let comparison=null,lastComparison=null;
const comparisonView=createComparisonView($('comparison-chart'));
const name=id=>SAMPLES[id].name;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
function persist({explicit=false}={}){if(unreadable&&!explicit){$('save-status').textContent='旧记录未覆盖';return;}try{localStorage.setItem(KEY,JSON.stringify(history.pending?.state||history.current));unreadable=false;$('save-status').textContent='已保存在本机';}catch{$('save-status').textContent='尚未保存';toast('本机存储未能写入，仍可用JSON保留实验');}}
function finishCamera(){clearTimeout(cameraTimer);if(history.pending?.label==='观察材料视角'&&!scene?.cameraHeld){try{if(history.commit())persist();}catch(e){toast(e.message);scene?.setCamera(history.current.camera);}refresh();}}
function previewRun(now=performance.now()){
  if(!active)return null;
  const seconds=Math.max(0,(now-active.start)/1000*active.rate);
  return comparison?calculateDoseRun(history.current,active.id,comparison.doseJ,seconds):calculateRun(history.current,active.id,seconds);
}
function renderComparison(energies){
  comparisonView.update({energies});
  const doseJ=comparison?.doseJ||Number($('compare-dose').value);
  $('compare-goal').textContent=`计算参照 · 各吸收${doseJ} J后：铜 ${sample('copper',doseJ).temperatureC.toFixed(1)} °C，铝 ${sample('aluminum',doseJ).temperatureC.toFixed(1)} °C。`;
  $('compare-status').textContent=comparison?`第${comparison.stage+1}/2步 · 向${name(active.id)}供能，目标${doseJ} J。`:
    lastComparison?.kind==='complete'?`对照完成 · 各吸收${lastComparison.doseJ} J。铜升温 +${(sample('copper',energies.copper).temperatureC-25).toFixed(1)} °C，铝 +${(sample('aluminum',energies.aluminum).temperatureC-25).toFixed(1)} °C。`:
    lastComparison?.kind==='paused'?'对照已暂停，已输入的热量与记录保留；一次撤销恢复对照前实验。':'选择每个样品的热量，重新开始铜→铝对照。';
  const resultDose=comparison?.doseJ||lastComparison?.doseJ;
  $('compare-progress').value=resultDose?Math.min(1,energies.copper/resultDose)+Math.min(1,energies.aluminum/resultDose):0;
  $('compare-progress').hidden=!comparison&&!lastComparison;
}
function renderReadings(run=null){
  const energies={...history.current.energies};if(run)energies[run.material]=run.totalEnergyJ;
  for(const id of Object.keys(SAMPLES)){
    const reading=sample(id,energies[id]),b=document.querySelector(`[data-sample="${id}"]`),marker=document.querySelector(`[data-sample-marker="${id}"]`);
    const text=id==='ice'?`融化 ${(reading.meltFraction*100).toFixed(1)}%`:`${reading.temperatureC.toFixed(1)} °C`;
    b.querySelector('b').textContent=text;b.querySelector('.sample-value small').textContent=`${reading.energyJ.toFixed(1)} J${id==='ice'?' · 0.0 °C':''}`;
    b.dataset.energy=reading.energyJ;b.dataset.temperature=reading.temperatureC;b.dataset.meltFraction=reading.meltFraction;
    marker.querySelector('small').textContent=text;
    marker.querySelector('em').textContent=id==='ice'?'0 °C · 热量用于熔化':`升温 +${(reading.temperatureC-25).toFixed(1)} °C`;
    const gauge=marker.querySelector('.temperature-gauge i');if(gauge)gauge.style.width=(reading.progress*100)+'%';
    marker.dataset.heating=String(active?.id===id);marker.dataset.complete=String(reading.complete);
    b.setAttribute('aria-pressed',String(history.current.selected===id));marker.setAttribute('aria-pressed',String(history.current.selected===id));
  }
  const id=history.current.selected;
  const selected=sample(id,energies[id]);
  $('run-energy').textContent=selected.energyJ.toFixed(1)+' J';$('run-seconds').textContent=selected.seconds.toFixed(2)+' s';$('run-progress').value=selected.progress;
  $('run-session').textContent=run?`本次正在输入 ${run.energyJ.toFixed(1)} J · ${run.seconds.toFixed(2)} 教学秒`:selected.complete?(id==='ice'?'冰已融尽，火源自动熄灭。可重新观察。':`${name(id)}已到60 °C上限，火源自动熄灭。可重新观察。`):selected.energyJ>0?'供能已暂停，累计热量和样品状态保留。':'还未吸收热量。拖动火源到圆环，松手点火。';
  if(!active&&history.current.nextId>=1_000_000)$('run-session').textContent='热输入记录编号已耗尽；当前实验仍可查看和备份。请打开编号可用的实验后继续供能。';
  $('selected-note').textContent=id==='ice'?'冰从0 °C开始；吸热后冰体缩小、水层出现，冰水共存时仍为0 °C。融尽自动停止。':`${name(id)}的效果是温度升高。温度条和样品彩环表示25→60 °C的温升；金属保持固态。`;
  $('effect-title').textContent=id==='ice'?(active?'冰正在熔化':selected.complete?'冰已全部融化':'冰：观察形态变化'):(active?`${name(id)}正在升温`:selected.complete?`${name(id)}已升温 +35 °C`:`${name(id)}：观察温度变化`);
  $('effect-detail').textContent=id==='ice'?`累计吸收 ${selected.energyJ.toFixed(1)} J · 融化 ${(selected.meltFraction*100).toFixed(1)}%`:`25 °C → ${selected.temperatureC.toFixed(1)} °C · 累计 ${selected.energyJ.toFixed(1)} J`;
  if(lastComparison?.kind==='complete'){
    $('effect-title').textContent='同热量，温升不同';
    $('effect-detail').textContent=`各${lastComparison.doseJ} J：铜 ${sample('copper',energies.copper).temperatureC.toFixed(1)} °C · 铝 ${sample('aluminum',energies.aluminum).temperatureC.toFixed(1)} °C`;
  }
  $('restart-selected').textContent=`重新观察${name(id)}`;
  $('restart-note').textContent=selected.energyJ>0?`将${name(id)}恢复${id==='ice'?'初始冰体':'25 °C'}后重新供能；其余样品保持。`:'已经是初始样品，移入火源即可观察。';
  const sourceTarget=targetAt(history.current.source),atSource=sourceTarget?sample(sourceTarget,energies[sourceTarget]):null;
  $('source-state').textContent=active?'蓝焰已点燃':'火源已熄灭';
  $('source-detail').textContent=active?`${name(active.id)}正在吸热 · 10 W`:atSource?.complete?(sourceTarget==='ice'?'冰已融尽 · 可重新观察':`${name(sourceTarget)}已到60 °C · 可重新观察`):sourceTarget?'松手命中后供能 · 可点击开始':'移到样品下的圆环，松手点火';
  $('source-marker').dataset.active=String(!!active);$('stage').dataset.heating=String(!!active);
  if(comparison)$('run-session').textContent=`本步正在输入 ${run.energyJ.toFixed(1)} / ${comparison.doseJ} J · ${run.seconds.toFixed(2)} 教学秒`;
  renderComparison(energies);
  if(scene)scene.apply(history.current,{camera:false,energy:energies});
}
function refresh(){
  const idsExhausted=history.current.nextId>=1_000_000;
  $('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo;$('stop').disabled=!active;$('cancel').disabled=!active&&!dragging;
  $('start-selected').disabled=!scene||!!active||dragging||idsExhausted||history.current.records.length>=MAX_RECORDS||sample(history.current.selected,history.current.energies[history.current.selected]).complete;
  $('restart-selected').disabled=!scene||!!active||dragging||idsExhausted||history.current.energies[history.current.selected]===0;
  $('clock-rate').disabled=!!active||dragging;$('clock-rate').value=String(clockRate);
  $('compare-start').disabled=!scene||!!active||dragging;
  $('compare-dose').disabled=!!active||dragging;
  $('compare-stop').disabled=!comparison;$('compare-cancel').disabled=!comparison;
  $('reset').disabled=!Object.values(history.current.energies).some(Boolean)&&!active;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===history.current.view)));
  $('record-count').textContent=`${history.current.records.length} / 40`;
  $('record-list').replaceChildren();if(!history.current.records.length){const p=document.createElement('p');p.className='empty-record';p.textContent='还没有保留的供能过程。';$('record-list').append(p);}else for(const item of history.current.records.toReversed()){
    const row=document.createElement('div');row.className='record';const title=document.createElement('span');title.textContent=`${item.id.toString().padStart(2,'0')} · ${name(item.material)} · ${item.energyJ.toFixed(1)} J`;const time=document.createElement('small');time.textContent=item.seconds.toFixed(2)+' 教学秒';row.append(title,time);$('record-list').append(row);
  }
  const selected=sample(history.current.selected,history.current.energies[history.current.selected]);
  $('phase').textContent=active?`蓝焰供能 · ${name(active.id)}`:dragging?'移到圆环 · 松手点火':selected.complete?(history.current.selected==='ice'?'冰已融尽 · 可重新观察':`${name(history.current.selected)}已到60 °C · 可重新观察`):'火源已熄灭 · 拖到圆环松手点火';
  if(comparison)$('phase').textContent=`同热量对照 ${comparison.stage+1}/2 · ${name(active.id)} → ${comparison.doseJ} J`;
  else if(lastComparison?.kind==='complete')$('phase').textContent=`对照完成 · 铜铝各${lastComparison.doseJ} J`;
  $('run-status').textContent=active?`供能中 · ${name(active.id)}`:'供能已暂停';
  $('source-marker').hidden=dragging;
  renderReadings(previewRun());
}
function cancel({notice=true}={}){
  const wasComparison=!!comparison,pending=!!active||dragging||!!history.pending;active=null;comparison=null;lastComparison=null;dragging=false;cancelAnimationFrame(frameId);clearTimeout(cameraTimer);scene?.abortPointer();
  if(history.pending)history.cancel();scene?.setHeating(false);scene?.cancelCamera(history.current.camera);refresh();
  if(notice&&pending)toast(wasComparison?'已取消整个对照，三个样品和旧账本完整恢复':'已取消本次输入，样品与旧记录保持');
}
function finishRun({message=true,advance=false}={}){
  if(!active)return;const run=previewRun(),id=active.id,session=comparison;cancelAnimationFrame(frameId);
  if(session){
    try{
      history.current=appendDoseRun(history.current,id,session.doseJ,run.seconds);
      if(advance&&run.targetReached&&session.stage===0){
        session.stage=1;
        history.current=setSource(selectSample(history.current,'aluminum'),[...PORTS.find(p=>p.id==='aluminum').position]);
        active={id:'aluminum',start:performance.now(),rate:session.rate};scene.setHeating(true,'aluminum');refresh();frameId=requestAnimationFrame(tick);return;
      }
      active=null;comparison=null;
      lastComparison={doseJ:session.doseJ,kind:advance&&run.targetReached&&session.stage===1?'complete':'paused'};
      const changed=history.commit();scene.setHeating(false);if(changed)persist();refresh();
      if(message)toast(lastComparison.kind==='complete'?'同热量对照完成；两块金属的温升不同，冰保持原状':'已暂停整个对照并保留输入；可一次撤销');
    }catch(e){active=null;comparison=null;lastComparison=null;history.cancel();scene?.setHeating(false);refresh();toast(e.message);}
    return;
  }
  active=null;
  try{history.current=appendRun(history.current,id,run.seconds);const changed=history.commit();scene?.setHeating(false);if(changed)persist();refresh();if(message)toast(run.complete?(id==='ice'?'冰已融尽，供能自动停止':'到达60 °C教学上限，供能自动停止'):'已暂停供能并保留过程');}
  catch(e){history.cancel();scene?.setHeating(false);refresh();toast(e.message);}
}
function startHeat(id,{drag=false,restart=false}={}){
  finishCamera();if(!drag&&history.pending)cancel({notice:false});
  if(history.current.nextId>=1_000_000){if(history.pending)history.cancel();scene?.setHeating(false);refresh();toast('热输入记录编号已耗尽，本次供能未开始，原实验保持');return;}
  lastComparison=null;
  if(!restart&&(history.current.records.length>=MAX_RECORDS||sample(id,history.current.energies[id]).complete)){if(!history.pending)history.begin('选择已完成样品');history.current=selectSample(history.current,id);if(history.commit())persist();scene?.setHeating(false);refresh();toast(`${name(id)}已到终点，或账本已满；点击“重新观察${name(id)}”继续`);return;}
  if(!history.pending)history.begin(restart?'重新观察材料':'材料供能过程');
  if(restart)history.current=resetSample(history.current,id);
  if(history.current.records.length>=MAX_RECORDS){history.cancel();refresh();toast('账本已满，请先恢复初始样品');return;}
  history.current=setSource(history.current,[...PORTS.find(p=>p.id===id).position]);
  history.current=selectSample(history.current,id);active={id,start:performance.now(),rate:clockRate};scene.setHeating(true,id);refresh();frameId=requestAnimationFrame(tick);
}
function startComparison(){
  if(!scene||active||dragging)return;
  finishCamera();if(history.pending)cancel({notice:false});
  try{
    const doseJ=Number($('compare-dose').value),next=prepareComparison(history.current,doseJ);
    history.begin('同热量铜铝对照');history.current=next;
    comparison={doseJ,stage:0,rate:clockRate};lastComparison=null;
    active={id:'copper',start:performance.now(),rate:clockRate};
    $('comparison-details').open=true;$('comparison-details').scrollIntoView({block:'start',behavior:'smooth'});
    scene.apply(history.current,{camera:false});scene.setHeating(true,'copper');refresh();frameId=requestAnimationFrame(tick);
  }catch(e){active=null;comparison=null;lastComparison=null;history.cancel();scene?.setHeating(false);toast(e.message);refresh();}
}
function tick(now){if(!active)return;const run=previewRun(now);if(now-lastPaint>65){renderReadings(run);lastPaint=now;}if(comparison?run.targetReached:run.complete){finishRun({advance:!!comparison});return;}frameId=requestAnimationFrame(tick);}
function edit(label,fn,{camera=false,propagate=false}={}){
  if(active||dragging)cancel({notice:false});lastComparison=null;finishCamera();try{if(history.edit(label,fn))persist();if(camera)scene?.setCamera(history.current.camera);refresh();return true;}catch(e){if(propagate)throw e;toast(e.message);refresh();return false;}
}
$('stop').addEventListener('click',()=>finishRun());$('cancel').addEventListener('click',()=>cancel());
$('start-selected').addEventListener('click',()=>startHeat(history.current.selected));
$('restart-selected').addEventListener('click',()=>startHeat(history.current.selected,{restart:true}));
$('compare-start').addEventListener('click',startComparison);
$('comparison-details').addEventListener('toggle',()=>{if($('comparison-details').open)$('comparison-details').scrollIntoView({block:'start',behavior:'smooth'});});
$('compare-stop').addEventListener('click',()=>finishRun());$('compare-cancel').addEventListener('click',()=>cancel());
$('compare-dose').addEventListener('change',()=>{if(active||dragging)return;const dose=Number($('compare-dose').value);if(!COMPARISON_DOSES.includes(dose))$('compare-dose').value='40';lastComparison=null;renderReadings();});
$('clock-rate').addEventListener('change',()=>{if(active||dragging){$('clock-rate').value=String(clockRate);return;}const rate=Number($('clock-rate').value);if(rate===1||rate===4)clockRate=rate;else $('clock-rate').value=String(clockRate);});
$('reset').addEventListener('click',()=>edit('恢复初始样品',s=>resetSamples(s)));
document.querySelectorAll('[data-sample],[data-sample-marker]').forEach(b=>b.addEventListener('click',()=>{if(active)finishRun();edit('选择材料样品',s=>selectSample(s,b.dataset.sample||b.dataset.sampleMarker));}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{if(active){history.current=setView(history.current,b.dataset.view);scene.setCamera(history.current.camera);refresh();}else edit('切换材料视角',s=>setView(s,b.dataset.view),{camera:true});}));
for(const id of ['undo','redo'])$(id).addEventListener('click',()=>{if(active||dragging||history.pending){cancel();return;}if(history[id]()){lastComparison=null;scene?.setCamera(history.current.camera);scene?.setHeating(false);persist();refresh();toast(id==='undo'?'已撤销':'已重做');}});
$('save').addEventListener('click',()=>{if(active)finishRun({message:false});if(dragging)cancel({notice:false});finishCamera();persist({explicit:true});refresh();});
$('backup').addEventListener('click',()=>{if(active)finishRun({message:false});if(dragging)cancel({notice:false});finishCamera();$('json-text').value=JSON.stringify(history.current,null,2);$('json-message').textContent='';$('json-dialog').showModal();});
$('import-json').addEventListener('click',()=>{try{const raw=$('json-text').value;if(new TextEncoder().encode(raw).length>32768)throw Error('实验配置最多32 KiB');const next=validateState(JSON.parse(raw));edit('打开材料实验',()=>next,{camera:true,propagate:true});$('json-dialog').close();toast('已恢复实验与完整能量账');}catch(e){$('json-message').textContent='没有应用：'+e.message;}});
$('download-json').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(history.current,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='atelier-materials.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);});
$('snapshot').addEventListener('click',()=>{if(!scene)return;if(active||dragging){toast('请先暂停并记录，或取消本次供能，再保留图片');return;}$('snapshot-image').src=scene.screenshot();$('snapshot-dialog').showModal();});
$('download-snapshot').addEventListener('click',()=>{const a=document.createElement('a');a.href=$('snapshot-image').src;a.download='atelier-materials.png';a.click();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));$('retry').addEventListener('click',()=>location.reload());
window.addEventListener('keydown',e=>{if(e.key==='Escape'){cancel();return;}if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}});
window.addEventListener('blur',()=>cancel({notice:false}));document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel({notice:false});});window.addEventListener('pagehide',()=>persist());
refresh();
try{scene=await createMaterials($('canvas-host'),{
  project(id,x,y,visible){const node=id==='source'?$('source-marker'):document.querySelector(`[data-sample-marker="${id}"]`);node.style.left=x+'px';node.style.top=y+'px';node.hidden=!visible||(id==='source'&&dragging);},
  dragStart(){if(active)finishRun();finishCamera();dragging=true;dragValid=true;history.begin('拖动火源并供能');scene.setHeating(false);refresh();},
  dragChange(point,target,bounded){dragValid=bounded;if(bounded){history.current=setSource(history.current,point);scene.setSource(point);}scene.setHeating(false,target);$('phase').textContent=!bounded?'超出拖动范围 · 释放将取消':target?`松手向${name(target)}供能`:'移到样品下的圆环';},
  dragEnd(){dragging=false;const id=dragValid?targetAt(history.current.source):null;if(!dragValid){history.cancel();scene.setHeating(false);refresh();toast('火源超出范围，已恢复原位置');return;}if(id)startHeat(id,{drag:true});else{if(history.commit())persist();scene.setHeating(false);refresh();toast('未对准样品，材料未吸收热量');}},
  dragCancel(){dragging=false;history.cancel();scene.setHeating(false);refresh();},
  cameraStart(){if(active)return;if(history.pending?.label!=='观察材料视角')history.begin('观察材料视角');},
  cameraChange(camera){if(active||history.pending?.label==='观察材料视角'){history.current.camera=camera;history.current.view='custom';if(!active){clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,140);}}},
  cameraEnd(){if(!active){clearTimeout(cameraTimer);cameraTimer=setTimeout(finishCamera,60);}},
});scene.apply(history.current);$('loading').hidden=true;refresh();if(unreadable)toast('原有本机记录无法校验，尚未覆盖；可先备份当前实验');}
catch(e){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=e.message;console.error(e);}
