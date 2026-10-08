// Deterministic, bounded procedural detail recipes for validated creation plans.
// This does not invoke a model or modify authored entities. Decoration positions are normalized.
import { validateRefinement, MAX_REFINED_LANDS } from './creation-core.js';

export const DETAIL_FOOTPRINTS = Object.freeze({ rock: 1.6, palm: 3, tree: 2.6, shrub: 1.25 });
export const DETAIL_LIMITS = Object.freeze({ perLand: 48, total: 240, refinedLands: MAX_REFINED_LANDS, attemptsPerLand: 1536 });
const MARKER_FOOTPRINTS = Object.freeze({ cabin: 6.3, lighthouse: 2.55, palm: 5.3, boat: 4.4 });
const PRESETS = Object.freeze({
  tropical: { groundColor: '#6c956b', beachColor: '#dfce9c', weights: { rock: 22, palm: 48, shrub: 30 } },
  rocky: { groundColor: '#7d8981', beachColor: '#c6bb9d', weights: { rock: 72, tree: 14, shrub: 14 } },
  garden: { groundColor: '#649056', beachColor: '#d9cda9', weights: { rock: 10, tree: 42, shrub: 48 } },
});
const EPSILON = 1e-7;

/** Produce a complete, validated recipe; callers may customize toggles with a copied object. */
export function makeRefinement(preset, density = 2, seed = 1) {
  return validateRefinement({
    preset, density, seed, beach: preset === 'tropical', rocks: preset !== 'garden', vegetation: true,
  });
}

function meterPoint(point, world) { return { x: point.x * world.width, y: point.y * world.depth }; }
function bounds(points) {
  return points.reduce((box, p) => ({
    minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x),
    minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}
function nearBox(point, box, radius = 0) {
  return point.x >= box.minX - radius && point.x <= box.maxX + radius
    && point.y >= box.minY - radius && point.y <= box.maxY + radius;
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function boundaryDistance(point, polygon) {
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) min = Math.min(min, segmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]));
  return min;
}
function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (segmentDistance(point, a, b) < EPSILON) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Build a point / circular-footprint predicate once for a validated plan and land.
 * All distances use metres, including anisotropic worlds. Higher land occludes lower land;
 * equal-height overlaps belong to the lexically earlier ID so entity order cannot change results.
 * ignoreBoundary is for a renderer that separately clips beach vertices to the authored outline.
 */
export function createLandDetailSafety(plan, land, { ignoreBoundary = false } = {}) {
  if (land?.kind !== 'land') throw new Error('细化安全检查只支持陆地。');
  const world = plan.world, polygon = land.points.map(point => meterPoint(point, world)), box = bounds(polygon);
  const polygons = [], roads = [], markers = [];
  const roadHalfWidth = Math.max(.6, Math.min(3.2, Math.min(world.width, world.depth) * .018)) / 2;
  for (const entity of plan.entities) {
    if (entity.id === land.id) continue;
    const points = entity.points.map(point => meterPoint(point, world));
    if (entity.kind === 'water' || (entity.kind === 'land'
      && (entity.height > land.height || (entity.height === land.height && entity.id < land.id)))) {
      polygons.push({ points, box: bounds(points) });
    } else if (entity.kind === 'road') {
      for (let i = 1; i < points.length; i++) roads.push({ a: points[i - 1], b: points[i], box: bounds([points[i - 1], points[i]]) });
    } else if (Object.hasOwn(MARKER_FOOTPRINTS, entity.kind)) {
      markers.push({ point: points[0], radius: MARKER_FOOTPRINTS[entity.kind] });
    }
  }
  return (point, radius = 0) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || !Number.isFinite(radius) || radius < 0) return false;
    const p = meterPoint(point, world);
    if (!nearBox(p, box) || !contains(p, polygon)) return false;
    if (!ignoreBoundary && boundaryDistance(p, polygon) < radius + EPSILON) return false;
    for (const obstacle of polygons) {
      if (!nearBox(p, obstacle.box, radius + EPSILON)) continue;
      if (contains(p, obstacle.points) || boundaryDistance(p, obstacle.points) <= radius + EPSILON) return false;
    }
    for (const road of roads) {
      const clearance = radius + roadHalfWidth + .8;
      if (nearBox(p, road.box, clearance) && segmentDistance(p, road.a, road.b) <= clearance + EPSILON) return false;
    }
    for (const marker of markers) {
      if (Math.hypot(p.x - marker.point.x, p.y - marker.point.y) <= radius + marker.radius + .8 + EPSILON) return false;
    }
    return true;
  };
}

function hashId(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function areaInMeters(points, world) {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) * world.width * world.depth / 2;
}
function chooseType(weights, random) {
  const sum = weights.reduce((total, [, weight]) => total + weight, 0);
  let remaining = random() * sum;
  for (const [type, weight] of weights) {
    remaining -= weight;
    if (remaining < 0) return type;
  }
  return weights.at(-1)[0];
}

/**
 * Pure derived details for a land from a plan already accepted by validatePlan.
 * Generated objects are owned by that land and are never appended to authored entities.
 * Change a polygon, world size, recipe or obstacles and derive again; nothing is cached.
 */
export function generateLandDetails(plan, land) {
  if (land?.kind !== 'land') throw new Error('只能细化陆地区域。');
  const authored = plan.entities.find(entity => entity.id === land.id);
  if (authored !== land && (!authored || JSON.stringify(authored) !== JSON.stringify(land))) {
    throw new Error('细化陆地须来自当前创作方案。');
  }
  if (!land.refinement) return {
    decorations: [], beach: { enabled: false, width: 0, color: '#dfce9c' },
    groundColor: plan.style.landColor, stats: { attempts: 0, budget: 0, target: 0 },
  };
  const refinement = validateRefinement(land.refinement), preset = PRESETS[refinement.preset];
  // Independent per-land budgets keep confirming/removing another recipe from changing this land.
  // validatePlan caps refined lands at five, so the aggregate maximum is still 5 * 48 = 240.
  const area = areaInMeters(land.points, plan.world), budget = [0, 18, 32, 48][refinement.density];
  const beach = { enabled: refinement.beach, width: Math.min(3.8, Math.max(.6, Math.sqrt(area) * .024)), color: preset.beachColor };
  const weights = Object.entries(preset.weights).filter(([type]) => type === 'rock' ? refinement.rocks : refinement.vegetation);
  const spacing = [0, 10, 7.5, 5.5][refinement.density], gap = [0, 4, 2.8, 1.4][refinement.density];
  const target = weights.length ? Math.min(budget, Math.floor(area / (spacing * spacing))) : 0;
  const result = { decorations: [], beach, groundColor: preset.groundColor, stats: { attempts: 0, budget, target } };
  if (!target) return result;
  const safe = createLandDetailSafety(plan, land), box = bounds(land.points);
  const random = randomGenerator(refinement.seed ^ hashId(land.id)), accepted = [];
  const maxAttempts = Math.min(DETAIL_LIMITS.attemptsPerLand, Math.max(128, target * 40));
  while (result.decorations.length < target && result.stats.attempts < maxAttempts) {
    result.stats.attempts++;
    const point = { x: box.minX + random() * (box.maxX - box.minX), y: box.minY + random() * (box.maxY - box.minY) };
    const type = chooseType(weights, random);
    const scale = type === 'rock' ? .7 + random() * .8 : .7 + random() * .45;
    const radius = DETAIL_FOOTPRINTS[type] * scale;
    const rotation = random() * Math.PI * 2;
    if (!safe(point, radius + (beach.enabled ? beach.width : .3))) continue;
    const meters = meterPoint(point, plan.world);
    if (accepted.some(other => Math.hypot(meters.x - other.x, meters.y - other.y) < radius + other.radius + gap)) continue;
    accepted.push({ ...meters, radius });
    result.decorations.push({ type, point, scale, rotation });
  }
  return result;
}
