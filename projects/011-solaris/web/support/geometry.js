// Pure, renderer-independent geometry. See the frozen notes/support-policy.md.
export const SUPPORT_POLICY = Object.freeze({
  version: 'atelier-support-v1', maxCoordinate: 100, maxTriangles: 60000,
  maxLayerTriangles: 6000, maxConnectivityChecks: 2000000,
  maxClipSteps: 200000, maxFragments: 4000, maxRationalBits: 4096,
  horizontalDegrees: 1, planeTolerance: 0.0005, margin: 0.002,
  rotationSides: 32,
});
const P = SUPPORT_POLICY, radians = P.horizontalDegrees * Math.PI / 180;
const COS = Math.cos(radians), ratCache = new WeakMap();
const fail = (reason, extra = {}) => ({ valid: false, reason, evidence: { policy: P.version, ...extra } });
const ok = extra => ({ valid: true, reason: 'supported', ...extra });
class GeometryError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const guard = (value, reason = 'unsupported-geometry') => { if (!value) throw new GeometryError(reason); };
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= P.maxCoordinate;
const point3 = p => Array.isArray(p) && p.length === 3 && p.every(finite);
const point2 = p => Array.isArray(p) && p.length === 2 && p.every(finite);
const vec = (a, b) => a.map((v, i) => v - b[i]);
const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const project = p => [p[0], p[2]];
const cross2 = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const numKey = n => Object.is(n, -0) ? '0' : String(n);
const pointKey = p => p.map(numKey).join(',');
const triangleKey = t => [t.a, t.b, t.c].map(pointKey).sort().join(';');
const bbox2 = p => ({ min: [Math.min(...p.map(v=>v[0])), Math.min(...p.map(v=>v[1]))], max: [Math.max(...p.map(v=>v[0])), Math.max(...p.map(v=>v[1]))] });
const boxesOverlap = (a,b) => a.min[0] <= b.max[0]+1e-10 && a.max[0]+1e-10 >= b.min[0] && a.min[1] <= b.max[1]+1e-10 && a.max[1]+1e-10 >= b.min[1];
function bounds3(triangles) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for (const t of triangles) for (const p of [t.a,t.b,t.c]) for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  return {min,max};
}
function validateTriangles(triangles) {
  guard(Array.isArray(triangles) && triangles.length > 0);
  guard(triangles.length <= P.maxTriangles, 'resource-limit');
  for (const t of triangles) {
    guard(t && point3(t.a) && point3(t.b) && point3(t.c), 'non-finite-or-out-of-range');
    const n=cross3(vec(t.b,t.a),vec(t.c,t.a));
    guard(n.some(v=>v!==0), 'degenerate-triangle');
  }
}
function hash(text) {
  let h=14695981039346656037n;
  for(let i=0;i<text.length;i++){h^=BigInt(text.charCodeAt(i));h=BigInt.asUintN(64,h*1099511628211n);}
  return h.toString(16).padStart(16,'0');
}

// Exact rational arithmetic prevents a small uncovered hole being discarded as
// floating-point noise. Input doubles are represented exactly, not decimal-rounded.
const abs=n=>n<0n?-n:n;
function gcd(a,b){a=abs(a);b=abs(b);while(b){const r=a%b;a=b;b=r;}return a;}
function rational(n,d=1n){
  guard(d!==0n,'numeric-uncertain');if(d<0n){n=-n;d=-d;}
  if(n===0n)return {n:0n,d:1n};
  const g=gcd(n,d);n/=g;d/=g;
  guard(abs(n).toString(2).length<=P.maxRationalBits && d.toString(2).length<=P.maxRationalBits,'resource-limit');
  return {n,d};
}
const view = new DataView(new ArrayBuffer(8));
function outward(n,positive){
  guard(finite(n),'non-finite-or-out-of-range');
  if(n===0)return positive?Number.MIN_VALUE:-Number.MIN_VALUE;
  view.setFloat64(0,n,false);let bits=view.getBigUint64(0,false);
  bits+=(n>0)===positive?1n:-1n;view.setBigUint64(0,bits,false);return view.getFloat64(0,false);
}
function fromNumber(n){
  guard(finite(n),'non-finite-or-out-of-range');if(n===0)return rational(0n);
  view.setFloat64(0,n,false);const bits=view.getBigUint64(0,false),exp=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
  let m=exp?fraction+(1n<<52n):fraction,power=(exp?exp-1023:-1022)-52;
  if(bits>>63n)m=-m;
  return power>=0?rational(m<<BigInt(power)):rational(m,1n<<BigInt(-power));
}
const add=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d);
const sub=(a,b)=>rational(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a,b)=>rational(a.n*b.n,a.d*b.d);
const div=(a,b)=>rational(a.n*b.d,a.d*b.n);
const same=(a,b)=>a.n===b.n&&a.d===b.d;
const rp=p=>p.map(fromNumber);
const rpointSame=(a,b)=>same(a[0],b[0])&&same(a[1],b[1]);
const rcross=(a,b,c)=>sub(mul(sub(b[0],a[0]),sub(c[1],a[1])),mul(sub(b[1],a[1]),sub(c[0],a[0])));
function rarea(poly){let sum=rational(0n);for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];sum=add(sum,sub(mul(a[0],b[1]),mul(a[1],b[0])));}return sum;}
function nonzero(poly){return poly.length>=3&&rarea(poly).n!==0n;}
function dedupe(poly){const out=[];for(const p of poly)if(!out.length||!rpointSame(p,out.at(-1)))out.push(p);if(out.length>1&&rpointSame(out[0],out.at(-1)))out.pop();return out;}
function rclip(poly,a,b,inside){
  const out=[];if(!poly.length)return out;
  for(let i=0;i<poly.length;i++){
    const start=poly[i],end=poly[(i+1)%poly.length],sa=rcross(a,b,start),sb=rcross(a,b,end);
    const inA=inside?sa.n>=0n:sa.n<=0n,inB=inside?sb.n>=0n:sb.n<=0n;
    if(inA)out.push(start);
    if(inA!==inB){const t=div(sa,sub(sa,sb));out.push([add(start[0],mul(t,sub(end[0],start[0]))),add(start[1],mul(t,sub(end[1],start[1])))]);}
  }
  return dedupe(out);
}
function exactTriangle(points){let t=points.map(rp);const a=rarea(t);guard(a.n!==0n,'degenerate-projection');if(a.n<0n)t=[t[0],t[2],t[1]];return t;}
function subtractTriangle(poly,tri,budget){
  const outside=[];let inside=poly;
  for(let i=0;i<3&&nonzero(inside);i++){
    guard(++budget.steps<=P.maxClipSteps,'resource-limit');
    const a=tri[i],b=tri[(i+1)%3],out=rclip(inside,a,b,false);
    if(nonzero(out))outside.push(out);inside=rclip(inside,a,b,true);
  }
  return outside;
}
function numberR(r){
  if(r.n===0n)return 0;
  const n=abs(r.n),ns=Math.max(0,n.toString(2).length-53),ds=Math.max(0,r.d.toString(2).length-53);
  const approximate=Number(n>>BigInt(ns))/Number(r.d>>BigInt(ds))*2**(ns-ds);
  return r.n<0n?-approximate:approximate;
}
function numberPoly(poly){return poly.map(p=>p.map(numberR));}
function coverage(polygon,triangles){
  const budget={steps:0};let remaining=[polygon.map(rp)];
  guard(nonzero(remaining[0]),'degenerate-footprint');
  const footprintBox=bbox2(polygon);
  const candidates=triangles.filter(t=>boxesOverlap(footprintBox,bbox2(t)));
  for(const triangle of candidates){
    if(!remaining.length)break;
    let exact=ratCache.get(triangle);if(!exact){exact=exactTriangle(triangle);ratCache.set(triangle,exact);}
    const tb=bbox2(triangle),next=[];
    for(const poly of remaining){
      if(!boxesOverlap(tb,bbox2(numberPoly(poly))))next.push(poly);
      else next.push(...subtractTriangle(poly,exact,budget));
      guard(next.length<=P.maxFragments,'resource-limit');
    }
    remaining=next;
  }
  return {covered:remaining.length===0,clipSteps:budget.steps,remainingFragments:remaining.length,
    remainder:remaining.slice(0,4).map(numberPoly),candidateTriangles:candidates.length};
}

export function convexHull(points){
  guard(Array.isArray(points)&&points.length>=3&&points.every(point2),'invalid-footprint');
  const sorted=[...new Map(points.map(p=>[pointKey(p),[...p]])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  guard(sorted.length>=3,'degenerate-footprint');
  const turn=(a,b,c)=>rcross(rp(a),rp(b),rp(c)).n;
  const lower=[],upper=[];
  for(const p of sorted){while(lower.length>=2&&turn(lower.at(-2),lower.at(-1),p)<=0n)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>=2&&turn(upper.at(-2),upper.at(-1),p)<=0n)upper.pop();upper.push(p);}
  const hull=lower.slice(0,-1).concat(upper.slice(0,-1));guard(hull.length>=3,'degenerate-footprint');return hull;
}
function trianglesTouch(a,b){
  const ar=exactTriangle(a),br=exactTriangle(b);let clipped=ar;
  for(let i=0;i<3&&clipped.length;i++)clipped=rclip(clipped,br[i],br[(i+1)%3],true);
  return clipped.length>0; // A shared edge or vertex connects; it never fills missing area.
}
function candidate(t,direction){
  const n=cross3(vec(t.b,t.a),vec(t.c,t.a)),length=Math.hypot(...n),ys=[t.a[1],t.b[1],t.c[1]],min=Math.min(...ys),max=Math.max(...ys);
  return direction*n[1]/length>=COS&&max-min<=P.planeTolerance?{t,min,max,key:triangleKey(t),points:[t.a,t.b,t.c].map(project)}:null;
}

export function analyzeSurfaces(triangles){
  try{
    validateTriangles(triangles);
    const candidates=triangles.map(t=>candidate(t,1)).filter(Boolean).sort((a,b)=>a.min-b.min||a.max-b.max||a.key.localeCompare(b.key));
    if(!candidates.length)return fail('no-horizontal-surface');
    const layers=[];
    for(const item of candidates){let layer=layers.at(-1);if(!layer||item.max-layer.min>P.planeTolerance){layer={min:item.min,max:item.max,items:[]};layers.push(layer);}layer.max=Math.max(layer.max,item.max);layer.items.push(item);guard(layer.items.length<=P.maxLayerTriangles,'resource-limit');}
    let comparisons=0;const surfaces=[];
    for(const layer of layers){
      const items=layer.items,parents=items.map((_,i)=>i),boxes=items.map(v=>bbox2(v.points));
      const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
      for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
        guard(++comparisons<=P.maxConnectivityChecks,'resource-limit');
        if(find(i)!==find(j)&&boxesOverlap(boxes[i],boxes[j])&&trianglesTouch(items[i].points,items[j].points))parents[find(j)]=find(i);
      }
      const groups=new Map();for(let i=0;i<items.length;i++){const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(items[i]);}
      for(const group of groups.values()){
        group.sort((a,b)=>a.key.localeCompare(b.key));const height=Math.min(...group.map(v=>v.min)),projected=group.map(v=>v.points),points=projected.flat();
        const id='surface-'+hash(P.version+'|'+numKey(height)+'|'+group.map(v=>v.key).join('|'));
        surfaces.push({id,policy:P.version,height,triangles:projected,bounds:bbox2(points),triangleCount:group.length,
          heightRange:[height,Math.max(...group.map(v=>v.max))],area:group.reduce((n,v)=>n+Math.abs(cross2(...v.points))/2,0)});
      }
    }
    surfaces.sort((a,b)=>b.height-a.height||b.area-a.area||a.id.localeCompare(b.id));
    return ok({status:surfaces.length===1?'single':'ambiguous',surfaces,evidence:{policy:P.version,inputTriangles:triangles.length,candidateTriangles:candidates.length,connectivityChecks:comparisons}});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason);throw e;}
}

export function analyzeLampBase(triangles){
  try{
    validateTriangles(triangles);const bounds=bounds3(triangles),contactY=bounds.min[1];
    const bottom=triangles.map(t=>candidate(t,-1)).filter(v=>v&&v.max-contactY<=P.planeTolerance);
    if(!bottom.length)return fail('no-planar-lamp-base');
    guard(bottom.length<=P.maxLayerTriangles,'resource-limit');
    const polygon=convexHull(bottom.flatMap(v=>v.points)),proof=coverage(polygon,bottom.map(v=>v.points));
    if(!proof.covered)return fail('base-nonconvex-or-separated',proof);
    const b=bbox2(polygon);
    return ok({base:{policy:P.version,contactY,contactHeightRange:[contactY,Math.max(...bottom.map(v=>v.max))],polygon,bounds,contactBounds:b,contactOffset:[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2],triangleCount:bottom.length},evidence:{policy:P.version,coverage:'exact-rational-triangle-union',...proof}});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason);throw e;}
}

function normalizeTransform(transform={}){
  const scale=transform.scale??{x:1,y:1,z:1};
  const t={x:transform.x??0,y:transform.y??0,z:transform.z??0,yaw:transform.yaw??0,scale};
  guard([t.x,t.y,t.z,t.yaw,scale.x,scale.y,scale.z].every(finite)&&[scale.x,scale.y,scale.z].every(v=>v>0),'unsupported-transform');return t;
}
function applyPoint(p,t){const c=Math.cos(t.yaw),s=Math.sin(t.yaw),x=p[0]*t.scale.x,z=p[2]*t.scale.z;return [t.x+c*x+s*z,t.y+p[1]*t.scale.y,t.z-s*x+c*z];}
export function transformSurface(surface,transform){
  const t=normalizeTransform(transform);guard(surface&&surface.policy===P.version&&Array.isArray(surface.triangles),'invalid-surface');
  const triangles=surface.triangles.map(tri=>tri.map(p=>project(applyPoint([p[0],surface.height,p[1]],t))));
  const height=t.y+surface.height*t.scale.y,heightRange=surface.heightRange.map(y=>t.y+y*t.scale.y);
  guard(finite(height)&&heightRange.every(finite)&&triangles.every(tri=>tri.every(point2)),'unsupported-transform');
  return {...surface,height,heightRange,triangles,bounds:bbox2(triangles.flat()),transform:t};
}
export function transformTriangles(triangles,transform){const t=normalizeTransform(transform);validateTriangles(triangles);const result=triangles.map(tri=>Object.fromEntries(['a','b','c'].map(k=>[k,applyPoint(tri[k],t)])));validateTriangles(result);return result;}
function placementOptions(options={}){
  const anchor=options.anchor,yaw=options.yaw??0,scale=options.scale??1,obstacles=options.obstacles??[];
  guard(point2(anchor)&&finite(yaw)&&finite(scale)&&scale>0&&Array.isArray(obstacles),'unsupported-transform');
  return {anchor,yaw,scale,obstacles};
}
function basePolygon(base,o){const c=Math.cos(o.yaw),s=Math.sin(o.yaw);return base.polygon.map(p=>[o.anchor[0]+o.scale*(c*p[0]+s*p[1]),o.anchor[1]+o.scale*(-s*p[0]+c*p[1])]);}
function expand(polygon){
  const d=P.margin;
  // Round each Minkowski rectangle corner outwards: ordinary addition can
  // otherwise make the promised 2 mm margin fractionally smaller.
  return convexHull(polygon.flatMap(p=>[[-d,-d],[-d,d],[d,-d],[d,d]].map(q=>[outward(p[0]+q[0],q[0]>0),outward(p[1]+q[1],q[1]>0)])));
}
export function lampWorldBounds(base,worldPose){
  guard(base?.bounds&&point3(base.bounds.min)&&point3(base.bounds.max),'invalid-lamp-base');
  const t={x:worldPose.x,y:worldPose.y,z:worldPose.z,yaw:worldPose.yaw,scale:{x:worldPose.scale,y:worldPose.scale,z:worldPose.scale}};normalizeTransform(t);
  const vertices=[];for(const x of [base.bounds.min[0],base.bounds.max[0]])for(const y of [base.bounds.min[1],base.bounds.max[1]])for(const z of [base.bounds.min[2],base.bounds.max[2]])vertices.push(applyPoint([x,y,z],t));
  guard(vertices.every(point3),'unsupported-transform');
  return {min:[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])))};
}
function obstacleCollision(bounds,obstacles){
  for(const obstacle of obstacles){
    guard(obstacle&&point3(obstacle.min)&&point3(obstacle.max)&&obstacle.min.every((n,i)=>n<=obstacle.max[i]),'invalid-obstacle');
    if([0,1,2].every(i=>bounds.min[i]<=obstacle.max[i]&&bounds.max[i]>=obstacle.min[i]))return obstacle.id??'unnamed-obstacle';
  }return null;
}
function validateProfiles(surface,base){
  guard(surface?.policy===P.version&&finite(surface.height)&&Array.isArray(surface.triangles)&&surface.triangles.length>0&&surface.triangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(point2)),'invalid-surface');
  guard(base?.policy===P.version&&finite(base.contactY)&&Array.isArray(base.polygon)&&base.polygon.length>=3&&base.polygon.every(point2),'invalid-lamp-base');
  guard(surface.triangles.length<=P.maxTriangles&&base.polygon.length<=P.maxLayerTriangles*3,'resource-limit');
}
export function checkPlacement(surface,base,options){
  try{
    validateProfiles(surface,base);const o=placementOptions(options);
    const surfaceError=(surface.heightRange?.[1]??surface.height)-surface.height;
    const baseError=((base.contactHeightRange?.[1]??base.contactY)-base.contactY)*o.scale;
    if(surfaceError>P.planeTolerance||baseError>P.planeTolerance)return fail('contact-height-mismatch',{surfaceId:surface.id,surfaceError,baseError,tolerance:P.planeTolerance});
    const polygon=basePolygon(base,o),padded=expand(polygon),proof=coverage(padded,surface.triangles);
    const worldPose={x:o.anchor[0],y:surface.height-base.contactY*o.scale,z:o.anchor[1],yaw:o.yaw,scale:o.scale};
    const evidence={policy:P.version,surfaceId:surface.id,coverage:'exact-rational-triangle-union',margin:P.margin,basePolygon:polygon,paddedPolygon:padded,...proof};
    if(!proof.covered)return fail('footprint-uncovered',evidence);
    const worldBounds=lampWorldBounds(base,worldPose),collision=obstacleCollision(worldBounds,o.obstacles);
    if(collision)return fail('conservative-aabb-collision',{...evidence,collision,worldBounds,collisionMethod:'closed-world-aabb'});
    return ok({worldPose,evidence:{...evidence,worldBounds,collisionMethod:'closed-world-aabb',obstacleCount:o.obstacles.length}});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason,{surfaceId:surface?.id});throw e;}
}
function sweptBounds(a,b){return {min:a.min.map((n,i)=>Math.min(n,b.min[i])),max:a.max.map((n,i)=>Math.max(n,b.max[i]))};}
export function checkTranslationSweep(surface,base,from,to){
  try{
    validateProfiles(surface,base);const a=placementOptions(from),b=placementOptions(to);
    guard(a.yaw===b.yaw&&a.scale===b.scale,'translation-changes-orientation-or-scale');
    const start=checkPlacement(surface,base,a),end=checkPlacement(surface,base,b);if(!start.valid)return start;if(!end.valid)return end;
    const polygon=expand(convexHull([...basePolygon(base,a),...basePolygon(base,b)])),proof=coverage(polygon,surface.triangles);
    const evidence={policy:P.version,surfaceId:surface.id,sweep:'translation-convex-hull',...proof};
    if(!proof.covered)return fail('sweep-uncovered',evidence);
    const bounds=sweptBounds(start.evidence.worldBounds,end.evidence.worldBounds),collision=obstacleCollision(bounds,[...a.obstacles,...b.obstacles]);
    return collision?fail('conservative-aabb-sweep-collision',{...evidence,collision,worldBounds:bounds}):ok({evidence:{...evidence,worldBounds:bounds}});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason);throw e;}
}
export function checkRotationSweep(surface,base,from,to){
  try{
    validateProfiles(surface,base);const a=placementOptions(from),b=placementOptions(to);
    guard(a.anchor[0]===b.anchor[0]&&a.anchor[1]===b.anchor[1]&&a.scale===b.scale,'rotation-changes-position-or-scale');
    const start=checkPlacement(surface,base,a),end=checkPlacement(surface,base,b);if(!start.valid)return start;if(!end.valid)return end;
    const radius=Math.max(...base.polygon.map(p=>Math.hypot(...p)))*a.scale;
    const roundoffGuard=32*Number.EPSILON*(Math.abs(a.anchor[0])+Math.abs(a.anchor[1])+radius+1);
    const outer=radius/Math.cos(Math.PI/P.rotationSides)*(1+8*Number.EPSILON)+roundoffGuard;
    const polygon=expand(Array.from({length:P.rotationSides},(_,i)=>[a.anchor[0]+outer*Math.cos(i*2*Math.PI/P.rotationSides),a.anchor[1]+outer*Math.sin(i*2*Math.PI/P.rotationSides)])),proof=coverage(polygon,surface.triangles);
    const evidence={policy:P.version,surfaceId:surface.id,sweep:'full-circle-conservative',radius,sides:P.rotationSides,...proof};
    if(!proof.covered)return fail('rotation-envelope-uncovered',evidence);
    const bodyRadius=Math.max(...[base.bounds.min[0],base.bounds.max[0]].flatMap(x=>[base.bounds.min[2],base.bounds.max[2]].map(z=>Math.hypot(x,z))))*a.scale;
    const bounds={min:[a.anchor[0]-bodyRadius,start.worldPose.y+base.bounds.min[1]*a.scale,a.anchor[1]-bodyRadius],max:[a.anchor[0]+bodyRadius,start.worldPose.y+base.bounds.max[1]*a.scale,a.anchor[1]+bodyRadius]};
    const collision=obstacleCollision(bounds,[...a.obstacles,...b.obstacles]);
    return collision?fail('conservative-aabb-sweep-collision',{...evidence,collision,worldBounds:bounds}):ok({evidence:{...evidence,worldBounds:bounds}});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason);throw e;}
}

// Clip only the original table triangles above the contact tolerance. Keeping
// each triangle's AABB avoids the entire table's bounding box filling empty space.
export function tableObstacles(triangles,surface){
  validateTriangles(triangles);guard(surface?.policy===P.version&&finite(surface.height),'invalid-surface');
  const height=surface.height+P.planeTolerance,out=[];
  for(let index=0;index<triangles.length;index++){
    const tri=triangles[index],points=[tri.a,tri.b,tri.c],above=[];
    for(let i=0;i<3;i++){
      const a=points[i],b=points[(i+1)%3],inA=a[1]>height,inB=b[1]>height;
      if(inA)above.push(a);
      if(inA!==inB){const t=(height-a[1])/(b[1]-a[1]);above.push(a.map((n,j)=>n+t*(b[j]-n)));}
    }
    if(above.length>=3)out.push({id:'table-triangle-'+index,min:[0,1,2].map(i=>Math.min(...above.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...above.map(p=>p[i]))),kind:'original-table-above-surface'});
  }
  return out;
}

// This finite common search is a usability aid, not proof that an untested model
// contains a usable position. Every returned candidate passes full validation.
export function recommendPlacement(surface,base,options={}){
  try{
    validateProfiles(surface,base);const c=[(surface.bounds.min[0]+surface.bounds.max[0])/2,(surface.bounds.min[1]+surface.bounds.max[1])/2];
    const yaw=options.yaw??0,scale=options.scale??1,co=Math.cos(yaw),si=Math.sin(yaw),offset=base.contactOffset;
    const root=p=>[p[0]-scale*(co*offset[0]+si*offset[1]),p[1]-scale*(-si*offset[0]+co*offset[1])];
    const points=[c,...surface.triangles.map(t=>[t.reduce((n,p)=>n+p[0],0)/3,t.reduce((n,p)=>n+p[1],0)/3])];
    const ordered=[...new Map(points.map(p=>[pointKey(p),p])).values()].sort((a,b)=>Math.hypot(a[0]-c[0],a[1]-c[1])-Math.hypot(b[0]-c[0],b[1]-c[1])||a[0]-b[0]||a[1]-b[1]);
    const anchors=ordered.map(root);
    let last=null;for(const anchor of anchors.slice(0,96)){const result=checkPlacement(surface,base,{...options,anchor});if(result.valid)return {...result,anchor,evidence:{...result.evidence,recommendation:'bounded-common-center-and-triangle-centroids'}};last=result;}
    return fail('no-verified-position-in-finite-search',{surfaceId:surface.id,trials:Math.min(96,anchors.length),lastReason:last?.reason});
  }catch(e){if(e instanceof GeometryError)return fail(e.reason);throw e;}
}
