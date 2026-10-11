import { describe, expect, it } from "vitest";
import { OBSTACLES } from "./mapSurvey";
import { clusterRadius, DRY, heightAt, planSummerMap, type DistrictInput } from "./mapPlan";

const DISTRICTS: DistrictInput[] = [
  { slug: "health", label: "Health & Life Sciences", short: "Health", color: "#e34948", companies: ["a", "b", "c", "d", "e"].map((n) => ({ slug: `health-${n}`, name: `Health ${n}` })) },
  { slug: "ai-data", label: "AI & Data", short: "AI & Data", color: "#00a3b4", companies: ["a", "b", "c", "d", "e"].map((n) => ({ slug: `ai-${n}`, name: `Ai ${n}` })) },
  { slug: "climate", label: "Climate & Energy", short: "Climate", color: "#7a9a01", companies: ["a", "b", "c", "d", "e"].map((n) => ({ slug: `cl-${n}`, name: `Cl ${n}` })) },
  { slug: "fintech", label: "Fintech", short: "Fintech", color: "#2a78d6", companies: ["a", "b", "c", "d", "e"].map((n) => ({ slug: `fi-${n}`, name: `Fi ${n}` })) },
  { slug: "hardware", label: "Hardware & Robotics", short: "Hardware", color: "#c2185b", companies: ["a", "b", "c", "d"].map((n) => ({ slug: `hw-${n}`, name: `Hw ${n}` })) },
  { slug: "commerce", label: "Consumer & Commerce", short: "Commerce", color: "#eda100", companies: ["a", "b", "c", "d", "e"].map((n) => ({ slug: `co-${n}`, name: `Co ${n}` })) },
];
const PEOPLE = ["p1", "p2", "p3", "p4", "p5", "p6"].map((slug) => ({ slug }));

describe("summer map plan", () => {
  it("is deterministic", () => {
    expect(planSummerMap(DISTRICTS, PEOPLE)).toEqual(planSummerMap(DISTRICTS, PEOPLE));
  });

  it("places one pin per company and person, in sorted order", () => {
    const plan = planSummerMap(DISTRICTS, PEOPLE);
    expect(plan.clusters).toHaveLength(7);
    const pins = plan.clusters.flatMap((c) => c.pins);
    expect(pins).toHaveLength(35);
    expect(new Set(pins.map((p) => p.slug)).size).toBe(35);
    const health = plan.clusters.find((c) => c.slug === "health")!;
    expect(health.pins.map((p) => p.slug)).toEqual(["health-a", "health-b", "health-c", "health-d", "health-e"]);
    expect(health.count).toBe(5);
    expect(health.r).toBeCloseTo(clusterRadius(5));
  });

  it("keeps pins on dry ground, clear of buildings and apart", () => {
    const plan = planSummerMap(DISTRICTS, PEOPLE);
    const pins = plan.clusters.flatMap((c) => c.pins);
    for (const p of pins) {
      expect(heightAt(p.x, p.z), `${p.slug} dry`).toBeGreaterThanOrEqual(DRY);
      for (const o of OBSTACLES) {
        if (o.k !== "house" && o.k !== "machine" && o.k !== "blocker") continue;
        expect(Math.hypot(p.x - o.x, p.z - o.z), `${p.slug} vs ${o.k}`).toBeGreaterThanOrEqual(o.r + 1.4);
      }
    }
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        expect(Math.hypot(pins[i].x - pins[j].x, pins[i].z - pins[j].z), `${pins[i].slug} vs ${pins[j].slug}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("keeps neighborhoods apart and the hub on open ground", () => {
    const plan = planSummerMap(DISTRICTS, PEOPLE);
    for (let i = 0; i < plan.clusters.length; i++) {
      for (let j = i + 1; j < plan.clusters.length; j++) {
        const a = plan.clusters[i];
        const b = plan.clusters[j];
        expect(Math.hypot(a.cx - b.cx, a.cz - b.cz), `${a.slug} vs ${b.slug}`).toBeGreaterThanOrEqual(a.r + b.r + 2);
      }
    }
    for (const spot of [plan.monument, plan.portal, plan.spawn, ...plan.pylons]) {
      expect(heightAt(spot.x, spot.z)).toBeGreaterThanOrEqual(DRY);
      for (const o of OBSTACLES) {
        if (o.k !== "house" && o.k !== "machine") continue;
        expect(Math.hypot(spot.x - o.x, spot.z - o.z)).toBeGreaterThanOrEqual(o.r + 1);
      }
    }
    // Portal west of the monument, spawn south of it (Ambition's arrangement).
    expect(plan.portal.x).toBeLessThan(plan.monument.x);
    expect(plan.spawn.z).toBeLessThan(plan.monument.z);
    // Every sign faces the monument.
    for (const c of plan.clusters) {
      const dx = plan.monument.x - c.sign.x;
      const dz = plan.monument.z - c.sign.z;
      expect(Math.atan2(dx, dz)).toBeCloseTo(c.sign.facing, 2);
    }
  });
});
