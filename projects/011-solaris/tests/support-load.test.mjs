import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSupport,loadRegisteredMesh} from '../web/support/load.js';
import {sha256} from '../web/support/mesh.js';

const normalization = (type='table') => ({ policyVersion:type==='table'?'table-height-075-v1':'lamp-height-052-v1',
  upAxis:'+Y',sourceUnit:'meter',targetDesignHeightMeters:type==='table'?.75:.52 });

async function registeredFixture(id, width=.1) {
  // Mathematical source fixture only: bottom down, top up, source height 1 m.
  const bottom=[[-width,0,-width],[width,0,width],[-width,0,width],[-width,0,-width],[width,0,-width],[width,0,width]];
  const top=[[-width,1,-width],[-width,1,width],[width,1,width],[-width,1,-width],[width,1,width],[width,1,-width]];
  const bin=new Uint8Array(12*3*4);new Float32Array(bin.buffer).set([...bottom,...top].flat());
  const modelPath=`${id}/source.gltf`,binPath=`${id}/source.bin`;
  const document={asset:{version:'2.0'},scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    buffers:[{uri:'source.bin',byteLength:bin.byteLength}],bufferViews:[{buffer:0,byteLength:bin.byteLength}],accessors:[{bufferView:0,componentType:5126,count:12,type:'VEC3'}]};
  const model=new TextEncoder().encode(JSON.stringify(document));
  const files=[{path:modelPath,bytes:model.byteLength,sha256:await sha256(model)},{path:binPath,bytes:bin.byteLength,sha256:await sha256(bin)}];
  const sourceFingerprint=await sha256(files.slice().sort((a,b)=>a.path.localeCompare(b.path,'en')).map(f=>`${f.path}:${f.sha256}\n`).join(''));
  return { asset:{id,label:id,modelPath,files,sourceFingerprint},bytes:new Map([[modelPath,model],[binPath,bin]]) };
}

test('current entry point rejects absent table or lamp normalization before reading any source bytes',async()=>{
  let reads=0;const read=async()=>{reads++;throw new Error('should-not-read');};
  await assert.rejects(prepareSupport({assets:[]},{normalization:normalization('lamp')},read),/桌资产归一化/);
  await assert.rejects(prepareSupport({assets:[],normalization:normalization()},{},read),/灯资产归一化/);
  assert.equal(reads,0);
});
test('current entry point strictly rejects table rule, axis, unit and design-height mismatches',async()=>{
  for(const [key,value] of [['policyVersion','table-height-custom'],['upAxis','+Z'],['sourceUnit','centimeter'],
    ['targetDesignHeightMeters',.76],['targetDesignHeightMeters','0.75'],['targetDesignHeightMeters',NaN]]) {
    let reads=0;const manifest={assets:[],normalization:{...normalization(),[key]:value}};
    await assert.rejects(prepareSupport(manifest,{normalization:normalization('lamp')},async()=>{reads++;}),/桌资产归一化/);
    assert.equal(reads,0);
  }
});
test('current entry point strictly rejects lamp rule, axis, unit and design-height mismatches',async()=>{
  for(const [key,value] of [['policyVersion','lamp-height-custom'],['upAxis','-Y'],['sourceUnit','unknown'],
    ['targetDesignHeightMeters',.5],['targetDesignHeightMeters','0.52'],['targetDesignHeightMeters',Infinity]]) {
    let reads=0;const lamp={normalization:{...normalization('lamp'),[key]:value}};
    await assert.rejects(prepareSupport({assets:[],normalization:normalization()},lamp,async()=>{reads++;}),/灯资产归一化/);
    assert.equal(reads,0);
  }
});
test('registered class metadata yields distinct lamp/table design normalizations through the same adapter',async()=>{
  const lamp=await registeredFixture('lamp',.05),table=await registeredFixture('table',1);
  const bytes=new Map([...lamp.bytes,...table.bytes]),reads=[];
  lamp.asset.normalization=normalization('lamp');
  const result=await prepareSupport({normalization:normalization(),assets:[table.asset]},lamp.asset,async path=>{reads.push(path);return bytes.get(path);});
  assert.equal(result.lamp.mesh.normalization.targetDesignHeightMeters,.52);
  assert.equal(result.lamp.mesh.normalization.factor,.52);
  assert.equal(result.tables[0].mesh.normalization.targetDesignHeightMeters,.75);
  assert.equal(result.tables[0].mesh.normalization.factor,.75);
  assert.equal(result.tables[0].valid,true);
  assert.equal(result.tables[0].usableSurfaces,1);
  assert.equal(reads.length,4);
});
test('explicit-height low-level loading remains usable for an old descriptor without normalization',async()=>{
  const old=await registeredFixture('historical-lamp',.05);
  const mesh=await loadRegisteredMesh(old.asset,async path=>old.bytes.get(path),.52);
  assert.equal(mesh.normalization.targetDesignHeightMeters,.52);
  assert.equal(mesh.triangleCount,4);
});
test('source-file and package fingerprints fail before any partial geometry result can be used',async()=>{
  const f=await registeredFixture('lamp',.05);
  const changed=new Map(f.bytes);changed.set(f.asset.modelPath,new Uint8Array(f.bytes.get(f.asset.modelPath).length));
  await assert.rejects(loadRegisteredMesh(f.asset,async path=>changed.get(path),.52),/源文件指纹不匹配/);
  await assert.rejects(loadRegisteredMesh({...f.asset,sourceFingerprint:'0'.repeat(64)},async path=>f.bytes.get(path),.52),/源资产包指纹/);
});
