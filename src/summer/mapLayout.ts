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

export interface StallSpot {
  x: number;
  z: number;
  /** rotation.y facing the street (local +z toward the plaza). */
  ry: number;
  color: string;
}

/** Stalls sit midway between spoke crossings so no road runs through one. */
export function stallSpots(layout: WorldLayout, colors: string[]): StallSpot[] {
  const angles = layout.discs.map((d) => d.angle).sort((a, b) => a - b);
  const out: StallSpot[] = [];
  for (let i = 0; i < STALL_COUNT; i++) {
    const a0 = angles[i % angles.length];
    const a1 = angles[(i + 1) % angles.length] + (i + 1 >= angles.length ? Math.PI * 2 : 0);
    const a = (a0 + a1) / 2;
    const x = Math.cos(a) * STALL_R;
    const z = Math.sin(a) * STALL_R;
    out.push({ x: +x.toFixed(2), z: +z.toFixed(2), ry: Math.atan2(-Math.cos(a), -Math.sin(a)), color: colors[i % colors.length] });
  }
  return out;
}

export interface FingerpostSpot {
  x: number;
  z: number;
  arms: Array<{ text: string; color: string; yaw: number }>;
}

/** Seconds on foot from a post to a district's edge, at the kid's walking pace. */
export function walkSeconds(fx: number, fz: number, tx: number, tz: number): number {
  return Math.max(5, Math.round(Math.hypot(tx - fx, tz - fz) / 15 / 5) * 5);
}

/**
 * A fingerpost where each spoke leaves the plaza (one arm to its district,
 * one back to the plaza), plus the spawn totem: every neighborhood with its
 * walking time, so arrivals instantly see what's where.
 */
export function fingerpostSpots(
  layout: WorldLayout,
  districts: DisplayDistrict[],
  peopleLabel = "People",
): { posts: FingerpostSpot[]; totem: FingerpostSpot } {
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  const posts: FingerpostSpot[] = layout.discs.map((d) => {
    const x = Math.cos(d.angle) * 50;
    const z = Math.sin(d.angle) * 50;
    const info = bySlug.get(d.slug);
    const name = d.slug === "people" ? peopleLabel : (info?.short ?? d.slug);
    const color = d.slug === "people" ? "#8a8f98" : (info?.color ?? "#888888");
    const ex = d.x - Math.cos(d.angle) * d.r;
    const ez = d.z - Math.sin(d.angle) * d.r;
    return {
      x: +x.toFixed(2),
      z: +z.toFixed(2),
      arms: [
        { text: `${name} · ${walkSeconds(x, z, ex, ez)}s`, color, yaw: Math.atan2(ex - x, ez - z) },
        { text: "Plaza", color: "#54402c", yaw: Math.atan2(-x, -z) },
      ],
    };
  });
  const s = layout.spawn;
  const tx = s.x + 5;
  const tz = s.z + 3;
  const arms = layout.discs.map((d) => {
    const info = bySlug.get(d.slug);
    const name = d.slug === "people" ? peopleLabel : (info?.short ?? d.slug);
    const color = d.slug === "people" ? "#8a8f98" : (info?.color ?? "#888888");
    return {
      text: `${name} · ${walkSeconds(tx, tz, d.x, d.z)}s`,
      color,
      yaw: Math.atan2(d.x - tx, d.z - tz),
    };
  });
  return { posts, totem: { x: tx, z: tz, arms } };
}

/** The monument stands at the plaza's center, facing the spawn. */
export const MONUMENT = { x: 0, z: 0 } as const;
/** Lantern pylons on the monument's north arc (Ambition's bearings, our north = -z). */
const PYLON_R = 9.5;
const PYLON_BEARINGS = [-142, -108, -72, -38];
/** Market stalls ring the village street's south side, facing it. */
const STALL_R = 66;
const STALL_COUNT = 6;

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
