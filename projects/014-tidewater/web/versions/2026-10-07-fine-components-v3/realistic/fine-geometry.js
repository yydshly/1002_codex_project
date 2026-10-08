// Execute bounded model-authored geometry. No legacy cabin/tree/boat preset is
// selected here: every rendered part comes from the validated model template.
import * as THREE from './vendor/three.module.js';
import { validateFineGeometry } from '../fine-geometry-core.js';
import { createAssetJob, fitAssetBounds } from '../asset-generation-core.js';

export const FINE_RENDER_LIMITS = Object.freeze({ triangles: 1500000, vertices: 2000000 });
const radians = value => THREE.MathUtils.degToRad(value);
const cloneData = value => JSON.parse(JSON.stringify(value));

function indexedGeometry(points, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(indices);
  // A deterministic planar UV is a reusable material projection, not inferred
  // texture reconstruction. The model still authors the vertex positions.
  const extent = [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis])));
  const axes = [0, 1, 2].sort((a, b) => extent[b] - extent[a]).slice(0, 2);
  const mins = axes.map(axis => Math.min(...points.map(p => p[axis])));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(point => axes.map((axis, i) => (point[axis] - mins[i]) / Math.max(extent[axis], .000001))), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function leafGeometry(points) {
  const normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    normal.x += (a[1] - b[1]) * (a[2] + b[2]);
    normal.y += (a[2] - b[2]) * (a[0] + b[0]);
    normal.z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  if (normal.length() < 1e-8) throw new Error('模型叶片轮廓无法形成有效面。');
  const dominant = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].indexOf(Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)));
  const axes = [0, 1, 2].filter(axis => axis !== dominant);
  const projected = points.map(p => new THREE.Vector2(p[axes[0]], p[axes[1]]));
  const triangles = THREE.ShapeUtils.triangulateShape(projected, []);
  if (!triangles.length) throw new Error('模型叶片轮廓不能三角化。');
  return indexedGeometry(points, triangles.flat());
}

/** Primitive dimensions are full unit extents; custom points remain local
 * [-1,1]. Part size, XYZ Euler rotation and centre are applied afterwards. */
export function createFinePartGeometry(part) {
  const s = part.segments;
  switch (part.primitive) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'ellipsoid': return new THREE.SphereGeometry(.5, s, Math.max(3, Math.ceil(s / 2)));
    case 'cylinder': return new THREE.CylinderGeometry(.5, .5, 1, s);
    case 'cone': return new THREE.ConeGeometry(.5, 1, s);
    case 'torus': return new THREE.TorusGeometry(.375, .125, Math.max(3, Math.ceil(s / 3)), s);
    case 'gable-roof': return indexedGeometry([
      [-.5,-.5,-.5], [.5,-.5,-.5], [0,.5,-.5],
      [-.5,-.5,.5], [.5,-.5,.5], [0,.5,.5],
    ], [0,2,1, 3,4,5, 0,1,4,0,4,3, 0,3,5,0,5,2, 1,2,5,1,5,4]);
    case 'curved-tube': {
      const curve = new THREE.CatmullRomCurve3(part.points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
      return new THREE.TubeGeometry(curve, s, .025, Math.max(3, Math.ceil(s / 4)), false);
    }
    case 'leaf': return leafGeometry(part.points);
    case 'lathe': return new THREE.LatheGeometry(part.points.map(p => new THREE.Vector2(p[0], p[1])), s);
    case 'mesh': return indexedGeometry(part.points, part.indices);
    default: throw new Error('未支持的模型几何部件。');
  }
}

function inspectGeometry(geometry) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.index;
  if (!position || position.count < 3 || position.itemSize !== 3) throw new Error('模型部件没有有效顶点。');
  for (let i = 0; i < position.count; i++) {
    if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) throw new Error('模型部件包含非有限顶点。');
    if (normal && ![normal.getX(i), normal.getY(i), normal.getZ(i)].every(Number.isFinite)) throw new Error('模型部件包含无效法线。');
  }
  const count = index?.count ?? position.count;
  if (count % 3) throw new Error('模型部件三角形不完整。');
  if (index) for (let i = 0; i < index.count; i++) if (!Number.isInteger(index.getX(i)) || index.getX(i) < 0 || index.getX(i) >= position.count) throw new Error('模型部件索引无效。');
  return { vertices: position.count, triangles: count / 3 };
}

function materialFor(spec, textureSets) {
  const textures = spec.texture === 'none' ? {} : textureSets[spec.texture] || {};
  const material = new THREE.MeshStandardMaterial({
    name: spec.label, color: spec.color, roughness: spec.roughness, metalness: spec.metalness,
    map: textures.diff || null, normalMap: textures.normal || null, roughnessMap: textures.rough || null,
    normalScale: new THREE.Vector2(.3, .3), opacity: spec.opacity, transparent: spec.opacity < 1,
    depthWrite: spec.opacity >= .5, emissive: spec.emissive, emissiveIntensity: 1, side: THREE.DoubleSide,
  });
  material.userData = { source: 'model-authored-material-values', modelMaterialId: spec.id, textureSource: spec.texture === 'none' ? 'none' : `existing-PBR-${spec.texture}`, uvProjection: 'primitive-or-planar', generatedTexture: false };
  return material;
}

/** Disposal deliberately keeps the scene-owned photographed textures alive. */
export function disposeFineTree(root, extraMaterials = []) {
  const geometries = new Set(), materials = new Set();
  extraMaterials.forEach(material => materials.add(material));
  root?.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material); });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}

/** Build and fit every object before any existing scene object is hidden. */
export function buildFineGeometryCandidates(bundle, plan, { baseRecipe = null, textureSets = {}, anchorFor = null } = {}) {
  const valid = validateFineGeometry(bundle, plan, { baseRecipe });
  const templates = new Map(valid.templates.map(template => [template.id, template]));
  const records = [];
  let partCount = 0, vertices = 0, triangles = 0;
  try {
    for (const instance of valid.instances) {
      const entity = plan.entities.find(item => item.id === instance.entityId), template = templates.get(instance.templateId);
      const spec = createAssetJob(plan, entity.id).spec;
      if (anchorFor) spec.anchor = anchorFor(entity);
      const root = new THREE.Group(), sizer = new THREE.Group(), offset = new THREE.Group(), rotator = new THREE.Group(), body = new THREE.Group();
      root.add(sizer); sizer.add(offset); offset.add(rotator); rotator.add(body);
      const record = { entityId: entity.id, kind: entity.kind, root, templateId: template.id, spec, stats: null };
      records.push(record); // Include partially built trees in transactional cleanup.
      const palette = new Map(valid.materials.map(material => [material.id, materialFor(material, textureSets)]));
      record.allocatedMaterials = [...palette.values()];
      const used = new Set();
      for (const part of template.parts) for (let copy = 0; copy < part.repeat.count; copy++) {
        const geometry = createFinePartGeometry(part);
        let stats;try { stats = inspectGeometry(geometry); } catch (error) { geometry.dispose(); throw error; }
        vertices += stats.vertices; triangles += stats.triangles; partCount++;
        if (vertices > FINE_RENDER_LIMITS.vertices || triangles > FINE_RENDER_LIMITS.triangles) { geometry.dispose(); throw new Error('模型细几何超过实际顶点或三角形预算。'); }
        const material = palette.get(part.material); used.add(part.material);
        const object = new THREE.Mesh(geometry, material);
        object.name = `${entity.id}/${part.id}/${copy}`;
        object.position.fromArray(part.center.map((v, axis) => v + part.repeat.step[axis] * copy));
        object.scale.fromArray(part.size);
        object.rotation.set(...part.rotationDeg.map((v, axis) => radians(v + part.repeat.turnDeg[axis] * copy)), 'XYZ');
        object.castShadow = true; object.receiveShadow = true;
        object.userData = { sourceEntityId: entity.id, modelPartId: part.id, primitive: part.primitive, repeatIndex: copy, geometrySource: 'control-model-authored-template' };
        body.add(object);
      }
      for (const [id, material] of palette) if (!used.has(id)) material.dispose();
      record.allocatedMaterials = [];
      const height = spec.height > 0 ? spec.height : spec.fallbackHeight;
      body.scale.set(spec.width, height, spec.depth);
      rotator.rotation.y = radians(instance.rotationDeg); root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(rotator, true);
      const fit = fitAssetBounds({ min: bounds.min.toArray(), max: bounds.max.toArray() }, { ...spec, rotationY: 0 });
      offset.position.fromArray(fit.offset); sizer.scale.setScalar(fit.scale); root.position.set(spec.anchor.x, spec.anchor.y, spec.anchor.z);
      root.updateMatrixWorld(true);
      const beforeImmersion = new THREE.Box3().setFromObject(root, true), dimensions = beforeImmersion.getSize(new THREE.Vector3());
      const immersion = entity.kind === 'boat' ? Math.min(.5, dimensions.y * .35) : 0;
      root.position.y -= immersion; root.updateMatrixWorld(true);
      const finalBounds = new THREE.Box3().setFromObject(root, true), centre = finalBounds.getCenter(new THREE.Vector3());
      if (![...finalBounds.min.toArray(), ...finalBounds.max.toArray()].every(Number.isFinite)) throw new Error('归位后的细几何边界无效。');
      const tolerance = 1e-6;
      if (Math.abs(centre.x - spec.anchor.x) > tolerance || Math.abs(centre.z - spec.anchor.z) > tolerance || Math.abs(finalBounds.min.y - (spec.anchor.y - immersion)) > tolerance || dimensions.x > spec.width + tolerance || dimensions.y > height + tolerance || dimensions.z > spec.depth + tolerance) throw new Error('模型细几何没有保持原锚点、包络或接地。');
      root.name = entity.id;
      root.userData = { sourceId: entity.id, sourceEntityId: entity.id, fineGeometry: true, sourceFingerprint: valid.sourceFingerprint, templateId: template.id, geometrySource: 'control-model-authored-template', neuralMeshGenerated: false };
      record.stats = { entityId: entity.id, templateId: template.id, rotationDeg: instance.rotationDeg, anchor: cloneData(spec.anchor), bounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() }, dimensions: { width: dimensions.x, height: dimensions.y, depth: dimensions.z }, envelope: { width: spec.width, height, depth: spec.depth }, fitScale: fit.scale, waterlineImmersion: immersion, preservedAnchor: true, withinEnvelope: true, grounded: true };
    }
    return { bundle: valid, records, checks: { format: 'tidewater-fine-geometry-checks.v1', sourceFingerprint: valid.sourceFingerprint, entityIds: records.map(record => record.entityId), templateCount: valid.templates.length, partCount, vertices, triangles, placements: records.map(record => record.stats), preservedIds: true, preservedLocks: true, geometrySource: 'control-model-authored-template', generatedNewGeometry: true, neuralMeshGenerated: false, textures: 'existing-PBR-resources', visualQuality: 'needs-review', limitations: ['细几何由控制模型组织部件、曲线和顶点；未调用专用神经网格模型。', '保留原锚点与包络，当前不证明部件无穿插、碰撞可用或写实品质。', '材质参数由模型决定，照片纹理沿用已登记资源。'] } };
  } catch (error) { records.forEach(record => disposeFineTree(record.root, record.allocatedMaterials || [])); throw error; }
}

/** Portable geometry snapshot of the current visible world. Custom shader
 * effects are explicit static approximations; the runtime project preserves
 * them separately. All geometries/materials/textures are independently owned. */
export function cloneVisibleSceneForExport(sourceScene, { excludedRoots = [], fineChecks = null } = {}) {
  const excluded = new Set(excludedRoots), approximations = [], geometryMap = new Map(), materialMap = new Map(), textureMap = new Map();
  const output = new THREE.Scene(); output.name = 'Tidewater authored scene';
  const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set();
  function textureCopy(texture) { if (!textureMap.has(texture)) { const copy = texture.clone(); textureMap.set(texture, copy); ownedTextures.add(copy); } return textureMap.get(texture); }
  function geometryCopy(geometry) { if (!geometryMap.has(geometry)) { const copy = geometry.clone(); geometryMap.set(geometry, copy); ownedGeometries.add(copy); } return geometryMap.get(geometry); }
  function materialCopy(material, geometry, name) {
    const biome = geometry?.getAttribute('biome');
    // A per-geometry material is required when shader biome blending becomes a
    // static vertex colour approximation rather than a dynamic shader.
    const key = biome ? `${material.uuid}:${geometry.uuid}` : material.uuid;
    if (materialMap.has(key)) return materialMap.get(key);
    let copy;
    if (material.isShaderMaterial || material.isRawShaderMaterial) {
      copy = new THREE.MeshStandardMaterial({ color: material.uniforms?.color?.value || 0xb9d4da, roughness: .8, side: material.side, transparent: material.transparent, opacity: material.opacity });
      approximations.push({ node: name, reason: '自定义着色器转换为静态标准材质；不包含着色器动画。' });
    } else {
      copy = material.clone();
      if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) approximations.push({ node: name, reason: biome ? '地形混合改为静态植被/岩石顶点色与原沙地贴图近似。' : '自定义材质着色器转换为标准材质；动态水面、泡沫或条纹可能不同。' });
    }
    if (biome) {
      const colors = new Float32Array(biome.count * 3), sand = new THREE.Color(0xe6d5ad), grass = new THREE.Color(0x6a944c), rock = new THREE.Color(0x8a9186);
      for (let i = 0; i < biome.count; i++) { const color = sand.clone().lerp(grass, THREE.MathUtils.clamp(biome.getX(i), 0, 1)).lerp(rock, THREE.MathUtils.clamp(biome.getY(i), 0, 1)).multiplyScalar(1 - .22 * THREE.MathUtils.clamp(biome.getZ(i), 0, 1)); color.toArray(colors, i * 3); }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); copy.vertexColors = true;
    }
    for (const [key, value] of Object.entries(copy)) if (value?.isTexture) copy[key] = textureCopy(value);
    copy.userData = { ...cloneData(material.userData || {}), ...(material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || material.isShaderMaterial ? { exportAppearance: 'static-approximation' } : {}) };
    materialMap.set(key, copy); ownedMaterials.add(copy); return copy;
  }
  function cloneNode(object) {
    if (excluded.has(object) || !object.visible) return null;
    const name = object.name || object.userData.sourceId || object.type;
    let copy;
    if (object.isInstancedMesh) {
      copy = new THREE.Group(); copy.name = name;
      copy.position.copy(object.position); copy.quaternion.copy(object.quaternion); copy.scale.copy(object.scale); copy.matrix.copy(object.matrix); copy.matrixAutoUpdate = object.matrixAutoUpdate;
      for (let index = 0; index < object.count; index++) {
        const geometry = geometryCopy(object.geometry), material = (Array.isArray(object.material) ? object.material : [object.material]).map(item => materialCopy(item, geometry, name));
        const instance = new THREE.Mesh(geometry, material.length === 1 ? material[0] : material);
        object.getMatrixAt(index, instance.matrix); instance.matrix.decompose(instance.position, instance.quaternion, instance.scale); instance.name = `${name}/instance-${index}`;
        instance.userData = { ...cloneData(object.userData), instanceIndex: index }; instance.castShadow = object.castShadow; instance.receiveShadow = object.receiveShadow;
        if (object.instanceColor) { const color = new THREE.Color(); object.getColorAt(index, color); const items = Array.isArray(instance.material) ? instance.material : [instance.material]; instance.material = items.map(item => { const own = item.clone(); own.color?.multiply(color); ownedMaterials.add(own); return own; }); if (instance.material.length === 1) instance.material = instance.material[0]; }
        copy.add(instance);
      }
    } else {
      copy = object.clone(false); copy.name = name;
      if (object.geometry) { copy.geometry = geometryCopy(object.geometry); const mats = (Array.isArray(object.material) ? object.material : [object.material]).map(material => materialCopy(material, copy.geometry, name)); copy.material = mats.length === 1 ? mats[0] : mats; }
    }
    copy.userData = cloneData(object.userData || {});
    if (copy.userData.sourceId) copy.userData.sourceEntityId = copy.userData.sourceId;
    for (const child of object.children) { const childCopy = cloneNode(child); if (childCopy) copy.add(childCopy); }
    return copy;
  }
  try {
    sourceScene.updateMatrixWorld(true);
    for (const child of sourceScene.children) { const copy = cloneNode(child); if (copy) output.add(copy); }
    if (sourceScene.background?.isTexture || sourceScene.environment?.isTexture) approximations.push({ node: 'environment', reason: 'HDR 背景、环境反射与雾不属于标准 GLB 几何资源，完整 Web 项目另行保留。' });
    output.background = sourceScene.background?.isColor ? sourceScene.background.clone() : new THREE.Color(0xb9d4da);
    output.fog = sourceScene.fog?.clone() || null;
    const sourceIds = new Set(); output.traverse(object => { if (object.userData.sourceId) sourceIds.add(object.userData.sourceId); });
    output.userData = { source: 'visible-actual-scene-snapshot', sourceIds: [...sourceIds], fineGeometryChecks: cloneData(fineChecks), approximations: cloneData(approximations) };
    output.updateMatrixWorld(true);
    return { scene: output, approximations, sourceIds: [...sourceIds], dispose() { ownedGeometries.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(material => material.dispose()); ownedTextures.forEach(texture => texture.dispose()); output.clear(); } };
  } catch (error) { ownedGeometries.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(material => material.dispose()); ownedTextures.forEach(texture => texture.dispose()); throw error; }
}
