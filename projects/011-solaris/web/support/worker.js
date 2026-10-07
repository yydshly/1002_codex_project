import { prepareSupport } from './load.js';
import { createSupportController } from './controller.js';

let controller=null;
let queue=Promise.resolve();
const root=new URL('./',import.meta.url);
const fetchBytes=async path=>{
  const url=new URL(path,root);
  if(url.origin!==root.origin)throw new Error('研究工作台仅读取本地登记资产');
  const response=await fetch(url);if(!response.ok)throw new Error(`源文件读取失败：${path}`);
  return new Uint8Array(await response.arrayBuffer());
};
const manifest=async path=>JSON.parse(new TextDecoder().decode(await fetchBytes(path)));

/** Sequential worker requests preserve begin/update/commit and cancel order.
 * The worker has no storage access; export returns text for the UI's explicit save.
 */
async function dispatch(message){
  const {id,type,payload={}}=message??{};
  if(type==='init'){
    controller=null;
    const [tables,lamp]=await Promise.all([manifest('assets-manifest.json'),manifest('freestanding-lamp-manifest.json')]);
    const prepared=await prepareSupport(tables,lamp,fetchBytes,text=>self.postMessage({id,progress:text}));
    controller=createSupportController(prepared,{savedRaw:payload.savedRaw??null});
    return {...controller.dispatch('init'),analysis:controller.publicAnalysis()};
  }
  if(!controller)throw new Error('源模型与几何资料尚未就绪');
  return controller.dispatch(type,payload);
}
self.addEventListener('message',event=>{
  const message=event.data;
  queue=queue.then(async()=>{
    try{self.postMessage({id:message?.id,...await dispatch(message)});}
    catch(error){
      const reply=controller?controller.snapshot({ok:false,reason:error.message,fatal:false}):{ok:false,reason:error.message,fatal:true,state:null,
        status:{transactionActive:false,canUndo:false,canRedo:false,pendingSurfaceChoice:true},activeAssetId:null,worldPose:null,evidence:null};
      self.postMessage({id:message?.id,...reply});
    }
  });
});
