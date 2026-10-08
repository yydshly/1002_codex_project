// Derived support heights for validated creation plans. Authored heights and polygons stay unchanged.
// A flat water region rests above the highest land polygon it overlaps, including shared boundaries.
// This is a lightweight surface preview, not terrain excavation or a hydrology simulation.

export const WATER_SURFACE_OFFSET = 0.035;
const EPSILON = 1e-10;

function orientation(a, b, c) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(value) <= EPSILON ? 0 : Math.sign(value);
}

function onSegment(a, b, point) {
  return orientation(a, b, point) === 0
    && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}

function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, point)) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function bounds(polygon) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const point of polygon) {
    box.minX = Math.min(box.minX, point.x); box.maxX = Math.max(box.maxX, point.x);
    box.minY = Math.min(box.minY, point.y); box.maxY = Math.max(box.maxY, point.y);
  }
  return box;
}

function overlaps(first, second) {
  const a = bounds(first), b = bounds(second);
  if (a.maxX < b.minX - EPSILON || b.maxX < a.minX - EPSILON
    || a.maxY < b.minY - EPSILON || b.maxY < a.minY - EPSILON) return false;
  if (first.some(point => contains(point, second)) || second.some(point => contains(point, first))) return true;
  for (let i = 0; i < first.length; i++) {
    for (let j = 0; j < second.length; j++) {
      if (segmentsIntersect(first[i], first[(i + 1) % first.length], second[j], second[(j + 1) % second.length])) return true;
    }
  }
  return false;
}

/** Return a water region's absolute water level, before the small rendering separation offset. */
export function waterLevel(plan, water) {
  let level = water.height;
  for (const entity of plan.entities) {
    if (entity.kind === 'land' && entity.height > level && overlaps(water.points, entity.points)) level = entity.height;
  }
  return level;
}

/**
 * Return the highest land/water support surface at a normalized plan point.
 * An optional Map of water ID -> waterLevel(plan, water) avoids repeated overlap checks during mesh construction.
 * Cached levels exclude WATER_SURFACE_OFFSET; this function adds the same offset used by the water mesh.
 */
export function surfaceHeight(plan, point, waterLevels) {
  let height = 0;
  for (const entity of plan.entities) {
    if ((entity.kind !== 'land' && entity.kind !== 'water') || !contains(point, entity.points)) continue;
    const surface = entity.kind === 'land' ? entity.height
      : (waterLevels?.get(entity.id) ?? waterLevel(plan, entity)) + WATER_SURFACE_OFFSET;
    height = Math.max(height, surface);
  }
  return height;
}
