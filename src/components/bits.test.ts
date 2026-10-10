import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../data/catalog";
import { DISTRICT_ICONS } from "./bits";

describe("district icons", () => {
  // DistrictIcon falls back to Layers for a name it does not know, so a missing entry would show
  // the wrong icon on chips, labels and the walk world's landmark emblems.
  it("maps every taxonomy district's icon to a lucide glyph", () => {
    for (const d of DISTRICTS) expect(DISTRICT_ICONS[d.icon], `${d.slug}: icon "${d.icon}"`).toBeDefined();
  });

  it("gives every district its own icon", () => {
    const icons = DISTRICTS.map((d) => d.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
