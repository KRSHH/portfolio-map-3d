import { describe, expect, it } from "vitest";
import { PEOPLE, DISTRICTS, COMPANIES } from "./catalog";
import { PEOPLE_AREA, CORE_RADIUS, PLAZA_RADIUS, clampToIsland, decorPoints, districtAt, layoutWorld, normalizeMovement, onRoad, sunflower } from "./layout";

const order = DISTRICTS.map((d) => d.slug);
// The world the walk view builds: the districts, then the People area.
const world = layoutWorld(order, COMPANIES, PEOPLE);

describe("layoutWorld", () => {
  it("is deterministic", () => {
    const again = layoutWorld(order, COMPANIES, PEOPLE.slice().reverse());
    expect([...again.pins.values()]).toEqual([...world.pins.values()]);
    expect(again.discs).toEqual(world.discs);
  });

  it("places every company and every person exactly once", () => {
    expect(world.pins.size).toBe(COMPANIES.length + PEOPLE.length);
  });

  it("places every company inside its own district, outside the landmark clearing", () => {
    for (const m of COMPANIES) {
      const p = world.pins.get(m.slug)!;
      const disc = world.discs.find((d) => d.slug === m.district)!;
      const r = Math.hypot(p.x - disc.x, p.z - disc.z);
      expect(r).toBeLessThan(disc.r);
      expect(r).toBeGreaterThan(CORE_RADIUS);
      expect(districtAt(world, p.x, p.z)?.slug).toBe(m.district);
    }
  });

  it("keeps pins apart so logos and headshots don't collide", () => {
    const pins = [...world.pins.values()];
    let min = Infinity;
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++) min = Math.min(min, Math.hypot(pins[i].x - pins[j].x, pins[i].z - pins[j].z));
    expect(min).toBeGreaterThan(3.5);
  });

  it("keeps districts from overlapping each other or the plaza", () => {
    for (let i = 0; i < world.discs.length; i++) {
      const a = world.discs[i];
      expect(Math.hypot(a.x, a.z) - a.r).toBeGreaterThan(PLAZA_RADIUS + 10);
      for (let j = i + 1; j < world.discs.length; j++) {
        const b = world.discs[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r + 2);
      }
    }
  });

  it("keeps every district on the island", () => {
    for (const d of world.discs) expect(Math.hypot(d.x, d.z) + d.r).toBeLessThan(world.islandRadius - 10);
  });

  it("spawns on the plaza", () => {
    expect(Math.hypot(world.spawn.x, world.spawn.z)).toBeLessThan(PLAZA_RADIUS);
  });

  it("can cross the ring on foot in about a minute and a half", () => {
    const circumference = 2 * Math.PI * world.ringRadius;
    expect(circumference / 9).toBeGreaterThan(40);
    expect(circumference / 9).toBeLessThan(120);
  });
});

describe("the People area", () => {
  const area = world.discs[world.discs.length - 1];

  it("is one more disc after the last district on the same ring, and not a district", () => {
    expect(world.discs.map((d) => d.slug)).toEqual([...order, PEOPLE_AREA]);
    expect((order as string[]).includes(PEOPLE_AREA)).toBe(false);
    expect(Math.hypot(area.x, area.z)).toBeCloseTo(world.ringRadius);
    expect(area.count).toBe(PEOPLE.length);
  });

  it("holds every person, outside the landmark clearing, and no company", () => {
    for (const c of PEOPLE) {
      const p = world.pins.get(c.slug)!;
      expect(p.district).toBe(PEOPLE_AREA);
      const r = Math.hypot(p.x - area.x, p.z - area.z);
      expect(r).toBeLessThan(area.r);
      expect(r).toBeGreaterThan(CORE_RADIUS);
      expect(districtAt(world, p.x, p.z)?.slug).toBe(PEOPLE_AREA);
    }
    for (const p of world.pins.values()) if (p.district === PEOPLE_AREA) expect(PEOPLE.some((c) => c.slug === p.slug)).toBe(true);
  });

  it("leaves the districts alone in a world without people", () => {
    const bare = layoutWorld(order, COMPANIES);
    expect(bare.discs.map((d) => d.slug)).toEqual(order);
    expect(bare.pins.size).toBe(COMPANIES.length);
  });
});

describe("helpers", () => {
  it("sunflower spreads n points within the annulus", () => {
    const pts = sunflower(30, 5, 20);
    expect(pts).toHaveLength(30);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(r).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it("clamps the walker to the island", () => {
    const p = clampToIsland(world, 10_000, 0);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(world.islandRadius);
  });

  it("normalizes diagonal movement", () => {
    const v = normalizeMovement(1, 1);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1);
    expect(normalizeMovement(0, 0)).toEqual({ x: 0, z: 0 });
  });

  it("puts roads between the plaza and each district", () => {
    for (const d of world.discs) {
      // Halfway between the plaza edge and the district's inner edge.
      const mid = (PLAZA_RADIUS + (Math.hypot(d.x, d.z) - d.r)) / 2;
      expect(districtAt(world, Math.cos(d.angle) * mid, Math.sin(d.angle) * mid)).toBeNull();
      expect(onRoad(world, Math.cos(d.angle) * mid, Math.sin(d.angle) * mid)).toBe(true);
    }
  });

  it("scatters decor off roads, districts and the plaza", () => {
    for (const p of decorPoints(world, 200)) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(PLAZA_RADIUS);
      expect(districtAt(world, p.x, p.z)).toBeNull();
      expect(onRoad(world, p.x, p.z)).toBe(false);
    }
  });
});
