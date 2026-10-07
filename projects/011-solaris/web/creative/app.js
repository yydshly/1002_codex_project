import {CANVAS, TARGETS, LIMITS, clone, initialState, validateState, History, sourceRectFromDrag, clientToCanvas, pointInTarget, makeStroke, addStroke} from './core.js';
import {SOURCES, loadAssets, CreativeRenderer} from './renderer.js';

const $=id=>document.getElementById(id), all=selector=>[...document.querySelectorAll(selector)];
const STORAGE='atelier-creative-workspace-v1', MAX_JSON=3*1024*1024;
let history, renderer, images, gesture=null, rangeEditing=false, hand=false, spaceHeld=false, busy=false, toastTimer;
let frame=0, zoom=1, view={scale:1,x:0,y:0}, fitScale=1, pendingRender=null;
const count=state=>state.layers.reduce((sum,layer)=>sum+layer.strokes.length,0);
const format=value=>Math.round(value*100);
function validateDocument(value){const next=validateState(value);if(new TextEncoder().encode(JSON.stringify(next)).length>MAX_JSON)throw Error('作品超过3MB上限，请减少笔迹或分成多份作品');return next;}

function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function persist(){
  if(!history)return;
  try{localStorage.setItem(STORAGE,JSON.stringify(history.pending?.state||history.current));$('save-status').textContent='已保存在本机';}
  catch{ $('save-status').textContent='本机保存空间不足'; }
}
function schedule(preview=null){pendingRender=preview;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;renderer.render(history.current,pendingRender);pendingRender=null;});}
function drawNow(){if(frame){cancelAnimationFrame(frame);frame=0;}pendingRender=null;renderer.render(history.current);}
function strokePreview(){if(gesture?.type!=='stroke')return null;return makeStroke(history.pending.state,gesture.points);}

function imageBounds(){
  const bounds=$('reference-image').getBoundingClientRect(), image=images[history.current.source.id];
  const scale=Math.min(bounds.width/image.naturalWidth,bounds.height/image.naturalHeight);
  return {left:bounds.left+(bounds.width-image.naturalWidth*scale)/2,top:bounds.top+(bounds.height-image.naturalHeight*scale)/2,width:image.naturalWidth*scale,height:image.naturalHeight*scale};
}
function drawCrop(rect=history.current.source.rect){
  const box=imageBounds(),frameBox=$('reference-stage').getBoundingClientRect();const [x,y,w,h]=rect;
  Object.assign($('crop-overlay').style,{left:`${box.left-frameBox.left-$('reference-stage').clientLeft+x*box.width}px`,top:`${box.top-frameBox.top-$('reference-stage').clientTop+y*box.height}px`,width:`${w*box.width}px`,height:`${h*box.height}px`});
}
function updateTool(){
  const state=history.current,info=SOURCES[state.source.id],mode=state.activeLayer,sample=renderer.sample(state.source);
  $('active-tool-name').textContent=mode==='texture'?'纹理印章':'参考笔触';
  $('active-tool-description').textContent=mode==='texture'?'原图选区成为真实像素印章，沿后续落笔持续使用。':'选区的颜色与亮暗主方向，成为持续跟随手势的参数笔刷。';
  renderer.preview($('sample-preview'),state.source,mode);
  $('sample-kind').textContent=mode==='texture'?'真实选区纹理':'五色 · 主方向';
  $('sample-detail').textContent=mode==='texture'?info.name:`${Math.round(sample.direction*180/Math.PI)}° · ${info.name}`;
  const palette=$('palette');palette.replaceChildren();sample.paletteHex.forEach(color=>{const swatch=document.createElement('span');swatch.style.background=color;swatch.title=color;swatch.setAttribute('aria-label',color);palette.append(swatch);});
  $('brush-analysis').textContent=mode==='texture'?'真实选区按笔刷大小映射成柔边印章；不是对象识别或毛发生成。':`选区提取五色与约${Math.round(sample.direction*180/Math.PI)}°亮暗主方向，结合手势生成笔丝。有限参数笔刷，不是艺术家风格复现。`;
  $('tool-status').textContent=`${info.name} · ${mode==='texture'?'纹理印章':'参考笔触'}`;
}
function applyUI({sample=true}={}){
  const state=history.current;
  $('undo').disabled=busy||(!history.pending&&!history.past.length);$('redo').disabled=busy||!!history.pending||!history.future.length;
  $('brush-size').value=state.brush.size;$('size-value').textContent=`${Math.round(state.brush.size)} px`;
  $('brush-opacity').value=format(state.brush.opacity);$('opacity-value').textContent=`${format(state.brush.opacity)}%`;
  $('target').value=state.target;$('stroke-count').textContent=`${count(state)} 笔`;
  all('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.activeLayer)));
  all('[data-layer]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layer===state.activeLayer)));
  all('[data-base]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.base===state.base)));
  all('[data-visibility]').forEach(button=>{const layer=state.layers.find(item=>item.id===button.dataset.visibility);button.setAttribute('aria-pressed',String(layer.visible));button.setAttribute('aria-label',`${layer.visible?'隐藏':'显示'}${layer.id==='paint'?'参考笔触':'纹理印章'}图层`);button.textContent=layer.visible?'◉':'○';});
  all('[data-source]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.source===state.source.id)));
  const info=SOURCES[state.source.id];$('reference-image').src=images[state.source.id].src;$('reference-image').alt=`${info.name} · 完整来源原图`;
  $('source-credit').textContent=`${info.author} · ${info.year}\n${info.kind}`;$('source-link').href=info.source;
  const image=images[state.source.id],[x,y,w,h]=state.source.rect;
  $('source-region').textContent=`${Math.round(w*image.naturalWidth)} × ${Math.round(h*image.naturalHeight)} px选区`;
  $('source-region').title=`原图位置 ${Math.round(x*image.naturalWidth)}, ${Math.round(y*image.naturalHeight)}`;
  drawCrop();
  const guide=$('target-guide');guide.hidden=state.target==='all';
  if(!guide.hidden){const [tx,ty,tw,th]=TARGETS[state.target];Object.assign(guide.style,{left:`${tx}px`,top:`${ty}px`,width:`${tw}px`,height:`${th}px`});}
  $('canvas-credit').textContent=state.base==='stilllife'?'塞尚公版静物底图 · 1200 × 900 工作坐标':'原创空白画纸 · 1200 × 900 工作坐标';
  $('clear-layer').disabled=!state.layers.find(item=>item.id===state.activeLayer).strokes.length;
  if(sample)updateTool();schedule();
}
function finishRange(){if(!rangeEditing)return;rangeEditing=false;try{history.current=validateDocument(history.current);history.commit();persist();}catch(error){history.cancel();applyUI();toast(error.message);}}
function cancelGesture({message=false}={}){
  if(gesture){const owner=gesture.owner,id=gesture.id;if(gesture.type==='pan'){view={...gesture.view};applyView();}gesture=null;history.cancel();if(owner.hasPointerCapture?.(id))owner.releasePointerCapture(id);$('canvas-viewport').classList.remove('dragging');}
  if(rangeEditing){rangeEditing=false;history.cancel();}
  if(history?.pending)history.cancel();
  if(history){applyUI();drawNow();}
  if(message)toast('已取消，恢复落笔前的作品');
}
function edit(label,fn){
  if(busy)return;
  if(gesture)cancelGesture();finishRange();
  try{history.edit(label,state=>{const next=clone(state);fn(next);return validateDocument(next);});applyUI();persist();}
  catch(error){toast(error.message);applyUI();}
}
function mode(id){edit('切换笔刷语义',state=>state.activeLayer=id);}

function fitCanvas(){
  const width=$('canvas-viewport').clientWidth,height=$('canvas-viewport').clientHeight;
  fitScale=Math.min((width-24)/CANVAS.width,(height-24)/CANVAS.height);
  if(!(fitScale>0))return;
  zoom=1;view={scale:fitScale,x:(width-CANVAS.width*fitScale)/2,y:(height-CANVAS.height*fitScale)/2};applyView();
}
function applyView(){
  Object.assign($('paper').style,{width:`${CANVAS.width}px`,height:`${CANVAS.height}px`,transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`});
  $('zoom-label').textContent=zoom===1?'适应':`${Math.round(zoom*100)}%`;
  $('canvas-viewport').classList.toggle('hand',hand||spaceHeld);
}
function zoomAt(multiplier,client=null){
  if(gesture){toast('请先完成当前操作，再调整画纸');return;}
  const bounds=$('canvas-viewport').getBoundingClientRect(),x=client?client[0]-bounds.left:bounds.width/2,y=client?client[1]-bounds.top:bounds.height/2;
  const next=Math.max(.65,Math.min(4,zoom*multiplier)),ratio=next/zoom;
  view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.scale*=ratio;zoom=next;applyView();
}
function pressure(event){return event.pointerType==='pen'?Math.max(.05,event.pressure||.5):1;}
function paperPoint(event){return [...clientToCanvas([event.clientX,event.clientY],$('art-canvas').getBoundingClientRect()),pressure(event)];}
function cursor(event){
  const box=$('art-canvas').getBoundingClientRect(),inside=event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;
  const node=$('brush-cursor');node.hidden=!inside||hand||spaceHeld;
  if(!node.hidden){const [x,y]=paperPoint(event),size=history.current.brush.size;Object.assign(node.style,{left:`${x}px`,top:`${y}px`,width:`${size}px`,height:`${size}px`});}
}
function startDraw(event){
  if(busy||event.button!==0||gesture||event.isPrimary===false)return;
  finishRange();const owner=$('canvas-viewport');owner.focus({preventScroll:true});
  if(hand||spaceHeld){gesture={type:'pan',owner,id:event.pointerId,start:[event.clientX,event.clientY],view:{...view}};owner.setPointerCapture(event.pointerId);owner.classList.add('dragging');event.preventDefault();return;}
  const box=$('art-canvas').getBoundingClientRect();
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)return;
  const state=history.current,layer=state.layers.find(item=>item.id===state.activeLayer),point=paperPoint(event);
  if(!layer.visible){toast('当前图层已隐藏，请先显示图层');return;}
  if(!pointInTarget(state.target,point.slice(0,2))){toast('请在标出的修改范围内落笔');return;}
  try{makeStroke(state,[point]);$('toast').hidden=true;history.begin('绘制一笔');gesture={type:'stroke',owner,id:event.pointerId,points:[point]};owner.setPointerCapture(event.pointerId);schedule(strokePreview());applyUI({sample:false});schedule(strokePreview());event.preventDefault();}
  catch(error){cancelGesture();toast(error.message);}
}
function moveDraw(event){
  cursor(event);if(!gesture||gesture.owner!==$('canvas-viewport')||gesture.id!==event.pointerId)return;
  if(gesture.type==='pan'){view.x=gesture.view.x+event.clientX-gesture.start[0];view.y=gesture.view.y+event.clientY-gesture.start[1];applyView();return;}
  if(gesture.type!=='stroke')return;
  const point=paperPoint(event),last=gesture.points.at(-1);
  if(Math.hypot(point[0]-last[0],point[1]-last[1])<.8)return;
  if(gesture.points.length>=LIMITS.pointsPerStroke){cancelGesture();toast('本笔超出坐标上限，已完整取消；请分成多笔绘制');return;}
  gesture.points.push(point);try{schedule(strokePreview());}catch(error){cancelGesture();toast(error.message);}
}
function endDraw(event){
  if(!gesture||gesture.owner!==$('canvas-viewport')||gesture.id!==event.pointerId)return;
  const current=gesture;
  if(current.type==='stroke'){
    try{const end=paperPoint(event),last=current.points.at(-1);if(Math.hypot(end[0]-last[0],end[1]-last[1])>.1&&current.points.length<LIMITS.pointsPerStroke)current.points.push(end);
      history.current=validateDocument(addStroke(history.current,current.points));history.commit();persist();
    }catch(error){history.cancel();toast(error.message);}
  }
  gesture=null;if(current.owner.hasPointerCapture(current.id))current.owner.releasePointerCapture(current.id);
  current.owner.classList.remove('dragging');applyUI({sample:false});drawNow();
}
function normalizedReference(event){const b=imageBounds();return [(event.clientX-b.left)/b.width,(event.clientY-b.top)/b.height];}
function startCrop(event){
  if(busy||event.button!==0||gesture||event.isPrimary===false)return;finishRange();
  const start=normalizedReference(event);if(start.some(x=>x<0||x>1))return;
  $('reference-stage').focus({preventScroll:true});history.begin('调整来源选区');gesture={type:'crop',owner:$('reference-stage'),id:event.pointerId,start,client:[event.clientX,event.clientY],rect:[...history.current.source.rect],moved:false};gesture.owner.setPointerCapture(event.pointerId);event.preventDefault();
}
function moveCrop(event){
  if(gesture?.type!=='crop'||gesture.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-gesture.client[0],event.clientY-gesture.client[1])>5)gesture.moved=true;
  if(gesture.moved){gesture.rect=sourceRectFromDrag(gesture.start,normalizedReference(event));drawCrop(gesture.rect);}
}
function endCrop(event){
  if(gesture?.type!=='crop'||gesture.id!==event.pointerId)return;
  const current=gesture;
  if(!current.moved){const [x,y]=normalizedReference(event);current.rect=sourceRectFromDrag([x-.1,y-.1],[x+.1,y+.1]);}
  history.current.source.rect=current.rect;history.commit();gesture=null;
  if(current.owner.hasPointerCapture(current.id))current.owner.releasePointerCapture(current.id);applyUI();persist();
}
function download(name,url){const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();}
function stable(){if(gesture)cancelGesture();finishRange();drawNow();return validateDocument(history.current);}
function keyboard(event){
  if(event.key==='Escape'){if(gesture||history?.pending){event.preventDefault();cancelGesture({message:true});}return;}
  if(event.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'){event.preventDefault();spaceHeld=true;applyView();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
  if(event.key.toLowerCase()==='b'){hand=false;toolButtons();}if(event.key.toLowerCase()==='h'){hand=true;toolButtons();}
}
function undo(redo=false){if(gesture)cancelGesture();else if(rangeEditing)cancelGesture();else{if(redo)history.redo();else history.undo();applyUI();drawNow();persist();}}
function toolButtons(){if(gesture)cancelGesture();$('draw-tool').setAttribute('aria-pressed',String(!hand));$('pan-tool').setAttribute('aria-pressed',String(hand));applyView();$('brush-cursor').hidden=true;}

async function init(){
  try{
    busy=true;images=await loadAssets();let state=initialState(),restoreIssue=false;
    try{const saved=localStorage.getItem(STORAGE);if(saved){if(new TextEncoder().encode(saved).length>MAX_JSON)throw Error('本机作品超过3MB');state=validateDocument(JSON.parse(saved));}}catch{restoreIssue=true;}
    history=new History(state);renderer=new CreativeRenderer($('art-canvas'),images);busy=false;
    $('loading').hidden=true;applyUI();fitCanvas();drawNow();if(restoreIssue)toast('本机作品无法读取，已打开新画纸；可从备份恢复');
    all('[data-source]').forEach(button=>button.addEventListener('click',()=>edit('选择工具来源',next=>{const id=button.dataset.source;next.source={id,rect:[...SOURCES[id].rect]};next.activeLayer=id==='cat'?'texture':'paint';})));
    all('[data-mode]').forEach(button=>button.addEventListener('click',()=>mode(button.dataset.mode)));
    all('[data-layer]').forEach(button=>button.addEventListener('click',()=>mode(button.dataset.layer)));
    all('[data-base]').forEach(button=>button.addEventListener('click',()=>edit('切换画纸底图',next=>next.base=button.dataset.base)));
    all('[data-visibility]').forEach(button=>button.addEventListener('click',()=>edit('切换图层可见性',next=>{const layer=next.layers.find(item=>item.id===button.dataset.visibility);layer.visible=!layer.visible;})));
    $('full-source').addEventListener('click',()=>edit('使用完整来源',next=>next.source.rect=[0,0,1,1]));
    $('target').addEventListener('change',event=>edit('修改笔刷作用范围',next=>next.target=event.target.value));
    $('clear-layer').addEventListener('click',()=>edit('清空当前图层',next=>next.layers.find(item=>item.id===next.activeLayer).strokes=[]));
    for(const id of ['brush-size','brush-opacity']){
      const input=$(id);input.addEventListener('pointerdown',()=>{if(gesture)cancelGesture();if(!history.pending)history.begin('调整笔刷');rangeEditing=true;});
      input.addEventListener('input',()=>{if(gesture){cancelGesture();return;}if(!history.pending){history.begin('调整笔刷');rangeEditing=true;}const size=Number($('brush-size').value),opacity=Number($('brush-opacity').value)/100;history.current.brush={size,opacity};applyUI({sample:false});});
      input.addEventListener('change',()=>{finishRange();applyUI({sample:false});});input.addEventListener('blur',finishRange);input.addEventListener('pointercancel',()=>cancelGesture());
    }
    $('undo').addEventListener('click',()=>undo());$('redo').addEventListener('click',()=>undo(true));
    $('save').addEventListener('click',()=>{if(gesture?.type==='stroke'){toast('请先完成当前一笔，再保存作品');return;}stable();persist();toast('完整笔触与来源已保存在本机');});
    $('draw-tool').addEventListener('click',()=>{hand=false;toolButtons();});$('pan-tool').addEventListener('click',()=>{hand=true;toolButtons();});
    $('zoom-in').addEventListener('click',()=>zoomAt(1.35));$('zoom-out').addEventListener('click',()=>zoomAt(1/1.35));$('fit').addEventListener('click',()=>{if(gesture)cancelGesture();fitCanvas();});
    const viewport=$('canvas-viewport');viewport.addEventListener('pointerdown',startDraw);viewport.addEventListener('pointermove',moveDraw);viewport.addEventListener('pointerup',endDraw);viewport.addEventListener('pointercancel',()=>cancelGesture());
    viewport.addEventListener('lostpointercapture',()=>{if(gesture?.owner===viewport)cancelGesture();});viewport.addEventListener('pointerleave',()=>{$('brush-cursor').hidden=true;});
    viewport.addEventListener('wheel',event=>{event.preventDefault();zoomAt(event.deltaY<0?1.12:1/1.12,[event.clientX,event.clientY]);},{passive:false});
    const reference=$('reference-stage');reference.addEventListener('pointerdown',startCrop);reference.addEventListener('pointermove',moveCrop);reference.addEventListener('pointerup',endCrop);reference.addEventListener('pointercancel',()=>cancelGesture());reference.addEventListener('lostpointercapture',()=>{if(gesture?.owner===reference)cancelGesture();});
    $('backup').addEventListener('click',()=>{$('json-text').value=JSON.stringify(stable());$('json-message').textContent='';$('json-dialog').showModal();});
    $('close-json').addEventListener('click',()=>$('json-dialog').close());
    $('import-json').addEventListener('click',()=>{try{const text=$('json-text').value;if(new TextEncoder().encode(text).length>MAX_JSON)throw Error('作品文件超过3MB上限');const next=validateDocument(JSON.parse(text));history.edit('打开创作作品',()=>next);applyUI();drawNow();persist();$('json-dialog').close();toast('已恢复完整来源、图层与笔触，可一步撤销');}catch(error){$('json-message').textContent=`未应用：${error.message}`;}});
    $('download-json').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(stable())],{type:'application/json'}),url=URL.createObjectURL(blob);download('atelier-creative.json',url);setTimeout(()=>URL.revokeObjectURL(url),1000);});
    $('export').addEventListener('click',()=>{stable();$('png-image').src=renderer.png();$('png-dialog').showModal();});$('close-png').addEventListener('click',()=>$('png-dialog').close());$('download-png').addEventListener('click',()=>download('atelier-creative.png',$('png-image').src));
    document.addEventListener('keydown',keyboard);document.addEventListener('keyup',event=>{if(event.code==='Space'){spaceHeld=false;applyView();}});
    window.addEventListener('blur',()=>{spaceHeld=false;cancelGesture();applyView();persist();});window.addEventListener('pagehide',persist);
    new ResizeObserver(()=>{if(gesture)cancelGesture();fitCanvas();drawCrop();}).observe(viewport);
    for(const id of ['save','backup','export'])$(id).disabled=false;
  }catch(error){busy=true;$('loading').replaceChildren();const message=document.createElement('p');message.textContent=`参考无法载入：${error.message}。请刷新重试。`;$('loading').append(message);}
}
void init();
