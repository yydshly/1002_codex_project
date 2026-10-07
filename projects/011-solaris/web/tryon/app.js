import {REVIEW_FIELDS,emptyReview,reviewSummary,pairKey,resultBelongsToPair,reviewRecord,restoreJobSelection} from './core.js';
const API='http://127.0.0.1:4197', $=id=>document.getElementById(id);
let samples=[],records=[],person,garment,photoType='flat-lay',health=null,result=null,job=null,pollTimer=null,drag=null,history=[],review=emptyReview(),note='',toastTimer,submitting=false,splitDrag=null;
const uploadSequence={person:0,garment:0};
const errorText=data=>typeof data==='string'?data:(data?.message??'本机服务返回错误');
const canSubmit=()=>Boolean(health?.can_submit);
const hasOwnWearReference=()=>Boolean(garment?.referenceImage&&garment?.pairedPersonId===person?.id&&!person?.localURL&&!garment?.localURL);
const imagePath=s=>s.localURL??new URL(`./samples/${s.image}`,import.meta.url).href;
const key=()=>pairKey(person.id,garment.id,photoType);
const busy=()=>submitting||(!!job&&!['succeeded','failed','cancelled'].includes(job.status)&&!(job.status==='read-error'&&job.knownTerminal));
const say=text=>{$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);};
function clearResult(){result=null;review=emptyReview();note='';renderResult();}
function remember(){history.push({person,garment,photoType,result,review:{...review},note});if(history.length>40)history.shift();}
function releaseCompletedJob(){clearTimeout(pollTimer);job=null;try{localStorage.removeItem('atelier-real-person-session-v1');}catch{}$('job-status').textContent='已选择输入；按“开始试穿”进行本机生成。';}
function select(kind,item){if(busy()){say('请先等待当前试穿完成。');return false;}++uploadSequence[kind];if((kind==='person'?person:garment)?.id===item.id)return;remember();releaseCompletedJob();if(kind==='person')person=item;else{garment=item;photoType=item.photoType==='model'?'model':'flat-lay';}clearResult();renderInputs();showRecordedResult();return true;}
function renderInputs(){
  $('comparison').dataset.person=person.id;$('comparison').dataset.garment=garment.id;
  $('person-image').src=imagePath(person);$('person-source').textContent=person.localURL?'本次选择的人物照片 · 仅送本机服务':'VITON-HD 原目录模特照片 · 非商业研究样本';
  $('garment-source').textContent=garment.localURL?'本次选择的商品照片 · 尚无实穿参考':`${garment.name} · 原目录商品照片；没有已接入的品牌 SKU。`;
  $('photo-type').value=photoType;
  for(const [id,kind] of [['people','person'],['garments','garment']]){
    const parent=$(id);parent.replaceChildren();for(const s of samples.filter(x=>x.kind===kind)){
      const b=document.createElement('button');b.className='sample';b.dataset.sample=s.id;b.setAttribute('aria-pressed',String((kind==='person'?person:garment).id===s.id));b.setAttribute('aria-label',`选择${s.name}`);
      const im=new Image();im.src=imagePath(s);im.alt=s.name;im.draggable=false;
      const label=document.createElement('span');label.textContent=s.name.replace('原模特 · ','');const sm=document.createElement('small');sm.textContent=kind==='person'?'人物原图':s.photoType==='model'?'模特穿着参考':'原商品照片';label.append(sm);b.append(im,label);
      b.addEventListener('click',()=>{if(performance.now()<Number(b.dataset.swallowUntil??0))return;select(kind,s);});
      if(kind==='garment')b.addEventListener('pointerdown',e=>beginDrag(e,s,b));parent.append(b);
    }
  }
  const ref=$('reference-content');ref.replaceChildren();if(garment.referenceImage){const im=new Image();im.src=new URL(`./samples/${garment.referenceImage}`,import.meta.url).href;im.alt=garment.referenceLabel;const p=document.createElement('p');p.textContent=garment.pairedPersonId===person.id?'这是同一人物原本穿着同一件衣服的照片，只能作为同款重建基线，不是另换新衣的实拍证明。':garment.referenceLabel;ref.append(im,p);}else{const p=document.createElement('p');p.textContent='本商品未提供同人物同衣服的真实穿着对照。';ref.append(p);}
  updateButtons();
}
function beginDrag(e,s,b){if(e.button!==0||busy())return;drag={start:[e.clientX,e.clientY],item:s,button:b,id:e.pointerId,active:false,ghost:null};b.setPointerCapture(e.pointerId);}
function endDrag(cancel=false){if(!drag)return;const d=drag;drag=null;if(d.active){d.button.dataset.swallowUntil=String(performance.now()+600);d.ghost?.remove();$('comparison').removeAttribute('data-drop');$('drop-message').hidden=true;if(!cancel&&d.valid){select('garment',d.item);say('上装已选择。按“开始试穿”，生成真人预览。');}else say(cancel?'已取消选款，原选择保持。':'未放到人物区域，原选择保持。');}}
document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag;if(!d.active&&Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])<6)return;if(!d.active){d.active=true;d.ghost=new Image();d.ghost.src=imagePath(d.item);d.ghost.className='drag-ghost';document.body.append(d.ghost);}d.ghost.style.left=`${e.clientX-40}px`;d.ghost.style.top=`${e.clientY-47}px`;const b=$('comparison').getBoundingClientRect();d.valid=e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;$('comparison').dataset.drop=String(d.valid);$('drop-message').hidden=!d.valid;});
document.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)endDrag();});document.addEventListener('pointercancel',()=>endDrag(true));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag)endDrag(true);});window.addEventListener('blur',()=>endDrag(true));
function updateButtons(){const waiting=busy();$('generate').disabled=waiting||!canSubmit()||!person||!garment;$('generate').textContent=job?.status==='read-error'&&waiting?'任务读取中断，重新检查':waiting?'正在本机试穿…':'开始试穿';$('cancel-job').hidden=!job||job.status!=='queued';$('undo-choice').disabled=waiting||!history.length;$('photo-type').disabled=waiting;for(const e of document.querySelectorAll('.sample,input[type=file]'))e.disabled=waiting;}
function renderResult(){
  if(!hasOwnWearReference())review.wear='no-reference';
  const available=resultBelongsToPair(result,key());$('comparison').dataset.resultAvailable=String(available);$('result-layer').hidden=true;$('split-line').hidden=!available;$('generated-label').hidden=!available;$('empty-message').hidden=available;
  $('result-title').textContent=available?'原图与生成图，放在一起看':'先看人物原图';$('result-kind').textContent=available?(result.kind==='recorded'?'本机实际生成留档':'本次本机生成'):'未生成';
  for(const id of ['compare-range','zoom','download','download-review'])$(id).disabled=!available;
  if(available){const expectedImage=result.image,expectedKey=key();$('result-image').onload=()=>{if(result?.image===expectedImage&&key()===expectedKey)$('result-layer').hidden=false;};$('result-image').src=expectedImage;if($('result-image').complete&&$('result-image').naturalWidth)$('result-layer').hidden=false;$('zoom-image').src=result.image;const m=result.metadata;const time=m?.elapsedSeconds??m?.elapsed_seconds??m?.durationSeconds;const size=m?.output?.width&&m?.output?.height?`${m.output.width} × ${m.output.height}`:'';$('result-evidence').textContent=`实际本机推理 · FASHN VTON 1.5 · ${size}${time?` · ${Number(time).toFixed(1)} 秒`:''}。生成图仅供外观参考；评分另由人工记录。`;}else{$('result-image').removeAttribute('src');$('result-image').onload=null;$('result-evidence').textContent='结果必须来自实际本机推理；服务不可用时不会用参考照片替代生成结果。';}
  renderReview();setSplit($('compare-range').value);
}
function setSplit(value){$('comparison').dataset.split=String(value);$('result-layer').style.clipPath=`inset(0 0 0 ${value}%)`;$('split-line').style.left=`${value}%`;}
$('compare-range').addEventListener('input',e=>setSplit(e.target.value));
function renderReview(){const ready=resultBelongsToPair(result,key());$('review-fields').replaceChildren();for(const [id,label] of REVIEW_FIELDS){const wrap=document.createElement('div');wrap.className='review-field';const l=document.createElement('label');l.htmlFor=`review-${id}`;l.textContent=label;const s=document.createElement('select');s.id=`review-${id}`;s.disabled=!ready||(id==='wear'&&!hasOwnWearReference());for(const [v,t] of [['unreviewed','未评审'],['pass','这一项看起来保持'],['uncertain','有疑问，继续复查'],['fail','发现明显问题'],['no-reference','没有对应实拍依据']]){if(v==='no-reference'&&id!=='wear')continue;const op=document.createElement('option');op.value=v;op.textContent=t;s.append(op);}s.value=review[id];s.addEventListener('change',()=>{review[id]=s.value;if(result)result.reviewedBy=result.kind==='recorded'?'current-page-edit-of-agent-review':'current-page-manual-selection';updateReviewStatus();});wrap.append(l,s);$('review-fields').append(wrap);}$('review-note').disabled=!ready;$('review-note').value=note;updateReviewStatus();}
function updateReviewStatus(){const s=reviewSummary(review);$('review-status').textContent=`${hasOwnWearReference()?'原衣重建参照；不验证另换新衣':'无同人同目标衣跨衣实拍对照'} · 已评 ${s.reviewed}/6 · 问题 ${s.failed} · 待复查 ${s.uncertain}${s.missingReference?' · 缺同人同衣实拍依据':''}`;}
$('review-note').addEventListener('input',e=>{note=e.target.value;if(result)result.reviewedBy=result.kind==='recorded'?'current-page-edit-of-agent-review':'current-page-manual-selection';});
async function checkHealth(){try{const r=await fetch(`${API}/health`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('服务返回错误');health=await r.json();$('service-dot').className=`dot ${canSubmit()?'ready':'error'}`;$('service-status').textContent=canSubmit()?'本机推理可用':'本机推理尚未就绪';$('service-detail').textContent=health.message??health.reason??(health.reasons?.length?health.reasons.join('；'):null)??(canSubmit()?'GPU 生成 · CPU 预处理；输入不发送外部试穿 API。':'模型、依赖或 CUDA 尚未齐备。暂不生成图片。');}catch{health=null;$('service-dot').className='dot error';$('service-status').textContent='本机服务未连接';$('service-detail').textContent='启动本机试穿服务后重新检查。仍可查看已保存的实际生成留档。';}updateButtons();if(job?.status==='read-error'&&health)await poll();}
$('retry-health').addEventListener('click',checkHealth);
async function getBlob(s){if(s.file)return s.file;const r=await fetch(imagePath(s));if(!r.ok)throw Error('输入照片无法读取');return r.blob();}
async function generate(){
  if(busy()||!canSubmit())return;const selected={person,garment,photoType,inputKey:key()};submitting=true;clearResult();updateButtons();$('job-status').textContent='正在准备所选人物与商品照片…';
  try{const form=new FormData();form.append('person',await getBlob(selected.person),'person.jpg');form.append('garment',await getBlob(selected.garment),'garment.jpg');form.append('photo_type',selected.photoType);
    const r=await fetch(`${API}/jobs`,{method:'POST',body:form});const data=await r.json();if(!r.ok)throw Error(errorText(data.error??data.message));const id=data.id??data.jobId??data.job_id;if(!/^[a-f0-9]{32}$/.test(id))throw Error('任务编号无效');job={...data,id,inputKey:selected.inputKey};submitting=false;persistJob();updateButtons();await poll();
  }catch(e){$('job-status').textContent='未生成：'+e.message;}finally{submitting=false;updateButtons();}
}
$('generate').addEventListener('click',generate);
function persistJob(savedStatus=job.status){if(person.localURL||garment.localURL)return;try{localStorage.setItem('atelier-real-person-session-v1',JSON.stringify({personId:person.id,garmentId:garment.id,photoType,jobId:job.id,inputKey:job.inputKey,status:savedStatus}));}catch{}}
async function poll(){
 clearTimeout(pollTimer);if(!job)return;const id=job.id,inputKey=job.inputKey;
 try{const r=await fetch(API+'/jobs/'+id),data=await r.json();if(job?.id!==id)return;if(!r.ok){const error=Error(errorText(data.error??'任务无法读取'));error.status=r.status;throw error;}job={...job,...data,status:data.status==='succeeded'?'retrieving':data.status,knownTerminal:['succeeded','failed','cancelled'].includes(data.status)};if(job.knownTerminal)persistJob(data.status);
  const texts={queued:'已排队，等待本机推理',loading:'正在加载本机模型',preprocessing:'正在解析姿态与人物',sampling:'正在生成上身预览',saving:'正在保存生成结果',succeeded:'本机生成完成，请逐项评审',failed:'本次生成失败',cancelled:'已取消排队，未生成图片'};
  const elapsed=data.elapsedSeconds??data.elapsed_seconds,progress=data.progress;let text=texts[data.status]??data.status;if(data.status==='sampling'&&progress)text+=' · '+progress.completed_steps+'/'+progress.total_steps+'步';if(elapsed)text+=' · 已用 '+Number(elapsed).toFixed(0)+'秒';if(data.error)text+=' · '+errorText(data.error);$('job-status').textContent=text;
  if(data.status==='succeeded'){const mr=await fetch(API+'/jobs/'+id+'/metadata.json');if(!mr.ok)throw Error('结果元数据无法读取');const metadata=await mr.json();if(job?.id!==id)return;job.status='succeeded';job.knownTerminal=true;persistJob();if(inputKey===key()){result={inputKey,image:API+'/jobs/'+id+'/result.png',kind:'live',jobId:id,metadata};review=emptyReview();renderResult();}updateButtons();}
  else if(['failed','cancelled'].includes(data.status)){job.knownTerminal=true;persistJob();updateButtons();}else{updateButtons();pollTimer=setTimeout(poll,2000);}
 }catch(e){if(job?.id!==id)return;$('job-status').textContent='无法继续读取任务：'+e.message+'。输入保持，按“重新检查”继续读取同一任务。';if(e.status===404){job=null;$('job-status').textContent='本机服务已不再登记此任务。输入保持，本页未使用其他图片替代结果。';}else job.status='read-error';updateButtons();}
}
$('cancel-job').addEventListener('click',async()=>{if(job?.status!=='queued')return;try{const r=await fetch(`${API}/jobs/${job.id}/cancel`,{method:'POST'});if(!r.ok)throw Error('任务已经开始，不能取消排队');await poll();}catch(e){say(e.message);}});
function showRecordedResult(){const c=records.find(x=>x.inputKey===key());if(c){result={...c,kind:'recorded',image:new URL(c.image,import.meta.url).href};review=c.review??emptyReview();note=c.note??'';renderResult();}}
function downloadBlob(blob,name){if(reviewExportURL)URL.revokeObjectURL(reviewExportURL);reviewExportURL=URL.createObjectURL(blob);$('review-file').href=reviewExportURL;$('review-file').download=name;$('review-file').textContent='保存生成 PNG';$('export-title').textContent='生成图片 · 导出前核对';$('export-help').textContent='图片来自当前实际推理结果，底部保留“模型生成、非实拍、不作尺码依据”标记。';$('copy-review').hidden=true;$('review-json').hidden=true;$('export-image').hidden=false;$('export-image').src=reviewExportURL;$('export-dialog').showModal();}
$('download').addEventListener('click',async()=>{if(!resultBelongsToPair(result,key()))return;try{const selectedKey=key(),selectedImage=result.image;const r=await fetch(selectedImage);if(!r.ok)throw Error('图片无法读取');const bitmap=await createImageBitmap(await r.blob());const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height+44;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);ctx.fillStyle='#f3f6e9';ctx.fillRect(0,bitmap.height,canvas.width,44);ctx.fillStyle='#40543b';ctx.font='14px Microsoft YaHei, sans-serif';ctx.fillText('AI生成试穿预览 · 非实拍 · 不作尺码依据',14,bitmap.height+28);bitmap.close();canvas.toBlob(blob=>{if(!resultBelongsToPair(result,selectedKey)||result.image!==selectedImage){say('输入已更改，本次旧图片导出已取消。');return;}downloadBlob(blob,'atelier-generated-tryon.png');},'image/png');}catch(e){say(e.message);}});
let reviewExportURL;
$('download-review').addEventListener('click',()=>{try{const record=reviewRecord({inputKey:key(),result,review,note});record.reference={available:hasOwnWearReference(),kind:hasOwnWearReference()?'original-worn-reconstruction':'no-cross-person-ground-truth',referenceImage:garment.referenceImage??null};record.reviewOrigin=result.reviewedBy??'current-page-manual-selection';const text=JSON.stringify(record,null,2);if(reviewExportURL)URL.revokeObjectURL(reviewExportURL);reviewExportURL=URL.createObjectURL(new Blob([text],{type:'application/json'}));$('review-file').href=reviewExportURL;$('review-file').download='atelier-real-person-review.json';$('review-file').textContent='保存评审 JSON';$('export-title').textContent='本次评审 · 导出前核对';$('export-help').textContent='文件包含这一组输入编号、实际生成参数、人工观察和实拍依据状态。保存后可作为本次记录复查。';$('copy-review').hidden=false;$('review-json').hidden=false;$('export-image').hidden=true;$('review-json').textContent=text;$('export-dialog').showModal();}catch(e){say(e.message);}});
$('copy-review').addEventListener('click',()=>{const area=document.createElement('textarea');area.value=$('review-json').textContent;area.readOnly=true;area.style.position='fixed';area.style.opacity='0';$('export-dialog').append(area);area.focus();area.select();let copied=false;try{copied=document.execCommand('copy');}catch{}area.remove();$('copy-review').focus();say(copied?'评审 JSON 已复制。':'无法自动复制，请在下方文本中选择内容复制。');});
$('undo-choice').addEventListener('click',()=>{if(busy()||!history.length)return;releaseCompletedJob();({person,garment,photoType,result,review,note}=history.pop());renderInputs();renderResult();say('已恢复上一组人物与衣服。');});
$('photo-type').addEventListener('change',e=>{if(busy())return;remember();releaseCompletedJob();photoType=e.target.value;clearResult();showRecordedResult();});
async function upload(kind,file){
 if(!file)return;const sequence=++uploadSequence[kind];
 if(busy()){say('请先等待当前试穿完成。');return;}
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('请选择不超过10MiB的JPEG、PNG或WebP照片');
  const bitmap=await createImageBitmap(file);const valid=bitmap.width>=64&&bitmap.height>=64&&bitmap.width<=4096&&bitmap.height<=4096&&bitmap.width*bitmap.height<=12_000_000;bitmap.close();
  if(sequence!==uploadSequence[kind])return;
  if(!valid)throw Error('照片尺寸需为64–4096像素，且不超过1200万像素');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(sequence!==uploadSequence[kind])return;
  if(busy()){say('推理已经开始，本次新选照片未应用。');return;}
  const localURL=URL.createObjectURL(file),accepted=select(kind,{id:`upload-${hash}`,kind,name:file.name,photoType:'catalog-product',localURL,file});
  if(accepted)say('照片已在本机选择，尚未开始推理。');else URL.revokeObjectURL(localURL);
 }catch(e){if(sequence===uploadSequence[kind])say(e.message);}
}
for(const kind of ['person','garment'])$(`${kind}-upload`).addEventListener('change',e=>upload(kind,e.target.files[0]));
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>b.closest('dialog').close());$('about-button').addEventListener('click',()=>$('about-dialog').showModal());
let zoom={scale:1,x:0,y:0,pointer:null};const applyZoom=()=>$('zoom-image').style.transform=`translate(${zoom.x}px,${zoom.y}px) scale(${zoom.scale})`;
$('zoom').addEventListener('click',()=>{zoom={scale:1,x:0,y:0,pointer:null};applyZoom();$('zoom-dialog').showModal();});$('zoom-reset').addEventListener('click',()=>{zoom.scale=1;zoom.x=zoom.y=0;applyZoom();});
$('zoom-view').addEventListener('wheel',e=>{e.preventDefault();zoom.scale=Math.max(1,Math.min(5,zoom.scale*Math.exp(-e.deltaY*.0015)));applyZoom();},{passive:false});
$('zoom-view').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();zoom.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};$('zoom-view').setPointerCapture(e.pointerId);});$('zoom-view').addEventListener('pointermove',e=>{if(zoom.pointer?.id!==e.pointerId)return;zoom.x=Math.max(-1000,Math.min(1000,zoom.x+e.clientX-zoom.pointer.x));zoom.y=Math.max(-1000,Math.min(1000,zoom.y+e.clientY-zoom.pointer.y));zoom.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};applyZoom();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('zoom-view').addEventListener(ev,()=>zoom.pointer=null);
function renderRecords(experiments){
 const failures=experiments.failedRuns??[];
 $('run-summary').textContent=records.length?`${records.length} 组实际输出 · ${failures.length} 次失败留档。预置评分是代理目视初审，可逐项改评；这些小样本不构成准确率或商业质量证明。`:'尚无实际输出留档。';
 const list=$('record-list');list.replaceChildren();
 for(const c of records){
  const b=document.createElement('button'),im=new Image(),label=document.createElement('span');im.src=new URL(c.image,import.meta.url).href;im.alt=c.name;label.textContent=c.name;
  const sub=document.createElement('small');sub.textContent=`${c.metadata.elapsed_seconds} 秒 · ${c.metadata.output.width} × ${c.metadata.output.height}`;label.append(document.createElement('br'),sub);b.append(im,label);
  b.addEventListener('click',()=>{if(busy())return;remember();releaseCompletedJob();person=samples.find(s=>s.id===c.personId);garment=samples.find(s=>s.id===c.garmentId);photoType=c.photoType;clearResult();renderInputs();showRecordedResult();$('job-status').textContent='正在查看真实生成留档，可改评或重新生成。';});list.append(b);
 }
 if(!records.length)list.innerHTML='<p class="record-empty">尚无实际生成结果。首轮完成后，真实输出与问题记录会在此留档。</p>';
 $('failed-runs').hidden=!failures.length;
 for(const run of failures){const p=document.createElement('p');const m=run.metadata??run;p.textContent=`${m.elapsed_seconds??'—'} 秒 · ${m.error?.type??'生成失败'} · ${run.note??'没有生成结果图。'}`;$('failure-list').append(p);}
}
async function init(){
 try{
  const [sr,er]=await Promise.all([fetch(new URL('./samples/manifest.json',import.meta.url)),fetch(new URL('./experiments.json',import.meta.url))]);
  const manifest=await sr.json(),experiments=await er.json();samples=manifest.samples;records=experiments.cases??[];
  person=samples.find(x=>x.kind==='person');garment=samples.find(x=>x.kind==='garment'&&x.pairedPersonId!==person.id)??samples.find(x=>x.kind==='garment');
  if(!person||!garment)throw Error('样本尚未准备完成');photoType=garment.photoType==='model'?'model':'flat-lay';renderInputs();renderResult();showRecordedResult();renderRecords(experiments);
  try{const restored=restoreJobSelection(JSON.parse(localStorage.getItem('atelier-real-person-session-v1')),samples);if(restored){({person,garment,photoType,job}=restored);renderInputs();clearResult();await poll();}}catch{}
  await checkHealth();
 }catch(e){$('job-status').textContent=`页面无法准备输入：${e.message}`;}
}
init();

$('comparison').addEventListener('pointerdown',e=>{if(e.button!==0||drag||!resultBelongsToPair(result,key()))return;e.preventDefault();splitDrag={id:e.pointerId,start:$('compare-range').value};$('comparison').setPointerCapture(e.pointerId);});
$('comparison').addEventListener('pointermove',e=>{if(splitDrag?.id!==e.pointerId)return;const b=$('person-image').getBoundingClientRect(),v=Math.max(0,Math.min(100,(e.clientX-b.left)/b.width*100));$('compare-range').value=String(Math.round(v));setSplit(Math.round(v));});
for(const ev of ['pointerup','lostpointercapture'])$('comparison').addEventListener(ev,()=>splitDrag=null);
$('comparison').addEventListener('pointercancel',()=>{if(splitDrag){$('compare-range').value=splitDrag.start;setSplit(splitDrag.start);splitDrag=null;}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&splitDrag){$('compare-range').value=splitDrag.start;setSplit(splitDrag.start);splitDrag=null;}});
