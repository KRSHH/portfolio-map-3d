import { describe, expect, it } from "vitest";
import { LIMITS, NEXUS_URL, PROTOCOL } from "../federation/protocol.ts";
import { validateManifest } from "../federation/validate.ts";
import { brandPath, buildManifest, readSite } from "./manifest.mjs";

const site = readSite();
/** The example site with one change, its manifest built on a fixed day. */
const build = (change = () => {}) => {
  const s = structuredClone(site);
  change(s);
  return buildManifest(s, "2026-10-09");
};

describe("buildManifest (the map's public manifest for the network)", () => {
  const m = build();

  it("builds a valid manifest from the example site", () => {
    expect(validateManifest(m)).toEqual([]);
    expect(m).toMatchObject({ protocol: PROTOCOL, id: site.site.network.id, name: site.site.org.name, url: site.site.map.url, nexus: NEXUS_URL, updated: "2026-10-09" });
    expect(m.framework).toEqual({ name: "portfolio-map-3d", version: site.version });
  });

  it("counts what the data holds", () => {
    expect(m.counts).toEqual({ companies: site.companies.length, people: site.people.length, districts: site.taxonomy.districts.length });
    expect(m.companies.map((c) => c.slug)).toEqual(site.companies.map((c) => c.slug));
    expect(m.districts.map((d) => d.slug)).toEqual(site.taxonomy.districts.map((d) => d.slug));
    for (const d of m.districts) expect(d.count).toBe(site.companies.filter((c) => c.district === d.slug).length);
    expect(m.districts.reduce((n, d) => n + d.count, 0)).toBe(site.companies.length);
  });

  it("carries the light index only: no sources, people or provider data", () => {
    for (const c of m.companies) expect(Object.keys(c).sort()).toEqual(["description", "district", "keywords", "name", "slug", "website"]);
    expect(JSON.stringify(m)).not.toMatch(/descriptionSource|org-records|company-supplied|"sources"|founders|leaders/);
  });

  it("copies descriptions verbatim, and leaves out one too long rather than cutting it", () => {
    m.companies.forEach((c, i) => expect(c.description).toBe(site.companies[i].description));
    const long = build((s) => (s.companies[0].description = `${"Words ".repeat(70)}end.`));
    expect(long.companies[0].description).toBeNull();
    expect(validateManifest(long)).toEqual([]);
    const edge = build((s) => (s.companies[0].description = "x".repeat(LIMITS.description)));
    expect(edge.companies[0].description).toHaveLength(LIMITS.description);
  });

  it("drops every description when the site does not share them", () => {
    const quiet = build((s) => (s.site.network.shareDescriptions = false));
    expect(quiet.companies.every((c) => c.description === null)).toBe(true);
    expect(validateManifest(quiet)).toEqual([]);
  });

  it("keeps only https websites", () => {
    const plain = build((s) => {
      s.companies[0].website = "http://brightpath-care.example";
      s.companies[1].website = null;
    });
    expect(plain.companies[0].website).toBeNull();
    expect(plain.companies[1].website).toBeNull();
    expect(plain.companies[2].website).toBe(site.companies[2].website);
    expect(validateManifest(plain)).toEqual([]);
  });

  it("keeps keywords within the protocol's limits", () => {
    const many = build((s) => (s.companies[0].keywords = [...Array.from({ length: 20 }, (_, i) => `keyword ${i}`), "k".repeat(LIMITS.keyword + 1)]));
    expect(many.companies[0].keywords).toHaveLength(LIMITS.keywords);
    expect(many.companies[0].keywords.every((k) => k.length <= LIMITS.keyword)).toBe(true);
  });

  it("names the logo at its public address, and says nothing of people when there are none", () => {
    expect(m.logo).toBe(`${site.site.map.url}${brandPath(site.site.org.logo)}`);
    expect(build((s) => (s.site.org.logo = null)).logo).toBeNull();
    expect(m.labels.people).toBe(site.site.labels.people);
    const none = build((s) => (s.people = []));
    expect(none.labels.people).toBeNull();
    expect(none.counts.people).toBe(0);
    expect(validateManifest(none)).toEqual([]);
  });

  it("leaves out a tagline longer than the protocol allows", () => {
    expect(m.tagline).toBe(site.site.map.tagline);
    expect(build((s) => (s.site.map.tagline = "t".repeat(LIMITS.tagline + 1))).tagline).toBeNull();
  });
});
