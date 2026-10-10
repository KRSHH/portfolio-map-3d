import { describe, expect, it } from "vitest";
import { declutter, overlaps, type Rect } from "./declutter.ts";

const r = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h });
const screen = r(0, 0, 1000, 800);

describe("declutter", () => {
  it("keeps labels that do not touch", () => {
    expect(declutter([{ rect: r(10, 10, 100, 40), priority: 1 }, { rect: r(300, 10, 100, 40), priority: 2 }], screen)).toEqual([true, true]);
  });

  it("hides the lower-priority label of an overlapping pair, whatever the input order", () => {
    const near = { rect: r(100, 100, 200, 50), priority: 1 };
    const far = { rect: r(150, 120, 200, 50), priority: 5 };
    expect(declutter([far, near], screen)).toEqual([false, true]);
    expect(declutter([near, far], screen)).toEqual([true, false]);
  });

  it("always shows a pinned label, and it claims its space", () => {
    const pinned = { rect: r(100, 100, 200, 50), priority: 9, pinned: true };
    const near = { rect: r(150, 120, 200, 50), priority: 1 };
    expect(declutter([near, pinned], screen)).toEqual([false, true]);
    expect(declutter([{ ...pinned, rect: r(-50, 0, 100, 40) }], screen)).toEqual([true]);
  });

  it("hides labels that leave the visible area (under the HUD or the headline)", () => {
    const area = r(400, 70, 600, 730);
    expect(declutter([{ rect: r(380, 200, 100, 40), priority: 1 }, { rect: r(500, 200, 100, 40), priority: 2 }], area)).toEqual([false, true]);
  });

  it("keeps a gap between labels", () => {
    expect(overlaps(r(0, 0, 10, 10), r(14, 0, 10, 10), 6)).toBe(true);
    expect(overlaps(r(0, 0, 10, 10), r(17, 0, 10, 10), 6)).toBe(false);
  });

  it("handles many labels", () => {
    const boxes = Array.from({ length: 200 }, (_, i) => ({ rect: r((i * 37) % 900, (i * 53) % 760, 120, 30), priority: i }));
    const shown = declutter(boxes, screen);
    const kept = boxes.filter((_, i) => shown[i]).map((b) => b.rect);
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) expect(overlaps(kept[i], kept[j], 6)).toBe(false);
    expect(shown[0]).toBe(true);
  });
});
