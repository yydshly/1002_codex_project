// Product adapter. Upstream src/ is preserved verbatim at commit 4811ba48.
import { App } from './src/App.js';
import { Group, Mesh, Vector3, Box3, Ray, BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute } from './src/engine/index.js';
import { Material } from './src/engine/render/Material.js';
import { G, GPU, Texture } from './src/engine/webgpu.js';
import { readTexture } from './src/engine/gpu/Readback.js';
import { ASSET_DEFS, createScene, validateScene } from '../scene-core.js';

// Vite normally supplies BASE_URL. Redirect the upstream root-relative asset requests
// into this iframe's directory, so the unchanged source also works in the research hub.
const nativeFetch=window.fetch.bind(window),assetRoot=new URL('./',import.meta.url);
window.fetch=(input,init)=>{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  if(url.origin===location.origin&&/^\/(clouds|models|textures|audio|ui)\//.test(url.pathname)){
    const target=new URL(url.pathname.slice(1)+url.search,assetRoot);
    return nativeFetch(input instanceof Request?new Request(target,input):target,init);
  }
  return nativeFetch(input,init);
};
const send = (type, data = {}) => parent.postMessage({source:'tidewater-runtime',type,...data},location.origin);
let sceneState = createScene(), ready = false, selectedId = null, exploring = false, gpuLost = false;
const app = new App(), entities = new Map();
let selectionRing, captureTarget;
const initGPU=GPU.init.bind(GPU);
GPU.init=async options=>{
  await initGPU(options);
  if(GPU.limits.maxSampledTexturesPerShaderStage<24||GPU.limits.maxStorageTexturesPerShaderStage<5){
    throw new Error('这块显卡的 WebGPU 资源上限不足（至少需要 24 个采样纹理、5 个存储纹理）');
  }
  return GPU;
};
// Keep one frame in flight. The editor adds DOM work and readback; an unbounded GPU
// queue can overwhelm integrated graphics when the browser renders faster than the GPU.
let frameEpoch=0;
function installFrameLoop(){
  const engine=app.engine;
  engine.stop=()=>{frameEpoch++;cancelAnimationFrame(engine._raf);};
  app.start=()=>{
    engine.stop();const epoch=frameEpoch;let previous=performance.now();
    const loop=async now=>{
      if(epoch!==frameEpoch)return;
      const dt=Math.min(.1,Math.max(.001,(now-previous)/1000));previous=now;engine.frame++;
      try{app.frame(dt);await GPU.queue.onSubmittedWorkDone();if(epoch===frameEpoch)engine._raf=requestAnimationFrame(loop);}
      catch(e){reportError(e);}
    };
    engine._raf=requestAnimationFrame(loop);
  };
}
const mat = (name,color,extra={}) => new Material({name,color,roughness:0.78,...extra});
const materials = {
  ivory:mat('editor plaster',0xe7e3cd), roof:mat('editor terracotta',0x914f38), wood:mat('editor timber',0x664b32),
  green:mat('editor leaves',0x4b7833,{side:'double'}), red:mat('editor lighthouse bands',0xb95c46),
  dark:mat('editor windows',0x294b50), glow:mat('editor lantern',0xf4cc78,{emissive:0xe3a84b}),
  highlight:mat('editor selection',0x5cd6c7,{lit:false,emissive:0x187e70,receiveShadows:false}),
};
function part(group,geometry,material,x=0,y=0,z=0){
  const m=new Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function buildCabin(){
  const g=new Group();
  part(g,new BoxGeometry(8,5.5,7),materials.ivory,0,2.75,0);
  for(const s of [-1,1]){const r=part(g,new BoxGeometry(5.1,.22,8.2),materials.roof,s*2.15,6.2,0);r.rotation.z=s*-.34;}
  part(g,new BoxGeometry(1.4,2.8,.12),materials.wood,0,1.4,3.56);
  for(const s of [-1,1])part(g,new BoxGeometry(1.6,1.4,.15),materials.dark,s*2.5,3.3,3.58);
  part(g,new BoxGeometry(9,.25,2),materials.wood,0,.1,4.3);
  part(g,new CylinderGeometry(.8,.8,.25,12),materials.wood,0,.2,5.5);
  return g;
}
function buildLighthouse(){
  const g=new Group();
  part(g,new CylinderGeometry(2.1,3,18,24),materials.ivory,0,9,0);
  for(const y of [5,11])part(g,new CylinderGeometry(2.8-y*.045,2.91-y*.045,1.7,24),materials.red,0,y,0);
  part(g,new CylinderGeometry(2.7,2.7,.45,24),materials.wood,0,18.3,0);
  part(g,new CylinderGeometry(1.8,1.8,2.8,12),materials.dark,0,19.9,0);
  part(g,new CylinderGeometry(.6,.6,1,12),materials.glow,0,20.1,0);
  part(g,new ConeGeometry(2.65,2.1,24),materials.roof,0,22.4,0);
  part(g,new BoxGeometry(1.1,2.8,.25),materials.wood,0,1.4,2.94);
  return g;
}
function buildPalm(){
  const g=new Group();
  part(g,new CylinderGeometry(.3,.6,9,12),materials.wood,0,4.5,0);
  const points=[],indices=[];
  for(let i=0;i<=8;i++){const t=i/8,w=.85*Math.sin(Math.PI*t);for(const side of [-1,1])points.push(side*w,Math.sin(t*Math.PI)*.6-t*t*1.8,t*6.5);}
  for(let i=0;i<8;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const geo=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(points,3)).setIndex(indices);geo.computeVertexNormals();
  for(let i=0;i<9;i++){const l=part(g,geo,materials.green,0,8.8,0);l.rotation.y=i*Math.PI*2/9;l.rotation.x=-.2;}
  part(g,new ConeGeometry(.7,2,10),materials.green,0,9.5,0);return g;
}
function buildEditable(){
  installFrameLoop();
  app.post.motionBlur.shutter.value=0; // Keep object inspection and camera jumps legible.
  entities.set('boat',app.boat.group);
  for(const o of sceneState.objects){
    if(o.id==='boat')continue;
    const type=ASSET_DEFS.find(d=>d.id===o.id).type;
    const g=type==='lighthouse'?buildLighthouse():type==='cabin'?buildCabin():buildPalm();
    g.name='studio-'+o.id;app.scene.add(g);entities.set(o.id,g);
  }
  selectionRing=new Mesh(new TorusGeometry(1,.025,6,72),materials.highlight);
  selectionRing.rotation.x=Math.PI/2;selectionRing.visible=false;app.scene.add(selectionRing);
  applyScene(sceneState);
  const boatUpdate=app.boatCtl.update.bind(app.boatCtl);
  app.boatCtl.update=dt=>{
    if(exploring){boatUpdate(dt);return;}
    const o=sceneState.objects.find(v=>v.id==='boat');
    app.boatCtl.position.x=o.x;app.boatCtl.position.z=o.z;
    app.boatCtl.position.y=0;app.boatCtl.quaternion.setFromAxisAngle(new Vector3(0,1,0),o.rotation*Math.PI/180);
    app.boatCtl.velocity.set(0,0,0);app.boatCtl.angular.set(0,0,0);app.boatCtl.apply();
  };
}
function groundAt(x,z){return Math.max(.05,app.terrainData.heightAt(x,z));}
function applyScene(next){
  // Calls from the parent iframe carry another realm's object prototype.
  next=structuredClone(next);validateScene(next);sceneState=next;
  if(!app.fft)return;
  app.settings.timeOfDay=next.environment.timeOfDay;app.settings.timeSpeed=0;
  const fft=app.fft;fft.local.windSpeed=next.environment.windSpeed;fft.swell.scale=next.environment.swell;fft.updateSpectrumUniforms();
  G.windSpeed.value=next.environment.windSpeed;
  app.shore.amplitude.value=.12+next.environment.swell*.46;
  if(app.clouds)app.clouds.coverage.value=next.environment.cloudCover;
  for(const o of next.objects){
    const g=entities.get(o.id);if(!g)continue;
    g.position.set(o.x,o.id==='boat'?0:groundAt(o.x,o.z)+o.y,o.z);g.rotation.y=o.rotation*Math.PI/180;g.scale.setScalar(o.scale);g.visible=o.visible;g.updateMatrixWorld(true);
    if(o.id==='boat'){app.boatCtl.position.set(o.x,0,o.z);app.boatCtl.mooring.anchor.set(o.x,0,o.z);app.boatCtl.mooring.heading=o.rotation*Math.PI/180;}
  }
  if(ready)updateSelection();
}
const poses={
  overview:{position:[-105,60,120],target:[0,9,-65]},
  pier:{position:[30,8,52],target:[53,2,-58]},
  boat:{position:[85,8,62],target:[64.5,2,36.5]},
};
function setCamera(preset){
  const p=poses[preset]||poses.overview;
  app.freeCam=true;app.fly.enabled=true;app.fly.velocity.set(0,0,0);
  const position=new Vector3(...p.position),dir=new Vector3(...p.target).sub(position).normalize();
  app.fly.setPose(position,Math.atan2(-dir.x,-dir.z),Math.asin(dir.y));
  app.post.taau._needsRestart=true;app.clouds?.resetHistory?.();
  app.input.enabled=false;app.input.keys.clear();app.input.pressed.clear();app.input.look.x=app.input.look.y=0;
  document.exitPointerLock?.();exploring=false;
}
function updateSelection(){
  const g=entities.get(selectedId);selectionRing.visible=!!g&&g.visible&&!exploring;
  if(!selectionRing.visible)return;
  const b=new Box3().setFromObject(g),size=b.getSize(new Vector3()),center=b.getCenter(new Vector3());
  const r=Math.max(size.x,size.z)*.65+1;
  selectionRing.scale.set(r,r,r);selectionRing.position.set(center.x,selectedId==='boat'?.18:groundAt(center.x,center.z)+.18,center.z);
}
function pick(e){
  if(!ready||exploring||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;
  app.camera.updateMatrixWorld(true);
  const p=new Vector3(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2,1).unproject(app.camera);
  const ray=new Ray(app.camera.position.clone(),p.sub(app.camera.position).normalize());
  let closest=null,distance=Infinity;
  for(const[id,g]of entities){if(!g.visible)continue;const point=ray.intersectBox(new Box3().setFromObject(g),new Vector3());if(point){const d=point.distanceTo(ray.origin);if(d<distance){distance=d;closest=id;}}}
  if(closest){selectedId=closest;updateSelection();send('select',{id:closest});}
}
let pointerStart={x:0,y:0};
async function capture(){
  const w=app.engine.width,h=app.engine.height;
  if(!captureTarget||captureTarget.width!==w||captureTarget.height!==h)captureTarget=new Texture({width:w,height:h,format:GPU.format,usage:['render','copySrc','sample'],label:'editor screenshot'});
  app.engine.stop();
  try{
    await GPU.queue.onSubmittedWorkDone();app.post.outputTexture=captureTarget;app.frame(1/60);await GPU.queue.onSubmittedWorkDone();
    const raw=await readTexture(captureTarget),rgba=new Uint8ClampedArray(raw.data);
    if(GPU.format.startsWith('bgra'))for(let i=0;i<rgba.length;i+=4){const r=rgba[i];rgba[i]=rgba[i+2];rgba[i+2]=r;}
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(rgba,w,h),0,0);
    return await new Promise(resolve=>c.toBlob(resolve,'image/png'));
  }finally{app.post.outputTexture=null;if(ready)app.start();}
}
function enter(){
  const x=53.6,z=-77;
  app.fly.setPose(new Vector3(x,groundAt(x,z)+1.8,z),Math.PI,0);
  app.setFreeCam(false);app.input.enabled=true;exploring=true;selectionRing.visible=false;app.input.requestLock();send('explore',{active:true});
}
window.tidewaterEditor={
  get ready(){return ready;},get app(){return app;},get scene(){return structuredClone(sceneState);},
  apply:applyScene,camera:setCamera,select:id=>{selectedId=id;if(ready)updateSelection();},capture,enter,
  getEntityBounds:id=>{const g=entities.get(id);if(!g)return null;const b=new Box3().setFromObject(g);return{min:b.min.toArray(),max:b.max.toArray()};},
};
const originalPrecompile=app.precompile.bind(app);
function reportError(e){ready=false;app.engine?.stop();document.querySelector('#boot-status').textContent=`预览无法启动：${e.message}`;send('error',{message:e.message});}
app.precompile=async()=>{
  GPU.device.lost.then(info=>{gpuLost=true;reportError(new Error(`显卡连接中断：${info.message.split('\n')[0]}`));});
  buildEditable();await originalPrecompile();
};
app.init((value,text)=>{
  const label=value<.3?'构建海岛与素材':value<.36?'准备海浪与天空':'编译光照和海水着色器';
  document.querySelector('#boot-status').textContent=`${label} · ${Math.round(value*100)}%`;
  send('progress',{value,text:label});
}).then(()=>{
  if(gpuLost)throw new Error('显卡连接已中断，请刷新后重试');
  ready=true;applyScene(sceneState);setCamera(sceneState.camera.preset);
  app.start();document.querySelector('#boot').hidden=true;
  app.engine.canvas.addEventListener('click',e=>{if(!exploring)e.stopImmediatePropagation();},true);
  app.engine.canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  app.engine.canvas.addEventListener('pointerup',pick);
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&exploring){setCamera(sceneState.camera.preset);updateSelection();send('explore',{active:false});}});
  // The original game HUD stays out of the editing surface; the renderer and world are unchanged.
  for(const n of document.querySelectorAll('[class*="hud"],.tw-guide,.tw-minimap'))n.style.display='none';
  setInterval(()=>{if(ready)send('stats',{fps:Math.round(app.fps||0),mode:exploring?'漫游':'编辑'});},1500);
  send('ready');
}).catch(e=>{reportError(e);console.error(e);});
