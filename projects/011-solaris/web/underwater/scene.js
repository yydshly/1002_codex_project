import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SWIM_Y, FISH_RADIUS, WATER_BOUNDS, REEFS, cameraForView } from './core.js';
import { DIVER_SPEED } from './follower.js';

export async function createUnderwater(host, callbacks = {}) {
  const world = new THREE.Scene();
  world.background = new THREE.Color('#285f70');
  world.fog = new THREE.FogExp2('#285f70', .035);
  const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '水下工作台：直接拖鱼，观察完整潜水员转向、沿安全路线追随');
  host.append(canvas);
  const camera = new THREE.PerspectiveCamera(37, 1, .05, 70);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = 3; controls.maxDistance = 12;
  controls.minPolarAngle = .01; controls.maxPolarAngle = .47 * Math.PI;
  let applying = false, pointer = null, held = false, cameraInteraction = true, cameraLocked = false, lockedCamera = null, disposed = false, frameId;
  let displayedFish, preview = null, routeLine = null, lastRouteKey = '';
  function clampCamera() {
    const old = controls.target.clone();
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -2.9, 2.9);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -2, 2);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 2);
    camera.position.add(controls.target.clone().sub(old));
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -12, 12);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -12, 12);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, .5, 10);
  }
  function getCamera() { clampCamera(); return { position:camera.position.toArray(), target:controls.target.toArray() }; }
  function setCamera(value) {
    applying = true; camera.position.fromArray(value.position); controls.target.fromArray(value.target);
    controls.update(); applying = false;
  }
  setCamera(cameraForView('hero'));
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(world, camera));
  const ao = new SSAOPass(world, camera, 1, 1);
  ao.kernelRadius = .1; ao.minDistance = .006; ao.maxDistance = .28;
  composer.addPass(ao); composer.addPass(new OutputPass());
  const gltfLoader = new GLTFLoader(), textures = new THREE.TextureLoader();
  const [fishAsset, reefAssets, sand, hdr, diverAsset] = await Promise.all([
    gltfLoader.loadAsync(new URL('./assets/models/clownfish.glb', import.meta.url).href),
    Promise.all(['a','b','c'].map(id => gltfLoader.loadAsync(new URL(`./assets/models/rock-${id}.glb`, import.meta.url).href))),
    Promise.all(['diff','nor_gl','rough'].map(kind => textures.loadAsync(new URL(`./assets/textures/sand_01/sand_01_${kind}_1k.jpg`, import.meta.url).href))),
    new HDRLoader().loadAsync(new URL('../studio/assets/environment/coastal-day.hdr', import.meta.url).href),
    gltfLoader.loadAsync(new URL('./assets/diver/scuba-diver.glb', import.meta.url).href),
  ]);
  sand[0].colorSpace = THREE.SRGBColorSpace;
  for (const texture of sand) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2.1, 1.5);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromEquirectangular(hdr);
  world.environment = environment.texture; world.environmentIntensity = .48;
  hdr.dispose(); pmrem.dispose();
  const mat = (color, roughness=.8) => new THREE.MeshStandardMaterial({ color, roughness });
  const add = (geometry, material, position, parent=world) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  // The enclosure is authored scenery. Only WATER_BOUNDS and the registered reefs constrain dragging.
  add(new RoundedBoxGeometry(6.5, .3, 4.55, 5, .15), mat('#355c59'), [0,-.24,0]);
  const sandBed = new THREE.MeshStandardMaterial({ color:'#afc7b6', map:sand[0], normalMap:sand[1], roughnessMap:sand[2], normalScale:new THREE.Vector2(.4,.4), roughness:.9 });
  add(new RoundedBoxGeometry(6.25, .1, 4.3, 4, .08), sandBed, [0,-.075,0]);
  const surrounding = add(new THREE.PlaneGeometry(80,80), mat('#346f78'), [0,-.42,0]);
  surrounding.rotation.x = -Math.PI/2;
  const boundGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(WATER_BOUNDS.minX,.01,WATER_BOUNDS.minZ), new THREE.Vector3(WATER_BOUNDS.maxX,.01,WATER_BOUNDS.minZ),
    new THREE.Vector3(WATER_BOUNDS.maxX,.01,WATER_BOUNDS.maxZ), new THREE.Vector3(WATER_BOUNDS.minX,.01,WATER_BOUNDS.maxZ),
    new THREE.Vector3(WATER_BOUNDS.minX,.01,WATER_BOUNDS.minZ),
  ]);
  const boundaryLine = new THREE.Line(boundGeometry,new THREE.LineBasicMaterial({ color:'#c2dbb8', transparent:true, opacity:.55 })); world.add(boundaryLine);
  for (let i=0; i<REEFS.length; i++) {
    const reef = REEFS[i], raw = reefAssets[i].scene;
    raw.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(raw), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    raw.position.x -= center.x; raw.position.y -= bounds.min.y; raw.position.z -= center.z;
    const centered = new THREE.Group(); centered.add(raw); centered.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(centered);
    const maxCornerRadius = Math.hypot(Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),Math.max(Math.abs(box.min.z),Math.abs(box.max.z)));
    const horizontalScale = reef.radius * .91 / maxCornerRadius;
    centered.scale.set(horizontalScale, 1.2 / size.y, horizontalScale);
    centered.position.set(reef.position[0],0,reef.position[1]); world.add(centered);
    raw.traverse(object => { if(object.isMesh) {
      object.castShadow = object.receiveShadow = true;
      const materials = Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){ material.metalness=0; material.roughness=.88; }
    }});
    const protection = add(new THREE.TorusGeometry(reef.radius+FISH_RADIUS,.006,6,96),new THREE.MeshBasicMaterial({color:'#a8c8b0',transparent:true,opacity:.52}),[reef.position[0],.016,reef.position[1]]);
    protection.rotation.x = -Math.PI/2; protection.castShadow = protection.receiveShadow = false;
  }
  const fishRoot = new THREE.Group(), fishAxis = new THREE.Group();
  fishRoot.add(fishAxis); world.add(fishRoot);
  // Registered source-space centre and scale cover all 201 sampled original Swim poses.
  fishAsset.scene.position.set(0,-.3117998242378235,.8143562078475952);
  fishAxis.rotation.y = Math.PI/2; fishAxis.scale.setScalar(.073); fishAxis.add(fishAsset.scene);
  fishAsset.scene.traverse(object => { if(object.isMesh) object.castShadow = object.receiveShadow = true; });
  const mixer = new THREE.AnimationMixer(fishAsset.scene);
  for(const clip of fishAsset.animations) mixer.clipAction(clip).play();
  const diverRoot = new THREE.Group();diverRoot.add(diverAsset.scene);world.add(diverRoot);
  diverAsset.scene.traverse(object=>{if(object.isMesh)object.castShadow=object.receiveShadow=true;});
  const diverMixer = new THREE.AnimationMixer(diverAsset.scene);
  const hoverClip=THREE.AnimationClip.findByName(diverAsset.animations,'Diver_Hover'),swimClip=THREE.AnimationClip.findByName(diverAsset.animations,'Diver_Swim');
  if(!hoverClip||!swimClip)throw new Error('潜水员悬停或游泳动作未能载入');
  const hoverAction=diverMixer.clipAction(hoverClip).play(),swimAction=diverMixer.clipAction(swimClip).play();
  swimAction.setEffectiveWeight(0);let swimBlend=0,swimBlendTarget=0,followLine=null,lastFollowKey='';
  const anchor = add(new THREE.TorusGeometry(.13,.009,8,48),new THREE.MeshBasicMaterial({color:'#e1bb75',transparent:true,opacity:.8}),[0,.028,0]);
  anchor.rotation.x=-Math.PI/2; anchor.castShadow=anchor.receiveShadow=false;
  const target = add(new THREE.TorusGeometry(.12,.015,8,48),new THREE.MeshBasicMaterial({color:'#ee8e7d',depthTest:false,transparent:true,opacity:.92}),[0,SWIM_Y,0]);
  target.rotation.x=-Math.PI/2; target.castShadow=target.receiveShadow=false;target.visible=false;
  // Soft top light, underwater colour and moving floor highlights are display design, not fluid simulation.
  const sun = new THREE.DirectionalLight('#ddf6d8',3.6); sun.position.set(-3,7,2); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-4,right:4,top:3.5,bottom:-3.5,near:.1,far:18});
  sun.shadow.normalBias=.012; sun.shadow.bias=-.00015; world.add(sun);
  const rim = new THREE.DirectionalLight('#88d5e8',2);rim.position.set(3,2,-3);world.add(rim);
  world.add(new THREE.HemisphereLight('#a4d9df','#49706c',1.25));
  const causticsMaterial = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{time:{value:0}},
    vertexShader:'varying vec2 uvFloor; void main(){uvFloor=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 uvFloor; uniform float time; void main(){vec2 p=uvFloor*24.; float a=sin(p.x+sin(p.y*.82+time*.23))+sin(p.y+cos(p.x*.72-time*.19)); float band=pow(max(0.,1.-abs(a)*2.3),10.); gl_FragColor=vec4(.71,.95,.83,band*.13);}',
  });
  const highlights=add(new THREE.PlaneGeometry(6.15,4.18),causticsMaterial,[0,-.021,0]); highlights.rotation.x=-Math.PI/2;highlights.castShadow=false;
  function updatePath(points) {
    const key=JSON.stringify(points); if(key===lastRouteKey)return;lastRouteKey=key;
    if(routeLine){world.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}
    if(points?.length>1){
      routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,SWIM_Y,z))),new THREE.LineBasicMaterial({color:'#9fe4d0',transparent:true,opacity:.8}));world.add(routeLine);
    }
  }
  function updateFollow(points){
    const key=JSON.stringify(points);if(key===lastFollowKey)return;lastFollowKey=key;
    if(followLine){world.remove(followLine);followLine.geometry.dispose();followLine.material.dispose();followLine=null;}
    if(points?.length>1){followLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,SWIM_Y-.04,z))),new THREE.LineDashedMaterial({color:'#eed097',transparent:true,opacity:.9,dashSize:.045,gapSize:.028}));followLine.computeLineDistances();world.add(followLine);}
  }
  function apply(state,{camera:changeCamera=true,fish=null,diver=null,path=null,followRoute=[],ghost=null,speed=0}={}){
    displayedFish=fish||state.fish;
    fishRoot.position.set(displayedFish.position[0],SWIM_Y,displayedFish.position[1]);fishRoot.rotation.y=displayedFish.heading;
    anchor.position.set(displayedFish.position[0],.028,displayedFish.position[1]);
    updatePath(path||state.records.at(-1)?.path||null);
    preview=ghost;target.visible=!!ghost;if(ghost)target.position.set(ghost[0],SWIM_Y,ghost[1]);
    const diverPose=diver||state.diver;diverRoot.position.set(diverPose.position[0],SWIM_Y,diverPose.position[1]);diverRoot.rotation.y=diverPose.heading;
    swimBlendTarget=THREE.MathUtils.clamp(speed/DIVER_SPEED,0,1);updateFollow(followRoute);
    if(changeCamera)setCamera(state.camera);
  }
  const raycaster=new THREE.Raycaster(),cursor=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-SWIM_Y);
  let dragOffset=[0,0];
  function ray(event){const rect=canvas.getBoundingClientRect();cursor.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(cursor,camera);}
  function point(event){ray(event);const hit=raycaster.ray.intersectPlane(plane,new THREE.Vector3());return hit?[hit.x,hit.z]:null;}
  function pickFish(event){ray(event);fishRoot.updateMatrixWorld(true);return raycaster.intersectObject(fishAsset.scene,true).length>0;}
  function candidate(event){const p=point(event);return p?[p[0]+dragOffset[0],p[1]+dragOffset[1]]:null;}
  canvas.addEventListener('pointerdown',event=>{
    if(cameraLocked){event.preventDefault();event.stopImmediatePropagation();return;}
    if(pointer!==null){event.stopImmediatePropagation();return;}
    if(event.button===0&&pickFish(event)){
      event.preventDefault();event.stopImmediatePropagation();
      const p=point(event);if(!p||callbacks.dragStart?.()===false)return;
      dragOffset=[displayedFish.position[0]-p[0],displayedFish.position[1]-p[1]];
      pointer=event.pointerId;controls.enabled=false;canvas.setPointerCapture(pointer);canvas.style.cursor='grabbing';
    }else if(cameraInteraction)held=true;
    else{event.preventDefault();event.stopImmediatePropagation();}
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(pointer===event.pointerId){const p=candidate(event);if(p)callbacks.dragChange?.(p);event.stopImmediatePropagation();}
    else canvas.style.cursor=pickFish(event)?'grab':'default';
  },true);
  function end(event,cancelled){
    if(event.pointerId!==pointer)return;event.stopImmediatePropagation();
    if(!cancelled){const p=candidate(event);if(p)callbacks.dragChange?.(p);else cancelled=true;}
    const id=pointer;pointer=null;controls.enabled=cameraInteraction&&!cameraLocked;canvas.style.cursor='default';
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    cancelled?callbacks.dragCancel?.():callbacks.dragEnd?.();
  }
  canvas.addEventListener('pointerup',event=>end(event,false),true);
  canvas.addEventListener('pointercancel',event=>end(event,true),true);
  canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null){pointer=null;controls.enabled=cameraInteraction&&!cameraLocked;callbacks.dragCancel?.();}});
  function release(){held=false;if(cameraLocked){setCamera(lockedCamera);cameraLocked=false;lockedCamera=null;controls.enabled=cameraInteraction&&pointer===null;}callbacks.cameraEnd?.();}
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
  controls.addEventListener('start',()=>{if(!applying&&cameraInteraction&&!cameraLocked&&pointer===null)callbacks.cameraStart?.();});
  controls.addEventListener('change',()=>{if(!applying&&cameraInteraction&&!cameraLocked&&pointer===null){clampCamera();callbacks.cameraChange?.(getCamera());}});
  controls.addEventListener('end',()=>{if(!applying&&cameraInteraction&&!cameraLocked&&pointer===null&&!held)callbacks.cameraEnd?.();});
  const resize=new ResizeObserver(()=>{const rect=host.getBoundingClientRect();if(rect.width&&rect.height){camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);composer.setSize(rect.width,rect.height);}});resize.observe(host);
  const projected=new THREE.Vector3(),projectedDiver=new THREE.Vector3();let lastTime=null;
  function frame(time){
    if(disposed)return;const dt=lastTime===null?0:Math.min(.05,(time-lastTime)/1000);lastTime=time;
    callbacks.tick?.(dt);mixer.update(dt);swimBlend+=(swimBlendTarget-swimBlend)*(1-Math.exp(-dt*7));hoverAction.setEffectiveWeight(1-swimBlend);swimAction.setEffectiveWeight(swimBlend);diverMixer.update(dt);causticsMaterial.uniforms.time.value=time/1000;controls.update();clampCamera();composer.render();
    projected.copy(fishRoot.position).project(camera);
    callbacks.project?.((projected.x+1)*host.clientWidth/2,(1-projected.y)*host.clientHeight/2,projected.z>=-1&&projected.z<=1);
    projectedDiver.copy(diverRoot.position).project(camera);callbacks.projectDiver?.((projectedDiver.x+1)*host.clientWidth/2,(1-projectedDiver.y)*host.clientHeight/2,projectedDiver.z>=-1&&projectedDiver.z<=1);
    frameId=requestAnimationFrame(frame);
  }
  frameId=requestAnimationFrame(frame);
  return {apply,setCamera,getCamera,get cameraHeld(){return held;},
    setCameraInteraction(value){cameraInteraction=!!value;controls.enabled=cameraInteraction&&!cameraLocked&&pointer===null;},
    cancelCamera(value){if(held){cameraLocked=true;lockedCamera=structuredClone(value);controls.enabled=false;}setCamera(value);},
    abortPointer(){const id=pointer;pointer=null;controls.enabled=cameraInteraction&&!cameraLocked;canvas.style.cursor='default';if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);},
    screenshot(){const visibility=routeLine?.visible,followVisibility=followLine?.visible;target.visible=false;if(routeLine)routeLine.visible=false;if(followLine)followLine.visible=false;composer.render();const data=canvas.toDataURL('image/png');target.visible=!!preview;if(routeLine)routeLine.visible=visibility;if(followLine)followLine.visible=followVisibility;return data;},
    dispose(){disposed=true;cancelAnimationFrame(frameId);resize.disconnect();window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);controls.dispose();composer.dispose();environment.dispose();renderer.dispose();},
  };
}
