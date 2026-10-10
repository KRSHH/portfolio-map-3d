/* The Nexus's color pairs meet WCAG AA: text on its backgrounds at 4.5:1 or better, read
   straight from tokens.css. A glass HUD panel is checked over pure white, the brightest thing
   the 3D scene can put behind it. */
import { describe, expect, it } from "vitest";
import { composite, contrast, parseCssColor, type RGB } from "../lib/color.ts";
import { readFileSync } from "node:fs";

// Read from disk, not as a `?raw` import: the root test run (npm test, CI) does not process CSS.
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`--${name} is not in tokens.css`);
  return m[1].trim();
}

function solid(name: string, over: RGB = [0, 0, 0]): RGB {
  const c = parseCssColor(token(name));
  if (!c) throw new Error(`--${name} is not a color`);
  return composite(c, over);
}

describe("tokens.css contrast", () => {
  const bg = solid("bg");
  const pairs: [string, string][] = [
    ["text", "bg"],
    ["text-muted", "bg"],
    ["text-faint", "bg"],
    ["text", "surface"],
    ["text-muted", "surface"],
    ["text-faint", "surface"],
    ["link", "bg"],
    ["link", "surface"],
    ["accent-ink", "accent"],
    ["accent-ink", "accent-hover"],
    ["warn-ink", "warn"],
    ["problem", "surface"],
    ["unreachable", "surface"],
  ];
  for (const [fg, back] of pairs) {
    it(`--${fg} on --${back} is at least 4.5:1`, () => {
      expect(contrast(solid(fg), solid(back, bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("keeps HUD text legible on glass over the brightest scene", () => {
    const white: RGB = [255, 255, 255];
    const glass = solid("glass", white);
    for (const fg of ["text", "text-muted", "link"]) expect(contrast(solid(fg), glass), fg).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus ring visible on the background (3:1 for non-text)", () => {
    expect(contrast(solid("focus"), bg)).toBeGreaterThanOrEqual(3);
  });
});
