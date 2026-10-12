import { describe, expect, it } from "vitest";
import type { Object3D } from "three";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import { SEA_Y, islandHeight, swellLift } from "./mapGround";
import { planFromLayout } from "./mapLayout";
import { buildPieces } from "./mapPieces";

const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
const plan = planFromLayout(layout, DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })));
const ground = (x: number, z: number) => islandHeight(plan, x, z);
const named = (root: Object3D, name: string) => {
  const out: Object3D[] = [];
  root.traverse((o) => o.name === name && out.push(o));
  return out;
};

describe("the set pieces on the island", () => {
  const built = buildPieces(plan, ground, false);

  it("stands every piece the plan places, each in its own holder", () => {
    for (const q of plan.pieces) expect(built.group.getObjectByName(`piece-${q.kind}`)).toBeTruthy();
    expect(built.group.children.filter((o) => o.name.startsWith("piece-"))).toHaveLength(plan.pieces.length);
  });

  it("gives the kid colliders that reach down to the ground under them", () => {
    expect(built.colliders.length).toBeGreaterThan(plan.pieces.length);
    for (const c of built.colliders) {
      expect(c.y).toBeLessThanOrEqual(ground(c.x, c.z));
      expect(c.y + c.h).toBeGreaterThan(ground(c.x, c.z) + 0.5);
    }
  });

  it("floats the pier's boats on the swell, rising and falling with the sea", () => {
    const boats = named(built.group, "boat");
    expect(boats).toHaveLength(2);
    for (const t of [3, 40]) {
      built.update(t);
      for (const b of boats) {
        const surface = SEA_Y + swellLift(t) - b.userData.sink;
        expect(Math.abs(b.position.y - surface)).toBeLessThanOrEqual(b.userData.bob + 1e-6);
      }
    }
  });

  it("turns the windmill's sails and the observatory's dome, and holds them still under reduced motion", () => {
    const spinning = named(built.group, "turns").map((g) => g.children[0]);
    expect(spinning).toHaveLength(2);
    built.update(1);
    const at1 = spinning.map((m) => m.rotation.y + m.rotation.z);
    built.update(9);
    spinning.forEach((m, i) => expect(m.rotation.y + m.rotation.z).not.toBeCloseTo(at1[i], 3));

    const still = buildPieces(plan, ground, true);
    const held = named(still.group, "turns").map((g) => g.children[0]);
    const before = held.map((m) => m.rotation.y + m.rotation.z);
    still.update(5);
    held.forEach((m, i) => expect(m.rotation.y + m.rotation.z).toBe(before[i]));
  });
});
