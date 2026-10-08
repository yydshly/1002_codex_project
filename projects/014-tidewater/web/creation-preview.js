// A real, isolated WebGPU scene, built from the submitted plan. No ocean/game pipeline or model API.
import { validatePlan } from './creation-core.js';
import { waterLevel, surfaceHeight, WATER_SURFACE_OFFSET } from './creation-surfaces.js';
import { generateLandDetails } from './creation-refinement.js';
import { generateBeachTriangles } from './creation-refinement-geometry.js';
import { Engine } from './runtime/src/engine/Engine.js';
import { GPU } from './runtime/src/engine/gpu/GPU.js';
import { BoxGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry, SphereGeometry } from './runtime/src/engine/geometry/PrimitiveGeometries.js';
import { BufferGeometry } from './runtime/src/engine/geometry/BufferGeometry.js';
import { Float32BufferAttribute } from './runtime/src/engine/geometry/BufferAttribute.js';
import { Vector3, Matrix4, Box3, Ray, Color } from './runtime/src/engine/math/index.js';
import { triangulateShape } from './runtime/src/engine/math/ShapeUtils.js';

const send = (type, data = {}) => parent.postMessage({ source: 'tidewater-creation-preview', type, ...data }, location.origin);
const boot = document.getElementById('boot');
const engine = new Engine(document.getElementById('viewport'));
let ready = false, lost = false, currentPlan = null, pendingPlan = null, selectedId = null;
let pipeline, frameBuffer, frameBinding, vertexBuffer, depthTexture, depthSize = '';
let vertexData = new Float32Array(), entities = new Map(), generation = 0, rendered = 0;
let renderBusy = false, scheduled = false, dirty = false;
let cameraPreset = 'overview', yaw = .58, inclination = .94, distance = 290;
const target = new Vector3(0, 2, 0), viewProjection = new Matrix4();
const uniformData = new Float32Array(24);
const defaults = { width: 200, depth: 150 };
const SHADER = /* wgsl */`
struct Frame { viewProjection: mat4x4f, sunlight: vec4f, selection: vec4f };
@group(0) @binding(0) var<uniform> frame: Frame;
struct Vertex {
  @location(0) position: vec3f, @location(1) normal: vec3f,
  @location(2) color: vec3f, @location(3) entity: f32,
};
struct Fragment {
  @builtin(position) position: vec4f, @location(0) normal: vec3f,
  @location(1) color: vec3f, @location(2) @interpolate(flat) entity: f32,
};
@vertex fn vertexMain(input: Vertex) -> Fragment {
  var out: Fragment;
  out.position = frame.viewProjection * vec4f(input.position, 1.0);
  out.normal = input.normal; out.color = input.color; out.entity = input.entity;
  return out;
}
@fragment fn fragmentMain(input: Fragment) -> @location(0) vec4f {
  let n = normalize(input.normal);
  let diffuse = max(dot(n, normalize(frame.sunlight.xyz)), 0.0);
  let hemisphere = 0.37 + 0.15 * max(n.y, 0.0);
  let warm = mix(vec3f(1.0), vec3f(1.16, 0.87, 0.68), frame.sunlight.w);
  var color = input.color * (vec3f(hemisphere) + warm * diffuse * 0.66);
  if (input.entity > 0.5 && abs(input.entity - frame.selection.x) < 0.1) {
    color = mix(color, vec3f(0.24, 0.83, 0.58), 0.43) + vec3f(0.03);
  }
  return vec4f(pow(clamp(color, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;

function report(error) {
  const message = error?.message || String(error);
  document.getElementById('boot-message').textContent = message;
  if (!ready || lost) boot.hidden = false;
  send('error', { message });
}
function worldPoint(point, world) { return { x: (point.x - .5) * world.width, z: (point.y - .5) * world.depth }; }
function buildGeometry(plan) {
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
  function emit(geometry, color, position = [0, 0, 0], rotationY = 0, rotationZ = 0) {
    geometry.rotateZ(rotationZ).rotateY(rotationY).translate(...position);
    const p = geometry.attributes.position.array, n = geometry.attributes.normal.array;
    const indices = geometry.index?.array;
    const count = indices?.length ?? p.length / 3;
    for (let i = 0; i < count; i++) {
      const j = (indices ? indices[i] : i) * 3;
      data.push(p[j], p[j + 1], p[j + 2], n[j], n[j + 1], n[j + 2], color.r, color.g, color.b, record?.number ?? 0);
      record?.bounds.expandByPoint(new Vector3(p[j], p[j + 1], p[j + 2]));
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
    for (const detail of details.decorations) decoration(detail, entity);
    record.decorations = details.decorations.length; record.beachTriangles = beachTriangles.length;
    record.details = details.decorations;
  }
  // A real plane is the empty-plan backdrop; submitted water regions remain separate selectable meshes.
  emit(new PlaneGeometry(plan.world.width * 1.08, plan.world.depth * 1.08).rotateX(-Math.PI / 2), palette.water, [0, -.25, 0]);
  for (let index = 0; index < plan.entities.length; index++) {
    const entity = plan.entities[index];
    record = { id: entity.id, kind: entity.kind, number: index + 1, start: data.length / 10, end: 0, bounds: new Box3(), decorations: 0, beachTriangles: 0, details: [] };
    const points = entity.points.map((point) => worldPoint(point, plan.world));
    if (entity.kind === 'land') {
      const details = entity.refinement ? generateLandDetails(plan, entity) : null;
      polygon(points, entity.height, -.24, details ? new Color(details.groundColor) : palette.land, palette.earth);
      record.baseTriangles = (data.length / 10 - record.start) / 3;
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
      if (entity.kind === 'cabin') {
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
    record.end = data.length / 10;
    records.set(entity.id, record);
  }
  return { data: new Float32Array(data), records };
}

function refreshHud() {
  document.getElementById('preview-title').textContent = currentPlan?.name || '布局粗模';
  const decorations = Array.from(entities.values()).reduce((sum, entity) => sum + entity.decorations, 0);
  document.getElementById('preview-state').textContent = currentPlan ? `${entities.size} 个对象${decorations ? ` · ${decorations} 个细节` : ''} · ${vertexData.length / 30} 个三角形${selectedId ? ` · 已选 ${selectedId}` : ''}` : '等待布局';
}
function applyPlan(input) {
  const plan = validatePlan(input);
  if (lost) throw new Error('GPU 设备已失效，请重新加载预览。');
  if (!ready) { pendingPlan = plan; return; }
  const geometry = buildGeometry(plan);
  const nextBuffer = GPU.device.createBuffer({ size: Math.max(40, geometry.data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label: 'creation plan geometry' });
  if (geometry.data.length) GPU.queue.writeBuffer(nextBuffer, 0, geometry.data);
  const oldBuffer = vertexBuffer;
  const worldChanged = !currentPlan || currentPlan.world.width !== plan.world.width || currentPlan.world.depth !== plan.world.depth;
  vertexBuffer = nextBuffer; vertexData = geometry.data; entities = geometry.records;
  currentPlan = plan; pendingPlan = null; generation++;
  if (!entities.has(selectedId)) selectedId = null;
  if (oldBuffer) GPU.queue.onSubmittedWorkDone().then(() => oldBuffer.destroy()).catch(() => oldBuffer.destroy());
  if (generation === 1 || worldChanged) setCamera(cameraPreset); else requestRender();
  refreshHud();
}
function select(id) {
  if (id !== null && id !== undefined && !entities.has(id)) throw new Error(`布局中没有对象「${id}」。`);
  selectedId = id ?? null; refreshHud(); requestRender();
}
function setCamera(preset) {
  if (!['overview', 'top'].includes(preset)) throw new Error('镜头只支持 overview 或 top。');
  cameraPreset = preset;
  const world = currentPlan?.world || defaults;
  const tallest = Math.max(0, ...Array.from(entities.values(), (record) => record.bounds.max.y));
  target.set(0, Math.max(1, tallest * .13), 0);
  distance = Math.max(world.width, world.depth, tallest * 2) * (preset === 'top' ? 1.65 : 1.36);
  yaw = preset === 'top' ? 0 : .58; inclination = preset === 'top' ? .002 : .94;
  document.querySelectorAll('[data-camera]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.camera === preset)));
  requestRender();
}
function updateCamera() {
  engine.camera.position.set(target.x + Math.sin(yaw) * Math.sin(inclination) * distance, target.y + Math.cos(inclination) * distance, target.z + Math.cos(yaw) * Math.sin(inclination) * distance);
  engine.camera.lookAt(target); engine.camera.updateMatrixWorld(true);
  viewProjection.multiplyMatrices(engine.camera.projectionMatrix, engine.camera.matrixWorldInverse);
}
function requestRender() {
  dirty = true;
  if (!ready || lost || renderBusy || scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; if (dirty && ready && !lost) render(); });
}
function render() {
  if (renderBusy) return;
  dirty = false; renderBusy = true;
  try {
    const width = engine.width, height = engine.height, size = `${width}x${height}`;
    if (size !== depthSize) {
      depthTexture?.destroy(); depthSize = size;
      depthTexture = GPU.device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT, label: 'creation depth' });
    }
    updateCamera(); uniformData.set(viewProjection.elements, 0);
    const sunset = currentPlan?.style.lighting === 'sunset';
    uniformData.set(sunset ? [-.7, .3, .45, 1] : [-.35, .82, .48, 0], 16);
    uniformData.set([entities.get(selectedId)?.number || 0, 0, 0, 0], 20);
    GPU.queue.writeBuffer(frameBuffer, 0, uniformData);
    const encoder = GPU.device.createCommandEncoder({ label: 'creation frame' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: engine.currentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: sunset ? { r: .85, g: .75, b: .68, a: 1 } : { r: .78, g: .86, b: .82, a: 1 } }],
      depthStencilAttachment: { view: depthTexture.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    if (vertexBuffer && vertexData.length) { pass.setPipeline(pipeline); pass.setBindGroup(0, frameBinding); pass.setVertexBuffer(0, vertexBuffer); pass.draw(vertexData.length / 10); }
    pass.end(); GPU.queue.submit([encoder.finish()]); rendered++;
    GPU.queue.onSubmittedWorkDone().then(() => { renderBusy = false; if (dirty) requestRender(); }).catch((error) => { renderBusy = false; report(error); });
  } catch (error) { renderBusy = false; report(error); }
}
const a = new Vector3(), b = new Vector3(), c = new Vector3(), intersection = new Vector3();
function pick(x, y) {
  updateCamera();
  const point = new Vector3(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2, 1).unproject(engine.camera);
  const ray = new Ray(engine.camera.position.clone(), point.sub(engine.camera.position).normalize());
  let closest = null, nearest = Infinity;
  for (const record of entities.values()) {
    if (!ray.intersectsBox(record.bounds)) continue;
    for (let i = record.start; i < record.end; i += 3) {
      a.fromArray(vertexData, i * 10); b.fromArray(vertexData, (i + 1) * 10); c.fromArray(vertexData, (i + 2) * 10);
      if (ray.intersectTriangle(a, b, c, false, intersection)) {
        const distance = ray.origin.distanceToSquared(intersection);
        // The depth pipeline lets later coplanar surfaces win; picking must choose the same visible object.
        if (distance <= nearest + 1e-7) { nearest = Math.min(nearest, distance); closest = record.id; }
      }
    }
  }
  select(closest); send('select', { id: closest });
}
function bounds(id) {
  const record = entities.get(id);
  return record ? { min: record.bounds.min.toArray(), max: record.bounds.max.toArray(), triangles: (record.end - record.start) / 3,
    decorations: record.decorations, beachTriangles: record.beachTriangles,
    ...(record.baseBounds ? { baseBounds: structuredClone(record.baseBounds), baseTriangles: record.baseTriangles } : {}),
  } : null;
}
window.creationPreview = {
  get ready() { return ready && !lost; }, get plan() { return currentPlan ? structuredClone(currentPlan) : null; },
  get selectedId() { return selectedId; }, get cameraPreset() { return cameraPreset; },
  get stats() { return { renderer: 'WebGPU', entities: entities.size, vertices: vertexData.length / 10, triangles: vertexData.length / 30, bufferBytes: vertexData.byteLength, generation, rendered, inFlight: renderBusy,
    decorations: Array.from(entities.values()).reduce((sum, entity) => sum + entity.decorations, 0),
    beachTriangles: Array.from(entities.values()).reduce((sum, entity) => sum + entity.beachTriangles, 0),
  }; },
  getEntityBounds: bounds, applyPlan, select, camera: setCamera,
  getRefinementDetails: id => structuredClone(entities.get(id)?.details ?? []),
  projectPoint: (point, height = 0) => {
    if (!currentPlan) return null;
    updateCamera(); const position = worldPoint(point, currentPlan.world);
    const p = new Vector3(position.x, height, position.z).project(engine.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  },
  projectEntity: id => {
    const record = entities.get(id); if (!record) return null;
    updateCamera(); const p = record.bounds.getCenter(new Vector3()).project(engine.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  },
};
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'tidewater-creation') return;
  try {
    if (event.data.type === 'plan') applyPlan(event.data.plan);
    else if (event.data.type === 'camera') setCamera(event.data.preset);
    else if (event.data.type === 'select') select(event.data.id);
  } catch (error) { report(error); }
});
document.querySelectorAll('[data-camera]').forEach((button) => button.addEventListener('click', () => setCamera(button.dataset.camera)));

async function init() {
  await engine.init(); engine.camera.fov = 43; engine.camera.near = .3; engine.camera.far = 20000; engine.camera.updateProjectionMatrix();
  GPU.device.lost.then((info) => { lost = true; ready = false; report(new Error(`3D GPU 设备已失效：${info.message || info.reason}`)); });
  const shader = GPU.device.createShaderModule({ code: SHADER, label: 'creation basic lighting' });
  const diagnostics = await shader.getCompilationInfo();
  const errors = diagnostics.messages.filter((message) => message.type === 'error');
  if (errors.length) throw new Error(errors.map((error) => error.message).join('; '));
  pipeline = await GPU.device.createRenderPipelineAsync({
    label: 'creation mesh pipeline', layout: 'auto',
    vertex: { module: shader, entryPoint: 'vertexMain', buffers: [{ arrayStride: 40, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32' },
    ] }] },
    fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format: GPU.format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'greater-equal' },
  });
  frameBuffer = GPU.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'creation camera/light' });
  frameBinding = GPU.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  let drag = null;
  engine.canvas.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }; engine.canvas.setPointerCapture(event.pointerId); });
  engine.canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
    if (drag.moved) { yaw -= (event.clientX - drag.lastX) * .007; inclination = Math.max(.015, Math.min(1.46, inclination + (event.clientY - drag.lastY) * .006)); requestRender(); }
    drag.lastX = event.clientX; drag.lastY = event.clientY;
  });
  engine.canvas.addEventListener('pointerup', (event) => { if (!drag) return; if (!drag.moved) pick(event.clientX, event.clientY); drag = null; });
  engine.canvas.addEventListener('pointercancel', () => { drag = null; });
  engine.canvas.addEventListener('wheel', (event) => { event.preventDefault(); const world = currentPlan?.world || defaults; distance = Math.max(Math.max(world.width, world.depth) * .12, Math.min(Math.max(world.width, world.depth) * 5, distance * Math.exp(event.deltaY * .001))); requestRender(); }, { passive: false });
  engine.onResize.push(requestRender);
  if (lost) throw new Error('GPU 设备已失效，请重新加载预览。');
  ready = true; boot.hidden = true;
  if (pendingPlan) applyPlan(pendingPlan); else setCamera(cameraPreset);
  send('ready');
}
init().catch(report);
window.addEventListener('pagehide', () => { lost = true; ready = false; vertexBuffer?.destroy(); depthTexture?.destroy(); frameBuffer?.destroy(); });
