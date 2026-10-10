import { describe, expect, it } from "vitest";
import { PEOPLE } from "../../data/catalog";
import { BAND, bandPoints, personGlobeLayout } from "./personLayout";
import { angleBetween, length, spinAxisFor } from "./globeLayout";

describe("people globe layout", () => {
  const layout = personGlobeLayout(PEOPLE);

  it("has one node per person, in the order given, and no regions", () => {
    expect(layout.nodes.map((n) => n.slug)).toEqual(PEOPLE.map((c) => c.slug));
    expect(layout.regions).toEqual([]);
    expect(layout.regionIndex.size).toBe(0);
    for (const n of layout.nodes) {
      expect(n.region).toBe(-1);
      expect(n.secondary).toEqual([]);
      expect(layout.nodeIndex.get(n.slug)).toBe(n.index);
    }
  });

  it("puts every person on the unit sphere, inside the band around the spin equator", () => {
    for (const n of layout.nodes) {
      expect(Math.abs(length(n.dir) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(n.dir[1])).toBeLessThanOrEqual(BAND + 1e-6);
    }
    // No regions: the globe spins about the layout's own +Y axis, the band's axis.
    expect(spinAxisFor(layout.regions)).toEqual([0, 1, 0]);
  });

  it("spreads people evenly: every person's nearest neighbor is about as far as any other's", () => {
    const nearest = layout.nodes.map((a) => Math.min(...layout.nodes.filter((b) => b !== a).map((b) => angleBetween(a.dir, b.dir))));
    const lo = Math.min(...nearest);
    const hi = Math.max(...nearest);
    expect(layout.spacing).toBeCloseTo(lo, 9);
    expect(lo).toBeGreaterThan(0.7); // at least 40 degrees for the example's 6 people
    expect(hi / lo).toBeLessThan(1.25);
  });

  it("is deterministic", () => {
    expect(personGlobeLayout(PEOPLE).nodes.map((n) => n.dir)).toEqual(layout.nodes.map((n) => n.dir));
  });

  it("handles tiny rosters", () => {
    expect(bandPoints(0)).toEqual([]);
    expect(bandPoints(1)).toHaveLength(1);
    expect(personGlobeLayout([]).nodes).toEqual([]);
    const two = bandPoints(2);
    expect(angleBetween(two[0], two[1])).toBeGreaterThan(2);
  });

  it("carries nothing that could link a person to a company, district or industry", () => {
    for (const n of layout.nodes) expect(Object.keys(n).sort()).toEqual(["dir", "index", "person", "region", "secondary", "slug"]);
  });
});
