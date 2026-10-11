import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld, seededRandom } from "../data/layout";
import { PAD_Y, SEA_Y, beachSpots, hillSide, islandHeight, plantable, scatter, seaSound, townRadius } from "./mapGround";
import { hopTargets, planFromLayout } from "./mapLayout";

const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
const plan = planFromLayout(layout, DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })));
const flat = (x: number, z: number) => Math.abs(islandHeight(plan, x, z) - PAD_Y);

describe("generated island ground", () => {
  it("puts the hub, the arrival, the board, the signs, every pin and every hop landing on flat, dry pads", () => {
    const spots = [plan.monument, plan.portal, plan.spawn, plan.board, ...plan.pylons, ...plan.posts, ...hopTargets(plan, { portal: "p", plaza: "q" }).map((t) => t.land)];
    for (const c of plan.clusters) spots.push({ x: c.cx, z: c.cz }, c.sign, c.entry, ...c.pins);
    for (const s of spots) expect(flat(s.x, s.z), `${s.x},${s.z}`).toBeLessThan(0.02);
  });

  it("levels the ground under the stalls and every lamp", () => {
    for (const s of [...plan.stalls, ...plan.lamps.plaza, ...plan.lamps.roads, ...plan.lamps.street]) expect(flat(s.x, s.z), `${s.x},${s.z}`).toBeLessThan(0.05);
  });

  it("keeps the beach dry where the kid may walk and under the sea past the waterline", () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Above even the swell's lowest trough at the walk's edge; under its crest at the waterline.
      expect(islandHeight(plan, c * plan.island.walk, s * plan.island.walk)).toBeGreaterThan(SEA_Y + 0.4);
      expect(islandHeight(plan, c * plan.island.water, s * plan.island.water)).toBeLessThan(SEA_Y);
      expect(islandHeight(plan, c * plan.island.extent, s * plan.island.extent)).toBeLessThan(SEA_Y - 2);
    }
  });

  it("keeps the town flat, out past its market stalls", () => {
    const town = townRadius(plan);
    expect(town).toBeGreaterThan(Math.max(...plan.stalls.map((s) => Math.hypot(s.x, s.z))) + 2);
    for (let a = 0; a < Math.PI * 2; a += 0.1) for (const r of [0, town * 0.5, town]) expect(flat(Math.cos(a) * r, Math.sin(a) * r)).toBeLessThan(1e-9);
  });

  it("rises into hills behind the districts to the west, north and south, and leaves the east open to the sea", () => {
    const highest = (from: number, to: number) => {
      let top = -Infinity;
      for (let a = from; a <= to; a += 0.02) for (let r = townRadius(plan); r < plan.island.land; r += 1) top = Math.max(top, islandHeight(plan, Math.cos(a) * r, Math.sin(a) * r));
      return top;
    };
    expect(highest(Math.PI * 0.8, Math.PI * 1.2)).toBeGreaterThan(4);
    expect(highest(-Math.PI * 0.7, -Math.PI * 0.3)).toBeGreaterThan(4);
    expect(highest(Math.PI * 0.3, Math.PI * 0.7)).toBeGreaterThan(4);
    expect(highest(-0.35, 0.35)).toBeLessThan(2.5);
  });

  it("scatters plants only outside the town, off the roads and the districts, and the same every visit", () => {
    const a = scatter(seededRandom(9), plan, 120, 1, () => true);
    const b = scatter(seededRandom(9), plan, 120, 1, () => true);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(100);
    for (const [x, z] of a) {
      expect(plantable(plan, x, z, 1)).toBe(true);
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(townRadius(plan));
      for (const c of plan.clusters) {
        expect(Math.hypot(x - c.cx, z - c.cz)).toBeGreaterThan(c.r + 2);
        expect(Math.hypot(x - c.mast.x, z - c.mast.z)).toBeGreaterThan(5);
      }
    }
  });

  it("hears the sea only near the shore, loudest on the open east beach", () => {
    expect(seaSound(plan, 0, 0)).toBe(0);
    expect(seaSound(plan, plan.spawn.x, plan.spawn.z)).toBe(0);
    for (const c of plan.clusters) expect(seaSound(plan, c.cx, c.cz)).toBeLessThan(0.2);
    const east = seaSound(plan, plan.island.walk, 0);
    const west = seaSound(plan, -plan.island.walk, 0);
    expect(east).toBeGreaterThan(0.95);
    expect(west).toBeGreaterThan(0.3);
    expect(west).toBeLessThan(east * 0.5);
  });

  it("plants the palms on the east beach's dry sand, clear of the beach props and of each other", () => {
    const palms = beachSpots(seededRandom(5), plan, 18, plan.beach, 5);
    expect(palms).toEqual(beachSpots(seededRandom(5), plan, 18, plan.beach, 5));
    expect(palms.length).toBe(18);
    for (const [x, z] of palms) {
      expect(hillSide(x, z)).toBeLessThanOrEqual(0.2);
      expect(islandHeight(plan, x, z)).toBeGreaterThan(SEA_Y + 0.7);
      expect(Math.hypot(x, z)).toBeLessThan(plan.island.walk);
      for (const b of plan.beach) expect(Math.hypot(b.x - x, b.z - z)).toBeGreaterThanOrEqual(5);
    }
  });

  it("stands the parasols and sandcastles on dry sand on the east beach", () => {
    for (const b of plan.beach) {
      const r = Math.hypot(b.x, b.z);
      expect(r).toBeGreaterThan(plan.island.land);
      expect(r).toBeLessThan(plan.island.walk);
      expect(hillSide(b.x, b.z)).toBe(0);
      expect(islandHeight(plan, b.x, b.z)).toBeGreaterThan(SEA_Y + 0.6);
    }
  });
});
