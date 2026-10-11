import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import { MONUMENT, fingerpostSpots, planFromLayout, stallSpots } from "./mapLayout";

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

  it("rings market stalls between the spoke crossings, facing the street", () => {
    const colors = DISTRICTS.map((d) => d.color);
    const stalls = stallSpots(layout, colors);
    expect(stalls).toHaveLength(6);
    for (const s of stalls) {
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(66, 0);
      // Front (+z local) points at the plaza.
      const fx = Math.sin(s.ry);
      const fz = Math.cos(s.ry);
      const tx = -s.x / Math.hypot(s.x, s.z);
      const tz = -s.z / Math.hypot(s.x, s.z);
      expect(fx * tx + fz * tz).toBeGreaterThan(0.99);
      // No spoke runs through a stall.
      for (const d of layout.discs) {
        const dd = Math.atan2(Math.sin(Math.atan2(s.z, s.x) - d.angle), Math.cos(Math.atan2(s.z, s.x) - d.angle));
        expect(Math.abs(dd)).toBeGreaterThan(0.06);
      }
    }
  });

  it("posts wayfinding: spoke fingerposts face their district, the totem names all", () => {
    const { posts, totem } = fingerpostSpots(layout, display);
    expect(posts).toHaveLength(layout.discs.length);
    expect(totem.arms).toHaveLength(layout.discs.length);
    for (const f of posts) {
      expect(Math.hypot(f.x, f.z)).toBeCloseTo(50, 0);
      expect(f.arms).toHaveLength(2);
    }
    // Totem stands beside the spawn.
    expect(Math.hypot(totem.x - layout.spawn.x, totem.z - layout.spawn.z)).toBeLessThan(10);
  });
});
