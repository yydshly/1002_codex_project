import {extractStaticGltf,sha256} from './mesh.js';
import {analyzeSurfaces,analyzeLampBase,tableObstacles,recommendPlacement,SUPPORT_POLICY} from './geometry.js';

function registeredHeight(normalization, policyVersion, height, label) {
  if(!normalization || normalization.policyVersion!==policyVersion || normalization.upAxis!=='+Y' ||
    normalization.sourceUnit!=='meter' || normalization.targetDesignHeightMeters!==height) {
    throw new Error(`${label}归一化登记不匹配：需要 ${policyVersion}、+Y、meter 与 ${height} m 设计高度`);
  }
  return normalization.targetDesignHeightMeters;
}

export async function loadRegisteredMesh(asset,readBytes,targetHeight) {
  const loaded=new Map();
  await Promise.all(asset.files.map(async file=>{
    const bytes=await readBytes(file.path);
    if(bytes.byteLength!==file.bytes || await sha256(bytes)!==file.sha256) throw new Error(`源文件指纹不匹配：${file.path}`);
    loaded.set(file.path,bytes);
  }));
  const fingerprint=await sha256(asset.files.slice().sort((a,b)=>a.path.localeCompare(b.path,'en')).map(f=>`${f.path}:${f.sha256}\n`).join(''));
  if(fingerprint!==asset.sourceFingerprint) throw new Error('源资产包指纹不匹配');
  const file=loaded.get(asset.modelPath);
  if(!file) throw new Error('源模型缺失');
  const document=JSON.parse(new TextDecoder().decode(file));
  const directory=asset.modelPath.slice(0,asset.modelPath.lastIndexOf('/')+1);
  const buffers=document.buffers.map(buffer=>{
    if(typeof buffer.uri!=='string'||buffer.uri.includes(':')||buffer.uri.split('/').includes('..')||buffer.uri.startsWith('/')) throw new Error('不支持外部或缺失的几何引用');
    const value=loaded.get(directory+buffer.uri);
    if(!value||value.byteLength!==buffer.byteLength) throw new Error('源几何缓冲区不完整');
    return value;
  });
  return extractStaticGltf(document,buffers,targetHeight);
}

export function analyzeTable(mesh,base) {
  const analysis=analyzeSurfaces(mesh.triangles);
  if(!analysis.valid) return {...analysis,mesh};
  const surfaces=analysis.surfaces.map(surface=>{
    const obstacles=tableObstacles(mesh.triangles,surface);
    const recommendation=recommendPlacement(surface,base,{obstacles});
    return {...surface,obstacles,recommendation};
  });
  return {...analysis,mesh,surfaces,usableSurfaces:surfaces.filter(s=>s.recommendation.valid).length};
}

export async function prepareSupport(manifest,lamp,readBytes,onProgress=()=>{}) {
  // Freeze one explicit normalization rule per asset class before reading data.
  // Low-level loadRegisteredMesh retains an explicit-height API for historical
  // descriptors; the current product entry point requires registered metadata.
  const tableHeight=registeredHeight(manifest?.normalization,'table-height-075-v1',.75,'桌资产');
  const lampHeight=registeredHeight(lamp?.normalization,'lamp-height-052-v1',.52,'灯资产');
  if(!Array.isArray(manifest.assets)) throw new Error('桌资产登记列表无效');
  onProgress('先核查阅读灯的真实底座…');
  const lampMesh=await loadRegisteredMesh(lamp,readBytes,lampHeight),lampResult=analyzeLampBase(lampMesh.triangles);
  if(!lampResult.valid) throw new Error(`灯底无法可靠分析：${lampResult.reason}`);
  const tables=[];
  for(const asset of manifest.assets) {
    onProgress(`正在核查${asset.label}的台面…`);
    try {const mesh=await loadRegisteredMesh(asset,readBytes,tableHeight);tables.push({asset,...analyzeTable(mesh,lampResult.base)});}
    catch(error){tables.push({asset,valid:false,reason:error.message});}
  }
  return {policy:SUPPORT_POLICY.version,lamp:{asset:lamp,mesh:lampMesh,base:lampResult.base,evidence:lampResult.evidence},tables};
}
