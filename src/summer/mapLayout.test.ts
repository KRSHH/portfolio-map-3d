import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import { MONUMENT, planFromLayout } from "./mapLayout";

const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
const display = DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color }));

describe("summer map layout", () => {
  it("is deterministic and covers every company and person", () => {
    const a = planFromLayout(layout, display);
    const b = planFromLayout(layout, display);
    expect(a).toEqual(b);
    expect(a.clusters).toHaveLength(DISTRICTS.length + 1);
    const pins = a.clusters.flatMap((c) => c.pins);
    expect(pins).toHaveLength(COMPANIES.length + PEOPLE.length);
    expect(new Set(pins.map((p) => p.slug)).size).toBe(pins.length);
  });

  it("keeps every pin inside its own neighborhood", () => {
    const plan = planFromLayout(layout, display);
    for (const c of plan.clusters) {
      for (const p of c.pins) {
        expect(Math.hypot(p.x - c.cx, p.z - c.cz), p.slug).toBeLessThanOrEqual(c.r + 1);
      }
    }
  });

  it("faces every sign at the monument and numbers pins by district", () => {
    const plan = planFromLayout(layout, display);
    for (const c of plan.clusters) {
      const dx = plan.monument.x - c.sign.x;
      const dz = plan.monument.z - c.sign.z;
      expect(Math.atan2(dx, dz)).toBeCloseTo(c.sign.facing, 2);
      const edge = Math.hypot(c.sign.x - c.cx, c.sign.z - c.cz);
      expect(edge).toBeGreaterThan(c.r);
      expect(edge).toBeLessThan(c.r + 5);
    }
    const byDistrict = new Map<string, number>();
    for (const c of plan.clusters) byDistrict.set(c.slug, c.pins.length);
    for (const d of DISTRICTS) {
      expect(byDistrict.get(d.slug)).toBe(COMPANIES.filter((c) => c.district === d.slug).length);
    }
    expect(byDistrict.get("people")).toBe(PEOPLE.length);
  });

  it("lays the hub out Ambition-style: monument, portal, pylons, spawn", () => {
    const plan = planFromLayout(layout, display);
    expect(plan.monument.x).toBe(MONUMENT.x);
    expect(plan.monument.z).toBe(MONUMENT.z);
    // Portal beside the monument, spawn south of it, pylons on its north arc.
    expect(plan.portal.x).toBeLessThan(plan.monument.x + 20);
    expect(plan.spawn.z).toBeGreaterThan(plan.monument.z);
    expect(plan.pylons).toHaveLength(4);
    for (const p of plan.pylons) {
      expect(Math.hypot(p.x - plan.monument.x, p.z - plan.monument.z)).toBeCloseTo(9.5, 1);
      expect(p.z).toBeLessThan(plan.monument.z);
    }
  });
});
