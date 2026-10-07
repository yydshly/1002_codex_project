import * as THREE from 'three';
import { STLLoader } from './vendor/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { atmosphere } from './core.js';

export async function createLandmark(host, callbacks={}) {
  const scene=new THREE.Scene();
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label','真实卡内基宅邸三维打印扫描');host.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(36,1,.1,180),controls=new OrbitControls(camera,renderer.domElement);
  camera.position.set(24,18,25);controls.target.set(0,4,0);controls.enableDamping=true;controls.dampingFactor=.14;
  controls.minDistance=4;controls.maxDistance=65;controls.minPolarAngle=.08;controls.maxPolarAngle=.485*Math.PI;controls.update();
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const ao=new SSAOPass(scene,camera,1,1);ao.kernelRadius=.45;ao.minDistance=.02;ao.maxDistance=.4;composer.addPass(ao);composer.addPass(new OutputPass());
  const [manifest,geometry,hdr]=await Promise.all([
    fetch(new URL('../assets/landmark/manifest.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('资产清单无法读取');return r.json();}),
    new STLLoader().loadAsync(new URL('../assets/landmark/CooperHewitt_print.stl',import.meta.url).href),
    new HDRLoader().loadAsync(new URL('../studio/assets/environment/coastal-day.hdr',import.meta.url).href),
  ]);
  if(manifest.runtime.triangles!==geometry.attributes.position.count/3)throw new Error('建筑几何与资产清单不一致');
  // STL has no encoded units. This transform creates a display model only.
  geometry.computeBoundingBox();const original=geometry.boundingBox,center=original.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-original.min.y,-center.z);geometry.scale(2,2,2);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#dbd2bf',roughness:.82,metalness:0,side:THREE.DoubleSide}));model.castShadow=true;model.receiveShadow=true;scene.add(model);
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(hdr);scene.environment=environment.texture;hdr.dispose();pmrem.dispose();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:'#aaad99',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.06;floor.receiveShadow=true;scene.add(floor);
  const sun=new THREE.DirectionalLight('#fff0d0',2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:.1,far:100});sun.shadow.bias=-.00012;sun.shadow.normalBias=.025;scene.add(sun);
  const hemi=new THREE.HemisphereLight('#c2d3de','#716854',1);scene.add(hemi);
  const spots=[];for(const [x,z] of [[-10,-13],[10,-13],[-10,13],[10,13]]){const light=new THREE.SpotLight('#ffe2b2',0,45,.60,.72,2);light.position.set(x,1.7,z);const target=new THREE.Object3D();target.position.set(0,4,z*.25);scene.add(light,target);light.target=target;spots.push(light);}
  const points={introduction:new THREE.Vector3(5.2,2.7,7.7),facade:new THREE.Vector3(5.3,4,0),garden:new THREE.Vector3(-5.3,2,-4),museum:new THREE.Vector3(0,6.6,4)};
  let applying=false,disposed=false,frameId,locked=false,lockedCamera=null,pointerHeld=false;
  function clampCamera(){const before=controls.target.clone();controls.target.x=THREE.MathUtils.clamp(controls.target.x,-18,18);controls.target.z=THREE.MathUtils.clamp(controls.target.z,-18,18);controls.target.y=THREE.MathUtils.clamp(controls.target.y,.5,12);camera.position.add(controls.target.clone().sub(before));camera.position.x=THREE.MathUtils.clamp(camera.position.x,-60,60);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-60,60);camera.position.y=THREE.MathUtils.clamp(camera.position.y,1,40);}
  function getCamera(){clampCamera();return{position:camera.position.toArray(),target:controls.target.toArray()};}
  function setCamera(value){applying=true;const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();controls.enableDamping=damping;applying=false;}
  function apply(state,{camera:changeCamera=true}={}){const a=atmosphere(state.time);scene.background=new THREE.Color(a.skyColor);scene.fog=new THREE.Fog(a.skyColor,70,150);sun.color.set(a.sunColor);sun.intensity=a.directIntensity;sun.position.fromArray(a.sunDirection).multiplyScalar(42);hemi.color.set(a.skyColor);hemi.groundColor.set(a.groundColor);hemi.intensity=a.ambient*.65;scene.environmentIntensity=a.ambient*.32;renderer.toneMappingExposure=a.exposure*.88;spots.forEach(light=>light.intensity=state.lights?a.practicalIntensity*360:0);if(changeCamera)setCamera(state.camera);}
  controls.addEventListener('start',()=>{if(!applying&&!locked)callbacks.cameraStart?.();});
  controls.addEventListener('change',()=>{if(!applying&&!locked)callbacks.cameraChange?.(getCamera());});
  controls.addEventListener('end',()=>{if(!applying&&!locked)callbacks.cameraEnd?.(getCamera());});
  function cancelCamera(value){if(pointerHeld){locked=true;lockedCamera=value;controls.enabled=false;}setCamera(value);}
  function unlock(){if(!locked)return;setCamera(lockedCamera);locked=false;lockedCamera=null;controls.enabled=true;}
  function pointerDown(){pointerHeld=true;}function pointerEnd(){pointerHeld=false;unlock();}
  renderer.domElement.addEventListener('pointerdown',pointerDown);window.addEventListener('pointerup',pointerEnd);window.addEventListener('pointercancel',pointerEnd);
  const resize=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);composer.setSize(r.width,r.height);});resize.observe(host);
  const vector=new THREE.Vector3();function project(){const width=host.clientWidth,height=host.clientHeight;for(const [id,point] of Object.entries(points)){vector.copy(point).project(camera);const facing=id==='garden'?camera.position.x<-5.3:id==='facade'?camera.position.x>5.3:id==='introduction'?camera.position.x+camera.position.z>12.9:camera.position.y>6.6;callbacks.project?.(id,(vector.x+1)*width/2,(1-vector.y)*height/2,facing&&vector.z>=-1&&vector.z<=1&&Math.abs(vector.x)<.94&&Math.abs(vector.y)<.92);}}
  function frame(){if(disposed)return;controls.update();clampCamera();composer.render();project();frameId=requestAnimationFrame(frame);}frameId=requestAnimationFrame(frame);
  return{apply,getCamera,setCamera,cancelCamera,releaseCamera:unlock,setNavigation(mode){controls.mouseButtons.LEFT=mode==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;},screenshot(){composer.render();return renderer.domElement.toDataURL('image/jpeg',.93);},dispose(){disposed=true;cancelAnimationFrame(frameId);resize.disconnect();renderer.domElement.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointerup',pointerEnd);window.removeEventListener('pointercancel',pointerEnd);controls.dispose();environment.dispose();composer.dispose();renderer.dispose();scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});}};
}
