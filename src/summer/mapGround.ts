/* Pure ground math for the generated island (mapWorld.ts builds the meshes).
   No three.js, no DOM: unit-testable in node (mapWorld.test.ts). */
import { type WorldLayout } from "../data/layout";

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Deterministic 2D value noise in [-1, 1]. */
export function noise2(x: number, z: number): number {
  const hash = (ix: number, iz: number) => {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}

/** Spoke roads from the plaza edge to each district's edge (hub-and-spoke). */
export function spokes(layout: WorldLayout): Array<{ ax: number; az: number; bx: number; bz: number }> {
  return layout.discs.map((d) => {
    const ux = Math.cos(d.angle);
    const uz = Math.sin(d.angle);
    return { ax: ux * 46, az: uz * 46, bx: d.x - ux * (d.r * 0.4), bz: d.z - uz * (d.r * 0.4) };
  });
}

export function distToSpokes(layout: WorldLayout, x: number, z: number): number {
  let best = Infinity;
  for (const s of spokes(layout)) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)));
  }
  return best;
}

/** Terrain height: flattened pads (plaza, districts, roads) blended into hills and beach. */
export function islandHeight(layout: WorldLayout, x: number, z: number): number {
  const r = Math.hypot(x, z);
  let flat = 1 - smoothstep(46, 62, r);
  for (const d of layout.discs) {
    const dd = Math.hypot(x - d.x, z - d.z) - (d.r + 7);
    flat = Math.max(flat, 1 - smoothstep(0, 10, dd));
  }
  flat = Math.max(flat, 1 - smoothstep(4.5, 8, distToSpokes(layout, x, z)));
  flat = Math.max(flat, 1 - smoothstep(3.4, 6.5, Math.abs(r - 57.5)));
  const rolling = 1.0 + 1.3 * noise2(x * 0.03, z * 0.03) + 0.4 * noise2(x * 0.11 + 7, z * 0.11);
  const hills =
    smoothstep(-25, -75, x) * (5 + 3 * noise2(x * 0.02 + 3, z * 0.02)) +
    smoothstep(25, 75, z) * (4 + 2 * noise2(x * 0.02, z * 0.02 + 9)) +
    smoothstep(-30, -80, z) * (3 + 2 * noise2(x * 0.025 + 13, z * 0.025));
  const natural = rolling + Math.max(0, hills);
  const shore = -1.6 * smoothstep(138, 160, r) - 1.2 * smoothstep(160, 175, r);
  return natural + (0.4 - natural) * flat + shore * (1 - flat * 0.4);
}

/** District barn spots, outside each district's far edge (computed before scattering). */
export function warehouseSpots(layout: WorldLayout): Array<[number, number]> {
  return layout.discs
    .filter((d) => d.slug !== "people")
    .map((d) => [d.x + Math.cos(d.angle) * (d.r + 8), d.z + Math.sin(d.angle) * (d.r + 8)]);
}

/** Scatterable unless in a district, on a road, the plaza, a barn yard, or off land. */
export function plantable(layout: WorldLayout, barns: Array<[number, number]>, x: number, z: number, margin: number): boolean {
  const r = Math.hypot(x, z);
  if (r > 150 || islandHeight(layout, x, z) < 0.35) return false;
  if (r < 62) return false;
  if (Math.abs(r - 57.5) < 4.5 + margin) return false;
  if (distToSpokes(layout, x, z) < 4.5 + margin) return false;
  for (const d of layout.discs) {
    if (Math.hypot(x - d.x, z - d.z) < d.r + 2 + margin) return false;
  }
  for (const [bx, bz] of barns) {
    if (Math.hypot(x - bx, z - bz) < 7 + margin) return false;
  }
  return true;
}

export function scatter(
  rand: () => number,
  layout: WorldLayout,
  barns: Array<[number, number]>,
  n: number,
  margin: number,
  pick: (x: number, z: number) => boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const a = rand() * Math.PI * 2;
    const r = 60 + Math.sqrt(rand()) * 90;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!plantable(layout, barns, x, z, margin) || !pick(x, z)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue;
    out.push([x, z]);
  }
  return out;
}
