// This adapter only talks to the isolated, loopback-only project worker.
const ORIGIN = 'http://127.0.0.1:4197';
const kinds = ['cabin', 'lighthouse', 'palm', 'boat'];
function errorMessage(value) { return String(value || '本机模型没有返回有效结果。').slice(0,1000); }
async function json(response) {
  if(!response.ok) { let detail='';try {const body=await response.json();detail=errorMessage(body.error||body.detail||'');}catch{} throw new Error(`本机模型服务 HTTP ${response.status}${detail?`：${detail}`:'。'}`); }
  return response.json();
}
function filePath(value,taskId) {
  const prefix=`/assets/neural/local-jobs/${taskId}/`;
  if(typeof value!=='string'||!value.startsWith(prefix)||!/^[a-zA-Z0-9_-]+\.(?:glb|json)$/.test(value.slice(prefix.length)))throw new Error('本机结果路径与实际任务不匹配。');
  return value;
}
export async function getLocal3DHealth({fetchImpl=fetch,signal}={}) {
  return json(await fetchImpl(`${ORIGIN}/health`,{signal}));
}
export async function generateLocal3DAsset({imageBlob,kind,signal,onProgress=()=>{},fetchImpl=fetch,pollInterval=1000,timeoutMs=900000}={}) {
  if(!(imageBlob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(imageBlob.type)||imageBlob.size<1||imageBlob.size>8*1048576)throw new Error('请选择不超过 8 MiB 的 PNG、JPEG 或 WebP。');
  if(!kinds.includes(kind))throw new Error('本机模型对象类型无效。');
  const health=await getLocal3DHealth({fetchImpl,signal});
  if(health.status!=='ready')throw new Error('本机模型尚未就绪，请检查隔离服务。');
  const form=new FormData();form.append('image',imageBlob,'reference.png');form.append('kind',kind);
  const submitted=await json(await fetchImpl(`${ORIGIN}/tasks`,{method:'POST',body:form,signal}));
  const taskId=submitted.taskId;
  if(typeof taskId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(taskId))throw new Error('本机服务未返回实际任务 ID。');
  const started=Date.now();let previous='';
  while(true){
    signal?.throwIfAborted();
    if(Date.now()-started>timeoutMs)throw new Error(`本机任务 ${taskId} 等待超时，可在任务记录中继续查看实际状态。`);
    const task=await json(await fetchImpl(`${ORIGIN}/tasks/${taskId}`,{signal}));
    if(task.taskId!==taskId||!['queued','running','succeeded','failed'].includes(task.status))throw new Error('本机任务状态无效。');
    const state=`${task.status}:${task.stage||''}`;
    if(state!==previous){onProgress({stage:task.status,taskId,message:`本机 TripoSR · ${task.stage||task.status}`});previous=state;}
    if(task.status==='failed')throw new Error(errorMessage(task.error));
    if(task.status==='succeeded'){
      const output=task.output;
      if(!output||!Number.isSafeInteger(output.bytes)||output.bytes<1||output.bytes>64*1048576||typeof output.sha256!=='string'||!/^[a-f0-9]{64}$/.test(output.sha256))throw new Error('本机模型结果缺少真实文件校验记录。');
      const glbUrl=filePath(output.glbUrl,taskId),manifestUrl=filePath(output.manifestUrl,taskId);
      const response=await fetchImpl(glbUrl,{signal});
      if(!response.ok)throw new Error('本机 GLB 未能读取。');
      const glbBlob=await response.blob(),buffer=await glbBlob.arrayBuffer();
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(glbBlob.size!==output.bytes||digest!==output.sha256)throw new Error('本机 GLB 与实际输出校验记录不一致。');
      const header=new DataView(buffer);if(buffer.byteLength<12||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==buffer.byteLength)throw new Error('本机结果不是完整 GLB 2.0。');
      return {glbBlob,glbUrl,remoteUrl:glbUrl,taskId,provider:output.provider||health.provider,model:output.model||health.model,license:output.license,receipt:{...output.receipt,taskId,manifestUrl,bytes:output.bytes,sha256:output.sha256}};
    }
    await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('已取消','AbortError'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},pollInterval);
      signal?.addEventListener('abort',abort,{once:true});
    });
  }
}
