import { describe, expect, it } from "vitest";
import { composite, contrast, inkOn, mix, muted, parseCssColor, parseHex } from "./color.ts";

describe("color", () => {
  it("parses hex and rgb(a)", () => {
    expect(parseHex("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("red")).toBeNull();
    expect(parseCssColor("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30, 0.5]);
    expect(parseCssColor("rgb(1,2,3)")).toEqual([1, 2, 3, 1]);
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("picks the ink that reads on a color, always at least 4.5:1 on mid tones", () => {
    for (const c of ["#4cc9f0", "#f72585", "#80ed99", "#ffb703", "#9d7bff", "#2ec4b6", "#3366ff", "#000000", "#ffffff", "#808080"]) {
      expect(contrast(inkOn(c), c)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("mixes, mutes and composites", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(muted("#ff0000", 1)).toBe("#4c4c4c");
    expect(composite([255, 255, 255, 0.5], [0, 0, 0])).toEqual([127.5, 127.5, 127.5]);
  });
});
