import * as THREE from 'three';

// The worlds are authored entirely with geometry and shaders. No remote assets are needed.
const WORLD_SETTINGS = {
  harbour: { radius: 44, elevation: 3.6, title: '潮汐港湾', seed: 13, spawn: [1, 12] },
  coast: { radius: 48, elevation: 5.5, title: '夏至海岸', seed: 31, spawn: [-2, 13] },
  observatory: { radius: 43, elevation: 9, title: '星光天文台', seed: 71, spawn: [0, 16] },
};

const LIGHTS = {
  dawn: { sky: '#749caf', horizon: '#f4d1a2', water: '#398e9d', sun: '#ffbf78', ground: '#648887', intensity: 2.5, azimuth: -1.05, altitude: 0.25, exposure: 1.04 },
  day: { sky: '#7caec4', horizon: '#e6ead6', water: '#3199a8', sun: '#fff1c9', ground: '#849483', intensity: 3.0, azimuth: -0.72, altitude: 0.72, exposure: 1.05 },
  dusk: { sky: '#536b91', horizon: '#f2b897', water: '#336d87', sun: '#ffb079', ground: '#626b85', intensity: 1.8, azimuth: 0.75, altitude: 0.16, exposure: 1.10 },
};

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

export function createWorld(canvas, { onStats, onHotspot, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);
  const clock = new THREE.Clock();
  const sceneObjects = new THREE.Group();
  scene.add(sceneObjects);
  const hemisphere = new THREE.HemisphereLight('#eaf4ee', '#8e8b64', 2.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffedbf', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -76;
  sun.shadow.camera.right = 76;
  sun.shadow.camera.top = 76;
  sun.shadow.camera.bottom = -76;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.09;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  let worldId = 'coast';
  let settings = WORLD_SETTINGS[worldId];
  let worldGroup = null;
  let treeGroup = null;
  let treeResources = null;
  let disposed = false;
  let playing = true;
  let renderingActive = true;
  let visible = !document.hidden;
  let cameraMode = 'orbit';
  let lightId = 'day';
  let wireframe = false;
  let shadows = true;
  let roughness = 0.78;
  let population = 180;
  let instancing = true;
  let elapsed = 0;
  let waveUntil = 0;
  let frameId = 0;
  let lastStatsAt = 0;
  let renderElapsed = 0;
  let frameCount = 0;
  let statsSeconds = 0;
  let yaw = 0.65;
  let pitch = 0.69;
  let orbitDistance = 111;
  let drag = null;
  let renderWidth = 0;
  let renderHeight = 0;
  const keys = new Set();
  const mobileKeys = new Set();
  const collisionBoxes = [];
  const experimentalMaterials = new Set();
  const animatedMarkers = [];
  const boats = [];
  const position = new THREE.Vector3();
  const smoothedTarget = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const cameraGoal = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const headingVector = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  let heading = Math.PI;
  let walking = 0;

  const skyUniforms = {
    upper: { value: new THREE.Color(LIGHTS.day.sky) },
    horizon: { value: new THREE.Color(LIGHTS.day.horizon) },
    sunColor: { value: new THREE.Color(LIGHTS.day.sun) },
    sunDirection: { value: new THREE.Vector3(-0.5, 0.7, -0.5).normalize() },
    time: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 upper; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDirection; uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main() {
        vec3 d=normalize(vDirection); float height=clamp(d.y,0.0,1.0);
        vec3 color=mix(horizon,upper,pow(height,0.55));
        float s=max(dot(d,sunDirection),0.0);
        color += sunColor * pow(s,28.0) * 0.22;
        color = mix(color,sunColor*1.45,smoothstep(0.9992,0.9997,s));
        vec2 uv=d.xz/max(d.y+0.18,0.05)*2.4+vec2(time*0.003,0.0);
        float cloud=noise(uv)*0.58+noise(uv*2.1)*0.26+noise(uv*4.0)*0.16;
        float mask=smoothstep(0.65,0.82,cloud)*smoothstep(0.05,0.2,d.y)*(1.0-smoothstep(0.55,0.85,d.y));
        color=mix(color,mix(horizon,vec3(1.0),0.5),mask*0.45);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);

  const waterUniforms = {
    time: { value: 0 },
    waterColor: { value: new THREE.Color(LIGHTS.day.water) },
    horizonColor: { value: new THREE.Color(LIGHTS.day.horizon) },
    sunColor: { value: new THREE.Color(LIGHTS.day.sun) },
    sunDirection: { value: new THREE.Vector3(-0.5, 0.7, -0.5).normalize() },
    radius: { value: settings.radius },
  };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `uniform float time; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec3 p=position;
        p.z+=sin(p.x*0.10+time*0.8)*0.14+cos(p.y*0.14-time*0.65)*0.10;
        vec4 world=modelMatrix*vec4(p,1.0); vWorld=world.xyz;
        vNormal=normalize(vec3(-cos(p.x*0.10+time*0.8)*0.014,1.0,sin(p.y*0.14-time*0.65)*0.014));
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `uniform float time; uniform vec3 waterColor; uniform vec3 horizonColor; uniform vec3 sunColor;
      uniform vec3 sunDirection; uniform float radius; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.0-max(dot(view,vNormal),0.0),3.0);
        vec3 color=mix(waterColor*0.78,horizonColor*0.8,fresnel*0.55);
        float broad=sin(vWorld.x*0.24+vWorld.z*0.13+time*0.55)*sin(vWorld.z*0.20-time*0.4);
        color+=waterColor*broad*0.11;
        float glint=pow(max(dot(reflect(-sunDirection,vNormal),view),0.0),85.0);
        float streak=pow(abs(sin(vWorld.z*2.4+sin(vWorld.x*0.3+time)*2.0+time)),22.0);
        color+=sunColor*glint*(0.2+streak*0.65);
        float ring=length(vWorld.xz/vec2(1.0,0.88));
        float shore=exp(-pow((ring-radius*1.01)/3.0,2.0));
        color=mix(color,waterColor*1.45,shore*0.25);
        float ripple=pow(max(sin(ring*2.5-time*1.6),0.0),28.0)*shore;
        color+=vec3(0.75,0.9,0.86)*ripple*0.12;
        float fog=1.0-exp(-pow(length(cameraPosition-vWorld)/340.0,2.0));
        color=mix(color,horizonColor,fog);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100, 140, 140), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.06;
  scene.add(water);

  function material(color, extra = {}) {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, ...extra });
    result.wireframe = wireframe;
    experimentalMaterials.add(result);
    return result;
  }

  function mesh(geometry, mat, parent = worldGroup, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }

  function box(width, height, depth, mat, parent, x = 0, y = 0, z = 0) {
    return mesh(new THREE.BoxGeometry(width, height, depth), mat, parent, x, y, z);
  }

  function boundary(angle) {
    return settings.radius * (1 + Math.sin(angle * 3 + settings.seed) * 0.075 + Math.cos(angle * 5 - settings.seed) * 0.035);
  }

  function terrainHeight(x, z) {
    const normZ = z / 0.88;
    const radius = Math.hypot(x, normZ);
    const distance = radius / boundary(Math.atan2(normZ, x));
    if (distance > 1) return -0.25;
    const base = Math.pow(Math.max(0, 1 - distance), 0.68) * settings.elevation;
    const hills = Math.sin(x * 0.11 + settings.seed) * Math.cos(z * 0.095) * 0.7 * Math.sin(Math.min(distance, 1) * Math.PI);
    const summit = worldId === 'observatory' ? Math.exp(-((x + 1) ** 2 + (z + 9) ** 2) / 180) * 6 : 0;
    return 0.26 + base + hills + summit;
  }

  function buildTerrain() {
    const sectors = 144;
    const rings = 30;
    const vertices = [];
    const colors = [];
    const indices = [];
    const sand = new THREE.Color('#daca9a');
    const grass = new THREE.Color(worldId === 'observatory' ? '#9da47e' : '#a4b08a');
    const lightGrass = new THREE.Color('#bec29a');
    const stone = new THREE.Color('#b1b9a6');
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      for (let segment = 0; segment <= sectors; segment++) {
        const angle = (segment / sectors) * TAU;
        const radial = boundary(angle) * t;
        const x = Math.cos(angle) * radial;
        const z = Math.sin(angle) * radial * 0.88;
        const y = terrainHeight(x * 0.999, z * 0.999);
        vertices.push(x, y, z);
        const color = grass.clone().lerp(lightGrass, (Math.sin(x * 0.15) * Math.cos(z * 0.19) + 1) * 0.25);
        if (t > 0.86) color.lerp(sand, clamp((t - 0.86) / 0.1, 0, 1));
        if (worldId === 'observatory' && y > 11) color.lerp(stone, (y - 11) / 6);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let segment = 0; segment < sectors; segment++) {
        const a = ring * (sectors + 1) + segment;
        const b = a + sectors + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, material('#ffffff', { vertexColors: true }));
    // A submerged skirt gives the island a solid, sculpted edge at low viewpoints.
    const edgePositions = [];
    const edgeIndices = [];
    for (let s = 0; s <= sectors; s++) {
      const a = (s / sectors) * TAU;
      const r = boundary(a);
      edgePositions.push(Math.cos(a) * r, 0.28, Math.sin(a) * r * 0.88, Math.cos(a) * r * 0.98, -3.8, Math.sin(a) * r * 0.88 * 0.98);
      if (s < sectors) edgeIndices.push(s * 2, s * 2 + 1, s * 2 + 2, s * 2 + 1, s * 2 + 3, s * 2 + 2);
    }
    const skirt = new THREE.BufferGeometry();
    skirt.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    skirt.setIndex(edgeIndices);
    skirt.computeVertexNormals();
    mesh(skirt, material('#b6ac8b', { side: THREE.DoubleSide }));
  }

  function addPath(points, width = 3.3) {
    const pathMaterial = material('#dbc9a2');
    const vertices = [];
    const indices = [];
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const samples = 110;
    for (let i = 0; i <= samples; i++) {
      const p = curve.getPoint(i / samples);
      const tangent = curve.getTangent(i / samples);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
      for (const multiplier of [-1, 1]) {
        const x = p.x + side.x * multiplier;
        const z = p.z + side.z * multiplier;
        vertices.push(x, terrainHeight(x, z) + 0.055, z);
      }
      if (i < samples) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, pathMaterial);
  }

  function roofGeometry(width, depth, height) {
    const w = width / 2;
    const d = depth / 2;
    const geometry = new THREE.BufferGeometry();
    const vertices = [-w, 0, -d, w, 0, -d, 0, height, -d, -w, 0, d, w, 0, d, 0, height, d];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function addHotspot(group, title, description, principle) {
    group.userData.hotspot = { title, description, principle };
  }

  function addHouse(x, z, width = 5, depth = 4.6, rotation = 0, style = 0) {
    const group = new THREE.Group();
    group.position.set(x, terrainHeight(x, z), z);
    group.rotation.y = rotation;
    worldGroup.add(group);
    const walls = material(style % 3 === 0 ? '#efe7d0' : style % 3 === 1 ? '#dbe2d2' : '#e7caae');
    const roof = material(style % 2 === 0 ? '#bf704f' : '#ae6550');
    const trim = material('#f8efdc');
    const windowMat = material('#315c63', { roughness: 0.23, metalness: 0.12 });
    const wood = material('#966f4b');
    const wallHeight = 4.3 + (style % 2) * 0.6;
    box(width + 0.5, 0.4, depth + 0.5, material('#b4ac8d'), group, 0, 0.2, 0);
    box(width, wallHeight, depth, walls, group, 0, wallHeight / 2 + 0.4, 0);
    const roofMesh = mesh(roofGeometry(width + 0.9, depth + 0.85, 2.1), roof, group, 0, wallHeight + 0.4, 0);
    roofMesh.castShadow = true;
    box(width + 1.05, 0.16, depth + 1, trim, group, 0, wallHeight + 0.38, 0);
    box(1.15, 2.25, 0.13, wood, group, 0, 1.5, depth / 2 + 0.07);
    box(1.45, 0.16, 0.48, trim, group, 0, 2.7, depth / 2 + 0.18);
    for (const side of [-1, 1]) {
      box(1.1, 1.35, 0.12, trim, group, side * width * 0.3, 2.8, depth / 2 + 0.09);
      box(0.82, 1.09, 0.14, windowMat, group, side * width * 0.3, 2.8, depth / 2 + 0.16);
      box(0.08, 1.2, 0.2, trim, group, side * width * 0.3, 2.8, depth / 2 + 0.18);
      box(0.96, 0.08, 0.2, trim, group, side * width * 0.3, 2.8, depth / 2 + 0.18);
      box(0.13, 1.4, 1.05, trim, group, side * (width / 2 + 0.07), 2.8, 0);
      box(0.15, 1.1, 0.81, windowMat, group, side * (width / 2 + 0.12), 2.8, 0);
    }
    box(0.7, 1.8, 0.75, walls, group, width * 0.27, wallHeight + 1.3, -depth * 0.2);
    box(0.9, 0.2, 0.95, roof, group, width * 0.27, wallHeight + 2.2, -depth * 0.2);
    if (style % 2 === 0) {
      const awning = box(width * 0.63, 0.17, 1.3, material('#b7bd92'), group, 0, 3.5, depth / 2 + 0.6);
      awning.rotation.x = 0.15;
      for (const side of [-1, 1]) box(0.13, 3.25, 0.13, wood, group, side * width * 0.29, 1.75, depth / 2 + 1.1);
    }
    collisionBoxes.push({ x, z, radius: Math.max(width, depth) * 0.66, type: 'house' });
    addHotspot(group, '程序化海岸小屋', '奶油色墙面、陶土屋顶和窗框都由基础几何体组合生成。走近观察，可以看到实时灯光与投影。', 'BoxGeometry 负责墙体和细节，自定义 BufferGeometry 生成屋顶。MeshStandardMaterial 根据光照、粗糙度和金属度计算表面颜色。');
    return group;
  }

  function addBench(x, z, rotation = 0) {
    const bench = new THREE.Group();
    bench.position.set(x, terrainHeight(x, z), z);
    bench.rotation.y = rotation;
    worldGroup.add(bench);
    const wood = material('#a08354');
    const leg = material('#405c56');
    for (let i = 0; i < 3; i++) box(2.5, 0.1, 0.18, wood, bench, 0, 0.65, i * 0.22);
    box(2.5, 0.35, 0.13, wood, bench, 0, 1.18, -0.05);
    for (const side of [-1, 1]) {
      box(0.12, 0.65, 0.55, leg, bench, side * 0.9, 0.3, 0.2);
      box(0.12, 1.2, 0.12, leg, bench, side * 0.9, 0.6, -0.06);
    }
  }

  function addLamp(x, z) {
    const y = terrainHeight(x, z);
    const mat = material('#435e57');
    mesh(new THREE.CylinderGeometry(0.075, 0.11, 3.5, 6), mat, worldGroup, x, y + 1.75, z);
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 4), material('#ffdfa1', { emissive: '#ffb753', emissiveIntensity: 0.35 }), worldGroup, x, y + 3.65, z);
    mesh(new THREE.ConeGeometry(0.53, 0.4, 4), mat, worldGroup, x, y + 4.15, z);
  }

  function addPortal(x, z, rotation = 0) {
    const group = new THREE.Group();
    group.position.set(x, terrainHeight(x, z), z);
    group.rotation.y = rotation;
    worldGroup.add(group);
    const stone = material('#ded4b6');
    const metal = material('#b49453', { metalness: 0.5, roughness: 0.35 });
    box(5.6, 0.3, 3, stone, group, 0, 0.15, 0);
    for (const side of [-1, 1]) {
      box(0.55, 4.7, 0.7, stone, group, side * 2.1, 2.5, 0);
      box(0.83, 0.25, 0.9, metal, group, side * 2.1, 4.82, 0);
    }
    const arch = mesh(new THREE.TorusGeometry(2.1, 0.28, 6, 30, Math.PI), stone, group, 0, 4.65, 0);
    arch.rotation.z = 0;
    const glow = material('#cbeadd', { emissive: '#89d5cf', emissiveIntensity: 0.65, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const portal = mesh(new THREE.PlaneGeometry(3.55, 4.85), glow, group, 0, 2.95, 0);
    portal.castShadow = false;
    const ring = mesh(new THREE.TorusGeometry(1.05, 0.06, 5, 48), material('#ffce73', { emissive: '#ffc777', emissiveIntensity: 0.45 }), group, 0, 3.45, 0.12);
    animatedMarkers.push({ object: ring, baseY: 3.45, rotate: true });
    addHotspot(group, '世界传送门', '门框和发光薄片构成了一个可探索的空间地标。使用左侧世界切换，可以立即重新生成另一套场景。', '同一 WebGLRenderer 可以管理多个场景配置。切换时替换场景对象，释放旧几何体与材质，并保留当前实验参数。');
  }

  function addDock(x, z, length = 18, rotation = 0) {
    const dock = new THREE.Group();
    dock.position.set(x, 1.35, z);
    dock.rotation.y = rotation;
    worldGroup.add(dock);
    const wood = material('#b3976c');
    const darkWood = material('#826e4b');
    for (let i = 0; i < length; i++) box(4.7, 0.24, 0.84, wood, dock, 0, 0, i - 0.5);
    for (let i = 0; i < length; i += 4) {
      for (const side of [-1, 1]) {
        box(0.24, 2.7, 0.24, darkWood, dock, side * 2.1, -0.6, i);
        box(0.26, 0.22, 4.1, darkWood, dock, side * 2.1, 0.55, i + 1.6);
      }
    }
    box(4.9, 0.23, 0.25, darkWood, dock, 0, 0.15, length - 1.2);
    addHotspot(dock, '木质码头与海面', '水面没有加载视频或图片，它每一帧都在显卡上实时计算。光线角度改变时，海面的颜色与高光也会改变。', '顶点着色器用正弦波轻微移动水面，片元着色器结合 Fresnel 视角反射、程序化波纹、高光与距离雾。');
    return dock;
  }

  function addBoat(x, z, rotation = 0, sail = true) {
    const boat = new THREE.Group();
    boat.position.set(x, 0.15, z);
    boat.rotation.y = rotation;
    worldGroup.add(boat);
    const hull = mesh(new THREE.SphereGeometry(1, 8, 5), material('#e6dfc4'), boat, 0, 0.2, 0);
    hull.scale.set(1.6, 0.55, 3.6);
    box(2.1, 0.14, 5.8, material('#a4885e'), boat, 0, 0.52, 0);
    if (sail) {
      mesh(new THREE.CylinderGeometry(0.07, 0.1, 7.1, 5), material('#8b714f'), boat, 0, 3.9, 0);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0.1, 1.8, 0, 0.1, 7.1, 0, 0.1, 1.8, 2.65], 3));
      g.computeVertexNormals();
      mesh(g, material('#f5eaca', { side: THREE.DoubleSide }), boat);
      const back = new THREE.BufferGeometry();
      back.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 2.3, -0.1, -0.1, 6.6, -0.1, -0.1, 2.3, -1.9], 3));
      back.computeVertexNormals();
      mesh(back, material('#dcb888', { side: THREE.DoubleSide }), boat);
    }
    boats.push({ object: boat, baseY: boat.position.y, phase: x + z });
  }

  function addRock(x, z, scale = 1, yOverride) {
    const rock = mesh(new THREE.IcosahedronGeometry(1, 0), material('#a6ae9b'), worldGroup, x, yOverride ?? terrainHeight(x, z), z);
    rock.scale.set(scale * 1.4, scale * 0.7, scale);
    rock.rotation.set(x, z, x + z);
    return rock;
  }

  function addLighthouse(x, z) {
    const group = new THREE.Group();
    const y = terrainHeight(x, z);
    group.position.set(x, y, z);
    worldGroup.add(group);
    const white = material('#eee7cb');
    const red = material('#b87556');
    mesh(new THREE.CylinderGeometry(2.1, 2.75, 10.5, 12), white, group, 0, 5.2, 0);
    mesh(new THREE.CylinderGeometry(2.22, 2.34, 1.15, 12), red, group, 0, 7.45, 0);
    mesh(new THREE.CylinderGeometry(2.65, 2.65, 0.4, 12), white, group, 0, 10.5, 0);
    mesh(new THREE.CylinderGeometry(1.55, 1.55, 2, 10), material('#9ebfb4', { metalness: 0.2, roughness: 0.12 }), group, 0, 11.5, 0);
    mesh(new THREE.ConeGeometry(2.3, 1.4, 12), red, group, 0, 13.15, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      box(0.13, 2.1, 0.13, material('#4e6762'), group, Math.cos(a) * 1.57, 11.5, Math.sin(a) * 1.57);
    }
    box(1.25, 2.45, 0.16, material('#49625b'), group, 0, 1.55, 2.65);
    collisionBoxes.push({ x, z, radius: 3.1 });
    addHotspot(group, '海岸灯塔', '从远处的轮廓到近处的栏杆，灯塔都由低多边形体块组成。太阳会将实时阴影投向周围地形。', 'DirectionalLight 使用 Shadow Map 从光源角度渲染深度图，再在正常视角判断表面是否被遮挡。关闭阴影可以直接观察性能变化。');
  }

  function addObservatory() {
    const x = 0;
    const z = -11;
    const y = terrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    worldGroup.add(group);
    const stone = material('#e6ddc5');
    const copper = material('#809a88', { metalness: 0.55, roughness: 0.4 });
    mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.9, 24), material('#bbb496'), group, 0, 0.45, 0);
    mesh(new THREE.CylinderGeometry(5.6, 5.9, 6.5, 20), stone, group, 0, 3.7, 0);
    const dome = mesh(new THREE.SphereGeometry(5.8, 24, 12, 0, TAU, 0, Math.PI / 2), copper, group, 0, 6.95, 0);
    dome.rotation.y = -0.6;
    mesh(new THREE.CylinderGeometry(5.88, 5.88, 0.32, 24), material('#657f71', { metalness: 0.4 }), group, 0, 6.9, 0);
    const telescope = new THREE.Group();
    telescope.position.set(1.6, 10.2, 1.2);
    telescope.rotation.z = -0.6;
    telescope.rotation.x = 0.3;
    group.add(telescope);
    mesh(new THREE.CylinderGeometry(0.65, 0.55, 5.2, 10), material('#eee7d5'), telescope, 0, 1.6, 0);
    mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.32, 10), material('#536e69'), telescope, 0, 4.1, 0);
    mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 10), material('#203e50', { metalness: 0.6, roughness: 0.12 }), telescope, 0, 4.3, 0);
    box(1.65, 3.1, 0.15, material('#4b6866'), group, 0, 2.15, 5.95);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const window = box(1.1, 1.6, 0.15, material('#4e7074'), group, Math.sin(a) * 5.75, 4.5, Math.cos(a) * 5.75);
      window.rotation.y = a;
    }
    collisionBoxes.push({ x, z, radius: 6.3 });
    addHotspot(group, '山顶天文台', '圆柱主楼、半球穹顶与倾斜望远镜组成了第三个世界的视觉中心。低多边形材质让简单体块呈现清晰的形面。', 'Scene 是对象树：子对象继承父对象的位置、旋转与缩放。组合基本几何体，可快速生成建筑、机械或展品。');
  }

  function addFlowerPatch(x, z, count = 12) {
    const random = rng(Math.round(x * x + z * z) + settings.seed);
    const greens = material('#729373');
    const petals = material('#e8c576');
    for (let i = 0; i < count; i++) {
      const px = x + (random() - 0.5) * 3.5;
      const pz = z + (random() - 0.5) * 3.5;
      const y = terrainHeight(px, pz);
      mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.55, 3), greens, worldGroup, px, y + 0.25, pz);
      mesh(new THREE.IcosahedronGeometry(0.16, 0), petals, worldGroup, px, y + 0.56, pz);
    }
  }

  function buildWorld() {
    if (worldGroup) {
      sceneObjects.remove(worldGroup);
      disposeGroup(worldGroup);
    }
    if (treeResources) {
      for (const geometry of treeResources.geometries) geometry.dispose();
      for (const mat of treeResources.materials) mat.dispose();
    }
    treeResources = null;
    treeGroup = null;
    experimentalMaterials.clear();
    collisionBoxes.length = 0;
    animatedMarkers.length = 0;
    boats.length = 0;
    settings = WORLD_SETTINGS[worldId];
    waterUniforms.radius.value = settings.radius;
    worldGroup = new THREE.Group();
    sceneObjects.add(worldGroup);
    buildTerrain();
    if (worldId === 'harbour') {
      addPath([[-3, 34], [0, 16], [-2, 3], [0, -15], [-12, -29]], 4.1);
      addPath([[0, 2], [12, 4], [26, 12], [33, 20]], 3.5);
      addHouse(-8, 14, 6.5, 5.1, 0.22, 0);
      addHouse(7, 5, 5.7, 4.5, -0.16, 1);
      addHouse(-9, -1, 6, 4.9, 0.1, 2);
      addHouse(7, -10, 4.8, 4.5, -0.3, 0);
      addHouse(-12, -15, 5.1, 4.5, 0.5, 1);
      addHouse(18, 15, 4.8, 4.5, -0.6, 2);
      addDock(30, 20, 21, -0.6);
      addBoat(37, 32, 0.1);
      addBoat(25, 37, -0.2, false);
      addLighthouse(-23, -23);
      addPortal(14, -19, -0.5);
      addBench(5, 15, 1.4);
      addBench(-6, -9, -1.6);
      for (const [x, z] of [[-3, 21], [3, -3], [-5, -17], [24, 15]]) addLamp(x, z);
      addFlowerPatch(-11, 20);
      addFlowerPatch(10, -5);
    } else if (worldId === 'coast') {
      addPath([[-2, 36], [-1, 14], [3, 0], [-3, -14], [-16, -29]], 3.6);
      addPath([[3, 1], [14, 5], [25, 8], [34, 12]], 3.0);
      addHouse(-9, 10, 6.1, 5.2, 0.12, 0);
      addHouse(10, -5, 5.5, 5.0, -0.32, 1);
      addHouse(-10, -10, 4.9, 4.3, 0.33, 2);
      addHouse(18, 10, 4.8, 4.1, -0.35, 0);
      addLighthouse(-23, -24);
      addPortal(10, -20, -0.3);
      addDock(34, 12, 15, -1.02);
      addBoat(45, 25, -0.52);
      addBench(4, 13, -0.7);
      addBench(25, 5, -1.4);
      for (const [x, z] of [[4, 19], [-1, -5], [18, 3]]) addLamp(x, z);
      addFlowerPatch(-9, 18, 16);
      addFlowerPatch(7, -10, 14);
      // Stepping stones make the quiet beach recognizable from above.
      for (let i = 0; i < 11; i++) addRock(-14 + i * 2.3, 30 + Math.sin(i * 0.6) * 1.4, 0.35);
    } else {
      addPath([[0, 31], [0, 18], [9, 4], [11, -8], [0, -1]], 3.8);
      addPath([[8, 5], [22, 5], [29, 16]], 2.9);
      addObservatory();
      addHouse(-12, 10, 5.7, 4.6, 0.23, 1);
      addHouse(17, 13, 5.3, 4.7, -0.3, 0);
      addPortal(-18, -11, 0.5);
      addDock(29, 20, 13, -0.55);
      addBoat(39, 30, -0.2);
      addBench(-3, 12, 0.6);
      addBench(13, -3, -1.7);
      for (const [x, z] of [[-3, 22], [7, 11], [12, -4]]) addLamp(x, z);
      addFlowerPatch(-7, 18);
      // A small armillary sphere shows metalness and hierarchical transforms.
      const instrument = new THREE.Group();
      instrument.position.set(14, terrainHeight(14, -11), -11);
      worldGroup.add(instrument);
      const brass = material('#c6a864', { metalness: 0.7, roughness: 0.3 });
      mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.6, 8), material('#d8d0b8'), instrument, 0, 0.8, 0);
      for (let i = 0; i < 3; i++) {
        const ring = mesh(new THREE.TorusGeometry(1.8, 0.055, 5, 52), brass, instrument, 0, 3.3, 0);
        ring.rotation.set(i * 0.8, i * 0.6, 0.5);
      }
      mesh(new THREE.SphereGeometry(0.33, 10, 8), brass, instrument, 0, 3.3, 0);
      addHotspot(instrument, '黄铜浑天仪', '通过粗糙度实验，可以观察金属表面的反射高光如何由集中变得柔和。', '基于物理的材质使用 roughness 和 metalness 控制高光分布。这里的物体是真实 3D 几何体，旋转视角后轮廓仍然成立。');
    }
    const random = rng(settings.seed * 23);
    for (let i = 0; i < 52; i++) {
      const a = random() * TAU;
      const r = boundary(a) * (0.87 + random() * 0.16);
      addRock(Math.cos(a) * r, Math.sin(a) * r * 0.88, 0.4 + random() * 1.6, random() * 0.3 - 0.04);
    }
    // Distant silhouettes give first-person views a horizon rather than an empty plane.
    const distant = material('#8eaaa1');
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * TAU + 0.18;
      const island = mesh(new THREE.IcosahedronGeometry(1, 1), distant, worldGroup, Math.cos(angle) * (170 + i * 4), -6.5, Math.sin(angle) * (170 + i * 4));
      island.scale.set(23 + (i % 3) * 9, 10 + (i % 4) * 2, 17 + (i % 2) * 8);
      island.castShadow = false;
    }
    buildTrees();
    resetPosition();
    applyMaterials();
  }

  function treePoints() {
    const points = [];
    const random = rng(settings.seed * 47);
    let attempts = 0;
    while (points.length < population && attempts++ < 12000) {
      const a = random() * TAU;
      const r = settings.radius * (0.28 + Math.sqrt(random()) * 0.58);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.88;
      // Paths, courtyard and shoreline remain open for navigation.
      if (Math.abs(x) < 5.8 || (x > 0 && z > 0 && Math.abs(z - x * 0.25) < 4.2)) continue;
      if (collisionBoxes.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + 2.7)) continue;
      if (worldId === 'observatory' && Math.hypot(x, z + 11) < 11) continue;
      if (worldId === 'harbour' && x > 18 && z > 8) continue;
      points.push({ x, z, y: terrainHeight(x, z), scale: 0.67 + random() * 0.7, angle: random() * TAU, color: random() });
    }
    return points;
  }

  function buildTrees() {
    if (treeGroup) {
      worldGroup.remove(treeGroup);
      disposeGroup(treeGroup);
      if (treeResources) {
        // Explicit disposal also covers the zero-tree case, where no meshes own resources.
        for (const geometry of treeResources.geometries) geometry.dispose();
        for (const mat of treeResources.materials) { mat.dispose(); experimentalMaterials.delete(mat); }
      }
    }
    treeGroup = new THREE.Group();
    worldGroup.add(treeGroup);
    const points = treePoints();
    const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.3, 2.5, 5);
    trunkGeometry.translate(0, 1.25, 0);
    const lowerGeometry = new THREE.ConeGeometry(1.45, 3.8, 6);
    lowerGeometry.translate(0, 3.5, 0);
    const upperGeometry = new THREE.ConeGeometry(1.05, 3.6, 6);
    upperGeometry.translate(0, 5.0, 0);
    const trunkMaterial = material('#807051');
    const lowerMaterial = material('#537d68');
    const upperMaterial = material('#658b70');
    treeResources = { geometries: [trunkGeometry, lowerGeometry, upperGeometry], materials: [trunkMaterial, lowerMaterial, upperMaterial] };
    if (instancing && points.length) {
      for (let layer = 0; layer < 3; layer++) {
        const instances = new THREE.InstancedMesh(treeResources.geometries[layer], treeResources.materials[layer], points.length);
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          instancePosition.set(p.x, p.y, p.z);
          quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.angle);
          scaleVector.setScalar(p.scale);
          matrix.compose(instancePosition, quaternion, scaleVector);
          instances.setMatrixAt(i, matrix);
          if (layer > 0) instances.setColorAt(i, new THREE.Color().setRGB(0.88 + p.color * 0.16, 0.9 + p.color * 0.1, 0.85 + p.color * 0.13));
        }
        instances.instanceMatrix.needsUpdate = true;
        if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
        instances.castShadow = true;
        instances.receiveShadow = true;
        treeGroup.add(instances);
      }
    } else {
      for (const p of points) {
        const tree = new THREE.Group();
        tree.position.set(p.x, p.y, p.z);
        tree.rotation.y = p.angle;
        tree.scale.setScalar(p.scale);
        treeGroup.add(tree);
        for (let layer = 0; layer < 3; layer++) mesh(treeResources.geometries[layer], treeResources.materials[layer], tree);
      }
    }
    treeGroup.userData.treeCount = points.length;
    addHotspot(treeGroup, '松林与批量绘制', `这片松林目前有 ${points.length} 棵树。调高树木数量，切换「实例化」实验，观察 Draw calls 的变化。`, 'InstancedMesh 让多个物体共享几何体和材质，只发送不同的变换矩阵。同一层树冠可用一次绘制提交，普通 Mesh 则分别提交每个对象。');
  }

  const avatar = new THREE.Group();
  scene.add(avatar);
  const avatarMaterial = new THREE.MeshStandardMaterial({ color: '#d99d4e', roughness: 0.8, flatShading: true });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: '#eac8a2', roughness: 0.8, flatShading: true });
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: '#446770', roughness: 0.9, flatShading: true });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: '#554e42', roughness: 0.9, flatShading: true });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: '#5d5845', roughness: 0.9, flatShading: true });
  const body = mesh(new THREE.CapsuleGeometry(0.38, 0.65, 3, 8), avatarMaterial, avatar, 0, 1.53, 0);
  const head = mesh(new THREE.SphereGeometry(0.32, 10, 7), skinMaterial, avatar, 0, 2.25, 0);
  head.scale.set(0.95, 1.12, 1);
  mesh(new THREE.SphereGeometry(0.327, 10, 6, 0, TAU, 0, Math.PI / 2), hairMaterial, avatar, 0, 2.33, 0);
  const backpack = box(0.5, 0.66, 0.24, new THREE.MeshStandardMaterial({ color: '#ebe0b9', roughness: 0.9 }), avatar, 0, 1.55, -0.37);
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftArm.position.set(-0.45, 1.8, 0);
  rightArm.position.set(0.45, 1.8, 0);
  leftLeg.position.set(-0.18, 1.05, 0);
  rightLeg.position.set(0.18, 1.05, 0);
  avatar.add(leftArm, rightArm, leftLeg, rightLeg);
  for (const arm of [leftArm, rightArm]) {
    mesh(new THREE.CapsuleGeometry(0.13, 0.49, 2, 5), avatarMaterial, arm, 0, -0.3, 0);
    mesh(new THREE.SphereGeometry(0.14, 6, 5), skinMaterial, arm, 0, -0.7, 0);
  }
  for (const leg of [leftLeg, rightLeg]) {
    box(0.26, 0.85, 0.27, trouserMaterial, leg, 0, -0.38, 0);
    box(0.29, 0.18, 0.48, shoeMaterial, leg, 0, -0.83, 0.08);
  }
  avatar.scale.setScalar(1.2);
  addHotspot(avatar, '原创漫游角色', '按 WASD 行走、Shift 奔跑；点击挥手让角色抬手。角色由几何体组合，不依赖外部人物资源。', '每帧根据移动速度更新位置，并用周期函数驱动四肢摆动。父子对象层级相当于一个简单骨架，可独立控制肩部、腿部与身体。');

  function resetPosition() {
    const [x, z] = settings.spawn;
    position.set(x, terrainHeight(x, z), z);
    avatar.position.copy(position);
    heading = Math.PI;
    avatar.rotation.y = heading;
    smoothedTarget.set(x, position.y + 1.9, z);
    walking = 0;
    keys.clear();
    mobileKeys.clear();
  }

  function applyMaterials() {
    for (const mat of experimentalMaterials) {
      mat.wireframe = wireframe;
      mat.roughness = roughness;
      mat.needsUpdate = true;
    }
    waterMaterial.wireframe = wireframe;
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    renderer.shadowMap.needsUpdate = true;
  }

  function applyLight() {
    const light = LIGHTS[lightId];
    skyUniforms.upper.value.set(light.sky);
    skyUniforms.horizon.value.set(light.horizon);
    skyUniforms.sunColor.value.set(light.sun);
    const direction = new THREE.Vector3(Math.sin(light.azimuth) * Math.cos(light.altitude), Math.sin(light.altitude), -Math.cos(light.azimuth) * Math.cos(light.altitude)).normalize();
    skyUniforms.sunDirection.value.copy(direction);
    waterUniforms.sunDirection.value.copy(direction);
    waterUniforms.waterColor.value.set(light.water);
    waterUniforms.horizonColor.value.set(light.horizon);
    waterUniforms.sunColor.value.set(light.sun);
    hemisphere.color.set(light.horizon);
    hemisphere.groundColor.set(light.ground);
    hemisphere.intensity = lightId === 'dusk' ? 1.7 : 2.0;
    sun.color.set(light.sun);
    sun.intensity = light.intensity;
    sun.position.copy(direction).multiplyScalar(115);
    renderer.toneMappingExposure = light.exposure;
    scene.fog = new THREE.FogExp2(light.horizon, 0.0035);
  }

  function disposeGroup(group) {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      }
      if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (width === renderWidth && height === renderHeight) return;
    renderWidth = width;
    renderHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function active(direction) { return keys.has(direction) || mobileKeys.has(direction); }

  function updatePlayer(delta) {
    let forward = (active('forward') ? 1 : 0) - (active('backward') ? 1 : 0);
    let sideways = (active('right') ? 1 : 0) - (active('left') ? 1 : 0);
    const magnitude = Math.hypot(forward, sideways);
    const running = active('run');
    walking = THREE.MathUtils.damp(walking, magnitude > 0 ? (running ? 2 : 1) : 0, 10, delta);
    if (magnitude > 0) {
      forward /= magnitude;
      sideways /= magnitude;
      const speed = running ? 8.8 : 4.1;
      const vx = (-Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * speed * delta;
      const vz = (-Math.cos(yaw) * forward - Math.sin(yaw) * sideways) * speed * delta;
      let x = position.x + vx;
      let z = position.z + vz;
      const r = Math.hypot(x, z / 0.88);
      const edge = boundary(Math.atan2(z / 0.88, x)) * 0.92;
      if (r > edge) {
        x *= edge / r;
        z *= edge / r;
      }
      for (const obstacle of collisionBoxes) {
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        const distance = Math.hypot(dx, dz);
        const minimum = obstacle.radius + 0.45;
        if (distance < minimum && distance > 0.01) {
          x = obstacle.x + (dx / distance) * minimum;
          z = obstacle.z + (dz / distance) * minimum;
        }
      }
      position.x = x;
      position.z = z;
      heading = Math.atan2(vx, vz);
      avatar.rotation.y = heading;
    }
    position.y = terrainHeight(position.x, position.z);
    avatar.position.copy(position);
    const stride = elapsed * (walking > 1.3 ? 12 : 7.8);
    const amplitude = Math.min(walking, 1.5) * 0.58;
    leftLeg.rotation.x = Math.sin(stride) * amplitude;
    rightLeg.rotation.x = -Math.sin(stride) * amplitude;
    leftArm.rotation.x = -Math.sin(stride) * amplitude * 0.85;
    rightArm.rotation.x = Math.sin(stride) * amplitude * 0.85;
    leftArm.rotation.z = -0.06;
    rightArm.rotation.z = 0.06;
    if (elapsed < waveUntil) {
      rightArm.rotation.x = -0.1;
      rightArm.rotation.z = 2.65 + Math.sin(elapsed * 11) * 0.27;
    }
    body.position.y = 1.53 + Math.abs(Math.sin(stride)) * walking * 0.045 + Math.sin(elapsed * 2) * 0.018;
    head.position.y = 2.25 + Math.abs(Math.sin(stride)) * walking * 0.025;
    backpack.position.y = 1.55 + Math.abs(Math.sin(stride)) * walking * 0.045;
  }

  function updateCamera(delta) {
    avatar.visible = cameraMode !== 'first';
    if (cameraMode === 'orbit') {
      targetPosition.set(0, worldId === 'observatory' ? 4 : 2.3, 0);
      smoothedTarget.lerp(targetPosition, 1 - Math.exp(-delta * 5));
      // Keep the whole island in view on tall mobile canvases as well as desktop.
      const fittedDistance = orbitDistance * Math.max(1, 1.32 / camera.aspect);
      cameraGoal.set(Math.sin(yaw) * Math.cos(pitch) * fittedDistance, Math.sin(pitch) * fittedDistance, Math.cos(yaw) * Math.cos(pitch) * fittedDistance).add(smoothedTarget);
      camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 10));
      camera.lookAt(smoothedTarget);
    } else if (cameraMode === 'third') {
      targetPosition.copy(position).y += 2.2;
      smoothedTarget.lerp(targetPosition, 1 - Math.exp(-delta * 9));
      cameraGoal.set(Math.sin(yaw) * Math.cos(pitch) * 10.5, Math.sin(pitch) * 10.5, Math.cos(yaw) * Math.cos(pitch) * 10.5).add(smoothedTarget);
      cameraGoal.y = Math.max(cameraGoal.y, terrainHeight(cameraGoal.x, cameraGoal.z) + 1.2);
      camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 11));
      camera.lookAt(smoothedTarget);
    } else {
      cameraGoal.copy(position).y += 2.75;
      camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 20));
      headingVector.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(targetPosition.copy(camera.position).add(headingVector));
    }
  }

  function hitAt(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Raycaster does not skip invisible objects, so first-person view must omit the avatar.
    const pickable = avatar.visible ? [worldGroup, avatar] : [worldGroup];
    const hits = raycaster.intersectObjects(pickable, true);
    for (const hit of hits) {
      let object = hit.object;
      while (object) {
        if (object.userData.hotspot) return object.userData.hotspot;
        object = object.parent;
      }
      // The foreground terrain should occlude objects behind the island.
      if (hit.object.parent === worldGroup && !hit.object.userData.hotspot) return null;
    }
    return null;
  }

  function pointerDown(event) {
    if (!renderingActive || !visible || disposed) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, distance: 0 };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function pointerMove(event) {
    if (!renderingActive || !visible || disposed) return;
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.distance = Math.max(drag.distance, Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
      yaw -= dx * 0.005;
      pitch = clamp(pitch + dy * 0.004, cameraMode === 'first' ? -1.1 : 0.12, cameraMode === 'first' ? 1.1 : 1.35);
      drag.x = event.clientX;
      drag.y = event.clientY;
    } else if (event.pointerType !== 'touch') {
      canvas.style.cursor = hitAt(event) ? 'pointer' : 'grab';
    }
  }

  function pointerUp(event) {
    if (!renderingActive || !visible || disposed) return;
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.distance < 6 && event.type !== 'pointercancel') {
      const hotspot = hitAt(event);
      if (hotspot) onHotspot?.(hotspot);
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
    canvas.style.cursor = 'grab';
  }

  function wheel(event) {
    if (!renderingActive || !visible || disposed) return;
    event.preventDefault();
    if (cameraMode === 'orbit') orbitDistance = clamp(orbitDistance + event.deltaY * 0.045, 28, 165);
    else if (cameraMode === 'third') pitch = clamp(pitch + event.deltaY * 0.0007, 0.12, 1.1);
  }

  const keyMap = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run' };
  function keyDown(event) {
    if (!renderingActive || !visible || disposed) return;
    if (document.activeElement !== canvas) return;
    const direction = keyMap[event.code];
    if (direction) { event.preventDefault(); keys.add(direction); }
    if (event.code === 'Space') { event.preventDefault(); waveUntil = elapsed + 2.6; }
  }
  function keyUp(event) {
    if (!renderingActive || !visible || disposed) return;
    const direction = keyMap[event.code];
    if (direction) keys.delete(direction);
  }
  function clearKeys() { keys.clear(); mobileKeys.clear(); }
  function releaseDrag() {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    canvas.style.cursor = 'grab';
  }
  function stopFrames() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    clock.stop();
    frameCount = 0;
    statsSeconds = 0;
  }
  function resumeFrames() {
    if (disposed || !renderingActive || !visible || frameId) return;
    // A fresh clock prevents inactive time from becoming a movement/animation delta.
    clock.start();
    frameCount = 0;
    statsSeconds = 0;
    frameId = requestAnimationFrame(tick);
  }
  function visibilityChange() {
    visible = !document.hidden;
    clearKeys();
    releaseDrag();
    if (visible) resumeFrames(); else stopFrames();
  }

  canvas.tabIndex = canvas.tabIndex < 0 ? 0 : canvas.tabIndex;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('blur', clearKeys);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', visibilityChange);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function reportStats(delta) {
    frameCount++;
    statsSeconds += delta;
    if (renderElapsed - lastStatsAt < 0.5) return;
    let objects = 0;
    scene.traverse((object) => { if (object.isMesh) objects++; });
    onStats?.({
      fps: Math.min(240, Math.round(frameCount / Math.max(statsSeconds, 0.001))),
      // r180 resets renderer.info after the shadow pass; these are main-view draw calls.
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      objects,
      trees: treeGroup?.userData.treeCount || 0,
      position: { x: +position.x.toFixed(2), z: +position.z.toFixed(2) },
      heading,
    });
    frameCount = 0;
    statsSeconds = 0;
    lastStatsAt = renderElapsed;
  }

  function tick() {
    frameId = 0;
    if (disposed || !renderingActive || !visible) return;
    frameId = requestAnimationFrame(tick);
    const frameDelta = clock.getDelta();
    const delta = Math.min(frameDelta, 0.06);
    if (!renderWidth || !renderHeight) return;
    if (playing) {
      elapsed += delta;
      skyUniforms.time.value = elapsed;
      waterUniforms.time.value = elapsed;
      updatePlayer(delta);
      for (const marker of animatedMarkers) {
        marker.object.position.y = marker.baseY + Math.sin(elapsed * 1.5) * 0.12;
        if (marker.rotate) marker.object.rotation.z = elapsed * 0.16;
      }
      for (const boat of boats) {
        boat.object.position.y = boat.baseY + Math.sin(elapsed * 1.2 + boat.phase) * 0.09;
        boat.object.rotation.z = Math.sin(elapsed * 0.9 + boat.phase) * 0.025;
      }
    }
    updateCamera(delta);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    // Pausing simulation still permits camera exploration and meaningful renderer stats.
    renderElapsed += frameDelta;
    reportStats(frameDelta);
  }

  buildWorld();
  applyLight();
  resize();
  smoothedTarget.set(0, 2.3, 0);
  camera.position.set(52, 72, 66);
  camera.lookAt(smoothedTarget);
  resumeFrames();
  queueMicrotask(() => { if (!disposed) onReady?.({ world: worldId, renderer: 'WebGL', localAssets: true }); });

  return {
    setWorld(id) { if (WORLD_SETTINGS[id] && id !== worldId) { worldId = id; buildWorld(); onReady?.({ world: worldId }); } },
    setCamera(mode) {
      if (!['first', 'third', 'orbit'].includes(mode)) return;
      cameraMode = mode;
      pitch = mode === 'first' ? 0.04 : mode === 'third' ? 0.37 : 0.69;
      if (mode === 'orbit') orbitDistance = 111;
      else yaw = heading - Math.PI;
      clearKeys();
    },
    setLight(id) { if (LIGHTS[id]) { lightId = id; applyLight(); } },
    setWireframe(value) { wireframe = Boolean(value); applyMaterials(); },
    setShadows(value) { shadows = Boolean(value); applyMaterials(); },
    setRoughness(value) { roughness = clamp(Number(value) || 0, 0.02, 1); applyMaterials(); },
    setPopulation(value) { population = clamp(Math.round(Number(value) || 0), 0, 600); buildTrees(); },
    setInstancing(value) { instancing = Boolean(value); buildTrees(); },
    setPlaying(value) { playing = Boolean(value); clearKeys(); },
    setActive(value) {
      if (disposed) return;
      renderingActive = Boolean(value);
      clearKeys();
      releaseDrag();
      if (renderingActive) { resize(); resumeFrames(); } else stopFrames();
    },
    reset() { resetPosition(); yaw = 0.65; pitch = cameraMode === 'first' ? 0.04 : cameraMode === 'third' ? 0.37 : 0.69; orbitDistance = 111; },
    wave() { waveUntil = elapsed + 2.6; },
    setMovement(direction, pressed) {
      if (!renderingActive || !visible || disposed) return;
      const aliases = { w: 'forward', s: 'backward', a: 'left', d: 'right', up: 'forward', down: 'backward', shift: 'run' };
      direction = aliases[direction] || direction;
      if (!['forward', 'backward', 'left', 'right', 'run'].includes(direction)) return;
      if (pressed) mobileKeys.add(direction); else mobileKeys.delete(direction);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stopFrames();
      clearKeys();
      releaseDrag();
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('blur', clearKeys);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', visibilityChange);
      disposeGroup(scene);
      if (treeResources) {
        for (const geometry of treeResources.geometries) geometry.dispose();
        for (const mat of treeResources.materials) mat.dispose();
      }
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
