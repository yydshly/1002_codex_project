import * as THREE from './vendor/three.module.js';
import { waterLevel } from '../creation-surfaces.js';

export const worldPoint = (point, plan) => ({ x: (point.x - .5) * plan.world.width, z: (point.y - .5) * plan.world.depth });
export function contains(point, polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a.z>point.z)!==(b.z>point.z) && point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x) inside=!inside;
  }
  return inside;
}
export function edgeDistance(point, polygon) {
  let distance=Infinity;
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    distance=Math.min(distance,Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz));
  }
  return distance;
}
export const smooth = (a,b,value) => {const t=THREE.MathUtils.clamp((value-a)/(b-a),0,1);return t*t*(3-2*t);};
export function createTerrainField(plan) {
  const lands=plan.entities.filter(e=>e.kind==='land').map(e=>({entity:e,polygon:e.points.map(p=>worldPoint(p,plan))}));
  const waters=plan.entities.filter(e=>e.kind==='water').map(e=>({entity:e,polygon:e.points.map(p=>worldPoint(p,plan)),level:waterLevel(plan,e)+.035}));
  const anchors=plan.entities.filter(e=>['cabin','lighthouse','palm'].includes(e.kind)).map(e=>({entity:e,...worldPoint(e.points[0],plan),radius:e.kind==='cabin'?7:e.kind==='lighthouse'?3.5:1.1}));
  function landAt(x,z) {return lands.filter(l=>contains({x,z},l.polygon)).sort((a,b)=>b.entity.height-a.entity.height)[0];}
  function height(x,z,selected) {
    const land=selected||landAt(x,z);if(!land)return -.6;
    const edge=edgeDistance({x,z},land.polygon),base=land.entity.height;
    if(land.entity.locked)return base;
    const coast=smooth(0,Math.min(7,Math.max(2,base*2)),edge);
    const rolling=.48*Math.sin(x*.105+z*.037)*Math.sin(z*.13-x*.022)+.16*Math.sin(x*.37+z*.3);
    let y=.11+coast*(base-.11+rolling);
    for(const w of waters) {
      const wd=edgeDistance({x,z},w.polygon),inside=contains({x,z},w.polygon);
      if(inside)y=Math.min(y,w.level-.3-Math.min(.4,wd*.08));
      else if(wd<2.2)y=THREE.MathUtils.lerp(w.level+.18,y,smooth(0,2.2,wd));
    }
    for(const a of anchors) {
      const d=Math.hypot(x-a.x,z-a.z);
      if(d<a.radius+2 && contains(a,land.polygon)) y=THREE.MathUtils.lerp(base+.12,y,smooth(a.radius,a.radius+2,d));
    }
    return y;
  }
  function support(x,z) {const land=landAt(x,z);return land?Math.max(height(x,z,land),land.entity.height):0;}
  function waterAt(x,z) {return waters.find(w=>contains({x,z},w.polygon));}
  return {lands,waters,anchors,height,support,landAt,waterAt};
}

// Uniform subdivision keeps all original polygon edges and shared triangle edges watertight.
export function landGeometry(land,field,subdivisions=4,coarse=false) {
  const polygon=land.polygon.map(p=>new THREE.Vector2(p.x,p.z));
  const faces=THREE.ShapeUtils.triangulateShape(polygon,[]),positions=[],uv=[],biomes=[];
  const n=coarse?1:2**subdivisions;
  const add=(p)=>{
    const edge=edgeDistance({x:p.x,z:p.y},land.polygon),y=coarse?land.entity.height:field.height(p.x,p.y,land);
    positions.push(p.x,y,p.y);uv.push(p.x*.22,p.y*.22);
    const grass=coarse?0:smooth(4.4,10,edge)*(.9+.1*Math.sin(p.x*.19+p.y*.21));
    const rock=coarse?0:Math.max(0,.12*Math.sin(p.x*.3-p.y*.22))*smooth(2,6,edge);
    biomes.push(grass,rock,1-smooth(0,2,edge));
  };
  for(const [ia,ib,ic] of faces) {
    const a=polygon[ia],b=polygon[ib],c=polygon[ic];
    const at=(i,j)=>new THREE.Vector2(a.x+(b.x-a.x)*i/n+(c.x-a.x)*j/n,a.y+(b.y-a.y)*i/n+(c.y-a.y)*j/n);
    for(let i=0;i<n;i++)for(let j=0;j<n-i;j++) {
      // ShapeUtils is counterclockwise in X/Z; reversing yields upward normals in X/Y/Z.
      add(at(i,j));add(at(i,j+1));add(at(i+1,j));
      if(j<n-i-1){add(at(i+1,j));add(at(i,j+1));add(at(i+1,j+1));}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('biome',new THREE.Float32BufferAttribute(biomes,3));
  // Adjacent subdivided triangles share positions but not vertex indices. Average their
  // area-weighted normals so low-angle light does not reveal artificial triangle seams.
  const sharedNormals=new Map(),keys=[];
  for(let i=0;i<positions.length;i+=3)keys.push(`${Math.round(positions[i]*10000)},${Math.round(positions[i+1]*10000)},${Math.round(positions[i+2]*10000)}`);
  for(let i=0;i<positions.length;i+=9) {
    const ux=positions[i+3]-positions[i],uy=positions[i+4]-positions[i+1],uz=positions[i+5]-positions[i+2];
    const vx=positions[i+6]-positions[i],vy=positions[i+7]-positions[i+1],vz=positions[i+8]-positions[i+2];
    const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    for(let vertex=0;vertex<3;vertex++) {
      const key=keys[i/3+vertex],sum=sharedNormals.get(key)||[0,0,0];
      for(let axis=0;axis<3;axis++)sum[axis]+=normal[axis];
      sharedNormals.set(key,sum);
    }
  }
  const normals=[];
  for(const key of keys) {
    const sum=sharedNormals.get(key),length=Math.hypot(...sum)||1;
    normals.push(sum[0]/length,sum[1]/length,sum[2]/length);
  }
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geometry;
}
export function horizontalPolygon(polygon,height) {
  const shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(p.x,-p.z)));
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);geometry.translate(0,height,0);
  return geometry;
}
export function shoreRibbon(polygon,height,width=.8) {
  const positions=[],uv=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
    const normal={x:-dz/l*width,z:dx/l*width};
    const p=[{x:a.x-normal.x,z:a.z-normal.z},{x:b.x-normal.x,z:b.z-normal.z},{x:b.x+normal.x,z:b.z+normal.z},{x:a.x+normal.x,z:a.z+normal.z}];
    for(const index of [0,2,1,0,3,2]){positions.push(p[index].x,height,p[index].z);uv.push(index===0||index===3?0:1,index<2?0:1);}
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}
