/* Ambition-style layout for the SummerTime town overlay (src/summer/mapOverlay.ts).

   Like Ambition PR #1's hub-and-spoke map, but fitted to the town's real
   geometry (decoded once in scripts/survey-summer.mjs → mapSurvey.ts):
   - a founding hub at the town center: monument, four pylons, the Nexus
     portal west of the monument, spawn south of it facing north;
   - one neighborhood per district (plus the people area), each a sunflower
     of company pins around its center, with an arch sign on the side
     facing the monument.

   Pure data in, pure data out (no three.js): mapPlan.test.ts pins the
   clearances, so a re-survey or a catalog change cannot silently bury a pin
   inside a house. Heights come from the baked grid; the overlay re-snaps Y
   at runtime with a raycast against the terrain mesh. */
import { CLUSTER_SPOTS, HEIGHT_GRID, HUB_SPOTS, OBSTACLES, type Obstacle } from "./mapSurvey";
import { hashString, sunflower } from "../data/layout";

export interface PinPlan {
  slug: string;
  district: string;
  x: number;
  z: number;
}

export interface ClusterPlan {
  slug: string;
  label: string;
  short: string;
  color: string;
  count: number;
  cx: number;
  cz: number;
  r: number;
  sign: { x: number; z: number; facing: number };
  pins: PinPlan[];
}

export interface MapPlan {
  monument: { x: number; z: number; facing: number };
  portal: { x: number; z: number; facing: number };
  pylons: { x: number; z: number }[];
  spawn: { x: number; z: number };
  clusters: ClusterPlan[];
}

/** Clearance a pin keeps from an obstacle's edge, by kind. */
function marginOf(o: Obstacle): number {
  if (o.k === "house" || o.k === "blocker" || o.k === "machine") return 1.5;
  if (o.k === "lamp" || o.k === "palm") return 1.0;
  return 0.6; // trees, rocks, set pieces: pins may stand near, not inside
}

function clearOf(x: number, z: number, obstacles: Obstacle[] = OBSTACLES): boolean {
  if (heightAt(x, z) < DRY) return false; // sea (the water sits at -0.815)
  for (const o of obstacles) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + marginOf(o)) return false;
  }
  return true;
}

/** Ground at or above this baked height is out of the sea (the water sits at -0.815). */
export const DRY = -0.2;

/** Baked terrain height (nearest 10u node), for dry-ground checks and Y fallbacks. */
export function heightAt(x: number, z: number): number {
  const gx = Math.max(-70, Math.min(70, Math.round(x / 10) * 10));
  const gz = Math.max(-70, Math.min(70, Math.round(z / 10) * 10));
  return HEIGHT_GRID[`${gx},${gz}`] ?? 0;
}

/** Neighborhood radius for n pins: room for the sunflower plus the sign. */
export function clusterRadius(n: number): number {
  return 5.5 + 1.5 * Math.sqrt(Math.max(1, n));
}

export interface DistrictInput {
  slug: string;
  label: string;
  short: string;
  color: string;
  /** Company names sorted; one pin each, in this order. */
  companies: { slug: string; name: string }[];
}

function placePins(district: string, names: { slug: string; name: string }[], cx: number, cz: number, r: number): PinPlan[] {
  const spots = sunflower(names.length, 4, r, hashString(district));
  return names.map((c, i) => {
    // The sunflower spot, plus rotated fallbacks; first clear, dry spot wins.
    for (let v = 0; v < 9; v++) {
      const a = (v * Math.PI * 2) / 9;
      const dx = spots[i].x * Math.cos(a) - spots[i].z * Math.sin(a);
      const dz = spots[i].x * Math.sin(a) + spots[i].z * Math.cos(a);
      const x = cx + dx;
      const z = cz + dz;
      if (clearOf(x, z)) return { slug: c.slug, district, x: +x.toFixed(2), z: +z.toFixed(2) };
    }
    // No clear spot (dense forest): keep the sunflower position; the overlay
    // re-snaps at runtime and a pin among trees still reads.
    return { slug: c.slug, district, x: +(cx + spots[i].x).toFixed(2), z: +(cz + spots[i].z).toFixed(2) };
  });
}

/** The visitor's spawn in town units: south of the monument, facing it (Ambition's arrangement). */
export const SUMMER_SPAWN: [number, number] = HUB_SPOTS.spawn;

/**
 * Lay the map over the town. `districts` arrive in taxonomy order; the
 * people roster (slug order) becomes one more neighborhood. Deterministic:
 * same catalog, same plan, every load.
 */
export function planSummerMap(districts: DistrictInput[], people: { slug: string }[]): MapPlan {
  const [mx, mz] = HUB_SPOTS.monument;
  const [px, pz] = HUB_SPOTS.portal;
  const [sx, sz] = HUB_SPOTS.spawn;
  const monument = { x: mx, z: mz, facing: Math.atan2(sx - mx, sz - mz) };
  const portal = { x: px, z: pz, facing: Math.atan2(sx - px, sz - pz) };

  const clusters: ClusterPlan[] = [];
  const addCluster = (slug: string, label: string, short: string, color: string, names: { slug: string; name: string }[]) => {
    const [cx, cz] = CLUSTER_SPOTS[slug] ?? [0, 0];
    const r = clusterRadius(names.length);
    // The arch sign stands on the monument side of the neighborhood, facing it.
    const dx = mx - cx;
    const dz = mz - cz;
    const len = Math.hypot(dx, dz) || 1;
    const sign = { x: +(cx + (dx / len) * (r + 2.5)).toFixed(2), z: +(cz + (dz / len) * (r + 2.5)).toFixed(2), facing: Math.atan2(dx, dz) };
    clusters.push({ slug, label, short, color, count: names.length, cx, cz, r, sign, pins: placePins(slug, names, cx, cz, r) });
  };
  for (const d of districts) {
    const names = d.companies.slice().sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    addCluster(d.slug, d.label, d.short, d.color, names);
  }
  const folks = people.slice().sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  addCluster("people", "People", "People", "#8a8f98", folks.map((f) => ({ slug: f.slug, name: f.slug })));

  return {
    monument,
    portal,
    pylons: HUB_SPOTS.pylons.map(([x, z]) => ({ x, z })),
    spawn: { x: sx, z: sz },
    clusters,
  };
}
