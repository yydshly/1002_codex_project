import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../web/realistic/vendor/three.module.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { buildFineGeometryCandidates, createFinePartGeometry, disposeFineTree, cloneVisibleSceneForExport } from '../web/realistic/fine-geometry.js';

const plan = {
  version: 1, name: 'Fine geometry renderer test', entry: 'layout', intent: '', world: { width: 100, depth: 80 },
  style: { lighting: 'day', waterColor: '#468b95', landColor: '#9ca976' }, reference: null,
  entities: [
    { id: 'land', kind: 'land', height: 3, locked: false, points: [{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}] },
    { id: 'cabin-a', kind: 'cabin', height: 7, locked: false, points: [{x:.3,y:.4}] },
    { id: 'cabin-b', kind: 'cabin', height: 7, locked: false, points: [{x:.65,y:.6}] },
    { id: 'locked-palm', kind: 'palm', height: 12, locked: true, points: [{x:.2,y:.2}] },
  ],
};
const part = (primitive = 'box', extra = {}) => ({ id: 'model-wall', primitive, material: 'white', center: [0,.4,0], size: [.8,.6,.7], rotationDeg: [0,0,0], points: [], indices: [], repeat: {count:1,step:[0,0,0],turnDeg:[0,0,0]}, segments: 16, ...extra });
const fixture = () => ({
  format: 'tidewater-fine-geometry.v1', sourceFingerprint: fingerprintPlan(plan), title: 'Model-authored new structure', summary: 'Test geometry, not a baked preset',
  materials: [{id:'white',label:'Weathered white',color:'#e4dcd0',roughness:.8,metalness:0,texture:'none',opacity:1,emissive:'#000000'}],
  templates: [{id:'model-house',label:'Authored custom shape',parts:[part(),part('gable-roof',{id:'roof',center:[0,.82,0],size:[1,.3,.9]})]}],
  instances: [{entityId:'cabin-a',templateId:'model-house',rotationDeg:35},{entityId:'cabin-b',templateId:'model-house',rotationDeg:-50}],
});

test('model primitives produce actual finite indexed geometry including custom surfaces', () => {
  const cases = [part('box'),part('ellipsoid'),part('cylinder'),part('cone'),part('torus'),part('gable-roof'),
    part('curved-tube',{points:[[0,-.5,0],[.12,0,.05],[.18,.5,0]]}),
    part('leaf',{points:[[0,-.5,0],[.4,0,0],[0,.5,.04],[-.4,0,0]]}),
    part('lathe',{points:[[.4,-.5,0],[.3,0,0],[.15,.5,0]]}),
    part('mesh',{points:[[-.5,0,-.5],[.5,0,-.5],[0,.5,.5]],indices:[0,1,2]}),
  ];
  for (const input of cases) {
    const geometry = createFinePartGeometry(input), positions = geometry.getAttribute('position');
    assert.ok(positions.count >= 3, input.primitive);
    assert.equal((geometry.index?.count || positions.count) % 3, 0);
    assert([...positions.array].every(Number.isFinite));
    assert([...geometry.getAttribute('normal').array].every(Number.isFinite));
    geometry.dispose();
  }
});

test('all authored IDs fit independent new meshes at original anchors after rotation', () => {
  const before = JSON.stringify(plan), candidate = buildFineGeometryCandidates(fixture(), plan);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(candidate.checks.entityIds,['cabin-a','cabin-b']);
  assert.equal(candidate.checks.partCount,4);
  assert.equal(candidate.checks.generatedNewGeometry,true);
  assert.equal(candidate.checks.neuralMeshGenerated,false);
  for (const record of candidate.records) {
    const bounds = new THREE.Box3().setFromObject(record.root,true), centre = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x - record.spec.anchor.x) < 1e-6);
    assert.ok(Math.abs(centre.z - record.spec.anchor.z) < 1e-6);
    assert.ok(Math.abs(bounds.min.y - record.spec.anchor.y) < 1e-6);
    assert.ok(record.stats.dimensions.width <= record.spec.width + 1e-6);
    assert.ok(record.stats.dimensions.height <= 7 + 1e-6);
    assert.equal(record.root.name,record.entityId);
    assert.equal(record.root.children[0].children[0].children[0].rotation.y,THREE.MathUtils.degToRad(record.stats.rotationDeg));
  }
  const first = candidate.records[0].root.getObjectByName('cabin-a/model-wall/0'), second = candidate.records[1].root.getObjectByName('cabin-b/model-wall/0');
  assert.notEqual(first.geometry,second.geometry);assert.notEqual(first.material,second.material);
  candidate.records.forEach(record=>disposeFineTree(record.root));
});

test('XYZ repeated transforms are executed, and model vertex changes alter actual mesh', () => {
  const bundle = fixture();bundle.templates[0].parts = [part('mesh',{
    points:[[-.2,-.4,0],[.2,-.4,0],[0,.4,.1]],indices:[0,1,2],
    center:[-.2,.3,0],size:[.4,.2,.4],rotationDeg:[10,20,30],repeat:{count:3,step:[.2,.1,0],turnDeg:[5,15,25]},
  })];
  const result = buildFineGeometryCandidates(bundle,plan);
  const last = result.records[0].root.getObjectByName('cabin-a/model-wall/2');
  assert.deepEqual(last.position.toArray(),[.2,.5,0]);
  [20,50,80].forEach((angle,axis)=>assert.ok(Math.abs(last.rotation.toArray()[axis]-THREE.MathUtils.degToRad(angle)) < 1e-12));
  assert.equal(last.geometry.getAttribute('position').getZ(2),Math.fround(.1));
  result.records.forEach(record=>disposeFineTree(record.root));
  bundle.templates[0].parts[0].points[2][2]=.7;
  const changed=buildFineGeometryCandidates(bundle,plan);
  assert.equal(changed.records[0].root.getObjectByName('cabin-a/model-wall/2').geometry.getAttribute('position').getZ(2),Math.fround(.7));
  changed.records.forEach(record=>disposeFineTree(record.root));
});

test('stale/invalid geometry cannot enter the source scene or silently select old presets', () => {
  const original = JSON.stringify(plan), stale=fixture();stale.sourceFingerprint='wrong';
  assert.throws(()=>buildFineGeometryCandidates(stale,plan),/布局已经变化/);
  const bad=fixture();bad.templates[0].parts[0].primitive='old-cabin-preset';
  assert.throws(()=>buildFineGeometryCandidates(bad,plan),/primitive/);
  assert.equal(JSON.stringify(plan),original);
});

test('snapshot expands visible instances, preserves matrices and excludes hidden original/coarse meshes', () => {
  const scene=new THREE.Scene(),coarse=new THREE.Group(),hidden=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  coarse.name='coarse';coarse.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));hidden.name='replaced original';hidden.visible=false;scene.add(coarse,hidden);
  const live=new THREE.Group();live.name='cabin-a';live.userData={sourceId:'cabin-a',geometrySource:'control-model-authored-template'};
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({color:0xabcdef}),instances=new THREE.InstancedMesh(geometry,material,2);
  instances.name='grass';instances.position.set(3,0,2);
  instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,2,3));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-2,3,1));
  live.add(instances);scene.add(live);scene.updateMatrixWorld(true);
  const snapshot=cloneVisibleSceneForExport(scene,{excludedRoots:[coarse]});
  assert.deepEqual(snapshot.sourceIds,['cabin-a']);
  assert.equal(snapshot.scene.getObjectByName('coarse'),undefined);assert.equal(snapshot.scene.getObjectByName('replaced original'),undefined);
  const exported=snapshot.scene.getObjectByName('grass/instance-0');
  assert.deepEqual(exported.getWorldPosition(new THREE.Vector3()).toArray(),[4,2,5]);
  let instanced=0;snapshot.scene.traverse(object=>{if(object.isInstancedMesh)instanced++;});assert.equal(instanced,0);
  assert.notEqual(exported.geometry,geometry);assert.notEqual(exported.material,material);
  let sourceDisposed=false;geometry.addEventListener('dispose',()=>{sourceDisposed=true;});snapshot.dispose();assert.equal(sourceDisposed,false);
});

test('snapshot records shader approximations and preserves the original material and geometry', () => {
  const scene=new THREE.Scene(),geometry=new THREE.PlaneGeometry(4,4),material=new THREE.MeshStandardMaterial();
  const biome=new Float32Array(geometry.getAttribute('position').count*3);biome.fill(.4);geometry.setAttribute('biome',new THREE.Float32BufferAttribute(biome,3));
  const callback=()=>{};material.onBeforeCompile=callback;
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.sourceId='land';scene.add(mesh);
  const snapshot=cloneVisibleSceneForExport(scene);const exported=snapshot.scene.getObjectByName('land');
  assert.ok(snapshot.approximations.some(item=>item.reason.includes('地形')));
  assert.ok(exported.geometry.getAttribute('color'));assert.equal(exported.material.vertexColors,true);
  assert.equal(material.onBeforeCompile,callback);assert.equal(geometry.getAttribute('color'),undefined);
  assert.equal(exported.material.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);
  snapshot.dispose();
});

const curvedRibbon = () => part('ribbon', {
  id: 'authored-curved-surface', center: [0,.5,0], size: [.7,.3,.6],
  // Explicit stations bend downward in Y and taper across Z. The executor
  // must preserve them rather than choosing a canned plant silhouette.
  points: [[0,0,-.02],[0,0,.02], [.3,.1,-.14],[.3,.1,.14], [.7,-.1,-.1],[.7,-.1,.1], [1,-.4,-.015],[1,-.4,.015]],
});

test('ribbon is an actual zero-thickness curved strip with model-supplied edges and arc-length UVs', () => {
  const input = curvedRibbon(), geometry = createFinePartGeometry(input), positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  assert.equal(positions.count,input.points.length);
  assert.deepEqual([...geometry.index.array],[0,1,2,1,3,2, 2,3,4,3,5,4, 4,5,6,5,7,6]);
  assert.deepEqual([...positions.array],input.points.flat().map(Math.fround));
  const distances=[0,Math.hypot(.3,.1),Math.hypot(.3,.1)+Math.hypot(.4,.2),Math.hypot(.3,.1)+Math.hypot(.4,.2)+Math.hypot(.3,.3)];
  for(let i=0;i<4;i++) {
    assert.equal(uv.getX(i*2),0);assert.equal(uv.getX(i*2+1),1);
    assert.ok(Math.abs(uv.getY(i*2)-distances[i]/distances[3])<1e-7);assert.equal(uv.getY(i*2),uv.getY(i*2+1));
  }
  for(let i=0;i<normals.count;i++){const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));assert.ok(Number.isFinite(length)&&Math.abs(length-1)<1e-6);}
  assert.equal(geometry.index.count/3,6,'only surface quads, without invented side walls or a solid tube');
  assert.notEqual(normals.getX(0),normals.getX(normals.count-1),'normals follow actual model curvature');
  geometry.dispose();
});

test('a planar ribbon remains a thin surface instead of being extruded or converted into a tube', () => {
  const geometry=createFinePartGeometry(part('ribbon',{points:[[-.5,0,-.1],[-.5,0,.1],[.5,0,-.05],[.5,0,.05]]}));
  geometry.computeBoundingBox();assert.equal(geometry.boundingBox.min.y,0);assert.equal(geometry.boundingBox.max.y,0);
  assert.equal(geometry.getAttribute('position').count,4);assert.equal(geometry.index.count,6);
  geometry.dispose();
});

test('model-authored curved ribbons obey old XYZ transforms and fit a palm envelope at its original position', () => {
  const palmPlan=structuredClone(plan);palmPlan.entities=palmPlan.entities.filter(e=>e.id!=='locked-palm');
  for(const entity of palmPlan.entities)if(entity.kind==='cabin'){entity.kind='palm';entity.height=12;}
  const bundle=fixture();bundle.sourceFingerprint=fingerprintPlan(palmPlan);
  bundle.templates=[{id:'model-house',label:'Authored curved strip',parts:[{...curvedRibbon(),rotationDeg:[12,-20,8],repeat:{count:2,step:[.1,.04,-.1],turnDeg:[5,10,-12]}}]}];
  const result=buildFineGeometryCandidates(bundle,palmPlan);
  assert.equal(result.checks.partCount,4);
  for(const record of result.records){
    const surface=record.root.getObjectByName(`${record.entityId}/authored-curved-surface/0`);
    assert.equal(surface.material.side,THREE.DoubleSide);assert.equal(surface.material.isMeshStandardMaterial,true);
    assert.equal(surface.userData.generatedThickness,false);
    assert.deepEqual(surface.scale.toArray(),[.7,.3,.6]);assert.deepEqual(surface.position.toArray(),[0,.5,0]);
    [12,-20,8].forEach((angle,axis)=>assert.ok(Math.abs(surface.rotation.toArray()[axis]-THREE.MathUtils.degToRad(angle))<1e-12));
    const repeated=record.root.getObjectByName(`${record.entityId}/authored-curved-surface/1`);
    assert.deepEqual(repeated.position.toArray(),[.1,.54,-.1]);
    [17,-10,-4].forEach((angle,axis)=>assert.ok(Math.abs(repeated.rotation.toArray()[axis]-THREE.MathUtils.degToRad(angle))<1e-12));
    assert.ok(record.stats.dimensions.width<=10+1e-6&&record.stats.dimensions.depth<=10+1e-6&&record.stats.dimensions.height<=12+1e-6);
    const bounds=new THREE.Box3().setFromObject(record.root,true),centre=bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x-record.spec.anchor.x)<1e-6&&Math.abs(centre.z-record.spec.anchor.z)<1e-6);
    assert.ok(Math.abs(bounds.min.y-record.spec.anchor.y)<1e-6);
  }
  result.records.forEach(record=>disposeFineTree(record.root));
});

test('adding ribbons keeps a saved pre-ribbon model bundle geometry and object placement compatible', async () => {
  const folder=new URL('../assets/control-model/jobs/964354b1-7d8b-4df5-b69a-cbce19c01ee8/',import.meta.url);
  const [bundle,sourcePlan,baseRecipe]=await Promise.all(['geometry.json','source-plan.json','base-recipe.json'].map(async name=>JSON.parse(await readFile(new URL(name,folder),'utf8'))));
  const result=buildFineGeometryCandidates(bundle,sourcePlan,{baseRecipe});
  assert.equal(result.records.length,17);assert.equal(result.checks.partCount,249);assert.equal(result.checks.vertices,7384);assert.equal(result.checks.triangles,7100);
  assert.ok(result.records.every(record=>record.stats.preservedAnchor&&record.stats.withinEnvelope&&record.stats.grounded));
  result.records.forEach(record=>disposeFineTree(record.root));
});
