import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractStaticGltf} from '../web/support/mesh.js';
function fixture(){
  const buffer=new Uint8Array(36); new Float32Array(buffer.buffer).set([0,0,0,0,1,0,1,1,0]);
  return {buffers:[buffer],document:{asset:{version:'2.0'},scenes:[{nodes:[0]}],nodes:[{translation:[3,0,0],children:[1]},{mesh:0,scale:[-1,2,1]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}]}};
}
test('static extraction composes nested nodes and reverses reflected winding',()=>{
  const f=fixture(),m=extractStaticGltf(f.document,f.buffers,.75);
  assert.equal(m.triangleCount,1);assert.equal(m.normalization.factor,.375);
  assert.deepEqual(m.triangles[0],{a:[.1875,0,0],b:[-.1875,.75,0],c:[.1875,.75,0]});
});
test('static extraction rejects unhandled deformation rather than analyzing partial mesh',()=>{
  const f=fixture();f.document.meshes[0].primitives[0].targets=[{}];
  assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/完整静态/);
});
test('static extraction rejects singular hierarchy and malformed buffers',()=>{
  const f=fixture();f.document.nodes[1].scale=[0,2,1];assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/不可逆/);
  const g=fixture();g.document.accessors[0].count=4;assert.throws(()=>extractStaticGltf(g.document,g.buffers,.75),/边界/);
});
test('static extraction rejects cycles and nonfinite source coordinates',()=>{
  const f=fixture();f.document.nodes[1].children=[0];assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/循环/);
  const g=fixture();new Float32Array(g.buffers[0].buffer)[2]=Infinity;assert.throws(()=>extractStaticGltf(g.document,g.buffers,.75),/非有限/);
});

test('required unknown extensions are rejected even if source triangles would otherwise parse',()=>{
  const f=fixture();f.document.extensionsUsed=['VENDOR_unknown_geometry'];f.document.extensionsRequired=['VENDOR_unknown_geometry'];
  assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/必需扩展/);
  const g=fixture();g.document.extensionsRequired='KHR_materials_emissive_strength';
  assert.throws(()=>extractStaticGltf(g.document,g.buffers,.75),/必需扩展/);
});
test('the explicitly supported geometry-neutral required material extension remains usable',()=>{
  const f=fixture();f.document.extensionsUsed=['KHR_materials_emissive_strength'];f.document.extensionsRequired=['KHR_materials_emissive_strength'];
  assert.equal(extractStaticGltf(f.document,f.buffers,.75).triangleCount,1);
  delete f.document.extensionsUsed;
  assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/extensionsUsed/);
});
test('matrix and any separately supplied TRS are rejected instead of silently choosing matrix',()=>{
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const [key,value] of [['translation',[0,0,0]],['rotation',[0,0,0,1]],['scale',[1,1,1]],['translation',null]]) {
    const f=fixture();f.document.nodes[0]={matrix:identity,children:[1],[key]:value};
    assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/matrix 与 TRS/);
  }
  const f=fixture();f.document.nodes[0]={matrix:identity,children:[1]};
  assert.equal(extractStaticGltf(f.document,f.buffers,.75).triangleCount,1);
});
test('opposing negative view/accessor offsets cannot cancel into a legal aggregate offset',()=>{
  for(const [viewOffset,accessorOffset] of [[-4,4],[4,-4]]) {
    const f=fixture();f.buffers[0]=new Uint8Array(40);new Float32Array(f.buffers[0].buffer).set([0,0,0,0,1,0,1,1,0]);
    f.document.bufferViews[0].byteOffset=viewOffset;f.document.accessors[0].byteOffset=accessorOffset;
    assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/独立为安全非负/);
  }
});
test('individually misaligned offsets cannot cancel into an aligned address',()=>{
  const f=fixture();f.buffers[0]=new Uint8Array(40);
  new Float32Array(f.buffers[0].buffer,4,9).set([0,0,0,0,1,0,1,1,0]);
  f.document.bufferViews[0].byteOffset=1;f.document.bufferViews[0].byteLength=39;f.document.accessors[0].byteOffset=3;
  assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/独立对齐/);
});
test('offsets and view length must each be safe nonnegative integers without false defaulting',()=>{
  for(const [target,key,value] of [
    ['view','byteOffset',null],['view','byteOffset',.5],['accessor','byteOffset',null],['accessor','byteOffset',-1],
    ['view','byteLength',-1],['view','byteLength',36.5],['view','byteLength',Number.MAX_SAFE_INTEGER+1],
  ]) {
    const f=fixture();(target==='view'?f.document.bufferViews[0]:f.document.accessors[0])[key]=value;
    assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/安全非负/);
  }
});
test('explicit stride rejects zero, null, fractional, unaligned and out-of-spec oversized layouts',()=>{
  for(const stride of [0,null,-12,12.5,13,14,256,Number.MAX_SAFE_INTEGER+1]) {
    const f=fixture();f.document.bufferViews[0].byteStride=stride;
    assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/步长/);
  }
});
test('buffer view must fit its buffer even when the used accessor data alone would fit',()=>{
  const f=fixture();f.document.bufferViews[0].byteLength=40;
  assert.throws(()=>extractStaticGltf(f.document,f.buffers,.75),/边界/);
});
test('valid independently aligned offsets and interleaved vertex stride retain source transforms',()=>{
  const f=fixture();f.buffers[0]=new Uint8Array(56);
  const view=new DataView(f.buffers[0].buffer),positions=[[0,0,0],[0,1,0],[1,1,0]];
  positions.forEach((position,index)=>position.forEach((value,axis)=>view.setFloat32(8+index*16+axis*4,value,true)));
  f.document.bufferViews[0]={buffer:0,byteOffset:4,byteLength:52,byteStride:16};f.document.accessors[0].byteOffset=4;
  const m=extractStaticGltf(f.document,f.buffers,.75);
  assert.deepEqual(m.triangles[0],{a:[.1875,0,0],b:[-.1875,.75,0],c:[.1875,.75,0]});
});
