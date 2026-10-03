import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const EXHIBITS = [
  { id:'tide', number:'01', title:'潮汐之环', subtitle:'TIDAL CONTINUUM', author:'LUME STUDIO · 2026', position:[0,-8], arrival:[0,0], description:'一条连续的青铜曲线，绕过自身，又回到起点。日光和水面让它在不同角度呈现完全不同的轮廓。', capability:'金属 PBR、HDR 环境反射、曲面几何、实时投影。' },
  { id:'gallery', number:'02', title:'光的房间', subtitle:'A ROOM FOR LIGHT', author:'空间与光 · 常设展', position:[-17,-13], arrival:[-14,-4], description:'走入玻璃与木格栅围合的展亭，看光线穿过屋顶，在画作、墙面与地面之间移动。建筑本身也是展品。', capability:'物理玻璃、混凝土法线与粗糙度贴图、骨骼动画、室内外空间。' },
  { id:'coast', number:'03', title:'面向海的座位', subtitle:'THE HORIZON ROOM', author:'海岸公共艺术 · 开放空间', position:[31,11], arrival:[29,11], description:'沿着花园到达临海平台，停下来，听风与海。这里把观景、休憩和一件悬浮的艺术装置放在同一条路线上。', capability:'真实平面反射水面、距离雾、动态法线、材质与统一氛围。' },
];
const TAU=Math.PI*2, clamp=THREE.MathUtils.clamp;
function seeded(seed=103) { let s=seed; return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;}; }
function canvasTexture(draw,size=512) { const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t; }

export async function createPark(canvas,{onProgress,onStats,onLocation,onArtifact,onCamera}={}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(52,1,.12,650);
  scene.fog=new THREE.FogExp2('#e4d7c0',.0037);
  const clock=new THREE.Clock(false), random=seeded();
  let active=false, disposed=false, frame=0, time=0, quality='balanced', mode='third', light='golden';
  let yaw=.14, pitch=.23, followDistance=10.5, dragging=null, size=[0,0], lastStats=0, fpsFrames=0, fpsTime=0;
  let tour=false, tourIndex=0, tourWait=0, lastLocation='', gestureUntil=0, moveAmount=0, lastAction='Idle';
  const keys=new Set(), touches=new Set(), colliders=[], targets=[], waters=[], foliageMaterials=[],cameraObstacles=[];
  const position=new THREE.Vector3(0,1.86,0), camTarget=new THREE.Vector3(), camGoal=new THREE.Vector3(), lookGoal=new THREE.Vector3();
  const guideRoot=new THREE.Group();guideRoot.position.copy(position);scene.add(guideRoot);let heading=Math.PI;
  const manager=new THREE.LoadingManager();manager.onProgress=(_,loaded,total)=>onProgress?.(`准备场景资源 ${loaded} / ${total}`);
  onProgress?.('加载导览角色、天空与材质…');
  const textureLoader=new THREE.TextureLoader(manager);
  const [gltf,hdr,dayHDR,colorMap,normalMap,roughMap]=await Promise.all([
    new GLTFLoader(manager).loadAsync('./assets/guide.glb'),
    new HDRLoader(manager).loadAsync('./assets/coastal-sunset.hdr'),
    new HDRLoader(manager).loadAsync('./assets/coastal-day.hdr'),
    textureLoader.loadAsync('./assets/concrete-color.jpg'),textureLoader.loadAsync('./assets/concrete-normal.jpg'),textureLoader.loadAsync('./assets/concrete-roughness.jpg'),
  ]);
  hdr.mapping=dayHDR.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromEquirectangular(hdr),dayEnvironment=pmrem.fromEquirectangular(dayHDR);pmrem.dispose();
  scene.environment=dayEnvironment.texture;scene.environmentIntensity=.9;scene.background=dayHDR;scene.backgroundIntensity=.9;
  scene.backgroundRotation.y=.65;scene.environmentRotation.y=.65;
  colorMap.colorSpace=THREE.SRGBColorSpace;
  for(const t of [colorMap,normalMap,roughMap]) {t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  const sunlight=new THREE.DirectionalLight('#ffddad',3.1);sunlight.position.set(-35,32,24);sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);Object.assign(sunlight.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:150});
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.bias=-.00025;sunlight.shadow.normalBias=.045;scene.add(sunlight,sunlight.target);
  const fill=new THREE.HemisphereLight('#e0eced','#6e7253',.9);scene.add(fill);
  const glowLights=[];
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const ao=new SSAOPass(scene,camera,800,500,16);ao.kernelRadius=1.2;ao.minDistance=.0001;ao.maxDistance=.006;ao.copyMaterial.fragmentShader=ao.copyMaterial.fragmentShader.replace('gl_FragColor = opacity * texel;','gl_FragColor = vec4( mix( vec3(1.0), texel.rgb, 0.48 ), texel.a );');composer.addPass(ao);
  const bloom=new UnrealBloomPass(new THREE.Vector2(800,500),.13,.32,1.35);composer.addPass(bloom);const output=new OutputPass();composer.addPass(output);
  const materials=new Set(), geometries=new Map();
  function pbr(color,extra={}) {const m=new THREE.MeshStandardMaterial({color,roughness:.78,...extra});materials.add(m);return m;}
  function concrete(repeat=2,tint='#eee8d7') {const maps=[colorMap,normalMap,roughMap].map(t=>{const clone=t.clone();clone.repeat.set(repeat,repeat);return clone;});const m=pbr(tint,{map:maps[0],normalMap:maps[1],roughnessMap:maps[2],normalScale:new THREE.Vector2(.22,.22)});m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n diffuseColor *= vec4( mix( vec3(1.0), sampledDiffuseColor.rgb, 0.24 ), sampledDiffuseColor.a );\n #endif');};m.customProgramCacheKey=()=> 'lume-limestone';return m;}
  const ground=pbr('#99a67f',{roughness:1}), stone=concrete(3), paving=concrete(16,'#e4ddc9'), bronze=pbr('#ba7950',{metalness:.92,roughness:.23});
  const charcoal=pbr('#273c37',{roughness:.38,metalness:.55}), cream=pbr('#f7efdc',{roughness:.63}), gravel=pbr('#c5bba1',{roughness:1});
  const woodMap=canvasTexture((ctx,s)=>{ctx.fillStyle='#94764f';ctx.fillRect(0,0,s,s);const r=seeded(32);for(let i=0;i<3000;i++){ctx.strokeStyle=`rgba(${70+r()*65|0},${45+r()*48|0},${22+r()*30|0},${.1+r()*.25})`;ctx.lineWidth=.4+r()*1.4;ctx.beginPath();const y=r()*s;ctx.moveTo(0,y);ctx.bezierCurveTo(s*.3,y+r()*6,s*.7,y-r()*5,s,y);ctx.stroke();}});
  woodMap.wrapS=woodMap.wrapT=THREE.RepeatWrapping;woodMap.repeat.set(1,3);const wood=pbr('#e1b987',{map:woodMap,roughness:.72});
  const glass=new THREE.MeshPhysicalMaterial({color:'#dbe8df',metalness:0,roughness:.08,transmission:.78,thickness:.13,ior:1.45,transparent:true,opacity:.48,side:THREE.DoubleSide,envMapIntensity:1.2});materials.add(glass);
  function add(geo,mat,x,y,z,parent=scene) {const object=new THREE.Mesh(geo,mat);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
  function block(w,h,d,mat,x,y,z,parent=scene,round=.07) {const key=`${w}/${h}/${d}/${round}`;if(!geometries.has(key))geometries.set(key,new RoundedBoxGeometry(w,h,d,2,Math.min(round,w/4,h/4,d/4)));const mesh=add(geometries.get(key),mat,x,y,z,parent);if(h>2&&parent===scene)cameraObstacles.push(mesh);return mesh;}
  function line(a,b,r,mat,parent=scene) {const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));const mesh=add(new THREE.CylinderGeometry(r,r,v.length(),8),mat,...a,parent);mesh.position.addScaledVector(v,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return mesh;}
  function disc(radius,h,mat,x,y,z) {return add(new THREE.CylinderGeometry(radius,radius,h,80),mat,x,y,z);}
  function badge(exhibit,x,y,z) {
    const tex=canvasTexture((ctx,s)=>{ctx.fillStyle='#213c35';ctx.fillRect(0,0,s,s);ctx.strokeStyle='#bd9864';ctx.lineWidth=3;ctx.strokeRect(18,18,s-36,s-36);ctx.fillStyle='#ead6b1';ctx.font='72px Georgia';ctx.fillText(exhibit.number,42,110);ctx.fillStyle='#fbf4e4';ctx.font='500 43px Microsoft YaHei, sans-serif';ctx.fillText(exhibit.title,42,208);ctx.fillStyle='#b8c6b2';ctx.font='21px sans-serif';ctx.fillText(exhibit.subtitle,42,258);ctx.font='19px sans-serif';ctx.fillText('LUME · 岸边艺术花园',42,419);ctx.fillStyle='#bb9667';ctx.fillText('走近作品 / 点击查看',42,459);});
    const board=block(2.5,2.5,.12,pbr('#fff',{map:tex,roughness:.85}),x,y,z);board.userData.exhibit=exhibit;targets.push(board);line([x,y-1.3,z],[x,1.8,z],.05,charcoal);
  }
  function artwork(exhibit,objects) {objects.forEach(o=>{o.userData.exhibit=exhibit;targets.push(o);});}

  // One coherent, walkable landscape: art plaza, gallery, water garden and coast.
  const island=new THREE.Shape();island.absellipse(0,0,62,57,0,TAU,false,0);
  const islandGeo=new THREE.ExtrudeGeometry(island,{depth:4,bevelEnabled:false,steps:1});islandGeo.rotateX(-Math.PI/2);
  const earth=add(islandGeo,gravel,0,-2.5,-10);earth.castShadow=false;
  const lawn=new THREE.ShapeGeometry(island,80);lawn.rotateX(-Math.PI/2);const soil=add(lawn,ground,0,1.56,-10);soil.castShadow=false;
  block(38,.35,50,paving,-1,1.68,-8,scene,.12);
  block(8,.18,24,stone,0,1.83,24,scene,.1);
  block(24,.2,8,stone,25,1.81,12,scene,.1);
  const joint=pbr('#a8a48f',{roughness:1});
  for(let z=-30;z<18;z+=2.5)block(38,.008,.012,joint,-1,1.859,z,scene,.001);
  for(let x=-18;x<19;x+=3.2)block(.012,.008,50,joint,x,1.859,-8,scene,.001);
  for(let z=18;z<36;z+=2.5)block(8,.008,.012,joint,0,1.926,z,scene,.001);
  // Low planting beds create edges and routes without hiding the destination.
  for(const [x,z,w,d] of [[-25,2,8,18],[25,-14,10,16],[-15,21,11,7],[15,23,10,7]]) {
    block(w,.7,d,stone,x,1.87,z);block(w-.6,.06,d-.6,pbr('#5e6c45'),x,2.25,z);
    colliders.push({rect:[x-w/2,x+w/2,z-d/2,z+d/2]});
  }
  // Gallery with thin roof, mullions, timber canopy, interior art and reception.
  const gallery=EXHIBITS[1];
  block(17,.5,19,stone,-18,1.78,-15);block(17.8,.42,20.3,cream,-18,7.65,-15);
  block(16,.16,18,wood,-18,7.29,-15);
  for(let i=0;i<27;i++)block(.18,.18,21,wood,-26.5+i*.66,7.98,-15);
  block(.32,5.2,18,stone,-26.1,4.5,-15);
  block(16,.22,.27,charcoal,-18,2.16,-24.1);block(16,.22,.27,charcoal,-18,7.12,-24.1);
  for(let i=0;i<6;i++) {
    block(.09,5,.1,charcoal,-25+i*3,4.6,-24);
    block(2.84,4.9,.06,glass,-23.57+i*2.86,4.65,-24);
  }
  for(let i=0;i<5;i++){block(.09,5,.1,charcoal,-9.9,4.6,-23+i*4);block(.06,4.9,3.86,glass,-10,4.65,-21+i*4);}
  for(const x of [-25,-11])for(const z of [-23,-7]){block(.2,5.5,.2,charcoal,x,4.64,z);colliders.push({x,z,r:.55});}
  colliders.push({rect:[-26.3,-25.9,-24,-6]},{rect:[-10.15,-9.85,-24,-5.5]},{rect:[-26.3,-9.8,-24.2,-23.8]},{rect:[-22.5,-17.5,-7.7,-6.3]},{rect:[-25,-24.5,-20.5,-9.5]});
  block(5,.95,1.4,stone,-20,2.55,-7);block(5.2,.12,1.6,wood,-20,3.08,-7);
  block(.35,4.2,11,cream,-24.8,4.1,-15);
  for(let i=0;i<3;i++) {
    const paint=canvasTexture((ctx,s)=>{const palettes=[['#e2dcc7','#557f72','#c0a276'],['#dce2d5','#b37e50','#294f50'],['#ead6b4','#8ba39a','#3c635b']];const p=palettes[i];ctx.fillStyle=p[0];ctx.fillRect(0,0,s,s);ctx.fillStyle=p[1];ctx.beginPath();ctx.ellipse(220,250,150,190,.6,0,TAU);ctx.fill();ctx.fillStyle=p[2];ctx.fillRect(270,80,70,370);ctx.strokeStyle=p[0];ctx.lineWidth=5;for(let k=0;k<8;k++){ctx.beginPath();ctx.moveTo(70,150+k*30);ctx.lineTo(430,180+k*25);ctx.stroke();}});
    const picture=block(.07,2.4,2.1,pbr('#fff',{map:paint,roughness:.82}),-24.56,4.7,-21+i*5);
    artwork(gallery,[picture]);
  }
  badge(gallery,-23.3,3.05,-4.8);
  // Bronze work and companion stainless steel study share the same environment.
  const tide=EXHIBITS[0];disc(3.2,.3,stone,0,2,-8);block(3.6,.75,3.6,stone,0,2.43,-8);
  const knot=add(new THREE.TorusKnotGeometry(2.1,.24,220,16,2,3),bronze,0,5.55,-8);knot.scale.set(1,1.15,1);knot.rotation.set(.22,.26,.13);artwork(tide,[knot]);
  colliders.push({x:0,z:-8,r:3.25});
  badge(tide,-3.5,3.08,-2);
  disc(2.9,.32,stone,10.8,2,-20);const silver=pbr('#d5dfd7',{metalness:1,roughness:.13});
  const orbit=add(new THREE.TorusGeometry(2.5,.18,16,120),silver,10.8,4.8,-20);orbit.rotation.set(.2,.4,-.35);artwork(tide,[orbit]);
  const ball=add(new THREE.SphereGeometry(1.25,48,32),silver,10.8,4.8,-20);artwork(tide,[ball]);
  colliders.push({x:10.8,z:-20,r:3});
  // The garden water has its own true planar reflection; sea stays at coastal level.
  const nsize=128,data=new Uint8Array(nsize*nsize*4);
  for(let y=0;y<nsize;y++)for(let x=0;x<nsize;x++){const u=x/nsize*TAU,v=y/nsize*TAU,i=(y*nsize+x)*4;const a=.23*Math.cos(u*7+v*3)+.14*Math.sin(v*11-u*2),b=.19*Math.sin(v*8+u*4)+.11*Math.cos(u*13-v*3);const n=new THREE.Vector3(a,b,1).normalize();data[i]=(n.x*.5+.5)*255;data[i+1]=(n.y*.5+.5)*255;data[i+2]=(n.z*.5+.5)*255;data[i+3]=255;}
  const waterNormals=new THREE.DataTexture(data,nsize,nsize);waterNormals.wrapS=waterNormals.wrapT=THREE.RepeatWrapping;waterNormals.magFilter=THREE.LinearFilter;waterNormals.minFilter=THREE.LinearMipmapLinearFilter;waterNormals.generateMipmaps=true;waterNormals.needsUpdate=true;
  let reflectionDepth=0;
  function addWater(w,d,x,y,z,pool=false) {
    const water=new Water(new THREE.PlaneGeometry(w,d),{textureWidth:512,textureHeight:512,waterNormals,sunDirection:new THREE.Vector3(-.7,.6,.4).normalize(),sunColor:0xffddb0,waterColor:pool?0x386e66:0x365e61,distortionScale:pool?.35:2.3,fog:false});
    water.rotation.x=-Math.PI/2;water.position.set(x,y,z);scene.add(water);
    const reflect=water.onBeforeRender;let last=-10;
    water.onBeforeRender=function(...args){if(quality==='performance'||reflectionDepth||time-last<(quality==='high'?.04:.1))return;last=time;reflectionDepth++;try{reflect.apply(this,args);}finally{reflectionDepth--;}};
    waters.push(water);return water;
  }
  const sea=addWater(1000,1000,0,-.05,0);sea.material.uniforms.size.value=2.3;
  block(14.8,.18,23.8,stone,12,1.92,-3);
  const pool=addWater(13.8,22.8,12,2.025,-3,true);pool.material.uniforms.size.value=.9;
  colliders.push({rect:[4.5,19.5,-15,9],pool:true});
  for(const [x,z,w,d]of[[4.9,-3,.4,24],[19.1,-3,.4,24],[12,-14.7,14.6,.4],[12,8.7,14.6,.4]])block(w,.2,d,cream,x,2.08,z);
  // Seaward platform, shade structure and seated-scale furniture.
  const coast=EXHIBITS[2];block(16,.3,13,wood,32,1.83,13);block(16.8,.35,5.3,cream,32,6.3,17);
  for(const x of [24.5,39.5])for(const z of [15,19])block(.15,4.4,.15,charcoal,x,4.05,z);
  for(let i=0;i<22;i++)block(.22,.17,5.6,wood,24.5+i*.7,6.59,17);
  for(const [x,z,angle]of[[-5,5,0],[23,-23,Math.PI/2],[30,16,0],[-30,-7,Math.PI/2]]) {
    const bench=new THREE.Group();bench.position.set(x,1.86,z);bench.rotation.y=angle;scene.add(bench);
    for(let j=0;j<5;j++)block(4.5,.11,.13,wood,0,.6,-.4+j*.19,bench);
    for(const side of [-1,1])block(.16,.56,.9,charcoal,side*1.7,.28,0,bench);
    block(4.5,.12,.5,wood,0,1.04,-.39,bench);bench.children.at(-1).rotation.x=-.15;
  }
  const floating=add(new THREE.TorusGeometry(1.7,.13,12,120),bronze,34,4.2,10);floating.rotation.set(.15,.3,.5);artwork(coast,[floating]);badge(coast,25,3.06,10.8);
  // Thin lamps, bollards and warm practical lighting define a route at blue hour.
  for(const [x,z]of[[-5,15],[-6,-21],[22,1],[22,-23],[-29,-17],[29,21],[-8,30]]) {
    line([x,1.8,z],[x,5.4,z],.045,charcoal);block(.9,.12,.3,charcoal,x,5.44,z);
    block(.66,.045,.22,pbr('#ffe6b4',{emissive:'#ffba69',emissiveIntensity:1.8}),x,5.35,z);
    const lamp=new THREE.PointLight('#ffbd76',0,11,2);lamp.position.set(x,5.1,z);scene.add(lamp);glowLights.push(lamp);
  }
  for(let z=-29;z<34;z+=6)for(const x of [-4.7,4.7]){block(.11,.42,.11,charcoal,x,2.05,z);block(.13,.025,.13,pbr('#ecd6aa',{emissive:'#ffbc70',emissiveIntensity:.9}),x,2.275,z);}
  for(const [x,y,z]of[[-20,6.8,-15],[-14,6.8,-15],[32,6.1,17]]){const lamp=new THREE.PointLight('#ffcf92',0,14,2);lamp.position.set(x,y,z);scene.add(lamp);glowLights.push(lamp);block(1.2,.045,.22,pbr('#fff0d0',{emissive:'#ffd0a0',emissiveIntensity:1.4}),x,y+.2,z);}

  // Organic pine crowns and grasses use shared geometry with per-instance variation.
  const treePositions=[];
  for(let i=0;i<125;i++) {
    const x=(random()-.5)*105,z=random()*88-62;
    if(Math.hypot(x/62,(z+10)/57)>.93||Math.abs(x)<29&&z>-34&&z<27||x>21&&x<44&&z>3&&z<25||x>32&&x<38&&z>-29&&z<16)continue;
    treePositions.push([x,z,6.2+random()*5]);
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.25,1,9),wood,treePositions.length);
  const leafNoise=canvasTexture((ctx,s)=>{ctx.fillStyle='#d9e5c8';ctx.fillRect(0,0,s,s);const r=seeded(70);for(let i=0;i<12000;i++){const shade=120+r()*110|0;ctx.fillStyle=`rgba(${shade},${shade+10},${shade-15},.28)`;ctx.beginPath();ctx.ellipse(r()*s,r()*s,1+r()*5,1+r()*3,r()*TAU,0,TAU);ctx.fill();}},256);
  const leaf=pbr('#778461',{map:leafNoise,bumpMap:leafNoise,bumpScale:.15,roughness:.95});foliageMaterials.push(leaf);
  const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),leaf,treePositions.length*7);
  const temp=new THREE.Object3D();let ci=0;
  treePositions.forEach(([x,z,h],i)=>{
    temp.position.set(x,1.6+h/2,z);temp.rotation.set(0,random()*TAU,(random()-.5)*.07);temp.scale.set(1,h,1);temp.updateMatrix();trunks.setMatrixAt(i,temp.matrix);
    for(let c=0;c<7;c++){const a=c/7*TAU,r=c===0?0:1.25+random();temp.position.set(x+Math.cos(a)*r,1.6+h+random()*.9,z+Math.sin(a)*r);temp.rotation.set(random(),random()*TAU,random());temp.scale.set(1.5+random()*1.1,.75+random()*.55,1.5+random());temp.updateMatrix();foliage.setMatrixAt(ci,temp.matrix);foliage.setColorAt(ci,new THREE.Color().setHSL(.24+random()*.035,.18+random()*.11,.24+random()*.08));ci++;}
    if(i%3===0)colliders.push({x,z,r:.45});
  });
  trunks.castShadow=true;trunks.receiveShadow=true;foliage.castShadow=true;foliage.receiveShadow=true;scene.add(trunks,foliage);
  const sprayMap=canvasTexture((ctx,s)=>{ctx.clearRect(0,0,s,s);const r=seeded(11);for(let i=0;i<100;i++){const x=s*.5+(r()-.5)*s*.82,y=s*.5+(r()-.5)*s*.72;ctx.fillStyle=`hsl(${82+r()*20},${18+r()*16}%,${35+r()*22}%)`;ctx.beginPath();ctx.ellipse(x,y,2+r()*7,1+r()*4,r()*TAU,0,TAU);ctx.fill();}},128);
  const spray=pbr('#b5c19b',{map:sprayMap,transparent:true,alphaTest:.45,side:THREE.DoubleSide,roughness:1});foliageMaterials.push(spray);
  const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),spray,treePositions.length*105);let li=0;
  treePositions.forEach(([x,z,h])=>{for(let i=0;i<105;i++){const a=random()*TAU,r=2.8*Math.sqrt(random());temp.position.set(x+Math.cos(a)*r,1.6+h+(random()-.4)*2.2,z+Math.sin(a)*r);temp.rotation.set(random()*TAU,random()*TAU,random()*TAU);temp.scale.setScalar(.85+random()*.65);temp.updateMatrix();leaves.setMatrixAt(li++,temp.matrix);}});leaves.receiveShadow=true;scene.add(leaves);
  const bush=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),pbr('#899160',{roughness:.96}),130);
  for(let i=0;i<130;i++){const side=i%2?-1:1;const x=side*(23+random()*8);let z=random()*46-25;if(x>23&&z>5&&z<22)z=-25+random()*28;if(x<-23&&z>-25&&z<-4)z=-2+random()*24;temp.position.set(x,2+random()*.35,z);temp.rotation.set(random(),random(),random());temp.scale.set(.55+random()*.7,.35+random()*.4,.65+random()*.6);temp.updateMatrix();bush.setMatrixAt(i,temp.matrix);bush.setColorAt(i,new THREE.Color().setHSL(.2+random()*.045,.21,.37+random()*.12));}bush.castShadow=true;scene.add(bush);
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.035,0,0,.035,0,0,.05,.5,.025,-.02,.65,.05],3));grassGeo.setIndex([0,1,2,0,2,3]);grassGeo.computeVertexNormals();
  const grassMat=pbr('#8b9a6c',{side:THREE.DoubleSide,roughness:1});foliageMaterials.push(grassMat);
  const grassInstances=new THREE.InstancedMesh(grassGeo,grassMat,3500);
  for(let i=0;i<3500;i++){const x=(random()-.5)*108,z=random()*100-66;const outside=(Math.abs(x)>24||z<-34||z>28)&&!(x>20&&x<44&&z>5&&z<22)&&Math.hypot(x/62,(z+10)/57)<.97;temp.position.set(x,outside?1.56:-10,z);temp.rotation.set(0,random()*TAU,0);temp.scale.setScalar(.5+random()*.9);temp.updateMatrix();grassInstances.setMatrixAt(i,temp.matrix);}scene.add(grassInstances);
  const wind={value:0};
  foliageMaterials.forEach(mat=>{mat.onBeforeCompile=shader=>{shader.uniforms.parkTime=wind;shader.vertexShader='uniform float parkTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(parkTime * 1.4 + position.y * 2.0 + position.z) * 0.045 * max(position.y,0.0);');};});
  const rockMat=pbr('#90978b',{roughness:.93});
  for(let i=0;i<32;i++){const a=random()*TAU,x=Math.cos(a)*54,z=Math.sin(a)*49-10;const rock=add(new THREE.IcosahedronGeometry(1,2),rockMat,x,1.25,z);rock.scale.set(1+random()*2.3,.4+random()*.9,1+random()*1.5);rock.rotation.set(random(),random()*TAU,random());}
  const planting=new THREE.InstancedMesh(new THREE.ConeGeometry(.085,.8,5),pbr('#658164',{roughness:.98}),950);
  const blossoms=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08,1),pbr('#d3b4be',{roughness:.86}),430);
  const beds=[[-25,2,7.2,17.2],[25,-14,9.2,15.2],[-15,21,10.2,6.2],[15,23,9.2,6.2]];
  for(let i=0;i<950;i++){const b=beds[i%4],x=b[0]+(random()-.5)*b[2],z=b[1]+(random()-.5)*b[3],h=.6+random()*.5;temp.position.set(x,2.3+h/2,z);temp.rotation.set((random()-.5)*.15,random()*TAU,(random()-.5)*.2);temp.scale.set(.8+random(),h,1);temp.updateMatrix();planting.setMatrixAt(i,temp.matrix);planting.setColorAt(i,new THREE.Color().setHSL(.23+random()*.05,.19,.31+random()*.12));if(i<430){temp.position.y=2.3+h;temp.scale.set(.7+random()*.6,1.3+random(),.7+random()*.6);temp.updateMatrix();blossoms.setMatrixAt(i,temp.matrix);}}
  planting.castShadow=true;planting.receiveShadow=true;scene.add(planting,blossoms);
  const aoRender=ao.render;ao.render=function(...args){const excluded=[];scene.traverse(o=>{if(o.isMesh&&o.visible&&(o.material===glass||o.material===spray||o.material===grassMat||waters.includes(o))){excluded.push(o);o.visible=false;}});const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;try{aoRender.apply(this,args);}finally{excluded.forEach(o=>o.visible=true);renderer.shadowMap.autoUpdate=auto;}};

  // A real glTF rig with cross-faded idle, walking and running clips.
  const guide=gltf.scene;const bounds=new THREE.Box3().setFromObject(guide), height=bounds.max.y-bounds.min.y, factor=2.1/height;
  guide.scale.setScalar(factor);guide.position.y=-bounds.min.y*factor;guideRoot.add(guide);
  guide.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;const mats=Array.isArray(object.material)?object.material:[object.material];mats.forEach(m=>{m.roughness=.43;if(m.name==='Main'){m.color.set('#dedcc7');m.metalness=.24;}if(m.name==='Grey')m.color.set('#526b60');});}});
  const mixer=new THREE.AnimationMixer(guide), actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  actions.Idle.play();
  function animation(name,once=false) {
    if(name===lastAction&&!once)return;const next=actions[name];if(!next)return;
    const previous=actions[lastAction];next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;previous?.crossFadeTo(next,.28,true);lastAction=name;
  }
  const tourRoute=[{p:[0,0],stop:'tide'},{p:[-7,-1]},{p:[-14,-4]},{p:[-14,-13],stop:'gallery'},{p:[-14,-4]},{p:[-7,-4]},{p:[-7,-26]},{p:[35,-26]},{p:[35,2]},{p:[29,11],stop:'coast'},{p:[22,18]},{p:[0,19]}];
  const exhibitDistance=e=>Math.min(Math.hypot(position.x-e.arrival[0],position.z-e.arrival[1]),Math.hypot(position.x-e.position[0],position.z-e.position[1]));
  function blocked(x,z) {
    if(Math.hypot(x/58,(z+10)/53)>1)return true;
    return colliders.some(c=>c.rect?x>c.rect[0]-.35&&x<c.rect[1]+.35&&z>c.rect[2]-.35&&z<c.rect[3]+.35:Math.hypot(x-c.x,z-c.z)<c.r+.3);
  }
  function move(delta) {
    const direction=new THREE.Vector3(), running=keys.has('run');
    if(tour&&tourWait>0){tourWait-=delta;}
    else if(tour){const target=tourRoute[tourIndex];direction.set(target.p[0]-position.x,0,target.p[1]-position.z);if(direction.length()<.5){if(target.stop){onArtifact?.(EXHIBITS.find(e=>e.id===target.stop));tourWait=5.5;}tourIndex++;if(tourIndex>=tourRoute.length){tour=false;yaw=.14;heading=Math.PI;setCamera('third');onLocation?.({title:'花园入口',tour:false});}direction.set(0,0,0);}}
    else {
      const forward=Number(keys.has('forward')||touches.has('forward'))-Number(keys.has('backward')||touches.has('backward'));
      const side=Number(keys.has('right')||touches.has('right'))-Number(keys.has('left')||touches.has('left'));
      direction.set(forward*Math.sin(yaw)+side*Math.cos(yaw),0,-forward*Math.cos(yaw)+side*Math.sin(yaw));
    }
    moveAmount=direction.length()>0?1:0;
    if(moveAmount){direction.normalize();const speed=(running?5.8:2.75)*delta;const nx=position.x+direction.x*speed,nz=position.z+direction.z*speed;
      if(!blocked(nx,position.z))position.x=nx;if(!blocked(position.x,nz))position.z=nz;
      const h=Math.atan2(direction.x,direction.z);heading+=Math.atan2(Math.sin(h-heading),Math.cos(h-heading))*(1-Math.exp(-delta*10));
      if(tour){const a=Math.atan2(direction.x,-direction.z);yaw+=Math.atan2(Math.sin(a-yaw),Math.cos(a-yaw))*(1-Math.exp(-delta*2.4));}
    }
    let groundHeight=1.56;
    if(position.x>-20&&position.x<18&&position.z>-33&&position.z<17)groundHeight=1.855;
    if(Math.abs(position.x)<4&&position.z>=12&&position.z<36)groundHeight=1.92;
    if(position.x>13&&position.x<37&&position.z>8&&position.z<16)groundHeight=1.91;
    if(position.x>24&&position.x<40&&position.z>6.5&&position.z<19.5)groundHeight=1.98;
    if(position.x>-26.5&&position.x<-9.5&&position.z>-24.5&&position.z<-5.5)groundHeight=2.03;
    position.y=THREE.MathUtils.lerp(position.y,groundHeight,1-Math.exp(-delta*14));
    guideRoot.position.copy(position);guideRoot.rotation.y=heading;guideRoot.visible=mode!=='first';
    if(time>=gestureUntil)animation(moveAmount?(running?'Running':'Walking'):'Idle');mixer.update(delta);
    let nearest=EXHIBITS.map(e=>({e,d:exhibitDistance(e)})).sort((a,b)=>a.d-b.d)[0];
    const title=nearest.d<9?nearest.e.title:position.z>17?'花园入口':'雕塑花园';
    const key=`${title}/${tour}/${nearest.d<7?nearest.e.id:''}`;
    if(key!==lastLocation){lastLocation=key;onLocation?.({title,tour,nearby:nearest.d<7?nearest.e:null});}
  }
  const cameraRay=new THREE.Raycaster(),cameraOrigin=new THREE.Vector3(),cameraDirection=new THREE.Vector3();
  function updateCamera(delta,instant=false) {
    const t=instant?1:1-Math.exp(-delta*6);
    if(mode==='overview') {
      camGoal.set(Math.sin(yaw)*67,43+pitch*15,Math.cos(yaw)*67-5);lookGoal.set(-2,3,-8);
    }else if(mode==='first'){
      camGoal.copy(position).add(new THREE.Vector3(0,1.82,0));lookGoal.copy(camGoal).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(15));
    }else{
      camGoal.copy(position).add(new THREE.Vector3(-Math.sin(yaw)*followDistance,3.7+pitch*6,Math.cos(yaw)*followDistance));lookGoal.copy(position).add(new THREE.Vector3(Math.sin(yaw)*3,1.75,-Math.cos(yaw)*3));
      cameraOrigin.copy(position).add(new THREE.Vector3(0,1.65,0));cameraDirection.copy(camGoal).sub(cameraOrigin);const distance=cameraDirection.length();cameraRay.set(cameraOrigin,cameraDirection.normalize());cameraRay.far=distance;const obstacle=cameraRay.intersectObjects(cameraObstacles,false)[0];if(obstacle)camGoal.copy(cameraOrigin).addScaledVector(cameraDirection,Math.max(.55,obstacle.distance-.3));
    }
    camera.position.lerp(camGoal,t);camTarget.lerp(lookGoal,t);camera.lookAt(camTarget);
  }
  function setCamera(next){if(!['third','first','overview'].includes(next))return;mode=next;pitch=next==='first'?.015:.23;keys.clear();touches.clear();onCamera?.(mode);updateCamera(.016,true);}
  function setLight(next) {
    light=next;
    const presets={golden:{color:'#ffdcab',power:3.1,sky:.9,env:.9,fill:.9,position:[-35,32,24],fog:'#e4d7c0',lamps:0,exposure:.94},day:{color:'#fff3dc',power:3.7,sky:1.1,env:1.05,fill:1.3,position:[-15,75,12],fog:'#d8e3dd',lamps:0,exposure:.94},blue:{color:'#a8bce7',power:.25,sky:.035,env:.25,fill:.35,position:[-35,18,24],fog:'#435571',lamps:45,exposure:.85}};
    const p=presets[next]||presets.golden;sunlight.color.set(p.color);sunlight.intensity=p.power;sunlight.position.set(...p.position);fill.intensity=p.fill*.5;scene.background=dayHDR;scene.environment=next==='blue'?environment.texture:dayEnvironment.texture;scene.backgroundIntensity=p.sky;scene.environmentIntensity=p.env*.75;scene.fog.color.set(p.fog);renderer.toneMappingExposure=p.exposure;glowLights.forEach(l=>l.intensity=p.lamps);waters.forEach(w=>{w.material.uniforms.sunColor.value.set(p.color).multiplyScalar(next==='blue'?.12:1);w.material.uniforms.sunDirection.value.copy(sunlight.position).normalize();});
  }
  function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;size=[Math.round(r.width),Math.round(r.height)];const dpr=Math.min(devicePixelRatio||1,quality==='high'?2:quality==='performance'?1:1.4);renderer.setPixelRatio(dpr);renderer.setSize(...size,false);composer.setPixelRatio(dpr);composer.setSize(...size);camera.aspect=size[0]/size[1];camera.updateProjectionMatrix();}
  function setQuality(next){quality=next;renderer.shadowMap.enabled=next!=='performance';bloom.enabled=ao.enabled=next!=='performance';sunlight.shadow.mapSize.set(next==='high'?2048:1024,next==='high'?2048:1024);sunlight.shadow.map?.dispose();sunlight.shadow.map=null;resize();}
  const keyMap={KeyW:'forward',ArrowUp:'forward',KeyS:'backward',ArrowDown:'backward',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'run',ShiftRight:'run'};
  function keydown(event){if(!active||disposed||document.activeElement!==canvas)return;if(keyMap[event.code]){event.preventDefault();keys.add(keyMap[event.code]);if(tour){tour=false;lastLocation='';}}if(!event.repeat&&event.code==='KeyV')setCamera({third:'first',first:'overview',overview:'third'}[mode]);if(!event.repeat&&event.code==='KeyE')interact();if(!event.repeat&&event.code==='KeyQ')wave();}
  function keyup(event){keys.delete(keyMap[event.code]);}
  function clearInput(){keys.clear();touches.clear();dragging=null;}
  function down(event){if(!active||event.button>0)return;canvas.focus({preventScroll:true});dragging={id:event.pointerId,x:event.clientX,y:event.clientY,sx:event.clientX,sy:event.clientY,moved:0};canvas.setPointerCapture(event.pointerId);}
  function motion(event){if(!active||!dragging)return;const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;yaw+=dx*.004;pitch=clamp(pitch+dy*.003,mode==='first'?-.65:0,mode==='first'?.65:.8);dragging.moved+=Math.abs(dx)+Math.abs(dy);dragging.x=event.clientX;dragging.y=event.clientY;}
  const raycaster=new THREE.Raycaster();
  function up(event){if(!dragging)return;if(dragging.moved<6&&event.type==='pointerup'){const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera);const hit=raycaster.intersectObjects(scene.children.filter(o=>o!==guideRoot&&!waters.includes(o)),true).find(h=>h.object.material!==glass&&h.object.material!==spray&&h.object.material!==grassMat);if(hit?.object.userData.exhibit)onArtifact?.(hit.object.userData.exhibit);}if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);dragging=null;}
  function wheel(event){if(!active)return;event.preventDefault();followDistance=clamp(followDistance+event.deltaY*.013,5,19);}
  function wave(){gestureUntil=time+2;animation('Wave',true);}
  function interact(){const nearest=EXHIBITS.map(e=>({e,d:exhibitDistance(e)})).sort((a,b)=>a.d-b.d)[0];if(nearest.d<7)onArtifact?.(nearest.e);}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;clock.stop();clearInput();}
  function resume(){if(active&&!document.hidden&&!disposed&&!frame){clock.start();frame=requestAnimationFrame(tick);}}
  function visibility(){if(document.hidden)stop();else resume();}
  function tick(){frame=0;if(!active||disposed||document.hidden)return;frame=requestAnimationFrame(tick);const raw=clock.getDelta(),delta=Math.min(raw,.06);time+=delta;wind.value=time;waters.forEach(w=>w.material.uniforms.time.value=time*(w===pool?.3:.6));floating.position.y=4.2+Math.sin(time*.55)*.15;floating.rotation.y=.3+Math.sin(time*.12)*.15;move(delta);updateCamera(delta);composer.render(delta);fpsFrames++;fpsTime+=raw;
    if(time-lastStats>.65){lastStats=time;onStats?.({fps:Math.round(fpsFrames/Math.max(.01,fpsTime)),drawCalls:renderer.info.render.calls,trees:treePositions.length,position:{x:position.x,z:position.z},heading,tour,light,quality});fpsFrames=0;fpsTime=0;}
  }
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',motion);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('blur',clearInput);
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',visibility);
  const observer=new ResizeObserver(resize);observer.observe(canvas);scene.updateMatrixWorld(true);setQuality('balanced');setLight('golden');setCamera('third');resize();updateCamera(.016,true);
  onProgress?.('场景准备完成');
  return {
    setActive(value){active=Boolean(value);if(active){resize();resume();}else stop();},setCamera,setLight,setQuality,wave,interact,
    startTour(){tour=!tour;if(tour){position.set(0,1.86,19);tourIndex=0;tourWait=0;setCamera('third');}lastLocation='';return tour;},
    visit(id){const e=EXHIBITS.find(x=>x.id===id);if(!e)return;tour=false;position.set(e.arrival[0],1.86,e.arrival[1]);yaw=Math.atan2(e.position[0]-position.x,-(e.position[1]-position.z));heading=Math.atan2(e.position[0]-position.x,e.position[1]-position.z);setCamera('third');lastLocation='';onArtifact?.(e);},
    reset(){tour=false;position.set(0,1.86,19);yaw=.14;heading=Math.PI;setCamera('third');lastLocation='';},
    setMovement(direction,pressed){if(!active)return;if(pressed){tour=false;touches.add(direction);}else touches.delete(direction);},
    destroy(){
      if(disposed)return;disposed=true;active=false;stop();observer.disconnect();mixer.stopAllAction();mixer.uncacheRoot(guide);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',motion);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('blur',clearInput);
      window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clearInput);document.removeEventListener('visibilitychange',visibility);
      const gs=new Set(),ms=new Set(),ts=new Set(),skeletons=new Set();
      scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));});
      ms.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)ts.add(v);m.dispose();});gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());
      hdr.dispose();dayHDR.dispose();environment.dispose();dayEnvironment.dispose();waterNormals.dispose();waters.forEach(w=>w.material.uniforms.mirrorSampler.value?.dispose());
      ao.dispose();bloom.dispose();output.dispose();composer.dispose();sunlight.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
    },
  };
}
