import { describe, expect, it } from "vitest";
import { capitalize, countLine, formatDate, hostOf, initials, peopleLine, proofLine, publisherLine, shortCountLine } from "./copy.ts";

const labels = { company: "startup", companies: "startups", district: "track", districts: "tracks", people: "mentors" };

describe("count lines", () => {
  it("speak the instance's own labels, singular and plural", () => {
    expect(countLine({ labels, counts: { companies: 46, people: 3, districts: 4 } })).toBe("46 startups in 4 tracks");
    expect(countLine({ labels, counts: { companies: 1, people: 0, districts: 1 } })).toBe("1 startup in 1 track");
    expect(shortCountLine({ labels, counts: { companies: 0, people: 0, districts: 2 } })).toBe("0 startups · 2 tracks");
  });

  it("mention people only when the instance counts them", () => {
    expect(peopleLine({ labels, counts: { companies: 1, people: 12, districts: 1 } })).toBe("12 mentors");
    expect(peopleLine({ labels, counts: { companies: 1, people: 0, districts: 1 } })).toBeNull();
    expect(peopleLine({ labels: { ...labels, people: null }, counts: { companies: 1, people: 4, districts: 1 } })).toBeNull();
  });
});

describe("publisher and proof", () => {
  it("names the publisher only when it differs from the map", () => {
    expect(publisherLine({ name: "Ambition Accelerated", publisher: { name: "Embarc Collective", website: null } })).toBe("Published by Embarc Collective");
    expect(publisherLine({ name: "Acme", publisher: { name: "Acme", website: null } })).toBeNull();
  });

  it("says how the publisher vouched for the map", () => {
    expect(proofLine("domain", "https://www.acme.vc")).toBe("Verified: on acme.vc");
    expect(proofLine("dns", "https://acme.vc/about")).toBe("Verified: DNS record on acme.vc");
    expect(proofLine("link", "https://acme.vc")).toBe("Verified: linked from acme.vc");
    expect(proofLine("maintainer", null)).toBe("Verified by the network's maintainers");
    expect(proofLine("domain", null)).toBe("Verified");
    expect(proofLine(null, "https://acme.vc")).toBeNull();
  });
});

describe("initials", () => {
  it("takes up to two letters, skipping small words", () => {
    expect(initials("Sample Harbor Ventures")).toBe("SH");
    expect(initials("The Lab")).toBe("L");
    expect(initials("acme")).toBe("A");
    expect(initials("Énergie & Co")).toBe("ÉC");
    expect(initials("The")).toBe("T");
  });
});

describe("small formatters", () => {
  it("capitalize, hostOf and formatDate", () => {
    expect(capitalize("tracks")).toBe("Tracks");
    expect(capitalize("")).toBe("");
    expect(hostOf("https://map.example.org")).toBe("map.example.org");
    expect(hostOf("https://example.org/map")).toBe("example.org/map");
    expect(formatDate("2026-10-09")).toBe("October 9, 2026");
    expect(formatDate("soon")).toBe("soon");
    expect(formatDate(null)).toBe("");
  });
});
