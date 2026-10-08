import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { validateCompletionRecipe, completionConsistency } from './scene-completion-core.js';
import { createRealisticScene } from './realistic/scene.js';
import { createAssetJob } from './asset-generation-core.js';
import { validateFineGeometry, fineGeometryDiagnostics } from './fine-geometry-core.js';
import { buildSceneDelivery } from './scene-delivery.js';
import { fineRefinementScope, assertFineRefinementPreserved } from './fine-refinement-core.js';

const $ = id => document.getElementById(id), endpoint = 'http://127.0.0.1:4198';
const names = { land:'陆地', water:'水域', road:'道路', cabin:'小屋', lighthouse:'灯塔', palm:'棕榈', boat:'船' };
const fineKinds=['cabin','lighthouse','palm','boat'];
let scene=null, state=null, previous=null, busy=false, available=false, restored=false, lastSource='', coarse=false, downloadURL=null, delivery=null;
const controls=['completion-fine-generate','completion-fine-repair','completion-generate','completion-refine','completion-coarse','completion-overview','completion-hero','completion-focus','completion-reverse','completion-accept','completion-revert','completion-export','completion-import','completion-project','completion-glb'];
const planNow=()=>{if(!window.creationStudio?.ready)throw new Error('草案正在恢复，请稍后。');return validatePlan(window.creationStudio.plan);};
function status(value){$('completion-status').textContent=value;}
function showError(error){$('completion-error').textContent=error?String(error.message||error):'';$('completion-error').hidden=!error;}
function selectInScene(id){if(busy)return;const target=$('completion-target');if(![...target.options].some(option=>option.value===id)){status('这个对象已锁定，保留原有决定。');return;}target.value=id;status(`已选中${names[planNow().entities.find(e=>e.id===id).kind]}，填写希望修改的内容。`);refreshControls();}
function refreshControls(){
  let matches=false,nonempty=false;try{const plan=planNow();matches=state?.recipe.sourceFingerprint===fingerprintPlan(plan);nonempty=!!plan.entities.length;}catch{}
  controls.forEach(id=>$(id).disabled=busy||!scene);
  $('completion-generate').disabled=busy||!available||!nonempty;
  $('completion-fine-generate').disabled=busy||!available||!nonempty;
  const editableFine=state?.sourcePlan.entities.some(e=>e.id===$('completion-target').value&&!e.locked&&fineKinds.includes(e.kind));
  $('completion-refine').disabled=busy||!available||!matches||!$('completion-target').value||!!state?.geometry&&!editableFine;
  $('completion-refine').textContent=state?.geometry?'只精修选中对象':'让模型只修改这一处';
  $('completion-edit').placeholder=state?.geometry?'例如：让棕榈叶片更细、更自然地下垂；保持原来的位置和高度。':'例如：把这片陆地改成岩岸，减少草地；保留其他区域。';
  $('completion-fine-scope-panel').hidden=!state?.geometry;
  try{const scope=fineRefinementScope(state?.sourcePlan,$('completion-target').value,$('completion-fine-scope').value);$('completion-fine-scope-help').textContent=scope?`完善 ${scope.length} 个对象，其余已有造型与材质保留。`:'重新生成全部细部；原空间与锁定仍保留。';}catch{$('completion-fine-scope-help').textContent='选中小屋、灯塔、棕榈或船只，再完善其细节。';}
  $('completion-accept').disabled=busy||!matches;
  $('completion-export').disabled=busy||!state;
  $('completion-revert').disabled=busy||!previous;
  $('completion-project').disabled=busy||!state?.geometry||!matches;
  $('completion-glb').disabled=busy||!state?.geometry||!matches;
  $('completion-import').disabled=busy;
  $('completion-fine-repair').disabled=busy||!available||!state?.geometry||!matches||$('completion-fine-scope').value!=='all'&&!editableFine;
  $('completion-coarse').setAttribute('aria-pressed',String(coarse));
  $('completion-coarse').textContent=coarse?'返回模型候选':'同视角对照粗模';
  for(const id of ['completion-intent','completion-target','completion-edit','completion-fine-scope'])$(id).disabled=busy;
}
function stage(value){
  const sequence=['input','recipe','geometry','checks','delivery'],current=sequence.indexOf(value);
  $('completion-stages').hidden=false;
  for(const el of $('completion-stages').children){const index=sequence.indexOf(el.dataset.stage);el.dataset.state=value==='done'?'done':index<current?'done':index===current?'active':'pending';}
}
function clearDelivery(){delivery=null;$('completion-delivery').hidden=true;for(const id of ['completion-project-link','completion-glb-link','completion-download'])$(id).hidden=true;}
async function modelJob(route,request,description){
  const created=await fetch(`${endpoint}/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});let job=await created.json();
  if(!created.ok)throw new Error(job.error||`模型任务提交失败 (${created.status})`);
  while(['queued','running'].includes(job.status)){
    status(job.status==='queued'?'已排队，等待控制模型开始。':description);
    $('completion-receipt').textContent=JSON.stringify({id:job.id,status:job.status,progress:job.progress,input:{sourceFingerprint:fingerprintPlan(request.plan),viewLabels:request.views.map(v=>v.label)}},null,2);
    await new Promise(resolve=>setTimeout(resolve,1200));const res=await fetch(`${endpoint}/jobs/${job.id}`);if(!res.ok)throw new Error('读取模型任务失败。');job=await res.json();
  }
  if(job.status!=='succeeded')throw new Error(job.error||'模型任务没有完成。');
  if(fingerprintPlan(planNow())!==fingerprintPlan(request.plan))throw new Error('生成期间草案已改变；结果保留在任务记录中，不能应用到新布局。');
  return job;
}
async function prepareDelivery(candidate){
  if(!candidate.geometry)throw new Error('先生成精细几何。');
  if(coarse){scene.setMode('realistic');coarse=false;}
  stage('delivery');$('completion-delivery').hidden=false;
  $('completion-delivery-status').textContent='正在导出、独立重新载入 GLB，并打包网页项目…';
  if(!delivery)delivery=await buildSceneDelivery({scene,candidate,onProgress:value=>{const message=typeof value==='string'?value:value.message;status(message);$('completion-delivery-status').textContent=message;}});
  candidate.viewState=scene.getViewState();
  if(!delivery.urls){
    $('completion-delivery-status').textContent='正在将已检查的场景与项目保存到本机…';
    const created=await fetch(`${endpoint}/deliveries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:{...candidate,delivery:null},manifest:delivery.manifest})});
    const record=await created.json();if(!created.ok)throw new Error(record.error||'保存交付记录失败。');
    for(const [kind,blob] of [['glb',delivery.glbBlob],['project',delivery.projectBlob]]){
      $('completion-delivery-status').textContent=kind==='glb'?'保存并核对 GLB 文件…':'保存并核对独立网页项目…';
      const headers={'Content-Type':'application/octet-stream'};
      if(kind==='project'){const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());headers['X-Content-SHA256']=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');}
      const uploaded=await fetch(`${endpoint}/deliveries/${record.id}/${kind}`,{method:'POST',headers,body:blob});const result=await uploaded.json();
      if(!uploaded.ok)throw new Error(result.error||`保存 ${kind} 文件失败。`);
    }
    delivery.urls=record;
  }
  candidate.delivery={manifest:delivery.manifest,checks:delivery.checks,urls:delivery.urls};
  await storage('write',candidate,'fine-candidate');
  $('completion-delivery-status').textContent=`已保存并通过重新载入检查 · GLB ${(delivery.glbBlob.size/1048576).toFixed(1)} MB · 网页项目 ${(delivery.projectBlob.size/1048576).toFixed(1)} MB`;
  for(const [id,url] of [['completion-project-link',delivery.urls.projectUrl],['completion-glb-link',delivery.urls.glbUrl]]){$(id).href=url;$(id).hidden=false;}
  updateReceipt(candidate);stage('done');
}
function updateReceipt(candidate){$('completion-receipt').textContent=JSON.stringify({receipt:candidate.receipt,geometryReceipt:candidate.geometryReceipt,consistency:candidate.consistency,recipe:candidate.recipe,geometry:candidate.geometry,geometryChecks:candidate.geometryChecks,geometryDiagnostics:candidate.geometryDiagnostics,geometryIterations:candidate.geometryIterations,fineEdit:candidate.fineEdit,execution:candidate.execution,delivery:candidate.delivery},null,2);}
async function health(){
  if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)){available=false;$('completion-health').textContent='在线展示版：新模型生成需在本机启动控制模型服务。已有场景与成果见当前版本说明。';refreshControls();return;}
  $('completion-health').textContent='正在检查控制模型…';
  try{const res=await fetch(`${endpoint}/health`);if(!res.ok)throw new Error(`服务检查失败 (${res.status})`);const data=await res.json();available=data.available===true;$('completion-health').textContent=available?`控制模型可用 · ${data.provider} · ${data.cliVersion}`:`控制模型不可用：${data.error||'尚未登录'}`;}catch{available=false;$('completion-health').textContent='本机控制模型服务未连接；启动 tools/control-model-server.mjs 后重新检查。';}
  refreshControls();
}
async function storage(mode,value,key='current'){
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('tidewater-scene-completion',1);req.onupgradeneeded=()=>req.result.createObjectStore('scenes');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('scenes',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('scenes'),req=mode==='read'?store.get(key):store.put(value,key);let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存没有完成。'));});}finally{db.close();}
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
  const geometry=candidate.geometry?validateFineGeometry(candidate.geometry,candidate.sourcePlan,{baseRecipe:recipe}):null;
  if(geometry&&candidate.fineEdit){const previousGeometry=candidate.geometryIterations?.at(-1)?.geometry;if(!previousGeometry)throw new Error('局部精修存档缺少上一版，无法核对范围外的原部件。');candidate.fineEdit=assertFineRefinementPreserved(previousGeometry,geometry,candidate.sourcePlan,candidate.fineEdit.scopeIds,{baseRecipe:recipe});}
  clearDelivery();
  scene?.dispose();scene=null;
  scene=await createRealisticScene({canvas:$('completion-canvas'),plan:candidate.sourcePlan,completionRecipe:recipe,onSelect:selectInScene,onProgress:p=>status(typeof p==='string'?p:p.detail)});
  scene.setWorldQuality(true);await scene.setLighting(recipe.environment.lighting);
  const resources=[];
  for(const look of recipe.objects){
    if(geometry)continue;
    if(!['coastal-cabin','fishing-boat'].includes(look.treatment))continue;
    const entity=candidate.sourcePlan.entities.find(e=>e.id===look.id);if(entity.locked)continue;
    const name=entity.kind==='cabin'?'cabin-generated-v1.glb':'boat-generated-v1.glb';
    try{status(`执行模型方案：完善${names[entity.kind]} ${entity.id.slice(-4)}…`);const spec=createAssetJob(candidate.sourcePlan,entity.id).spec;await scene.previewAssetOverride(entity.id,new URL(`assets/neural/${name}`,import.meta.url).href,spec);scene.setAssetRotation(entity.id,look.rotationDeg);scene.applyCompletionAssetLook(entity.id);scene.commitAssetOverride(entity.id);resources.push({entityId:entity.id,source:`已有神经资产 ${name}`});}catch(error){throw new Error(`${entity.id}的模型指定资产没有载入：${error.message}`);}
  }
  if(geometry){candidate.geometry=geometry;candidate.geometryChecks=scene.applyFineGeometry(geometry);candidate.geometryDiagnostics=fineGeometryDiagnostics(geometry);}
  if(geometry&&!candidate.sourcePlan.entities.some(e=>e.id===$('completion-target').value&&!e.locked&&fineKinds.includes(e.kind))){const target=candidate.sourcePlan.entities.find(e=>!e.locked&&e.kind==='palm')||candidate.sourcePlan.entities.find(e=>!e.locked&&fineKinds.includes(e.kind));if(target)$('completion-target').value=target.id;}
  scene.setMode('realistic');coarse=false;scene.setView('overview');if(candidate.viewState)scene.setViewState(candidate.viewState);$('completion-empty').hidden=true;
  candidate.execution={resources,renderer:scene.getStats().renderer,stats:scene.getStats(),mode:geometry?'model-authored-component-meshes':'registered-scene-tools',generatedNewMeshesByNeuralModel:false};
  showInputs([...(candidate.views||[]),...(candidate.geometryViews||[])]);$('completion-summary').textContent=geometry?geometry.summary:recipe.summary;
  const checks=completionConsistency(candidate.sourcePlan,recipe,candidate.previousRecipe,candidate.scopeIds||[]);
  candidate.consistency=checks;$('completion-consistency').textContent=`${checks.entityCount} 个区域 / 对象均保留原空间与 ID。${checks.unchangedOutsideScope?'局部修改的范围外记录与全局环境保持一致。':''}材质、造型、多视角与接触关系仍需检查。`;
  if(geometry){$('completion-consistency').textContent+=` ${candidate.geometryChecks.entityIds.length} 个物体、${candidate.geometryChecks.partCount} 个新部件已按原包络归位。${candidate.geometryDiagnostics.needsRepair?' 检查发现细部变换问题，可交给模型继续修正。':' 多视角与写实品质仍需验收。'}`;$('completion-delivery').hidden=false;$('completion-delivery-status').textContent=candidate.delivery?.urls?'已恢复本机交付文件，可下载项目与 GLB。':'细部候选可打包为 GLB 与独立网页项目。';if(candidate.delivery?.urls){for(const [id,url] of [['completion-project-link',candidate.delivery.urls.projectUrl],['completion-glb-link',candidate.delivery.urls.glbUrl]]){$(id).href=url;$(id).hidden=false;}}}
  if(candidate.fineEdit?.preservedOutsideScope)$('completion-consistency').textContent+=` 本轮精修 ${candidate.fineEdit.scopeIds.length} 个对象；其余 ${geometry.instances.length-candidate.fineEdit.scopeIds.length} 个物体的部件、材质和朝向已检查保持一致。`;
  updateReceipt(candidate);
  $('completion-saved').textContent=candidate.savedAt?'已保存':'待确认';
  status(candidate.savedAt?'已恢复保存的模型场景。':'模型候选已生成，等待你检查。');refreshControls();
}
async function repairGeometry(candidate,automatic=false,scopeMode=null){
  if(fingerprintPlan(planNow())!==candidate.geometry.sourceFingerprint)throw new Error('原布局已变化，请重新生成。');
  const scopeIds=automatic?null:fineRefinementScope(candidate.sourcePlan,$('completion-target').value,scopeMode||$('completion-fine-scope').value);
  const viewState=scene.getViewState();scene.setMode('realistic');coarse=false;
  const views=[{label:'用户原布局（空间和对象 ID 不变）',dataUrl:layoutImage(candidate.sourcePlan)}];
  const selectedKind=candidate.sourcePlan.entities.find(e=>e.id===$('completion-target').value)?.kind;
  if(scopeIds){
    scene.focusEntity($('completion-target').value);views.push({label:`选中${names[selectedKind]}的当前近景`,dataUrl:await downscale(scene.capture())});
    scene.reverseView();views.push({label:'选中对象另一侧（实际渲染）',dataUrl:await downscale(scene.capture())});
    if(!candidate.sourcePlan.reference){scene.setView('hero');views.push({label:'当前整场景（范围外已有外观保留）',dataUrl:await downscale(scene.capture())});}
  }else{
    const shots=[['lighthouse','lighthouse','当前模型灯塔近景'],['palm','palms','当前模型树冠近景'],['cabin','cabin','当前模型建筑近景'],['boat','boats','当前模型船体近景']].filter(([kind])=>candidate.sourcePlan.entities.some(e=>e.kind===kind));
    shots.sort((a,b)=>Number(b[0]===selectedKind)-Number(a[0]===selectedKind));
    for(const [,view,label] of shots.slice(0,candidate.sourcePlan.reference?2:3)){scene.setView(view);views.push({label,dataUrl:await downscale(scene.capture())});}
  }
  if(candidate.sourcePlan.reference)views.push({label:'用户原始参考图',dataUrl:candidate.sourcePlan.reference.dataUrl});
  scene.setViewState(viewState);showInputs(views);stage('geometry');
  const diagnostics=fineGeometryDiagnostics(candidate.geometry);
  const feedback=diagnostics.warnings.length?diagnostics.warnings.slice(0,12).join('\n'):'请检查所附实际渲染近景，改善结构连续性、接触、尺度、树叶宽度和建筑细节。';
  const userIntent=automatic?candidate.requestIntent:($('completion-intent').value.trim()||candidate.requestIntent),edit=automatic?'':$('completion-edit').value.trim();
  const intent=`${(userIntent||'自然可信的热带海岸').slice(0,3000)}\n${edit?`用户进一步要求：${edit.slice(0,1600)}\n`:''}${scopeIds?`本轮仅精修这 ${scopeIds.length} 个对象：${scopeIds.join(', ')}。其他物体的几何、材质与朝向由合并器保持原样。`:'本轮完善整场景几何。'}依据实际渲染继续完善，保留完整布局与原方案朝向。检查反馈：\n${feedback.slice(0,1000)}\n部件须衔接，细节须与实际尺寸一致。当前仍是候选，不能宣称已经通过视觉验收。`.slice(0,6000);
  const request={plan:candidate.sourcePlan,intent,views,baseRecipe:candidate.recipe,...(scopeIds?{previousGeometry:candidate.geometry,scopeIds}:{})};
  const job=await modelJob('fine-jobs',request,automatic?'检查发现细部问题，模型正在依据近景自动修正…':scopeIds?`模型正在完善 ${scopeIds.length} 个对象，范围外的已有形体保留…`:'模型正在依据当前近景继续完善细部…');
  const geometry=validateFineGeometry(job.geometry,candidate.sourcePlan,{baseRecipe:candidate.recipe});
  const fineEdit=scopeIds?assertFineRefinementPreserved(candidate.geometry,geometry,candidate.sourcePlan,scopeIds,{baseRecipe:candidate.recipe}):null;
  const result={...candidate,geometry,geometryReceipt:job.receipt,geometryIntent:intent,geometryViews:views,fineEdit,geometryIterations:[...(candidate.geometryIterations||[]),{geometry:candidate.geometry,receipt:candidate.geometryReceipt,views:candidate.geometryViews||candidate.views,checks:candidate.geometryChecks,diagnostics,fineEdit:candidate.fineEdit||null,reason:automatic?'automatic-transform-repair':scopeIds?'scoped-refinement':'visual-refinement'}],savedAt:null,delivery:null,viewState};
  stage('checks');await renderCandidate(result);return result;
}
async function runFine(){
  if(busy)return;
  let plan;try{plan=planNow();if(!plan.entities.some(e=>!e.locked&&['cabin','lighthouse','palm','boat'].includes(e.kind)))throw new Error('先在布局中放置至少一个未锁定的小屋、灯塔、棕榈或船。');}catch(error){showError(error);return;}
  const before=state;busy=true;showError(null);refreshControls();
  let candidate=null;
  try{
    stage('input');const views=await sourceViews(plan),intent=$('completion-intent').value;
    stage('recipe');const scheme=await modelJob('jobs',{plan,intent,views,mode:'generate'},'模型正在依据整份图与粗模确定场景方案…');
    const recipe=validateCompletionRecipe(scheme.recipe,plan);
    stage('geometry');const fine=await modelJob('fine-jobs',{plan,intent,views,baseRecipe:recipe},'模型正在生成屋顶、门窗、灯室、树叶与船体的实际部件几何…');
    const geometry=validateFineGeometry(fine.geometry,plan,{baseRecipe:recipe});
    stage('checks');candidate={sourcePlan:plan,recipe,geometry,receipt:scheme.receipt,geometryReceipt:fine.receipt,views,requestIntent:intent,previousRecipe:null,scopeIds:[],savedAt:null,viewState:null};
    await renderCandidate(candidate);previous=before;state=candidate;
    await storage('write',candidate,'fine-candidate');let repairFailed=false;
    if(candidate.geometryDiagnostics.needsRepair){
      try{candidate=await repairGeometry(candidate,true);state=candidate;await storage('write',candidate,'fine-candidate');}
      catch(error){repairFailed=true;await renderCandidate(candidate);showError(`自动修正未完成，已保留首轮候选：${error.message}`);}
    }
    await prepareDelivery(candidate);status(repairFailed?'首轮候选与项目已保留，细部问题仍待继续完善。':'精细几何与项目已生成。检查近景和另一侧，再确认这一版。');
  }catch(error){showError(error);
    if(candidate&&state===candidate){$('completion-delivery').hidden=false;$('completion-delivery-status').textContent='几何候选已保留；交付失败，点击下载可重试。';status('细部场景已生成，项目打包尚未完成。');}
    else{if(before){try{await renderCandidate(before);}catch{}state=before;}status('本次生成没有应用，原草案与之前的结果保留。');}
  }finally{busy=false;refreshControls();}
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
$('completion-fine-generate').addEventListener('click',runFine);
async function runFineRepair(scopeMode=null){
  if(busy||!state?.geometry)return;const before=state;busy=true;showError(null);refreshControls();let candidate=null;
  try{candidate=await repairGeometry(before,false,scopeMode);previous=before;state=candidate;await storage('write',candidate,'fine-candidate');await prepareDelivery(candidate);status(candidate.fineEdit?`已精修 ${candidate.fineEdit.scopeIds.length} 个对象，其余 ${candidate.geometry.instances.length-candidate.fineEdit.scopeIds.length} 个物体保持。可以还原比较。`:'模型已依据实际近景生成新版本。可以还原比较，再确认。');}
  catch(error){showError(error);if(!candidate){try{await renderCandidate(before);}catch{}state=before;status('完善没有应用，之前的候选保留。');}else{status('新的几何候选已保留，项目打包可重试。');}}
  finally{busy=false;refreshControls();}
}
$('completion-fine-repair').addEventListener('click',()=>runFineRepair());
$('completion-refine').addEventListener('click',()=>state?.geometry?runFineRepair('selected'):run('refine'));
$('completion-health-recheck').addEventListener('click',health);
$('completion-target').addEventListener('change',refreshControls);
$('completion-fine-scope').addEventListener('change',refreshControls);
$('completion-coarse').addEventListener('click',()=>{if(!scene)return;coarse=!coarse;scene.setMode(coarse?'coarse':'realistic');refreshControls();});
$('completion-overview').addEventListener('click',()=>scene?.setView('overview'));
$('completion-hero').addEventListener('click',()=>scene?.setView('hero'));
$('completion-focus').addEventListener('click',()=>scene?.focusEntity($('completion-target').value));
$('completion-reverse').addEventListener('click',()=>scene?.reverseView());
$('completion-accept').addEventListener('click',async()=>{
  try{if(!state||state.recipe.sourceFingerprint!==fingerprintPlan(planNow()))throw new Error('原布局已变化，不能确认过期候选。');const saved={...state,savedAt:new Date().toISOString(),viewState:scene.getViewState()};await storage('write',saved);await storage('write',saved.geometry?saved:null,'fine-candidate');state=saved;$('completion-saved').textContent='已保存';status('模型场景已独立保存，原草案保持。');}catch(error){showError(error);}
});
$('completion-revert').addEventListener('click',async()=>{if(!previous||busy)return;busy=true;refreshControls();try{const swap=state;await renderCandidate(previous);state=previous;previous=swap;status('已还原上一候选，可以继续比较。');}catch(error){showError(error);}finally{busy=false;refreshControls();}});
$('completion-export').addEventListener('click',()=>{
  if(!state)return;if(downloadURL?.startsWith('blob:'))URL.revokeObjectURL(downloadURL);
  const artifact={format:'tidewater-completion-export.v1',exportedAt:new Date().toISOString(),scene:state};downloadURL=state.delivery?.urls?.sceneUrl||URL.createObjectURL(new Blob([JSON.stringify(artifact,null,2)],{type:'application/json'}));const link=$('completion-download');link.href=downloadURL;link.download='tidewater-model-scene.json';link.hidden=false;link.textContent='场景方案与实际输入已准备好 ↓';link.click();
});
async function downloadDelivery(type){
  if(busy||!state?.geometry)return;busy=true;showError(null);refreshControls();
  try{if(!state.delivery?.urls&&!delivery?.urls)await prepareDelivery(state);const urls=delivery?.urls||state.delivery.urls,link=$(type==='project'?'completion-project-link':'completion-glb-link');link.href=type==='project'?urls.projectUrl:urls.glbUrl;link.hidden=false;link.click();status(type==='project'?'网页项目已保存并准备下载；解压后按 README 启动。':'可编辑 GLB 已保存并准备下载。');}catch(error){showError(error);$('completion-delivery-status').textContent='交付文件尚未保存，可重试。';}finally{busy=false;refreshControls();}
}
$('completion-project').addEventListener('click',()=>downloadDelivery('project'));
$('completion-glb').addEventListener('click',()=>downloadDelivery('glb'));
$('completion-import').addEventListener('click',()=>$('completion-file').click());
$('completion-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||busy)return;
  const before=state;busy=true;showError(null);refreshControls();
  try{
    if(file.size>20*1048576)throw new Error('场景存档超过 20 MB。');
    const artifact=JSON.parse(await file.text());if(artifact.format!=='tidewater-completion-export.v1'||!artifact.scene)throw new Error('请选择由本页导出的完整场景存档。');
    const candidate=artifact.scene;candidate.sourcePlan=validatePlan(candidate.sourcePlan);
    if(fingerprintPlan(candidate.sourcePlan)!==fingerprintPlan(planNow()))throw new Error('存档对应另一份布局。请先在页面顶部导入其原方案，再恢复场景。');
    validateCompletionRecipe(candidate.recipe,candidate.sourcePlan);
    if(candidate.geometry)validateFineGeometry(candidate.geometry,candidate.sourcePlan,{baseRecipe:candidate.recipe});
    await renderCandidate(candidate);state=candidate;previous=before;if(candidate.geometry)await storage('write',candidate,'fine-candidate');status('完整场景已恢复，可以检查、保存或重新打包项目。');
  }catch(error){showError(error);if(before){try{await renderCandidate(before);}catch{}state=before;}}
  finally{busy=false;refreshControls();}
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
    try{
      const saved=await storage('read'),pending=await storage('read',null,'fine-candidate');
      let candidate=pending?.recipe.sourceFingerprint===fp?pending:saved;
      if(candidate?.recipe.sourceFingerprint===fp){
        busy=true;refreshControls();
        try{await renderCandidate(candidate);}catch(error){
          if(candidate!==pending||!saved||saved.recipe.sourceFingerprint!==fp)throw error;
          candidate=saved;await renderCandidate(saved);showError(`待检查候选恢复失败，已恢复此前确认的版本：${error.message}`);
        }
        state=candidate;if(candidate===pending&&saved?.recipe.sourceFingerprint===fp)previous=saved;
      }else if(saved){$('completion-saved').textContent='另有旧布局存档';}
    }catch(error){showError(`保存的模型场景未能恢复：${error.message}`);}finally{busy=false;refreshControls();}
  }
}
health();observeSource();setInterval(observeSource,700);
window.addEventListener('pagehide',()=>{scene?.dispose();if(downloadURL?.startsWith('blob:'))URL.revokeObjectURL(downloadURL);});
