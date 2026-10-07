import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const SCALE=1.8, DECK_Y=.1366025358, FLOOR_Y=.01;
export async function createSkate(host,callbacks={}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dce5d5');scene.fog=new THREE.Fog('#dce5d5',25,65);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','拖动真实滑板向上触发骑手跳跃，拖动空白处观察视角');host.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(34,1,.08,90),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=2;controls.maxDistance=16;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.47;
  camera.position.set(5,3.6,6);controls.target.set(0,.7,0);controls.update();
  const key=new THREE.DirectionalLight('#fff1d7',3.2);key.position.set(-6,10,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:.1,far:40});key.shadow.normalBias=.015;key.shadow.bias=-.00007;scene.add(key,new THREE.HemisphereLight('#edf5e2','#829073',1.7));
  const loader=new GLTFLoader();
  const names=['character-skate-boy','skateboard','half-pipe','rail-low','steps','obstacle-box','structure-wood'];
  const models=await Promise.all(names.map(name=>loader.loadAsync(new URL(`../assets/skate/models/${name}.glb`,import.meta.url).href)));
  const hdr=await new HDRLoader().loadAsync(new URL('../studio/assets/environment/coastal-day.hdr',import.meta.url).href);const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(hdr);scene.environment=env.texture;scene.environmentIntensity=.45;hdr.dispose();pmrem.dispose();
  const material=(color,roughness=.86)=>new THREE.MeshStandardMaterial({color,roughness});
  function box(w,h,d,color,x,y,z,r=.06){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,r),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;}
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),material('#ced8c1'));ground.rotation.x=-Math.PI/2;ground.position.y=-.32;ground.receiveShadow=true;scene.add(ground);
  box(15,.26,13,'#b8c9bb',0,-.16,0,.10);box(14.7,.06,12.7,'#d7deca',0,-.025,0,.08);
  // The licensed park meshes remain complete; the court is a composed exhibition of them.
  function prop(index,x,z,scale=2,yaw=0){const node=models[index].scene.clone(true);node.scale.setScalar(scale);node.position.set(x,0,z);node.rotation.y=yaw;node.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(node);return node;}
  prop(2,-3.8,-3.1,2.3,Math.PI/2);prop(3,3.1,-2.7,2);prop(4,4.1,2.5,1.7,-Math.PI/2);prop(5,-3.1,3.8,1.9);prop(6,-5.3,1.1,1.7,Math.PI/2);
  const courtMark=new THREE.Mesh(new THREE.RingGeometry(1.25,1.275,100),new THREE.MeshBasicMaterial({color:'#f4f7e9',side:THREE.DoubleSide}));courtMark.rotation.x=-Math.PI/2;courtMark.position.y=.009;scene.add(courtMark);
  for(const x of [-1.85,1.85]){const line=new THREE.Mesh(new THREE.PlaneGeometry(.035,5.1),new THREE.MeshBasicMaterial({color:'#f5f6e8'}));line.rotation.x=-Math.PI/2;line.position.set(x,.008,.5);scene.add(line);}
  // Landscaping and labels are original stage design, separate from the licensed rider.
  box(1.2,.75,1.0,'#8a9f8a',5.8,.36,-4.4,.09);box(1.2,.75,1.0,'#8a9f8a',-5.7,.36,4.7,.09);
  for(const [x,z] of [[5.8,-4.4],[-5.7,4.7]]){const tree=new THREE.Mesh(new THREE.IcosahedronGeometry(.72,1),material('#91a681'));tree.scale.set(.85,1.5,.85);tree.position.set(x,1.55,z);tree.castShadow=true;scene.add(tree);const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.95,8),material('#9a8466'));trunk.position.set(x,1.0,z);scene.add(trunk);}
  const signCanvas=document.createElement('canvas');signCanvas.width=640;signCanvas.height=160;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#e5eadb';ctx.fillRect(0,0,640,160);ctx.fillStyle='#5d7769';ctx.font='600 54px sans-serif';ctx.fillText('ONE GOOD LANDING',28,76);ctx.font='24px sans-serif';ctx.fillText('08  /  ATELIER COURTYARD',28,125);const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(4,.95),new THREE.MeshStandardMaterial({map:signTexture,roughness:1}));sign.position.set(0,.82,-5.5);scene.add(sign);box(4.12,1.05,.10,'#9eb49b',0,.82,-5.57,.05);
  const actor=models[0].scene;const actorGroup=new THREE.Group();actorGroup.scale.setScalar(SCALE);actorGroup.add(actor);scene.add(actorGroup);
  const board=models[1].scene;board.scale.setScalar(SCALE);scene.add(board);
  actor.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});board.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const clips=new Map(models[0].animations.map(clip=>[clip.name,clip]));if(!clips.has('skate-stand')||!clips.has('skate-air'))throw new Error('原始滑板站姿/腾空片段缺失');
  const mixer=new THREE.AnimationMixer(actor);const stand=mixer.clipAction(clips.get('skate-stand')),air=mixer.clipAction(clips.get('skate-air'));for(const action of [stand,air]){action.play();action.paused=true;}stand.setEffectiveWeight(1);air.setEffectiveWeight(0);mixer.update(0);scene.updateMatrixWorld(true);
  const meshes=[];actor.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();meshes.push(o);}});
  function vertexWorld(mesh,index){const vector=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index);mesh.applyBoneTransform(index,vector);return mesh.localToWorld(vector);}
  const soles=[[],[]];for(const mesh of meshes){const names=mesh.skeleton.bones.map(b=>b.name.toLowerCase().replace(/[^a-z]/g,''));const skin=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;for(let side=0;side<2;side++){const bi=names.findIndex(name=>name===`leg${side===0?'left':'right'}`);if(bi<0)continue;const candidates=[];for(let i=0;i<skin.count;i++){let influence=0;for(let j=0;j<4;j++)if(skin.getComponent(i,j)===bi)influence+=weights.getComponent(i,j);if(influence>.8)candidates.push({mesh,index:i,y:vertexWorld(mesh,i).y});}if(!candidates.length)continue;const min=Math.min(...candidates.map(v=>v.y));soles[side].push(...candidates.filter(v=>v.y<=min+.006*SCALE));}}
  if(soles.some(points=>points.length<3))throw new Error('无法确认原几何的两个脚底支撑点');
  let metrics={gap:0,boardY:0,phase:'idle'},pose={phase:'idle',boardY:0,crouch:0,time:0};
  const up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(0,1,0),axis=new THREE.Vector3(),sideAxis=new THREE.Vector3(),basis=new THREE.Matrix4();
  function applyPose(next){pose=next;actorGroup.position.set(0,0,0);stand.time=0;air.time=(next.time||0)%clips.get('skate-air').duration;stand.setEffectiveWeight(1-next.crouch);air.setEffectiveWeight(next.crouch);mixer.update(0);scene.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();const points=soles.map(samples=>samples.map(s=>vertexWorld(s.mesh,s.index)));let centers=points.map(a=>a.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(1/a.length));axis.subVectors(centers[0],centers[1]).normalize();normal.copy(up).addScaledVector(axis,-up.dot(axis)).normalize();
    // Fit the board's original flat deck under two conservative sole support points.
    let contacts;for(let i=0;i<4;i++){contacts=points.map(a=>a.reduce((min,v)=>v.dot(normal)<min.dot(normal)?v:min));axis.subVectors(contacts[0],contacts[1]).normalize();normal.copy(up).addScaledVector(axis,-up.dot(axis)).normalize();}const midpoint=contacts[0].clone().add(contacts[1]).multiplyScalar(.5);const shift=DECK_Y*SCALE+(next.boardY||0)-midpoint.y;actorGroup.position.y=shift;midpoint.y+=shift;sideAxis.crossVectors(normal,axis).normalize();basis.makeBasis(sideAxis,normal,axis);board.quaternion.setFromRotationMatrix(basis);board.position.copy(midpoint).addScaledVector(normal,-DECK_Y*SCALE);scene.updateMatrixWorld(true);
    // The board may tilt with the support plane. Lift the complete rider/board together
    // when its original transformed vertices would cross the flat court (top y=.005).
    const minY=new THREE.Box3().setFromObject(board,true).min.y;
    const floorCorrection=Math.max(0,FLOOR_Y-minY);board.position.y+=floorCorrection;actorGroup.position.y+=floorCorrection;scene.updateMatrixWorld(true);
    const gap=Math.abs(contacts[0].clone().sub(contacts[1]).dot(normal));metrics={gap,boardY:next.boardY||0,phase:next.phase,floorCorrection};callbacks.contact?.(metrics);
  }
  applyPose(pose);
  let applying=false,locked=false,disposed=false,frame,held=null,cameraHeld=false,cameraCancelled=false,cancelledCamera=null;const cameraPointers=new Set();
  function getCamera(){return {position:camera.position.toArray(),target:controls.target.toArray()};}
  function setCamera(value){applying=true;const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();controls.enableDamping=damping;applying=false;}
  controls.addEventListener('start',()=>{if(!applying&&!locked){cameraHeld=true;callbacks.cameraStart?.();}});controls.addEventListener('change',()=>{if(!applying&&!locked)callbacks.cameraChange?.(getCamera());});controls.addEventListener('end',()=>{if(!applying&&!locked){cameraHeld=false;callbacks.cameraEnd?.();}});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();function overBoard(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(board,true);if(hit.length)return true;return false;}
  const canvas=renderer.domElement;
  function pointerDown(event){if(locked||cameraCancelled)return;if(event.button!==0||!overBoard(event)){cameraPointers.add(event.pointerId);return;}event.stopImmediatePropagation();event.preventDefault();held={id:event.pointerId,x:event.clientX,y:event.clientY,start:performance.now()};controls.enabled=false;canvas.setPointerCapture(event.pointerId);callbacks.dragStart?.();}
  function pointerMove(event){if(!held||held.id!==event.pointerId)return;event.preventDefault();callbacks.dragChange?.(held.y-event.clientY,event.clientX-held.x);}
  function pointerEnd(event){if(!held||held.id!==event.pointerId)return;const h=held;held=null;const result={rise:h.y-event.clientY,dx:event.clientX-h.x,durationMs:Math.max(1,performance.now()-h.start)};if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);controls.enabled=!locked;callbacks.dragEnd?.(result);}
  function pointerCancel(event){if(!held||event&&held.id!==event.pointerId)return;const id=held.id;held=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);controls.enabled=!locked;callbacks.dragCancel?.();}
  canvas.addEventListener('pointerdown',pointerDown,true);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerCancel);canvas.addEventListener('lostpointercapture',pointerCancel);
  function lock(value){locked=value;controls.enabled=!value&&!held&&!cameraCancelled;}
  function cancelCamera(value){if(cameraPointers.size){cameraCancelled=true;cancelledCamera=value;controls.enabled=false;}setCamera(value);}
  function endCameraPointer(event){cameraPointers.delete(event.pointerId);if(!cameraPointers.size){cameraHeld=false;if(cameraCancelled){setCamera(cancelledCamera);cameraCancelled=false;cancelledCamera=null;controls.enabled=!locked&&!held;}}}
  window.addEventListener('pointerup',endCameraPointer);window.addEventListener('pointercancel',endCameraPointer);
  const resize=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);});resize.observe(host);
  function render(){if(disposed)return;frame=requestAnimationFrame(render);if(!locked&&!held)controls.update();renderer.render(scene,camera);const point=board.position.clone().add(new THREE.Vector3(0,.04*SCALE,0)).project(camera);callbacks.project?.((point.x*.5+.5)*host.clientWidth,(-point.y*.5+.5)*host.clientHeight,point.z<1&&point.z>-1&&!locked);}
  render();
  return {applyPose,setCamera,getCamera,lock,cancelCamera,cameraHeld:()=>cameraHeld,cancelDrag:()=>pointerCancel(),metrics:()=>({...metrics}),screenshot:()=>{renderer.render(scene,camera);return canvas.toDataURL('image/png');},dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener('pointerup',endCameraPointer);window.removeEventListener('pointercancel',endCameraPointer);controls.dispose();env.dispose();renderer.dispose();scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});canvas.remove();}};
}
