import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TEMPLATES, BOWL, inspectionPose } from './core.js';
import { createKitchenPhysics } from './physics.js';

export async function createKitchen(host, callbacks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e4d8');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '料理备料台：拖动案板上的食材入碗，点击碗内食材浮起观察');
  host.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(35, 1, .025, 30);
  camera.position.set(1.8, 1.7, 2.3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-.2, .18, 0);
  controls.enableDamping = false;
  controls.minDistance = .65; controls.maxDistance = 6;
  controls.minPolarAngle = .1; controls.maxPolarAngle = .48 * Math.PI;
  controls.update();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, 1, 1);
  ao.kernelRadius = .035; ao.minDistance = .002; ao.maxDistance = .1;
  composer.addPass(ao); composer.addPass(new OutputPass());
  const manifest = await fetch(new URL('../assets/kitchen/manifest.json', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('食材清单未能读取'); return r.json();
  });
  const textureLoader = new THREE.TextureLoader(), gltfLoader = new GLTFLoader();
  async function surface(name, repeat) {
    const [map, normalMap, roughnessMap] = await Promise.all(['diff', 'nor_gl', 'rough'].map(type =>
      textureLoader.loadAsync(new URL(`../studio/assets/textures/${name}-${type}.jpg`, import.meta.url).href)));
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
    return { map, normalMap, roughnessMap };
  }
  const [models, hdr, wood, fabric] = await Promise.all([
    Promise.all(manifest.models.map(async asset => ({ asset, gltf: await gltfLoader.loadAsync(new URL(`../assets/kitchen/${asset.file}`, import.meta.url).href) }))),
    new HDRLoader().loadAsync(new URL('../studio/assets/environment/coastal-day.hdr', import.meta.url).href),
    surface('wood_floor', [2, 1.5]), surface('fabric_pattern_07', [1.5, 1.5]),
  ]);
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromEquirectangular(hdr);
  scene.environment = environment.texture; scene.environmentIntensity = .35; hdr.dispose(); pmrem.dispose();
  const prototypes = new Map(), sourceMeshes = new Map(), itemMeshes = new Map();
  for (const { asset, gltf } of models) {
    // Retain glTF node transforms and recenter the complete scan, including its stem.
    const root = gltf.scene; root.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    let radius = 0; const vertex = new THREE.Vector3();
    root.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = true;
      const positions = node.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) radius = Math.max(radius, vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).distanceTo(center));
    });
    if (!radius) throw new Error(`${asset.name}扫描几何无效`);
    const prototype = new THREE.Group();
    root.position.sub(center); prototype.add(root);
    prototype.scale.setScalar(TEMPLATES[asset.id].radius * .985 / radius);
    prototype.updateMatrixWorld(true);
    prototypes.set(asset.id, prototype);
  }
  function mesh(templateId, semantic) {
    const root = prototypes.get(templateId).clone(true);
    root.userData = semantic;
    return root;
  }
  const tabletop = new THREE.Mesh(new THREE.BoxGeometry(3.2, .12, 2.2), new THREE.MeshStandardMaterial({ ...wood, color: '#d3bba0', roughness: .72, normalScale: new THREE.Vector2(.35, .35) }));
  tabletop.position.set(-.3, -.06, 0); tabletop.receiveShadow = true; scene.add(tabletop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#e7e3d8', roughness: .9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.14; floor.receiveShadow = true; scene.add(floor);
  // Designed ceramic shell: interior opening and floor match the registered collider.
  const bowlProfile = [[0,.025],[.30,.025],[.36,.04],[.445,.085],[.455,.34],[.455,.37],[.448,.388],[.431,.388],[.42,.38],[.42,.12],[.395,.10],[0,.10]];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile.map(([x,y]) => new THREE.Vector2(x,y)), 128), new THREE.MeshPhysicalMaterial({ color: '#ded8c7', roughness: .24, metalness: 0, clearcoat: .3, clearcoatRoughness: .28, side: THREE.DoubleSide }));
  bowl.castShadow = bowl.receiveShadow = true; scene.add(bowl);
  const foot = new THREE.Mesh(new THREE.TorusGeometry(.30,.012,12,96), bowl.material); foot.rotation.x = Math.PI/2; foot.position.y = .018; scene.add(foot);
  const board = new THREE.Mesh(new THREE.BoxGeometry(.62,.034,.68), new THREE.MeshStandardMaterial({ ...wood, color:'#c5a87c', roughness:.75, normalScale:new THREE.Vector2(.2,.2) }));
  board.position.set(-.89,.017,0); board.castShadow = board.receiveShadow = true; scene.add(board);
  const sourcePositions = { apple:[-1.04,.14], lemon:[-.75,.15], onion:[-1.04,-.17], avocado:[-.74,-.17] };
  for (const [templateId,[x,z]] of Object.entries(sourcePositions)) {
    const source = mesh(templateId,{kind:'source',templateId});
    const bounds = new THREE.Box3().setFromObject(source);
    source.position.set(x,.035-bounds.min.y,z); scene.add(source); sourceMeshes.set(templateId,source);
  }
  const napkinGeometry = new THREE.PlaneGeometry(.54,.72,24,24);
  napkinGeometry.rotateX(-Math.PI/2);
  const positions = napkinGeometry.attributes.position;
  for(let i=0;i<positions.count;i++) positions.setY(i,.009+.005*Math.sin(positions.getX(i)*35)*Math.cos(positions.getZ(i)*13));
  napkinGeometry.computeVertexNormals();
  const napkin = new THREE.Mesh(napkinGeometry,new THREE.MeshStandardMaterial({...fabric,color:'#bec3ad',roughness:.95,side:THREE.DoubleSide}));
  napkin.position.set(.76,0,.08); napkin.rotation.y=-.14; napkin.receiveShadow=true; scene.add(napkin);
  const metal = new THREE.MeshStandardMaterial({color:'#c9c6bd',metalness:.92,roughness:.28});
  const spoon = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.012,.36,4,12),metal); handle.rotation.x=Math.PI/2;handle.position.z=.10;
  const spoonHead = new THREE.Mesh(new THREE.SphereGeometry(1,24,16),metal);spoonHead.scale.set(.045,.009,.065);spoonHead.position.set(0,0,-.14);
  spoon.add(handle,spoonHead);spoon.position.set(.79,.032,.08);spoon.rotation.y=.14;scene.add(spoon);
  const sun = new THREE.DirectionalLight('#ffe8c8',3.2);sun.position.set(-2.5,4,2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:12});sun.shadow.bias=-.0001;sun.shadow.normalBias=.003;scene.add(sun);
  scene.add(new THREE.HemisphereLight('#cbd9e1','#a78c70',.65));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.46,.473,96),new THREE.MeshBasicMaterial({color:'#54805c',side:THREE.DoubleSide,transparent:true,opacity:.9}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.394;ring.visible=false;scene.add(ring);
  const physics=createKitchenPhysics();
  let preview=null,hiddenId=null,inspection=null,applying=false,enabled=true,ownPointer=null,disposed=false,frameId,cameraHeld=false,cameraLocked=false,lockedCamera=null;
  const raycaster=new THREE.Raycaster(),cursor=new THREE.Vector2(),dropPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-BOWL.rimY);
  function ray(clientX,clientY){const r=renderer.domElement.getBoundingClientRect();cursor.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(cursor,camera);}
  function pick(clientX,clientY){ray(clientX,clientY);const hit=raycaster.intersectObjects(scene.children.filter(node=>node!==ring&&node!==preview),true)[0];if(!hit)return null;let node=hit.object;while(node&&!node.userData.kind)node=node.parent;return node?{...node.userData}:null;}
  function dropPoint(clientX,clientY){ray(clientX,clientY);const p=raycaster.ray.intersectPlane(dropPlane,new THREE.Vector3());return p?p.toArray():null;}
  function clampCamera(){const before=controls.target.clone();controls.target.x=THREE.MathUtils.clamp(controls.target.x,-1.5,1.5);controls.target.z=THREE.MathUtils.clamp(controls.target.z,-1.5,1.5);controls.target.y=THREE.MathUtils.clamp(controls.target.y,.05,1.2);camera.position.add(controls.target.clone().sub(before));camera.position.x=THREE.MathUtils.clamp(camera.position.x,-6,6);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-6,6);camera.position.y=THREE.MathUtils.clamp(camera.position.y,.2,5);}
  function getCamera(){clampCamera();return{position:camera.position.toArray(),target:controls.target.toArray()};}
  function setCamera(value){applying=true;camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();applying=false;}
  function syncItems(items){const ids=new Set(items.map(item=>item.id));for(const [id,root]of itemMeshes)if(!ids.has(id)){scene.remove(root);itemMeshes.delete(id);}for(const item of items){let root=itemMeshes.get(item.id);if(root&&root.userData.templateId!==item.templateId){scene.remove(root);itemMeshes.delete(item.id);root=null;}if(!root){root=mesh(item.templateId,{kind:'item',id:item.id,templateId:item.templateId});itemMeshes.set(item.id,root);scene.add(root);}root.position.fromArray(item.position);root.quaternion.fromArray(item.quaternion);root.visible=idVisible(item.id);}}
  function idVisible(id){return id!==hiddenId;}
  function clearPreview(){if(preview){scene.remove(preview);preview.traverse(n=>{if(n.isMesh)for(const m of(Array.isArray(n.material)?n.material:[n.material]))m.dispose();});preview=null;}if(hiddenId&&itemMeshes.has(hiddenId))itemMeshes.get(hiddenId).visible=true;hiddenId=null;ring.visible=false;}
  function showPreview(templateId,point,{hideId=null,valid=false}={}){if(!preview){preview=mesh(templateId,{kind:'preview'});preview.traverse(n=>{if(n.isMesh){n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of(Array.isArray(n.material)?n.material:[n.material])){m.transparent=true;m.opacity=.78;}n.castShadow=false;}});scene.add(preview);}preview.position.fromArray(point);hiddenId=hideId;if(hideId&&itemMeshes.has(hideId))itemMeshes.get(hideId).visible=false;ring.visible=true;ring.material.color.set(valid?'#54805c':'#b57739');}
  function cancelInspection(notify=true){if(!inspection)return;const root=itemMeshes.get(inspection.session.itemID);if(root){root.position.fromArray(inspection.session.originalPose.position);root.quaternion.fromArray(inspection.session.originalPose.quaternion);}setCamera(inspection.camera);inspection=null;if(notify)callbacks.inspectionEnd?.();}
  function apply(state,{camera:changeCamera=true}={}){cancelInspection(false);clearPreview();physics.reset(state.items);syncItems(state.items);if(changeCamera)setCamera(state.camera);}
  function settle(items){clearPreview();physics.start(items);syncItems(items);if(!physics.active)queueMicrotask(()=>callbacks.settled?.(physics.snapshot()));}
  function setInteractionEnabled(value){enabled=value;controls.enabled=value&&ownPointer===null&&!cameraLocked;}
  function cancelCamera(value){if(cameraHeld){cameraLocked=true;lockedCamera=structuredClone(value);controls.enabled=false;}setCamera(value);}
  function releaseCamera(){cameraHeld=false;if(cameraLocked){setCamera(lockedCamera);cameraLocked=false;lockedCamera=null;controls.enabled=enabled&&ownPointer===null;}}
  controls.addEventListener('start',()=>{if(!applying&&enabled&&!cameraLocked)callbacks.cameraStart?.(cameraHeld?'pointer':'wheel');});
  controls.addEventListener('change',()=>{if(!applying&&enabled&&!cameraLocked)callbacks.cameraChange?.(getCamera());});
  controls.addEventListener('end',()=>{if(!applying&&enabled&&!cameraLocked)callbacks.cameraEnd?.(getCamera(),cameraHeld?'pointer':'wheel');});
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{if(ownPointer!==null){event.stopImmediatePropagation();return;}if(!enabled)return;if(event.button!==0){cameraHeld=true;return;}const hit=pick(event.clientX,event.clientY);if(hit&&callbacks.pointerDown?.(event,hit)){ownPointer=event.pointerId;controls.enabled=false;canvas.setPointerCapture(ownPointer);event.stopImmediatePropagation();}else cameraHeld=true;},true);
  canvas.addEventListener('pointermove',event=>{if(event.pointerId===ownPointer){callbacks.pointerMove?.(event);event.stopImmediatePropagation();}else if(enabled)canvas.style.cursor=pick(event.clientX,event.clientY)?'grab':'default';},true);
  function pointerEnd(event,cancel){if(event.pointerId!==ownPointer)return;event.stopImmediatePropagation();cancel?callbacks.pointerCancel?.():callbacks.pointerUp?.(event);ownPointer=null;controls.enabled=enabled;canvas.style.cursor='default';if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}
  canvas.addEventListener('pointerup',e=>pointerEnd(e,false),true);canvas.addEventListener('pointercancel',e=>pointerEnd(e,true),true);
  canvas.addEventListener('lostpointercapture',()=>{if(ownPointer!==null){ownPointer=null;callbacks.pointerCancel?.();controls.enabled=enabled;}});
  window.addEventListener('pointerup',releaseCamera);window.addEventListener('pointercancel',releaseCamera);
  const resize=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);composer.setSize(r.width,r.height);});resize.observe(host);
  let lastTime=performance.now();const projected=new THREE.Vector3();
  function frame(time){if(disposed)return;const delta=Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;
    controls.update();clampCamera();
    if(physics.active){const result=physics.step(delta);syncItems(result.items);if(!result.active){result.failure?callbacks.failed?.(result.failure):callbacks.settled?.(result.items);}}
    if(inspection){inspection.progress=THREE.MathUtils.clamp(inspection.progress+(inspection.target===1?1:-1)*delta/1.25,0,1);const pose=inspectionPose(inspection.session,inspection.progress),root=itemMeshes.get(inspection.session.itemID);root.position.fromArray(pose.position);root.quaternion.fromArray(pose.quaternion);const p=inspection.progress*inspection.progress*(3-2*inspection.progress);setCamera({position:inspection.camera.position,target:inspection.camera.target.map((v,i)=>THREE.MathUtils.lerp(v,inspection.focus[i],p))});if(inspection.target===0&&inspection.progress===0)cancelInspection();else if(inspection.target===1&&inspection.progress===1&&!inspection.held){inspection.held=true;callbacks.inspectionHeld?.();}}
    composer.render();for(const[id,root]of sourceMeshes){projected.copy(root.position).project(camera);callbacks.projectSource?.(id,(projected.x+1)*host.clientWidth/2,(1-projected.y)*host.clientHeight/2,projected.z>=-1&&projected.z<=1);}
    frameId=requestAnimationFrame(frame);
  }frameId=requestAnimationFrame(frame);
  return{apply,getCamera,setCamera,cancelCamera,pick,dropPoint,showPreview,clearPreview,settle,setInteractionEnabled,
    abortPointer(){const id=ownPointer;ownPointer=null;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);releaseCamera();controls.enabled=enabled;},
    startInspection(session){inspection={session,progress:0,target:1,held:false,camera:getCamera(),focus:[session.originalPose.position[0],.53,session.originalPose.position[2]]};},returnInspection(){if(inspection)inspection.target=0;},cancelInspection,
    screenshot(){composer.render();return renderer.domElement.toDataURL('image/jpeg',.94);},
    dispose(){disposed=true;cancelAnimationFrame(frameId);resize.disconnect();window.removeEventListener('pointerup',releaseCamera);window.removeEventListener('pointercancel',releaseCamera);controls.dispose();composer.dispose();environment.dispose();renderer.dispose();},
  };
}
