/* The summer island's plan: where everything on it stands, worked out from the map's own world data
   (src/data/layout.ts: which districts, in what order, how big, and where each pin sits inside its
   district) and from the kid's scale and camera. One plan feeds everything: the ground's shape
   (mapGround.islandHeight), the meshes and props (mapWorld.ts), the overlay and its chips
   (mapOverlay.ts) and the minimap, so they always agree.

   The island, from the middle out: the monument on a paved plaza; the arrival a short walk from
   it, looking at it, with the Nexus portal and a "Walking times" board in view; a ring street just
   outside the plaza, with market stalls between the roads; one road out to each district, which
   sits on a ring as close in as its neighbors allow, its pins carried over from the layout; then
   grass and hills, a beach, and the sea.

   Pure data in, pure data out (no three.js, no DOM). mapLayout.test.ts checks every rule. */
import type { WorldLayout } from "../data/layout";
import { PIECE_INFO, PIECE_KINDS, type PieceKind } from "./pieces/kinds";

/** The kid is about this tall; everything is sized from it. */
export const KID = 1.8;
/** The follow camera: how far behind the kid it rides, its eye height, its vertical field of view, and the frame it fills. */
export const CAMERA = { back: 6.9, eye: 2.4, vfov: 45, aspect: 16 / 9 } as const;
/** The kid's walking pace, in units a second. */
export const WALK_PACE = 15;
/** Every road's width. */
export const ROAD_W = 6;
/** The portal ring's radius, and half the width of its base. */
export const PORTAL_R = 3.4;
export const PORTAL_HALF = PORTAL_R + 0.9;
/** How the plaza, the ring street, the districts and the shore are spaced. */
export const SPACING = {
  /** From the monument to the arrival. */
  spawn: 22,
  /** Paving kept behind the arrival, so the camera starts over the plaza. */
  behind: 9,
  /** From the plaza's edge to the ring street's center line, and the street's width. */
  street: 6,
  streetWidth: 6.4,
  /** Grass between the ring street and the nearest district's edge. */
  inset: 14,
  /** The least room between two neighboring districts, edge to edge. */
  between: 16,
  /** Grass and hills beyond the farthest district, then the beach's width. */
  land: 26,
  beach: 12,
} as const;
/** How far past the ring street's outer edge the market stalls stand; the town's flat ground ends a step behind them. */
export const STALL_OUT = 3.4;

/** The town's flat ground: the plaza, the ring street and the market stalls, out to a step behind them. */
export function townRadius(shape: { street: { r: number; width: number } }): number {
  return shape.street.r + shape.street.width / 2 + STALL_OUT + 3;
}
/** The lantern pylons on the monument's far side: their radius and bearings either side of the view. */
const PYLONS = { r: 9.5, bearings: [-53, -19, 19, 53] } as const;
/** The monument's paved pad. */
export const MONUMENT_PAD = 7;
/** How far out from a district's edge a hop lands on its road: far enough back that the camera frames the arch and the district through it. */
export const ENTRY_BACK = 8.5;
/** How far a district's paving reaches past its edge (its pins keep inside the edge). */
export const DISTRICT_PAVING = 3;

export interface Spot {
  x: number;
  z: number;
}

/** A spot and which way it faces: three.js rotation.y, so its local +z points along (sin f, cos f). */
export interface Facing extends Spot {
  facing: number;
}

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
  isPeople: boolean;
  /** Its bearing from the monument (atan2(z, x)). */
  angle: number;
  cx: number;
  cz: number;
  r: number;
  /** The arch at its plaza-side edge, facing the plaza. */
  sign: Facing;
  /** Where a hop lands: on its road just outside the arch, facing in. */
  entry: Facing;
  /** Its landmark: a tall banner mast just past its far edge, its board facing the plaza. */
  mast: Facing;
  pins: PinPlan[];
}

export interface SpokePlan {
  slug: string;
  color: string;
  /** From just inside the plaza's edge onto the district's paving. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface StallSpot {
  x: number;
  z: number;
  /** rotation.y facing the plaza (local +z toward it). */
  ry: number;
  color: string;
}

/** A fingerpost on the left of a road's mouth (seen from the plaza), its arm facing the plaza and pointing into the road. */
export interface FingerpostSpot extends Facing {
  slug: string;
  text: string;
  color: string;
}

export interface BoardRow {
  slug: string;
  text: string;
  color: string;
  seconds: number;
  /** Where it lies for someone reading the board: 0 straight on past the board, positive to their right (radians). */
  bearing: number;
}

export interface BoardPlan extends Facing {
  rows: BoardRow[];
}

export interface IslandPlan {
  /** Where the grass gives way to sand, where the sand meets the water, how far out the kid may walk, and how far the ground reaches under the sea. */
  land: number;
  water: number;
  walk: number;
  extent: number;
}

/** A set piece where it stands (what it looks like: pieces/models.ts). */
export interface PiecePlan extends Facing {
  kind: PieceKind;
  coast: boolean;
  /** The bearing of the wedge it stands in (radians, atan2(z, x)). */
  wedge: number;
  /** The ground it takes (a radius), and how far round it the ground is leveled for it (0 for none). */
  footprint: number;
  pad: number;
  /** How far it reaches out along the way it faces beyond its footprint (the pier's deck over the water). */
  reach: number;
}

export interface MapPlan {
  plaza: { r: number };
  street: { r: number; width: number };
  island: IslandPlan;
  monument: Facing;
  portal: Facing;
  pylons: Spot[];
  spawn: Facing;
  board: BoardPlan;
  clusters: ClusterPlan[];
  spokes: SpokePlan[];
  stalls: StallSpot[];
  posts: FingerpostSpot[];
  lamps: { plaza: Spot[]; roads: Spot[]; street: Spot[] };
  /** Parasols and sandcastles on the east beach (where the sound turns to waves), clear of the coastal set pieces. */
  beach: Facing[];
  /** The set pieces: one on the shore and one in the hills in each wedge between districts. */
  pieces: PiecePlan[];
  critters: { cats: Facing; sloth: Facing };
}

export interface DisplayDistrict {
  slug: string;
  label: string;
  short: string;
  color: string;
}

/** What the people area is called and colored (site.json labels; never a district color). */
export interface PeopleLook {
  label: string;
  color: string;
}

const TAU = Math.PI * 2;
const round = (v: number) => Math.round(v * 100) / 100;
const spot = (x: number, z: number): Spot => ({ x: round(x), z: round(z) });
/** rotation.y that turns local +z from (x, z) toward (tx, tz). */
export const faceToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
/** An angle brought into (-pi, pi]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Seconds on foot between two spots at the kid's pace, to the nearest second (never under 1). */
export function walkSeconds(fx: number, fz: number, tx: number, tz: number): number {
  return Math.max(1, Math.round(Math.hypot(tx - fx, tz - fz) / WALK_PACE));
}

/** How far (x, z) is from the segment a-b. */
export function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** The camera's horizontal half field of view, in radians, for the frame CAMERA describes. */
export function halfFov(aspect: number = CAMERA.aspect): number {
  return Math.atan(Math.tan(((CAMERA.vfov / 2) * Math.PI) / 180) * aspect);
}

/** Where the follow camera stands for a kid at `s` (behind it, opposite the way it faces). */
export function cameraAt(s: Facing): Spot {
  return { x: s.x - Math.sin(s.facing) * CAMERA.back, z: s.z - Math.cos(s.facing) * CAMERA.back };
}

/**
 * How far off the camera's center line a thing at (x, z) with half-width `half` reaches, at its
 * outer edge (radians): within halfFov() it is in the frame.
 */
export function offAxis(view: Facing, x: number, z: number, half = 0): number {
  const cam = cameraAt(view);
  const d = Math.hypot(x - cam.x, z - cam.z);
  const center = Math.abs(wrapAngle(Math.atan2(x - cam.x, z - cam.z) - view.facing));
  return center + Math.atan2(half, d);
}

/** The ring the districts sit on: as close in as the ring street allows and their neighbors leave room for. */
export function districtRing(layout: WorldLayout, streetR: number): number {
  const discs = layout.discs.slice().sort((a, b) => a.angle - b.angle);
  const rMax = discs.reduce((m, d) => Math.max(m, d.r), 0);
  let ring = streetR + SPACING.streetWidth / 2 + SPACING.inset + rMax;
  if (discs.length > 1) {
    discs.forEach((d, i) => {
      const n = discs[(i + 1) % discs.length];
      const gap = Math.min(Math.PI, (i + 1 < discs.length ? n.angle : n.angle + TAU) - d.angle);
      ring = Math.max(ring, (d.r + n.r + SPACING.between) / (2 * Math.sin(gap / 2)));
    });
  }
  return round(ring);
}

interface Walk {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** The straight walks from the arrival to each road's mouth and to the monument: nothing big stands on them. */
function arrivalWalks(spawn: Spot, mouths: Spot[]): Walk[] {
  return [...mouths, { x: 0, z: 0 }].map((m) => ({ ax: spawn.x, az: spawn.z, bx: m.x, bz: m.z }));
}

const clearOf = (walks: Walk[], x: number, z: number, room: number) => walks.every((w) => segmentDistance(x, z, w.ax, w.az, w.bx, w.bz) >= room);

/** How far the walks from the arrival keep from the portal's middle: they pass outside its ring and posts. */
export const PORTAL_WALK_ROOM = PORTAL_HALF + 0.5;

/**
 * The Nexus portal: on the plaza, in the arrival's view (its whole ring inside the frame, off to one
 * side of the monument), clear of the monument, the pylons and every walk from the arrival. Searched
 * on a grid around the monument, preferring about 18 degrees off the view and 24 units from the
 * camera. Null when no spot keeps every rule.
 */
export function portalSpot(spawn: Facing, plazaR: number, pylons: Spot[], walks: Walk[]): { spot: Facing; cost: number } | null {
  const limit = halfFov() - 0.1;
  const cam = cameraAt(spawn);
  let best: { spot: Facing; cost: number } | null = null;
  for (let r = MONUMENT_PAD + PORTAL_HALF + 2; r <= plazaR - PORTAL_HALF - 1; r += 1) {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (pylons.some((p) => Math.hypot(p.x - x, p.z - z) < PORTAL_HALF + 2.6)) continue;
      if (!clearOf(walks, x, z, PORTAL_WALK_ROOM)) continue;
      if (offAxis(spawn, x, z, PORTAL_HALF) > limit) continue;
      const cost = (offAxis(spawn, x, z, 0) - 0.31) ** 2 * 40 + (Math.hypot(x - cam.x, z - cam.z) - 24) ** 2 * 0.02;
      if (!best || cost < best.cost - 1e-9) best = { spot: { x: round(x), z: round(z), facing: faceToward(x, z, spawn.x, spawn.z) }, cost };
    }
  }
  return best;
}

/**
 * The Walking times board: a few steps ahead of the arrival on the side away from the portal,
 * turned to face it, beside (not on) the walk to the monument and as clear of the other walks as
 * the plaza allows.
 */
export function boardSpot(spawn: Facing, portal: Spot, walks: Walk[]): Facing {
  const fx = Math.sin(spawn.facing);
  const fz = Math.cos(spawn.facing);
  // The arrival's right is (-fz, fx); the board goes to the side the portal is not on.
  const portalSide = Math.sign((portal.x - spawn.x) * -fz + (portal.z - spawn.z) * fx) || 1;
  const side = -portalSide;
  let best: Facing | null = null;
  let bestCost = Infinity;
  for (let ahead = 7.5; ahead <= 11.5; ahead += 0.5) {
    for (let lateral = 3.5; lateral <= 6; lateral += 0.5) {
      const x = spawn.x + fx * ahead - fz * lateral * side;
      const z = spawn.z + fz * ahead + fx * lateral * side;
      const room = walks.reduce((m, w) => Math.min(m, segmentDistance(x, z, w.ax, w.az, w.bx, w.bz)), Infinity);
      const cost = -Math.min(room, 3) * 4 + Math.abs(ahead - 9.5) + Math.abs(lateral - 4.5);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: round(x), z: round(z), facing: faceToward(x, z, spawn.x, spawn.z) };
      }
    }
  }
  return best!;
}

/** Where a district lies for someone reading the board (0 straight on past it, positive to the right). */
export function readerBearing(board: Facing, x: number, z: number): number {
  // The reader faces the board: forward is the board's -z, their right is (-fz, fx) of that forward.
  const fx = -Math.sin(board.facing);
  const fz = -Math.cos(board.facing);
  const dx = x - board.x;
  const dz = z - board.z;
  return Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
}

interface Arrival {
  spawn: Facing;
  pylons: Spot[];
  walks: Walk[];
  portal: Facing;
}

/** The lantern pylons on the monument's far side from an arrival looking along `heading`. */
function pylonsFor(heading: number): Spot[] {
  return PYLONS.bearings.map((deg) => {
    const a = heading + (deg * Math.PI) / 180;
    return spot(Math.cos(a) * PYLONS.r, Math.sin(a) * PYLONS.r);
  });
}

/** Of the districts' masts, how many the arrival sees in frame, and how many hide behind the monument. */
export function mastsSeen(spawn: Facing, masts: readonly Spot[]): { inFrame: number; hidden: number } {
  const cam = cameraAt(spawn);
  // The obelisk's shaft, seen from the camera, plus a mast's banner.
  const shaft = Math.atan2(1.3, Math.hypot(cam.x, cam.z)) + 0.02;
  let inFrame = 0;
  let hidden = 0;
  for (const m of masts) {
    const off = offAxis(spawn, m.x, m.z, 1.2);
    if (off > halfFov() - 0.04) continue;
    if (offAxis(spawn, m.x, m.z, 0) < shaft) hidden++;
    else inFrame++;
  }
  return { inFrame, hidden };
}

/**
 * Where the arrival stands and looks, and the portal and pylons that go with it. The arrival always
 * looks straight at the monument from SPACING.spawn away; which way round is searched: toward each
 * district, a little either side of it, or down the middle of each gap. The choice keeps the portal
 * in full view and off every walk, shows as many districts' masts as it can with none behind the
 * monument, and otherwise stays close to the way the map's own layout faces its arrival.
 */
function arrival(layout: WorldLayout, clusters: ClusterPlan[], mouths: Spot[], plazaR: number): Arrival {
  const want = Math.atan2(Math.cos(layout.spawn.facing), Math.sin(layout.spawn.facing));
  const angles = clusters.map((c) => c.angle).sort((a, b) => a - b);
  const candidates: number[] = [];
  for (const a of angles) for (const d of [0, 4, -4, 8, -8, 12, -12, 16, -16]) candidates.push(wrapAngle(a + (d * Math.PI) / 180));
  angles.forEach((a, i) => candidates.push(wrapAngle((a + (i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU)) / 2)));
  if (!candidates.length) candidates.push(want);
  const masts = clusters.map((c) => c.mast);
  let best: (Arrival & { cost: number }) | null = null;
  for (const heading of candidates) {
    const xz = spot(-Math.cos(heading) * SPACING.spawn, -Math.sin(heading) * SPACING.spawn);
    const spawn: Facing = { ...xz, facing: faceToward(xz.x, xz.z, 0, 0) };
    const pylons = pylonsFor(heading);
    const walks = arrivalWalks(spawn, mouths);
    const found = portalSpot(spawn, plazaR, pylons, walks);
    const seen = mastsSeen(spawn, masts);
    const cost = (found ? found.cost : 1000) + seen.hidden * 30 - Math.min(seen.inFrame, 3) * 10 + Math.abs(wrapAngle(heading - want)) * 4;
    if (!best || cost < best.cost - 1e-9) {
      const portal = found?.spot ?? { x: round(MONUMENT_PAD + PORTAL_HALF + 3), z: 0, facing: faceToward(MONUMENT_PAD + PORTAL_HALF + 3, 0, spawn.x, spawn.z) };
      best = { spawn, pylons, walks, portal, cost };
    }
  }
  return best!;
}

export function planFromLayout(layout: WorldLayout, districts: DisplayDistrict[], people: PeopleLook = { label: "People", color: "#8a8f98" }): MapPlan {
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  const look = (slug: string) => {
    if (slug === "people") return { label: people.label, short: people.label, color: people.color };
    const d = bySlug.get(slug);
    return { label: d?.label ?? slug, short: d?.short ?? slug, color: d?.color ?? "#888888" };
  };

  const plazaR = SPACING.spawn + SPACING.behind;
  const streetR = plazaR + SPACING.street;
  const ring = districtRing(layout, streetR);

  // The districts, moved onto the ring along their own bearings; their pins move with them.
  const clusters: ClusterPlan[] = layout.discs.map((disc) => {
    const a = disc.angle;
    const cx = round(Math.cos(a) * ring);
    const cz = round(Math.sin(a) * ring);
    const dx = cx - disc.x;
    const dz = cz - disc.z;
    const pins: PinPlan[] = [];
    for (const pin of layout.pins.values()) {
      if (pin.district === disc.slug) pins.push({ slug: pin.slug, district: pin.district, ...spot(pin.x + dx, pin.z + dz) });
    }
    pins.sort((p, q) => (p.slug < q.slug ? -1 : 1));
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const signXZ = spot(cx - ox * (disc.r + 2.5), cz - oz * (disc.r + 2.5));
    const entryXZ = spot(cx - ox * (disc.r + ENTRY_BACK), cz - oz * (disc.r + ENTRY_BACK));
    const mastXZ = spot(cx + ox * (disc.r + 2.5), cz + oz * (disc.r + 2.5));
    return {
      slug: disc.slug,
      ...look(disc.slug),
      count: disc.count,
      isPeople: disc.slug === "people",
      angle: a,
      cx,
      cz,
      r: disc.r,
      sign: { ...signXZ, facing: faceToward(signXZ.x, signXZ.z, 0, 0) },
      entry: { ...entryXZ, facing: faceToward(entryXZ.x, entryXZ.z, cx, cz) },
      mast: { ...mastXZ, facing: faceToward(mastXZ.x, mastXZ.z, 0, 0) },
      pins,
    };
  });

  // One road out to each district, from just inside the plaza's edge onto the district's paving (which
  // reaches DISTRICT_PAVING past its pins), so no road runs between the pins.
  const spokes: SpokePlan[] = clusters.map((c) => {
    const ox = Math.cos(c.angle);
    const oz = Math.sin(c.angle);
    const end = c.r + DISTRICT_PAVING - 2;
    return { slug: c.slug, color: c.color, ax: round(ox * (plazaR - 3)), az: round(oz * (plazaR - 3)), bx: round(c.cx - ox * end), bz: round(c.cz - oz * end) };
  });
  const mouths = clusters.map((c) => spot(Math.cos(c.angle) * plazaR, Math.sin(c.angle) * plazaR));
  const { spawn, pylons, walks, portal } = arrival(layout, clusters, mouths, plazaR);
  const monument: Facing = { x: 0, z: 0, facing: faceToward(0, 0, spawn.x, spawn.z) };
  const boardAt = boardSpot(spawn, portal, walks);
  const board: BoardPlan = {
    ...boardAt,
    rows: clusters
      .map((c) => ({ slug: c.slug, text: c.short, color: c.color, seconds: walkSeconds(boardAt.x, boardAt.z, c.entry.x, c.entry.z), bearing: readerBearing(boardAt, c.cx, c.cz) }))
      .sort((p, q) => p.bearing - q.bearing),
  };

  // The gaps between roads, going round: stalls outside the ring street, lamps on the plaza's edge.
  const sorted = clusters.map((c) => c.angle).sort((p, q) => p - q);
  const gaps = sorted.map((a, i) => (a + (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU)) / 2);
  if (sorted.length === 1) gaps[0] = sorted[0] + Math.PI;
  const stallR = streetR + SPACING.streetWidth / 2 + STALL_OUT;
  const stallColors = [...clusters.filter((c) => !c.isPeople).map((c) => c.color), "#f3e8cf"];
  const stalls: StallSpot[] = gaps.map((a, i) => ({ ...spot(Math.cos(a) * stallR, Math.sin(a) * stallR), ry: Math.atan2(-Math.cos(a), -Math.sin(a)), color: stallColors[i % stallColors.length] }));
  // (None where the arrival's camera starts, so it never opens on a lamp post.)
  const cam = cameraAt(spawn);
  const plazaLamps = gaps.map((a) => spot(Math.cos(a) * (plazaR - 1.2), Math.sin(a) * (plazaR - 1.2))).filter((l) => Math.hypot(l.x - cam.x, l.z - cam.z) > 5);

  // Lamps along each road (either side, staggered) and round the ring street's outer edge, off every road.
  const roadLamps: Spot[] = [];
  for (const s of spokes) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ox = (s.bx - s.ax) / len;
    const oz = (s.bz - s.az) / len;
    [0.38, 0.74].forEach((t, k) => {
      const side = k % 2 ? 1 : -1;
      const off = ROAD_W / 2 + 1.6;
      roadLamps.push(spot(s.ax + (s.bx - s.ax) * t - oz * off * side, s.az + (s.bz - s.az) * t + ox * off * side));
    });
  }
  const streetLampR = streetR + SPACING.streetWidth / 2 + 0.9;
  const streetLamps: Spot[] = [];
  const n = Math.max(6, Math.round((TAU * streetLampR) / 15));
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * TAU;
    const p = spot(Math.cos(a) * streetLampR, Math.sin(a) * streetLampR);
    if (clusters.some((c) => Math.abs(wrapAngle(a - c.angle)) * streetLampR < ROAD_W / 2 + 2.5)) continue;
    if (stalls.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 4.5)) continue;
    streetLamps.push(p);
  }

  // Fingerposts where each road leaves the plaza, on its left as you head out, the arm facing the
  // plaza and pointing into the road: the district and its time on foot.
  const posts: FingerpostSpot[] = clusters.map((c) => {
    const ox = Math.cos(c.angle);
    const oz = Math.sin(c.angle);
    const off = ROAD_W / 2 + 1.5;
    const p = spot(ox * (plazaR + 1.5) + oz * off, oz * (plazaR + 1.5) - ox * off);
    return { ...p, facing: Math.atan2(-ox, -oz), slug: c.slug, text: `${c.short} · ${walkSeconds(p.x, p.z, c.entry.x, c.entry.z)}s`, color: c.color };
  });

  // The island: grass and hills past the farthest district, then the beach and the sea.
  const reach = clusters.reduce((m, c) => Math.max(m, Math.hypot(c.cx, c.cz) + c.r), plazaR);
  const land = round(reach + SPACING.land);
  const water = round(land + SPACING.beach);
  const island: IslandPlan = { land, water, walk: round(water - 4), extent: round(water + 26) };

  // The cats sit beside the first stall; the sloth lounges on the grass in the gap nearest the west.
  const s0 = stalls[0] ?? { x: stallR, z: 0, ry: 0 };
  const catsXZ = spot(s0.x + Math.cos(s0.ry) * 3, s0.z - Math.sin(s0.ry) * 3);
  const west = gaps.reduce((b, a) => (Math.abs(wrapAngle(a - Math.PI)) < Math.abs(wrapAngle(b - Math.PI)) ? a : b), gaps[0] ?? Math.PI);
  const slothR = (streetR + SPACING.streetWidth / 2 + ring - clusters.reduce((m, c) => Math.max(m, c.r), 0)) / 2;
  const slothXZ = spot(Math.cos(west) * slothR, Math.sin(west) * slothR);

  // The set pieces, one on the shore and one in the hills of each wedge; then the parasols and
  // sandcastles on the east beach, between the grass and the water, clear of the shore's pieces.
  const pieces = piecesFor({ gaps: gaps.map(wrapAngle), island, town: townRadius({ street: { r: streetR, width: SPACING.streetWidth } }), clusters, spokes, keepOff: [catsXZ, slothXZ] });
  const beach = beachFor(island, pieces);

  return {
    plaza: { r: plazaR },
    street: { r: streetR, width: SPACING.streetWidth },
    island,
    monument,
    portal,
    pylons,
    spawn,
    board,
    clusters,
    spokes,
    stalls,
    posts,
    lamps: { plaza: plazaLamps, roads: roadLamps, street: streetLamps },
    beach,
    pieces,
    critters: {
      cats: { ...catsXZ, facing: faceToward(catsXZ.x, catsXZ.z, 0, 0) },
      sloth: { ...slothXZ, facing: faceToward(slothXZ.x, slothXZ.z, 0, 0) },
    },
  };
}

/* ---------------- set pieces ---------------- */

/** How far up the beach from the grass's edge a coastal piece stands: room in front to walk along the water. */
export const COAST_IN = 1.5;
/** A cove behind a coastal piece (mapGround.coveAt): its size inland of the piece; its floor is level to FLAT of that, and its bank runs on to REACH. */
export const COVE_BACK = 20;
export const COVE_FLAT = 0.5;
export const COVE_REACH = 1.6;
/** How far the pier's deck reaches out to sea from where it stands. */
const PIER_REACH = 34;

/** How far (x, z) is from a piece: from its footprint's middle, or from its deck for one that reaches out to sea. */
export function pieceDistance(p: Pick<PiecePlan, "x" | "z" | "facing" | "reach">, x: number, z: number): number {
  if (!p.reach) return Math.hypot(x - p.x, z - p.z);
  return segmentDistance(x, z, p.x, p.z, p.x + Math.sin(p.facing) * p.reach, p.z + Math.cos(p.facing) * p.reach);
}

/** The compass places of the landmarks: the lighthouse to the north (-z), the pier to the east, the windmill to the west. */
const COMPASS: Partial<Record<PieceKind, number>> = { lighthouse: -Math.PI / 2, pier: 0, windmill: Math.PI };

/**
 * The kinds for the wedges at bearings `wedges`, coastal or inland: each landmark in the wedge nearest
 * its compass point, then every other kind once in order, then the ones that may repeat, by turns.
 */
export function wedgeKinds(wedges: readonly number[], coast: boolean): (PieceKind | null)[] {
  const kinds = PIECE_KINDS.filter((k) => PIECE_INFO[k].coast === coast);
  const again = kinds.filter((k) => !PIECE_INFO[k].once);
  const out: (PieceKind | null)[] = wedges.map(() => null);
  for (const k of kinds) {
    const bearing = COMPASS[k];
    if (bearing === undefined) continue;
    let best = -1;
    wedges.forEach((a, i) => {
      if (out[i] === null && (best < 0 || Math.abs(wrapAngle(a - bearing)) < Math.abs(wrapAngle(wedges[best] - bearing)))) best = i;
    });
    if (best >= 0) out[best] = k;
  }
  const rest = kinds.filter((k) => COMPASS[k] === undefined);
  let next = 0;
  let turn = 0;
  const order = wedges.map((_, i) => i).sort((i, j) => wedges[i] - wedges[j]);
  for (const i of order) {
    if (out[i] !== null) continue;
    if (next < rest.length) out[i] = rest[next++];
    else if (again.length) out[i] = again[turn++ % again.length];
  }
  return out;
}

interface PieceGround {
  gaps: readonly number[];
  island: IslandPlan;
  /** The town's flat ground's radius. */
  town: number;
  clusters: readonly ClusterPlan[];
  spokes: readonly SpokePlan[];
  /** Other things the inland pieces keep clear of (the animals). */
  keepOff: readonly Spot[];
}

/**
 * Where the set pieces stand. Each wedge between two districts gets one piece on the shore, in the
 * middle of the wedge, a few steps up the beach and facing the sea, and one in the hills, facing the
 * plaza: the spot along the wedge (or a little either side) with the most room, clear of the town,
 * every district's paving, road and mast, the animals, the beach and every other piece. A wedge with
 * no such spot goes without its inland piece.
 */
export function piecesFor(g: PieceGround): PiecePlan[] {
  const { island } = g;
  const out: PiecePlan[] = [];
  const coastKinds = wedgeKinds(g.gaps, true);
  g.gaps.forEach((a, i) => {
    const kind = coastKinds[i];
    if (!kind) return;
    const r = island.land + COAST_IN;
    const at = spot(Math.cos(a) * r, Math.sin(a) * r);
    out.push({ ...at, facing: Math.atan2(Math.cos(a), Math.sin(a)), kind, coast: true, wedge: a, footprint: PIECE_INFO[kind].footprint, pad: PIECE_INFO[kind].pad, reach: kind === "pier" ? PIER_REACH : 0 });
  });
  const inlandKinds = wedgeKinds(g.gaps, false);
  const masts = g.clusters.map((c) => c.mast);
  g.gaps.forEach((a, i) => {
    const kind = inlandKinds[i];
    if (!kind) return;
    const fp = PIECE_INFO[kind].footprint;
    const want = island.land - 24;
    let best: { x: number; z: number; score: number } | null = null;
    for (let r = Math.ceil(g.town + 4 + fp); r <= island.land - 8 - fp; r += 1) {
      for (const d of [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.25, -0.25, 0.3, -0.3]) {
        const b = a + d;
        const x = Math.cos(b) * r;
        const z = Math.sin(b) * r;
        let room = Infinity;
        for (const c of g.clusters) room = Math.min(room, Math.hypot(x - c.cx, z - c.cz) - c.r - DISTRICT_PAVING - 7);
        for (const m of masts) room = Math.min(room, Math.hypot(x - m.x, z - m.z) - 4);
        for (const s of g.spokes) room = Math.min(room, segmentDistance(x, z, s.ax, s.az, s.bx, s.bz) - ROAD_W / 2 - 3);
        for (const k of g.keepOff) room = Math.min(room, Math.hypot(x - k.x, z - k.z) - 4);
        for (const p of out) room = Math.min(room, pieceDistance(p, x, z) - p.footprint - (p.coast ? 4 : 6));
        room -= fp;
        if (room < 0) continue;
        const score = Math.min(room, 4) - Math.abs(d) * 20 - Math.abs(r - want) * 0.1;
        if (!best || score > best.score + 1e-9) best = { x, z, score };
      }
    }
    if (!best) return;
    const at = spot(best.x, best.z);
    out.push({ ...at, facing: faceToward(at.x, at.z, 0, 0), kind, coast: false, wedge: a, footprint: fp, pad: PIECE_INFO[kind].pad, reach: 0 });
  });
  return out;
}

/**
 * The parasols and sandcastles on the east beach, between the grass and the water: each as near as it
 * can be to its own bearing in the open east, clear of the coastal pieces and of each other.
 */
export function beachFor(island: IslandPlan, pieces: readonly PiecePlan[]): Facing[] {
  const r = (island.land + island.walk) / 2;
  const shore = pieces.filter((p) => p.coast);
  const out: Facing[] = [];
  [-0.2, -0.07, 0.07, 0.2].forEach((want, i) => {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (let k = 0; k <= 110; k++) {
      const a = -0.55 + k * 0.01;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (shore.some((q) => pieceDistance(q, p.x, p.z) < q.footprint + 4)) continue;
      if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 7)) continue;
      if (Math.abs(a - want) < bestD) {
        bestD = Math.abs(a - want);
        best = p;
      }
    }
    if (!best) return;
    const at = spot(best.x, best.z);
    out.push({ ...at, facing: round(faceToward(at.x, at.z, 0, 0) + (i % 2 ? 0.3 : -0.3)) });
  });
  return out;
}

/* ---------------- hopping ---------------- */

/** The Portfolio Map Network's colors: the portal's, never a district's. */
export const NEXUS_COLORS = { cyan: "#3ee6ff", violet: "#8b5cf6" } as const;

export interface HopTarget {
  id: string;
  label: string;
  kind: "district" | "portal" | "plaza";
  color: string;
  /** Where the place is (for the minimap), and where a hop lands, facing what the visitor came for. */
  x: number;
  z: number;
  r: number;
  land: Facing;
}

/** Every place a chip or the minimap can hop to: each district, the portal, the plaza. */
export function hopTargets(plan: MapPlan, labels: { portal: string; plaza: string }): HopTarget[] {
  const p = plan.portal;
  // In front of the portal, facing it, a few steps short of its curtain.
  const front = spot(p.x + Math.sin(p.facing) * 6, p.z + Math.cos(p.facing) * 6);
  return [
    ...plan.clusters.map((c): HopTarget => ({ id: c.slug, label: c.label, kind: "district", color: c.color, x: c.cx, z: c.cz, r: c.r, land: c.entry })),
    { id: "portal", label: labels.portal, kind: "portal", color: NEXUS_COLORS.violet, x: p.x, z: p.z, r: PORTAL_HALF, land: { ...front, facing: faceToward(front.x, front.z, p.x, p.z) } },
    { id: "plaza", label: labels.plaza, kind: "plaza", color: "#a89a7c", x: 0, z: 0, r: MONUMENT_PAD, land: plan.spawn },
  ];
}

/** The hop target nearest (x, z), if one is within `reach` of its edge. */
export function nearestHop(targets: readonly HopTarget[], x: number, z: number, reach: number): HopTarget | null {
  let best: HopTarget | null = null;
  let bestD = reach;
  for (const t of targets) {
    const d = Math.max(0, Math.hypot(t.x - x, t.z - z) - t.r);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The kid's facing (its spherical theta) for a spot's facing: theta 0 faces -z, so theta = facing + pi. */
export const kidTheta = (facing: number) => wrapAngle(facing + Math.PI);

/** The district (or people area) the kid is standing in, if any. */
export function clusterAt(plan: MapPlan, x: number, z: number): ClusterPlan | null {
  for (const c of plan.clusters) if (Math.hypot(x - c.cx, z - c.cz) <= c.r + 3) return c;
  return null;
}

/* ---------------- the minimap's frame ---------------- */

export interface MapFrame {
  /** World units from the island's middle to the map's edge. */
  extent: number;
  size: number;
  toMap(x: number, z: number): [number, number];
  toWorld(px: number, py: number): Spot;
}

/** North-up (-z up) frame for a minimap `size` CSS pixels square, showing the island and a little sea. */
export function mapFrame(plan: MapPlan, size: number): MapFrame {
  const extent = plan.island.water + 6;
  const h = size / 2;
  return {
    extent,
    size,
    toMap: (x, z) => [h + (x / extent) * h, h + (z / extent) * h],
    toWorld: (px, py) => ({ x: ((px - h) / h) * extent, z: ((py - h) / h) * extent }),
  };
}

/** The minimap arrow's clockwise turn (radians) for the kid's theta: forward is (-sin t, -cos t), up on the map is -z. */
export const arrowTurn = (theta: number) => -theta;
