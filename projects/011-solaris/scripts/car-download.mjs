import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const directory = new URL('../web/assets/car/', import.meta.url);
const sourceDirectory = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF/';
await fs.mkdir(directory, {recursive:true});
const cache = new URL('../.cache/car-source/', import.meta.url);
await fs.mkdir(cache, {recursive:true});
async function download(name) {
  let data;
  try {data=await fs.readFile(new URL(name,cache));} catch {}
  if (!data) {
    let lastError;
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response = await fetch(new URL(name, sourceDirectory), {headers:{'User-Agent':'ATELIER-local-asset-build'},signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        data=Buffer.from(await response.arrayBuffer());
        await fs.writeFile(new URL(name,cache),data);
        break;
      } catch(error) {lastError=error;}
    }
    if(!data) throw lastError;
  }
  return {name, data, bytes:data.length, sha256:crypto.createHash('sha256').update(data).digest('hex')};
}
const source = await download('CarConcept.gltf');
const document = JSON.parse(source.data.toString('utf8'));
if (document.buffers.length !== 1 || document.buffers[0].uri.startsWith('data:')) throw new Error('Expected one external source buffer');
const names=[document.buffers[0].uri,...document.images.map(image => image.uri)],items=[];
for(let start=0;start<names.length;start+=4) items.push(...await Promise.all(names.slice(start,start+4).map(download)));
const binaryChunks = [items[0].data];
let binaryLength = items[0].data.length;
function append(data) {
  const padding = (4 - binaryLength % 4) % 4;
  if (padding) {binaryChunks.push(Buffer.alloc(padding));binaryLength+=padding;}
  const offset = binaryLength;
  binaryChunks.push(data);binaryLength+=data.length;
  return offset;
}
for (let i=0;i<document.images.length;i++) {
  const image=document.images[i], item=items[i+1];
  if (item.data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error(`Expected PNG ${image.uri}`);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({buffer:0,byteOffset:append(item.data),byteLength:item.bytes});
  image.mimeType='image/png';image.bufferView=bufferView;delete image.uri;
}
document.buffers=[{byteLength:binaryLength}];
let json = Buffer.from(JSON.stringify(document));
json = Buffer.concat([json, Buffer.alloc((4-json.length%4)%4,0x20)]);
let binary = Buffer.concat(binaryChunks);
binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const header = Buffer.alloc(12), jsonHeader=Buffer.alloc(8), binaryHeader=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);
jsonHeader.writeUInt32LE(json.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);
binaryHeader.writeUInt32LE(binary.length);binaryHeader.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,jsonHeader,json,binaryHeader,binary]);
await fs.writeFile(new URL('CarConcept.glb',directory),glb);
const manifest={schemaVersion:1,asset:'Car Concept',sourcePage:'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',sourceMetadata:'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/metadata.json',sourceDirectory,license:'CC-BY-4.0',artist:'Eric Chadwick',copyright:'© 2024 Darmstadt Graphics Group GmbH',additionalMarks:['Khronos','3D Commerce'],changes:'glTF PNG images and original binary geometry embedded into one GLB; geometry, material values, transforms, pivots and textures unchanged. No procedural replacement vehicle components.',runtimeRequiresNetwork:false,downloadedSourceFiles:[source,...items].map(({name,bytes,sha256})=>({name,bytes,sha256})),runtime:{file:'CarConcept.glb',bytes:glb.length,sha256:crypto.createHash('sha256').update(glb).digest('hex'),images:document.images.length,imageFormat:'image/png',buffers:document.buffers.length,nodes:document.nodes.length,meshes:document.meshes.length,materials:document.materials.length}};
await fs.writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.runtime));
