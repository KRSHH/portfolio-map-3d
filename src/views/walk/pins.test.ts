import { describe, expect, it } from "vitest";
import { luminance } from "../mindmap/dimming";
import { FADED, badgeOpacity, lensFade, nearFade } from "./pins";

const INK = luminance("#1d1f24");
const GRASS = luminance("#a9cf8a"); // --scene-grass
const PLAZA = luminance("#f3eee4"); // --scene-plaza

/** Contrast of an ink logo against its white plate, both drawn at opacity a over a background. */
function contrastOver(a: number, bg: number): number {
  const plate = a + bg * (1 - a);
  const logo = a * INK + bg * (1 - a);
  return (plate + 0.05) / (logo + 0.05);
}

describe("walk badge opacity", () => {
  it("fades badges right in front of the lens, and only those", () => {
    expect(nearFade(40)).toBe(1);
    expect(nearFade(10)).toBe(1);
    expect(nearFade(7)).toBeCloseTo(0.61, 2);
    expect(nearFade(4)).toBe(0.22);
    expect(nearFade(1)).toBe(0.22);
  });

  it("caps a pin's opacity by the near fade instead of multiplying the two", () => {
    expect(badgeOpacity(1, 40)).toBe(1);
    expect(badgeOpacity(FADED, 40)).toBe(FADED);
    // Close to the lens a dimmed pin is as visible as any other close pin, not 0.25 × 0.22 = 0.055.
    expect(badgeOpacity(FADED, 2)).toBe(badgeOpacity(1, 2));
    expect(badgeOpacity(FADED, 2)).toBeGreaterThanOrEqual(0.22);
  });

  it("keeps a dimmed logo readable over the ground, and apart from the highlighted ones", () => {
    expect(contrastOver(FADED, GRASS)).toBeGreaterThanOrEqual(3);
    expect(contrastOver(FADED, PLAZA)).toBeGreaterThanOrEqual(2.4);
    expect(contrastOver(1, GRASS) / contrastOver(FADED, GRASS)).toBeGreaterThan(4);
  });
});


describe("lensFade", () => {
  it("leaves badges at a normal distance solid", () => {
    expect(lensFade(20, false)).toBe(1);
    expect(lensFade(20, true, 16)).toBe(1);
  });

  it("keeps the logo curve for logos, wherever the walker is", () => {
    expect(lensFade(4, false, 16)).toBeCloseTo(0.22);
    expect(lensFade(7, false, 16)).toBeCloseTo(0.61);
  });

  it("fades a person's face that stands between the camera and the walker", () => {
    // After a fly-to the camera is 16 back; a neighbor person 10 from the lens would fill a corner.
    expect(lensFade(10.8, true, 16)).toBeCloseTo(0.1);
    expect(lensFade(13, true, 16)).toBeLessThan(0.6);
    // Beside or ahead of the walker: solid.
    expect(lensFade(15, true, 16)).toBe(1);
    expect(lensFade(30, true, 16)).toBe(1);
    // Nearer is never more solid.
    for (let d = 1; d < 20; d += 0.5) expect(lensFade(d, true, 16)).toBeLessThanOrEqual(lensFade(d + 0.5, true, 16) + 1e-9);
  });
});
