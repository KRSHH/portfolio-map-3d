import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../../data/catalog";
import { regionButtonName } from "./labels";

describe("regionButtonName", () => {
  it("starts with the visible short name for every district (WCAG 2.5.3)", () => {
    for (const d of DISTRICTS) {
      const name = regionButtonName(d, 12);
      expect(name.startsWith(d.short)).toBe(true);
      expect(name).toContain(d.label);
      expect(name.endsWith(": 12 companies")).toBe(true);
    }
  });

  it("leads with the short name when the full name does not start with it", () => {
    expect(regionButtonName({ short: "Proptech", label: "Real Estate, Construction & Home" }, 12)).toBe("Proptech (Real Estate, Construction & Home): 12 companies");
    expect(regionButtonName({ short: "Commerce", label: "Consumer, Commerce & Marketplaces" }, 3)).toBe("Commerce (Consumer, Commerce & Marketplaces): 3 companies");
  });

  it("does not repeat a short name the full name already starts with", () => {
    expect(regionButtonName({ short: "Health", label: "Health & Life Sciences" }, 29)).toBe("Health & Life Sciences: 29 companies");
    expect(regionButtonName({ short: "Mobility", label: "Mobility, Logistics & Supply Chain" }, 5)).toBe("Mobility, Logistics & Supply Chain: 5 companies");
    expect(regionButtonName({ short: "AI & Data", label: "AI & Data" }, 9)).toBe("AI & Data: 9 companies");
    // A prefix that ends mid-word is not the same word.
    expect(regionButtonName({ short: "Fin", label: "Fintech" }, 2)).toBe("Fin (Fintech): 2 companies");
  });

  it("uses the singular for one company", () => {
    expect(regionButtonName({ short: "Hardware", label: "Hardware & Deep Tech" }, 1)).toBe("Hardware & Deep Tech: 1 company");
    expect(regionButtonName({ short: "Hardware", label: "Hardware & Deep Tech" }, 0)).toBe("Hardware & Deep Tech: 0 companies");
  });
});
