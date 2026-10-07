export const REVIEW_FIELDS = Object.freeze([
  ['identity', '脸与人物身份'], ['body', '体型与姿态'], ['shape', '领型与袖长'],
  ['detail', '图案与商品细节'], ['occlusion', '手臂与头发遮挡'], ['wear', '真实穿着依据'],
]);
export const REVIEW_VALUES = Object.freeze(['unreviewed','pass','uncertain','fail','no-reference']);
export function pairKey(person, garment, photoType) {
  if (![person,garment].every(x=>typeof x==='string'&&x.length>0&&x.length<=160)) throw new Error('缺少有效输入编号');
  if (!['model','flat-lay'].includes(photoType)) throw new Error('商品照片形式无效');
  return JSON.stringify([person,garment,photoType]);
}
export function emptyReview(){return Object.fromEntries(REVIEW_FIELDS.map(([id])=>[id,'unreviewed']));}
export function restoreJobSelection(saved,samples){
  if(!saved||!Array.isArray(samples)||typeof saved.jobId!=='string'||!/^[a-f0-9]{32}$/.test(saved.jobId))return null;
  const person=samples.find(s=>s.kind==='person'&&s.id===saved.personId),garment=samples.find(s=>s.kind==='garment'&&s.id===saved.garmentId);
  if(!person||!garment)return null;
  try{const inputKey=pairKey(person.id,garment.id,saved.photoType);return inputKey===saved.inputKey?{person,garment,photoType:saved.photoType,job:{id:saved.jobId,inputKey,status:'queued',knownTerminal:['succeeded','failed','cancelled'].includes(saved.status)}}:null;}catch{return null;}
}
export function validateReview(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==REVIEW_FIELDS.length)throw new Error('评审字段不完整');
  const copy={};for(const [id] of REVIEW_FIELDS){if(!Object.hasOwn(value,id)||!REVIEW_VALUES.includes(value[id])||(id!=='wear'&&value[id]==='no-reference'))throw new Error('评审选项无效');copy[id]=value[id];}return copy;
}
export function reviewSummary(value){const r=validateReview(value),all=Object.values(r);return{reviewed:all.filter(x=>!['unreviewed','no-reference'].includes(x)).length,failed:all.filter(x=>x==='fail').length,uncertain:all.filter(x=>x==='uncertain').length,missingReference:r.wear==='no-reference'};}
export function resultBelongsToPair(result,key){return !!result&&result.inputKey===key&&typeof result.image==='string';}
export function reviewRecord({inputKey,result,review,note}){
  if(!resultBelongsToPair(result,inputKey))throw new Error('生成结果与当前输入不一致');
  if(typeof note!=='string'||note.length>1200)throw new Error('观察记录过长');
  return {version:1,type:'atelier-real-person-review',inputKey,result:{kind:result.kind,jobId:result.jobId??null,metadata:result.metadata??null},review:validateReview(review),note,scope:'front-facing-upper-appearance; no-size-or-comfort-proof'};
}
