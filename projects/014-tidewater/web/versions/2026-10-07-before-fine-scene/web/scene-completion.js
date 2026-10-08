import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { validateCompletionRecipe, completionConsistency } from './scene-completion-core.js';
import { createRealisticScene } from './realistic/scene.js';
import { createAssetJob } from './asset-generation-core.js';

const $ = id => document.getElementById(id), endpoint = 'http://127.0.0.1:4198';
const names = { land:'陆地', water:'水域', road:'道路', cabin:'小屋', lighthouse:'灯塔', palm:'棕榈', boat:'船' };
let scene=null, state=null, previous=null, busy=false, available=false, restored=false, lastSource='', coarse=false, downloadURL=null;
const controls=['completion-generate','completion-refine','completion-coarse','completion-overview','completion-hero','completion-focus','completion-reverse','completion-accept','completion-revert','completion-export'];
const planNow=()=>{if(!window.creationStudio?.ready)throw new Error('草案正在恢复，请稍后。');return validatePlan(window.creationStudio.plan);};
function status(value){$('completion-status').textContent=value;}
function showError(error){$('completion-error').textContent=error?String(error.message||error):'';$('completion-error').hidden=!error;}
function selectInScene(id){if(busy)return;const target=$('completion-target');if(![...target.options].some(option=>option.value===id)){status('这个对象已锁定，保留原有决定。');return;}target.value=id;status(`已选中${names[planNow().entities.find(e=>e.id===id).kind]}，填写希望修改的内容。`);refreshControls();}
function refreshControls(){
  let matches=false,nonempty=false;try{const plan=planNow();matches=state?.recipe.sourceFingerprint===fingerprintPlan(plan);nonempty=!!plan.entities.length;}catch{}
  controls.forEach(id=>$(id).disabled=busy||!scene);
  $('completion-generate').disabled=busy||!available||!nonempty;
  $('completion-refine').disabled=busy||!available||!matches||!$('completion-target').value;
  $('completion-accept').disabled=busy||!matches;
  $('completion-export').disabled=busy||!state;
  $('completion-revert').disabled=busy||!previous;
  $('completion-coarse').setAttribute('aria-pressed',String(coarse));
  $('completion-coarse').textContent=coarse?'返回模型候选':'同视角对照粗模';
  for(const id of ['completion-intent','completion-target','completion-edit'])$(id).disabled=busy;
}
async function health(){
  $('completion-health').textContent='正在检查控制模型…';
  try{const res=await fetch(`${endpoint}/health`);if(!res.ok)throw new Error(`服务检查失败 (${res.status})`);const data=await res.json();available=data.available===true;$('completion-health').textContent=available?`控制模型可用 · ${data.provider} · ${data.cliVersion}`:`控制模型不可用：${data.error||'尚未登录'}`;}catch{available=false;$('completion-health').textContent='本机控制模型服务未连接；启动 tools/control-model-server.mjs 后重新检查。';}
  refreshControls();
}
async function storage(mode,value){
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('tidewater-scene-completion',1);req.onupgradeneeded=()=>req.result.createObjectStore('scenes');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('scenes',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('scenes'),req=mode==='read'?store.get('current'):store.put(value,'current');let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存没有完成。'));});}finally{db.close();}
}
function layoutImage(plan){
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=Math.round(960*plan.world.depth/plan.world.width);canvas.height=Math.max(240,Math.min(960,canvas.height));
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.fillStyle='#b9dfe5';ctx.fillRect(0,0,w,h);
  const colors={land:'#b4bd8e',water:'#549cab',road:'#dfc69c',cabin:'#ad6f45',lighthouse:'#d2ddde',palm:'#477e45',boat:'#e7e1c8'};
  for(const kind of ['land','water','road','cabin','lighthouse','palm','boat'])for(const entity of plan.entities.filter(e=>e.kind===kind)){
    const points=entity.points;ctx.strokeStyle='#345b58';ctx.fillStyle=colors[kind];ctx.lineWidth=kind==='road'?8:2;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h));
    if(['land','water'].includes(kind)){ctx.closePath();ctx.fill();ctx.stroke();}else if(kind==='road')ctx.stroke();else{ctx.beginPath();ctx.arc(points[0].x*w,points[0].y*h,kind==='palm'?7:9,0,Math.PI*2);ctx.fill();ctx.stroke();}
    const p=points[Math.floor(points.length/2)];ctx.fillStyle='#183b39';ctx.font='12px "Microsoft YaHei",sans-serif';ctx.fillText(`${names[kind]} ${entity.id.slice(-4)}`,p.x*w+9,p.y*h-9);
  }
  ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(10,10,Math.min(w-20,420),43);ctx.fillStyle='#183b39';ctx.font='16px "Microsoft YaHei",sans-serif';ctx.fillText(`用户布局 · ${plan.world.width} × ${plan.world.depth} 米`,20,37);
  return canvas.toDataURL('image/png');
}
async function downscale(dataUrl){
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('视图图片无法解码。'));img.src=dataUrl;});
  const canvas=document.createElement('canvas'),scale=Math.min(1,960/img.width);canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
function showInputs(views){
  const parent=$('completion-input-images');parent.replaceChildren();
  for(const view of views){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=view.dataUrl;img.alt=view.label;caption.textContent=view.label;figure.append(img,caption);parent.append(figure);}
}
async function sourceViews(plan){
  status('读取当前布局，准备绘笔图与粗模视角…');scene?.dispose();scene=null;
  scene=await createRealisticScene({canvas:$('completion-canvas'),plan,mode:'coarse',onProgress:p=>status(typeof p==='string'?p:p.detail)});
  $('completion-empty').hidden=true;scene.setMode('coarse');coarse=true;
  const views=[{label:'用户绘笔布局（原轮廓与稳定对象 ID）',dataUrl:layoutImage(plan)}];
  scene.setView('overview');views.push({label:'原粗模斜视（空间与高度）',dataUrl:await downscale(scene.capture())});
  scene.reverseView();views.push({label:'原粗模另一侧（相同空间）',dataUrl:await downscale(scene.capture())});
  if(plan.reference)views.push({label:'用户原始参考图',dataUrl:plan.reference.dataUrl});
  scene.setView('overview');showInputs(views);return views;
}
async function renderCandidate(candidate){
  const recipe=validateCompletionRecipe(candidate.recipe,candidate.sourcePlan);
  scene?.dispose();scene=null;
  scene=await createRealisticScene({canvas:$('completion-canvas'),plan:candidate.sourcePlan,completionRecipe:recipe,onSelect:selectInScene,onProgress:p=>status(typeof p==='string'?p:p.detail)});
  scene.setWorldQuality(true);await scene.setLighting(recipe.environment.lighting);
  const resources=[];
  for(const look of recipe.objects){
    if(!['coastal-cabin','fishing-boat'].includes(look.treatment))continue;
    const entity=candidate.sourcePlan.entities.find(e=>e.id===look.id);if(entity.locked)continue;
    const name=entity.kind==='cabin'?'cabin-generated-v1.glb':'boat-generated-v1.glb';
    try{status(`执行模型方案：完善${names[entity.kind]} ${entity.id.slice(-4)}…`);const spec=createAssetJob(candidate.sourcePlan,entity.id).spec;await scene.previewAssetOverride(entity.id,new URL(`assets/neural/${name}`,import.meta.url).href,spec);scene.setAssetRotation(entity.id,look.rotationDeg);scene.applyCompletionAssetLook(entity.id);scene.commitAssetOverride(entity.id);resources.push({entityId:entity.id,source:`已有神经资产 ${name}`});}catch(error){throw new Error(`${entity.id}的模型指定资产没有载入：${error.message}`);}
  }
  scene.setMode('realistic');coarse=false;scene.setView('overview');if(candidate.viewState)scene.setViewState(candidate.viewState);$('completion-empty').hidden=true;
  candidate.execution={resources,renderer:scene.getStats().renderer,stats:scene.getStats(),mode:'registered-scene-tools',generatedNewMeshesByNeuralModel:false};
  showInputs(candidate.views||[]);$('completion-summary').textContent=recipe.summary;
  const checks=completionConsistency(candidate.sourcePlan,recipe,candidate.previousRecipe,candidate.scopeIds||[]);
  candidate.consistency=checks;$('completion-consistency').textContent=`${checks.entityCount} 个区域 / 对象均保留原空间与 ID。${checks.unchangedOutsideScope?'局部修改的范围外记录与全局环境保持一致。':''}材质、造型、多视角与接触关系仍需检查。`;
  $('completion-receipt').textContent=JSON.stringify({receipt:candidate.receipt,consistency:checks,recipe,execution:candidate.execution},null,2);
  $('completion-saved').textContent=candidate.savedAt?'已保存':'待确认';
  status(candidate.savedAt?'已恢复保存的模型场景。':'模型候选已生成，等待你检查。');refreshControls();
}
async function run(mode){
  if(busy)return;
  let plan;try{plan=planNow();if(!plan.entities.length)throw new Error('先绘制布局。');if(mode==='refine'&&(!state||state.recipe.sourceFingerprint!==fingerprintPlan(plan)))throw new Error('原布局已变化，请先重新生成完整场景。');if(mode==='refine'&&!$('completion-edit').value.trim())throw new Error('请描述选中区域需要怎样修改。');}catch(error){showError(error);return;}
  const before=state;busy=true;showError(null);refreshControls();
  try{
    const viewState=scene?.getViewState(),currentImage=mode==='refine'&&scene?await downscale(scene.capture()):null;
    const views=await sourceViews(plan),scopeIds=mode==='refine'?[$('completion-target').value]:[];
    if(currentImage){if(views.length===4)views.splice(2,1);views.push({label:'当前已确认场景（局部修改前的完整外观）',dataUrl:currentImage});showInputs(views);}
    const request={plan,intent:mode==='refine'?$('completion-edit').value:$('completion-intent').value,views,mode,...(mode==='refine'?{previousRecipe:before.recipe,scopeIds}: {})};
    status('正在将原图、布局与粗模视角交给真实控制模型…');
    const created=await fetch(`${endpoint}/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});let job=await created.json();if(!created.ok)throw new Error(job.error||`模型任务提交失败 (${created.status})`);
    while(['queued','running'].includes(job.status)){
      status(job.status==='queued'?'已排队，等待控制模型开始。':mode==='refine'?'模型正在依据原输入修改指定区域…':'模型正在依据原图与粗模完善整片场景…');$('completion-receipt').textContent=JSON.stringify({id:job.id,status:job.status,progress:job.progress,input:{sourceFingerprint:fingerprintPlan(plan),viewLabels:views.map(v=>v.label),mode,scopeIds}},null,2);
      await new Promise(resolve=>setTimeout(resolve,1200));const res=await fetch(`${endpoint}/jobs/${job.id}`);if(!res.ok)throw new Error('读取模型任务失败。');job=await res.json();
    }
    if(job.status!=='succeeded')throw new Error(job.error||'模型任务没有完成。');
    if(fingerprintPlan(planNow())!==fingerprintPlan(plan))throw new Error('生成期间草案已改变；这个候选保留在任务记录中，不能应用到新布局。');
    const recipe=validateCompletionRecipe(job.recipe,plan,mode==='refine'?{previousRecipe:before.recipe,scopeIds}:{});
    const candidate={sourcePlan:plan,recipe,receipt:job.receipt,views,requestIntent:request.intent,previousRecipe:mode==='refine'?before.recipe:null,scopeIds,savedAt:null,viewState:mode==='refine'?viewState:null};
    await renderCandidate(candidate);previous=before;state=candidate;
    status(mode==='refine'?'局部修改已完成，其余区域的方案保持一致。':'模型已依据这份图与粗模生成完整候选。');
  }catch(error){showError(error);if(before){try{await renderCandidate(before);}catch{}state=before;}status('本次生成没有应用，原草案与已确认结果保留。');}
  finally{busy=false;refreshControls();}
}
$('completion-generate').addEventListener('click',()=>run('generate'));
$('completion-refine').addEventListener('click',()=>run('refine'));
$('completion-health-recheck').addEventListener('click',health);
$('completion-target').addEventListener('change',refreshControls);
$('completion-coarse').addEventListener('click',()=>{if(!scene)return;coarse=!coarse;scene.setMode(coarse?'coarse':'realistic');refreshControls();});
$('completion-overview').addEventListener('click',()=>scene?.setView('overview'));
$('completion-hero').addEventListener('click',()=>scene?.setView('hero'));
$('completion-focus').addEventListener('click',()=>scene?.focusEntity($('completion-target').value));
$('completion-reverse').addEventListener('click',()=>scene?.reverseView());
$('completion-accept').addEventListener('click',async()=>{
  try{if(!state||state.recipe.sourceFingerprint!==fingerprintPlan(planNow()))throw new Error('原布局已变化，不能确认过期候选。');const saved={...state,savedAt:new Date().toISOString(),viewState:scene.getViewState()};await storage('write',saved);state=saved;$('completion-saved').textContent='已保存';status('模型场景已独立保存，原草案保持。');}catch(error){showError(error);}
});
$('completion-revert').addEventListener('click',async()=>{if(!previous||busy)return;busy=true;refreshControls();try{const swap=state;await renderCandidate(previous);state=previous;previous=swap;status('已还原上一候选，可以继续比较。');}catch(error){showError(error);}finally{busy=false;refreshControls();}});
$('completion-export').addEventListener('click',()=>{
  if(!state)return;if(downloadURL?.startsWith('blob:'))URL.revokeObjectURL(downloadURL);
  const artifact={format:'tidewater-completion-export.v1',exportedAt:new Date().toISOString(),scene:state};downloadURL=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(artifact,null,2))}`;const link=$('completion-download');link.href=downloadURL;link.download='tidewater-model-scene.json';link.hidden=false;link.textContent='场景方案与实际输入已准备好 ↓';link.click();
});
async function observeSource(){
  if(!window.creationStudio?.ready)return;
  const plan=planNow(),fp=fingerprintPlan(plan);
  if(lastSource!==fp){
    lastSource=fp;$('completion-source').textContent=`当前「${plan.name}」 · ${plan.entities.length} 个区域 / 对象 · ${plan.world.width} × ${plan.world.depth} 米`;
    const target=$('completion-target'),old=target.value;target.replaceChildren();
    for(const e of plan.entities.filter(e=>!e.locked)){const option=document.createElement('option');option.value=e.id;option.textContent=`${names[e.kind]} · ${e.id.slice(-8)}`;target.append(option);}if([...target.options].some(o=>o.value===old))target.value=old;
    if(state&&state.recipe.sourceFingerprint!==fp){$('completion-saved').textContent='输入已变化';status('布局已修改。现有候选保留，重新生成后采用新布局。');}
    refreshControls();
  }
  if(!restored){restored=true;
    try{const saved=await storage('read');if(saved&&saved.recipe.sourceFingerprint===fp){busy=true;refreshControls();await renderCandidate(saved);state=saved;}else if(saved){$('completion-saved').textContent='另有旧布局存档';}}catch(error){showError(`保存的模型场景未能恢复：${error.message}`);}finally{busy=false;refreshControls();}
  }
}
health();observeSource();setInterval(observeSource,700);
window.addEventListener('pagehide',()=>{scene?.dispose();if(downloadURL?.startsWith('blob:'))URL.revokeObjectURL(downloadURL);});
