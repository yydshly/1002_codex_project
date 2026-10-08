// Real WebGPU candidate scene: generated source code meshes, not runtime AI or image projection.
import { validatePlan } from './creation-core.js';
import { validateModelCandidate } from './model-scene-core.js';
import { buildModelGeometry, MODEL_VERTEX_STRIDE } from './model-scene-assets.js';

import { Engine } from './runtime/src/engine/Engine.js';
import { GPU } from './runtime/src/engine/gpu/GPU.js';
import { Vector3, Matrix4, Ray } from './runtime/src/engine/math/index.js';

const send = (type, data = {}) => parent.postMessage({ source: 'tidewater-model-preview', type, ...data }, location.origin);
const boot = document.getElementById('boot');
const engine = new Engine(document.getElementById('viewport'));
let ready = false, lost = false, currentPlan = null, currentCandidate = null, pendingPlan = null, pendingCandidate = null, selectedId = null;
let pipeline, frameBuffer, frameBinding, vertexBuffer, depthTexture, depthSize = '';
let vertexData = new Float32Array(), entities = new Map(), generation = 0, rendered = 0, renderedGeneration = 0, notifiedGeneration = 0;
let renderBusy = false, scheduled = false, dirty = false;
let cameraPreset = 'overview', yaw = .58, inclination = .94, distance = 290;
const target = new Vector3(0, 2, 0), viewProjection = new Matrix4();
const uniformData = new Float32Array(36);
const defaults = { width: 200, depth: 150 };
function worldPoint(point,world){return{x:(point.x-.5)*world.width,z:(point.y-.5)*world.depth};}
const SHADER = /* wgsl */`
struct Frame { viewProjection: mat4x4f, sunlight: vec4f, selection: vec4f, camera: vec4f, environment: vec4f, coarseSun: vec4f };
@group(0) @binding(0) var<uniform> frame: Frame;
struct Vertex {
 @location(0) position: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f,
 @location(3) entity: f32, @location(4) material: f32,
};
struct Fragment {
 @builtin(position) position: vec4f, @location(0) normal: vec3f, @location(1) color: vec3f,
 @location(2) @interpolate(flat) entity: f32, @location(3) world: vec3f,
 @location(4) @interpolate(flat) material: f32,
};
@vertex fn vertexMain(input: Vertex) -> Fragment {
 var out: Fragment; out.position = frame.viewProjection * vec4f(input.position,1.0);
 out.normal = input.normal; out.color = input.color; out.entity = input.entity;
 out.world = input.position; out.material = input.material; return out;
}
fn noise(p:vec2f)->f32 {
 let i=floor(p); let f=fract(p); let s=f*f*(3.0-2.0*f);
 let a=fract(sin(dot(i,vec2f(127.1,311.7)))*43758.5453);
 let b=fract(sin(dot(i+vec2f(1.0,0.0),vec2f(127.1,311.7)))*43758.5453);
 let c=fract(sin(dot(i+vec2f(0.0,1.0),vec2f(127.1,311.7)))*43758.5453);
 let d=fract(sin(dot(i+vec2f(1.0),vec2f(127.1,311.7)))*43758.5453);
 return mix(mix(a,b,s.x),mix(c,d,s.x),s.y);
}
@fragment fn fragmentMain(input: Fragment) -> @location(0) vec4f {
 var n=normalize(input.normal); var base=input.color;
 var sun=frame.coarseSun; var color:vec3f;
 if(input.material>0.5) { sun=frame.sunlight; }
 if(input.material>1.5 && input.material<2.5) {
  // Waves perturb only the lighting normal; water elevation and lake support remain authored.
  let t=frame.environment.x;
  let a=input.world.x*.23+input.world.z*.14+t*.75;
  let b=input.world.x*-.16+input.world.z*.3-t*.57;
  n=normalize(vec3f(cos(a)*.075+cos(b)*.055,1.0,sin(a)*.09+sin(b)*.045));
  let ripple=(sin(a)*sin(b)+1.0)*.5;
  base*=.89+ripple*.21;
  let view=normalize(frame.camera.xyz-input.world);
  let fresnel=pow(1.0-max(dot(n,view),0.0),3.0);
  base=mix(base,vec3f(.37,.62,.63),fresnel*.42);
  let sparkle=pow(max(dot(reflect(-normalize(sun.xyz),n),view),0.0),96.0);
  base+=vec3f(1.0,.88,.64)*sparkle*.45;
 }
 if(input.material>2.5 && n.y>.8) {
  let variation=noise(input.world.xz*.19)*.12+noise(input.world.xz*.72)*.055;
  base*=.88+variation;
 }
 let diffuse=max(dot(n,normalize(sun.xyz)),0.0);
 let hemisphere=.37+.15*max(n.y,0.0);
 let warm=mix(vec3f(1.0),vec3f(1.16,.87,.68),sun.w);
 color=base*(vec3f(hemisphere)+warm*diffuse*.66);
 if(input.material>0.5) {
  color*=.96+max(n.y,0.0)*.035;
  let fog=smoothstep(frame.environment.z*1.6,frame.environment.z*3.2,distance(frame.camera.xyz,input.world))*.44;
  color=mix(color,mix(vec3f(.72,.83,.81),vec3f(.87,.71,.58),sun.w),fog);
 }
 if(input.entity>.5 && abs(input.entity-frame.selection.x)<.1) {
  color=mix(color,vec3f(.24,.83,.58),.43)+vec3f(.03);
 }
 return vec4f(pow(clamp(color,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2)),1.0);
}
`;

function report(error) {
  const message = error?.message || String(error);
  document.getElementById('boot-message').textContent = message;
  if (!ready || lost) boot.hidden = false;
  send('error', { message });
}

function refreshHud() {
  document.getElementById('preview-title').textContent = currentCandidate ? '模型代码候选 · '+currentPlan.name : currentPlan?.name || '布局粗模';
  const decorations = Array.from(entities.values()).reduce((sum, entity) => sum + entity.decorations, 0);
  document.getElementById('preview-state').textContent = currentPlan ? `${entities.size} 个对象${decorations ? ` · ${decorations} 个细节` : ''} · ${vertexData.length / (MODEL_VERTEX_STRIDE * 3)} 个三角形${selectedId ? ` · 已选 ${selectedId}` : ''}` : '等待布局';
}
function applyPlan(input, candidate = null) {
  const plan = validatePlan(input);
  if (lost) throw new Error('GPU 设备已失效，请重新加载预览。');
  candidate = candidate ? validateModelCandidate(candidate,plan) : null;
  if (!ready) { pendingPlan = plan; pendingCandidate = candidate; return; }
  const geometry = buildModelGeometry(plan, candidate);
  const nextBuffer = GPU.device.createBuffer({ size: Math.max(44, geometry.data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label: 'creation plan geometry' });
  if (geometry.data.length) GPU.queue.writeBuffer(nextBuffer, 0, geometry.data);
  const oldBuffer = vertexBuffer;
  const worldChanged = !currentPlan || currentPlan.world.width !== plan.world.width || currentPlan.world.depth !== plan.world.depth;
  vertexBuffer = nextBuffer; vertexData = geometry.data; entities = geometry.records;
  currentPlan = plan; currentCandidate = candidate ? structuredClone(candidate) : null; pendingPlan = null; pendingCandidate = null; generation++;
  if (!entities.has(selectedId)) selectedId = null;
  if (oldBuffer) GPU.queue.onSubmittedWorkDone().then(() => oldBuffer.destroy()).catch(() => oldBuffer.destroy());
  if (generation === 1 || worldChanged) setCamera(cameraPreset); else requestRender();
  refreshHud();
}
function select(id) {
  if (id !== null && id !== undefined && !entities.has(id)) throw new Error(`布局中没有对象「${id}」。`);
  selectedId = id ?? null; refreshHud(); requestRender();
}
function setCamera(preset) {
  if (!['overview', 'top', 'detail'].includes(preset)) throw new Error('镜头只支持 overview、top 或 detail。');
  cameraPreset = preset;
  const world = currentPlan?.world || defaults;
  const tallest = Math.max(0, ...Array.from(entities.values(), (record) => record.bounds.max.y));
  target.set(0, Math.max(1, tallest * .13), 0);
  distance = Math.max(world.width, world.depth, tallest * 2) * (preset === 'top' ? 1.65 : 1.36);
  yaw = preset === 'top' ? 0 : .58; inclination = preset === 'top' ? .002 : .94;
  if (preset === 'detail') {
    const focus = entities.get(selectedId) || [...entities.values()].find(record => ['cabin','lighthouse'].includes(record.kind));
    if (focus) { focus.bounds.getCenter(target); const size = focus.bounds.getSize(new Vector3()); distance = Math.max(size.x,size.y,size.z,8)*2.7; inclination=.95; yaw=.54; }
  }
  document.querySelectorAll('[data-camera]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.camera === preset)));
  requestRender();
}
function updateCamera() {
  engine.camera.position.set(target.x + Math.sin(yaw) * Math.sin(inclination) * distance, target.y + Math.cos(inclination) * distance, target.z + Math.cos(yaw) * Math.sin(inclination) * distance);
  engine.camera.lookAt(target); engine.camera.updateMatrixWorld(true);
  viewProjection.multiplyMatrices(engine.camera.projectionMatrix, engine.camera.matrixWorldInverse);
}
function requestRender() {
  dirty = true;
  if (!ready || lost || renderBusy || scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; if (dirty && ready && !lost) render(); });
}
function render() {
  if (renderBusy) return;
  dirty = false; renderBusy = true;
  try {
    const width = engine.width, height = engine.height, size = `${width}x${height}`;
    if (size !== depthSize) {
      depthTexture?.destroy(); depthSize = size;
      depthTexture = GPU.device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT, label: 'creation depth' });
    }
    updateCamera(); uniformData.set(viewProjection.elements, 0);
    const sunset = (currentCandidate?.recipe?.lighting === 'sunset') || (!currentCandidate && currentPlan?.style.lighting === 'sunset');
    uniformData.set(sunset ? [-.7, .3, .45, 1] : [-.4, .85, .45, .23], 16);
    uniformData.set([...engine.camera.position.toArray(), 0], 24);
    uniformData.set([performance.now() / 1000, currentCandidate ? 1 : 0, Math.max(currentPlan?.world.width||200,currentPlan?.world.depth||150), 0], 28);
    uniformData.set(currentPlan?.style.lighting === 'sunset' ? [-.7,.3,.45,1] : [-.35,.82,.48,0],32);
    uniformData.set([entities.get(selectedId)?.number || 0, 0, 0, 0], 20);
    GPU.queue.writeBuffer(frameBuffer, 0, uniformData);
    const encoder = GPU.device.createCommandEncoder({ label: 'creation frame' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: engine.currentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: sunset ? { r: .85, g: .75, b: .68, a: 1 } : { r: .78, g: .86, b: .82, a: 1 } }],
      depthStencilAttachment: { view: depthTexture.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    if (vertexBuffer && vertexData.length) { pass.setPipeline(pipeline); pass.setBindGroup(0, frameBinding); pass.setVertexBuffer(0, vertexBuffer); pass.draw(vertexData.length / MODEL_VERTEX_STRIDE); }
    const frameGeneration=generation;
    pass.end(); GPU.queue.submit([encoder.finish()]); rendered++;
    GPU.queue.onSubmittedWorkDone().then(() => {
      renderBusy=false; renderedGeneration=Math.max(renderedGeneration,frameGeneration);
      if(frameGeneration===generation && notifiedGeneration<generation) { notifiedGeneration=generation; send('updated',{stats:getStats(),candidate:!!currentCandidate}); }
      if(dirty)requestRender();
    }).catch((error) => { renderBusy = false; report(error); });
  } catch (error) { renderBusy = false; report(error); }
}
const a = new Vector3(), b = new Vector3(), c = new Vector3(), intersection = new Vector3();
function pick(x, y) {
  updateCamera();
  const point = new Vector3(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2, 1).unproject(engine.camera);
  const ray = new Ray(engine.camera.position.clone(), point.sub(engine.camera.position).normalize());
  let closest = null, nearest = Infinity;
  for (const record of entities.values()) {
    if (!ray.intersectsBox(record.bounds)) continue;
    for (let i = record.start; i < record.end; i += 3) {
      a.fromArray(vertexData, i * MODEL_VERTEX_STRIDE); b.fromArray(vertexData, (i + 1) * MODEL_VERTEX_STRIDE); c.fromArray(vertexData, (i + 2) * MODEL_VERTEX_STRIDE);
      if (ray.intersectTriangle(a, b, c, false, intersection)) {
        const distance = ray.origin.distanceToSquared(intersection);
        // The depth pipeline lets later coplanar surfaces win; picking must choose the same visible object.
        if (distance <= nearest + 1e-7) { nearest = Math.min(nearest, distance); closest = record.id; }
      }
    }
  }
  select(closest); send('select', { id: closest });
}
function bounds(id) {
  const record = entities.get(id);
  return record ? { min: record.bounds.min.toArray(), max: record.bounds.max.toArray(), triangles: (record.end - record.start) / 3,
    decorations: record.decorations, beachTriangles: record.beachTriangles, upgraded: record.upgraded, locked: record.locked,
    ...(record.baseBounds ? { baseBounds: structuredClone(record.baseBounds), baseTriangles: record.baseTriangles } : {}),
  } : null;
}
function getStats() {
  return { renderer:'WebGPU', entities:entities.size, vertices:vertexData.length/MODEL_VERTEX_STRIDE,
    triangles:vertexData.length/(MODEL_VERTEX_STRIDE*3), bufferBytes:vertexData.byteLength,generation,rendered,renderedGeneration,inFlight:renderBusy,
    upgraded:[...entities.values()].filter(e=>e.upgraded).length,locked:[...entities.values()].filter(e=>e.locked).length,
    decorations:[...entities.values()].reduce((s,e)=>s+e.decorations,0),beachTriangles:[...entities.values()].reduce((s,e)=>s+e.beachTriangles,0) };
}
function exportMesh() {
  const positions=[],normals=[],colors=[];
  for(let i=0;i<vertexData.length;i+=MODEL_VERTEX_STRIDE) {
    positions.push(...vertexData.subarray(i,i+3)); const n=vertexData.subarray(i+3,i+6),length=Math.hypot(...n); normals.push(n[0]/length,n[1]/length,n[2]/length); colors.push(...vertexData.subarray(i+6,i+9));
  }
  const groups=[];
  const first=[...entities.values()][0]?.start ?? vertexData.length/MODEL_VERTEX_STRIDE;
  if(first)groups.push({id:'ocean-backdrop',start:0,count:first});
  for(const record of entities.values())groups.push({id:record.id,start:record.start,count:record.end-record.start});
  return {positions,normals,colors,groups};
}
window.modelScenePreview = {
  get ready(){return ready&&!lost;},get plan(){return currentPlan?structuredClone(currentPlan):null;},
  get candidate(){return currentCandidate?structuredClone(currentCandidate):null;},get stats(){return getStats();},
  get selectedId(){return selectedId;},get cameraPreset(){return cameraPreset;},
  getEntityBounds:bounds,applyPlan,select,camera:setCamera,exportMesh,
  projectEntity:id=>{const record=entities.get(id);if(!record)return null;updateCamera();const p=record.bounds.getCenter(new Vector3()).project(engine.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
  projectPoint:(point,height=0)=>{if(!currentPlan)return null;updateCamera();const w=worldPoint(point,currentPlan.world);const p=new Vector3(w.x,height,w.z).project(engine.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
};
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== parent || !['tidewater-model-preview','tidewater-model-studio','tidewater-creation'].includes(event.data?.source)) return;
  try {
    if (event.data.type === 'plan') applyPlan(event.data.plan,event.data.candidate ?? null);
    else if (event.data.type === 'camera') setCamera(event.data.preset ?? event.data.camera);
    else if (event.data.type === 'select') select(event.data.id);
    else if (event.data.type === 'export') send('exported',{requestId:event.data.requestId,mesh:exportMesh()});
  } catch (error) { report(error); if(event.data?.requestId)send('error',{message:error.message,requestId:event.data.requestId}); }
});
document.querySelectorAll('[data-camera]').forEach((button) => button.addEventListener('click', () => setCamera(button.dataset.camera)));

async function init() {
  await engine.init(); engine.camera.fov = 43; engine.camera.near = .3; engine.camera.far = 20000; engine.camera.updateProjectionMatrix();
  GPU.device.lost.then((info) => { lost = true; ready = false; report(new Error(`3D GPU 设备已失效：${info.message || info.reason}`)); });
  const shader = GPU.device.createShaderModule({ code: SHADER, label: 'creation basic lighting' });
  const diagnostics = await shader.getCompilationInfo();
  const errors = diagnostics.messages.filter((message) => message.type === 'error');
  if (errors.length) throw new Error(errors.map((error) => error.message).join('; '));
  pipeline = await GPU.device.createRenderPipelineAsync({
    label: 'creation mesh pipeline', layout: 'auto',
    vertex: { module: shader, entryPoint: 'vertexMain', buffers: [{ arrayStride: 44, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32' }, { shaderLocation:4,offset:40,format:'float32' },
    ] }] },
    fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format: GPU.format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'greater-equal' },
  });
  frameBuffer = GPU.device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'creation camera/light' });
  frameBinding = GPU.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  let drag = null;
  engine.canvas.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }; engine.canvas.setPointerCapture(event.pointerId); });
  engine.canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
    if (drag.moved) { yaw -= (event.clientX - drag.lastX) * .007; inclination = Math.max(.015, Math.min(1.46, inclination + (event.clientY - drag.lastY) * .006)); requestRender(); }
    drag.lastX = event.clientX; drag.lastY = event.clientY;
  });
  engine.canvas.addEventListener('pointerup', (event) => { if (!drag) return; if (!drag.moved) pick(event.clientX, event.clientY); drag = null; });
  engine.canvas.addEventListener('pointercancel', () => { drag = null; });
  engine.canvas.addEventListener('wheel', (event) => { event.preventDefault(); const world = currentPlan?.world || defaults; distance = Math.max(Math.max(world.width, world.depth) * .12, Math.min(Math.max(world.width, world.depth) * 5, distance * Math.exp(event.deltaY * .001))); requestRender(); }, { passive: false });
  engine.onResize.push(requestRender);
  if (lost) throw new Error('GPU 设备已失效，请重新加载预览。');
  ready = true; boot.hidden = true;
  if (pendingPlan) applyPlan(pendingPlan,pendingCandidate); else setCamera(cameraPreset);
  send('ready');
  // Modest animation rate; authored water heights and every mesh vertex stay fixed.
  const waveTimer=setInterval(()=>{if(currentCandidate&&!document.hidden)requestRender();},70);
  window.addEventListener('pagehide',()=>clearInterval(waveTimer),{once:true});
}
init().catch(report);
window.addEventListener('pagehide', () => { lost = true; ready = false; vertexBuffer?.destroy(); depthTexture?.destroy(); frameBuffer?.destroy(); });
