/* The hub as plain data: the publisher's building at the center of the walk world's plaza, and
   the Nexus portal beside it.

   The hub is a generic pavilion (not a model of any real building): a long glass hall on a low
   plinth, a smaller upper volume set back on its roof, a thin canopy over the entrance, two
   planters, and a pole on the upper roof carrying a sign with the publisher's logo (site.json
   org.logo), which turns to face the camera. A map that wants its own building replaces
   src/views/walk/hub.ts and this file together, keeping the exports.

   Pure (no three.js, no DOM), so the world builder, collisions, the follow camera, the minimap and
   the tests all read the same footprint. The hub's local frame is turned by HUB_ROT about y and
   moved to HUB_CENTER, as a three.js Group with rotation.y = HUB_ROT at (HUB_CENTER.x, 0,
   HUB_CENTER.z) would place it; +z is the front (south), toward the spawn. */
import { PLAZA_RADIUS, ROAD_WIDTH, type WorldLayout } from "./layout";

/** The building faces the spawn, due south of it. */
export const HUB_ROT = 0;
/** World position of the local origin (the hall's center): north of the plaza's center, so the spawn sees the whole front. */
export const HUB_CENTER = { x: 0, z: -8 } as const;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Every dimension in hub-local units (see the header). */
export const HUB = {
  /** The low plinth the building stands on. */
  plinth: { x0: -14, x1: 14, z0: -8.4, z1: 8.6, h: 0.35 },
  /** The glass hall: a flat roof inside a parapet. */
  hall: { x0: -13, x1: 13, z0: -7.5, z1: 7.5, deck: 7.0, parapet: 7.6 },
  /** The upper volume, set back toward the north-west corner of the hall's roof. */
  upper: { x0: -12.2, x1: 2.5, z0: -6.8, z1: 1.6, deck: 10.6, parapet: 11.1 },
  /** The entrance canopy over the front, on two slim posts. */
  canopy: { x0: -3.5, x1: 8.5, z0: 7.5, z1: 11.2, y: 4.0, top: 4.3, posts: [{ x: -2.9, z: 10.6 }, { x: 7.9, z: 10.6 }], r: 0.14 },
  /** The glazed band of the front face, between its corner piers. */
  glass: { x0: -11.6, x1: 11.6, y0: 0.6, y1: 6.2 },
  /** The doors in the glass, under the canopy. */
  doors: { x0: 0.8, x1: 4.2, h: 3.2 },
  /** Planters flanking the entrance, a walker's width and more off the plinth (no slot a walker could wedge into). */
  planters: [
    { x0: -10.5, x1: -6.0, z0: 9.7, z1: 11.2, h: 0.75 },
    { x0: 10.0, x1: 13.0, z0: 9.7, z1: 11.2, h: 0.75 },
  ],
  /** The pole on the upper roof carrying the logo sign (its head turns to face the camera). */
  beacon: { x: -6.5, z: -2.6, w: 12, h: 3.9, bottom: 13.4, top: 17.3 },
} as const;

/** The sign's top: the hub's highest point, for label placement. */
export const HUB_TOP = HUB.beacon.top;

/**
 * The Nexus portal on the plaza (src/views/walk/portal.ts): a ring standing on the plaza to the
 * front right of the hub, its face turned toward the spawn (0, 42) so an arrival sees it beside the
 * building. `facing` is the ring's rotation.y: its face points along (sin, cos) of it. Walking
 * through the ring opens the Nexus. In world units.
 */
export const PORTAL = { x: 16, z: 16, r: 3.4, depth: 0.9, facing: Math.atan2(-16, 26) } as const;

/* ---------------- frames ---------------- */

const COS = Math.cos(HUB_ROT);
const SIN = Math.sin(HUB_ROT);

/** Hub-local (x, z) to world (x, z). */
export function hubToWorld(lx: number, lz: number): { x: number; z: number } {
  return { x: HUB_CENTER.x + lx * COS + lz * SIN, z: HUB_CENTER.z - lx * SIN + lz * COS };
}

/** World (x, z) to hub-local (x, z). */
export function worldToHub(x: number, z: number): { x: number; z: number } {
  const dx = x - HUB_CENTER.x;
  const dz = z - HUB_CENTER.z;
  return { x: dx * COS - dz * SIN, z: dx * SIN + dz * COS };
}

/* ---------------- collision, camera ---------------- */

/** An oriented box: center, half sizes in its own frame, rotation.y, height. */
export interface HubBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  h: number;
}

function box(r: Rect, h: number): HubBox {
  const c = hubToWorld((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  return { x: c.x, z: c.z, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, rot: HUB_ROT, h };
}

/**
 * How far the building boxes stand proud of the walls. The avatar's arms and hat brim reach 0.46
 * from its center, past its 0.38 collision radius; with this pad a walker hugging a facade
 * sideways keeps its arms out of it.
 */
export const WALL_PAD = 0.22;

const pad = (r: Rect, d: number): Rect => ({ x0: r.x0 - d, x1: r.x1 + d, z0: r.z0 - d, z1: r.z1 + d });

/** Solid boxes the walker cannot enter: the building on its plinth, and the planters. */
export function hubBoxes(): HubBox[] {
  return [box(pad(HUB.plinth, WALL_PAD), HUB.upper.parapet), ...HUB.planters.map((p) => box(p, p.h))];
}

/** The portal's two posts (the walker passes between them, through the ring). */
export function portalPosts(): { x: number; z: number; r: number }[] {
  const ux = Math.cos(PORTAL.facing);
  const uz = -Math.sin(PORTAL.facing);
  return [-1, 1].map((s) => ({ x: PORTAL.x + ux * s * (PORTAL.r + 0.1), z: PORTAL.z + uz * s * (PORTAL.r + 0.1), r: 0.55 }));
}

export interface HubCircle {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** Small round obstacles: the canopy's posts and the portal's posts. */
export function hubColliders(): HubCircle[] {
  const out: HubCircle[] = HUB.canopy.posts.map((p) => {
    const c = hubToWorld(p.x, p.z);
    return { x: c.x, z: c.z, r: HUB.canopy.r + 0.1, h: HUB.canopy.top };
  });
  for (const p of portalPosts()) out.push({ ...p, h: PORTAL.r * 2 + 0.6 });
  return out;
}

/**
 * Circles the follow camera looks over (and fly-to framing avoids). They overreach the walls a
 * little; that only lifts the camera a touch early.
 */
export function hubBlockers(): HubCircle[] {
  const h = HUB.hall;
  const out: HubCircle[] = [];
  const n = 3;
  const step = (h.x1 - h.x0) / n;
  const r = Math.hypot(step / 2, (h.z1 - h.z0) / 2);
  for (let i = 0; i < n; i++) {
    const c = hubToWorld(h.x0 + step * (i + 0.5), 0);
    out.push({ x: c.x, z: c.z, r, h: i < 2 ? HUB.upper.parapet : h.parapet });
  }
  out.push({ x: PORTAL.x, z: PORTAL.z, r: PORTAL.r, h: PORTAL.r * 2 + 0.6 });
  return out;
}

/** The beacon sign in world space: the pole's foot (x, z, and its height on the roof), the sign's width and its bottom and top heights. */
export function hubBeacon(): { x: number; z: number; foot: number; w: number; y0: number; y1: number } {
  const b = HUB.beacon;
  const c = hubToWorld(b.x, b.z);
  return { x: c.x, z: c.z, foot: HUB.upper.parapet, w: b.w, y0: b.bottom, y1: b.top };
}

/* ---------------- the follow camera's floor over the building ---------------- */

/** A roof the follow camera stays above: a hub-local rectangle and the top of what stands on it. */
interface Roof extends Rect {
  h: number;
}

/** Clearance the camera keeps over a roof and beside its edge. */
const ROOF_MARGIN = 0.6;
/** Past that margin, the floor eases down to nothing over this band, so the camera never jumps. */
const ROOF_EASE = 3;

const ROOFS: Roof[] = [
  { ...HUB.hall, h: HUB.hall.parapet },
  { ...HUB.upper, h: HUB.upper.parapet },
  { x0: HUB.canopy.x0, x1: HUB.canopy.x1, z0: HUB.canopy.z0, z1: HUB.canopy.z1, h: HUB.canopy.top + 0.05 },
];

/**
 * The lowest height the follow camera may take at world (x, z): a margin over any hub roof the
 * point is above (or beside, within the margin), easing to 0 over a short band past its edge, so
 * the camera rises smoothly over the building instead of entering it at close zoom. Pure and
 * allocation-free (it runs every frame).
 */
export function hubRoofAt(x: number, z: number): number {
  const dx = x - HUB_CENTER.x;
  const dz = z - HUB_CENTER.z;
  const lx = dx * COS - dz * SIN;
  const lz = dx * SIN + dz * COS;
  let best = 0;
  for (let i = 0; i < ROOFS.length; i++) {
    const r = ROOFS[i];
    const ox = Math.max(r.x0 - lx, 0, lx - r.x1);
    const oz = Math.max(r.z0 - lz, 0, lz - r.z1);
    if (ox >= ROOF_MARGIN + ROOF_EASE || oz >= ROOF_MARGIN + ROOF_EASE) continue;
    const d = Math.sqrt(ox * ox + oz * oz);
    if (d >= ROOF_MARGIN + ROOF_EASE) continue;
    const t = d <= ROOF_MARGIN ? 1 : 1 - (d - ROOF_MARGIN) / ROOF_EASE;
    const floor = (r.h + ROOF_MARGIN) * t * t * (3 - 2 * t);
    if (floor > best) best = floor;
  }
  return best;
}

/** Does the segment from a to b (world, with heights) pass through a hub building box? */
export function segmentHitsHub(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  for (const b of HUB_SOLIDS) {
    if (segmentHitsBox(b, ax, ay, az, bx, by, bz)) return true;
  }
  return false;
}

/** Slab test of a segment against an oriented box standing on the ground (y 0..h). Allocation-free (runs every frame). */
export function segmentHitsBox(b: HubBox, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const lax = (ax - b.x) * c - (az - b.z) * s;
  const laz = (ax - b.x) * s + (az - b.z) * c;
  const lbx = (bx - b.x) * c - (bz - b.z) * s;
  const lbz = (bx - b.x) * s + (bz - b.z) * c;
  span.t0 = 0;
  span.t1 = 1;
  return clip(lax, lbx, -b.hx, b.hx) && clip(ay, by, 0, b.h) && clip(laz, lbz, -b.hz, b.hz);
}

const span = { t0: 0, t1: 1 };

/** Narrow span (the segment's live parameter range) to where p..q lies inside [lo, hi]; false once it is empty. */
function clip(p: number, q: number, lo: number, hi: number): boolean {
  const d = q - p;
  if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
  let ta = (lo - p) / d;
  let tb = (hi - p) / d;
  if (ta > tb) {
    const t = ta;
    ta = tb;
    tb = t;
  }
  if (ta > span.t0) span.t0 = ta;
  if (tb < span.t1) span.t1 = tb;
  return span.t0 <= span.t1;
}

/** The masses that can hide the walker, each to its own height: the hall and the upper volume. */
const HUB_SOLIDS: HubBox[] = [box(HUB.hall, HUB.hall.parapet + 0.1), box(HUB.upper, HUB.upper.parapet + 0.1)];

/* ---------------- footprint ---------------- */

/** Local corner rings of the masses, for the minimap and the clearance tests. */
export function hubFootprints(): { kind: "hall" | "upper" | "canopy"; pts: { x: number; z: number }[] }[] {
  const ring = (r: Rect) => [hubToWorld(r.x0, r.z0), hubToWorld(r.x1, r.z0), hubToWorld(r.x1, r.z1), hubToWorld(r.x0, r.z1)];
  return [
    { kind: "hall", pts: ring(HUB.hall) },
    { kind: "upper", pts: ring(HUB.upper) },
    { kind: "canopy", pts: ring(HUB.canopy) },
  ];
}

/** Distance from a world point to the nearest solid hub box (0 inside one). */
export function hubClearance(x: number, z: number): number {
  let best = Infinity;
  for (const b of hubBoxes()) {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = (x - b.x) * c - (z - b.z) * s;
    const lz = (x - b.x) * s + (z - b.z) * c;
    const dx = Math.max(0, Math.abs(lx) - b.hx);
    const dz = Math.max(0, Math.abs(lz) - b.hz);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return Math.min(best, Math.hypot(x - PORTAL.x, z - PORTAL.z) - PORTAL.r - 0.6);
}

/** Farthest reach of the site (footprints, canopy, planters, the portal) from the plaza center. */
export function hubSiteRadius(): number {
  let r = Math.hypot(PORTAL.x, PORTAL.z) + PORTAL.r + 0.6;
  for (const f of hubFootprints()) for (const p of f.pts) r = Math.max(r, Math.hypot(p.x, p.z));
  for (const b of hubBoxes()) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = sx * b.hx;
        const lz = sz * b.hz;
        const x = b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot);
        const z = b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot);
        r = Math.max(r, Math.hypot(x, z));
      }
  }
  return r;
}

/* ---------------- the plaza around it ---------------- */

/** Angles of the roads leaving the plaza, sorted. */
function roadAngles(layout: WorldLayout): number[] {
  return layout.discs.map((d) => d.angle).sort((a, b) => a - b);
}

/** Smallest distance from (x, z) to any road's center line (beyond the plaza center). */
export function roadDistance(layout: WorldLayout, x: number, z: number): number {
  let best = Infinity;
  for (const a of roadAngles(layout)) {
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const along = x * ux + z * uz;
    if (along < 0) continue;
    best = Math.min(best, Math.abs(-x * uz + z * ux));
  }
  return best;
}

/** Street lamps around the plaza rim: two per gap between roads (one where the gap is narrow), clear of the roads. */
export function plazaLamps(layout: WorldLayout): { x: number; z: number }[] {
  const r = PLAZA_RADIUS - 1.3;
  const angles = roadAngles(layout);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < angles.length; i++) {
    const a0 = angles[i];
    const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    const arc = (a1 - a0) * r;
    const fractions = arc > 16 ? [0.3, 0.7] : [0.5];
    for (const f of fractions) {
      const a = a0 + (a1 - a0) * f;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
  }
  return out;
}

/**
 * Benches and planters on a ring inside the lamps, alternating, each facing the hub. A slot is
 * skipped near a road (so road mouths stay open), near the spawn (so arrivals are not boxed in),
 * near the building or near the portal.
 */
export function plazaSeats(layout: WorldLayout): { x: number; z: number; kind: "bench" | "planter" }[] {
  const ringR = PLAZA_RADIUS - 5.5;
  const count = 28;
  const out: { x: number; z: number; kind: "bench" | "planter" }[] = [];
  const s = layout.spawn;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    const x = Math.cos(a) * ringR;
    const z = Math.sin(a) * ringR;
    if (roadDistance(layout, x, z) < ROAD_WIDTH / 2 + 2.6) continue;
    if (Math.hypot(x - s.x, z - s.z) < 8) continue;
    if (hubClearance(x, z) < 3) continue;
    out.push({ x, z, kind: i % 2 ? "bench" : "planter" });
  }
  return out;
}

/* ---------------- the screenshot harness frame ---------------- */

/** The hub frame for tools that frame it (the group transform, the hall's half sizes, the beacon and a circle around the whole site). */
export const HUB_FRAME = (() => {
  const h = HUB.hall;
  const x0 = HUB.plinth.x0;
  const x1 = HUB.plinth.x1;
  const z0 = HUB.plinth.z0;
  const z1 = HUB.canopy.z1;
  return {
    center: [HUB_CENTER.x, HUB_CENTER.z],
    rot: HUB_ROT,
    halfL: (h.x1 - h.x0) / 2,
    halfD: (h.z1 - h.z0) / 2,
    wallH: h.parapet,
    beacon: { x: HUB.beacon.x, z: HUB.beacon.z, top: HUB.beacon.top },
    site: { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 },
  };
})();
