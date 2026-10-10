import { describe, expect, it } from "vitest";
import { LAYOUT, extent, layoutWorlds, worldRadius, type LayoutInput } from "./layout.ts";

function inputs(n: number): LayoutInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `instance-${i}`,
    joined: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    companies: (i * 37) % 2001,
  }));
}

describe("worldRadius", () => {
  it("stays within bounds and grows with the company count", () => {
    expect(worldRadius(0)).toBe(LAYOUT.minRadius);
    expect(worldRadius(100000)).toBe(LAYOUT.maxRadius);
    expect(worldRadius(-5)).toBe(LAYOUT.minRadius);
    expect(worldRadius(Number.NaN)).toBe(LAYOUT.minRadius);
    let last = 0;
    for (const n of [1, 6, 18, 46, 120, 400]) {
      const r = worldRadius(n);
      expect(r).toBeGreaterThan(last);
      last = r;
    }
  });
});

describe("layoutWorlds", () => {
  it("is deterministic and independent of input order", () => {
    const a = layoutWorlds(inputs(40));
    const b = layoutWorlds([...inputs(40)].reverse());
    const byId = new Map(b.map((p) => [p.id, p]));
    for (const p of a) expect(byId.get(p.id)).toEqual(p);
    expect(layoutWorlds(inputs(40))).toEqual(a);
  });

  it("keeps 200 worlds apart, with room for their labels, and clear of the core", () => {
    const placed = layoutWorlds(inputs(200));
    let minGap = Infinity;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      expect(Math.hypot(a.x, a.y, a.z) - a.radius).toBeGreaterThan(LAYOUT.coreRadius * 4);
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - a.radius - b.radius);
      }
    }
    expect(minGap).toBeGreaterThan(4);
  });

  it("keeps older worlds in place when a newer one joins", () => {
    const before = layoutWorlds(inputs(30));
    const after = layoutWorlds([...inputs(30), { id: "newcomer", joined: "2027-01-01", companies: 10 }]);
    const byId = new Map(after.map((p) => [p.id, p]));
    for (const p of before) expect(byId.get(p.id)).toEqual(p);
    expect(byId.get("newcomer")!.slot).toBe(30);
  });

  it("orders slots by join date, then id", () => {
    const placed = layoutWorlds([
      { id: "b", joined: "2026-05-01", companies: 1 },
      { id: "a", joined: "2026-05-01", companies: 1 },
      { id: "z", joined: "2026-01-01", companies: 1 },
    ]);
    expect(placed.map((p) => [p.id, p.slot])).toEqual([
      ["b", 2],
      ["a", 1],
      ["z", 0],
    ]);
  });

  it("reports an extent that covers every world", () => {
    const placed = layoutWorlds(inputs(12));
    const e = extent(placed);
    for (const p of placed) expect(Math.hypot(p.x, p.y, p.z) + p.radius).toBeLessThanOrEqual(e);
    expect(extent([])).toBeGreaterThan(0);
  });
});
