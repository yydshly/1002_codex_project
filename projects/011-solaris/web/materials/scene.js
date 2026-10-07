import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SAMPLES, sample, targetAt, cameraForView } from './core.js';

export async function createMaterials(host, callbacks={}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e1d1');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','热响应教学台：拖动火源到铜、铝或冰的圆环，释放后供能');host.append(canvas);
  const camera=new THREE.PerspectiveCamera(34,1,.02,40),controls=new OrbitControls(camera,canvas);
  controls.enableDamping=false;controls.minDistance=2;controls.maxDistance=7;controls.minPolarAngle=.02;controls.maxPolarAngle=.48*Math.PI;
  let applying=false,ownPointer=null,held=false,cameraLocked=false,lockedCamera=null,enabled=true,disposed=false,frameId;
  function clampCamera(){const old=controls.target.clone();controls.target.x=THREE.MathUtils.clamp(controls.target.x,-1.4,1.4);controls.target.z=THREE.MathUtils.clamp(controls.target.z,-1.4,1.4);controls.target.y=THREE.MathUtils.clamp(controls.target.y,0,1.5);camera.position.add(controls.target.clone().sub(old));camera.position.x=THREE.MathUtils.clamp(camera.position.x,-7,7);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-7,7);camera.position.y=THREE.MathUtils.clamp(camera.position.y,.5,6);}
  function getCamera(){clampCamera();return{position:camera.position.toArray(),target:controls.target.toArray()};}
  function setCamera(value){applying=true;camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();applying=false;}
  setCamera(cameraForView('hero'));
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const ao=new SSAOPass(scene,camera,1,1);ao.kernelRadius=.065;ao.minDistance=.002;ao.maxDistance=.14;composer.addPass(ao);composer.addPass(new OutputPass());
  const loader=new THREE.TextureLoader();
  const [maps,hdr]=await Promise.all([Promise.all(['diff','nor_gl','rough'].map(t=>loader.loadAsync(new URL(`../studio/assets/textures/wood_floor-${t}.jpg`,import.meta.url).href))),new HDRLoader().loadAsync(new URL('../studio/assets/environment/coastal-day.hdr',import.meta.url).href)]);
  maps[0].colorSpace=THREE.SRGBColorSpace;for(const map of maps){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2.1,1.4);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(hdr);scene.environment=environment.texture;scene.environmentIntensity=.6;hdr.dispose();pmrem.dispose();
  const mat=(color,roughness=.5,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const cream=new THREE.MeshPhysicalMaterial({color:'#e3ddce',roughness:.23,clearcoat:.35,clearcoatRoughness:.25});
  const dark=mat('#454845',.45,.65),brass=mat('#a88a55',.3,.92),steel=mat('#c6cac8',.26,.98);
  const rubber=mat('#5a5b51',.85),wood=new THREE.MeshStandardMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],color:'#cdb58e',roughness:.72,normalScale:new THREE.Vector2(.3,.3)});
  function add(geo,material,x,y,z,parent=scene){const obj=new THREE.Mesh(geo,material);obj.position.set(x,y,z);obj.castShadow=obj.receiveShadow=true;parent.add(obj);return obj;}
  function lathe(profile,material,x,y,z,parent=scene){return add(new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),80),material,x,y,z,parent);}
  function ring(r,tube,material,x,y,z,parent=scene){const obj=add(new THREE.TorusGeometry(r,tube,10,96),material,x,y,z,parent);obj.rotation.x=Math.PI/2;return obj;}
  const table=add(new RoundedBoxGeometry(3.6,.15,2.05,5,.045),wood,0,-.1,.1);table.receiveShadow=true;
  add(new RoundedBoxGeometry(3.36,.04,1.76,4,.016),mat('#bdb29c',.62),0,-.02,.08);
  const workMat=add(new RoundedBoxGeometry(2.89,.018,1.27,4,.018),mat('#ded7c6',.82),0,.009,.2);
  const floor=add(new THREE.PlaneGeometry(50,50),mat('#e5dcca',.9),0,-.2,0);floor.rotation.x=-Math.PI/2;
  const ports=new Map(),specimens=new Map(),temperatureRings=new Map(),iceParts={};
  for(const[id,x]of[['copper',-.78],['aluminum',0],['ice',.78]]){
    const group=new THREE.Group();group.position.set(x,0,0);scene.add(group);
    // The opening leaves room for the burner base instead of hiding it in a solid plinth.
    lathe([[.145,.025],[.25,.025],[.26,.038],[.26,.068],[.24,.087],[.15,.087],[.145,.079],[.145,.025]],dark,0,0,0,group);
    ring(.24,.007,brass,0,.09,0,group);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;add(new THREE.CylinderGeometry(.012,.014,.44,14),steel,Math.cos(a)*.195,.305,Math.sin(a)*.195,group);add(new THREE.SphereGeometry(.018,12,8),steel,Math.cos(a)*.195,.525,Math.sin(a)*.195,group);}
    lathe([[0,0],[.21,0],[.25,.009],[.257,.027],[.258,.044],[.245,.053],[.228,.046],[.218,.018],[0,.018]],cream,0,.531,0,group);
    ring(.25,.004,steel,0,.578,0,group);
    const indicator=ring(.272,.006,new THREE.MeshBasicMaterial({color:'#c4c9b4',transparent:true,opacity:.85}),0,.028,0,group);ports.set(id,indicator);
    if(id==='ice'){
      const iceMat=new THREE.MeshPhysicalMaterial({color:'#d8edf0',roughness:.19,metalness:0,transmission:.72,thickness:.19,ior:1.31,transparent:true,opacity:.97,clearcoat:.35});
      const ice=add(new RoundedBoxGeometry(.265,.265,.265,6,.038),iceMat,0,.7,0,group);ice.rotation.y=.16;
      const water=add(new THREE.CylinderGeometry(.202,.202,.035,80),new THREE.MeshPhysicalMaterial({color:'#b8d9d4',roughness:.13,transmission:.55,thickness:.026,ior:1.333,transparent:true,opacity:.9}),0,.566,0,group);water.visible=false;
      const frost=ring(.074,.002,new THREE.MeshStandardMaterial({color:'#f4fdff',transparent:true,opacity:.6,roughness:.82}),0,.132,.003,ice);frost.rotation.x=.22;
      iceParts.ice=ice;iceParts.water=water;iceParts.baseY=.568;
    }else{
      const copper=id==='copper';const metal=new THREE.MeshPhysicalMaterial({color:copper?'#b76d42':'#b7c0c3',metalness:1,roughness:copper?.3:.24,clearcoat:.07});
      lathe([[0,0],[.15,0],[.159,.008],[.16,.025],[.158,.048],[.16,.065],[.158,.082],[.16,.1],[.152,.112],[0,.112]],metal,0,.566,0,group);
      for(let i=0;i<8;i++)ring(.158,.0007,metal,0,.581+i*.009,0,group);
      ring(.121,.0009,metal,0,.678,0,group);ring(.071,.0009,metal,0,.678,0,group);
      // Instrument overlay: its false colour encodes temperature; the specimen stays metallic.
      const temperatureRing=ring(.185,.008,new THREE.MeshBasicMaterial({color:'#3289c8',transparent:true,opacity:.96,depthWrite:false,toneMapped:false}),0,.589,0,group);
      temperatureRings.set(id,temperatureRing);
    }
    specimens.set(id,group);
  }
  // Complete designed burner: base, threaded neck, air collar, nozzle, valve and hose.
  const burner=new THREE.Group();scene.add(burner);burner.userData.kind='source';
  lathe([[0,0],[.103,0],[.124,.008],[.132,.019],[.128,.041],[.106,.054],[.063,.061],[0,.061]],dark,0,.034,0,burner);
  lathe([[.035,0],[.045,0],[.047,.012],[.043,.029],[.039,.029],[.039,.13],[.043,.13],[.043,.16]],brass,0,.095,0,burner);
  ring(.043,.003,steel,0,.15,0,burner);ring(.044,.002,dark,0,.164,0,burner);
  const collar=add(new THREE.CylinderGeometry(.049,.049,.035,40),steel,0,.231,0,burner);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;add(new THREE.SphereGeometry(.0038,10,8),dark,Math.cos(a)*.049,.235,Math.sin(a)*.049,burner);}
  lathe([[.033,0],[.041,0],[.041,.06],[.042,.065],[.035,.069],[.03,.06],[.03,0]],steel,0,.243,0,burner);
  const valve=add(new THREE.CylinderGeometry(.019,.019,.041,24),brass,.098,.085,0,burner);valve.rotation.z=Math.PI/2;
  const knob=add(new THREE.CylinderGeometry(.025,.025,.014,20),dark,.116,.085,0,burner);knob.rotation.z=Math.PI/2;
  // Keep the blue outer flame legible around the smaller cyan core, below the dish.
  const flameGeometry=new THREE.LatheGeometry([[0,0],[.045,.014],[.059,.044],[.049,.084],[.035,.128],[.019,.166],[0,.2]].map(([r,y])=>new THREE.Vector2(r,y)),40);
  const flame=add(flameGeometry,new THREE.MeshBasicMaterial({color:'#0355ff',transparent:true,opacity:.98,depthWrite:false,toneMapped:false}),0,.305,0,burner);flame.castShadow=false;
  const inner=add(new THREE.ConeGeometry(.012,.12,32),new THREE.MeshBasicMaterial({color:'#64d8ff',transparent:true,opacity:.86,depthWrite:false,toneMapped:false}),0,.365,0,burner);inner.castShadow=false;
  const sourceLight=new THREE.PointLight('#72bfff',0,.65,2);sourceLight.position.set(0,.4,0);sourceLight.castShadow=true;sourceLight.shadow.mapSize.set(512,512);sourceLight.shadow.camera.near=.02;sourceLight.shadow.camera.far=1;sourceLight.shadow.normalBias=.002;burner.add(sourceLight);
  // A separate, labelled teaching overlay travels around the front of the opaque dish.
  // It is not part of the pickable burner, and does not affect the thermal calculation.
  const heatFlow=new THREE.Group();heatFlow.visible=false;scene.add(heatFlow);
  const flowMaterial=new THREE.MeshBasicMaterial({color:'#ed7612',transparent:true,opacity:.98,depthWrite:false,toneMapped:false});
  const flowLineMaterial=new THREE.MeshBasicMaterial({color:'#d9791c',transparent:true,opacity:.65,depthWrite:false,toneMapped:false});
  const flowArrows=Array.from({length:4},()=>{const arrow=add(new THREE.ConeGeometry(.024,.075,16),flowMaterial,0,0,0,heatFlow);arrow.castShadow=arrow.receiveShadow=false;return arrow;});
  const flowUp=new THREE.Vector3(0,1,0);let flowCurve=null,flowLine=null,flowTarget=null;
  function updateHeatFlow(){if(!flowTarget||!lastSource)return;const x=specimens.get(flowTarget).position.x,z=0,endY=flowTarget==='ice'?.88:.73;flowCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(lastSource[0]+.045,.327,lastSource[1]+.018),new THREE.Vector3(lastSource[0]+.075,.357,lastSource[1]+.16),new THREE.Vector3(x+.07,.546,z+.3),new THREE.Vector3(x+.05,.655,z+.29),new THREE.Vector3(x+.015,endY-.025,z+.12),new THREE.Vector3(x,endY,z+.06)]);if(flowLine){heatFlow.remove(flowLine);flowLine.geometry.dispose();}flowLine=add(new THREE.TubeGeometry(flowCurve,64,.004,8,false),flowLineMaterial,0,0,0,heatFlow);flowLine.castShadow=flowLine.receiveShadow=false;}
  const hoseMaterial=mat('#777565',.82);let hose=null;
  let lastSource=null;
  function setSource(point){if(lastSource&&point[0]===lastSource[0]&&point[1]===lastSource[1])return;lastSource=[...point];burner.position.set(point[0],0,point[1]);if(hose){scene.remove(hose);hose.geometry.dispose();}const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(point[0]+.13,.079,point[1]),new THREE.Vector3(point[0]+.29,.045,point[1]+.08),new THREE.Vector3(.85,.045,.75),new THREE.Vector3(1.44,.048,.67)]);hose=add(new THREE.TubeGeometry(curve,40,.012,10,false),hoseMaterial,0,0,0);if(heatFlow.visible)updateHeatFlow();}
  setSource([0,.7]);
  const supply=new THREE.Group();supply.position.set(1.43,.025,.69);scene.add(supply);
  add(new RoundedBoxGeometry(.26,.15,.23,3,.015),cream,0,.075,0,supply);ring(.029,.004,brass,0,.153,0,supply);
  const dial=add(new THREE.CylinderGeometry(.037,.037,.008,48),dark,0,.163,0,supply);add(new THREE.BoxGeometry(.002,.002,.028),brass,0,.169,-.007,supply);
  // Authored glassware and tray are scenery, not measured laboratory equipment.
  const bottleMat=new THREE.MeshPhysicalMaterial({color:'#f0ece0',roughness:.13,transmission:.8,thickness:.016,ior:1.48,transparent:true,opacity:.86});
  lathe([[.06,0],[.07,.01],[.07,.14],[.038,.19],[.027,.195],[.027,.235],[.022,.239],[.021,.23],[.021,.2],[.031,.19],[.062,.14],[.062,.015],[.06,0]],bottleMat,-1.44,.034,-.37);
  add(new THREE.CylinderGeometry(.03,.03,.036,30),brass,-1.44,.287,-.37);
  const sheet=add(new RoundedBoxGeometry(.41,.006,.28,3,.008),mat('#efebda',.9),-1.23,.037,.61);sheet.rotation.y=.12;
  const lineMat=mat('#b9ad93',.9);for(let i=0;i<5;i++)add(new THREE.BoxGeometry(.25,.0007,.0018),lineMat,-1.23,.041,.54+i*.028);
  const sun=new THREE.DirectionalLight('#fff0d1',3.1);sun.position.set(-3.5,5,2.7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-2.6,right:2.6,top:2.4,bottom:-2.4,near:.1,far:15});sun.shadow.normalBias=.004;sun.shadow.bias=-.0001;scene.add(sun);scene.add(new THREE.HemisphereLight('#d5e4eb','#b49b77',.85));
  let heatActive=false,previewTarget=null;
  const coolColour=new THREE.Color('#3289c8'),warmColour=new THREE.Color('#e38c35');
  function apply(state,{camera:changeCamera=true,energy=null}={}){setSource(state.source);if(changeCamera)setCamera(state.camera);for(const id of Object.keys(SAMPLES)){const reading=sample(id,energy?.[id]??state.energies[id]);ports.get(id).material.color.set(heatActive&&previewTarget===id?'#d6a457':'#bfc8b7');if(temperatureRings.has(id))temperatureRings.get(id).material.color.copy(coolColour).lerp(warmColour,reading.progress);if(id==='ice'){const size=Math.cbrt(reading.remainingFraction);iceParts.ice.visible=size>1e-6;iceParts.ice.scale.setScalar(size);iceParts.ice.position.y=iceParts.baseY+.1325*size;iceParts.water.visible=reading.meltFraction>0;iceParts.water.scale.y=Math.max(.001,reading.meltFraction);iceParts.water.position.y=.55+.0175*reading.meltFraction;}}}
  function setHeating(active,target=null){heatActive=active;previewTarget=target;flame.visible=inner.visible=active;sourceLight.intensity=active?1.1:0;heatFlow.visible=active&&specimens.has(target);flowTarget=heatFlow.visible?target:null;if(heatFlow.visible)updateHeatFlow();for(const[id,ring]of ports)ring.material.color.set(id===target?'#c29751':'#bfc8b7');}
  setHeating(false);
  const raycaster=new THREE.Raycaster(),cursor=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  function ray(e){const r=canvas.getBoundingClientRect();cursor.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(cursor,camera);}
  function pickSource(e){ray(e);return raycaster.intersectObject(burner,true).length>0;}
  function point(e){ray(e);const hit=raycaster.ray.intersectPlane(plane,new THREE.Vector3());return hit?[hit.x,hit.z]:null;}
  let dragOffset=[0,0];
  canvas.addEventListener('pointerdown',e=>{if(ownPointer!==null){e.stopImmediatePropagation();return;}if(!enabled)return;if(e.button===0&&pickSource(e)){const p=point(e);if(!p)return;dragOffset=[burner.position.x-p[0],burner.position.z-p[1]];ownPointer=e.pointerId;controls.enabled=false;canvas.setPointerCapture(ownPointer);callbacks.dragStart?.();e.preventDefault();e.stopImmediatePropagation();}else held=true;},true);
  canvas.addEventListener('pointermove',e=>{if(ownPointer===e.pointerId){const p=point(e);if(p){p[0]+=dragOffset[0];p[1]+=dragOffset[1];const bounded=p[0]>=-1.15&&p[0]<=1.15&&p[1]>=-.3&&p[1]<=.85;callbacks.dragChange?.(p,bounded?targetAt(p):null,bounded);}e.stopImmediatePropagation();}else canvas.style.cursor=enabled&&pickSource(e)?'grab':'default';},true);
  function end(e,cancel){if(e.pointerId!==ownPointer)return;e.stopImmediatePropagation();if(!cancel){const final=point(e);if(final){final[0]+=dragOffset[0];final[1]+=dragOffset[1];const bounded=final[0]>=-1.15&&final[0]<=1.15&&final[1]>=-.3&&final[1]<=.85;callbacks.dragChange?.(final,bounded?targetAt(final):null,bounded);}else cancel=true;}const id=ownPointer;ownPointer=null;controls.enabled=enabled&&!cameraLocked;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);cancel?callbacks.dragCancel?.():callbacks.dragEnd?.();}
  canvas.addEventListener('pointerup',e=>end(e,false),true);canvas.addEventListener('pointercancel',e=>end(e,true),true);canvas.addEventListener('lostpointercapture',()=>{if(ownPointer!==null){ownPointer=null;controls.enabled=enabled&&!cameraLocked;callbacks.dragCancel?.();}});
  function release(){held=false;if(cameraLocked){setCamera(lockedCamera);cameraLocked=false;lockedCamera=null;controls.enabled=enabled&&ownPointer===null;}callbacks.cameraEnd?.();}
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
  controls.addEventListener('start',()=>{if(!applying&&enabled&&!cameraLocked)callbacks.cameraStart?.();});controls.addEventListener('change',()=>{if(!applying&&enabled&&!cameraLocked){clampCamera();callbacks.cameraChange?.(getCamera());}});controls.addEventListener('end',()=>{if(!applying&&enabled&&!cameraLocked&&!held)callbacks.cameraEnd?.();});
  const resize=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(r.width&&r.height){camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);composer.setSize(r.width,r.height);}});resize.observe(host);
  const projected=new THREE.Vector3();
  function project(id,x,y,z){projected.set(x,y,z).project(camera);callbacks.project?.(id,(projected.x+1)*host.clientWidth/2,(1-projected.y)*host.clientHeight/2,projected.z>=-1&&projected.z<=1);}
  function frame(time){if(disposed)return;controls.update();clampCamera();if(heatActive){flame.scale.set(1+.055*Math.sin(time*.019),1+.025*Math.sin(time*.017),1);inner.scale.y=1+.025*Math.sin(time*.023);if(flowCurve)flowArrows.forEach((arrow,i)=>{const t=(time*.00028+i/flowArrows.length)%1;arrow.position.copy(flowCurve.getPointAt(t));arrow.quaternion.setFromUnitVectors(flowUp,flowCurve.getTangentAt(t));});}composer.render();for(const[id,root]of specimens)project(id,root.position.x,.85,0);project('source',burner.position.x,.12,burner.position.z);frameId=requestAnimationFrame(frame);}
  frameId=requestAnimationFrame(frame);
  return{apply,setSource,setHeating,setCamera,getCamera,get cameraHeld(){return held;},cancelCamera(value){if(held){cameraLocked=true;lockedCamera=structuredClone(value);controls.enabled=false;}setCamera(value);},abortPointer(){const id=ownPointer;ownPointer=null;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);controls.enabled=enabled&&!cameraLocked;},screenshot(){composer.render();return canvas.toDataURL('image/png');},dispose(){disposed=true;cancelAnimationFrame(frameId);resize.disconnect();window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);controls.dispose();composer.dispose();environment.dispose();renderer.dispose();}};
}
