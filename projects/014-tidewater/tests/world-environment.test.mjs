import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/realistic/vendor/three.module.js';
import { createWorldEnvironment, createCoastalWaterMaterial, createShoreWash } from '../web/realistic/world-environment.js';

const polygon = [{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}];
function sample(material,x,z,worldSize=200) {
  const image=material.shoreMap.image,span=worldSize*1.65;
  const col=Math.max(0,Math.min(image.width-1,Math.floor((x/span+.5)*image.width)));
  const row=Math.max(0,Math.min(image.height-1,Math.floor((z/span+.5)*image.height)));
  return image.data[(row*image.width+col)*4];
}

test('quality toggling and disposal restore the previous scene rather than clearing its resources',()=>{
  const scene=new THREE.Scene(),day=new THREE.DataTexture(),sunset=new THREE.DataTexture();
  const background=new THREE.Color(0xb7d2dc),fog=new THREE.FogExp2(0xb7d2dc,.002);
  scene.background=background;scene.fog=fog;scene.backgroundBlurriness=.15;scene.backgroundIntensity=.85;
  scene.backgroundRotation.y=.2;scene.environmentRotation.y=.3;
  const environment=createWorldEnvironment({scene,hdrs:{day,sunset}});
  assert.equal(scene.background,day);
  environment.setLighting('sunset');assert.equal(scene.background,sunset);
  assert.equal(scene.environmentRotation.y,scene.backgroundRotation.y);
  environment.setVisible(false);assert.equal(scene.background,background);assert.equal(scene.fog,fog);
  assert.equal(scene.backgroundRotation.y,.2);assert.equal(scene.environmentRotation.y,.3);
  assert.equal(scene.backgroundBlurriness,.15);assert.equal(scene.backgroundIntensity,.85);
  environment.setVisible(true);assert.equal(scene.background,sunset);
  environment.dispose();assert.equal(scene.background,background);assert.equal(scene.fog,fog);
  environment.setVisible(true);assert.equal(scene.background,background);
  day.dispose();sunset.dispose();
});

test('shore colour lookup separates a near edge from deep water without altering source contours',()=>{
  const field={lands:[{entity:{id:'locked-land',locked:true},polygon:structuredClone(polygon)}]};
  const before=JSON.stringify(field);
  const ocean=createCoastalWaterMaterial({field,worldSize:200,resolution:256});
  assert.ok(sample(ocean,12,0)<sample(ocean,45,0));
  assert.equal(sample(ocean,45,0),255);
  assert.equal(JSON.stringify(field),before);
  assert.equal(ocean.transparent,false);
  assert.equal(ocean.shoreMap.generateMipmaps,false);
  ocean.shoreMap.dispose();ocean.dispose();
});

test('inland depth uses its own selected region even when multiple land and water outlines exist',()=>{
  const before=JSON.stringify(polygon);
  const water=createCoastalWaterMaterial({kind:'inland',polygon,worldSize:100,level:3.035,resolution:256});
  assert.ok(sample(water,0,0,100)>sample(water,9,0,100));
  assert.equal(water.userData.waterLevel,3.035);
  assert.equal(water.userData.time.value,0);
  assert.equal(water.transparent,true);
  assert.equal(water.depthWrite,false);
  assert.equal(JSON.stringify(polygon),before);
  water.shoreMap.dispose();water.dispose();
});

test('patchy wash produces finite triangles on the original water level with bounded width',()=>{
  const before=JSON.stringify(polygon),level=3.035,width=.3;
  const wash=createShoreWash({polygon,level,width,seed:2026});
  const vertices=wash.geometry.getAttribute('position');
  assert.ok(vertices.count>0&&vertices.count%3===0);
  for(let i=0;i<vertices.count;i++) {
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
    assert.ok(Math.abs(y-(level+.045))<1e-5);
    assert.ok(Math.abs(x)<=10+width&&Math.abs(z)<=10+width);
  }
  assert.equal(JSON.stringify(polygon),before);
  wash.geometry.dispose();wash.material.dispose();
});

test('malformed water and wash inputs fail before creating unbounded appearance resources',()=>{
  assert.throws(()=>createCoastalWaterMaterial({worldSize:Infinity}),/尺寸/);
  assert.throws(()=>createCoastalWaterMaterial({resolution:1024}),/采样/);
  assert.throws(()=>createCoastalWaterMaterial({kind:'inland',polygon:[{x:0,z:0}]}),/轮廓/);
  assert.throws(()=>createCoastalWaterMaterial({kind:'invalid'}),/类型/);
  assert.throws(()=>createShoreWash({polygon,level:NaN}),/参数/);
  assert.throws(()=>createShoreWash({polygon,width:Infinity}),/参数/);
});
