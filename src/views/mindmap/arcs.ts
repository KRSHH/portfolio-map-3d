/* Arc geometry for the company globe: great-circle paths between two points
   on the sphere, lifted off the surface so links read as bridges rather than
   scratches on the glass. Pure functions over plain tuples, unit-tested. */
import { angleBetween, cross, dot, length, normalize, perpendicular, type Vec3 } from "./globeLayout";

/** Spherical interpolation between unit vectors a and b. Antipodal pairs take a fixed, deterministic route. */
export function slerpUnit(a: Vec3, b: Vec3, t: number): Vec3 {
  const ang = angleBetween(a, b);
  if (ang < 1e-6) return a;
  let axis = cross(a, b);
  if (length(axis) < 1e-6) axis = perpendicular(a);
  axis = normalize(axis);
  // Rotate a about axis by t * ang (Rodrigues; a is perpendicular to axis).
  const th = ang * t;
  const k = cross(axis, a);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const d = dot(axis, a) * (1 - c);
  return normalize([a[0] * c + k[0] * s + axis[0] * d, a[1] * c + k[1] * s + axis[1] * d, a[2] * c + k[2] * s + axis[2] * d]);
}

/** How high an arc between two points `ang` radians apart rises above the surface, for globe radius R. */
export function arcLift(ang: number, R: number, k = 1): number {
  const f = ang / Math.PI;
  // Gentle growth: long arcs seen edge-on from the front would otherwise spike far past the silhouette.
  return k * R * (0.03 + 0.09 * f + 0.05 * f * f);
}

/**
 * Points along the great circle from a to b (unit vectors), at radius r0 at
 * the start and r1 at the end, rising by `lift` at the middle. Includes both
 * endpoints. Segment count scales with the angle unless given.
 */
export function arcPoints(a: Vec3, b: Vec3, r0: number, r1: number, lift: number, segments?: number): Vec3[] {
  const ang = angleBetween(a, b);
  const n = Math.max(2, segments ?? Math.ceil(6 + ang * 18));
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = slerpUnit(a, b, t);
    const r = r0 + (r1 - r0) * t + lift * Math.sin(Math.PI * t);
    out.push([d[0] * r, d[1] * r, d[2] * r]);
  }
  return out;
}

/** Cumulative length along a polyline (first value 0). */
export function cumulativeLength(points: Vec3[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    out.push(out[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return out;
}
