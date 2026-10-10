import { describe, expect, it } from "vitest";
import { planetEntryHref } from "./entry.ts";

describe("entering a planet", () => {
  it("opens the framework walk view beneath its published base path", () => {
    expect(planetEntryHref({ id: "example-collective", url: "https://wearenexus.xyz/example" }))
      .toBe("https://wearenexus.xyz/example/?from=nexus&view=walk");
  });
  it("opens the geographical walk page beneath the India project path", () => {
    expect(planetEntryHref({ id: "india-ecosystem-map", url: "https://fritzhand.github.io/startup-india-guide" }))
      .toBe("https://fritzhand.github.io/startup-india-guide/walkable-map.html?from=nexus");
    expect(planetEntryHref({ id: "florida-ecosystem-map", url: "https://map.embarccollective.com/" }))
      .toBe("https://map.embarccollective.com/walkable-map.html?from=nexus");
  });
  it("opens every other map on its published server", () => {
    expect(planetEntryHref({ id: "embarc-collective", url: "https://community.embarccollective.com" }))
      .toBe("https://community.embarccollective.com/?from=nexus&view=walk");
  });
});
