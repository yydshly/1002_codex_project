import * as THREE from 'three';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { RGBELoader } from './vendor/addons/loaders/RGBELoader.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/addons/utils/BufferGeometryUtils.js';
import { createTerrainField, landGeometry, horizontalPolygon, shoreRibbon, worldPoint, contains, edgeDistance, smooth } from './terrain.js';
import { fitAssetBounds } from '../asset-generation-core.js';
import { createWorldEnvironment, createCoastalWaterMaterial, createShoreWash } from './world-environment.js';
import { createDetailedTerrainField } from './world-terrain.js';
import { validateCompletionRecipe } from '../scene-completion-core.js';

const asset = path => new URL(`./assets/${path}`, import.meta.url).href;
function seeded(seed=1741) {return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function entitySeed(id,seed=1741){for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;return seed;}
function makeTexture(kind) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const context=canvas.getContext('2d'),pixels=context.createImageData(128,256),random=seeded();
  for(let y=0;y<256;y++)for(let x=0;x<128;x++) {
    const at=(y*128+x)*4,noise=random()*25,ring=kind==='bark'?(y%19<3?-23:0):0;
    const base=kind==='bark'?[116,91,67]:[55,100,43];
    const ridge=kind==='bark'?Math.sin(x*.8)*8:Math.abs(x-64)<2?22:Math.sin(y*.6+x*.8)*8;
    for(let i=0;i<3;i++)pixels.data[at+i]=base[i]+noise+ring+ridge;
    pixels.data[at+3]=255;
  }
  context.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
function mesh(geometry,material,parent,position=[0,0,0],cast=true) {
  const object=new THREE.Mesh(geometry,material);object.position.set(...position);object.castShadow=cast;object.receiveShadow=true;parent.add(object);return object;
}
function box(parent,material,w,h,d,x,y,z) {return mesh(new THREE.BoxGeometry(w,h,d),material,parent,[x,y,z]);}
function rod(parent,material,a,b,radius=.045,segments=8) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
  const object=mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),segments),material,parent,start.clone().add(end).multiplyScalar(.5).toArray());
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;
}
function polygonMesh(parent,material,positions,indices,uv) {
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);if(uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return mesh(geometry,material,parent);
}
function consolidate(group) {
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map(),original=[];
  group.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material))return;
    const geometry=(object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone());
    geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    const key=object.material;
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geometry);original.push(object.geometry);
  });
  group.clear();for(const [material,geometries] of batches){const geometry=mergeGeometries(geometries,false);if(geometry)mesh(geometry,material,group);geometries.forEach(g=>g.dispose());}original.forEach(g=>g.dispose());return group;
}
function makeSky(worldSize) {
  const uniforms={top:{value:new THREE.Color(0x79b6e2)},horizon:{value:new THREE.Color(0xd1e5e9)},sunDirection:{value:new THREE.Vector3(-55,95,-35).normalize()},warm:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:'varying vec3 vSkyPosition;void main(){vSkyPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDirection;uniform float warm;varying vec3 vSkyPosition;void main(){vec3 direction=normalize(vSkyPosition-cameraPosition);float altitude=max(0.0,direction.y);vec3 color=mix(horizon,top,smoothstep(0.0,.65,altitude));float halo=pow(max(0.0,dot(direction,sunDirection)),64.0);float disc=smoothstep(.99994,.999985,dot(direction,sunDirection));color+=vec3(.09,.074,.04)*halo+vec3(1.8,1.65,1.2)*disc;gl_FragColor=vec4(color,1.0);#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  });
  const object=new THREE.Mesh(new THREE.SphereGeometry(worldSize*5,40,20),material);object.renderOrder=-1;return object;
}
function makeCabin(entity,materials) {
  const group=new THREE.Group(),h=entity.height,sy=h/7;
  const {plaster,wood,trim,glass,roof,metal}=materials;
  box(group,plaster,8,.25,7.2,0,.12,0);box(group,plaster,7.8,4.3,6.5,0,2.4,-.3);
  box(group,wood,8.8,.18,9.1,0,.35,.4);
  const gable=[-3.9,4.55,-3.6,3.9,4.55,-3.6,0,6.55,-3.6,-3.9,4.55,2.96,3.9,4.55,2.96,0,6.55,2.96];
  polygonMesh(group,plaster,gable,[0,2,1,3,4,5]);
  for(const side of [-1,1]) {
    const panel=box(group,roof,5.12,.12,8.2,side*2.16,5.46,-.28);panel.rotation.z=-side*.435;
    box(group,wood,.17,.22,8.45,side*4.38,4.5,-.25);
    for(let j=0;j<13;j++) {
      const x=side*(j+.5)*.337,y=6.47-Math.abs(x)*.46;
      const tile=mesh(new THREE.CylinderGeometry(.145,.145,8.2,8,1,false,0,Math.PI),roof,group,[x,y,-.28]);
      tile.rotation.x=Math.PI/2;tile.rotation.y=side*.42;
    }
    for(const z of [-3.9,3.7])rod(group,wood,[0,6.62,z],[side*4.55,4.5,z],.09);
  }
  rod(group,roof,[0,6.65,-4.2],[0,6.65,3.9],.14,12);
  const window=(x,y,z,ry=0)=>{
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.rotation.y=ry;group.add(frame);
    box(frame,wood,1.69,1.83,.1,0,0,0);box(frame,glass,1.48,1.62,.12,0,0,.07);
    for(const dx of [-.76,0,.76])box(frame,trim,.055,1.72,.17,dx,0,.15);
    for(const dy of [-.86,0,.86])box(frame,trim,1.59,.055,.18,0,dy,.15);
    box(frame,trim,1.9,.09,.37,0,-.96,.1);
    for(const side of [-1,1]) {
      box(frame,wood,.4,1.83,.13,side*1.06,0,0);
      for(let k=0;k<9;k++)box(frame,trim,.32,.028,.14,side*1.06,-.69+k*.17,.09);
    }
  };
  for(const x of [-2.5,2.5])window(x,2.65,2.99);
  for(const z of [-1.9,1.2]){window(3.94,2.65,z,Math.PI/2);window(-3.94,2.65,z,-Math.PI/2);}
  box(group,wood,1.35,2.93,.15,0,1.92,3.015);
  for(const x of [-.74,.74])box(group,trim,.11,3.06,.2,x,1.92,3.08);
  box(group,trim,1.6,.14,.23,0,3.52,3.08);
  for(const x of [-.34,.34])for(const y of [1.18,2.34])box(group,wood,.5,.87,.08,x,y,3.13);
  mesh(new THREE.SphereGeometry(.065,10,8),metal,group,[.47,1.93,3.16]);
  for(let i=0;i<11;i++)box(group,wood,.74,.025,1.75,-4+i*.8,.46,4);
  for(const x of [-4.08,4.08]){
    box(group,wood,.14,4.17,.14,x,2.4,4.54);
    for(const z of [3.2,3.7,4.25,4.65])box(group,trim,.085,1.13,.085,x,1.05,z);
    box(group,trim,.1,.11,1.8,x,1.67,3.96);
  }
  for(const side of [-1,1]){
    box(group,trim,2.6,.13,.13,side*2.65,1.65,4.75);
    for(let i=0;i<7;i++)box(group,trim,.065,1.07,.065,side*(1.42+i*.44),1.1,4.75);
  }
  for(let i=0;i<3;i++)box(group,wood,1.9,.16,1-i*.18,0,.13+i*.13,5.2-i*.25);
  // Fascia and gutters give the roof an architectural edge at close viewing distance.
  for(const side of [-1,1])rod(group,metal,[side*4.42,4.47,-4.2],[side*4.42,4.47,3.8],.06);
  group.scale.y=sy;return group;
}
function makeLighthouse(entity,materials,look=null) {
  const group=new THREE.Group(),h=entity.height,{plaster,trim,roof,glass,metal,wood}=materials;
  mesh(new THREE.CylinderGeometry(3.1,3.4,.36,48),materials.stone,group,[0,.18,0]);
  const wall=look?.treatment==='striped-lighthouse'?plaster.clone():plaster;
  if(look?.treatment==='striped-lighthouse'){
    wall.onBeforeCompile=shader=>{
      shader.uniforms.uStripeColor={value:new THREE.Color(look.accentColor)};shader.uniforms.uTowerHeight={value:h};
      shader.vertexShader='varying float vTowerBand;uniform float uTowerHeight;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTowerBand=(position.y+uTowerHeight*.39+.3)/uTowerHeight;');
      shader.fragmentShader='varying float vTowerBand;uniform vec3 uStripeColor;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat stripe=max(max(1.0-smoothstep(.045,.049,abs(vTowerBand-.22)),1.0-smoothstep(.045,.049,abs(vTowerBand-.41))),1.0-smoothstep(.045,.049,abs(vTowerBand-.60)));diffuseColor.rgb=mix(diffuseColor.rgb,uStripeColor,stripe);');
    };wall.customProgramCacheKey=()=> 'controlled-lighthouse-stripes-v1';
  }
  mesh(new THREE.CylinderGeometry(1.62,2.37,h*.78,56,12),wall,group,[0,h*.39+.3,0]);
  for(let i=0;i<4;i++)mesh(new THREE.TorusGeometry(2.35-i*.17,.038,5,48),trim,group,[0,h*.18+i*h*.14,0]).rotation.x=Math.PI/2;
  mesh(new THREE.CylinderGeometry(2.28,2.18,.33,48),trim,group,[0,h*.79,0]);
  mesh(new THREE.CylinderGeometry(1.46,1.46,h*.095,36),glass,group,[0,h*.855,0]);
  mesh(new THREE.CylinderGeometry(2,2,.12,48),metal,group,[0,h*.91,0]);
  mesh(new THREE.ConeGeometry(2.09,h*.077,48),roof,group,[0,h*.947,0]);
  rod(group,metal,[0,h*.975,0],[0,h*1.03,0],.065);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6,x=Math.cos(a),z=Math.sin(a);
    rod(group,metal,[x*1.44,h*.81,z*1.44],[x*1.44,h*.907,z*1.44],.045);
    rod(group,metal,[x*2.15,h*.799,z*2.15],[x*2.15,h*.842,z*2.15],.032);
  }
  mesh(new THREE.TorusGeometry(2.15,.045,8,48),metal,group,[0,h*.843,0]).rotation.x=Math.PI/2;
  const lampMaterial=new THREE.MeshStandardMaterial({color:0xffe6b6,emissive:0xffb761,emissiveIntensity:.65,roughness:.3});
  mesh(new THREE.CylinderGeometry(.29,.4,.75,24),lampMaterial,group,[0,h*.855,0]);
  const front=(y,r,angle)=>{
    const g=new THREE.Group();g.position.set(Math.sin(angle)*r,y,Math.cos(angle)*r);g.rotation.y=angle;group.add(g);
    box(g,trim,.76,1.2,.15,0,0,0);box(g,glass,.54,.97,.17,0,0,.1);box(g,trim,.037,.98,.19,0,0,.17);
  };
  front(h*.34,2.1,0);front(h*.54,1.94,Math.PI*.6);front(h*.68,1.79,-Math.PI*.4);
  box(group,wood,1.07,2.05,.25,0,1.3,2.39);box(group,trim,1.27,.15,.27,0,2.36,2.42);
  for(let i=0;i<3;i++)box(group,materials.stone,1.5,.15,1.2-i*.22,0,.13+i*.12,2.9-i*.22);
  return group;
}
function makePalm(entity,materials,random,look=null) {
  const group=new THREE.Group(),h=entity.height,lean=(random()-.5)*(look?.treatment==='slender-palm'?.8:1.8);
  const trunk=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(lean*.5,h*.33,.12),new THREE.Vector3(lean,h*.73,-.1),new THREE.Vector3(lean*.9,h*.91,0)]);
  mesh(new THREE.TubeGeometry(trunk,30,.18,9,false),materials.bark,group);
  for(let i=0;i<18;i++) {
    const p=trunk.getPoint((i+1)/20);const ring=mesh(new THREE.TorusGeometry(.185,.025,4,10),materials.bark,group,p.toArray());ring.rotation.x=Math.PI/2;
  }
  const top=trunk.getPoint(1),positions=[],uv=[],colors=[];
  function vertex(p,u,v,color){positions.push(p.x,p.y,p.z);uv.push(u,v);colors.push(color.r,color.g,color.b);}
  const fronds=look?9+Math.round(look.density*7):13;
  for(let f=0;f<fronds;f++) {
    const angle=f*Math.PI*2/fronds+random()*.2,dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const side=new THREE.Vector3(-dir.z,0,dir.x),length=3.7+random()*1.6;
    const droop=f<4?-1.8:-.3-random()*1.9;
    const path=new THREE.CatmullRomCurve3([top.clone(),top.clone().add(dir.clone().multiplyScalar(length*.38)).add(new THREE.Vector3(0,1.1,0)),top.clone().add(dir.clone().multiplyScalar(length*.8)).add(new THREE.Vector3(0,.25,0)),top.clone().add(dir.clone().multiplyScalar(length)).add(new THREE.Vector3(0,droop,0))]);
    mesh(new THREE.TubeGeometry(path,13,.018,4,false),materials.leafStem,group);
    for(let i=0;i<29;i++)for(const sign of [-1,1]) {
      const t=.1+i*.029,p=path.getPoint(t),tangent=path.getTangent(t),len=Math.sin(t*Math.PI)*(.81+random()*.31),width=.052*(.45+Math.sin(t*Math.PI));
      const mid=p.clone().add(side.clone().multiplyScalar(sign*len*.58)).add(tangent.clone().multiplyScalar(.10)).add(new THREE.Vector3(0,-.14,0));
      const tip=p.clone().add(side.clone().multiplyScalar(sign*len)).add(tangent.clone().multiplyScalar(.28)).add(new THREE.Vector3(0,-.25-len*.19,0));
      const left=mid.clone().add(tangent.clone().multiplyScalar(width)),right=mid.clone().add(tangent.clone().multiplyScalar(-width));
      const color=new THREE.Color().setHSL(.24+random()*.025,.40+random()*.22,.25+random()*.14);
      for(const [v,u,w] of [[p,0,.5],[left,.5,0],[tip,1,.5],[p,0,.5],[tip,1,.5],[right,.5,1]])vertex(v,u,w,color);
    }
  }
  const foliage=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)).setAttribute('color',new THREE.Float32BufferAttribute(colors,3));foliage.computeVertexNormals();
  mesh(foliage,materials.leaves,group);
  for(let i=0;i<4;i++)mesh(new THREE.SphereGeometry(.16,9,7),materials.bark,group,[top.x+Math.cos(i*1.9)*.24,top.y-.15,Math.sin(i*1.9)*.24]);
  return group;
}
function makeBoat(entity,materials,look=null) {
  const group=new THREE.Group(),sections=14,positions=[],indices=[],uv=[];
  for(let i=0;i<=sections;i++) {
    const t=i/sections,z=(t-.5)*7.4,width=.97*Math.pow(Math.sin(t*Math.PI),.54)+.04;
    const ring=[[-width,.5],[-width*.82,-.23],[0,-.53],[width*.82,-.23],[width,.5]];
    for(const [x,y] of ring){positions.push(x,y,z);uv.push(i/3,x);}
    if(i<sections)for(let j=0;j<4;j++){const a=i*5+j,b=a+5;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  polygonMesh(group,materials.hull,positions,indices,uv);
  box(group,materials.wood,1.45,.085,3.9,0,.46,.25);
  for(const z of [-1.15,.45,1.9])box(group,materials.wood,1.68,.15,.4,0,.68,z);
  for(const side of [-1,1]) {
    const points=[];for(let i=0;i<=sections;i++){const t=i/sections;points.push(new THREE.Vector3(side*(.97*Math.pow(Math.sin(t*Math.PI),.54)+.04),.52,(t-.5)*7.4));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.055,7,false),materials.metal,group);
  }
  if(look?.treatment!=='rowing-boat'){
    box(group,materials.trim,.78,.8,1.15,0,.85,.45);box(group,materials.glass,.73,.27,.09,0,1.2,-.11);
    for(const x of [-.72,.72])for(const z of [-.2,1.6])rod(group,materials.metal,[x,.55,z],[x,1.77,z],.035);
    box(group,materials.canopy,1.67,.075,2.1,0,1.81,.7);
  }else for(const side of [-1,1])rod(group,materials.wood,[side*.4,.75,-1.2],[side*1.65,.55,1.8],.045);
  mesh(new THREE.TorusGeometry(.26,.066,9,20),materials.trim,group,[.72,.6,-1.8]).rotation.x=Math.PI/2;
  group.scale.y=Math.min(1.3,Math.max(.6,entity.height/2));return group;
}
function terrainMaterial(textures, detailed=false, tints=null) {
  const material=new THREE.MeshStandardMaterial({map:textures.sand.diff,normalMap:textures.sand.normal,roughnessMap:textures.sand.rough,roughness:1,normalScale:new THREE.Vector2(.62,.62),color:0xffffff});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uGrassMap={value:textures.grass.diff||textures.sand.diff};shader.uniforms.uRockMap={value:textures.rock.diff||textures.sand.diff};
    shader.uniforms.uGrassNormal={value:textures.grass.normal||textures.sand.normal};shader.uniforms.uRockNormal={value:textures.rock.normal||textures.sand.normal};
    shader.uniforms.uGrassRough={value:textures.grass.rough||textures.sand.rough};shader.uniforms.uRockRough={value:textures.rock.rough||textures.sand.rough};
    shader.vertexShader='attribute vec3 biome; varying vec3 vBiome; varying vec3 vTerrainPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBiome=biome;vTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader='uniform sampler2D uGrassMap; uniform sampler2D uRockMap; uniform sampler2D uGrassNormal; uniform sampler2D uRockNormal; uniform sampler2D uGrassRough; uniform sampler2D uRockRough; varying vec3 vBiome; varying vec3 vTerrainPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec4 sandColor=texture2D(map,vMapUv);vec4 grassColor=texture2D(uGrassMap,vMapUv*1.8);grassColor.rgb*=vec3(.68,1.16,.54);vec4 rockColor=texture2D(uRockMap,vMapUv*.5);diffuseColor*=mix(mix(sandColor,grassColor,clamp(vBiome.x,0.0,1.0)),rockColor,vBiome.y);diffuseColor.rgb*=mix(1.0,.71,vBiome.z);`);
    if(detailed){
      shader.vertexShader=shader.vertexShader.replace('vTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz;','vTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz;float terrainPatch=(sin(vTerrainPosition.x*.19+sin(vTerrainPosition.z*.23)*1.6)*sin(vTerrainPosition.z*.24+sin(vTerrainPosition.x*.11))+1.0)*.5;vBiome.x*=.48+.52*smoothstep(.16,.8,terrainPatch);');
      shader.fragmentShader=shader.fragmentShader.replace('grassColor.rgb*=vec3(.68,1.16,.54);','grassColor.rgb*=vec3(.73,1.05,.65);').replace('diffuseColor.rgb*=mix(1.0,.71,vBiome.z);','diffuseColor.rgb*=mix(1.0,.78,vBiome.z);diffuseColor.rgb*=.93+.07*sin(vTerrainPosition.x*.27+sin(vTerrainPosition.z*.39))*sin(vTerrainPosition.z*.22);');
    }
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#ifdef USE_NORMALMAP_TANGENTSPACE\nvec3 mapN=mix(mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(uGrassNormal,vNormalMapUv*1.8).xyz,vBiome.x),texture2D(uRockNormal,vNormalMapUv*.5).xyz,vBiome.y)*2.0-1.0;mapN.xy*=normalScale;normal=normalize(tbn*mapN);\n#endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=roughness;\n#ifdef USE_ROUGHNESSMAP\nroughnessFactor*=mix(mix(texture2D(roughnessMap,vRoughnessMapUv).g,texture2D(uGrassRough,vRoughnessMapUv*1.8).g,vBiome.x),texture2D(uRockRough,vRoughnessMapUv*.5).g,vBiome.y);\n#endif`);
  };
  const originalCompile=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    originalCompile(shader);
    if(tints){
      shader.uniforms.uControlSand={value:new THREE.Color(tints.sand)};shader.uniforms.uControlGrass={value:new THREE.Color(tints.grass)};shader.uniforms.uControlRock={value:new THREE.Color(tints.rock)};
      shader.fragmentShader='uniform vec3 uControlSand;uniform vec3 uControlGrass;uniform vec3 uControlRock;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('diffuseColor*=mix(mix(sandColor,grassColor,','sandColor.rgb*=uControlSand;grassColor.rgb*=uControlGrass;rockColor.rgb*=uControlRock;diffuseColor*=mix(mix(sandColor,grassColor,');
    }
  };
  material.customProgramCacheKey=()=> `coastal-terrain-pbr-v2-${detailed}-${Boolean(tints)}`;return material;
}
function waterMaterial() {
  const material=new THREE.MeshPhysicalMaterial({color:0x16808b,roughness:.26,metalness:.015,clearcoat:.38,clearcoatRoughness:.22,transparent:true,opacity:.88,depthWrite:false});
  const time={value:0};material.userData.time=time;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWaterTime=time;
    shader.vertexShader='uniform float uWaterTime;varying vec3 vWaterPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvWaterPosition=(modelMatrix*vec4(position,1.0)).xyz;vec2 waterQ=vWaterPosition.xz;transformed.y+=.065*sin(dot(waterQ,vec2(.91,.41))*.47+uWaterTime*.8)+.045*sin(dot(waterQ,vec2(-.33,.94))*.71-uWaterTime*1.09)+.023*sin(dot(waterQ,vec2(.57,-.82))*1.21+uWaterTime*.72);`);
    shader.fragmentShader='uniform float uWaterTime;varying vec3 vWaterPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>\nvec2 waterQ=vWaterPosition.xz;vec2 slope=.075*vec2(.91,.41)*cos(dot(waterQ,vec2(.91,.41))*.47+uWaterTime*.8)+.067*vec2(-.33,.94)*cos(dot(waterQ,vec2(-.33,.94))*.71-uWaterTime*1.09)+.046*vec2(.57,-.82)*cos(dot(waterQ,vec2(.57,-.82))*1.21+uWaterTime*.72)+.028*vec2(-.83,-.55)*cos(dot(waterQ,vec2(-.83,-.55))*2.13-uWaterTime*1.31)+.023*vec2(.17,.99)*cos(dot(waterQ,vec2(.17,.99))*3.77+uWaterTime*.94);vec3 waveNormal=normalize(vec3(-slope.x,1.0,-slope.y));normal=normalize((viewMatrix*vec4(waveNormal,0.0)).xyz);`);
  };
  material.customProgramCacheKey=()=> 'coastal-water-v1';return material;
}

function disposeAssetTree(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]) {
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());
}
function inspectLoadedAsset(root) {
  const materials=new Set(),textures=new Set(),materialTypes=new Set();let meshCount=0,triangles=0,vertices=0;
  root.updateMatrixWorld(true);
  root.traverse(object=>{
    if(!object.isMesh)return;
    const positions=object.geometry?.getAttribute('position');
    if(!positions||positions.itemSize!==3||positions.count<3)throw new Error('生成资产含有空网格或无效顶点。');
    for(let i=0;i<positions.count;i++)if(!Number.isFinite(positions.getX(i))||!Number.isFinite(positions.getY(i))||!Number.isFinite(positions.getZ(i)))throw new Error('生成资产包含非有限顶点。');
    for(const value of object.matrixWorld.elements)if(!Number.isFinite(value))throw new Error('生成资产变换矩阵无效。');
    const indices=object.geometry.index;if(indices&&indices.count%3!==0)throw new Error('生成资产三角形索引不完整。');
    if(indices)for(let i=0;i<indices.count;i++){const value=indices.getX(i);if(!Number.isInteger(value)||value<0||value>=positions.count)throw new Error('生成资产索引超出顶点范围。');}
    meshCount++;vertices+=positions.count;triangles+=(indices?indices.count:positions.count)/3;
    if(vertices>2000000||triangles>2000000)throw new Error('生成资产超过当前预览的网格大小限制。');
    object.castShadow=true;object.receiveShadow=true;
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]) {
      materials.add(material);materialTypes.add(material.type);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  if(!meshCount||!triangles)throw new Error('生成资产没有可显示的三角形网格。');
  return {meshCount,triangles,vertices,materials:materials.size,textures:textures.size,materialTypes:[...materialTypes]};
}
function acceptedAssetUrl(value) {
  if(typeof value!=='string'||!value.trim())throw new Error('GLB 地址无效。');
  const url=value.trim();
  if(/^data:(?:model\/gltf-binary|application\/octet-stream|application\/gltf-buffer);base64,[A-Za-z0-9+/]+={0,2}$/u.test(url)) {
    if(url.length>80*1024*1024)throw new Error('内嵌 GLB 超过当前预览大小限制。');return url;
  }
  const parsed=new URL(url,location.href);
  if(parsed.username||parsed.password||!['https:','http:','blob:'].includes(parsed.protocol)||(parsed.protocol==='http:'&&parsed.origin!==location.origin))throw new Error('GLB 须使用站内路径、HTTPS、当前页面的 Blob 或有效 GLB 数据。');
  if(parsed.protocol==='blob:'&&parsed.origin!==location.origin)throw new Error('GLB Blob 来自其他页面来源。');
  return url;
}

export async function createRealisticScene({canvas,plan,onProgress=()=>{},mode='realistic',completionRecipe=null,onSelect=null}) {
  // The plan is read-only input. Assets add visual detail; no authored footprint or centre is moved.
  const source=JSON.parse(JSON.stringify(plan)),warnings=[],loadedAssets=[];
  const completion=completionRecipe?validateCompletionRecipe(completionRecipe,source):null;
  const looks=new Map(completion?.objects.map(look=>[look.id,look])||[]);
  const getLook=entity=>entity.locked?null:looks.get(entity.id);
  const report=(stage,detail)=>onProgress({stage,detail,warnings:[...warnings]});
  report('renderer','初始化 Three.js WebGL 2 与物理材质');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),realistic=new THREE.Group(),coarse=new THREE.Group();scene.add(realistic,coarse);
  const field=createTerrainField(source),worldSize=Math.max(source.world.width,source.world.depth);
  const sky=makeSky(worldSize);scene.add(sky);
  scene.background=new THREE.Color(0xb7d2dc);scene.fog=new THREE.FogExp2(0xb7d2dc,.0018*200/worldSize);
  const camera=new THREE.PerspectiveCamera(48,1,.15,worldSize*12);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=3;controls.maxDistance=worldSize*3;controls.maxPolarAngle=Math.PI*.485;controls.target.set(0,3,0);
  const ambient=new THREE.HemisphereLight(0xddeeff,0x5f6140,1.0);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff1d7,3.1);sun.position.set(-55,95,-35);sun.castShadow=true;
  const shadowArea=Math.max(90,Math.min(500,worldSize*.6));sun.shadow.camera.left=-shadowArea;sun.shadow.camera.right=shadowArea;sun.shadow.camera.top=shadowArea;sun.shadow.camera.bottom=-shadowArea;sun.shadow.camera.near=1;sun.shadow.camera.far=Math.max(350,worldSize*2);sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;sun.shadow.radius=2;scene.add(sun,sun.target);
  const textureLoader=new THREE.TextureLoader(),gltfLoader=new GLTFLoader(),hdrLoader=new RGBELoader();
  const materialSets={};const textureKinds={sand:'coast_sand_01',grass:'grass_ground',rock:'rocky_terrain',plaster:'painted_plaster_wall',wood:'wood_floor'};
  report('materials','读取沙地、草地、岩石、灰泥与木材的真实 PBR 纹理');
  for(const [kind,id] of Object.entries(textureKinds)) {
    const results=await Promise.allSettled(['diff','nor_gl','rough'].map(async channel=>{
      const texture=await textureLoader.loadAsync(asset(`textures/${id}-${channel}.jpg`));texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(channel==='diff')texture.colorSpace=THREE.SRGBColorSpace;loadedAssets.push(`textures/${id}-${channel}.jpg`);return texture;
    }));
    const channels={};for(let i=0;i<results.length;i++){const r=results[i],key=['diff','normal','rough'][i];if(r.status==='fulfilled')channels[key]=r.value;else warnings.push(`${id} ${key} 加载失败，使用基础材质。`);}
    if(!channels.diff)channels.diff=makeTexture(kind==='wood'?'bark':'leaf');materialSets[kind]=channels;
  }
  const hdrs={};report('lighting','读取天空 HDR 环境与太阳阴影');
  const hdr=await Promise.allSettled(['day','sunset'].map(async name=>{const texture=await hdrLoader.loadAsync(asset(`environment/coastal-${name}.hdr`));texture.mapping=THREE.EquirectangularReflectionMapping;hdrs[name]=texture;loadedAssets.push(`environment/coastal-${name}.hdr`);}));
  for(let i=0;i<hdr.length;i++)if(hdr[i].status==='rejected')warnings.push(`${['日间','黄昏'][i]} HDR 加载失败。`);
  if(hdrs.day){scene.environment=hdrs.day;scene.backgroundBlurriness=.15;scene.backgroundIntensity=.85;scene.environmentIntensity=.8;}
  const worldEnvironment=createWorldEnvironment({scene,hdrs,worldSize});worldEnvironment.setVisible(false);
  const worldDetails=new THREE.Group();worldDetails.visible=false;realistic.add(worldDetails);
  const detailField=createDetailedTerrainField(source,field,{reliefById:completion?new Map(completion.objects.filter(e=>e.kind==='land').map(e=>[e.id,e.relief])):null});
  const qualitySurfaces=[],qualityGeometry=[],qualityGround=[],oldFoams=[],oldGrass=[],qualityMaterials=[];let worldQuality=false;
  const completionMaterials=[];
  const pbr=(kind,color,repeat=1)=>{
    const t=materialSets[kind];for(const value of Object.values(t))value.repeat.set(repeat,repeat);
    return new THREE.MeshStandardMaterial({color,map:t.diff,normalMap:t.normal,roughnessMap:t.rough,roughness:1,normalScale:new THREE.Vector2(.35,.35)});
  };
  const materials={
    plaster:pbr('plaster',0xeee4d0,1),wood:pbr('wood',0x95764e,1),stone:pbr('rock',0xb6aea0,1),
    trim:new THREE.MeshStandardMaterial({color:0xe6e8df,roughness:.58}),
    glass:new THREE.MeshPhysicalMaterial({color:0x35565e,roughness:.055,metalness:.24,clearcoat:1,transparent:true,opacity:.8}),
    roof:new THREE.MeshStandardMaterial({color:0x9a5942,roughness:.94,map:materialSets.rock.diff,bumpMap:materialSets.rock.rough,bumpScale:.045}),
    metal:new THREE.MeshStandardMaterial({color:0x454a46,metalness:.8,roughness:.39}),
    bark:new THREE.MeshStandardMaterial({map:makeTexture('bark'),roughness:.97,bumpMap:makeTexture('bark'),bumpScale:.04}),
    leafStem:new THREE.MeshStandardMaterial({color:0x526039,roughness:.95}),
    leaves:new THREE.MeshStandardMaterial({map:makeTexture('leaf'),vertexColors:true,roughness:.81,side:THREE.DoubleSide}),
    hull:new THREE.MeshStandardMaterial({color:0xe5e6dc,roughness:.43,side:THREE.DoubleSide}),
    canopy:new THREE.MeshStandardMaterial({color:0x294b62,roughness:.92})
  };
  function objectMaterials(entity){
    const look=getLook(entity);if(!look)return materials;
    const result={...materials};
    for(const key of ['plaster','wood','roof','trim','hull','canopy','leaves','leafStem','bark']){
      const original=materials[key];if(!original)continue;const material=original.clone();
      material.color.set(['roof','trim','canopy'].includes(key)?look.accentColor:look.materialColor);
      material.roughness=look.roughness;completionMaterials.push(material);result[key]=material;
    }
    if(look.treatment==='timber-cabin')result.plaster=result.wood;
    return result;
  }
  const originalLeafMap=materials.leaves.map;
  const landMat=terrainMaterial(materialSets),waterMat=waterMaterial(),detailedLandMat=terrainMaterial(materialSets,true);
  const oceanMat=createCoastalWaterMaterial({field,worldSize,kind:'ocean'});qualityMaterials.push(detailedLandMat,oceanMat);
  if(completion){oceanMat.color.set(completion.environment.waterColor);waterMat.color.set(completion.environment.waterColor);}
  const oceanGeometry=new THREE.PlaneGeometry(worldSize*12,worldSize*12,128,128);oceanGeometry.rotateX(-Math.PI/2);
  const ocean=mesh(oceanGeometry,waterMat,realistic,[0,-.08,0],false);qualitySurfaces.push({object:ocean,original:waterMat,detailed:oceanMat});
  mesh(new THREE.PlaneGeometry(worldSize*12,worldSize*12).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x418f9b,roughness:.9}),coarse,[0,-.08,0],false);
  const foamMaterial=new THREE.MeshBasicMaterial({color:0xf7ffef,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
  report('terrain','沿绘制轮廓形成海岸、地形与水域；保留对象中心');
  const subdivisions=field.lands.length>16?2:field.lands.length>7?3:4;
  for(const land of field.lands) {
    const look=getLook(land.entity),tints=look?{grass:new THREE.Color(look.materialColor).multiply(new THREE.Color(completion.environment.groundTint).lerp(new THREE.Color(0xffffff),.75)),sand:completion.environment.sandTint,rock:completion.environment.rockTint}:null;
    const originalMaterial=tints?terrainMaterial(materialSets,false,tints):landMat,detailMaterial=tints?terrainMaterial(materialSets,true,tints):detailedLandMat;
    if(tints)completionMaterials.push(originalMaterial,detailMaterial);
    const object=mesh(landGeometry(land,field,subdivisions),land.entity.locked?new THREE.MeshStandardMaterial({color:source.style.landColor,roughness:1}):originalMaterial,realistic);object.userData.sourceId=land.entity.id;
    if(!land.entity.locked){
      const geometry=landGeometry(land,detailField,subdivisions),biome=geometry.getAttribute('biome');
      if(look&&biome)for(let i=0;i<biome.count;i++){
        if(look.treatment==='rocky-coast'){biome.setY(i,Math.max(biome.getY(i),.7));biome.setX(i,biome.getX(i)*.35);}
        if(look.treatment==='meadow')biome.setX(i,Math.min(1,biome.getX(i)*1.3));
      }
      qualitySurfaces.push({object,original:originalMaterial,detailed:detailMaterial});qualityGeometry.push({object,original:object.geometry,detailed:geometry});
    }
    const simple=mesh(landGeometry(land,field,0,true),new THREE.MeshStandardMaterial({color:source.style.landColor,roughness:1}),coarse);simple.userData.sourceId=land.entity.id;
    if(!land.entity.locked){oldFoams.push(mesh(shoreRibbon(land.polygon,.09,.58),foamMaterial,realistic,[0,0,0],false));const wash=createShoreWash({polygon:land.polygon,level:.025,width:.34,seed:oldFoams.length});worldDetails.add(wash);qualityMaterials.push(wash.material);}
  }
  for(const water of field.waters) {
    const object=mesh(horizontalPolygon(water.polygon,water.level),waterMat,realistic,[0,0,0],false);object.userData.sourceId=water.entity.id;
    if(!water.entity.locked){const detailed=createCoastalWaterMaterial({field,worldSize,kind:'inland',polygon:water.polygon,level:water.level});const look=getLook(water.entity);if(look){detailed.color.set(look.materialColor);detailed.roughness=look.roughness*.3;}qualityMaterials.push(detailed);qualitySurfaces.push({object,original:waterMat,detailed});}
    mesh(horizontalPolygon(water.polygon,water.level),new THREE.MeshStandardMaterial({color:source.style.waterColor,roughness:.7}),coarse,[0,0,0],false);
    const foam=mesh(shoreRibbon(water.polygon,water.level+.075,.17),foamMaterial,realistic,[0,0,0],false);if(!water.entity.locked)oldFoams.push(foam);
  }
  const baseRandom=seeded(),random=baseRandom,boats=[];
  for(const entity of source.entities) {
    if(entity.kind==='land'||entity.kind==='water')continue;
    if(entity.kind==='road') {
      const vertices=[],indices=[],uv=[];
      for(let i=0;i<entity.points.length;i++) {
        const p=worldPoint(entity.points[i],source),before=worldPoint(entity.points[Math.max(0,i-1)],source),after=worldPoint(entity.points[Math.min(entity.points.length-1,i+1)],source);
        const dx=after.x-before.x,dz=after.z-before.z,length=Math.hypot(dx,dz)||1;
        for(const sign of [-1,1]){const x=p.x-sign*dz/length*1.25,z=p.z+sign*dx/length*1.25,water=field.waterAt(x,z),land=field.landAt(x,z);const y=(water?water.level:land?field.height(x,z):0)+Math.max(.075,entity.height);vertices.push(x,y,z);uv.push(sign<0?0:1,i*.6);}
        if(i<entity.points.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
      const look=getLook(entity),pathMaterial=pbr(look?.treatment==='timber-path'?'wood':look?.treatment==='stone-path'?'rock':'sand',look?.materialColor||0xcbbca2);
      if(look)pathMaterial.roughness=look.roughness;
      const path=polygonMesh(realistic,pathMaterial,vertices,indices,uv);path.userData.sourceId=entity.id;
      const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(geometry,new THREE.MeshStandardMaterial({color:0xcab691,side:THREE.DoubleSide}),coarse);
      continue;
    }
    const p=worldPoint(entity.points[0],source),water=field.waterAt(p.x,p.z),land=field.landAt(p.x,p.z);
    const ground=entity.kind==='boat'?(water?.level??0):field.support(p.x,p.z);
    const plain=new THREE.MeshStandardMaterial({color:entity.kind==='palm'?0x477d42:entity.kind==='boat'?0xd6e2df:0xe0cda8,roughness:1});
    let simple;
    if(entity.kind==='lighthouse')simple=mesh(new THREE.CylinderGeometry(1.9,2.25,entity.height,12),plain,coarse,[p.x,ground+entity.height/2,p.z]);
    else if(entity.kind==='palm'){
      const g=new THREE.Group();g.position.set(p.x,ground,p.z);coarse.add(g);mesh(new THREE.CylinderGeometry(.22,.25,entity.height*.83,7),plain,g,[0,entity.height*.415,0]);mesh(new THREE.ConeGeometry(4,entity.height*.22,7),plain,g,[0,entity.height*.85,0]);simple=g;
    }else simple=mesh(new THREE.BoxGeometry(entity.kind==='boat'?2:8,entity.height,entity.kind==='boat'?6:7),plain,coarse,[p.x,ground+entity.height/2,p.z]);
    simple.userData.sourceId=entity.id;
    let object;const look=getLook(entity),localMaterials=objectMaterials(entity),objectRandom=completion?seeded(entitySeed(entity.id,completion.environment.seed)):random;
    if(entity.locked)object=simple.clone(true);
    else if(entity.kind==='cabin')object=makeCabin(entity,localMaterials);
    else if(entity.kind==='lighthouse')object=makeLighthouse(entity,localMaterials,look);
    else if(entity.kind==='palm')object=makePalm(entity,localMaterials,objectRandom,look);
    else if(entity.kind==='boat')object=makeBoat(entity,localMaterials,look);
    if(object){
      if(look){
        object.rotation.y=THREE.MathUtils.degToRad(look.rotationDeg);object.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(object,true),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
        const limits={cabin:[8,7],lighthouse:[4.5,4.5],palm:[8,8],boat:[2,6]}[entity.kind];
        const fit=Math.min(limits[0]/Math.max(size.x,.001),limits[1]/Math.max(size.z,.001),Math.max(entity.height,.001)/Math.max(size.y,.001));
        const wrapper=new THREE.Group();wrapper.add(object);object.position.set(-centre.x*fit,-box.min.y*fit,-centre.z*fit);object.scale.multiplyScalar(fit);object=wrapper;
      }
      if(!entity.locked)consolidate(object);
      if(!entity.locked)object.position.set(p.x,ground,p.z);
      object.userData.sourceId=entity.id;object.userData.anchor={x:p.x,z:p.z};realistic.add(object);
      if(entity.kind==='boat'&&!entity.locked)boats.push({object,base:ground,phase:random()*6.28});
      if(entity.kind==='lighthouse'&&water)mesh(new THREE.CylinderGeometry(3.1,3.3,Math.max(.6,ground-water.level+.6),32),materials.stone,realistic,[p.x,water.level-.1,p.z]);
    }
  }
  report('assets','载入实拍扫描的岩石与草簇');
  const scanResults=await Promise.allSettled([
    gltfLoader.loadAsync(asset('models/rock_moss_set_01/rock_moss_set_01.gltf')),
    gltfLoader.loadAsync(asset('models/grass_bermuda_01/grass_bermuda_01.gltf'))
  ]);
  const avoid=(x,z,r=2)=>!!field.waterAt(x,z)||field.anchors.some(a=>Math.hypot(x-a.x,z-a.z)<a.radius+r);
  const roads=source.entities.filter(e=>e.kind==='road').map(e=>e.points.map(p=>worldPoint(p,source)));
  const nearRoad=(x,z)=>roads.some(points=>{for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<1.65)return true;}return false;});
  let rocksPlaced=0,grassPlaced=0,detailGrassPlaced=0;
  if(scanResults[0].status==='fulfilled') {
    const prototypes=[];scanResults[0].value.scene.updateMatrixWorld(true);scanResults[0].value.scene.traverse(o=>{if(o.isMesh)prototypes.push(o);});
    for(const land of field.lands.filter(l=>!l.entity.locked)){
      const random=completion?seeded(entitySeed(land.entity.id,completion.environment.seed)):baseRandom;
      for(let i=0;i<Math.min(12,land.polygon.length);i++) {
      const index=Math.floor(i*land.polygon.length/12),edge=land.polygon[index],center=land.polygon.reduce((a,p)=>({x:a.x+p.x/land.polygon.length,z:a.z+p.z/land.polygon.length}),{x:0,z:0});
      const p={x:THREE.MathUtils.lerp(edge.x,center.x,.07+random()*.06),z:THREE.MathUtils.lerp(edge.z,center.z,.07+random()*.06)};
      if(avoid(p.x,p.z)||!contains(p,land.polygon)||!prototypes.length)continue;
      const prototype=prototypes[i%prototypes.length],geometry=prototype.geometry.clone();geometry.applyMatrix4(prototype.matrixWorld);
      geometry.computeBoundingBox();const size=new THREE.Vector3();geometry.boundingBox.getSize(size);geometry.translate(-geometry.boundingBox.getCenter(new THREE.Vector3()).x,-geometry.boundingBox.min.y,-geometry.boundingBox.getCenter(new THREE.Vector3()).z);
      const object=mesh(geometry,prototype.material,realistic,[p.x,field.height(p.x,p.z)-.12,p.z]);qualityGround.push({object,original:object.position.y,detailed:detailField.height(p.x,p.z)-.12});const scale=(.8+random()*1.5)/Math.max(.001,size.y);object.scale.setScalar(scale);object.rotation.y=random()*Math.PI*2;rocksPlaced++;
    }
    }
    loadedAssets.push('models/rock_moss_set_01/rock_moss_set_01.gltf');
  }else warnings.push('实拍岩石扫描加载失败，未显示扫描岩石。');
  if(scanResults[1].status==='fulfilled') {
    const prototypes=[];scanResults[1].value.scene.updateMatrixWorld(true);scanResults[1].value.scene.traverse(o=>{if(o.isMesh)prototypes.push(o);});
    try {
      const mask=await textureLoader.loadAsync(asset('models/grass_bermuda_01/textures/grass_bermuda_01_alpha_1k.png'));
      mask.flipY=false;
      for(const prototype of prototypes)for(const material of Array.isArray(prototype.material)?prototype.material:[prototype.material]) {
        material.alphaMap=mask;material.alphaTest=.45;material.side=THREE.DoubleSide;material.transparent=false;material.needsUpdate=true;
      }
      loadedAssets.push('models/grass_bermuda_01/textures/grass_bermuda_01_alpha_1k.png');
    }catch {warnings.push('草簇透明遮罩加载失败，跳过草簇。');prototypes.length=0;}
    for(const land of field.lands.filter(l=>!l.entity.locked)) {
      const random=completion?seeded(entitySeed(land.entity.id,completion.environment.seed)):baseRandom;
      const minX=Math.min(...land.polygon.map(p=>p.x)),maxX=Math.max(...land.polygon.map(p=>p.x)),minZ=Math.min(...land.polygon.map(p=>p.z)),maxZ=Math.max(...land.polygon.map(p=>p.z)),points=[];
      for(let attempt=0;attempt<800&&points.length<100;attempt++) {const x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ);if(contains({x,z},land.polygon)&&edgeDistance({x,z},land.polygon)>4&&!avoid(x,z,.4)&&!nearRoad(x,z))points.push({x,z});}
      const cabinAnchor=field.anchors.find(a=>a.entity.kind==='cabin'&&contains(a,land.polygon));
      if(cabinAnchor)for(let attempt=0;attempt<150&&points.length<148;attempt++){const a=random()*6.28,r=8+random()*12,x=cabinAnchor.x+Math.cos(a)*r,z=cabinAnchor.z+Math.sin(a)*r;if(contains({x,z},land.polygon)&&edgeDistance({x,z},land.polygon)>4&&!avoid(x,z,.15)&&!nearRoad(x,z))points.push({x,z});}
      const commonTransforms=points.map(p=>({...p,rotation:random()*6.28,scale:2.0+random()*1.2}));
      for(let variant=0;variant<prototypes.length;variant++) {
        const prototype=prototypes[variant],geometry=prototype.geometry.clone().applyMatrix4(prototype.matrixWorld);geometry.computeBoundingBox();const size=new THREE.Vector3();geometry.boundingBox.getSize(size);const centre=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-centre.x,-geometry.boundingBox.min.y,-centre.z);
        const instances=new THREE.InstancedMesh(geometry,prototype.material,commonTransforms.length),dummy=new THREE.Object3D();instances.castShadow=true;instances.receiveShadow=true;
        commonTransforms.forEach((p,i)=>{const radius=.11+(variant%5)*.075,angle=variant*2.399+p.rotation,x=p.x+Math.cos(angle)*radius,z=p.z+Math.sin(angle)*radius;dummy.position.set(x,field.height(x,z)-.016,z);dummy.rotation.y=p.rotation+variant*.6;dummy.scale.setScalar(p.scale);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);});instances.instanceMatrix.needsUpdate=true;realistic.add(instances);oldGrass.push(instances);
      }
      if(prototypes.length)grassPlaced+=points.length;
      // Extra photographed grass is only shown in the whole-scene comparison.
      // A bounded count keeps the expanded scene usable on integrated GPUs.
      const detailPoints=[],detailLimit=completion?Math.round((cabinAnchor?900:280)*(getLook(land.entity)?.density??1)):cabinAnchor?900:280;
      for(let attempt=0;attempt<12000&&detailPoints.length<detailLimit;attempt++){
        let x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ);
        if(cabinAnchor&&random()<.66){const angle=random()*6.28,radius=9+Math.sqrt(random())*25;x=cabinAnchor.x+Math.cos(angle)*radius;z=cabinAnchor.z+Math.sin(angle)*radius;}
        const patch=(Math.sin(x*.19+Math.sin(z*.23)*1.6)*Math.sin(z*.24+Math.sin(x*.11))+1)*.5;
        if(random()>.18+patch*.8||!contains({x,z},land.polygon)||edgeDistance({x,z},land.polygon)<3.2||avoid(x,z,.25)||nearRoad(x,z))continue;
        detailPoints.push({x,z,rotation:random()*6.28,scale:2.8+random()*1.8});
      }
      const tallGrass=prototypes.map(prototype=>({prototype,height:new THREE.Box3().setFromObject(prototype,true).getSize(new THREE.Vector3()).y})).sort((a,b)=>b.height-a.height).slice(0,8);
      for(let variant=0;variant<tallGrass.length;variant++){
        const prototype=tallGrass[variant].prototype,geometry=prototype.geometry.clone().applyMatrix4(prototype.matrixWorld);geometry.computeBoundingBox();const centre=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-centre.x,-geometry.boundingBox.min.y,-centre.z);
        const instances=new THREE.InstancedMesh(geometry,prototype.material,detailPoints.length),dummy=new THREE.Object3D();instances.castShadow=true;instances.receiveShadow=true;
        detailPoints.forEach((p,i)=>{const radius=.05+(variant%4)*.05,angle=variant*2.399+p.rotation,x=p.x+Math.cos(angle)*radius,z=p.z+Math.sin(angle)*radius;dummy.position.set(x,detailField.height(x,z)-.02,z);dummy.rotation.y=p.rotation+variant*.6;dummy.scale.setScalar(p.scale);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);});instances.instanceMatrix.needsUpdate=true;worldDetails.add(instances);
      }
      if(prototypes.length)detailGrassPlaced+=detailPoints.length;
    }
    loadedAssets.push('models/grass_bermuda_01/grass_bermuda_01.gltf');
  }else warnings.push('实拍草簇加载失败，保留草地 PBR 材质。');
  const cabin=source.entities.find(e=>e.kind==='cabin'),lighthouse=source.entities.find(e=>e.kind==='lighthouse'),palms=source.entities.filter(e=>e.kind==='palm'),boatMarkers=source.entities.filter(e=>e.kind==='boat');
  const bounds=new THREE.Box3();field.lands.forEach(l=>l.polygon.forEach(p=>bounds.expandByPoint(new THREE.Vector3(p.x,0,p.z))));if(bounds.isEmpty())bounds.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(source.world.width,10,source.world.depth));
  const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3());
  let currentView='cabin',currentMode=mode,currentLighting='day',disposed=false,frame=0,frames=0,lastTime=performance.now(),fps=0;
  const assetOverrides=new Map(),assetLoadVersions=new Map();let assetLoadSequence=0;
  const snapshotOverride=record=>({entityId:record.entityId,url:record.url,status:record.status,display:record.display,rotationDegrees:record.rotationDegrees,
    stats:JSON.parse(JSON.stringify(record.stats))});
  function fitOverride(record,degrees) {
    if(typeof degrees!=='number'||!Number.isFinite(degrees)||Math.abs(degrees)>36000)throw new Error('资产朝向须为有限角度。');
    record.rotationDegrees=((degrees%360)+360)%360;
    // Temporarily undo fitting so precise bounds are measured after orientation, before uniform scale.
    record.candidate.position.set(0,0,0);record.sizer.scale.setScalar(1);record.offset.position.set(0,0,0);
    record.rotator.rotation.y=THREE.MathUtils.degToRad(record.rotationDegrees);record.candidate.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(record.rotator,true);
    const min=bounds.min.toArray(),max=bounds.max.toArray();
    const fit=fitAssetBounds({min,max},{...record.spec,anchor:{x:record.anchor.x,y:record.anchor.y,z:record.anchor.z},rotationY:0});
    record.offset.position.set(...fit.offset);record.sizer.scale.setScalar(fit.scale);record.candidate.position.copy(record.anchor);record.candidate.updateMatrixWorld(true);
    let finalBounds=new THREE.Box3().setFromObject(record.candidate,true);const size=finalBounds.getSize(new THREE.Vector3());
    record.immersion=record.kind==='boat'?Math.min(.5,size.y*.35):0;
    record.candidate.position.y-=record.immersion;record.candidate.updateMatrixWorld(true);finalBounds=new THREE.Box3().setFromObject(record.candidate,true);
    record.stats={...record.meshStats,bounds:{min:finalBounds.min.toArray(),max:finalBounds.max.toArray()},
      sourceBounds:{min,max},fit:{...fit,rotationY:record.rotator.rotation.y},dimensions:{width:size.x,height:size.y,depth:size.z},
      anchor:record.anchor.toArray(),waterlineImmersion:record.immersion,envelope:{width:record.spec.width,height:record.spec.height>0?record.spec.height:record.spec.fallbackHeight,depth:record.spec.depth}};
    return snapshotOverride(record);
  }
  async function previewAssetOverride(entityId,url,spec) {
    if(disposed)throw new Error('场景已关闭，不能载入生成资产。');
    const entity=source.entities.find(item=>item.id===entityId);
    if(!entity||!['cabin','lighthouse','palm','boat'].includes(entity.kind))throw new Error('只可替换当前小屋、灯塔、棕榈或船。');
    if(entity.locked)throw new Error('对象已锁定，不能替换生成资产。');
    const original=assetOverrides.get(entityId)?.original||realistic.children.find(object=>object.userData.sourceId===entityId&&!object.userData.assetOverride);
    if(!original)throw new Error('找不到对应的原场景对象。');
    const safeUrl=acceptedAssetUrl(url),token=++assetLoadSequence;assetLoadVersions.set(entityId,token);
    // Validate the target spec before a fetch; fitAssetBounds also rejects malformed envelopes.
    fitAssetBounds({min:[0,0,0],max:[1,1,1]},spec);
    let gltf;
    try {
      gltf=await gltfLoader.loadAsync(safeUrl);
      if(disposed||assetLoadVersions.get(entityId)!==token)throw new Error('该生成资产预览已取消或被新结果替代。');
      const meshStats=inspectLoadedAsset(gltf.scene),candidate=new THREE.Group(),sizer=new THREE.Group(),offset=new THREE.Group(),rotator=new THREE.Group();
      candidate.add(sizer);sizer.add(offset);offset.add(rotator);rotator.add(gltf.scene);
      candidate.userData.sourceId=entityId;candidate.userData.assetOverride=true;
      const record={entityId,kind:entity.kind,url:safeUrl,status:'preview',display:'generated',rotationDegrees:0,original,candidate,sizer,offset,rotator,anchor:original.position.clone(),spec:JSON.parse(JSON.stringify(spec)),meshStats,stats:null};
      const result=fitOverride(record,THREE.MathUtils.radToDeg(spec.rotationY));
      if(disposed||assetLoadVersions.get(entityId)!==token)throw new Error('该生成资产预览已取消或被新结果替代。');
      const previous=assetOverrides.get(entityId);
      if(previous){realistic.remove(previous.candidate);disposeAssetTree(previous.candidate);}
      original.visible=false;realistic.add(candidate);assetOverrides.set(entityId,record);return result;
    }catch(error){if(gltf?.scene)disposeAssetTree(gltf.scene);throw error;}
  }
  function setAssetRotation(entityId,degrees) {
    if(disposed)throw new Error('场景已关闭。');
    const record=assetOverrides.get(entityId);if(!record)throw new Error('请先预览该对象的生成资产。');
    const previous=record.rotationDegrees;
    try{return fitOverride(record,degrees);}catch(error){fitOverride(record,previous);throw error;}
  }
  function setAssetDisplay(entityId,display){
    const record=assetOverrides.get(entityId);if(!record||!['generated','original'].includes(display))throw new Error('资产显示方式无效。');
    record.display=display;record.candidate.visible=display==='generated';record.original.visible=!record.candidate.visible;return snapshotOverride(record);
  }
  function commitAssetOverride(entityId) {
    if(disposed)throw new Error('场景已关闭。');
    const record=assetOverrides.get(entityId);if(!record)throw new Error('请先预览该对象的生成资产。');
    if(source.entities.find(entity=>entity.id===entityId)?.locked)throw new Error('对象已锁定，不能应用生成资产。');
    record.status='committed';return snapshotOverride(record);
  }
  function revertAssetOverride(entityId) {
    assetLoadVersions.set(entityId,++assetLoadSequence);
    const record=assetOverrides.get(entityId);if(!record)return false;
    record.original.visible=true;realistic.remove(record.candidate);disposeAssetTree(record.candidate);assetOverrides.delete(entityId);return true;
  }
  const getAssetOverrides=()=>[...assetOverrides.values()].map(snapshotOverride);
  const sourceGeometry=()=>source.entities.map(entity=>{
    let triangles=0;
    for(const root of realistic.children.filter(object=>object.userData.sourceId===entity.id&&object.visible))root.traverse(object=>{if(object.isMesh&&object.visible){const count=object.geometry?.index?.count??object.geometry?.getAttribute('position')?.count??0;triangles+=Math.floor(count/3)*(object.isInstancedMesh?object.count:1);}});
    return {entityId:entity.id,kind:entity.kind,triangles};
  });
  function setView(name) {
    currentView=name;
    const marker=name==='lighthouse'?lighthouse:name==='palms'?palms[0]:name==='boats'?boatMarkers[0]:cabin;
    if(name==='top'){
      const span=Math.max(extent.x,extent.z,20);controls.target.set(center.x,0,center.z);camera.position.set(center.x+.001,span*1.1,center.z+.001);
    }else if(name==='overview'||!marker) {
      const span=Math.max(extent.x,extent.z,20);controls.target.set(center.x,3,center.z);camera.position.set(center.x+span*.63,span*.68,center.z+span*.79);
    }else if(name==='hero') {
      const p=worldPoint(cabin.points[0],source),g=field.support(p.x,p.z),beacon=lighthouse?worldPoint(lighthouse.points[0],source):p;
      const separation=Math.hypot(p.x-beacon.x,p.z-beacon.z),span=Math.max(38,separation*1.45);
      controls.target.set((p.x+beacon.x)*.5,g+Math.min(7,Math.max(4,cabin.height*.6)),(p.z+beacon.z)*.5+3);
      camera.position.set(p.x+Math.max(30,span*.6),g+6,p.z+Math.max(42,span*.84));
    }else {
      const p=worldPoint(marker.points[0],source),g=field.support(p.x,p.z);
      if(name==='lighthouse'){controls.target.set(p.x,g+marker.height*.42,p.z);camera.position.set(p.x+22,g+5.3,p.z+32);}
      else if(name==='palms'){controls.target.set(p.x,g+marker.height*.51,p.z);camera.position.set(p.x+15,g+2.4,p.z+20);}
      else if(name==='boats'){const level=field.waterAt(p.x,p.z)?.level??0;controls.target.set(p.x,level+1,p.z);camera.position.set(p.x+8,level+3.2,p.z+13);}
      else {controls.target.set(p.x,g+3.1,p.z);camera.position.set(p.x+12,g+2.1,p.z+20);}
    }
    controls.update();return name;
  }
  function reverseView() {
    const offset=camera.position.clone().sub(controls.target);
    camera.position.set(controls.target.x-offset.x,camera.position.y,controls.target.z-offset.z);
    controls.update();return {position:camera.position.toArray(),target:controls.target.toArray()};
  }
  function setMode(name) {currentMode=name==='coarse'?'coarse':'realistic';realistic.visible=currentMode==='realistic';coarse.visible=!realistic.visible;renderer.toneMappingExposure=currentMode==='coarse'?1:completion?.environment.exposure??.98;return currentMode;}
  function setWorldQuality(value){worldQuality=Boolean(value);worldDetails.visible=worldQuality;qualitySurfaces.forEach(({object,original,detailed})=>{object.material=worldQuality?detailed:original;});qualityGeometry.forEach(({object,original,detailed})=>{object.geometry=worldQuality?detailed:original;});qualityGround.forEach(({object,original,detailed})=>{object.position.y=worldQuality?detailed:original;});[...oldFoams,...oldGrass].forEach(object=>{object.visible=!worldQuality;});materials.leaves.map=worldQuality?null:originalLeafMap;materials.leaves.needsUpdate=true;sky.visible=!worldQuality;worldEnvironment.setVisible(worldQuality);setLighting(currentLighting);return worldQuality;}
  function setLighting(name) {
    currentLighting=name==='sunset'?'sunset':'day';
    if(hdrs[currentLighting])scene.environment=hdrs[currentLighting];
    if(currentLighting==='sunset'){sun.color.set(0xffb775);sun.intensity=2.6;sun.position.set(-70,27,45);ambient.intensity=.65;scene.environmentIntensity=.55;scene.fog.color.set(0xe0b695);renderer.toneMappingExposure=1.03;sky.material.uniforms.top.value.set(0x768cae);sky.material.uniforms.horizon.value.set(0xf1cfaa);}
    else{sun.color.set(0xfff1d7);sun.intensity=3.1;sun.position.set(-55,95,-35);ambient.intensity=1;scene.environmentIntensity=.8;scene.fog.color.set(0xb7d2dc);renderer.toneMappingExposure=.98;sky.material.uniforms.top.value.set(0x79b6e2);sky.material.uniforms.horizon.value.set(0xd1e5e9);}
    sky.material.uniforms.sunDirection.value.copy(sun.position).normalize();
    if(worldQuality){worldEnvironment.setLighting(currentLighting);ambient.intensity=currentLighting==='sunset'?.38:.55;sun.intensity=currentLighting==='sunset'?2.1:2.8;scene.environmentIntensity=currentLighting==='sunset'?.48:.62;}
    if(completion){
      const env=completion.environment,az=THREE.MathUtils.degToRad(env.sunAzimuth),el=THREE.MathUtils.degToRad(env.sunElevation);
      sun.position.set(Math.sin(az)*Math.cos(el)*120,Math.sin(el)*120,Math.cos(az)*Math.cos(el)*120);
      renderer.toneMappingExposure=env.exposure;if(scene.fog)scene.fog.density=env.fog;
    }
    return currentLighting;
  }
  function resize(){if(disposed)return;const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();setMode(mode);setView(cabin?'cabin':'overview');
  const started=performance.now();
  const tick=now=>{if(disposed)return;frame=requestAnimationFrame(tick);const t=(now-started)/1000;waterMat.userData.time.value=t;for(const material of qualityMaterials)if(material.userData.time)material.userData.time.value=t;for(const b of boats){b.object.position.y=b.base+Math.sin(t*.8+b.phase)*.06;b.object.rotation.z=Math.sin(t*.6+b.phase)*.015;}controls.update();renderer.render(scene,camera);frames++;if(now-lastTime>1200){fps=Math.round(frames*1000/(now-lastTime));frames=0;lastTime=now;}};
  frame=requestAnimationFrame(tick);
  const getStats=()=>({renderer:'Three.js r180 / WebGL 2',mode:currentMode,lighting:currentLighting,view:currentView,entities:source.entities.length,worldQuality,worldEnvironment:worldEnvironment.getStats(),sourceGeometry:sourceGeometry(),sourceGeometryIds:[...new Set(realistic.children.map(object=>object.userData.sourceId).filter(Boolean))],sourceAnchors:source.entities.filter(e=>!['land','water','road'].includes(e.kind)).map(e=>({id:e.id,...worldPoint(e.points[0],source)})),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,fps,textures:renderer.info.memory.textures,loadedAssets:[...loadedAssets],scannedRocks:rocksPlaced,scannedGrassClumps:worldQuality?detailGrassPlaced:grassPlaced,generatedAssets:assetOverrides.size,visibleGeneratedAssets:currentMode==='realistic'?[...assetOverrides.values()].filter(record=>record.display==='generated').length:0,committedGeneratedAssets:[...assetOverrides.values()].filter(record=>record.status==='committed').length,assetOverrides:getAssetOverrides(),warnings:[...warnings]});
  report('ready',`写实场景就绪：${rocksPlaced} 处实拍扫描岩石、${grassPlaced} 处草簇；${warnings.length} 项资源提示`);
  function setViewState(value){
    if(!value||!['position','target'].every(key=>Array.isArray(value[key])&&value[key].length===3&&value[key].every(n=>Number.isFinite(n)&&Math.abs(n)<=worldSize*20)))throw new Error('镜头记录无效。');
    camera.position.fromArray(value.position);controls.target.fromArray(value.target);controls.update();return {position:camera.position.toArray(),target:controls.target.toArray()};
  }
  function focusEntity(id){
    const entity=source.entities.find(e=>e.id===id);if(!entity)return;
    const points=entity.points.map(point=>worldPoint(point,source)),p=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,z:sum.z+p.z/points.length}),{x:0,z:0}),g=entity.kind==='boat'?field.waterAt(p.x,p.z)?.level??0:field.support(p.x,p.z);
    const span=points.length>1?Math.max(12,...points.map(point=>Math.hypot(point.x-p.x,point.z-p.z)))*2:Math.max(12,entity.height*1.35);
    controls.target.set(p.x,g+entity.height*.4,p.z);camera.position.set(p.x+span*.65,g+Math.max(span*.85,entity.height*1.4+4),p.z+span);controls.update();currentView='selection';
  }
  let pointerStart=null;
  const pointerDown=event=>{pointerStart=event.button===0?[event.clientX,event.clientY]:null;};
  const pointerUp=event=>{
    if(!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>5){pointerStart=null;return;}pointerStart=null;
    if(!onSelect)return;const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    for(const hit of ray.intersectObjects((currentMode==='coarse'?coarse:realistic).children,true)){
      let node=hit.object,id=null,visible=true;while(node){visible&&=node.visible;if(node.userData.sourceId)id=node.userData.sourceId;node=node.parent;}
      if(id&&visible){onSelect(id);break;}
    }
  };
  if(onSelect){canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);}
  function applyCompletionAssetLook(id){
    const record=assetOverrides.get(id),look=looks.get(id);if(!record||!look)return;
    record.candidate.traverse(object=>{if(!object.isMesh)return;object.material=(Array.isArray(object.material)?object.material:[object.material]).map(original=>{const material=original.clone();material.color?.multiply(new THREE.Color(look.materialColor));material.roughness=look.roughness;completionMaterials.push(material);return material;});if(object.material.length===1)object.material=object.material[0];});
  }
  return {setMode,setView,setViewState,focusEntity,reverseView,setLighting,setWorldQuality,resize,getStats,previewAssetOverride,setAssetRotation,setAssetDisplay,commitAssetOverride,revertAssetOverride,getAssetOverrides,applyCompletionAssetLook,getViewState:()=>({position:camera.position.toArray(),target:controls.target.toArray()}),sourcePlan:source,capture:()=>{renderer.render(scene,camera);return canvas.toDataURL('image/png');},
    dispose(){disposed=true;for(const id of [...assetOverrides.keys()])revertAssetOverride(id);cancelAnimationFrame(frame);observer.disconnect();controls.dispose();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);worldEnvironment.dispose();const geometries=new Set(qualityGeometry.flatMap(({original,detailed})=>[original,detailed])),materialList=new Set([landMat,waterMat,foamMaterial,...qualityMaterials,...Object.values(materials),...completionMaterials]),textures=new Set([originalLeafMap]);scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materialList.add(m);});materialList.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);});Object.values(materialSets).forEach(set=>Object.values(set).forEach(t=>textures.add(t)));Object.values(hdrs).forEach(t=>textures.add(t));geometries.forEach(g=>g.dispose());materialList.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();}
  };
}

