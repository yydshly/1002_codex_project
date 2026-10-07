import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAINTS } from './core.js';

export async function createShowroom(host, callbacks = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#252b29'); scene.fog = new THREE.Fog('#252b29', 16, 40);
  const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label','可编辑的三维概念汽车'); host.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(36,1,.035,70);
  const controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.12;
  controls.minDistance=1.2; controls.maxDistance=12; controls.minPolarAngle=.1; controls.maxPolarAngle=Math.PI*.48;
  controls.target.set(0,.65,0); camera.position.set(6,2.5,7); controls.update();
  const composer=new EffectComposer(renderer); composer.addPass(new RenderPass(scene,camera));
  const ao=new SSAOPass(scene,camera,1,1);ao.kernelRadius=.11;ao.minDistance=.003;ao.maxDistance=.08;composer.addPass(ao);
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.15,.35,2.4);composer.addPass(bloom);composer.addPass(new OutputPass());
  const manager=new THREE.LoadingManager();manager.onProgress=(url,loaded,total)=>callbacks.progress?.(loaded/total);
  const [gltf,hdr]=await Promise.all([
    new GLTFLoader(manager).loadAsync(new URL('../assets/car/CarConcept.glb',import.meta.url).href),
    new HDRLoader(manager).loadAsync(new URL('../studio/assets/environment/coastal-day.hdr',import.meta.url).href)
  ]);
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(hdr);scene.environment=environment.texture;scene.environmentIntensity=.8;hdr.dispose();pmrem.dispose();
  const car=new THREE.Group();car.name='calibrated-car';car.position.set(.005217,.159299,-.238462);car.add(gltf.scene);scene.add(car);car.updateMatrixWorld(true);
  const hood=gltf.scene.getObjectByName('BodyHood');if(!hood || !gltf.scene.getObjectByName('Engine'))throw new Error('车辆缺少盖板或盖下结构');
  const hoodClosed=hood.quaternion.clone();
  const paintMaterials=new Set(),lightMaterials=new Map(),pickables=[];
  gltf.scene.traverse(node=>{
    if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;pickables.push(node);
    const process=material=>{
      const m=material.clone();
      if(/^Paint [12] /.test(m.name))paintMaterials.add(m);
      if(['Headlight','Brakelight','Signallight'].includes(m.name))lightMaterials.set(m,{color:m.emissive.clone(),intensity:m.emissiveIntensity});
      return m;
    };
    node.material=Array.isArray(node.material)?node.material.map(process):process(node.material);
  });
  const floorMaterial=new THREE.MeshPhysicalMaterial({color:'#111715',roughness:.53,metalness:.08,clearcoat:.08,clearcoatRoughness:.7});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.007;floor.receiveShadow=true;scene.add(floor);
  const circle=new THREE.Mesh(new THREE.RingGeometry(3.20,3.215,160),new THREE.MeshBasicMaterial({color:'#64735b',transparent:true,opacity:.23,side:THREE.DoubleSide}));circle.rotation.x=-Math.PI/2;circle.position.y=.001;scene.add(circle);
  const key=new THREE.DirectionalLight('#fff4e4',3.0);key.position.set(2,7,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});key.shadow.bias=-.0003;key.shadow.normalBias=.015;scene.add(key);
  const rim=new THREE.DirectionalLight('#d9e9ed',1.8);rim.position.set(-5,4,-3);scene.add(rim);
  scene.add(new THREE.HemisphereLight('#f1f1e0','#19241b',.4));
  // Architectural softboxes provide reflections; actual direct light uses the lights above.
  for(const x of [-3,3]){const softbox=new THREE.Mesh(new THREE.PlaneGeometry(1.8,8),new THREE.MeshBasicMaterial({color:'#fff8e7',side:THREE.DoubleSide}));softbox.position.set(x,6,0);softbox.rotation.x=Math.PI/2;scene.add(softbox);}
  const headlights=gltf.scene.getObjectByName('BodyHeadlights');if(!headlights)throw new Error('车辆缺少灯具部件');
  const bounds=new THREE.Box3().setFromObject(headlights),left=new THREE.Vector3(bounds.max.x-.25,(bounds.min.y+bounds.max.y)/2,bounds.max.z+.025);
  const right=new THREE.Vector3(bounds.min.x+.25,left.y,left.z),spots=[];
  for(const position of [left,right]){
    const spot=new THREE.SpotLight('#dcf0ff',0,13,Math.PI*.20,.65,2);spot.castShadow=true;spot.shadow.mapSize.set(512,512);spot.shadow.bias=-.0002;spot.shadow.normalBias=.01;
    const target=new THREE.Object3D();target.position.copy(hood.worldToLocal(position.clone().add(new THREE.Vector3(0,-position.y,3.5))));spot.position.copy(hood.worldToLocal(position.clone()));hood.add(spot,target);spot.target=target;spots.push(spot);
  }
  let desiredHood=0,shownHood=0,applying=false,disposed=false,frameId;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function pick(clientX,clientY){
    const r=renderer.domElement.getBoundingClientRect();pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickables,false)[0];if(!hit)return null;
    const mats=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];
    if(mats.some(m=>['Headlight','Brakelight','Signallight'].includes(m.name)))return 'lights';
    let node=hit.object;while(node){if(node===hood)return 'hood';node=node.parent;}return null;
  }
  function getCamera(){clampCamera();return{position:camera.position.toArray(),target:controls.target.toArray()};}
  function setCamera(value){applying=true;const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();controls.enableDamping=damping;applying=false;}
  function apply(state,options={}){
    const color=PAINTS.find(p=>p.id===state.paint)?.color || '#343b42';
    for(const material of paintMaterials){material.color.set(color);material.metalness=.8;material.roughness=.23;}
    for(const [material,original]of lightMaterials){material.emissive.copy(original.color);material.emissiveIntensity=state.lights.on?original.intensity*state.lights.power/160:0;}
    spots.forEach(light=>light.intensity=state.lights.on?state.lights.power*3:0);
    desiredHood=state.hood;if(options.instant){shownHood=desiredHood;hood.quaternion.copy(hoodClosed).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),shownHood*Math.PI/3));}
    if(options.camera!==false)setCamera(state.camera);
  }
  controls.addEventListener('start',()=>{if(!applying)callbacks.cameraStart?.();});
  controls.addEventListener('change',()=>{if(!applying)callbacks.cameraChange?.(getCamera());});
  controls.addEventListener('end',()=>{if(!applying)callbacks.cameraEnd?.(getCamera());});
  function clampCamera(){
    // Pan stays inside the stage. Clamp to the same bounds used by backup validation.
    const before=controls.target.clone();controls.target.x=THREE.MathUtils.clamp(controls.target.x,-5,5);controls.target.z=THREE.MathUtils.clamp(controls.target.z,-5,5);controls.target.y=THREE.MathUtils.clamp(controls.target.y,.1,2.5);camera.position.add(controls.target.clone().sub(before));
    camera.position.y=Math.max(.08,camera.position.y);
  }
  const resize=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(!r.width || !r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);composer.setSize(r.width,r.height);});resize.observe(host);
  let previous=performance.now();function frame(now){if(disposed)return;const dt=Math.min((now-previous)/1000,.1);previous=now;shownHood=THREE.MathUtils.damp(shownHood,desiredHood,10,dt);hood.quaternion.copy(hoodClosed).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),shownHood*Math.PI/3));controls.update();clampCamera();composer.render();frameId=requestAnimationFrame(frame);}frameId=requestAnimationFrame(frame);
  function screenshot(){shownHood=desiredHood;hood.quaternion.copy(hoodClosed).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),shownHood*Math.PI/3));composer.render();return renderer.domElement.toDataURL('image/jpeg',.93);}
  return{renderer,controls,apply,pick,getCamera,setCamera,screenshot,dispose(){disposed=true;cancelAnimationFrame(frameId);resize.disconnect();controls.dispose();environment.dispose();composer.dispose();renderer.dispose();scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of(Array.isArray(n.material)?n.material:[n.material]))m.dispose();}});}};
}
