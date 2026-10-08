import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { fineRefinementScope, assertFineRefinementPreserved } from '../web/fine-refinement-core.js';

const plan={version:1,name:'Scoped fine edit',entry:'layout',intent:'',world:{width:100,depth:80},style:{lighting:'day',waterColor:'#468b95',landColor:'#9ca976'},reference:null,entities:[
  {id:'land',kind:'land',height:3,locked:false,points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]},
  {id:'cabin-a',kind:'cabin',height:7,locked:false,points:[{x:.3,y:.4}]},
  {id:'palm-a',kind:'palm',height:12,locked:false,points:[{x:.4,y:.5}]},
  {id:'cabin-b',kind:'cabin',height:7,locked:false,points:[{x:.65,y:.6}]},
  {id:'palm-b',kind:'palm',height:12,locked:false,points:[{x:.6,y:.3}]},
  {id:'locked-palm',kind:'palm',height:12,locked:true,points:[{x:.2,y:.2}]},
]};
const material=(id='paint')=>({id,label:'Paint',color:'#e0d8ce',roughness:.8,metalness:0,texture:'none',opacity:1,emissive:'#000000'});
const part=(id='body',mat='paint')=>({id,primitive:'box',material:mat,center:[0,.5,0],size:[.8,.8,.8],rotationDeg:[0,0,0],points:[],indices:[],repeat:{count:1,step:[0,0,0],turnDeg:[0,0,0]},segments:8});
const fixture=()=>({format:'tidewater-fine-geometry.v1',sourceFingerprint:fingerprintPlan(plan),title:'Model fine geometry',summary:'Pending visual review',materials:[material()],templates:[{id:'shared',label:'Shared template',parts:[part()]}],instances:plan.entities.filter(e=>!e.locked&&e.kind!=='land').map(e=>({entityId:e.id,templateId:'shared',rotationDeg:0}))});
function fork(previous,id='palm-a') {
  const next=structuredClone(previous),template={...structuredClone(previous.templates[0]),id:'local-fork'};
  template.parts[0].size[0]=.65;next.templates.push(template);next.instances.find(i=>i.entityId===id).templateId=template.id;
  return next;
}

test('selected, same-kind and complete scopes are explicit, exclude locks and follow source order',()=>{
  assert.deepEqual(fineRefinementScope(plan,'palm-b'),['palm-a','palm-b']);
  assert.deepEqual(fineRefinementScope(plan,'palm-b','selected'),['palm-b']);
  assert.deepEqual(fineRefinementScope(plan,'cabin-a','kind'),['cabin-a','cabin-b']);
  assert.equal(fineRefinementScope(plan,'palm-a','all'),null);
  for(const selected of ['land','locked-palm','missing',null,undefined])assert.equal(fineRefinementScope(plan,selected,'all'),null);
  const invalidPlan={...plan,world:{width:0,depth:80}};assert.throws(()=>fineRefinementScope(invalidPlan,null,'all'));
});

test('invalid selections, locks, unsupported kinds and modes cannot widen a local scope',()=>{
  for(const selected of ['missing','locked-palm','land',null])for(const mode of ['selected','kind'])assert.throws(()=>fineRefinementScope(plan,selected,mode),/未锁定/);
  assert.throws(()=>fineRefinementScope(plan,'palm-a','everything'),/模式/);
  const fixtureBundle=fixture();
  for(const scope of [null,[],['palm-a','palm-a'],['land'],['locked-palm'],['made-up']])assert.throws(()=>assertFineRefinementPreserved(fixtureBundle,fixtureBundle,plan,scope));
});

test('a scoped object can fork a shared template without affecting the other instances',()=>{
  const previous=fixture(),current=fork(previous),before=JSON.stringify({previous,current,plan});
  const result=assertFineRefinementPreserved(previous,current,plan,['palm-a']);
  assert.deepEqual(result.changedEntityIds,['palm-a']);assert.deepEqual(result.unchangedEntityIds,['cabin-a','cabin-b','palm-b']);assert.equal(result.preservedOutsideScope,true);
  assert.equal(JSON.stringify({previous,current,plan}),before);
});

test('editing a shared template directly is rejected despite unchanged outside instance records',()=>{
  const previous=fixture(),current=structuredClone(previous);current.templates[0].parts[0].size[0]=.5;
  assert.throws(()=>assertFineRefinementPreserved(previous,current,plan,['palm-a']),/范围外模板/);
});

test('material changes propagate through dependencies and require a local material fork',()=>{
  const previous=fixture(),invalid=fork(previous);invalid.materials[0].color='#ff0000';
  assert.throws(()=>assertFineRefinementPreserved(previous,invalid,plan,['palm-a']),/范围外材质/);
  const current=fork(previous);current.materials.push({...material('local-paint'),color:'#ff0000'});current.templates.find(t=>t.id==='local-fork').parts[0].material='local-paint';
  assert.deepEqual(assertFineRefinementPreserved(previous,current,plan,['palm-a']).changedEntityIds,['palm-a']);
});

test('an equivalent outside template rename is still a prohibited identity change',()=>{
  const previous=fixture(),current=structuredClone(previous);current.templates[0].id='renamed';current.instances.forEach(i=>{i.templateId='renamed';});
  assert.throws(()=>assertFineRefinementPreserved(previous,current,plan,['palm-a']),/范围外实例/);
});

test('outside part order, labels, transforms and referenced material values are protected',()=>{
  const previous=fixture();previous.templates[0].parts.push({...part('roof'),center:[0,.9,0],size:[1,.2,1]});
  for(const mutate of [next=>{next.templates[0].parts.reverse();},next=>{next.templates[0].label='Different label';},next=>{next.templates[0].parts[0].rotationDeg[0]=10;},next=>{next.materials[0].roughness=.2;}]){
    const current=structuredClone(previous);mutate(current);assert.throws(()=>assertFineRefinementPreserved(previous,current,plan,['palm-a']),/范围外/);
  }
});

test('canonical object key and catalogue order do not fabricate changes; presentation text is outside geometry scope',()=>{
  const previous=fork(fixture()),current=structuredClone(previous);current.title='New candidate title';current.summary='A new review note';
  current.instances.reverse();current.templates.reverse();current.materials.push(material('unused'));current.materials.reverse();
  current.templates=current.templates.map(template=>Object.fromEntries(Object.entries(template).reverse()));
  const result=assertFineRefinementPreserved(previous,current,plan,['palm-a']);
  assert.deepEqual(result.changedEntityIds,[]);assert.equal(result.unchangedEntityIds.length,4);
});

test('exact source binding is rechecked on both candidates without trusting a claimed receipt',()=>{
  const previous=fixture(),current=fork(previous),changed=structuredClone(plan);changed.entities.find(e=>e.id==='palm-a').points[0].x+=.01;
  assert.throws(()=>assertFineRefinementPreserved(previous,current,changed,['palm-a']),/布局已经变化/);
  const falseClaim=structuredClone(current);falseClaim.receipt={preservedOutsideScope:true};
  assert.throws(()=>assertFineRefinementPreserved(previous,falseClaim,plan,['palm-a']),/未知/);
});

test('real saved geometry preserves unrelated dependencies while forking one original palm',async()=>{
  const directory=new URL('../assets/control-model/jobs/964354b1-7d8b-4df5-b69a-cbce19c01ee8/',import.meta.url);
  const [previous,sourcePlan,baseRecipe]=await Promise.all(['geometry.json','source-plan.json','base-recipe.json'].map(async name=>JSON.parse(await readFile(new URL(name,directory),'utf8'))));
  const selected=sourcePlan.entities.find(e=>!e.locked&&e.kind==='palm').id,current=structuredClone(previous);
  const instance=current.instances.find(i=>i.entityId===selected),template=structuredClone(current.templates.find(t=>t.id===instance.templateId));template.id='scoped-palm';template.parts.find(p=>p.id==='crown').size[0]*=.9;
  current.templates.push(template);instance.templateId=template.id;
  const result=assertFineRefinementPreserved(previous,current,sourcePlan,fineRefinementScope(sourcePlan,selected,'selected'),{baseRecipe});
  assert.equal(result.sourceFingerprint,fingerprintPlan(sourcePlan));assert.deepEqual(result.changedEntityIds,[selected]);assert.equal(result.unchangedEntityIds.length,16);
  const invalid=structuredClone(current);invalid.instances.find(i=>i.entityId!==selected).rotationDeg+=1;
  assert.throws(()=>assertFineRefinementPreserved(previous,invalid,sourcePlan,[selected],{baseRecipe}),/朝向/);
});
