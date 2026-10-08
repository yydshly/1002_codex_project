// Real mesh assets authored by the coding model for this prototype; no runtime model API.
import { waterLevel, surfaceHeight, WATER_SURFACE_OFFSET } from './creation-surfaces.js';
import { generateLandDetails, makeRefinement } from './creation-refinement.js';
import { generateBeachTriangles } from './creation-refinement-geometry.js';
import { BoxGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry, SphereGeometry } from './runtime/src/engine/geometry/PrimitiveGeometries.js';
import { BufferGeometry } from './runtime/src/engine/geometry/BufferGeometry.js';
import { Float32BufferAttribute } from './runtime/src/engine/geometry/BufferAttribute.js';
import { Vector3, Box3, Color } from './runtime/src/engine/math/index.js';
import { triangulateShape } from './runtime/src/engine/math/ShapeUtils.js';
import { emitCraftedCabin, emitCraftedLighthouse, emitCraftedPalm, emitCraftedBoat } from './model-scene-crafted-assets.js';
export const MODEL_VERTEX_STRIDE = 11;
export const MODEL_TRIANGLE_BUDGET = 120000;
function worldPoint(point, world) { return { x: (point.x - .5) * world.width, z: (point.y - .5) * world.depth }; }
export function buildModelGeometry(plan, candidate = null) {
  const recipe = candidate?.recipe ?? null;
  const detailed = recipe?.assetKit === 'coastal-v1';
  const isUpgraded = entity => detailed && !entity.locked;
  const upgradedLands = new Set(plan.entities.filter(entity => entity.kind === 'land' && isUpgraded(entity)).slice(0, 5).map(entity => entity.id));
  let material = 0;
  const data = [], records = new Map();
  // Core permits at most five refined lands. A fixed budget keeps another land's detail unchanged.
  const beachBudget = 768;
  const waterLevels = new Map(plan.entities.filter(entity => entity.kind === 'water').map(entity => [entity.id, waterLevel(plan, entity)]));
  const groundHeight = point => surfaceHeight(plan, point, waterLevels);
  let record = null;
  const palette = {
    water: new Color(plan.style.waterColor), land: new Color(plan.style.landColor),
    earth: new Color('#9e8767'), plaster: new Color('#eadcc5'), roof: new Color('#bd6e53'),
    dark: new Color('#315b62'), timber: new Color('#715945'), leaves: new Color('#3c8054'),
    red: new Color('#c16d52'), lamp: new Color('#ffe3a0'), road: new Color('#d8c09b'), hull: new Color('#d9e6e0'),
    rock: new Color('#92927c'), foliage: new Color('#3b7955'), shrub: new Color('#6b9654'),
  };
  const coarsePalette = { ...palette };
  const craftedPalette = detailed ? {
    ...palette, water: new Color(recipe.palette.water), land: new Color(recipe.palette.land),
    sand: new Color(recipe.palette.sand), plaster: new Color(recipe.palette.plaster),
    roof: new Color(recipe.palette.roof), timber: new Color(recipe.palette.timber),
    leaves: new Color(recipe.palette.foliage), foliage: new Color(recipe.palette.foliage),
    dark: new Color('#274853'), red: new Color(recipe.palette.roof), lamp: new Color('#ffdf8c'),
    earth: new Color('#aa8b6a'), road: new Color('#c7a777'), hull: new Color('#efe7d3'),
    rock: new Color('#a7a393'), shrub: new Color('#73966a'), trim: new Color('#f6e9ce'), glass: new Color('#458d92'),
  } : palette;
  function emit(geometry, color, position = [0, 0, 0], rotationY = 0, rotationZ = 0) {
    geometry.rotateZ(rotationZ).rotateY(rotationY).translate(...position);
    const p = geometry.attributes.position.array, n = geometry.attributes.normal.array;
    const indices = geometry.index?.array;
    const count = indices?.length ?? p.length / 3;
    for (let i = 0; i < count; i += 3) {
      const offsets = [0,1,2].map(k => (indices ? indices[i+k] : i+k)*3);
      const [ia,ib,ic]=offsets;
      const ax=p[ib]-p[ia],ay=p[ib+1]-p[ia+1],az=p[ib+2]-p[ia+2];
      const bx=p[ic]-p[ia],by=p[ic+1]-p[ia+1],bz=p[ic+2]-p[ia+2];
      const face=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx],faceLength=Math.hypot(...face);
      if(faceLength<1e-10)continue;
      for(const j of offsets) {
        const length=Math.hypot(n[j],n[j+1],n[j+2]);
        const normal=length>1e-7?[n[j],n[j+1],n[j+2]]:face.map(v=>v/faceLength);
        data.push(p[j],p[j+1],p[j+2],...normal,color.r,color.g,color.b,record?.number??0,material);
        record?.bounds.expandByPoint(new Vector3(p[j],p[j+1],p[j+2]));
      }
    }
    geometry.dispose();
  }
  function polygon(points, top, bottom, color, edgeColor) {
    const contour = points.map((point) => ({ x: point.x, y: point.z }));
    const faces = triangulateShape(contour, []), positions = [], indices = [];
    for (const point of contour) positions.push(point.x, top, point.y);
    for (const face of faces) {
      const a = contour[face[0]], b = contour[face[1]], c = contour[face[2]];
      const winding = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      indices.push(face[0], face[winding > 0 ? 2 : 1], face[winding > 0 ? 1 : 2]);
    }
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setIndex(indices);
    geometry.computeVertexNormals(); emit(geometry, color);
    if (top <= bottom) return;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const sides = [a.x, bottom, a.z, b.x, bottom, b.z, b.x, top, b.z, a.x, top, a.z];
      const edge = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(sides, 3)).setIndex([0, 1, 2, 0, 2, 3]);
      edge.computeVertexNormals(); emit(edge, edgeColor);
    }
  }
  function flat(geometry) {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry) geometry.dispose();
    result.computeVertexNormals();
    return result;
  }
  function decoration(detail, land) {
    const { x, z } = worldPoint(detail.point, plan.world), s = detail.scale, ground = land.height, angle = detail.rotation;
    if (detail.type === 'rock') {
      const positions = [], ring = [];
      for (let i = 0; i < 6; i++) {
        const theta = i * Math.PI / 3, radius = (1.24 + .25 * Math.sin(angle + i * 2.7)) * s;
        ring.push([Math.sin(theta) * radius, (.78 + .23 * Math.sin(i * 1.9 + angle)) * s, Math.cos(theta) * radius]);
      }
      const top = [.15 * s, 2.0 * s, -.12 * s];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], bottomA = [a[0] * .86, 0, a[2] * .86], bottomB = [b[0] * .86, 0, b[2] * .86];
        positions.push(...a, ...b, ...top, ...bottomA, ...bottomB, ...b, ...bottomA, ...b, ...a);
      }
      const rock = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
      rock.computeVertexNormals();
      emit(rock, palette.rock, [x, ground, z], angle);
    } else if (detail.type === 'palm') {
      const h = 8 * s;
      if (record.upgraded) { emitCraftedPalm({ emit, palette, x, z, ground, h, scale: s * .54, detail: recipe.detail, seed: recipe.seed }); return; }
      emit(new CylinderGeometry(.17 * s, .32 * s, h * .86, 7), palette.timber, [x, ground + h * .43, z]);
      for (let i = 0; i < 7; i++) {
        const leaf = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
          0, 0, 0, -.44 * s, -.3 * s, 1.4 * s, 0, -1.1 * s, 2.8 * s, .44 * s, -.3 * s, 1.4 * s,
        ], 3)).setIndex([0, 1, 2, 0, 2, 3]);
        leaf.computeVertexNormals(); emit(leaf, palette.leaves, [x, ground + h * .91, z], angle + i * Math.PI * 2 / 7);
      }
      emit(new ConeGeometry(.35 * s, .8 * s, 7), palette.leaves, [x, ground + h * .95, z]);
    } else if (detail.type === 'tree') {
      emit(new CylinderGeometry(.19 * s, .34 * s, 5.9 * s, 7), palette.timber, [x, ground + 2.95 * s, z]);
      for (const [radius, height, center] of [[2.45, 4.0, 4.3], [1.8, 3.4, 5.9], [1.16, 2.6, 7.2]]) {
        emit(flat(new ConeGeometry(radius * s, height * s, 7)), palette.foliage, [x, ground + center * s, z], angle);
      }
    } else if (detail.type === 'shrub') {
      emit(flat(new SphereGeometry(1.18 * s, 6, 3).scale(1, .72, 1)), palette.shrub, [x, ground + .75 * s, z], angle);
    }
  }
  function refineLand(entity, details) {
    if (!details) return;
    const beachTriangles = generateBeachTriangles(plan, entity, details.beach, beachBudget);
    if (beachTriangles.length) {
      const positions = [], normals = [];
      for (const triangle of beachTriangles) {
        for (const point of triangle) { positions.push(point.x, entity.height + .018, point.y); normals.push(0, 1, 0); }
      }
      const shoreline = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
      shoreline.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      emit(shoreline, new Color(details.beach.color));
    }
    const previousMaterial=material; if(record.upgraded)material=1;
    for (const detail of details.decorations) decoration(detail, entity);
    material=previousMaterial;
    record.decorations = details.decorations.length; record.beachTriangles = beachTriangles.length;
    record.details = details.decorations;
  }
  // A real plane is the empty-plan backdrop; submitted water regions remain separate selectable meshes.
  material = detailed ? 2 : 0;
  emit(new PlaneGeometry(plan.world.width * (detailed ? 4 : 1.08), plan.world.depth * (detailed ? 4 : 1.08)).rotateX(-Math.PI / 2), detailed ? craftedPalette.water : palette.water, [0, -.25, 0]);
  for (let index = 0; index < plan.entities.length; index++) {
    const entity = plan.entities[index], upgrade = isUpgraded(entity);
    Object.assign(palette, upgrade ? craftedPalette : coarsePalette);
    material = upgrade ? (entity.kind === 'water' ? 2 : entity.kind === 'land' ? 3 : 1) : 0;
    record = { id: entity.id, kind: entity.kind, number: index + 1, start: data.length / MODEL_VERTEX_STRIDE, end: 0, bounds: new Box3(), decorations: 0, beachTriangles: 0, details: [], upgraded: upgrade, locked: !!entity.locked };
    const points = entity.points.map((point) => worldPoint(point, plan.world));
    if (entity.kind === 'land') {
      const cosmetic = upgradedLands.has(entity.id) ? { ...entity, refinement: entity.refinement ?? makeRefinement('tropical', recipe.detail === 2 ? 2 : 1, recipe.seed) } : entity;
      const derivedPlan = cosmetic === entity ? plan : { ...plan, entities: plan.entities.map(item => item.id === entity.id ? cosmetic : item) };
      const details = cosmetic.refinement ? generateLandDetails(derivedPlan, cosmetic) : null;
      if (upgrade && details) { details.groundColor = recipe.palette.land; details.beach.color = recipe.palette.sand; }
      if (upgrade && details && !entity.refinement) details.decorations = details.decorations.slice(0, 24);
      polygon(points, entity.height, -.24, details ? new Color(details.groundColor) : palette.land, palette.earth);
      record.baseTriangles = (data.length / MODEL_VERTEX_STRIDE - record.start) / 3;
      record.baseBounds = { min: record.bounds.min.toArray(), max: record.bounds.max.toArray() };
      refineLand(entity, details);
    }
    else if (entity.kind === 'water') {
      const level = waterLevels.get(entity.id) + WATER_SURFACE_OFFSET;
      polygon(points, level, level, palette.water, palette.water);
    }
    else if (entity.kind === 'road') {
      const width = Math.max(.6, Math.min(3.2, Math.min(plan.world.width, plan.world.depth) * .018));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-6) continue;
        const surface = Math.max(groundHeight(entity.points[i - 1]), groundHeight(entity.points[i])) + entity.height;
        const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, angle = Math.atan2(b.x - a.x, b.z - a.z);
        emit(new BoxGeometry(width, .22, length + width * .12), palette.road, [x, surface + .12, z], angle);
        if (surface > .35 && groundHeight({ x: (entity.points[i - 1].x + entity.points[i].x) / 2, y: (entity.points[i - 1].y + entity.points[i].y) / 2 }) < surface - .2) {
          for (const t of [.2, .8]) emit(new BoxGeometry(width * .28, surface + .2, width * .28), palette.timber, [a.x + (b.x - a.x) * t, surface / 2, a.z + (b.z - a.z) * t]);
        }
      }
    } else {
      const { x, z } = points[0], ground = groundHeight(entity.points[0]), h = Math.max(.025, entity.height);
      if (upgrade && ['cabin', 'lighthouse', 'palm', 'boat'].includes(entity.kind)) {
        const context = { emit, palette, x, z, ground, h, detail: recipe.detail, seed: recipe.seed };
        ({ cabin: emitCraftedCabin, lighthouse: emitCraftedLighthouse, palm: emitCraftedPalm, boat: emitCraftedBoat })[entity.kind](context);
      } else if (entity.kind === 'cabin') {
        const width = 8, depth = 7;
        emit(new BoxGeometry(width, h * .68, depth), palette.plaster, [x, ground + h * .34, z]);
        for (const side of [-1, 1]) emit(new BoxGeometry(width * .58, .18, depth + 1.3), palette.roof, [x + side * 1.92, ground + h * .79, z], 0, side * -.40);
        emit(new BoxGeometry(1.35, h * .42, .14), palette.timber, [x, ground + h * .21, z + depth / 2 + .08]);
        for (const side of [-1, 1]) emit(new BoxGeometry(1.45, h * .22, .15), palette.dark, [x + side * 2.45, ground + h * .4, z + depth / 2 + .1]);
      } else if (entity.kind === 'lighthouse') {
        emit(new CylinderGeometry(1.75, 2.55, h * .74, 16), palette.plaster, [x, ground + h * .37, z]);
        for (const t of [.24, .51]) emit(new CylinderGeometry(2.35 - t * .8, 2.4 - t * .8, h * .08, 16), palette.red, [x, ground + h * t, z]);
        emit(new CylinderGeometry(2.25, 2.25, h * .035, 16), palette.timber, [x, ground + h * .76, z]);
        emit(new CylinderGeometry(1.55, 1.55, h * .12, 12), palette.dark, [x, ground + h * .835, z]);
        emit(new CylinderGeometry(.75, .75, h * .10, 12), palette.lamp, [x, ground + h * .835, z]);
        emit(new ConeGeometry(2.2, h * .12, 16), palette.roof, [x, ground + h * .94, z]);
      } else if (entity.kind === 'palm') {
        emit(new CylinderGeometry(.23, .45, h * .82, 10), palette.timber, [x, ground + h * .41, z]);
        for (let i = 0; i < 7; i++) {
          const positions = [0, 0, 0, -.8, -.55, 2.6, 0, -1.7, 5.2, .8, -.55, 2.6];
          const leaf = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setIndex([0, 1, 2, 0, 2, 3]);
          leaf.computeVertexNormals(); emit(leaf, palette.leaves, [x, ground + h * .88, z], i * Math.PI * 2 / 7);
        }
        emit(new ConeGeometry(.45, h * .12, 10), palette.leaves, [x, ground + h * .94, z]);
      } else if (entity.kind === 'boat') {
        emit(new BoxGeometry(3.5, h * .35, 8), palette.hull, [x, ground + h * .175 + .08, z]);
        emit(new BoxGeometry(2.45, h * .48, 3.2), palette.plaster, [x, ground + h * .59, z - .4]);
        emit(new BoxGeometry(2.6, .10, 3.4), palette.roof, [x, ground + h * .84, z - .4]);
        emit(new BoxGeometry(1.65, h * .20, .11), palette.dark, [x, ground + h * .61, z + 1.26]);
        emit(new CylinderGeometry(.045, .045, h * .15, 6), palette.timber, [x, ground + h * .92, z - .4]);
      }
    }
    record.end = data.length / MODEL_VERTEX_STRIDE;
    if (data.length / (MODEL_VERTEX_STRIDE * 3) > MODEL_TRIANGLE_BUDGET) throw new Error('候选几何超过 120,000 个三角形预算，请减少对象或细节。');
    records.set(entity.id, record);
  }
  return { data: new Float32Array(data), records };
}

