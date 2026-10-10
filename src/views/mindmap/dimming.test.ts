import { describe, expect, it } from "vitest";
import { EMPHASIS, badgeDim, dimmedContrast, emphasisOf, luminance } from "./dimming";

const INK = luminance("#1d1f24");
const WHITE = luminance("#ffffff");
const PAPER = luminance("#f7fafb"); // --mindmap-bg-top: the fade color, in both themes

describe("emphasisOf", () => {
  const base = { inHighlight: true, hasSelection: false, selectedOrRelated: false, sameRegion: false };
  it("keeps everyone at full strength with no highlight and nothing open", () => {
    expect(emphasisOf(base)).toBe(EMPHASIS.full);
  });
  it("steps back companies outside the highlight", () => {
    expect(emphasisOf({ ...base, inHighlight: false })).toBe(EMPHASIS.miss);
  });
  it("keeps the open company and its links bright, its region readable, the rest back", () => {
    const sel = { ...base, hasSelection: true };
    expect(emphasisOf({ ...sel, selectedOrRelated: true, inHighlight: false })).toBe(EMPHASIS.full);
    expect(emphasisOf({ ...sel, sameRegion: true })).toBe(EMPHASIS.peer);
    expect(emphasisOf(sel)).toBe(EMPHASIS.other);
    expect(emphasisOf({ ...sel, sameRegion: true, inHighlight: false })).toBe(EMPHASIS.miss);
  });
});

describe("badgeDim", () => {
  it("leaves a full-strength badge untouched", () => {
    expect(badgeDim(1)).toEqual({ opacity: 1, fade: 0 });
  });
  it("is monotonic and bounded, and treats bad input as full strength", () => {
    let prev = badgeDim(1);
    for (let e = 0.95; e >= 0; e -= 0.05) {
      const d = badgeDim(e);
      expect(d.fade).toBeGreaterThanOrEqual(prev.fade);
      expect(d.opacity).toBeLessThanOrEqual(prev.opacity);
      prev = d;
    }
    expect(badgeDim(Number.NaN)).toEqual({ opacity: 1, fade: 0 });
    expect(badgeDim(-3)).toEqual(badgeDim(0));
  });
  it("keeps a dimmed ink logo at 3:1 or better against its white plate on the near-white globe", () => {
    for (const e of Object.values(EMPHASIS)) expect(dimmedContrast(e, INK, WHITE, PAPER, PAPER)).toBeGreaterThanOrEqual(3);
  });
  it("still sets dimmed badges clearly apart from the highlighted ones", () => {
    const full = dimmedContrast(1, INK, WHITE, PAPER, PAPER);
    expect(full).toBeGreaterThan(14);
    expect(dimmedContrast(EMPHASIS.miss, INK, WHITE, PAPER, PAPER)).toBeLessThan(full / 3);
    expect(dimmedContrast(EMPHASIS.other, INK, WHITE, PAPER, PAPER)).toBeLessThan(full / 2);
  });
  it("is gentler than the fade it replaces, which left ink logos near 1.9:1", () => {
    const old = (e: number) => {
      const fade = (1 - e) * 0.5;
      const op = 0.82 + 0.18 * e;
      const shade = (c: number) => (c + (PAPER - c) * fade) * op + PAPER * (1 - op);
      return (shade(WHITE) + 0.05) / (shade(INK) + 0.05);
    };
    expect(old(EMPHASIS.miss)).toBeLessThan(2);
    expect(dimmedContrast(EMPHASIS.miss, INK, WHITE, PAPER, PAPER)).toBeGreaterThan(old(EMPHASIS.miss) * 1.5);
  });
});
