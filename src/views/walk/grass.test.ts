import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { CORE_RADIUS, PLAZA_RADIUS, layoutWorld, onRoad } from "../../data/layout";
import { grassAt } from "./grass";
import { createTerrain } from "./terrain";

const layout = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);
const terrain = createTerrain(layout);
const grows = (x: number, z: number) => grassAt(layout, terrain, x, z);
const ANGLES = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);

describe("grassAt", () => {
  it("never grows on the plaza", () => {
    for (const a of ANGLES) for (const r of [0, 12, 30, PLAZA_RADIUS]) expect(grows(Math.cos(a) * r, Math.sin(a) * r)).toBe(false);
  });

  it("never grows on a road", () => {
    for (const d of layout.discs) {
      for (let r = PLAZA_RADIUS + 3; r < Math.hypot(d.x, d.z) - d.r; r += 2) {
        const x = Math.cos(d.angle) * r;
        const z = Math.sin(d.angle) * r;
        expect(onRoad(layout, x, z)).toBe(true);
        expect(grows(x, z)).toBe(false);
      }
    }
  });

  it("never grows in a district's core clearing, on its rim or at a pin's foot", () => {
    for (const d of layout.discs) {
      for (const a of ANGLES) {
        expect(grows(d.x + Math.cos(a) * CORE_RADIUS * 0.8, d.z + Math.sin(a) * CORE_RADIUS * 0.8)).toBe(false);
        expect(grows(d.x + Math.cos(a) * (d.r - 0.8), d.z + Math.sin(a) * (d.r - 0.8))).toBe(false);
      }
    }
    for (const pin of layout.pins.values()) expect(grows(pin.x + 0.3, pin.z)).toBe(false);
  });

  it("never grows on the beach or in the sea", () => {
    for (const a of ANGLES) {
      for (const off of [-1, 2, 12]) {
        const r = terrain.shoreAt(a) + off;
        expect(grows(Math.cos(a) * r, Math.sin(a) * r)).toBe(false);
      }
    }
  });

  it("grows on the lawns between, and on every district's lawn", () => {
    let open = 0;
    let seen = 0;
    for (const a of ANGLES) {
      const r = (PLAZA_RADIUS + layout.ringRadius) / 2 + 3;
      const x = Math.cos(a + 0.03) * r;
      const z = Math.sin(a + 0.03) * r;
      if (onRoad(layout, x, z, 1) || layout.discs.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + 1)) continue;
      seen++;
      if (grows(x, z)) open++;
    }
    expect(seen).toBeGreaterThan(10);
    expect(open / seen).toBeGreaterThan(0.9);
    for (const d of layout.discs) {
      const lawn = ANGLES.filter((a) => grows(d.x + Math.cos(a) * (CORE_RADIUS + 2.5), d.z + Math.sin(a) * (CORE_RADIUS + 2.5)));
      expect(lawn.length, d.slug).toBeGreaterThan(ANGLES.length / 3);
    }
  });
});
