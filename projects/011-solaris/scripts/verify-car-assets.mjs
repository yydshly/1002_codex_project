import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const directory = new URL('../web/assets/car/', import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
const file=await fs.readFile(new URL(manifest.runtime.file,directory));
const digest=crypto.createHash('sha256').update(file).digest('hex');
if(file.length!==manifest.runtime.bytes || digest!==manifest.runtime.sha256) throw new Error('Car asset checksum mismatch');
if(file.toString('utf8',0,4)!=='glTF' || file.readUInt32LE(4)!==2 || file.readUInt32LE(8)!==file.length) throw new Error('Invalid GLB header');
const jsonLength=file.readUInt32LE(12);
if(file.readUInt32LE(16)!==0x4e4f534a) throw new Error('Missing JSON chunk');
const document=JSON.parse(file.toString('utf8',20,20+jsonLength));
const binaryOffset=20+jsonLength;
if(file.readUInt32LE(binaryOffset+4)!==0x004e4942 || binaryOffset+8+file.readUInt32LE(binaryOffset)!==file.length) throw new Error('Invalid binary chunk');
if(document.buffers.length!==1 || document.buffers[0].uri || document.buffers[0].byteLength>file.readUInt32LE(binaryOffset)) throw new Error('Non-local or invalid GLB buffer');
if(document.images.length!==14 || document.images.some(i=>i.uri || i.mimeType!=='image/png' || !Number.isInteger(i.bufferView))) throw new Error('All 14 PNG textures must be embedded');
function crc32(bytes) {
  let value=-1;
  for(const byte of bytes) {
    value^=byte;
    for(let bit=0;bit<8;bit++) value=(value>>>1)^((value&1)?0xedb88320:0);
  }
  return (value^-1)>>>0;
}
for(const image of document.images) {
  const view=document.bufferViews[image.bufferView], offset=binaryOffset+8+(view.byteOffset||0);
  if(view.buffer!==0 || view.byteOffset+view.byteLength>document.buffers[0].byteLength || file.subarray(offset,offset+8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Invalid embedded texture');
  const png=file.subarray(offset,offset+view.byteLength), compressed=[];
  let chunkOffset=8;
  while(chunkOffset<png.length) {
    const length=png.readUInt32BE(chunkOffset), type=png.toString('ascii',chunkOffset+4,chunkOffset+8);
    if(chunkOffset+12+length>png.length || crc32(png.subarray(chunkOffset+4,chunkOffset+8+length))!==png.readUInt32BE(chunkOffset+8+length)) throw new Error('Corrupt embedded PNG chunk');
    if(type==='IDAT') compressed.push(png.subarray(chunkOffset+8,chunkOffset+8+length));
    chunkOffset+=length+12;
  }
  if(chunkOffset!==png.length || png[28]!==0) throw new Error('Unexpected PNG chunk boundaries or interlace');
  const width=png.readUInt32BE(16), height=png.readUInt32BE(20), bitDepth=png[24], channels=({0:1,2:3,3:1,4:2,6:4})[png[25]];
  if(!width || !height || !channels || width>4096 || height>4096) throw new Error('Unexpected embedded texture dimensions or color format');
  const inflated=zlib.inflateSync(Buffer.concat(compressed));
  if(inflated.length!==height*(1+Math.ceil(width*channels*bitDepth/8))) throw new Error('Corrupt embedded PNG scanlines');
}
if(document.extensionsRequired?.some(e=>['KHR_texture_basisu','KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e))) throw new Error('Car must load without extra decoders');
const find=name=>document.nodes.findIndex(n=>n.name===name);
const hood=find('BodyHood'), engine=find('Engine'), headlights=find('BodyHeadlights');
if([hood,engine,headlights].some(i=>i<0 || !Number.isInteger(document.nodes[i].mesh))) throw new Error('Missing interactive geometry');
if(!document.nodes[hood].children.includes(headlights) || document.nodes[hood].children.includes(engine)) throw new Error('Invalid hood, headlamp or engine hierarchy');
const mechanical=document.materials.find(m=>m.name==='Mechanical'), light=document.materials.find(m=>m.name==='Headlight');
if(!mechanical?.normalTexture || !light?.emissiveFactor?.some(n=>n>0)) throw new Error('Missing engine surface or lamp emission');
const metadata=JSON.parse(await fs.readFile(new URL('metadata.json',directory),'utf8'));
if(!metadata.legal.some(e=>e.license==='CC-BY-4.0' && e.artist==='Eric Chadwick' && e.owner==='Darmstadt Graphics Group GmbH')) throw new Error('Missing asset-specific licence metadata');
for(const file of ['CC-BY-4.0.txt','Khronos-legal-mark.txt']) if((await fs.readFile(new URL(file,directory),'utf8')).length<100) throw new Error(`Missing legal text ${file}`);
console.log(JSON.stringify({asset:manifest.asset,bytes:file.length,sha256:digest,selfContained:true,embeddedPngImages:document.images.length,pngChunkCrcAndScanlines:true,nodes:document.nodes.length,meshes:document.meshes.length,hoodAndEngine:true,license:'CC-BY-4.0'}));
