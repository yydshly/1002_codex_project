import fs from 'node:fs/promises';
import {createCampProposal,addCampVariant,validateCampProposal} from '../web/camp-core.js';
import {fingerprintPlan} from '../web/model-scene-core.js';
const candidate=JSON.parse(await fs.readFile(new URL('../assets/fine-scene-scoped-v5.export.json',import.meta.url),'utf8')).scene;
const original='plan-v1-162afc9e3f46f3aa-22227';
if(fingerprintPlan(candidate.sourcePlan)!==original)throw Error('Original source drift');
let proposal=addCampVariant(createCampProposal(candidate.sourcePlan),candidate,{id:'a',title:'原海岛 · 已保存精修',description:'沿用原三岛、木屋、红白灯塔、八棵棕榈与七艘船的v5结果，继续完善同一个场景。'});
proposal.title='原海岛 · 场景提案';
proposal.summary='继续使用原来的三座岛、木屋、红白灯塔、棕榈和船只。保留25个来源对象和已有精修，在这份场景上补充介绍、参考、镜头与局部方案。';
for(const object of proposal.objects){const entity=proposal.sourcePlan.entities.find(e=>e.id===object.id);if(entity.kind==='cabin'){object.name='海岸木屋';object.description='原布局中的木屋，保留既有位置和精修造型。';}if(entity.kind==='lighthouse'){object.name='红白灯塔';object.description='原海岛的灯塔，保留原对象身份、位置、尺寸与红白外观。';}if(entity.kind==='land'){object.name=`原海岛 ${proposal.objects.filter(o=>proposal.sourcePlan.entities.find(e=>e.id===o.id)?.kind==='land').findIndex(o=>o.id===object.id)+1}`;object.description='来自用户原绘笔轮廓，继续作为当前场景的空间依据。';}}
proposal=validateCampProposal(proposal);
await fs.writeFile(new URL('../web/assets/camp/original.json',import.meta.url),JSON.stringify(proposal,null,2)+'\n');
console.log(JSON.stringify({sourceFingerprint:original,objects:proposal.objects.length,fineObjects:candidate.geometry.instances.length,geometryJob:candidate.geometryReceipt.id}));
