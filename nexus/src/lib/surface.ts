/* What a world's surface shows, as numbers: its districts as bands proportional to their
   company counts, and a dot for each company inside its district's band. The painter
   (three/paint.ts) draws these onto an equirectangular canvas.

   Bands are proportional by area on the sphere, not by height on the texture: a band's
   latitude range is found from its share of the surface (areaToV), so a district with half the
   companies covers half the world. A district with very few companies still gets a sliver
   (MIN_SHARE) so its color shows. Pure functions, unit-tested. */
import { unitHash } from "./hash.ts";

export interface SurfaceDistrict {
  slug: string;
  color: string;
  count: number;
}

export interface SurfaceCompany {
  slug: string;
  district: string;
}

export interface Band {
  slug: string;
  color: string;
  /** Share of the sphere's area where the band starts and ends (0 = north pole, 1 = south pole). */
  f0: number;
  f1: number;
  /** The same edges as texture rows, 0..1 from the top. */
  v0: number;
  v1: number;
}

export interface Dot {
  slug: string;
  /** Texture coordinates, 0..1 (u around, v from the top). */
  u: number;
  v: number;
}

export const MIN_SHARE = 0.02;

/** The texture row (0..1 from the top) where `f` of the sphere's area lies above. */
export function areaToV(f: number): number {
  const c = Math.max(0, Math.min(1, f));
  return Math.acos(1 - 2 * c) / Math.PI;
}

/**
 * Bands for the districts, in their order. Districts with no companies are left out, unless no
 * district has any, in which case every district gets an equal band.
 */
export function planBands(districts: readonly SurfaceDistrict[]): Band[] {
  const counted = districts.filter((d) => d.count > 0);
  const use = counted.length ? counted : districts;
  if (!use.length) return [];
  const weights = use.map((d) => (counted.length ? d.count : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  // Small districts get MIN_SHARE; the others share the rest in proportion to their counts.
  const small = weights.map((w) => w / total < MIN_SHARE);
  const fixed = small.filter(Boolean).length * MIN_SHARE;
  const bigTotal = weights.reduce((a, w, i) => (small[i] ? a : a + w), 0);
  const shares = weights.map((w, i) => (small[i] ? MIN_SHARE : ((1 - fixed) * w) / bigTotal));
  let f = 0;
  return use.map((d, i) => {
    const f0 = f;
    const f1 = i === use.length - 1 ? 1 : f + shares[i];
    f = f1;
    return { slug: d.slug, color: d.color, f0, f1, v0: areaToV(f0), v1: areaToV(f1) };
  });
}

/** One dot per company whose district has a band, spread evenly by area inside the band. */
export function planDots(companies: readonly SurfaceCompany[], bands: readonly Band[]): Dot[] {
  const band = new Map(bands.map((b) => [b.slug, b]));
  const out: Dot[] = [];
  for (const c of companies) {
    const b = band.get(c.district);
    if (!b) continue;
    const u = unitHash(`${c.slug}:u`);
    // Keep dots off the band's edges (the painter waves them slightly).
    const t = 0.15 + 0.7 * unitHash(`${c.slug}:v`);
    out.push({ slug: c.slug, u, v: areaToV(b.f0 + (b.f1 - b.f0) * t) });
  }
  return out;
}
