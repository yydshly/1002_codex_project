import { createDemoPlan, validatePlan } from '../creation-core.js';
import { validateModelCandidate, fingerprintPlan, createSceneGLB } from '../model-scene-core.js';
const frame = document.getElementById('preview'), button = document.getElementById('run'), results = document.getElementById('results'), state = document.getElementById('state');
const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function check(name, fn) { try { fn(); checks.push({name,pass:true}); } catch (error) { checks.push({name,pass:false,error:error.message}); } const li=document.createElement('li');li.className=checks.at(-1).pass?'pass':'fail';li.textContent=(checks.at(-1).pass?'✓ ':'✗ ')+name+(checks.at(-1).error?': '+checks.at(-1).error:'');results.append(li); }
function waitFor(test, timeout=20000) { return new Promise((resolve,reject)=>{const start=performance.now();const poll=()=>{if(test())resolve();else if(performance.now()-start>timeout)reject(new Error('预览等待超时'));else setTimeout(poll,30);};poll();}); }
function group(mesh,id) { const g=mesh.groups.find(g=>g.id===id); assert(g,`缺少 ${id} 几何分组`); const start=g.start*3,end=(g.start+g.count)*3;return {positions:Array.from(mesh.positions).slice(start,end),normals:Array.from(mesh.normals).slice(start,end),colors:Array.from(mesh.colors).slice(start,end)}; }
let fixture, candidate;
button.addEventListener('click',async()=>{
  button.disabled=true;results.replaceChildren();checks.length=0;document.getElementById('pick-guide').hidden=true;state.textContent='正在检查真实 GPU 几何…';
  try {
    await waitFor(()=>frame.contentWindow.modelScenePreview?.ready);
    const api=frame.contentWindow.modelScenePreview;
    fixture=createDemoPlan();
    const locked=fixture.entities.find(e=>e.kind==='lighthouse'); locked.locked=true;
    const land=fixture.entities.find(e=>e.kind==='land'); land.refinement={preset:'tropical',seed:23,density:2,beach:true,rocks:true,vegetation:true};
    fixture=validatePlan(fixture);
    candidate=validateModelCandidate(await (await fetch('../model-scene-candidate.json')).json(),fixture);
    const inputFingerprint=fingerprintPlan(fixture), source=JSON.stringify(fixture);
    // Each core checks ordinary objects in its own realm, as normal postMessage delivery does.
    const childPlan=()=>frame.contentWindow.JSON.parse(JSON.stringify(fixture));
    const childCandidate=()=>frame.contentWindow.JSON.parse(JSON.stringify(candidate));
    const exportMesh=()=>JSON.parse(JSON.stringify(api.exportMesh()));
    await api.applyPlan(childPlan(),null); await waitFor(()=>!api.stats.inFlight&&api.stats.rendered>0); const before=exportMesh(), baseStats=api.stats;
    await api.applyPlan(childPlan(),childCandidate()); await waitFor(()=>!api.stats.inFlight&&api.stats.triangles>baseStats.triangles); const after=exportMesh(), refinedStats=api.stats;
    check('候选由真实 WebGPU 渲染且增加几何细节',()=>assert(refinedStats.renderer==='WebGPU'&&refinedStats.triangles>baseStats.triangles,'几何未增加'));
    check('原始布局和锁定信息保持一致',()=>assert(JSON.stringify(fixture)===source&&fingerprintPlan(JSON.parse(JSON.stringify(api.plan)))===inputFingerprint,'布局被改写'));
    check('原对象 ID 与分组继续存在',()=>assert(fixture.entities.every(e=>after.groups.some(g=>g.id===e.id)),'对象 ID 丢失'));
    check('锁定灯塔的全部几何和颜色保持原样',()=>assert(JSON.stringify(group(before,locked.id))===JSON.stringify(group(after,locked.id)),'锁定灯塔被改写'));
    check('原水域位置与水位几何保持原样',()=>{for(const e of fixture.entities.filter(e=>e.kind==='water'))assert(JSON.stringify(group(before,e.id).positions)===JSON.stringify(group(after,e.id).positions),'水位或轮廓变化');});
    check('小屋、棕榈与船具有更细致的真实几何',()=>{for(const kind of ['cabin','palm','boat']){const id=fixture.entities.find(e=>e.kind===kind).id;assert(group(after,id).positions.length>group(before,id).positions.length,`${kind} 未增加细节`);}});
    check('完整候选在 120000 三角形预算内，属性为有限数值',()=>assert(refinedStats.triangles<=120000&&['positions','normals','colors'].every(k=>Array.from(after[k]).every(Number.isFinite)),'预算或有限值错误'));
    const binary=createSceneGLB(after,{title:candidate.title}); const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
    check('可导出包含真实顶点与颜色的 GLB 二进制',()=>assert(view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===binary.byteLength,'GLB 头错误'));
    const jsonLength=view.getUint32(12,true), manifest=JSON.parse(new TextDecoder().decode(binary.slice(20,20+jsonLength)).trim());
    check('GLB 保留原对象 ID 分组和位置法线颜色属性',()=>assert(fixture.entities.every(e=>manifest.nodes.some(n=>n.name===e.id))&&manifest.meshes.every(m=>m.primitives.every(p=>p.attributes.POSITION!==undefined&&p.attributes.NORMAL!==undefined&&p.attributes.COLOR_0!==undefined)),'GLB 分组或属性缺失'));
    await api.applyPlan(childPlan(),null);const reset=exportMesh();
    check('切回粗模恢复完全相同的原几何',()=>assert(JSON.stringify(before)===JSON.stringify(reset),'粗模恢复失败'));
    await api.applyPlan(childPlan(),childCandidate());await waitFor(()=>!api.stats.inFlight);const rebuilt=exportMesh();
    check('同一模型代码候选重复运行得到相同几何',()=>assert(JSON.stringify(after)===JSON.stringify(rebuilt),'重建不确定'));
    const selectTarget=fixture.entities.find(e=>e.kind==='cabin');api.select(selectTarget.id);api.camera('detail');await waitFor(()=>!api.stats.inFlight);
    const point=api.projectEntity(selectTarget.id), rect=frame.getBoundingClientRect();
    api.select(null);
    const guide=document.getElementById('pick-guide');guide.hidden=false;guide.textContent=`真实拾取验证：点击小屋中心，页面坐标 x=${Math.round(rect.left+point.x)}，y=${Math.round(rect.top+point.y)}。目标 ${selectTarget.id}。`;
    document.body.dataset.pickId=selectTarget.id;document.body.dataset.binaryBytes=binary.byteLength;
    window.modelSceneCheckReport={checks,baseStats,refinedStats,binaryBytes:binary.byteLength,sourceFingerprint:inputFingerprint};
    state.textContent=`${checks.filter(c=>c.pass).length}/${checks.length} 项通过 · 粗模 ${baseStats.triangles} → 候选 ${refinedStats.triangles} 三角形 · GLB ${binary.byteLength} 字节`;
  } catch(error) { state.textContent=`检查失败：${error.message}`; }
  button.disabled=false;
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='tidewater-model-preview'||event.data.type!=='select'||!document.body.dataset.pickId)return;
  if(checks.some(item=>item.name==='真实点击候选几何可拾取原小屋 ID'))return;
  check('真实点击候选几何可拾取原小屋 ID',()=>assert(event.data.id===document.body.dataset.pickId,'拾取 ID 不一致'));
  state.textContent=`${checks.filter(c=>c.pass).length}/${checks.length} 项通过 · 已验证真实点击拾取`;
});
