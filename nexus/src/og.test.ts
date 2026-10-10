import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const png = readFileSync(new URL("../public/og.png", import.meta.url));
const meta = (attr: "property" | "name", key: string) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? null;

describe("the link-preview image", () => {
  it("is a 1200 x 630 PNG in public/, small enough for every preview crawler", () => {
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    // The IHDR chunk: width and height, big-endian, at bytes 16 and 20.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(1024 * 1024);
  });

  it("is named by absolute URL for Open Graph and for X, with its size and a description", () => {
    expect(meta("property", "og:image")).toBe("__NEXUS_URL__/og.png");
    expect(meta("name", "twitter:image")).toBe("__NEXUS_URL__/og.png");
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:alt")?.trim()).toBeTruthy();
  });
});
