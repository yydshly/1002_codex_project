import { contains, edgeDistance, smooth, worldPoint } from './terrain.js';

// Additional deterministic geometry for local scene assembly. This does not
// reconstruct terrain with a neural model or alter the authored plan.
const MAX_RELIEF = .8;
const ROAD_CLEARANCE = 1.25 + 2;
const WATER_CLEARANCE = 2.2;

function latticeValue(x, z, seed) {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const tx = smooth(0, 1, x - ix), tz = smooth(0, 1, z - iz);
  const near = latticeValue(ix, iz, seed) * (1 - tx) + latticeValue(ix + 1, iz, seed) * tx;
  const far = latticeValue(ix, iz + 1, seed) * (1 - tx) + latticeValue(ix + 1, iz + 1, seed) * tx;
  return near * (1 - tz) + far * tz;
}

function polygonArea(polygon) {
  let doubled = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    doubled += a.x * b.z - b.x * a.z;
  }
  return Math.abs(doubled) * .5;
}

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

/** Add bounded inland microrelief while keeping all functional surface zones
 * identical to the baseline. Original arrays and support/lookup methods are
 * shared read-only; the renderer may choose this height function per geometry. */
export function createDetailedTerrainField(plan, baseField, options = {}) {
  if (!plan?.world || !Array.isArray(plan.entities) || !Number.isFinite(plan.world.width) || !Number.isFinite(plan.world.depth)
    || plan.world.width <= 0 || plan.world.depth <= 0 || !baseField || typeof baseField.height !== 'function'
    || typeof baseField.landAt !== 'function' || !Array.isArray(baseField.lands) || !Array.isArray(baseField.waters) || !Array.isArray(baseField.anchors)) {
    throw new Error('精细地形需要有效原始布局与基础地形。');
  }
  const areas = new Map(baseField.lands.map(land => [land, polygonArea(land.polygon)]));
  const roads = plan.entities.filter(entity => entity.kind === 'road').map(entity => entity.points.map(point => worldPoint(point, plan)));
  function height(x, z, selected) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('地形采样坐标须为有限数。');
    const baseline = baseField.height(x, z, selected);
    if (!Number.isFinite(baseline)) throw new Error('基础地形高度无效。');
    const land = selected || baseField.landAt(x, z);
    if (!land || land.entity.locked || !contains({ x, z }, land.polygon)) return baseline;
    const distance = edgeDistance({ x, z }, land.polygon);
    let influence = smooth(3.5, 10, distance);
    if (influence === 0) return baseline;
    // Every source anchor keeps the full original flat-support blend, not just
    // its centre. Fade beyond that protected region to avoid a visible seam.
    for (const anchor of baseField.anchors) {
      const d = Math.hypot(x - anchor.x, z - anchor.z), clearance = anchor.radius + 2;
      if (d <= clearance) return baseline;
      influence *= smooth(clearance, clearance + 2.5, d);
    }
    for (const water of baseField.waters) {
      if (contains({ x, z }, water.polygon)) return baseline;
      const d = edgeDistance({ x, z }, water.polygon);
      if (d <= WATER_CLEARANCE) return baseline;
      influence *= smooth(WATER_CLEARANCE, WATER_CLEARANCE + 2.5, d);
    }
    for (const road of roads) {
      let distanceToRoad = Infinity;
      if (road.length === 1) distanceToRoad = Math.hypot(x - road[0].x, z - road[0].z);
      for (let i = 0; i < road.length - 1; i++) distanceToRoad = Math.min(distanceToRoad, segmentDistance(x, z, road[i], road[i + 1]));
      if (distanceToRoad <= ROAD_CLEARANCE) return baseline;
      influence *= smooth(ROAD_CLEARANCE, ROAD_CLEARANCE + 2.5, distanceToRoad);
    }
    const area = areas.get(land) ?? polygonArea(land.polygon);
    const heightScale = Math.max(0, Math.min(1, land.entity.height / 3));
    const areaScale = Math.max(0, Math.min(1, Math.sqrt(area) / 34));
    const rolling = valueNoise(x / 22, z / 22, 1741) * .68 + valueNoise(x / 9, z / 9, 9479) * .32;
    const requested = options.reliefById?.get(land.entity.id) ?? MAX_RELIEF;
    if (!Number.isFinite(requested) || requested < 0 || requested > MAX_RELIEF) throw new Error('模型微地形超出受保护范围。');
    const addition = requested * influence * heightScale * areaScale * rolling;
    // Never lower a valid terrain sample below the existing coastal surface.
    // Existing sub-shore legacy terrain remains unchanged instead of raising it.
    return Math.max(Math.min(baseline, .11), baseline + addition);
  }
  return { ...baseField, height };
}
