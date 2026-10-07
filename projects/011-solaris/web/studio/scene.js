import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OBJECTS, TABLE_VARIANTS, SWATCHES, definition, dimensions, sceneObjects, worldPosition, clone, initialProject } from './core.js';

const asset = relative => new URL(`./assets/${relative}`, import.meta.url).href;
export const ART_IMAGES = {};
function textureCanvas(width, height, draw, srgb = true) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function createArt(kind) {
  return textureCanvas(1024, 600, (ctx, w, h) => {
    ctx.fillStyle = kind === 'blue' ? '#dadace' : '#dfd4bc'; ctx.fillRect(0, 0, w, h);
    const tones = kind === 'blue' ? ['#818e94', '#a0a8a3', '#304e5a', '#bcbaaa'] : ['#b68161', '#c6ad87', '#8c7860', '#566655'];
    if (kind === 'line') {
      ctx.strokeStyle = '#626b57'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(130, 570);
      ctx.bezierCurveTo(980, 300, -100, 120, 780, 80); ctx.bezierCurveTo(500, 200, 640, 480, 250, 600); ctx.stroke();
      ctx.fillStyle = '#b69f76'; ctx.beginPath(); ctx.arc(760, 210, 95, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = tones[0]; ctx.beginPath(); ctx.ellipse(255, 205, 185, 225, -.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tones[1]; ctx.beginPath(); ctx.ellipse(570, 430, 450, 260, .13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tones[2]; ctx.beginPath(); ctx.arc(784, 160, 101, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tones[3]; ctx.beginPath(); ctx.ellipse(150, 630, 390, 150, -.32, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 60000; i++) { const n = ((i * 16807) % 2147483647) / 2147483647; ctx.fillStyle = `rgba(75,65,45,${n * .028})`; ctx.fillRect((i * 137) % w, (i * 223) % h, 1.5, 1.5); }
  });
}

export async function createStudio(host, callbacks = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#ebe9df');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement); renderer.domElement.setAttribute('aria-label', '可编辑的三维客厅');
  const camera = new THREE.PerspectiveCamera(40, 1, .05, 80);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .10;
  controls.minDistance = 3.0; controls.maxDistance = 17; controls.maxPolarAngle = Math.PI * .49; controls.minPolarAngle = .01;
  controls.target.set(0, 1.06, -.1); camera.position.set(7.1, 5.45, 7.4); controls.update();
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, 1, 1); ao.kernelRadius = .15; ao.minDistance = .004; ao.maxDistance = .075; composer.addPass(ao); composer.addPass(new OutputPass());
  const manager = new THREE.LoadingManager(); manager.onProgress = (url, loaded, total) => callbacks.progress?.(loaded / total, url);
  const textureLoader = new THREE.TextureLoader(manager); const modelLoader = new GLTFLoader(manager);
  const loadTex = async (relative, color = false, repeat = [1, 1]) => {
    const t = await textureLoader.loadAsync(asset(relative)); if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
  };
  const [day, evening, floorMap, floorNormal, floorRough, weaveNormal, weaveRough, weaveSource] = await Promise.all([
    new HDRLoader(manager).loadAsync(asset('environment/coastal-day.hdr')),
    new HDRLoader(manager).loadAsync(asset('environment/coastal-sunset.hdr')),
    loadTex('textures/wood_floor-diff.jpg', true, [3, 2.5]), loadTex('textures/wood_floor-nor_gl.jpg', false, [3, 2.5]),
    loadTex('textures/wood_floor-rough.jpg', false, [3, 2.5]), loadTex('textures/fabric_pattern_07-nor_gl.jpg', false, [4, 4]), loadTex('textures/fabric_pattern_07-rough.jpg', false, [4, 4]), loadTex('textures/fabric_pattern_07-diff.jpg', true),
  ]);
  const weaveMap = textureCanvas(512, 512, (ctx,w,h)=>{
    ctx.drawImage(weaveSource.image,0,0,w,h); const pixels=ctx.getImageData(0,0,w,h);
    for(let i=0;i<pixels.data.length;i+=4){const value=Math.round(150+(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)*.41);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}ctx.putImageData(pixels,0,0);
  }); weaveMap.wrapS=weaveMap.wrapT=THREE.RepeatWrapping;weaveMap.repeat.set(4,4);weaveMap.anisotropy=8;weaveSource.dispose();
  const pmrem = new THREE.PMREMGenerator(renderer); const envDay = pmrem.fromEquirectangular(day); const envEvening = pmrem.fromEquirectangular(evening);
  day.dispose(); evening.dispose(); pmrem.dispose(); scene.environment = envDay.texture;
  const room = new THREE.Group(); scene.add(room);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ddd5c7', roughness: .94 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#d5cbb8', roughness: .76 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#a58c65', roughness: .72 });
  const mesh = (geometry, material, x, y, z, parent = room) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, material, x, y, z, parent = room) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorMap, normalMap: floorNormal, roughnessMap: floorRough, color: '#e7dbbd', roughness: .78, normalScale: new THREE.Vector2(.35, .35) });
  const floor = mesh(new THREE.PlaneGeometry(6, 5), floorMat, 0, 0, 0); floor.rotation.x = -Math.PI / 2;
  box(6.2, .16, 5.2, new THREE.MeshStandardMaterial({ color: '#d5cfbf', roughness: .8 }), 0, -.09, 0);
  box(6.13, 3.20, .12, wallMat, 0, 1.6, -2.5);
  // A side wall with a real window opening; the cutaway is open toward the viewer.
  box(.12, .78, 5.0, wallMat, -3, .39, 0); box(.12, .38, 5.0, wallMat, -3, 3.01, 0);
  box(.12, 2.04, .73, wallMat, -3, 1.8, -2.135); box(.12, 2.04, .73, wallMat, -3, 1.8, 2.135);
  for (const z of [-1.765, 0, 1.765]) box(.14, 2.13, .055, trimMat, -2.95, 1.81, z);
  for (const y of [.75, 2.86]) box(.18, .065, 3.60, trimMat, -2.95, y, 0);
  box(.35, .055, 3.70, trimMat, -2.91, .75, 0);
  box(6.05, .10, .035, trimMat, 0, .075, -2.423); box(.035, .10, 5, trimMat, -2.924, .075, 0);
  for (let i = 0; i < 12; i++) box(.045, 3.04, .035, woodMat, 2.46 + i * .045, 1.58, -2.405);
  const curtainMap = textureCanvas(128, 128, (ctx, w, h) => { ctx.fillStyle = '#d8d1bc'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#ffffff35'; for (let i = 0; i < 128; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); } });
  curtainMap.wrapS = curtainMap.wrapT = THREE.RepeatWrapping; curtainMap.repeat.set(1, 3);
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainMap, roughness: 1, side: THREE.DoubleSide });
  for (const z0 of [-1.87, 1.20]) {
    const geometry = new THREE.PlaneGeometry(.68, 2.4, 28, 8); const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * 70) * .038);
    geometry.computeVertexNormals(); const curtain = mesh(geometry, curtainMat, -2.79, 1.70, z0 + .34); curtain.rotation.y = Math.PI / 2;
  }
  const horizon = box(.01, 7, 14, new THREE.MeshBasicMaterial({ color: '#e5e6db' }), -6.0, 2.5, 0); horizon.castShadow = false; horizon.receiveShadow = false;
  const sun = new THREE.DirectionalLight('#fff1d1', 3.5); sun.position.set(-5, 7, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -4.5; sun.shadow.camera.right = 4.5; sun.shadow.camera.top = 4.5; sun.shadow.camera.bottom = -4.5;
  sun.shadow.camera.near = .1; sun.shadow.camera.far = 24; sun.shadow.bias = -.0003; sun.shadow.normalBias = .025; sun.shadow.radius = 3;
  sun.target.position.set(0, .3, -.25); scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#e8ede2', '#75674f', 1.0); scene.add(hemi);
  const areaFill = new THREE.DirectionalLight('#f5f4e4', .8); areaFill.position.set(4, 5, 6); scene.add(areaFill);
  const groups = new Map(), fabricMeshes = [], originals = new Map();
  const linenNormal = textureCanvas(128, 128, (ctx, w, h) => { ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 128; i++) { ctx.fillStyle = i % 4 < 2 ? '#8b7ffc' : '#7585fc'; ctx.fillRect(i, 0, 1, 128); ctx.fillStyle = i % 4 < 2 ? '#7f8bfc' : '#8575fc'; ctx.fillRect(0, i, 128, 1); } }, false);
  linenNormal.wrapS = linenNormal.wrapT = THREE.RepeatWrapping; linenNormal.repeat.set(5, 5);
  await Promise.all([...OBJECTS.filter(d => d.asset), { id: 'table-solid', kind: 'table', ...TABLE_VARIANTS.solid }].map(async def => {
    const gltf = await modelLoader.loadAsync(asset(`models/${def.asset}/${def.asset}.gltf`));
    const model = gltf.scene; model.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const byHeight = ['plant', 'lamp', 'table'].includes(def.kind || def.id); const factor = byHeight ? def.height / size.y : def.width / size.x;
    model.scale.setScalar(factor); model.position.set(-center.x * factor, -bounds.min.y * factor, -center.z * factor);
    if (Math.abs(size.z * factor - def.depth) > .005 || Math.abs(size.x * factor - def.width) > .005 || Math.abs(size.y * factor - def.height) > .005) throw new Error(`资产尺寸与校准不符：${def.asset}`);
    const group = new THREE.Group(); group.userData.objectId = def.id; group.add(model); scene.add(group); groups.set(def.id, group);
    model.updateWorldMatrix(true, true);
    model.traverse(child => {
      if (!child.isMesh) return; child.castShadow = true; child.receiveShadow = true; child.userData.objectId = def.id;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const patched = materials.map(mat => {
        mat = mat.clone(); if (mat.map) mat.map.anisotropy = 8;
        const isFabric = def.id === 'sofa' ? /seat|base/i.test(child.name) : def.id === 'chair' && /pillow/i.test(mat.name);
        if (isFabric) { mat.userData.fabric = true; originals.set(mat, { map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, metalnessMap: mat.metalnessMap, roughness: mat.roughness, metalness: mat.metalness, color: mat.color.clone() }); fabricMeshes.push({ id: def.id, mat }); }
        return mat;
      }); child.material = Array.isArray(child.material) ? patched : patched[0];
      if (def.id === 'sofa' && /base/i.test(child.name)) {
        // The upstream base shares one atlas across upholstery and legs.
        // Partition triangles by their height so fabric edits retain the wooden feet.
        const geometry = child.geometry.clone(); const position = geometry.attributes.position, index = geometry.index;
        geometry.clearGroups(); const fabricIndices = [], woodIndices = []; const count = index ? index.count : position.count;
        for (let offset = 0; offset < count; offset += 3) {
          let maxHeight = -Infinity;
          for (let k = 0; k < 3; k++) { const vertex = new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(offset + k) : offset + k).applyMatrix4(child.matrixWorld); maxHeight = Math.max(maxHeight, vertex.y); }
          const destination = maxHeight < .21 ? woodIndices : fabricIndices;
          for (let k = 0; k < 3; k++) destination.push(index ? index.getX(offset + k) : offset + k);
        }
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([...fabricIndices, ...woodIndices]), 1)); geometry.addGroup(0, fabricIndices.length, 0); geometry.addGroup(fabricIndices.length, woodIndices.length, 1); child.geometry = geometry; const wood = child.material.clone(); wood.userData.fabric = false; const original = originals.get(child.material); wood.map = original.map; wood.normalMap = original.normalMap; child.material = [child.material, wood];
      }
    });
  }));
  const artGroup = new THREE.Group(); artGroup.userData.objectId = 'art'; groups.set('art', artGroup); scene.add(artGroup);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#856d4d', roughness: .56, metalness: .1 });
  box(1.64, .035, .07, frameMat, 0, .477, 0, artGroup); box(1.64, .035, .07, frameMat, 0, -.477, 0, artGroup);
  box(.035, .92, .07, frameMat, -.803, 0, 0, artGroup); box(.035, .92, .07, frameMat, .803, 0, 0, artGroup);
  const artTextures = {}; for (const kind of ['earth', 'blue', 'line']) { artTextures[kind] = createArt(kind); ART_IMAGES[kind] = artTextures[kind].image.toDataURL('image/jpeg', .8); }
  const artMat = new THREE.MeshStandardMaterial({ map: artTextures.earth, roughness: .97 });
  mesh(new THREE.PlaneGeometry(1.58, .92), artMat, 0, 0, .037, artGroup).userData.artSurface = true;
  artGroup.traverse(child => { child.userData.objectId = 'art'; });
  const rugGroup = new THREE.Group(); rugGroup.userData.objectId = 'rug'; scene.add(rugGroup); groups.set('rug', rugGroup);
  const rugMap = textureCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c7bda6'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i++) { ctx.strokeStyle = i % 3 ? '#dfd6bf55' : '#918d7255'; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let i = 0; i < h; i++) { ctx.strokeStyle = i % 3 ? '#e7dfce55' : '#9d967755'; ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    ctx.strokeStyle = '#9d968155'; ctx.lineWidth = 12; ctx.strokeRect(22, 22, w - 44, h - 44);
  });
  const rug = mesh(new THREE.PlaneGeometry(3.65, 2.65), new THREE.MeshStandardMaterial({ map: rugMap, roughness: 1, normalMap: linenNormal, normalScale: new THREE.Vector2(.3, .3) }), 0, .004, 0, rugGroup);
  rug.rotation.x = -Math.PI / 2; rug.castShadow = false; rug.userData.objectId = 'rug';
  // Small authored details establish the scale and everyday use of the space.
  const tableGroup = groups.get('table');
  const books = new THREE.Group(); tableGroup.add(books); books.position.set(-.15, definition('table').height + .025, 0);
  box(.29, .035, .20, new THREE.MeshStandardMaterial({ color: '#756f54', roughness: .85 }), 0, 0, 0, books);
  box(.265, .025, .18, new THREE.MeshStandardMaterial({ color: '#ddd3b9', roughness: .85 }), .01, .035, .008, books);
  const ceramic = new THREE.MeshStandardMaterial({ color: '#e2d6bc', roughness: .65 });
  const cup = mesh(new THREE.CylinderGeometry(.045, .037, .078, 32), ceramic, -.22, definition('table').height + .06, .21, tableGroup);
  const coffee = mesh(new THREE.CircleGeometry(.034, 32), new THREE.MeshStandardMaterial({ color: '#48362c', roughness: .25 }), -.22, definition('table').height + .101, .21, tableGroup); coffee.rotation.x = -Math.PI / 2;
  const handle = mesh(new THREE.TorusGeometry(.027, .009, 8, 24), ceramic, -.166, definition('table').height + .06, .21, tableGroup); handle.rotation.y = Math.PI / 2;
  [cup, coffee, handle].forEach(m => m.userData.objectId = 'table'); books.traverse(child => child.userData.objectId = 'table');
  for (const detail of [books, cup, coffee, handle]) groups.get('table-solid').add(detail.clone(true));
  const lampLight = new THREE.PointLight('#ffdab2', 11, 4, 2); lampLight.castShadow = true; lampLight.shadow.mapSize.set(512, 512); lampLight.shadow.normalBias = .035; groups.get('lamp').add(lampLight); lampLight.position.set(0, definition('lamp').height * .8, .07);
  const selection = new THREE.Box3Helper(new THREE.Box3(), '#90a66f'); selection.material.depthTest = false; selection.material.transparent = true; selection.material.opacity = .65; selection.renderOrder = 3; scene.add(selection);
  const measureGroup = new THREE.Group(); scene.add(measureGroup); let measurePoints = [], measureLine = null;
  const raycaster = new THREE.Raycaster(); let selected = 'sofa', project = initialProject(), disposed = false;
  let lastEnvironment = ''; const artCache = new Map();
  // Immutable asset templates; instances own materials, sharing only static geometry/textures.
  const templates = new Map(groups), signatures = new Map();
  for (const group of templates.values()) scene.remove(group);
  groups.clear(); fabricMeshes.length = 0; originals.clear();
  function removeInstance(id) {
    const group = groups.get(id); if (!group) return;
    scene.remove(group); group.traverse(child => { if (child.isMesh) for (const mat of Array.isArray(child.material) ? child.material : [child.material]) { originals.delete(mat); mat.dispose(); } if (child.isLight) child.shadow?.dispose(); });
    for (let i = fabricMeshes.length - 1; i >= 0; i--) if (fabricMeshes[i].id === id) fabricMeshes.splice(i, 1);
    groups.delete(id); signatures.delete(id);
  }
  function reconcile(next) {
    const active = sceneObjects(next), ids = new Set(active.map(d => d.id));
    for (const id of groups.keys()) if (!ids.has(id)) removeInstance(id);
    for (const def of active) {
      const source = def.kind === 'table' && next.objects[def.id].variant === 'solid' ? 'table-solid' : def.kind;
      if (signatures.get(def.id) === source) continue;
      removeInstance(def.id);
      const group = templates.get(source).clone(true);
      group.traverse(child => {
        child.userData.objectId = def.id;
        if (!child.isMesh) return;
        const mats = (Array.isArray(child.material) ? child.material : [child.material]).map(sourceMat => {
          const mat = sourceMat.clone();
          if (mat.userData.fabric) { originals.set(mat, { map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, metalnessMap: mat.metalnessMap, roughness: mat.roughness, metalness: mat.metalness, color: mat.color.clone() }); fabricMeshes.push({ id: def.id, mat }); }
          return mat;
        }); child.material = Array.isArray(child.material) ? mats : mats[0];
      });
      groups.set(def.id, group); signatures.set(def.id, source); scene.add(group);
    }
  }

  function setCamera(data) { camera.position.fromArray(data.position); controls.target.fromArray(data.target); controls.update(); }
  function getCamera() { return { position: camera.position.toArray(), target: controls.target.toArray() }; }
  function apply(next, applyCamera = false) {
    project = next;
    reconcile(next);
    for (const def of sceneObjects(next)) { const value = next.objects[def.id], group = groups.get(def.id), pos = worldPosition(next, def.id); group.position.set(pos.x, pos.y, pos.z); group.rotation.y = value.rotation + (def.parent ? next.objects[def.parent].rotation : 0); group.scale.set(value.scale * value.stretch.x, value.scale * value.stretch.y, value.scale * value.stretch.z); }
    for (const { id, mat } of fabricMeshes) {
      const value = next.objects[id], original = originals.get(mat), key = `${value.material}:${value.color}`;
      if (mat.userData.variant === key) continue; mat.userData.variant = key;
      const tint = SWATCHES.find(s => s.id === value.color).color;
      if (value.material === 'original') { Object.assign(mat, { map: original.map, normalMap: original.normalMap, roughnessMap: original.roughnessMap, metalnessMap: original.metalnessMap, roughness: original.roughness, metalness: original.metalness }); mat.color.copy(original.color); if (value.color !== 'sage' || definition(id, next).kind !== 'chair') mat.color.multiply(new THREE.Color(tint)); }
      else { mat.map = value.material === 'weave' ? weaveMap : null; mat.metalnessMap = null; mat.metalness = 0; mat.roughness = .96; mat.roughnessMap = value.material === 'weave' ? weaveRough : null; mat.normalMap = value.material === 'weave' ? weaveNormal : linenNormal; mat.normalScale.set(value.material === 'weave' ? .24 : .12, value.material === 'weave' ? .24 : .12); mat.color.set(tint); }
      mat.needsUpdate = true;
    }
    for (const def of sceneObjects(next)) {
      const value = next.objects[def.id], group = groups.get(def.id);
      if (def.kind === 'lamp') group.traverse(child => { if (child.isPointLight) child.intensity = next.environment.lampOn ? next.environment.lampPower : 0; });
      if (def.kind !== 'art') continue;
      group.traverse(child => {
        if (!child.userData.artSurface) return;
        const mat = child.material, key = value.customImage || value.artwork;
        if (mat.userData.artKey === key && (!value.customImage || !artCache.has(key) || mat.map === artCache.get(key))) return; mat.userData.artKey = key;
        if (!value.customImage) mat.map = artTextures[value.artwork];
        else if (artCache.has(key)) mat.map = artCache.get(key);
        else textureLoader.load(key, texture => { texture.colorSpace = THREE.SRGBColorSpace; artCache.set(key, texture); if (groups.get(def.id) === group && mat.userData.artKey === key) { mat.map = texture; mat.needsUpdate = true; } });
        mat.needsUpdate = true;
      });
    }
    const envKey = JSON.stringify(next.environment);
    if (lastEnvironment !== envKey) {
      lastEnvironment = envKey; const e = next.environment;
      const sunlight = Math.max(0, Math.sin((e.hour - 6) / 12 * Math.PI)); const warmth = e.hour > 16 ? Math.min(1, (e.hour - 16) / 3) : 0;
      const azimuth = e.sun / 180 * Math.PI;
      sun.position.set(-Math.cos(azimuth) * 8, 2 + sunlight * 6, Math.sin(azimuth) * 8); sun.intensity = sunlight * 3.7; sun.color.set(warmth > .1 ? '#ffd0a0' : '#fff2d4');
      hemi.intensity = .36 + sunlight * .82; areaFill.intensity = .15 + sunlight * .5;
      scene.environment = e.hour >= 17 ? envEvening.texture : envDay.texture; scene.environmentIntensity = .23 + sunlight * .37;
      wallMat.color.set(e.wall); scene.background.set(e.hour > 18 ? '#d3cebf' : '#ebe9df');
      renderer.toneMappingExposure = e.hour > 18 ? 1.35 : 1.05;
    }
    if (applyCamera) setCamera(next.camera);
    updateSelection();
  }
  function updateSelection() { const group = groups.get(selected); selection.visible = !!group; if (group) { group.updateWorldMatrix(true, true); selection.box.setFromObject(group); } }
  function select(id) { selected = id; updateSelection(); }
  function pointerRay(x, y) { const rect = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera); return raycaster; }
  function pick(x, y) { const hits = pointerRay(x, y).intersectObjects([...groups.values()], true); return hits.find(hit => hit.object.userData.objectId)?.object.userData.objectId ?? null; }
  function planePoint(x, y, id = null) { const def = id ? definition(id, project) : null; const plane = def?.wall ? new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.42) : new THREE.Plane(new THREE.Vector3(0, 1, 0), -(def?.parent ? dimensions(project, def.parent).height : .02)); return pointerRay(x, y).ray.intersectPlane(plane, new THREE.Vector3()); }
  function projectPoint(id) { if (!id || !groups.has(id)) return { x: 0, y: 0, visible: false }; const pos = worldPosition(project, id); const v = new THREE.Vector3(pos.x, pos.y + dimensions(project, id).height + .10, pos.z).project(camera); return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight, visible: v.z < 1 && Math.abs(v.x) < .96 && Math.abs(v.y) < .92 }; }
  function setMeasure(point) {
    if (measurePoints.length === 2) clearMeasure(); measurePoints.push(point.clone());
    const marker = mesh(new THREE.SphereGeometry(.035, 16, 12), new THREE.MeshBasicMaterial({ color: '#718958', depthTest: false }), point.x, .045, point.z, measureGroup); marker.renderOrder = 5;
    if (measurePoints.length === 2) { const geometry = new THREE.BufferGeometry().setFromPoints(measurePoints.map(p => new THREE.Vector3(p.x, .045, p.z))); measureLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#718958', depthTest: false })); measureLine.renderOrder = 5; measureGroup.add(measureLine); }
    return measurePoints.length === 2 ? measurePoints[0].distanceTo(measurePoints[1]) : null;
  }
  function clearMeasure() { while (measureGroup.children.length) { const m = measureGroup.children.pop(); m.geometry?.dispose(); m.material?.dispose(); m.parent = null; } measurePoints = []; measureLine = null; }
  function measureLabel() { if (measurePoints.length !== 2) return null; const v = measurePoints[0].clone().add(measurePoints[1]).multiplyScalar(.5); v.y = .12; v.project(camera); return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight, text: `${measurePoints[0].distanceTo(measurePoints[1]).toFixed(2)} m` }; }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.fov = Math.min(72, 45 + Math.max(0, .9 - camera.aspect) * 65); camera.updateProjectionMatrix(); }
  const observer = new ResizeObserver(resize); observer.observe(host); resize(); apply(project, true);
  function render() { if (disposed || document.hidden) return; controls.update(); updateSelection(); composer.render(); callbacks.frame?.(projectPoint(selected), measureLabel()); }
  let frameId, lastFrame = performance.now(), timing = []; function loop() { if (disposed) return; const now = performance.now(); if (!document.hidden) { timing.push(now-lastFrame); if(timing.length>120)timing.shift(); if(timing.length===120){const sorted=[...timing].sort((a,b)=>a-b);host.dataset.frameMedian=sorted[60].toFixed(1);host.dataset.frameP95=sorted[114].toFixed(1);} } lastFrame=now; render(); frameId = requestAnimationFrame(loop); } loop();
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); callbacks.contextLost?.(); });
  const screenshot = async (state = null, sameCamera = true) => {
    const images = [...new Set(sceneObjects(state || project).filter(d => d.kind === 'art').map(d => (state || project).objects[d.id].customImage).filter(Boolean))];
    for (const image of images) if (!artCache.has(image)) { const texture = await textureLoader.loadAsync(image); texture.colorSpace = THREE.SRGBColorSpace; artCache.set(image, texture); }
    const previous = project, cam = getCamera(), wasSelected = selection.visible, wasMeasure = measureGroup.visible;
    apply(state || project, state ? !sameCamera : false); selection.visible = false; measureGroup.visible = false; composer.render();
    const result = renderer.domElement.toDataURL('image/jpeg', .9);
    if (state) apply(previous); setCamera(cam); selection.visible = wasSelected; measureGroup.visible = wasMeasure; composer.render(); return result;
  };
  return { renderer, camera, controls, apply, select, pick, planePoint, projectPoint, getCamera, setCamera, screenshot, setMeasure, clearMeasure,
    dispose() { disposed = true; cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose(); composer.dispose(); envDay.dispose(); envEvening.dispose(); scene.traverse(o => { o.geometry?.dispose(); const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; mats.forEach(m => m.dispose()); }); renderer.dispose(); renderer.domElement.remove(); },
  };
}
