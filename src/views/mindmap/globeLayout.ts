/* Deterministic geometry for the company globe.

   Every company is a node on the surface of one sphere. Each industry
   district owns a contiguous region of that sphere (a spherical cap, like
   a continent) sized by its company count, and its companies sit inside it on
   a spherical sunflower with even spacing around a small central clearing
   that holds the district's hub marker and label.

   Region centers start on a Rakhmanov-Saff-Zhou spiral in DISTRICTS order
   (so consecutive districts are neighbors on the sphere) and are then
   pushed apart until no two caps overlap. If the companies ever need more
   room than the sphere offers, node spacing shrinks until they fit.

   Everything is in the globe's local frame on the unit sphere: multiply by
   the globe radius to get world units. The spiral runs from local +Y (top)
   to -Y (bottom); the scene tilts that axis slightly and spins around it.

   Regions group companies by industry. They are not places, and nothing here
   encodes where a company is located. Pure functions, unit-tested. */
import type { District, DistrictSlug, Company } from "../../data/types";

export type Vec3 = [number, number, number];

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface GlobeLayoutOptions {
  /** Minimum angular separation between two company nodes, radians. */
  spacing?: number;
  /** Angular gap kept between neighboring regions, as a multiple of spacing. */
  gap?: number;
  /** Radius of each region's central clearing, as a multiple of spacing. */
  clearing?: number;
  /** Largest share of the sphere the regions may cover before spacing shrinks. */
  maxCoverage?: number;
}

export interface GlobeRegion {
  district: District;
  index: number;
  /** Unit vector from the globe center through the middle of the region. */
  center: Vec3;
  /** Angular radius of the region's cap (nodes plus half a spacing of margin). */
  radius: number;
  /** Angular radius of the empty middle that holds the hub marker and label. */
  clear: number;
  /** Companies whose primary district this is. */
  count: number;
  /** Indexes into GlobeLayout.nodes. */
  companyIdx: number[];
}

/** What the globe controller needs to know about any node: companies on the companies globe, people on the people globe. */
export interface GlobeNodeBase {
  index: number;
  /** The company's or person's slug (the two never collide; scripts/validate-people.mjs checks). */
  slug: string;
  /** Index into GlobeLayout.regions, or -1 for a node outside any region (every person). */
  region: number;
  /** Regions of the company's secondary districts (never its own). */
  secondary: number[];
  /** Unit vector: where the node sits on the globe. */
  dir: Vec3;
}

export interface GlobeNode extends GlobeNodeBase {
  company: Company;
}

export interface GlobeLayoutOf<N extends GlobeNodeBase> {
  regions: GlobeRegion[];
  nodes: N[];
  regionIndex: Map<DistrictSlug, number>;
  nodeIndex: Map<string, number>;
  /** Minimum angular separation actually used between nodes, radians. */
  spacing: number;
  /** Angular gap kept between regions, radians. */
  gap: number;
  /** Share of the sphere's area covered by region caps. */
  coverage: number;
}

export type GlobeLayout = GlobeLayoutOf<GlobeNode>;

export const DEFAULT_SPACING = 0.18;
export const DEFAULT_MAX_COVERAGE = 0.72;

/* ---------- small vector helpers (plain tuples, no three.js) ---------- */

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** Angle between two unit vectors, radians (numerically safe). */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(length(cross(a, b)), dot(a, b));
}

/** A unit vector perpendicular to v, chosen deterministically. */
export function perpendicular(v: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(ref, v));
}

/** Rotate v (perpendicular to unit axis a) about a by angle t. */
function rotatePerp(v: Vec3, a: Vec3, t: number): Vec3 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = cross(a, v);
  return normalize([v[0] * c + k[0] * s, v[1] * c + k[1] * s, v[2] * c + k[2] * s]);
}

/* ---------- placement ---------- */

/** Area of a spherical cap of angular radius r on the unit sphere. */
function capArea(r: number): number {
  return 2 * Math.PI * (1 - Math.cos(Math.min(Math.PI, r)));
}

/**
 * Region centers on a Rakhmanov-Saff-Zhou spiral from +Y to -Y. Consecutive
 * points are neighbors, so DISTRICTS order reads as a path around the globe.
 */
export function spiralPoints(n: number): Vec3[] {
  if (n <= 0) return [];
  if (n === 1) return [[0, 1, 0]];
  const out: Vec3[] = [];
  let phi = 0;
  for (let k = 0; k < n; k++) {
    const h = 1 - (2 * k) / (n - 1);
    const theta = Math.acos(Math.max(-1, Math.min(1, h)));
    if (k === 0 || k === n - 1) phi = k === 0 ? 0 : phi;
    else phi = (phi + 3.6 / Math.sqrt(n) / Math.sqrt(1 - h * h)) % (2 * Math.PI);
    const s = Math.sin(theta);
    out.push([s * Math.cos(phi), h, s * Math.sin(phi)]);
  }
  return out;
}

interface CapPlan {
  /** Node polar angle and azimuth in the cap's own frame. */
  points: { theta: number; phi: number }[];
  radius: number;
  clear: number;
}

function capPoint(theta: number, phi: number): Vec3 {
  const s = Math.sin(theta);
  return [s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta)];
}

/** Smallest angular separation between any two points of a plan (Infinity for < 2). */
function minSeparation(points: { theta: number; phi: number }[]): number {
  let best = Infinity;
  const v = points.map((p) => capPoint(p.theta, p.phi));
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) best = Math.min(best, angleBetween(v[i], v[j]));
  return best;
}

/**
 * n nodes on an equal-area sunflower inside the annulus [clear, outer] of a
 * cap, grown until neighbors are at least `spacing` apart.
 */
function planCap(n: number, spacing: number, clearK: number, phase: number): CapPlan {
  const clear = spacing * clearK;
  if (n === 0) return { points: [], radius: clear + spacing * 0.5, clear };
  const inner = clear + spacing * 0.5;
  // First guess from area: each node needs about 1.1 spacing^2 of surface.
  const need = (n * 1.1 * spacing * spacing) / (2 * Math.PI);
  let outer = Math.acos(Math.max(-1, Math.cos(inner) - need));
  outer = Math.max(outer, inner + spacing * 0.25);
  for (let attempt = 0; attempt < 400; attempt++) {
    const ca = Math.cos(inner);
    const cb = Math.cos(outer);
    const points = [];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      points.push({ theta: Math.acos(ca - t * (ca - cb)), phi: phase + k * GOLDEN_ANGLE });
    }
    if (minSeparation(points) >= spacing) {
      const far = Math.max(...points.map((p) => p.theta));
      return { points, radius: far + spacing * 0.5, clear };
    }
    outer += spacing * 0.04;
  }
  throw new Error("globe layout: cap did not converge");
}

/** Push region centers apart until every pair of caps clears by `gap`. Null if it cannot. */
function relaxCenters(radii: number[], gap: number): Vec3[] | null {
  const c = spiralPoints(radii.length);
  const n = c.length;
  for (let iter = 0; iter < 6000; iter++) {
    let worst = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const need = radii[i] + radii[j] + gap;
        const d = angleBetween(c[i], c[j]);
        if (d >= need) continue;
        worst = Math.max(worst, need - d);
        let axis = cross(c[i], c[j]);
        if (length(axis) < 1e-9) axis = perpendicular(c[i]);
        axis = normalize(axis);
        // Make c_i and c_j perpendicular to the axis (they already are, up to rounding).
        const step = (need - d) / 2 + 1e-6;
        c[i] = rotatePerp(c[i], axis, -step);
        c[j] = rotatePerp(c[j], axis, step);
      }
    if (worst < 1e-9) return c;
  }
  return null;
}

/** Deterministic phase per region so neighboring sunflowers don't look identical. */
function phaseFor(index: number): number {
  return (index * 2.399963 + 0.7) % (2 * Math.PI);
}

export function computeGlobeLayout(districts: District[], companies: Company[], opts: GlobeLayoutOptions = {}): GlobeLayout {
  const gapK = opts.gap ?? 0.55;
  const clearK = opts.clearing ?? 0.55;
  const maxCoverage = opts.maxCoverage ?? DEFAULT_MAX_COVERAGE;
  const regionIndex = new Map<DistrictSlug, number>(districts.map((d, i) => [d.slug, i]));
  const groups: Company[][] = districts.map(() => []);
  for (const m of companies) {
    const i = regionIndex.get(m.district);
    if (i !== undefined) groups[i].push(m);
  }

  let spacing = opts.spacing ?? DEFAULT_SPACING;
  for (let attempt = 0; attempt < 120; attempt++, spacing *= 0.97) {
    const gap = spacing * gapK;
    const plans = groups.map((g, i) => planCap(g.length, spacing, clearK, phaseFor(i)));
    const coverage = plans.reduce((a, p) => a + capArea(p.radius + gap / 2), 0) / (4 * Math.PI);
    if (districts.length > 1 && coverage > maxCoverage) continue;
    const centers = relaxCenters(
      plans.map((p) => p.radius),
      gap,
    );
    if (!centers) continue;

    const regions: GlobeRegion[] = districts.map((district, i) => ({
      district,
      index: i,
      center: centers[i],
      radius: plans[i].radius,
      clear: plans[i].clear,
      count: groups[i].length,
      companyIdx: [],
    }));

    const nodes: GlobeNode[] = [];
    const slot = new Map<Company, Vec3>();
    groups.forEach((g, ri) => {
      const c = centers[ri];
      const e1 = perpendicular(c);
      const e2 = cross(c, e1);
      g.forEach((m, k) => {
        const { theta, phi } = plans[ri].points[k];
        const s = Math.sin(theta);
        const t = Math.cos(theta);
        const a = Math.cos(phi) * s;
        const b = Math.sin(phi) * s;
        slot.set(m, normalize([c[0] * t + e1[0] * a + e2[0] * b, c[1] * t + e1[1] * a + e2[1] * b, c[2] * t + e1[2] * a + e2[2] * b]));
      });
    });
    for (const m of companies) {
      const dir = slot.get(m);
      const region = regionIndex.get(m.district);
      if (!dir || region === undefined) continue;
      const secondary = [...new Set(m.secondaryDistricts.map((d) => regionIndex.get(d)).filter((i): i is number => i !== undefined && i !== region))];
      const index = nodes.length;
      nodes.push({ company: m, index, slug: m.slug, region, secondary, dir: dir.map(round) as Vec3 });
      regions[region].companyIdx.push(index);
    }
    return {
      regions,
      nodes,
      regionIndex,
      nodeIndex: new Map(nodes.map((n) => [n.company.slug, n.index])),
      spacing,
      gap,
      coverage,
    };
  }
  throw new Error("globe layout: could not fit the regions on the sphere");
}

function round(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

/**
 * Which region owns a direction on the sphere: the one whose cap edge is
 * closest (an additively weighted Voronoi diagram). Every cap lies inside
 * its own territory because caps never overlap. The surface shader uses the
 * same rule, so tinted territories match the layout.
 */
export function territoryOf(regions: Pick<GlobeRegion, "center" | "radius">[], dir: Vec3): number {
  let best = Infinity;
  let idx = -1;
  regions.forEach((r, i) => {
    const d = angleBetween(dir, r.center) - r.radius;
    if (d < best) {
      best = d;
      idx = i;
    }
  });
  return idx;
}

/**
 * The axis the globe should spin about: the direction that keeps the most
 * companies near the equator, so every large region passes in front of the
 * viewer as it turns (rather than spinning in place at a pole). Weighted by
 * company count; deterministic. Returns a unit vector in the layout's frame.
 */
export function spinAxisFor(regions: Pick<GlobeRegion, "center" | "count">[], candidates = 600): Vec3 {
  if (!regions.length) return [0, 1, 0];
  let best: Vec3 = [0, 1, 0];
  let bestCost = Infinity;
  for (let k = 0; k < candidates; k++) {
    // Upper hemisphere only: an axis and its opposite are the same spin.
    const h = 1 - k / candidates;
    const r = Math.sqrt(Math.max(0, 1 - h * h));
    const phi = k * GOLDEN_ANGLE;
    const a: Vec3 = [r * Math.cos(phi), h, r * Math.sin(phi)];
    let cost = 0;
    for (const reg of regions) {
      const c = dot(a, reg.center);
      cost += (reg.count + 1) * c * c;
    }
    if (cost < bestCost - 1e-12) {
      bestCost = cost;
      best = a;
    }
  }
  return normalize(best);
}
