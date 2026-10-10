/* Where each world stands in the Nexus. Hand-written and deterministic, unit-tested.

   Every instance in the registry gets a slot on a golden-angle (Vogel) spiral around the core,
   in the order the instances joined (then by id): older maps keep their place as new ones join
   further out, and a map that drops out of the world leaves its slot empty rather than moving
   everyone after it. A hash of the id lifts each world a little above or below the disc, and the
   disc is tilted, so the network reads as a space rather than a chart.

   The spiral keeps neighbors about LAYOUT.spacing * 1.65 apart; worlds are at most
   2 * LAYOUT.maxRadius wide, so a gap of several units always separates two worlds and their
   labels. A world's size grows with the square root of its company count, within bounds. */
import { fnv1a } from "./hash.ts";

export interface LayoutInput {
  id: string;
  /** YYYY-MM-DD; the registry's join date. */
  joined: string;
  companies: number;
}

export interface Placement {
  id: string;
  /** The spiral slot (0 = closest to the core). */
  slot: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const LAYOUT = {
  /** The core's radius, in world units. */
  coreRadius: 3.2,
  /** Distance of the first slot from the core. */
  firstRing: 22,
  /** The spiral's scale: slot k sits at spacing * sqrt(k + k0). */
  spacing: 8.4,
  /** How far above or below the disc a world may sit. */
  lift: 2.2,
  /** The disc's tilt around the x axis, in radians. */
  tilt: 0.12,
  minRadius: 1.6,
  maxRadius: 4.4,
  /** A world reaches maxRadius at this many companies. */
  fullAt: 400,
} as const;

/** A world's radius from its company count: minRadius for none, growing with the square root. */
export function worldRadius(companies: number): number {
  const n = Math.max(0, Number.isFinite(companies) ? companies : 0);
  const k = Math.sqrt(n) / Math.sqrt(LAYOUT.fullAt);
  return k >= 1 ? LAYOUT.maxRadius : LAYOUT.minRadius + (LAYOUT.maxRadius - LAYOUT.minRadius) * k;
}

function byJoinThenId(a: LayoutInput, b: LayoutInput): number {
  if (a.joined !== b.joined) return a.joined < b.joined ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A slot's place on the disc before the tilt. */
function slotPoint(slot: number): { x: number; z: number } {
  const k0 = (LAYOUT.firstRing / LAYOUT.spacing) ** 2;
  const r = LAYOUT.spacing * Math.sqrt(slot + k0);
  const a = slot * GOLDEN_ANGLE;
  return { x: r * Math.cos(a), z: r * Math.sin(a) };
}

/** Placements for every input, in the inputs' order. Ids must be unique. */
export function layoutWorlds(items: readonly LayoutInput[]): Placement[] {
  const order = [...items].sort(byJoinThenId);
  const slotOf = new Map(order.map((it, i) => [it.id, i]));
  const cos = Math.cos(LAYOUT.tilt);
  const sin = Math.sin(LAYOUT.tilt);
  return items.map((it) => {
    const slot = slotOf.get(it.id) ?? 0;
    const { x, z } = slotPoint(slot);
    const h = fnv1a(it.id);
    const y = ((h & 0xffff) / 0xffff - 0.5) * 2 * LAYOUT.lift;
    // Tilt the disc around the x axis.
    return { id: it.id, slot, x, y: y * cos - z * sin, z: y * sin + z * cos, radius: worldRadius(it.companies) };
  });
}

/** The farthest any placed world reaches from the core, on the disc (for camera framing). */
export function extent(placements: readonly Placement[]): number {
  let r = LAYOUT.coreRadius * 3;
  for (const p of placements) r = Math.max(r, Math.hypot(p.x, p.y, p.z) + p.radius);
  return r;
}
