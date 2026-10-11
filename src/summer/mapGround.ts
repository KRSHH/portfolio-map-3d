/* Pure ground math for the generated island (mapWorld.ts builds the meshes from it). The island's
   shape comes from the plan (mapLayout.ts): flat ground under the town (the plaza, the ring street
   and its stalls), every road and every district; gently rolling grass between them; hills in the
   band behind the districts, open to the east, settling before the beach; the beach sloping gently
   to the waterline, then the seabed. islandHeight() is the ground truth every placement reads.
   No three.js, no DOM: unit-testable in node (mapWorld.test.ts). */
import { ROAD_W, STALL_OUT, type MapPlan } from "./mapLayout";

/** What the ground needs from the plan. */
export type IslandShape = Pick<MapPlan, "plaza" | "street" | "island" | "clusters" | "spokes">;

/** The island's painted colors, shared by the ground texture (mapWorld.ts) and the minimap (mapMinimap.ts). */
export const GROUND_COLORS = {
  /** The sea shader's own color. */
  sea: "#5a7aa2",
  seabed: "#7fa39a",
  sand: "#e2d1a2",
  wetSand: "#cdbb8c",
  grass: "#79a85b",
  grassLight: "#8fbc66",
  grassDark: "#6b9c4e",
  hill: "#5f8f46",
  road: "#b9ae96",
  roadLine: "#efe6cf",
  paving: "#d8cba6",
  plaza: "#cdc3ac",
  plazaLine: "#b3a88c",
  stone: "#a89a7c",
} as const;

/** The paved height of every pad (plaza, roads, districts). */
export const PAD_Y = 0.4;
/** The sea's surface at rest (the town's sea plane; its swell lifts and drops it about 0.4). */
export const SEA_Y = -0.815;

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

/** Distance from (x, z) to the nearest road's center line. */
export function distToSpokes(shape: Pick<MapPlan, "spokes">, x: number, z: number): number {
  let best = Infinity;
  for (const s of shape.spokes) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)));
  }
  return best;
}

/** The town's flat ground: the plaza, the ring street and the market stalls, out to a step behind them. */
export function townRadius(shape: Pick<MapPlan, "street">): number {
  return shape.street.r + shape.street.width / 2 + STALL_OUT + 3;
}

/** How much (x, z) is paved or leveled: 1 in the town, on a road or in a district, easing to 0 a few units out. */
export function padWeight(shape: IslandShape, x: number, z: number): number {
  const town = townRadius(shape);
  let flat = 1 - smoothstep(town, town + 8, Math.hypot(x, z));
  flat = Math.max(flat, 1 - smoothstep(ROAD_W / 2 + 1.5, ROAD_W / 2 + 5, distToSpokes(shape, x, z)));
  for (const c of shape.clusters) {
    flat = Math.max(flat, 1 - smoothstep(0, 8, Math.hypot(x - c.cx, z - c.cz) - (c.r + 4)));
  }
  return flat;
}

/** How much the hills rise at a bearing: everywhere but the east, which stays open to the sea and its beach. */
export function hillSide(x: number, z: number): number {
  return 1 - smoothstep(0.35, 0.85, Math.cos(Math.atan2(z, x)));
}

/**
 * Terrain height: flat pads blended into gently rolling grass, and hills in the band behind the
 * districts (all round but the east), which settle onto a gentle beach and the seabed.
 */
export function islandHeight(shape: IslandShape, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const { land, water, walk } = shape.island;
  const town = townRadius(shape);
  const flat = padWeight(shape, x, z);
  const rolling = 0.9 + 1.1 * noise2(x * 0.03, z * 0.03) + 0.35 * noise2(x * 0.11 + 7, z * 0.11);
  const band = smoothstep(town + 4, town + 20, r) * (1 - smoothstep(land - 22, land - 6, r));
  const hills = band * hillSide(x, z) * (4.5 + 3 * noise2(x * 0.02 + 3, z * 0.02));
  const natural = rolling + Math.max(0, hills);
  const inland = natural + (PAD_Y - natural) * flat;
  // The beach: just above the sea where the kid may walk, under it past the waterline, then the seabed.
  const beach = 0.35 - 0.6 * smoothstep(land, walk, r) - 0.75 * smoothstep(walk, water, r) - 2.6 * smoothstep(water, water + 18, r);
  return inland + (beach - inland) * smoothstep(land - 12, land, r);
}

/** Room for a scattered tree, bush, rock or tuft: on land, out of the town, off every road and district, and clear of the masts. */
export function plantable(shape: IslandShape, x: number, z: number, margin: number): boolean {
  const r = Math.hypot(x, z);
  if (r > shape.island.land + 6 || islandHeight(shape, x, z) < PAD_Y - 0.05) return false;
  if (r < townRadius(shape) + margin) return false;
  if (distToSpokes(shape, x, z) < ROAD_W / 2 + 1.5 + margin) return false;
  for (const c of shape.clusters) {
    if (Math.hypot(x - c.cx, z - c.cz) < c.r + 2 + margin) return false;
    if ("mast" in c && c.mast && Math.hypot(x - c.mast.x, z - c.mast.z) < 5 + margin) return false;
  }
  return true;
}

/** `n` deterministic spots that pass plantable() and `pick`, at least 6 apart, between the town and the beach. */
export function scatter(rand: () => number, shape: IslandShape, n: number, margin: number, pick: (x: number, z: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const r0 = townRadius(shape);
  const r1 = shape.island.land + 6;
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const a = rand() * Math.PI * 2;
    const r = r0 + Math.sqrt(rand()) * (r1 - r0);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!plantable(shape, x, z, margin) || !pick(x, z)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue;
    out.push([x, z]);
  }
  return out;
}

/** How much of the sea the kid hears at (x, z): none in the town, rising toward every shore, loudest on the open east beach. */
export function seaSound(shape: IslandShape, x: number, z: number): number {
  const near = smoothstep(shape.island.land - 36, shape.island.land - 2, Math.hypot(x, z));
  return near * (0.35 + 0.65 * (1 - hillSide(x, z)));
}

/** `n` deterministic spots on the east beach's dry sand for palms, at least 6 apart and `room` clear of `taken`. */
export function beachSpots(rand: () => number, shape: IslandShape, n: number, taken: ReadonlyArray<{ x: number; z: number }>, room: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const { land, walk } = shape.island;
  let guard = 0;
  while (out.length < n && guard++ < n * 80) {
    const a = (rand() * 2 - 1) * 0.7;
    const r = land - 8 + rand() * (walk - 3 - (land - 8));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (hillSide(x, z) > 0.2 || islandHeight(shape, x, z) < SEA_Y + 0.7) continue;
    if (distToSpokes(shape, x, z) < ROAD_W / 2 + 2) continue;
    if (shape.clusters.some((c) => Math.hypot(x - c.cx, z - c.cz) < c.r + 4)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < room)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue;
    out.push([x, z]);
  }
  return out;
}
