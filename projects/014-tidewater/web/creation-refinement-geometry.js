// Conservative shoreline meshes: every emitted triangle is clipped to an authored land triangle.
// Obstacle clearance uses a covering circle, so no sand can cross water, roads or existing objects.
import { createLandDetailSafety } from './creation-refinement.js';
import { triangulateShape } from './runtime/src/engine/math/ShapeUtils.js';

const EPSILON = 1e-8;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function clip(subject, triangle) {
  const sign = Math.sign(cross(...triangle));
  let output = subject;
  for (let i = 0; i < 3 && output.length; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], input = output;
    output = [];
    let previous = input[input.length - 1], previousSide = cross(a, b, previous) * sign;
    for (const point of input) {
      const side = cross(a, b, point) * sign;
      if ((side >= -EPSILON) !== (previousSide >= -EPSILON)) {
        const t = previousSide / (previousSide - side);
        output.push({ x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t });
      }
      if (side >= -EPSILON) output.push(point);
      previous = point; previousSide = side;
    }
  }
  return output;
}

const bounds = points => ({
  minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
  minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)),
});
const overlaps = (a, b) => a.minX <= b.maxX + EPSILON && a.maxX >= b.minX - EPSILON
  && a.minY <= b.maxY + EPSILON && a.maxY >= b.minY - EPSILON;

/** Return world-X/Z shoreline triangles, bounded independently of world size and input complexity. */
export function generateBeachTriangles(plan, land, beach, limit = 768) {
  if (!beach?.enabled || limit <= 0) return [];
  const points = land.points.map(point => ({ x: (point.x - .5) * plan.world.width, y: (point.y - .5) * plan.world.depth }));
  const faces = triangulateShape(points, []).map(face => {
    const triangle = face.map(index => points[index]);
    return { triangle, bounds: bounds(triangle) };
  });
  const signedArea = points.reduce((area, point, i) => {
    const next = points[(i + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0);
  const inward = Math.sign(signedArea);
  const perimeter = points.reduce((length, point, i) => length + Math.hypot(point.x - points[(i + 1) % points.length].x, point.y - points[(i + 1) % points.length].y), 0);
  // At most 512 regular samples plus one sample per authored edge, even on a 2 km world.
  const sampleLength = Math.max(beach.width * 1.2, perimeter / 512);
  const safe = createLandDetailSafety(plan, land, { ignoreBoundary: true });
  const triangles = [];
  for (let edge = 0; edge < points.length; edge++) {
    const a = points[edge], b = points[(edge + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy), count = Math.max(1, Math.ceil(length / sampleLength));
    const nx = -dy / length * inward * beach.width, ny = dx / length * inward * beach.width;
    for (let part = 0; part < count; part++) {
      const u = part / count, v = (part + 1) / count;
      const p = { x: a.x + dx * u, y: a.y + dy * u }, q = { x: a.x + dx * v, y: a.y + dy * v };
      const patch = [p, q, { x: q.x + nx, y: q.y + ny }, { x: p.x + nx, y: p.y + ny }], patchBounds = bounds(patch);
      for (const face of faces) {
        if (!overlaps(patchBounds, face.bounds)) continue;
        const polygon = clip(patch, face.triangle);
        for (let i = 1; i + 1 < polygon.length; i++) {
          const triangle = [polygon[0], polygon[i], polygon[i + 1]];
          if (Math.abs(cross(...triangle)) < EPSILON) continue;
          const center = { x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3, y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3 };
          const radius = Math.max(...triangle.map(point => Math.hypot(point.x - center.x, point.y - center.y)));
          if (!safe({ x: center.x / plan.world.width + .5, y: center.y / plan.world.depth + .5 }, radius)) continue;
          triangles.push(triangle);
          if (triangles.length >= limit) return triangles;
        }
      }
    }
  }
  return triangles;
}
