import { describe, expect, it } from "vitest";
import { inkBox } from "./logoInk";

/** A w×h RGBA buffer with ink (alpha 255) in the given rectangles. */
function art(w: number, h: number, rects: [number, number, number, number][]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, rw, rh] of rects)
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) d[(j * w + i) * 4 + 3] = 255;
  return d;
}

describe("inkBox", () => {
  it("finds the inked part of an artboard with empty space on one side", () => {
    // A wordmark set in a box twice as wide as its letters: the ink ends at a third of the width.
    expect(inkBox(art(60, 20, [[2, 4, 10, 12], [14, 6, 6, 8]]), 60, 20)).toEqual({ x: 2, y: 4, w: 18, h: 12 });
  });

  it("is the whole artboard when the ink fills it", () => {
    expect(inkBox(art(8, 4, [[0, 0, 8, 4]]), 8, 4)).toEqual({ x: 0, y: 0, w: 8, h: 4 });
  });

  it("ignores the faintest pixels (antialiasing haze)", () => {
    const d = art(10, 10, [[3, 3, 2, 2]]);
    d[3] = 5;
    expect(inkBox(d, 10, 10)).toEqual({ x: 3, y: 3, w: 2, h: 2 });
  });

  it("finds nothing on an empty artboard", () => {
    expect(inkBox(art(10, 10, []), 10, 10)).toBeNull();
  });
});
