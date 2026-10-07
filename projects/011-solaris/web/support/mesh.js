import { Matrix4, Quaternion, Vector3 } from '../studio/vendor/three.module.js';

const demand = (ok, message) => { if (!ok) throw new Error(message); };
const finite = values => values.every(Number.isFinite);
const types = {5121:{bytes:1,get:'getUint8'},5123:{bytes:2,get:'getUint16'},5125:{bytes:4,get:'getUint32'},5126:{bytes:4,get:'getFloat32'}};
// This material extension leaves source geometry unchanged and is supported by
// the bundled renderer. Unknown required extensions cannot be silently ignored.
const supportedRequiredExtensions = new Set(['KHR_materials_emissive_strength']);
const safeNonnegative = value => Number.isSafeInteger(value) && value >= 0;

/** Extract source triangles before any presentation decoration is added.
 * Only uncompressed static glTF 2 triangle meshes in the registered local scene.
 * Node matrices are composed in hierarchy order; reflection reverses winding.
 */
export function extractStaticGltf(document, buffers, targetHeight) {
  demand(document?.asset?.version === '2.0', '仅支持登记的 glTF 2.0 静态资产');
  demand(Number.isFinite(targetHeight) && targetHeight > 0, '设计高度必须明确且大于零');
  demand(!document.animations?.length && !document.skins?.length, '动画和蒙皮不在本轮范围内');
  demand(document.extensionsRequired === undefined || (Array.isArray(document.extensionsRequired) &&
    document.extensionsRequired.every(extension => typeof extension === 'string' && supportedRequiredExtensions.has(extension))), '未接入的必需扩展不能忽略');
  demand(document.extensionsUsed === undefined || (Array.isArray(document.extensionsUsed) && document.extensionsUsed.every(extension => typeof extension === 'string')), '扩展列表格式无效');
  demand((document.extensionsRequired || []).every(extension => document.extensionsUsed?.includes(extension)), '必需扩展必须登记到 extensionsUsed');
  demand(!(document.extensionsUsed || []).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_mesh_quantization','EXT_mesh_gpu_instancing'].includes(x)), '压缩、量化或实例扩展未接入');
  demand(Array.isArray(document.nodes) && Array.isArray(document.meshes), '源资产缺少节点或三角网格');
  demand(document.nodes.length <= 2000 && document.meshes.length <= 1000, '资产节点数超出范围');
  const accessor = (index, dimensions, allowed) => {
    const a=document.accessors?.[index], expected=dimensions===3?'VEC3':'SCALAR';
    demand(a && a.type===expected && !a.sparse && !a.normalized && allowed.includes(a.componentType), '不支持的顶点或索引访问器');
    demand(Number.isSafeInteger(a.count) && a.count>0 && a.count<=200000, '访问器资源上限或数量无效');
    const v=document.bufferViews?.[a.bufferView], format=types[a.componentType];
    const bytes=buffers[v?.buffer];
    demand(safeNonnegative(a.bufferView) && v && safeNonnegative(v.buffer) && bytes instanceof Uint8Array && format, '缺少完整几何缓冲区');
    const viewOffset=v.byteOffset===undefined?0:v.byteOffset, accessorOffset=a.byteOffset===undefined?0:a.byteOffset, packed=dimensions*format.bytes;
    const stride=v.byteStride===undefined?packed:v.byteStride;
    demand(safeNonnegative(viewOffset) && safeNonnegative(accessorOffset) && safeNonnegative(v.byteLength), '缓冲视图及访问器偏移、长度必须独立为安全非负整数');
    demand(viewOffset%format.bytes===0 && accessorOffset%format.bytes===0, '缓冲视图及访问器偏移必须独立对齐');
    demand(Number.isSafeInteger(stride) && stride>=packed && stride%format.bytes===0 &&
      (v.byteStride===undefined || (stride>=4 && stride<=252 && stride%4===0)), '访问器步长无效或未对齐');
    const start=viewOffset+accessorOffset, viewEnd=viewOffset+v.byteLength, end=start+(a.count-1)*stride+packed;
    demand(Number.isSafeInteger(start) && Number.isSafeInteger(viewEnd) && Number.isSafeInteger(end) &&
      viewEnd<=bytes.byteLength && end<=viewEnd && end<=bytes.byteLength, '访问器越过缓冲区边界');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), values=[];
    for(let i=0;i<a.count;i++) {
      const row=[];
      for(let j=0;j<dimensions;j++) row.push(view[format.get](start+i*stride+j*format.bytes,true));
      demand(finite(row), '源几何包含非有限坐标'); values.push(dimensions===1?row[0]:row);
    }
    return values;
  };
  const triangles=[], visited=new Set();
  const visit=(id,parent,depth)=>{
    demand(Number.isSafeInteger(id) && document.nodes[id] && depth<=64 && !visited.has(id), '源节点有循环、重复父节点或过深层级');
    visited.add(id); const node=document.nodes[id];
    demand(node.skin===undefined && !node.weights?.length, '骨骼或形变节点不在范围内');
    demand(node.matrix===undefined || !['translation','rotation','scale'].some(key=>Object.hasOwn(node,key)), '节点不能同时提供 matrix 与 TRS');
    const local=new Matrix4();
    if(node.matrix!==undefined) {demand(Array.isArray(node.matrix) && node.matrix.length===16 && finite(node.matrix), '节点矩阵无效');local.fromArray(node.matrix);}
    else {
      const p=node.translation===undefined?[0,0,0]:node.translation,q=node.rotation===undefined?[0,0,0,1]:node.rotation,s=node.scale===undefined?[1,1,1]:node.scale;
      demand(Array.isArray(p)&&Array.isArray(q)&&Array.isArray(s)&&p.length===3&&q.length===4&&s.length===3&&finite([...p,...q,...s]), '节点变换无效');
      demand(Math.abs(Math.hypot(...q)-1)<1e-5, '旋转四元数必须归一化');
      local.compose(new Vector3(...p),new Quaternion(...q),new Vector3(...s));
    }
    demand(local.elements[3]===0 && local.elements[7]===0 && local.elements[11]===0 && local.elements[15]===1, '不支持投影节点矩阵');
    const matrix=parent.clone().multiply(local),det=matrix.determinant();
    demand(Number.isFinite(det)&&Math.abs(det)>1e-12, '节点变换不可逆');
    if(node.mesh!==undefined) {
      const mesh=document.meshes[node.mesh]; demand(mesh && !mesh.weights?.length, '源网格无效或含形变');
      for(const primitive of mesh.primitives) {
        demand((primitive.mode??4)===4 && !primitive.targets?.length && !primitive.extensions?.KHR_draco_mesh_compression, '仅支持完整静态三角片');
        const positions=accessor(primitive.attributes?.POSITION,3,[5126]);
        const indices=primitive.indices===undefined?positions.map((_,i)=>i):accessor(primitive.indices,1,[5121,5123,5125]);
        demand(indices.length%3===0, '三角索引数量无效');
        for(let i=0;i<indices.length;i+=3) {
          const order=det<0?[indices[i],indices[i+2],indices[i+1]]:indices.slice(i,i+3);
          demand(order.every(k=>Number.isSafeInteger(k)&&k>=0&&k<positions.length), '三角索引超出顶点范围');
          const [a,b,c]=order.map(k=>new Vector3(...positions[k]).applyMatrix4(matrix).toArray());
          demand(finite([...a,...b,...c]), '节点变换产生非有限坐标');
          triangles.push({a,b,c}); demand(triangles.length<=60000, '源三角数超出60,000上限');
        }
      }
    }
    for(const child of node.children||[]) visit(child,matrix,depth+1);
  };
  const scene=document.scenes?.[document.scene??0]; demand(scene?.nodes?.length, '默认场景为空');
  for(const id of scene.nodes) visit(id,new Matrix4(),0);
  demand(triangles.length>0, '源场景没有可分析三角形');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const t of triangles) for(const v of [t.a,t.b,t.c]) for(let a=0;a<3;a++){min[a]=Math.min(min[a],v[a]);max[a]=Math.max(max[a],v[a]);}
  demand(max[1]-min[1]>1e-8, '源高度无法归一化');
  const factor=targetHeight/(max[1]-min[1]), translation=[-(min[0]+max[0])*factor/2,-min[1]*factor,-(min[2]+max[2])*factor/2];
  const normalized=triangles.map(t=>Object.fromEntries(['a','b','c'].map(k=>[k,t[k].map((n,a)=>n*factor+translation[a])])));
  return {triangles:normalized,normalization:{strategy:'uniform-height-xz-center-minY-floor',targetDesignHeightMeters:targetHeight,factor,translation,sourceBounds:{min,max}},bounds:{min:min.map((n,a)=>n*factor+translation[a]),max:max.map((n,a)=>n*factor+translation[a])},triangleCount:triangles.length};
}

export async function sha256(bytes) {
  const value=bytes instanceof Uint8Array?bytes:new TextEncoder().encode(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),n=>n.toString(16).padStart(2,'0')).join('');
}
