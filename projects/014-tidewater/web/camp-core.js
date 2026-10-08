import {validatePlan} from './creation-core.js';
import {fingerprintPlan} from './model-scene-core.js';
import {validateCompletionRecipe} from './scene-completion-core.js';
import {validateFineGeometry} from './fine-geometry-core.js';
import {assertFineRefinementPreserved} from './fine-refinement-core.js';
export const CAMP_FORMAT='tidewater-camp-proposal.v1';
export const CAMP_ROLES={stay:'住宿木屋',reception:'接待与公共空间',landscape:'植物与景观',water:'水域',path:'步道',boat:'水上活动',landmark:'标志物',other:'场地区域'};
const copy=v=>structuredClone(v), fail=m=>{throw new Error(m);};
function text(v,max,label,empty=false){if(typeof v!=='string'||v.length>max||!empty&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v))fail(`${label}无效。`);return v;}
function id(v){if(typeof v!=='string'||!/^[a-zA-Z0-9][\w-]{0,63}$/u.test(v))fail('提案对象ID无效。');return v;}
function fields(v,keys,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))fail(`${label}字段无效。`);}
export function createCampPlan(){
 const entity=(id,kind,points,height,locked=false)=>({id,kind,points:points.map(([x,y])=>({x,y})),height,locked});
 return validatePlan({version:1,name:'潮岸木屋营地',entry:'layout',intent:'120×80米的海边木屋营地概念方案。六间住宿木屋与一间接待屋，浅色木结构、坡屋顶、门廊和清晰门窗；植物自然，保留原岸线、道路、数量、位置和高度。',world:{width:120,depth:80},style:{lighting:'day',waterColor:'#468f9c',landColor:'#798b65'},reference:null,entities:[
 entity('camp-coast','land',[[.06,.08],[.92,.08],[.94,.61],[.84,.77],[.68,.82],[.38,.84],[.13,.79],[.05,.62]],2.4,true),
 entity('camp-sea','water',[[.02,.86],[.98,.86],[.98,.98],[.02,.98]],0,true),
 entity('camp-main-path','road',[[.12,.46],[.83,.46]],.15,true),
 entity('camp-entry-path','road',[[.51,.76],[.51,.46]],.15,true),
 ...[.25,.5,.75].flatMap((x,i)=>[entity(`camp-stay-${i+1}`,'cabin',[[x,.28]],5.2),entity(`camp-stay-${i+4}`,'cabin',[[x,.64]],5.2),entity(`camp-path-${i+1}`,'road',[[x,.33],[x,.59]],.15,true)]),
 entity('camp-reception','cabin',[[.12,.64]],6),
 entity('camp-palm-1','palm',[[.1,.25]],9),entity('camp-palm-2','palm',[[.9,.32]],10),entity('camp-palm-3','palm',[[.85,.65]],9),
 entity('camp-boat-1','boat',[[.72,.92]],1.5)]});
}
export function validateCampCandidate(value,plan){
 if(!value||typeof value!=='object')fail('模型候选无效。');
 const candidate=copy(value);candidate.sourcePlan=validatePlan(candidate.sourcePlan);
 if(fingerprintPlan(candidate.sourcePlan)!==fingerprintPlan(plan))fail('候选来自另一份布局，无法作为同空间方案对比。');
 candidate.recipe=validateCompletionRecipe(candidate.recipe,plan);
 candidate.geometry=validateFineGeometry(candidate.geometry,plan,{baseRecipe:candidate.recipe});
 if(candidate.geometryIterations!=null&&!Array.isArray(candidate.geometryIterations))fail('候选版次无效。');
 for(const iteration of candidate.geometryIterations??[])validateFineGeometry(iteration.geometry,plan,{baseRecipe:candidate.recipe});
 if(candidate.fineEdit)candidate.fineEdit=assertFineRefinementPreserved(candidate.geometryIterations?.at(-1)?.geometry,candidate.geometry,plan,candidate.fineEdit.scopeIds,{baseRecipe:candidate.recipe});
 return candidate;
}
export function createCampProposal(input=createCampPlan()){
 const sourcePlan=validatePlan(input),counts={};if(!sourcePlan.entities.length)fail('请先创建非空场景布局。');
 const closeup=sourcePlan.entities.find(e=>e.id==='camp-reception')??sourcePlan.entities.find(e=>e.kind==='cabin')??sourcePlan.entities.find(e=>['lighthouse','palm','boat'].includes(e.kind))??sourcePlan.entities[0];
 const objects=sourcePlan.entities.map(e=>{const n=counts[e.kind]=(counts[e.kind]??0)+1,role=e.id==='camp-reception'?'reception':({cabin:'stay',palm:'landscape',water:'water',road:'path',boat:'boat',lighthouse:'landmark'})[e.kind]??'other';
 return {id:e.id,name:e.id==='camp-reception'?'接待与公共屋':`${CAMP_ROLES[role]} ${n}`,role,description:role==='stay'?'独立住宿木屋，概念阶段；可补充房型、用途与设计说明。':'',note:'',reference:null};});
 return {format:CAMP_FORMAT,id:crypto.randomUUID(),title:sourcePlan.name,summary:'沿用当前布局中的空间与对象。先确认空间，再完善外观，用同一个场景讨论方案。',intent:sourcePlan.intent,sourcePlan,variants:[{id:'a',title:'方案 A · 浅色木屋',description:'依据原布局生成的营地候选。',candidate:null}],activeVariantId:'a',objects,views:[{id:'overview',name:'场景总览',preset:'overview',entityId:null,state:null},{id:'coast',name:'海岸视角',preset:'hero',entityId:null,state:null},{id:'reception',name:closeup.id==='camp-reception'?'接待与公共屋':closeup.kind==='cabin'?'建筑近景':'物体近景',preset:null,entityId:closeup.id,state:null}],savedAt:null};
}
export function validateCampProposal(input){
 fields(input,['format','id','title','summary','intent','sourcePlan','variants','activeVariantId','objects','views','savedAt'],'营地提案');
 if(input.format!==CAMP_FORMAT)fail('请选择营地提案JSON。');
 const plan=validatePlan(input.sourcePlan),ids=new Set(plan.entities.map(e=>e.id)),seen=new Set();if(!ids.size)fail('提案须包含非空场景布局。');
 if(!Array.isArray(input.objects)||input.objects.length!==ids.size)fail('对象信息必须与布局一一对应。');
 const objects=input.objects.map(o=>{fields(o,['id','name','role','description','note','reference'],'对象信息');if(!ids.has(o.id)||seen.has(o.id)||!CAMP_ROLES[o.role])fail('对象信息出现未知、重复ID或用途。');seen.add(o.id);const reference=o.reference?validatePlan({...plan,reference:o.reference}).reference:null;return {id:o.id,name:text(o.name,80,'对象名称'),role:o.role,description:text(o.description,1000,'对象介绍',true),note:text(o.note,1000,'内部备注',true),reference};});
 if(!Array.isArray(input.variants)||!input.variants.length||input.variants.length>3)fail('提案须有1至3个方案。');
 const variants=input.variants.map(v=>{fields(v,['id','title','description','candidate'],'方案');return {id:id(v.id),title:text(v.title,100,'方案名称'),description:text(v.description,1000,'方案说明',true),candidate:v.candidate?validateCampCandidate(v.candidate,plan):null};});
 if(new Set(variants.map(v=>v.id)).size!==variants.length||!variants.some(v=>v.id===input.activeVariantId))fail('方案选择或ID无效。');
 if(!Array.isArray(input.views)||input.views.length>8)fail('最多保存8个提案视角。');
 const views=input.views.map(v=>{fields(v,['id','name','preset','entityId','state'],'视角');if(![v.preset!==null,v.entityId!==null,v.state!==null].filter(Boolean).length||[v.preset!==null,v.entityId!==null,v.state!==null].filter(Boolean).length!==1)fail('视角须有唯一的来源。');if(v.preset!==null&&!['overview','hero','top'].includes(v.preset)||v.entityId!==null&&!ids.has(v.entityId))fail('视角来源无效。');if(v.state){fields(v.state,['position','target'],'镜头');if(!['position','target'].every(k=>Array.isArray(v.state[k])&&v.state[k].length===3&&v.state[k].every(n=>Number.isFinite(n)&&Math.abs(n)<=Math.max(plan.world.width,plan.world.depth)*20))||Math.hypot(...v.state.position.map((n,i)=>n-v.state.target[i]))<.01)fail('保存的镜头无效。');}return {id:id(v.id),name:text(v.name,60,'视角名称'),preset:v.preset,entityId:v.entityId,state:copy(v.state)};});
 if(new Set(views.map(v=>v.id)).size!==views.length)fail('视角ID重复。');
 if(input.savedAt!==null&&(typeof input.savedAt!=='string'||!Number.isFinite(Date.parse(input.savedAt))))fail('保存时间无效。');
 return {format:CAMP_FORMAT,id:id(input.id),title:text(input.title,100,'提案标题'),summary:text(input.summary,1600,'提案简介',true),intent:text(input.intent,6000,'生成目标',true),sourcePlan:plan,variants,activeVariantId:input.activeVariantId,objects,views,savedAt:input.savedAt};
}
export function addCampVariant(input,candidate,{id:variantId,title,description=''}){
 const proposal=validateCampProposal(input),valid=validateCampCandidate(candidate,proposal.sourcePlan);
 const variant={id:id(variantId),title,description,candidate:valid};const old=proposal.variants.findIndex(v=>v.id===variantId);if(old>=0)proposal.variants[old]=variant;else proposal.variants.push(variant);
 proposal.activeVariantId=variantId;proposal.savedAt=null;return validateCampProposal(proposal);
}
export function replaceCampGeneration(input,candidate){
 const proposal=validateCampProposal(input);if(proposal.variants.some(v=>v.candidate))proposal.id=crypto.randomUUID();
 proposal.variants=[{id:'a',title:'方案 A · 原布局生成',description:'模型依据当前布局与粗模生成。',candidate:null}];
 proposal.activeVariantId='a';return addCampVariant(proposal,candidate,{id:'a',title:'方案 A · 原布局生成',description:'模型依据当前布局与粗模生成。'});
}
