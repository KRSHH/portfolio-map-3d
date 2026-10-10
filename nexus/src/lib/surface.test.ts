import { describe, expect, it } from "vitest";
import { MIN_SHARE, areaToV, planBands, planDots } from "./surface.ts";

describe("areaToV", () => {
  it("maps area shares to texture rows, poles and equator exactly", () => {
    expect(areaToV(0)).toBe(0);
    expect(areaToV(1)).toBe(1);
    expect(areaToV(0.5)).toBeCloseTo(0.5, 10);
    expect(areaToV(-1)).toBe(0);
    expect(areaToV(2)).toBe(1);
    let last = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      expect(areaToV(f)).toBeGreaterThan(last);
      last = areaToV(f);
    }
  });
});

describe("planBands", () => {
  const districts = [
    { slug: "a", color: "#ff0000", count: 30 },
    { slug: "b", color: "#00ff00", count: 10 },
    { slug: "c", color: "#0000ff", count: 0 },
    { slug: "d", color: "#ffff00", count: 60 },
  ];

  it("gives each district with companies a band proportional to its count, in order", () => {
    const bands = planBands(districts);
    expect(bands.map((b) => b.slug)).toEqual(["a", "b", "d"]);
    expect(bands[0].f0).toBe(0);
    expect(bands.at(-1)!.f1).toBe(1);
    expect(bands[0].f1 - bands[0].f0).toBeCloseTo(0.3, 10);
    expect(bands[1].f1 - bands[1].f0).toBeCloseTo(0.1, 10);
    for (let i = 1; i < bands.length; i++) expect(bands[i].f0).toBe(bands[i - 1].f1);
    for (const b of bands) {
      expect(b.v0).toBeCloseTo(areaToV(b.f0), 10);
      expect(b.v1).toBeCloseTo(areaToV(b.f1), 10);
    }
  });

  it("keeps a sliver for a tiny district", () => {
    const bands = planBands([
      { slug: "big", color: "#ffffff", count: 2000 },
      { slug: "tiny", color: "#000000", count: 1 },
    ]);
    expect(bands[1].f1 - bands[1].f0).toBeGreaterThanOrEqual(MIN_SHARE * 0.99);
  });

  it("gives equal bands when no district has companies, and none when there are no districts", () => {
    const bands = planBands([
      { slug: "x", color: "#ffffff", count: 0 },
      { slug: "y", color: "#000000", count: 0 },
    ]);
    expect(bands.map((b) => b.f1 - b.f0)).toEqual([0.5, 0.5]);
    expect(planBands([])).toEqual([]);
  });
});

describe("planDots", () => {
  it("puts each company inside its district's band, deterministically", () => {
    const bands = planBands([
      { slug: "a", color: "#ff0000", count: 2 },
      { slug: "b", color: "#00ff00", count: 1 },
    ]);
    const companies = [
      { slug: "one", district: "a" },
      { slug: "two", district: "a" },
      { slug: "three", district: "b" },
      { slug: "lost", district: "nowhere" },
    ];
    const dots = planDots(companies, bands);
    expect(dots.map((d) => d.slug)).toEqual(["one", "two", "three"]);
    for (const d of dots) {
      const b = bands.find((x) => x.slug === companies.find((c) => c.slug === d.slug)!.district)!;
      expect(d.v).toBeGreaterThan(b.v0);
      expect(d.v).toBeLessThan(b.v1);
      expect(d.u).toBeGreaterThanOrEqual(0);
      expect(d.u).toBeLessThan(1);
    }
    expect(planDots(companies, bands)).toEqual(dots);
  });
});
