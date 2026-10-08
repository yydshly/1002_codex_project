import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainField } from '../web/realistic/terrain.js';
import { createDetailedTerrainField } from '../web/realistic/world-terrain.js';

const world={width:200,depth:160};
const point=(x,z)=>({x:x/world.width+.5,y:z/world.depth+.5});
const region=(id,kind,x1,z1,x2,z2,height,locked=false)=>({id,kind,height,locked,points:[point(x1,z1),point(x2,z1),point(x2,z2),point(x1,z2)]});
const plan={world,entities:[
  region('island','land',-90,-72,90,72,3),
  region('locked','land',-70,-40,-50,-20,5,true),
  region('lake','water',20,-35,35,-20,0),
  {id:'road',kind:'road',height:.1,points:[point(-20,-15),point(25,-15)]},
  {id:'cabin',kind:'cabin',height:7,points:[point(-40,20)]},
  {id:'beacon',kind:'lighthouse',height:18,points:[point(45,25)]},
  {id:'palm',kind:'palm',height:12,points:[point(20,40)]}
]};

test('inland relief is finite, deterministic, bounded and leaves source input unchanged',()=>{
  const before=JSON.stringify(plan),base=createTerrainField(plan),detail=createDetailedTerrainField(plan,base);
  const repeat=createDetailedTerrainField(structuredClone(plan),createTerrainField(structuredClone(plan)));
  let changed=0;
  for(let x=-89;x<90;x+=2.3)for(let z=-71;z<72;z+=2.9){
    const h=detail.height(x,z),old=base.height(x,z);
    assert.ok(Number.isFinite(h));assert.ok(Math.abs(h-old)<=.8+1e-10);
    assert.equal(h,repeat.height(x,z));
    if(h!==old)changed++;
  }
  assert.ok(changed>500,'relief must actually exist away from protected areas');
  assert.equal(JSON.stringify(plan),before);
  assert.equal(detail.lands,base.lands);assert.equal(detail.waters,base.waters);assert.equal(detail.anchors,base.anchors);
  assert.equal(detail.landAt,base.landAt);assert.equal(detail.waterAt,base.waterAt);assert.equal(detail.support,base.support);
});

test('all locked land and complete anchor support circles retain exact baseline height',()=>{
  const base=createTerrainField(plan),detail=createDetailedTerrainField(plan,base);
  const locked=base.lands.find(land=>land.entity.locked);
  for(let x=-69;x<-50;x+=1.9)for(let z=-39;z<-20;z+=2.1){
    assert.equal(detail.height(x,z),base.height(x,z));
    assert.equal(detail.height(x,z,locked),base.height(x,z,locked));
  }
  for(const anchor of base.anchors)for(const factor of [0,.3,.75,1])for(let i=0;i<24;i++){
    const angle=i*Math.PI/12,radius=(anchor.radius+2)*factor;
    const x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius;
    assert.equal(detail.height(x,z),base.height(x,z));
  }
});

test('lake floor, complete shore clearance and road corridor never acquire microrelief',()=>{
  const base=createTerrainField(plan),detail=createDetailedTerrainField(plan,base);
  for(let x=18;x<=37;x+=.5)for(let z=-37;z<=-18;z+=.5){
    const dx=Math.max(20-x,0,x-35),dz=Math.max(-35-z,0,z+20);
    if(Math.hypot(dx,dz)<=2.2)assert.equal(detail.height(x,z),base.height(x,z));
  }
  for(let x=-20;x<=25;x+=.5)for(const offset of [-3.25,-1.25,0,1.25,3.25]){
    assert.equal(detail.height(x,-15+offset),base.height(x,-15+offset));
  }
});

test('original outer edges, exterior samples and water-only layouts remain exact',()=>{
  const base=createTerrainField(plan),detail=createDetailedTerrainField(plan,base),land=base.lands[0];
  for(const a of land.polygon)assert.equal(detail.height(a.x,a.z,land),base.height(a.x,a.z,land));
  for(const [x,z] of [[100,0],[-100,0],[0,80],[0,-80],[500,-200]]){
    assert.equal(detail.height(x,z),base.height(x,z));
    assert.equal(detail.height(x,z,land),base.height(x,z,land));
  }
  const waterOnly={world,entities:[region('sea','water',-40,-30,40,30,0)]};
  const waterBase=createTerrainField(waterOnly),waterDetail=createDetailedTerrainField(waterOnly,waterBase);
  assert.equal(waterDetail.height(0,0),waterBase.height(0,0));
});

test('small low land attenuates relief and invalid coordinates fail without emitting invalid geometry',()=>{
  const small={world,entities:[region('small','land',-12,-12,12,12,.3)]};
  const base=createTerrainField(small),detail=createDetailedTerrainField(small,base);
  for(let x=-10;x<=10;x+=.7)for(let z=-10;z<=10;z+=.9){
    assert.ok(Math.abs(detail.height(x,z)-base.height(x,z))<.08);
  }
  assert.throws(()=>detail.height(Infinity,0),/有限/);
  assert.throws(()=>detail.height(0,NaN),/有限/);
  assert.throws(()=>createDetailedTerrainField({world:{width:0,depth:100},entities:[]},base),/有效/);
});
