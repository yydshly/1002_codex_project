// Model-authored coastal asset meshes. Inputs are existing marker centres and authored heights.
// Cabin <=6.3m radius; lighthouse <=2.55m; palm <=5.3m; boat <=4.4m.
import { BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry } from './runtime/src/engine/geometry/PrimitiveGeometries.js';
import { BufferGeometry } from './runtime/src/engine/geometry/BufferGeometry.js';
import { Float32BufferAttribute } from './runtime/src/engine/geometry/BufferAttribute.js';
import { Vector3, Quaternion, Color } from './runtime/src/engine/math/index.js';
const Y = new Vector3(0, 1, 0);
function mesh(positions, indices = null) {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (indices) geometry.setIndex(indices);
  geometry.computeVertexNormals(); return geometry;
}
function tint(color, scale) { return new Color(Math.min(1,color.r*scale),Math.min(1,color.g*scale),Math.min(1,color.b*scale)); }
function rod(emit, a, b, radius, color, segments = 5) {
  const start = new Vector3(...a), end = new Vector3(...b), direction = end.clone().sub(start), length = direction.length();
  if (length < 1e-8) return;
  const geometry = new CylinderGeometry(radius, radius, length, segments).applyQuaternion(new Quaternion().setFromUnitVectors(Y, direction.divideScalar(length)));
  const centre = start.add(end).multiplyScalar(.5); emit(geometry, color, centre.toArray());
}
export function emitCraftedCabin({ emit, palette: p, x, z, ground: g, h, detail }) {
  const box = (w, y, d, color, px, py, pz, ry = 0, rz = 0) => emit(new BoxGeometry(w, y, d), color, [x + px, g + py, z + pz], ry, rz);
  const floor = h * .055, wallTop = h * .62, ridge = h * .98, eave = h * .63;
  box(8.1, floor, 8.5, p.timber, 0, floor / 2, .55);
  box(7.7, wallTop - floor, 6.4, p.plaster, 0, (wallTop + floor) / 2, -.35);
  // Timber posts, corner beams and exposed eave structure.
  for (const px of [-3.75, 3.75]) {
    for (const pz of [-3.5, 2.8, 4.35]) box(.16, wallTop, .16, p.timber, px, wallTop / 2, pz);
    box(.12, .1 * h, 7.9, p.timber, px, eave, .35);
  }
  box(7.7, .07 * h, .15, p.timber, 0, wallTop * .93, 2.88);
  // Closed gables and a tile roof, entirely inside the original cabin footprint.
  const roof = [-4.25, eave, -4, 4.25, eave, -4, 0, ridge, -4, -4.25, eave, 3.65, 4.25, eave, 3.65, 0, ridge, 3.65];
  emit(mesh(roof, [0,2,5,0,5,3,2,1,4,2,4,5,0,1,2,3,5,4]), p.roof, [x,g,z]);
  const rows = detail === 2 ? 7 : 4, columns = detail === 2 ? 12 : 7;
  for (const side of [-1, 1]) for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const u = row / rows, v = (row + .96) / rows;
    const z0 = -4 + col * 7.65 / columns, z1 = z0 + 7.55 / columns;
    const px0 = side * 4.25 * u, px1 = side * 4.25 * v;
    const y0 = ridge + (eave - ridge) * u + .022, y1 = ridge + (eave - ridge) * v + .035;
    emit(mesh([px0,y0,z0,px1,y1,z0,px1,y1,z1,px0,y0,z1],[0,1,2,0,2,3]), tint(p.roof, .85 + ((row * 13 + col * 7) % 5) * .055), [x,g,z]);
  }
  rod(emit, [x,g + ridge + .035,z - 4], [x,g + ridge + .035,z + 3.65], .08, tint(p.roof,1.13), 6);
  // Front windows, a panel door, muntins and shutters.
  for (const px of [-2.3, 2.3]) {
    const py = h * .36, wh = h * .24, ww = 1.4;
    box(ww, wh, .07, p.glass, px, py, 2.89);
    for (const dx of [-ww / 2, 0, ww / 2]) box(.075, wh + .13, .12, p.trim, px + dx, py, 2.96);
    for (const dy of [-wh / 2, wh / 2]) box(ww + .14, .075, .14, p.trim, px, py + dy, 2.96);
    for (const dx of [-1,1]) box(.29, wh + .1, .12, p.timber, px + dx * .92, py, 2.94);
    box(1.67,.09,.32,p.trim,px,py-wh/2-.03,3.05);
  }
  box(1.23,h*.43,.1,p.timber,0,h*.27,2.94);
  for (const px of [-.59,.59]) box(.075,h*.45,.14,p.trim,px,h*.28,3.02);
  box(1.32,.085,.16,p.trim,0,h*.505,3.02);
  box(.06,h*.04,.05,p.lamp,.38,h*.26,3.03);
  // Porch floor planks and waist-high railings without moving the doorway.
  for (let i=0;i<8;i++) box(.82,.035,1.48,tint(p.timber,i%2?.95:1.08),-3.2+i*.91,floor+.035,3.78);
  for (const side of [-1,1]) {
    for (const pz of [3.15,3.7,4.3]) box(.07,h*.22,.07,p.trim,side*3.75,floor+h*.11,pz);
    box(.08,.08,1.3,p.trim,side*3.75,floor+h*.23,3.72);
  }
  for (const px of [-3.75,-2.85,-1.95,1.95,2.85,3.75]) box(.065,h*.22,.065,p.trim,px,floor+h*.11,4.35);
  for (const side of [-1,1]) box(2.35,.075,.08,p.trim,side*2.575,floor+h*.23,4.35);
  box(1.58,floor*.5,.37,p.timber,0,floor*.25,4.73);
}
export function emitCraftedLighthouse({ emit, palette:p, x,z,ground:g,h,detail }) {
  const n=detail===2?16:12;
  const cylinder=(rt,rb,height,color,y)=>emit(new CylinderGeometry(rt,rb,height,n),color,[x,g+y,z]);
  cylinder(2.35,2.52,h*.055,p.timber,h*.0275);
  // Five tapered masonry courses with two painted bands.
  for(let i=0;i<5;i++) {
    const lo=.055+i*.135, hi=lo+.135;
    cylinder(2.45-hi*.98,2.45-lo*.98,h*.135,i===1||i===3?p.roof:p.plaster,h*(lo+.0675));
    cylinder(2.46-hi*.98,2.46-hi*.98,h*.007,tint(p.plaster,.89),h*hi);
  }
  cylinder(2.5,2.5,h*.025,p.timber,h*.751);
  cylinder(1.6,1.6,h*.14,p.glass,h*.842);
  cylinder(.44,.44,h*.11,p.lamp,h*.842);
  cylinder(1.72,1.72,h*.018,p.trim,h*.772);
  cylinder(1.75,1.75,h*.025,p.trim,h*.917);
  // Lantern mullions and outer gallery rail.
  const bars=detail===2?12:8, railY=g+h*.835;
  for(let i=0;i<bars;i++) {
    const a=i*Math.PI*2/bars, b=(i+1)*Math.PI*2/bars;
    const cx=Math.sin(a),cz=Math.cos(a);
    emit(new BoxGeometry(.075,h*.14,.075),p.trim,[x+cx*1.62,g+h*.842,z+cz*1.62]);
    emit(new BoxGeometry(.07,h*.1,.07),p.trim,[x+cx*2.38,g+h*.794,z+cz*2.38]);
    rod(emit,[x+cx*2.38,railY,z+cz*2.38],[x+Math.sin(b)*2.38,railY,z+Math.cos(b)*2.38],.055,p.trim,4);
  }
  emit(new ConeGeometry(2.2,h*.082,n),p.roof,[x,g+h*.956,z]);
  cylinder(.08,.11,h*.02,p.timber,h*.99);
  // Door and vertically spaced small tower windows keep the old centre unchanged.
  emit(new BoxGeometry(.72,h*.16,.14),p.timber,[x,g+h*.13,z+2.35]);
  for(const t of [.31,.54]) {
    const r=2.45-t*.98;
    emit(new BoxGeometry(.42,h*.075,.1),p.dark,[x,g+h*t,z+r]);
    for(const side of [-1,1]) emit(new BoxGeometry(.055,h*.086,.13),p.trim,[x+side*.23,g+h*t,z+r+.04]);
  }
}
export function emitCraftedPalm({ emit,palette:p,x,z,ground:g,h,scale=1,detail,seed=1 }) {
  const bend=.46*scale, segments=detail===2?7:5;
  const centre=t=>[x+Math.sin(t*1.45)*bend,g+h*.865*t,z+Math.sin(t*Math.PI)*.22*scale];
  for(let i=0;i<segments;i++) {
    const t=i/segments,u=(i+1)/segments;
    rod(emit,centre(t),centre(u),(.34-.17*t)*scale,tint(p.timber,i%2?.83:1.07),8);
  }
  const top=centre(1), fronds=detail===2?9:7, steps=detail===2?7:5;
  const radius=4.65*scale;
  for(let leaf=0;leaf<fronds;leaf++) {
    const angle=leaf*Math.PI*2/fronds+(seed%31)*.05,positions=[],indices=[];
    for(let j=0;j<=steps;j++) {
      const t=j/steps,r=radius*t,py=h*.06*Math.sin(t*Math.PI)-Math.min(h*.2,1.45*scale)*t*t;
      const w=.58*scale*Math.sin(Math.PI*t)**.8;
      const cx=Math.sin(angle)*r,cz=Math.cos(angle)*r;
      positions.push(cx+Math.cos(angle)*w,py,cz-Math.sin(angle)*w,cx-Math.cos(angle)*w,py+.055*scale,cz+Math.sin(angle)*w);
      if(j<steps) indices.push(j*2,j*2+2,j*2+1,j*2+1,j*2+2,j*2+3);
    }
    emit(mesh(positions,indices),tint(p.leaves,.85+(leaf%4)*.08),top);
    // Distinct narrow leaflets make the silhouette legible at close range.
    if(detail===2) for(let j=2;j<6;j++) for(const side of [-1,1]) {
      const t=j/7,r=radius*t,w=.75*scale*Math.sin(Math.PI*t),py=h*.06*Math.sin(t*Math.PI)-Math.min(h*.2,1.45*scale)*t*t;
      const c=[Math.sin(angle)*r,py,Math.cos(angle)*r], tip=[c[0]+Math.cos(angle)*w*side-Math.sin(angle)*.32*scale,py-.14*scale,c[2]-Math.sin(angle)*w*side-Math.cos(angle)*.32*scale];
      emit(mesh([...c,...tip,c[0]+Math.sin(angle)*.26*scale,py+.035*scale,c[2]+Math.cos(angle)*.26*scale]),tint(p.leaves,.82),top);
    }
  }
  for(let i=0;i<3;i++) emit(new SphereGeometry(.24*scale,6,3),tint(p.timber,.68),[top[0]+Math.sin(i*2.1)*.24*scale,top[1]-.18*scale,top[2]+Math.cos(i*2.1)*.24*scale]);
}
export function emitCraftedBoat({emit,palette:p,x,z,ground:g,h,detail}) {
  // Bevelled ring hull retains the original 3.5 x 8 metre overall hull envelope.
  const ring=[[-.04,-4],[-1.12,-3],[-1.7,-1.7],[-1.7,2.6],[-1.1,3.8],[0,4],[1.1,3.8],[1.7,2.6],[1.7,-1.7],[1.12,-3]];
  const positions=[],indices=[],bottomY=.08,deckY=h*.37+.08;
  ring.forEach(([px,pz])=>positions.push(px*.65,bottomY,pz*.93));
  ring.forEach(([px,pz])=>positions.push(px,deckY,pz));
  for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length;indices.push(i,j,i+ring.length,j,j+ring.length,i+ring.length);}
  emit(mesh(positions,indices),p.hull,[x,g,z]);
  const deck=ring.map(([px,pz])=>[px,deckY+.014,pz]).flat();
  const fan=[];for(let i=1;i<ring.length-1;i++)fan.push(0,i,i+1);
  emit(mesh(deck,fan),p.timber,[x,g,z]);
  // Foredeck strips, gunwale rails, compact wheelhouse and glazed windows.
  for(let i=0;i<5;i++) emit(new BoxGeometry(.18,.028,2.4),tint(p.timber,i%2?.86:1.15),[x-.6+i*.3,g+deckY+.035,z+2.15]);
  for(let i=0;i<ring.length;i++) {
    const j=(i+1)%ring.length,[ax,az]=ring[i],[bx,bz]=ring[j];
    rod(emit,[x+ax,g+deckY+.08,z+az],[x+bx,g+deckY+.08,z+bz],.055,p.trim,4);
    if(i%2===0) emit(new BoxGeometry(.055,h*.105,.055),p.trim,[x+ax*.94,g+deckY+h*.052,z+az*.96]);
  }
  emit(new BoxGeometry(2.32,h*.39,2.95),p.plaster,[x,g+deckY+h*.195,z-.55]);
  emit(new BoxGeometry(2.53,h*.05,3.18),p.roof,[x,g+deckY+h*.425,z-.55]);
  emit(new BoxGeometry(1.82,h*.16,.055),p.glass,[x,g+deckY+h*.25,z+.95]);
  for(const px of [-.93,0,.93]) emit(new BoxGeometry(.065,h*.185,.09),p.trim,[x+px,g+deckY+h*.25,z+.99]);
  for(const side of [-1,1]) {
    emit(new BoxGeometry(.07,h*.15,1.82),p.glass,[x+side*1.175,g+deckY+h*.25,z-.4]);
    for(const pz of [-1.3,-.4,.5]) emit(new BoxGeometry(.11,h*.18,.06),p.trim,[x+side*1.205,g+deckY+h*.25,z+pz]);
  }
  rod(emit,[x,g+deckY+h*.45,z-.65],[x,g+h*.97+.08,z-.65],.055,p.timber,6);
  emit(new SphereGeometry(.12,6,3),p.lamp,[x,g+h*.97+.08,z-.65]);
  if(detail===2) {
    emit(new BoxGeometry(.58,.16,.26),p.timber,[x,g+deckY+.12,z+2.55]);
    for(const side of [-1,1]) emit(new CylinderGeometry(.28,.28,.12,10).rotateX(Math.PI/2),p.roof,[x+side*1.73,g+deckY+h*.15,z-1.1]);
  }
}
