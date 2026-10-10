import { describe, expect, it } from "vitest";
import { DISTRICTS, COMPANIES } from "../../data/catalog";
import type { District, Company } from "../../data/types";
import { arcLift, arcPoints, cumulativeLength, slerpUnit } from "./arcs";
import { DEFAULT_MAX_COVERAGE, angleBetween, computeGlobeLayout, dot, length, spinAxisFor, spiralPoints, territoryOf, type GlobeLayout, type Vec3 } from "./globeLayout";

function checkInvariants(layout: GlobeLayout, companies: Company[], districts: District[]) {
  const eps = 1e-6;
  // One region per district, in order; one node per company with a known district.
  expect(layout.regions.map((r) => r.district.slug)).toEqual(districts.map((d) => d.slug));
  const placeable = companies.filter((m) => districts.some((d) => d.slug === m.district));
  expect(layout.nodes).toHaveLength(placeable.length);
  expect(layout.regions.reduce((a, r) => a + r.companyIdx.length, 0)).toBe(placeable.length);
  for (const r of layout.regions) expect(r.count).toBe(r.companyIdx.length);

  // Unit vectors everywhere.
  for (const n of layout.nodes) expect(Math.abs(length(n.dir) - 1)).toBeLessThan(1e-6);
  for (const r of layout.regions) expect(Math.abs(length(r.center) - 1)).toBeLessThan(1e-9);

  // Every node inside its own region's cap, outside the clearing, and in its own territory.
  for (const n of layout.nodes) {
    const r = layout.regions[n.region];
    expect(n.company.district).toBe(r.district.slug);
    const a = angleBetween(n.dir, r.center);
    expect(a).toBeLessThanOrEqual(r.radius - layout.spacing / 2 + eps);
    expect(a).toBeGreaterThanOrEqual(r.clear - eps);
    expect(territoryOf(layout.regions, n.dir)).toBe(n.region);
  }

  // Minimum angular separation between any two nodes.
  for (let i = 0; i < layout.nodes.length; i++)
    for (let j = i + 1; j < layout.nodes.length; j++)
      expect(angleBetween(layout.nodes[i].dir, layout.nodes[j].dir)).toBeGreaterThanOrEqual(layout.spacing - eps);

  // Regions never overlap, and keep the gap between them.
  for (let i = 0; i < layout.regions.length; i++)
    for (let j = i + 1; j < layout.regions.length; j++) {
      const a = layout.regions[i];
      const b = layout.regions[j];
      expect(angleBetween(a.center, b.center)).toBeGreaterThanOrEqual(a.radius + b.radius + layout.gap - eps);
    }
}

function fakeCompany(slug: string, district: string, secondary: string[] = []): Company {
  return {
    slug,
    name: slug,
    tags: [],
    website: null,
    logo: null,
    description: null,
    descriptionSource: null,
    location: null,
    linkedin: null,
    founders: [],
    leaders: [],
    district: district as Company["district"],
    secondaryDistricts: secondary as Company["secondaryDistricts"],
    services: [],
    servesIndustries: [],
    businessModel: "Unknown",
    keywords: [],
    providerPitch: null,
    connections: [],
    sources: [],
  };
}

describe("globe layout", () => {
  const layout = computeGlobeLayout(DISTRICTS, COMPANIES);

  it("holds every invariant for the example catalog", () => {
    checkInvariants(layout, COMPANIES, DISTRICTS);
  });

  it("is deterministic", () => {
    const again = computeGlobeLayout(DISTRICTS, COMPANIES);
    expect(again.nodes.map((n) => n.dir)).toEqual(layout.nodes.map((n) => n.dir));
    expect(again.regions.map((r) => r.center)).toEqual(layout.regions.map((r) => r.center));
  });

  it("sizes regions by company count", () => {
    const sorted = [...layout.regions].sort((a, b) => a.count - b.count);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].count > sorted[i - 1].count) expect(sorted[i].radius).toBeGreaterThan(sorted[i - 1].radius);
  });

  it("keeps the regions to a sensible share of the sphere", () => {
    expect(layout.coverage).toBeGreaterThan(0.15);
    expect(layout.coverage).toBeLessThanOrEqual(DEFAULT_MAX_COVERAGE + 1e-9);
  });

  it("keeps DISTRICTS order as a path of neighbors", () => {
    // Consecutive districts are closer on average than random pairs.
    const r = layout.regions;
    let consecutive = 0;
    for (let i = 1; i < r.length; i++) consecutive += angleBetween(r[i - 1].center, r[i].center);
    consecutive /= r.length - 1;
    let all = 0;
    let pairs = 0;
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        all += angleBetween(r[i].center, r[j].center);
        pairs++;
      }
    expect(consecutive).toBeLessThan(all / pairs);
  });

  it("handles districts with no companies and companies with secondary districts", () => {
    const districts = DISTRICTS.slice(0, 5);
    const companies = [fakeCompany("a", districts[0].slug, [districts[1].slug, districts[0].slug]), fakeCompany("b", districts[0].slug), fakeCompany("c", districts[2].slug)];
    const l = computeGlobeLayout(districts, companies);
    checkInvariants(l, companies, districts);
    expect(l.regions[3].count).toBe(0);
    expect(l.nodes[0].secondary).toEqual([1]);
  });

  it("skips companies whose district is unknown instead of crashing", () => {
    const districts = DISTRICTS.slice(0, 3);
    const companies = [fakeCompany("a", districts[0].slug), fakeCompany("x", "not-a-district")];
    const l = computeGlobeLayout(districts, companies);
    expect(l.nodes.map((n) => n.company.slug)).toEqual(["a"]);
  });

  it("handles an empty catalog", () => {
    const l = computeGlobeLayout(DISTRICTS, []);
    expect(l.nodes).toHaveLength(0);
    checkInvariants(l, [], DISTRICTS);
  });

  it("shrinks spacing when the catalog outgrows the sphere", () => {
    const companies: Company[] = [];
    for (let i = 0; i < 420; i++) companies.push(fakeCompany(`m${i}`, DISTRICTS[i % 3 === 0 ? 0 : i % DISTRICTS.length].slug));
    const l = computeGlobeLayout(DISTRICTS, companies);
    expect(l.spacing).toBeLessThan(layout.spacing);
    checkInvariants(l, companies, DISTRICTS);
  });

  it("picks a spin axis that keeps the largest region near the equator", () => {
    const axis = spinAxisFor(layout.regions);
    expect(length(axis)).toBeCloseTo(1);
    const biggest = [...layout.regions].sort((a, b) => b.count - a.count)[0];
    // Within ~35 degrees of the equator.
    expect(Math.abs(dot(axis, biggest.center))).toBeLessThan(Math.sin((35 * Math.PI) / 180));
    expect(spinAxisFor(layout.regions)).toEqual(axis);
    expect(spinAxisFor([])).toEqual([0, 1, 0]);
  });

  it("spiral points are unit vectors from top to bottom", () => {
    const p = spiralPoints(14);
    expect(p[0][1]).toBeCloseTo(1);
    expect(p[13][1]).toBeCloseTo(-1);
    for (const v of p) expect(length(v)).toBeCloseTo(1);
  });
});

describe("globe arcs", () => {
  const a: Vec3 = [1, 0, 0];
  const b: Vec3 = [0, 1, 0];

  it("slerps along the great circle", () => {
    const m = slerpUnit(a, b, 0.5);
    expect(m[0]).toBeCloseTo(Math.SQRT1_2);
    expect(m[1]).toBeCloseTo(Math.SQRT1_2);
    expect(length(slerpUnit(a, [-1, 0, 0], 0.5))).toBeCloseTo(1);
  });

  it("runs from a to b at the given radii and lifts in the middle", () => {
    const pts = arcPoints(a, b, 60, 62, 10, 20);
    expect(pts[0]).toEqual([60, 0, 0]);
    expect(pts[20][0]).toBeCloseTo(0);
    expect(pts[20][1]).toBeCloseTo(62);
    expect(length(pts[10])).toBeCloseTo(71);
    for (const p of pts) expect(length(p)).toBeGreaterThanOrEqual(60 - 1e-9);
  });

  it("never produces NaN for antipodal or identical points", () => {
    for (const pts of [arcPoints(a, [-1, 0, 0], 60, 60, 20), arcPoints(a, a, 60, 60, 2)]) for (const p of pts) for (const v of p) expect(Number.isFinite(v)).toBe(true);
  });

  it("lifts longer arcs higher", () => {
    expect(arcLift(2, 60)).toBeGreaterThan(arcLift(0.5, 60));
    const len = cumulativeLength(arcPoints(a, b, 60, 60, 0, 40));
    expect(len[len.length - 1]).toBeCloseTo((Math.PI / 2) * 60, 1);
  });
});
