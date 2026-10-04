const $=selector=>document.querySelector(selector),items=window.ElementCatalog;
let selected='clawd',filter='all',engineReady=false,latestRequest=0,actorBefore='clawd';
const frame=$('#drive-engine');
const option=(value,label)=>{const element=document.createElement('option');element.value=value;element.textContent=label;return element;};

function renderCards(){
  const cards=items.filter(item=>filter==='all'||item.kind===filter).map(item=>{
    const button=document.createElement('button');button.type='button';button.className='element-card';button.dataset.element=item.id;button.setAttribute('aria-pressed',String(item.id===selected));
    const img=document.createElement('img');img.src=`assets/elements/${item.id}.jpg`;img.width=960;img.height=540;img.alt=`${item.name}，原始函数实际绘制的预览`;img.loading='lazy';
    const label=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('small');title.textContent=item.name;description.textContent=`${item.subtitle} · ${item.scope}`;label.append(title,description);button.append(img,label);
    button.addEventListener('click',()=>{selectElement(item.id);$('#element-detail').scrollIntoView({behavior:'instant',block:'start'});});return button;
  });
  $('#element-cards').replaceChildren(...cards);
}
function selectElement(id){
  selected=id;const item=items.find(item=>item.id===id);
  $('#element-image').src=`assets/elements/${id}.jpg`;$('#element-image').alt=`${item.name}的原始源码实际预览`;
  for(const [suffix,key] of [['name','name'],['scope','scope'],['description','description'],['controls','controls'],['prepare','prepare'],['drive','drive'],['code','code']])$('#element-'+suffix).textContent=item[key];
  $('#element-source').href='vendor/pdoom/'+item.file;
  $('#element-source').textContent=`查看原始 ${item.file} ↗`;
  $('#use-controller').hidden=!['clawd','researcher'].includes(id);
  document.querySelectorAll('[data-element]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.element===id)));
  window.elementCatalogState={selected:id,filter,item};
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if(filter!=='all'&&items.find(item=>item.id===selected).kind!==filter)selected=items.find(item=>item.kind===filter).id;
  renderCards();selectElement(selected);
}));

function actorOptions(){
  const actor=$('#drive-actor').value;
  const faces=actor==='clawd'?[['normal','普通'],['happy','开心'],['scared','惊吓'],['heart','爱心眼'],['wink','眨眼'],['angry','生气']]:[['dot','普通'],['wide','睁大眼'],['star','星星眼'],['heart','爱心眼'],['closed','闭眼'],['sad','难过']];
  const accessories=actor==='clawd'?[['','无配件'],['hard','工程帽'],['crown','王冠'],['party','派对帽'],['cat','猫耳']]:[['','无配件'],['bowtie','领结']];
  $('#drive-eyes').replaceChildren(...faces.map(([value,label])=>option(value,label)));
  $('#drive-accessory').replaceChildren(...accessories.map(([value,label])=>option(value,label)));
  $('#drive-eyes').value=actor==='clawd'?'happy':'wide';
  if(actorBefore!==actor){$('#drive-color').value=actor==='clawd'?'#d97757':'#fbf4e6';actorBefore=actor;}
}
function inputs(){return{actor:$('#drive-actor').value,motion:$('#drive-motion').value,eyes:$('#drive-eyes').value,accessory:$('#drive-accessory').value,color:$('#drive-color').value,size:Number($('#drive-size').value),x:Number($('#drive-x').value),arm:Number($('#drive-arm').value),time:Number($('#drive-time').value)/12};}
function updateInstructions(){
  const c=inputs(),size=c.actor==='clawd'?c.size:c.size*.75;
  $('#drive-size-value').textContent=String(c.size);$('#drive-x-value').textContent=c.x+' px';$('#drive-arm-value').textContent=c.arm+'°';$('#drive-time-value').textContent=c.time.toFixed(2)+' s';
  const options=c.actor==='clawd'?`eyes: "${c.eyes}", hat: "${c.accessory}",\n  col: "${c.color}",\n  dk: mixCol("${c.color}", PAL.ink, .35),\n  lt: mixCol("${c.color}", PAL.cream, .4)`:`eyes: "${c.eyes}", coat: "${c.color}",\n  spin: Math.acos(m.sx) / (2 * Math.PI),\n  run: ${c.motion==='run' ? 'm.walk' : 'undefined'},\n  bowtie: ${c.accessory==='bowtie'}`;
  $('#drive-code').textContent=`// 与控制台真正执行的调用保持一致\nconst t = ${$('#drive-time').value} / 12;\nconst m = move("${c.motion}", t, 0);\n${c.actor==='clawd'?'clawd':'researcher'}(${c.x} + m.dx * ${size}, 830, ${size}, {\n  ...m,\n  aR: ${c.arm} * Math.PI / 180,\n  ${options}\n});\n// 上游 renderAt(t) 绘制并合成整帧`;
  const role=items.find(item=>item.id===c.actor),root='projects/008-pdoom-video/web/';
  $('#model-brief').textContent=`请基于当前项目制作一段新的 6 秒二维动画。\n\n一、故事要求\n${$('#story-request').value.trim()||'请先确定一个清楚的角色动作。'}\n\n二、先读取实际准备好的代码\n${root}vendor/pdoom/core.js\n${root}vendor/pdoom/clawd.js\n${c.actor==='researcher'?root+'vendor/pdoom/cast.js\n':''}${root}vendor/pdoom/props.js\n${root}elements-data.js（角色、要素及调用说明）\n${root}elements-scene.js（实际参数驱动示例）\n${root}example-scene.js 与 example-studio.html（完整出片样例）\n参考 projects/008-pdoom-video/upstream/ANIMATION_GUIDE.md 的风格与接口规范。\n\n三、角色准备\n使用 ${role.name}，调用接口为 ${role.api}。\n当前造型与动作参考：${JSON.stringify(c)}\nClawd 的 x/y 是脚底中点；u 是尺寸单位。研究员的 s 是独立尺寸单位，本控制台用 s = u × .75。\n角色函数的手臂角度使用弧度；正值抬起。\n保留同一造型函数，按时间修改姿态。故事需要的新道具请另写绘图函数。\n\n四、模型应完成的工作\n先写带起止时间、动作和转场的分镜，再写可执行场景代码。\n动作预设 move() 主要给出身体与肢体变化；走位另用 kf() 计算 x(t)。\n参数、镜头与画面应由时间计算，每个时刻能独立重绘。\n共享文件保留原样；新造型或新道具放在新增文件。\n如使用研究员，在场景包装页额外加载 cast.js。\n\n五、检查与交付\n先渲染起点、动作顶点和结尾这些关键帧，检查姿态、颜色、遮挡与接触。\n再输出 1920×1080、12 FPS、6 秒、72 帧的无声样例。\n参考 projects/008-pdoom-video/tools/render-example.mjs 的 Chrome + renderAt + FFmpeg 链路。\n交付场景源文件、实际帧、MP4 和实际渲染日志，不把示意图当作渲染结果。\n\n以上是给能读取本项目文件的编码模型的创作任务；播放阶段执行完成的动画程序。`;
}
function submitDrive(){
  updateInstructions();if(!engineReady)return;
  const input=inputs();latestRequest++;
  $('#drive-status').textContent='正在用原始角色和绘画函数重新绘制…';
  window.elementDriveState={status:'rendering',requestId:latestRequest,input};
  frame.contentWindow.postMessage({type:'drive-element',requestId:latestRequest,input},location.origin);
}
$('#drive-form').addEventListener('submit',event=>{event.preventDefault();submitDrive();});
$('#drive-form').addEventListener('input',updateInstructions);
$('#drive-form').addEventListener('change',event=>{if(event.target.id==='drive-actor')actorOptions();submitDrive();});
$('#story-request').addEventListener('input',updateInstructions);
$('#use-controller').addEventListener('click',()=>{$('#drive-actor').value=selected;actorOptions();updateInstructions();$('#drive').scrollIntoView({behavior:'instant',block:'start'});if(engineReady)submitDrive();});
$('#start-engine').addEventListener('click',()=>{
  $('#start-engine').disabled=true;$('#start-engine').textContent='正在启动绘画引擎…';$('#drive-status').textContent='正在加载原始共享代码与章节角色，准备本机重绘…';
  frame.src='elements-studio.html?render';frame.hidden=false;$('#drive-poster').hidden=true;
});
window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
  const data=event.data;
  if(data?.type==='element-ready'){
    engineReady=true;$('#drive-form').querySelectorAll(':disabled').forEach(control=>control.disabled=false);
    $('#start-engine').hidden=true;submitDrive();
  }else if(data?.requestId===latestRequest&&data.type==='element-result'){
    window.elementDriveState={status:'rendered',requestId:data.requestId,input:data.input,pose:data.pose,renderMs:data.renderMs};
    $('#drive-status').textContent=`原始代码实际重绘完成 · ${Math.round(data.renderMs)} ms / 帧`;
    $('#drive-values').textContent=`t=${data.input.time.toFixed(2)} s → move("${data.input.motion}")：横向偏移 ${data.pose.dx.toFixed(2)}，身体升降 ${data.pose.dy.toFixed(2)}，挤压 ${data.pose.sq.toFixed(2)} → 角色函数绘制`;
  }else if(data?.requestId===latestRequest&&data.type==='element-error'){
    window.elementDriveState={status:'error',message:data.message};$('#drive-status').textContent='重绘失败：'+data.message;
  }
});
$('#copy-brief').addEventListener('click',async()=>{const text=$('#model-brief').textContent;try{await navigator.clipboard.writeText(text);$('#copy-status').textContent='已复制创作任务，可交给能访问此项目文件的编码模型。';}catch{const range=document.createRange();range.selectNodeContents($('#model-brief'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('#copy-status').textContent='任务说明已选中，请按 Ctrl+C 复制。';}});
actorOptions();updateInstructions();renderCards();selectElement('clawd');document.body.dataset.ready='true';
