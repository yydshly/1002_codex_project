import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// These are the complete, locally registered Poly Haven assets. Product names,
// preferences and display-slot state belong to the collection application.
const SOURCES = Object.freeze({
  sofa: 'sofa_02',
  chair: 'modern_arm_chair_01',
  'table-glass': 'modern_coffee_table_01',
  'table-solid': 'modern_coffee_table_02',
  lamp: 'desk_lamp_arm_01',
  plant: 'potted_plant_04',
});
const VIEWS = Object.freeze({
  'three-quarter': [1, .62, 1.45],
  front: [0, .40, 1],
  side: [1, .40, 0],
});
const WIDTH = 900, HEIGHT = 650, ASPECT = WIDTH / HEIGHT;
const localAsset = relative => new URL(`../studio/assets/${relative}`, import.meta.url).href;

/**
 * One off-screen WebGL context renders six real product photographs on demand.
 * Uniform display scaling and camera framing do not represent retail dimensions.
 * There is no animation loop, material substitution or external network asset.
 */
export async function createProductRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: false, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eeece6');
  const camera = new THREE.OrthographicCamera(-ASPECT, ASPECT, 1, -1, .05, 30);
  const products = new Map();
  const images = Object.create(null);
  let environmentTarget = null, disposed = false, current = null;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#eae6de', roughness: .95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.001;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.HemisphereLight('#faf5ec', '#b9b2a4', .65));
  const key = new THREE.DirectionalLight('#fff5e8', 2.6);
  key.position.set(-3.4, 6, 4.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -3.2;
  key.shadow.camera.right = key.shadow.camera.top = 3.2;
  key.shadow.camera.near = .1;
  key.shadow.camera.far = 18;
  key.shadow.bias = -.00015;
  key.shadow.normalBias = .012;
  key.shadow.radius = 3;
  key.target.position.set(0, .8, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#eef3ff', .7);
  fill.position.set(4, 2.8, -2);
  scene.add(fill);

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const object of [ground, ...[...products.values()].map(product => product.group)]) {
      object.traverse(child => {
        if (child.geometry) geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!material) continue;
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
    }
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    environmentTarget?.dispose();
    key.shadow.dispose();
    scene.clear();
    products.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  function render(id, view = 'three-quarter') {
    if (disposed) throw new Error('商品渲染器已释放');
    const product = products.get(id);
    if (!product) throw new Error(`未登记的商品：${id}`);
    const direction = VIEWS[view];
    if (!direction) throw new Error(`未登记的观察角度：${view}`);
    if (current !== product) {
      if (current) scene.remove(current.group);
      scene.add(product.group);
      current = product;
    }

    const center = product.bounds.getCenter(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(8));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const projected = new THREE.Box3();
    for (const x of [product.bounds.min.x, product.bounds.max.x]) {
      for (const y of [product.bounds.min.y, product.bounds.max.y]) {
        for (const z of [product.bounds.min.z, product.bounds.max.z]) {
          projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        }
      }
    }
    const halfHeight = Math.max(
      Math.abs(projected.min.y), Math.abs(projected.max.y),
      Math.abs(projected.min.x) / ASPECT, Math.abs(projected.max.x) / ASPECT,
    ) * 1.23;
    camera.left = -halfHeight * ASPECT;
    camera.right = halfHeight * ASPECT;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  try {
    const loader = new GLTFLoader();
    const loads = await Promise.allSettled(Object.entries(SOURCES).map(async ([id, source]) => {
      const { scene: original } = await loader.loadAsync(localAsset(`models/${source}/${source}.gltf`));
      const group = new THREE.Group();
      group.add(original);
      // Own group transforms leave the source mesh data, material values and
      // original node transforms intact. Keep every node, including plant leaves.
      original.updateMatrixWorld(true);
      const raw = new THREE.Box3().setFromObject(original);
      const size = raw.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(longest) || longest <= 0) throw new Error(`商品网格范围无效：${id}`);
      const scale = 2.5 / longest;
      group.scale.setScalar(scale);
      const center = raw.getCenter(new THREE.Vector3());
      group.position.set(-center.x * scale, -raw.min.y * scale, -center.z * scale);
      group.updateMatrixWorld(true);
      original.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          for (const value of Object.values(material)) {
            if (value?.isTexture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
        }
      });
      products.set(id, { group, bounds: new THREE.Box3().setFromObject(group) });
    }));
    const failed = loads.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;

    const hdr = await new HDRLoader().loadAsync(localAsset('environment/coastal-day.hdr'));
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      environmentTarget = pmrem.fromEquirectangular(hdr);
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = .72;
    } finally {
      hdr.dispose();
      pmrem.dispose();
    }
    for (const id of Object.keys(SOURCES)) images[id] = render(id);
    return { images, render, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
