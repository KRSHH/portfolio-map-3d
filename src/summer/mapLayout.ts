/* The map's layout for the SummerTime-town overlay, read from the map's own world data.
///
/// The island itself is generated from src/data/layout.ts (hub-and-spoke: plaza,
/// spoke roads, one district disc per industry plus the people area). This adapter
/// turns that world into hub pieces (monument in place of the office block, the Nexus
/// portal from src/data/hub.ts, lantern pylons, spawn) and neighborhood clusters
/// (pins straight from the layout, arch signs facing the monument).
///
/// Pure data in, pure data out (no three.js): mapLayout.test.ts pins the mapping. */
import { PORTAL } from "../data/hub";
import type { WorldLayout } from "../data/layout";

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

export interface DisplayDistrict {
  slug: string;
  label: string;
  short: string;
  color: string;
}

/** The monument stands at the plaza's center, facing the spawn. */
export const MONUMENT = { x: 0, z: 0 } as const;
/** Lantern pylons on the monument's north arc (Ambition's bearings, our north = -z). */
const PYLON_R = 9.5;
const PYLON_BEARINGS = [-142, -108, -72, -38];

export function planFromLayout(layout: WorldLayout, districts: DisplayDistrict[], peopleLabel = "People"): MapPlan {
  const spawn = { x: layout.spawn.x, z: layout.spawn.z };
  const monument = { x: MONUMENT.x, z: MONUMENT.z, facing: Math.atan2(spawn.x - MONUMENT.x, spawn.z - MONUMENT.z) };
  const portal = { x: PORTAL.x, z: PORTAL.z, facing: Math.atan2(spawn.x - PORTAL.x, spawn.z - PORTAL.z) };
  const pylons = PYLON_BEARINGS.map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: +(MONUMENT.x + PYLON_R * Math.cos(a)).toFixed(2), z: +(MONUMENT.z + PYLON_R * Math.sin(a)).toFixed(2) };
  });

  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  const clusters: ClusterPlan[] = [];
  for (const disc of layout.discs) {
    const info = bySlug.get(disc.slug);
    const isPeople = disc.slug === "people";
    const pins: PinPlan[] = [];
    for (const pin of layout.pins.values()) {
      if (pin.district === disc.slug) pins.push({ slug: pin.slug, district: pin.district, x: pin.x, z: pin.z });
    }
    pins.sort((a, b) => (a.slug < b.slug ? -1 : 1));
    const dx = monument.x - disc.x;
    const dz = monument.z - disc.z;
    const len = Math.hypot(dx, dz) || 1;
    clusters.push({
      slug: disc.slug,
      label: isPeople ? peopleLabel : (info?.label ?? disc.slug),
      short: isPeople ? peopleLabel : (info?.short ?? disc.slug),
      color: isPeople ? "#8a8f98" : (info?.color ?? "#888888"),
      count: disc.count,
      cx: disc.x,
      cz: disc.z,
      r: disc.r,
      sign: {
        x: +(disc.x + (dx / len) * (disc.r + 2.5)).toFixed(2),
        z: +(disc.z + (dz / len) * (disc.r + 2.5)).toFixed(2),
        facing: Math.atan2(dx, dz),
      },
      pins,
    });
  }
  return { monument, portal, pylons, spawn, clusters };
}
