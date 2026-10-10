import { describe, expect, it } from "vitest";
import { DISTRICTS, COMPANIES, PEOPLE } from "../../data/catalog";
import { PORTAL, portalPosts } from "../../data/hub";
import { layoutWorld } from "../../data/layout";
import { portalStateAt } from "./engine";

/** A point `along` units in front of the portal's face (toward the spawn) and `across` units to its side. */
const at = (along: number, across = 0) => ({
  x: PORTAL.x + Math.sin(PORTAL.facing) * along + Math.cos(PORTAL.facing) * across,
  z: PORTAL.z + Math.cos(PORTAL.facing) * along - Math.sin(PORTAL.facing) * across,
});
const state = (p: { x: number; z: number }) => portalStateAt(p.x, p.z);

describe("portalStateAt (the walker and the Nexus portal)", () => {
  it("is inside at the center of the ring, and across its opening", () => {
    expect(portalStateAt(PORTAL.x, PORTAL.z)).toBe("inside");
    expect(state(at(0.5))).toBe("inside");
    expect(state(at(-0.5))).toBe("inside");
    expect(state(at(0, 1.5))).toBe("inside");
    expect(state(at(0, -1.5))).toBe("inside");
  });

  it("is near a few units in front of the ring, and behind it", () => {
    expect(state(at(4))).toBe("near");
    expect(state(at(-4))).toBe("near");
  });

  it("is near, not inside, between the posts but off the ring's plane", () => {
    const [a, b] = portalPosts();
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    expect(state(mid)).toBe("inside");
    for (const along of [1, 1.5, 2, -1.5]) expect(state(at(along))).toBe("near");
    // Beside a post, in the ring's plane but outside the opening.
    expect(state(at(0, PORTAL.r + 0.6))).toBe("near");
  });

  it("is far at the spawn and across the plaza", () => {
    const world = layoutWorld(
      DISTRICTS.map((d) => d.slug),
      COMPANIES,
      PEOPLE,
    );
    expect(portalStateAt(world.spawn.x, world.spawn.z)).toBe("far");
    expect(portalStateAt(0, 0)).toBe("far");
    expect(state(at(12))).toBe("far");
  });

  it("is pure: the same place always gives the same answer", () => {
    const p = at(0.3, 1);
    expect(state(p)).toBe(state(p));
  });
});
