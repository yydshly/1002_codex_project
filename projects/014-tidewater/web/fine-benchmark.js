import { createRealisticScene } from './realistic/scene.js';
import { validatePlan } from './creation-core.js';
import { fingerprintPlan } from './model-scene-core.js';
import { validateCompletionRecipe } from './scene-completion-core.js';
import { validateFineGeometry, fineGeometryDiagnostics } from './fine-geometry-core.js';
import { buildSceneDelivery } from './scene-delivery.js';

// Independent developer fixtures. Deliberately no user storage / IndexedDB.
const endpoint = 'http://127.0.0.1:4198', $ = id => document.getElementById(id);
const kindNames = { land:'陆地', water:'水域', road:'道路', cabin:'小屋', lighthouse:'灯塔', palm:'棕榈', boat:'船' };
let manifest, benchmark, plan, scene, candidate = null, delivery = null, busy = false, alive = true;
const run = { recipeJob:null, geometryJob:null, error:null };
function status(message, error = false) { $('status').textContent = message; $('status').dataset.error = String(error); }
function controls() {
  $('case').disabled = busy || !manifest;
  $('generate').disabled = busy || !scene;
  $('save').disabled = busy || !candidate?.geometry;
  $('focus').disabled = busy || !scene;
  for (const button of $('views').querySelectorAll('button')) button.disabled = busy || !scene || (button.dataset.action === 'realistic' && !candidate);
}
function report() {
  $('report').textContent = JSON.stringify({ benchmark:benchmark?.id, sourceFingerprint:plan ? fingerprintPlan(plan) : null,
    recipeJob:run.recipeJob, geometryJob:run.geometryJob, error:run.error,
    geometryChecks:candidate?.geometryChecks, geometryDiagnostics:candidate?.geometryDiagnostics,
    visualQuality:candidate ? 'needs-review' : 'not-generated', stats:scene?.getStats(),
    delivery:candidate?.delivery }, null, 2);
}
async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error(`接口未返回 JSON (${response.status})：${text.slice(0,1000)}`); }
  if (!response.ok) throw new Error(data.error || `接口失败 (${response.status})`);
  return data;
}
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
}
function layoutImage(source) {
  const canvas = document.createElement('canvas'), scale = 900 / Math.max(source.world.width, source.world.depth), pad = 30;
  canvas.width = Math.round(source.world.width * scale + pad * 2); canvas.height = Math.round(source.world.depth * scale + pad * 2);
  const ctx = canvas.getContext('2d'), colors = { land:'#afbd8a',water:'#4d9cac',road:'#dec797',cabin:'#a97249',lighthouse:'#edeee8',palm:'#39744a',boat:'#efe0be' };
  const point = p => [pad+p.x*(canvas.width-pad*2),pad+p.y*(canvas.height-pad*2)];
  ctx.fillStyle = '#b9dfe5'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (const entity of source.entities.filter(e => ['land','water','road'].includes(e.kind))) {
    ctx.beginPath(); entity.points.forEach((p,i) => { const xy=point(p); i?ctx.lineTo(...xy):ctx.moveTo(...xy); });
    if (entity.kind === 'road') { ctx.strokeStyle=colors.road;ctx.lineWidth=Math.max(3,2.5*scale);ctx.lineJoin='round';ctx.stroke(); }
    else { ctx.closePath();ctx.fillStyle=colors[entity.kind];ctx.fill();ctx.strokeStyle='#466a69';ctx.lineWidth=1;ctx.stroke(); }
  }
  ctx.font = '12px system-ui';ctx.textAlign='center';
  for (const entity of source.entities.filter(e => !['land','water','road'].includes(e.kind))) {
    const [x,y] = point(entity.points[0]);ctx.fillStyle=colors[entity.kind];ctx.beginPath();ctx.arc(x,y,entity.locked?9:7,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=entity.locked?'#ad3850':'#203d44';ctx.lineWidth=entity.locked?3:1;ctx.stroke();
    ctx.fillStyle='#152c33';ctx.fillText(`${kindNames[entity.kind]} ${entity.height}m${entity.locked?' [锁定]':''}`,x,y-14);ctx.fillText(entity.id,x,y+23);
  }
  ctx.textAlign='left';ctx.fillStyle='#18343c';ctx.fillText(`${source.world.width}m × ${source.world.depth}m · X→ / Z↓ · 语义布局`,pad,18);
  return canvas.toDataURL('image/png');
}
function showInputs(views) {
  $('inputs').replaceChildren();
  for (const view of views) { const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=view.dataUrl;img.alt=view.label;caption.textContent=view.label;figure.append(img,caption);$('inputs').append(figure); }
}
async function openScene(options) {
  scene?.dispose(); scene = null;
  const loaded = await createRealisticScene({ canvas:$('scene'), plan, ...options,
    onProgress:value => status(`${value.stage} · ${value.detail}`) });
  if (!alive) { loaded.dispose();throw new Error('页面已关闭。'); }
  scene = loaded;scene.setView('overview');return scene;
}
async function selectCase() {
  busy=true;controls();run.recipeJob=run.geometryJob=run.error=null;candidate=delivery=null;$('links').hidden=true;$('links').replaceChildren();$('inputs').replaceChildren();
  scene?.dispose();scene=null;plan=null;
  try {
    benchmark=manifest.cases.find(item => item.id === $('case').value);
    if (!benchmark || !/^[\w-]+\.plan\.json$/u.test(benchmark.file)) throw new Error('基准文件名无效。');
    const response=await fetch(`./assets/fine-benchmarks/${benchmark.file}`);
    if (!response.ok) throw new Error(`读取基准失败 (${response.status})`);
    const bytes=await response.arrayBuffer();if(await digest(bytes)!==benchmark.sha256)throw new Error('基准文件 SHA-256 与清单不一致。');
    plan=validatePlan(JSON.parse(new TextDecoder().decode(bytes)));
    if(fingerprintPlan(plan)!==benchmark.sourceFingerprint)throw new Error('基准布局指纹与清单不一致。');
    $('facts').textContent=`${benchmark.purpose} ${plan.world.width} × ${plan.world.depth} m；${plan.entities.length} 个来源对象，${benchmark.expected.fineTargetIds.length} 个模型细化目标；锁定：${benchmark.expected.lockedIds.join(', ')||'无'}。`;
    $('expectations').textContent=JSON.stringify(benchmark,null,2);$('focus').replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='选择来源对象';$('focus').append(empty);
    for(const entity of plan.entities){const option=document.createElement('option');option.value=entity.id;option.textContent=`${kindNames[entity.kind]} · ${entity.id}${entity.locked?' [锁定]':''}`;$('focus').append(option);}
    await openScene({mode:'coarse'});status('粗模基准已加载。点击生成将运行真实方案模型与细几何模型；尚未生成候选。');report();
  } catch(error) { run.error=String(error.message||error);status(run.error,true);report(); }
  finally { busy=false;controls(); }
}
async function modelJob(route, request, field) {
  let job=await fetchJSON(`${endpoint}/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  run[field]=job;report();
  while(['queued','running'].includes(job.status)) {
    status(`${route==='jobs'?'场景方案':'模型细几何'} · ${job.status} · ${job.progress?.message||'等待模型'}\n任务 ${job.id}`);
    await new Promise(resolve=>setTimeout(resolve,1200));if(!alive)throw new Error('页面已关闭，任务回执保留在服务端。');
    job=await fetchJSON(`${endpoint}/jobs/${job.id}`);run[field]=job;report();
  }
  if(job.status!=='succeeded')throw new Error(job.error||`模型任务终止：${job.status}`);
  return job;
}
async function generate() {
  busy=true;controls();candidate=delivery=null;run.recipeJob=run.geometryJob=run.error=null;$('links').hidden=true;
  try {
    await openScene({mode:'coarse'});scene.setView('overview');
    const views=[{label:'语义布局（尺寸、对象 ID 与锁定位置）',dataUrl:layoutImage(plan)},{label:'粗模全景（真实渲染）',dataUrl:scene.capture()}];
    scene.reverseView();views.push({label:'粗模另一侧（真实渲染）',dataUrl:scene.capture()});scene.setView('overview');showInputs(views);
    const intent=plan.intent;
    const scheme=await modelJob('jobs',{plan,intent,views,mode:'generate'},'recipeJob'), recipe=validateCompletionRecipe(scheme.recipe,plan);
    const fine=await modelJob('fine-jobs',{plan,intent,views,baseRecipe:recipe},'geometryJob'),geometry=validateFineGeometry(fine.geometry,plan,{baseRecipe:recipe});
    await openScene({mode:'realistic',completionRecipe:recipe});scene.setWorldQuality(true);scene.setLighting(recipe.environment.lighting);
    const geometryChecks=scene.applyFineGeometry(geometry),geometryDiagnostics=fineGeometryDiagnostics(geometry);
    candidate={sourcePlan:plan,recipe,geometry,receipt:scheme.receipt,geometryReceipt:fine.receipt,views,geometryViews:views,
      requestIntent:intent,geometryChecks,geometryDiagnostics,geometryIterations:[],stats:scene.getStats(),viewState:scene.getViewState(),savedAt:null,delivery:null};
    status(`真实模型候选已应用，${geometryChecks.partCount??'—'} 个部件。结构检查完成；外观与空间连接仍待人工验收。`);report();
  } catch(error) {run.error=String(error.message||error);status(run.error,true);report();}
  finally {busy=false;controls();}
}
async function save() {
  busy=true;controls();run.error=null;
  try {
    scene.setMode('realistic');candidate.stats=scene.getStats();candidate.viewState=scene.getViewState();candidate.savedAt=new Date().toISOString();
    if(!delivery)delivery=await buildSceneDelivery({scene,candidate,onProgress:value=>status(value.message)});
    if(!delivery.urls){
      const record=await fetchJSON(`${endpoint}/deliveries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:{...candidate,delivery:null},manifest:delivery.manifest})});
      let saved;
      for(const [kind,blob] of [['glb',delivery.glbBlob],['project',delivery.projectBlob]]){
        status(`保存 ${kind==='glb'?'GLB':'独立网页项目'} 并校对 SHA-256…`);
        const sha256=kind==='glb'?delivery.manifest.files.find(file=>file.path==='scene.glb').sha256:await digest(await blob.arrayBuffer());
        saved=await fetchJSON(`${endpoint}/deliveries/${record.id}/${kind}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Content-SHA256':sha256},body:blob});
      }
      if(saved.complete!==true)throw new Error('文件上传完成，但交付服务未确认两份文件均已落盘。');
      delivery.urls=record;
    }
    candidate.delivery={manifest:delivery.manifest,checks:delivery.checks,urls:delivery.urls};
    $('links').replaceChildren();$('links').hidden=false;
    for(const [label,key,name] of [['场景存档','sceneUrl','scene.export.json'],['GLB','glbUrl','scene.glb'],['独立网页工程','projectUrl','project.zip']]){
      const link=document.createElement('a');link.textContent=`下载${label}`;link.href=delivery.urls[key];link.download=`${benchmark.id}-${name}`;$('links').append(link);
    }
    status(`验证工程已真实保存，GLB ${(delivery.glbBlob.size/1048576).toFixed(1)} MiB、项目 ${(delivery.projectBlob.size/1048576).toFixed(1)} MiB。独立 GLB 重载通过，外观验收仍需人工检查。`);report();
  }catch(error){run.error=String(error.message||error);status(run.error,true);report();}
  finally{busy=false;controls();}
}
$('case').addEventListener('change',selectCase);$('generate').addEventListener('click',generate);$('save').addEventListener('click',save);
$('focus').addEventListener('change',()=>{if($('focus').value){scene?.focusEntity($('focus').value);report();}});
$('views').addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled||!scene)return;if(button.dataset.view)scene.setView(button.dataset.view);else if(button.dataset.action==='reverse')scene.reverseView();else scene.setMode(button.dataset.action==='coarse'?'coarse':'realistic');report();});
addEventListener('pagehide',()=>{alive=false;scene?.dispose();scene=null;});
try {
  manifest=await fetchJSON('./assets/fine-benchmarks/manifest.json');
  if(manifest.format!=='tidewater-fine-benchmark-set.v1'||!Array.isArray(manifest.cases)||!manifest.cases.length)throw new Error('基准清单格式无效。');
  for(const item of manifest.cases){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;$('case').append(option);}
  $('case').value=manifest.cases.some(item=>item.id==='dual-island-lock')?'dual-island-lock':manifest.cases[0]?.id;
  await selectCase();
}catch(error){run.error=String(error.message||error);status(run.error,true);report();controls();}
