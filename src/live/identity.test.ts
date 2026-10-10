import { describe, expect, it } from "vitest";
import { deriveVisitor, sanitizeName, stripInvisible } from "./identity";

describe("received explorer names", () => {
  it("accepts every name the generator makes", () => {
    for (let i = 0; i < 2000; i++) {
      const v = deriveVisitor(`visitor-${i}-${(i * 2654435761) >>> 0}`, i % 4);
      expect(sanitizeName(v.name)).toBe(v.name);
    }
    expect(sanitizeName("Curious Sea Turtle 10")).toBe("Curious Sea Turtle 10");
    expect(sanitizeName("Zesty Crab 99")).toBe("Zesty Crab 99");
    expect(sanitizeName("  Zesty Crab 99 ")).toBe("Zesty Crab 99");
  });

  it("shows anything outside the generator's grammar as Explorer", () => {
    for (const bad of [
      "Free prizes at evil.example",
      "Map Staff: visit evil.example",
      "Map Staff",
      "Curious Manatee",
      "Curious Manatee 9",
      "Curious Manatee 100",
      "Curious Manatee 05",
      "curious manatee 42",
      "Curious  Manatee 42",
      "Curious Manatee 42 and friends",
      "Sneaky Manatee 42",
      "Curious Dragon 42",
      "Curious Manatee 42\nMap Staff",
      "",
    ])
      expect(sanitizeName(bad), bad).toBe("Explorer");
    for (const notText of [undefined, null, 42, {}, ["Curious Manatee 42"]]) expect(sanitizeName(notText)).toBe("Explorer");
    expect(sanitizeName(`Curious Manatee 42${" ".repeat(100)}`)).toBe("Explorer");
  });

  it("never shows bidi overrides or zero-width characters", () => {
    // U+202E renders the rest right to left: this reads "Map Staff" on screen.
    expect(sanitizeName("‮ffatS paM")).toBe("Explorer");
    expect(sanitizeName("Map Staff ‮moc.elpmaxe-live‬: claim prize")).toBe("Explorer");
    // Invisible characters are removed before the grammar check, so a real name still reads cleanly.
    expect(sanitizeName("Curious​ Manatee 42⁦")).toBe("Curious Manatee 42");
    expect(stripInvisible("a​b‍c‮d﻿e\u0007f⁠g")).toBe("abcdefg");
  });
});
