import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import { islandHeight, warehouseSpots } from "./mapGround";
import { planFromLayout } from "./mapLayout";

const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);

describe("generated island ground", () => {
  it("puts the hub, spawn and every pin on flat, dry pads", () => {
    const plan = planFromLayout(
      layout,
      DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })),
    );
    for (const spot of [plan.monument, plan.portal, plan.spawn, ...plan.pylons]) {
      const h = islandHeight(layout, spot.x, spot.z);
      expect(h, `hub ${spot.x},${spot.z}`).toBeGreaterThan(0);
      expect(h, `hub ${spot.x},${spot.z}`).toBeLessThan(1.2);
    }
    for (const c of plan.clusters) {
      const center = islandHeight(layout, c.cx, c.cz);
      expect(center, `${c.slug} pad`).toBeGreaterThan(0);
      for (const p of c.pins) {
        const h = islandHeight(layout, p.x, p.z);
        expect(h, `${p.slug} dry`).toBeGreaterThan(0);
        expect(Math.abs(h - center), `${p.slug} slope`).toBeLessThan(0.8);
      }
    }
  });

  it("falls to beach and sea at the rim and rises to hills inland", () => {
    expect(islandHeight(layout, 150, 0)).toBeLessThan(-0.5);
    expect(islandHeight(layout, 170, 0)).toBeLessThan(-1.2);
    expect(islandHeight(layout, -70, 0)).toBeGreaterThan(2);
    expect(islandHeight(layout, 0, 70)).toBeGreaterThan(1.5);
  });

  it("sets district barns outside their districts on dry ground", () => {
    const barns = warehouseSpots(layout);
    expect(barns).toHaveLength(DISTRICTS.length);
    for (const [x, z] of barns) {
      expect(islandHeight(layout, x, z)).toBeGreaterThan(0);
    }
  });
});
