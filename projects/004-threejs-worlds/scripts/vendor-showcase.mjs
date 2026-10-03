import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://raw.githubusercontent.com/mrdoob/three.js/r180/';
const root = new URL('../web/', import.meta.url);
const addons = ['loaders/GLTFLoader.js','loaders/RGBELoader.js','utils/BufferGeometryUtils.js','geometries/RoundedBoxGeometry.js','objects/Water.js','postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/ShaderPass.js','postprocessing/MaskPass.js','postprocessing/Pass.js','postprocessing/OutputPass.js','postprocessing/UnrealBloomPass.js','shaders/CopyShader.js','shaders/OutputShader.js','shaders/LuminosityHighPassShader.js'];
const manifest = { date:'2026-10-03', three:'r180', files:[] };
addons.push('loaders/HDRLoader.js');
addons.push('postprocessing/SSAOPass.js','shaders/SSAOShader.js','math/SimplexNoise.js');
const cached=process.argv.includes('--cached');
async function save(relative,url,license) {
  const target=new URL(relative,root);let bytes;
  if(cached)bytes=await readFile(target);
  else {for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(url);if(!response.ok)throw new Error(`${response.status}: ${url}`);bytes=new Uint8Array(await response.arrayBuffer());break;}catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}}}
  await mkdir(new URL('.',target),{recursive:true}); await writeFile(target,bytes);
  manifest.files.push({file:relative,source:url,license,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await Promise.all(addons.map(file=>save(`vendor/addons/${file}`,`${base}examples/jsm/${file}`,'MIT')));
await save('assets/guide.glb',`${base}examples/models/gltf/RobotExpressive/RobotExpressive.glb`,'CC0 1.0 — Tomás Laulhé, modifications Don McCurdy');
await save('assets/guide-README.md',`${base}examples/models/gltf/RobotExpressive/README.md`,'Upstream attribution');
await save('assets/coastal-sunset.hdr','https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/qwantani_sunset_puresky_1k.hdr','CC0 — Poly Haven, Greg Zaal / Jarod Guest');
await save('assets/coastal-day.hdr','https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr','CC0 — Poly Haven, Greg Zaal / Jarod Guest');
const textureBase='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_';
await Promise.all([
  save('assets/concrete-color.jpg',`${textureBase}diff_1k.jpg`,'CC0 — Poly Haven, Rob Tuytel'),
  save('assets/concrete-normal.jpg',`${textureBase}nor_gl_1k.jpg`,'CC0 — Poly Haven, Rob Tuytel'),
  save('assets/concrete-roughness.jpg',`${textureBase}rough_1k.jpg`,'CC0 — Poly Haven, Rob Tuytel'),
]);
manifest.files.sort((a,b)=>a.file.localeCompare(b.file));
await writeFile(new URL('assets/manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(`Showcase assets saved: ${manifest.files.length} files, ${(manifest.files.reduce((n,f)=>n+f.bytes,0)/1048576).toFixed(1)} MiB`);
