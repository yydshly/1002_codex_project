import * as THREE from './vendor/three.module.js';
import { contains, edgeDistance } from './terrain.js';

// This module only renders a local environment. The HDRs are photographed CC0
// skies, and the water colours below are distance-based approximations, not a
// generated mesh or a claim to reconstruct the underwater environment.
export function createWorldEnvironment({ scene, hdrs = {}, worldSize = 200 }) {
  if (!scene?.isScene || !Number.isFinite(worldSize) || worldSize <= 0) throw new Error('环境场景或尺寸无效。');
  const originalBackground = scene.background;
  const originalFog = scene.fog;
  const originalBlur = scene.backgroundBlurriness;
  const originalIntensity = scene.backgroundIntensity;
  const originalRotation = scene.backgroundRotation.clone();
  const originalEnvironmentRotation = scene.environmentRotation.clone();
  const fog = new THREE.FogExp2(0xb9d4da, .00205 * 200 / worldSize);
  let lighting = 'day', visible = true, disposed = false;
  function apply() {
    if (disposed) return;
    if (!visible) {
      scene.background = originalBackground;
      scene.fog = originalFog;
      scene.backgroundBlurriness = originalBlur;
      scene.backgroundIntensity = originalIntensity;
      scene.backgroundRotation.copy(originalRotation);
      scene.environmentRotation.copy(originalEnvironmentRotation);
      return;
    }
    const hdr = hdrs[lighting] || hdrs.day || hdrs.sunset;
    // PureSky panoramas contain no fixed landscape geometry. Objects placed by
    // the user stay three dimensional and are never baked into this backdrop.
    scene.background = hdr || originalBackground;
    scene.backgroundBlurriness = .018;
    scene.backgroundIntensity = lighting === 'sunset' ? .62 : .73;
    scene.backgroundRotation.set(0, lighting === 'sunset' ? -.35 : .58, 0);
    scene.environmentRotation.copy(scene.backgroundRotation);
    fog.color.set(lighting === 'sunset' ? 0xc7b7a7 : 0xb9d4da);
    scene.fog = fog;
  }
  apply();
  return {
    setLighting(name) { lighting = name === 'sunset' ? 'sunset' : 'day'; apply(); return lighting; },
    setVisible(value) { visible = Boolean(value); apply(); return visible; },
    update() {},
    getStats: () => ({ visible, lighting, backdrop: hdrs[lighting] || hdrs.day || hdrs.sunset ? 'photographed-CC0-PureSky-HDR' : 'fallback-colour', atmosphere: 'distance-fog', generation: 'local-rendering' }),
    dispose() { if (disposed) return; visible = false; apply(); disposed = true; }
  };
}

function checkedPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw new Error('水岸轮廓须包含至少 3 个有限坐标。');
  return polygon;
}

function makeShoreLookup({ field, worldSize, kind, polygon, resolution }) {
  const polygons = kind === 'inland' ? [checkedPolygon(polygon)] : (field?.lands || []).map(land => checkedPolygon(land.polygon));
  const span = worldSize * 1.65;
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let row = 0; row < resolution; row++) for (let col = 0; col < resolution; col++) {
    const point = { x: ((col + .5) / resolution - .5) * span, z: ((row + .5) / resolution - .5) * span };
    let distance = Infinity;
    for (const contour of polygons) distance = Math.min(distance, edgeDistance(point, contour));
    // Ocean water on land is hidden by the unchanged terrain. Inland water is
    // clipped by its original polygon; a lookup never expands that footprint.
    const wet = kind === 'inland' ? polygons.some(contour => contains(point, contour)) : !polygons.some(contour => contains(point, contour));
    const i = (row * resolution + col) * 4;
    pixels[i] = Math.round(255 * Math.min(1, distance / (kind === 'inland' ? 7 : 17)));
    pixels[i + 1] = wet ? 255 : 0;
    pixels[i + 2] = 0;
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, span };
}

/** Separate ocean/inland materials use the original shoreline as an appearance
 * guide. Mesh placement and source water height remain the caller's authority. */
export function createCoastalWaterMaterial({ field, worldSize = 200, kind = 'ocean', polygon, level = 0, resolution = 160 } = {}) {
  if (!Number.isFinite(worldSize) || worldSize <= 0 || !Number.isFinite(level)) throw new Error('水面尺寸或高度无效。');
  if (!['ocean', 'inland'].includes(kind)) throw new Error('水面类型无效。');
  if (!Number.isInteger(resolution) || resolution < 16 || resolution > 256) throw new Error('水岸采样尺寸超出范围。');
  const lookup = makeShoreLookup({ field, worldSize, kind, polygon, resolution });
  const inland = kind === 'inland';
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: inland ? .18 : .145, metalness: 0,
    ior: 1.333, reflectivity: .34, clearcoat: .72, clearcoatRoughness: .12,
    transparent: inland, opacity: inland ? .88 : 1, depthWrite: !inland,
    side: THREE.DoubleSide
  });
  const time = { value: 0 };
  material.userData.time = time;
  material.userData.appearanceSource = 'distance-to-authored-shoreline / photographed-HDR-reflections';
  material.userData.waterKind = kind;
  material.userData.waterLevel = level;
  // Keep this texture visible to the renderer's existing resource disposer.
  material.shoreMap = lookup.texture;
  const shallow = new THREE.Color(inland ? 0x508e8c : 0x59ada7);
  const deep = new THREE.Color(inland ? 0x284c57 : 0x174b61);
  const amplitude = inland ? .38 : 1;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uCoastTime: time, uShoreMap: { value: lookup.texture }, uShoreSpan: { value: lookup.span },
      uShallowColour: { value: shallow }, uDeepColour: { value: deep },
      uWaveStrength: { value: amplitude }, uInland: { value: inland ? 1 : 0 }
    });
    shader.vertexShader = 'uniform float uCoastTime; uniform float uWaveStrength; varying vec3 vCoastPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCoastPosition=(modelMatrix*vec4(position,1.0)).xyz;
      vec2 coastPoint=vCoastPosition.xz;
      transformed.y+=uWaveStrength*(.042*sin(dot(coastPoint,vec2(.91,.41))*.62+uCoastTime*.83)+.025*sin(dot(coastPoint,vec2(-.33,.94))*.96-uCoastTime*1.07));`);
    shader.fragmentShader = `uniform float uCoastTime; uniform float uWaveStrength; uniform float uInland;
      uniform sampler2D uShoreMap; uniform float uShoreSpan;
      uniform vec3 uShallowColour; uniform vec3 uDeepColour; varying vec3 vCoastPosition;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 coastUV=vCoastPosition.xz/uShoreSpan+.5;
      float inLookup=step(0.0,coastUV.x)*step(coastUV.x,1.0)*step(0.0,coastUV.y)*step(coastUV.y,1.0);
      float coastDepth=mix(1.0,texture2D(uShoreMap,clamp(coastUV,0.0,1.0)).r,inLookup);
      float depthVariation=.025*sin(vCoastPosition.x*.23+vCoastPosition.z*.18)+.018*sin(vCoastPosition.z*.43);
      diffuseColor.rgb*=mix(uShallowColour,uDeepColour,smoothstep(0.015,.72,coastDepth+depthVariation));
      // Small discontinuous wavelets replace the uniform white polygon outline.
      float washWave=sin(vCoastPosition.x*1.03+vCoastPosition.z*.78-uCoastTime*1.37);
      float brokenWash=smoothstep(.67,.96,washWave)*smoothstep(.15,.8,sin(vCoastPosition.x*.64-vCoastPosition.z*.43+uCoastTime*.28));
      float shoreWash=(1.0-smoothstep(.005,.065,coastDepth))*brokenWash*(1.0-uInland*.7);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.68,.77,.73),shoreWash*.43);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      vec2 waterPoint=vCoastPosition.xz;
      vec2 slope=uWaveStrength*(
        .064*vec2(.91,.41)*cos(dot(waterPoint,vec2(.91,.41))*.62+uCoastTime*.83)+
        .047*vec2(-.33,.94)*cos(dot(waterPoint,vec2(-.33,.94))*.96-uCoastTime*1.07)+
        .021*vec2(.57,-.82)*cos(dot(waterPoint,vec2(.57,-.82))*2.14+uCoastTime*.63)+
        .014*vec2(-.83,-.55)*cos(dot(waterPoint,vec2(-.83,-.55))*4.39-uCoastTime*1.31)+
        .009*vec2(.17,.99)*cos(dot(waterPoint,vec2(.17,.99))*7.71+uCoastTime*.94));
      vec3 waveNormal=normalize(vec3(-slope.x,1.0,-slope.y));
      normal=normalize((viewMatrix*vec4(waveNormal,0.0)).xyz);
      nonPerturbedNormal=normal;`);
  };
  material.customProgramCacheKey = () => `coastal-water-v2-${kind}`;
  return material;
}

/** Optional patchy shoreline foam. Its contour follows the original polygon;
 * it never fills new water or changes terrain, anchors, paths, or locks. */
export function createShoreWash({ polygon, level = 0, width = .5, seed = 1 } = {}) {
  checkedPolygon(polygon);
  if (![level, width, seed].every(Number.isFinite) || width <= 0 || width > 10) throw new Error('岸线细节参数无效。');
  const positions = [], uvs = [];
  let offset = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b.x-a.x, dz=b.z-a.z, length = Math.hypot(dx,dz);
    if (length < 1e-8) continue;
    const divisions = Math.max(1, Math.min(256, Math.ceil(length/.9)));
    for (let part=0;part<divisions;part++) {
      const vertices = [];
      for (const t of [part/divisions,(part+1)/divisions]) {
        const along=offset+t*length,x=a.x+dx*t,z=a.z+dz*t;
        const span=width*(.61+.16*Math.sin(along*1.31+seed)+.16*Math.sin(along*.53+seed*2));
        for (const side of [-1,1]) vertices.push({x:x-side*dz/length*span,z:z+side*dx/length*span,along,cross:side===-1?0:1});
      }
      for (const index of [0,2,1,1,2,3]) {
        const vertex=vertices[index];positions.push(vertex.x,level+.045,vertex.z);uvs.push(vertex.along,vertex.cross);
      }
    }
    offset+=length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({color:0xd7e6df,transparent:true,opacity:.31,side:THREE.DoubleSide,depthWrite:false});
  const time={value:0};material.userData.time=time;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWashTime=time;
    shader.vertexShader='varying vec2 vWashUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWashUV=uv;');
    shader.fragmentShader='uniform float uWashTime; varying vec2 vWashUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float patches=smoothstep(.35,.92,sin(vWashUV.x*1.7-uWashTime*.61)*.5+.5)*smoothstep(.1,.76,sin(vWashUV.x*.53+uWashTime*.27)*.5+.5);
      float crossFade=pow(max(0.0,sin(vWashUV.y*3.14159)),2.0);
      diffuseColor.a*=patches*crossFade;`);
  };
  material.customProgramCacheKey=()=> 'coastal-shore-wash-v2';
  const object=new THREE.Mesh(geometry,material);object.renderOrder=2;object.frustumCulled=false;
  object.userData.appearanceSource='procedural-shore-wash / original-authored-contour';
  return object;
}
