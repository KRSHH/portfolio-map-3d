import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicData } from "../vite.config.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(root, "site", f), "utf8"));

describe("publicData (what the production bundle keeps of site/)", () => {
  const companies = read("data/companies.json");
  const out = publicData("companies.json", structuredClone(companies));
  const text = JSON.stringify(out);

  it("drops provenance: sources, descriptionSource, founders' and leaders' sources, the _about note", () => {
    expect(out._about).toBeUndefined();
    for (const m of out.companies) {
      for (const k of ["sources", "descriptionSource"]) expect(m).not.toHaveProperty(k);
      for (const p of [...m.founders, ...m.leaders]) expect(p).not.toHaveProperty("source");
      for (const c of m.connections) for (const k of Object.keys(c.source)) expect(k).toBe("url");
    }
    expect(text).not.toMatch(/descriptionSource|org-records|company-supplied|"sources"|_about/);
    // The data does carry those sources; the bundle must not.
    expect(JSON.stringify(companies)).toMatch(/org-records/);
  });

  it("keeps a connection's source URL only (graph.ts reads it)", () => {
    const withUrl = structuredClone(companies);
    const c = withUrl.companies.find((m) => m.connections.length).connections[0];
    c.source = { url: "https://news.example/partnership", title: "A press release", retrieved: "2026-10-09" };
    const kept = publicData("companies.json", withUrl).companies.find((m) => m.connections.length).connections[0];
    expect(kept.source).toEqual({ url: "https://news.example/partnership" });
  });

  it("keeps everything else the app shows, unchanged", () => {
    expect(out.companies).toHaveLength(companies.companies.length);
    out.companies.forEach((m, i) => {
      const src = companies.companies[i];
      for (const k of ["slug", "name", "district", "secondaryDistricts", "tags", "website", "description", "location", "linkedin", "services", "servesIndustries", "businessModel", "keywords", "providerPitch"])
        expect(m[k]).toEqual(src[k]);
      expect(m.founders.map((p) => [p.name, p.title, p.linkedin])).toEqual(src.founders.map((p) => [p.name, p.title, p.linkedin]));
      expect(m.leaders.map((p) => [p.name, p.title, p.linkedin])).toEqual(src.leaders.map((p) => [p.name, p.title, p.linkedin]));
      expect(m.connections.map((c) => [c.with, c.kind, c.summary, c.source.url])).toEqual(src.connections.map((c) => [c.with, c.kind, c.summary, c.source.url]));
    });
  });

  it("keeps a logo plate override", () => {
    const plated = structuredClone(companies);
    plated.companies[0].logoPlate = "dark";
    expect(publicData("companies.json", plated).companies[0].logoPlate).toBe("dark");
  });

  it("drops people's sources and keeps the rest", () => {
    const people = read("data/people.json");
    const p = publicData("people.json", structuredClone(people));
    expect(p._about).toBeUndefined();
    expect(p.people).toHaveLength(people.people.length);
    p.people.forEach((x, i) => {
      expect(x).not.toHaveProperty("sources");
      const { sources, ...rest } = people.people[i];
      void sources;
      expect(x).toEqual(rest);
    });
    expect(JSON.stringify(p)).not.toMatch(/org-records|company-supplied/);
  });

  it("drops the taxonomy's notes and palette record, and keeps the vocabularies", () => {
    const taxonomy = read("taxonomy.json");
    const noted = structuredClone(taxonomy);
    noted.districts[0].note = "Editors' note: what belongs here.";
    const t = publicData("taxonomy.json", noted);
    expect(t._about).toBeUndefined();
    expect(t._palette).toBeUndefined();
    expect(t.districts[0]).not.toHaveProperty("note");
    expect(t.districts).toEqual(taxonomy.districts);
    for (const k of ["services", "industriesServed", "connectionKinds"]) expect(t[k]).toEqual(taxonomy[k]);
  });

  it("drops site.json's schema reference only", () => {
    const site = read("site.json");
    const s = publicData("site.json", structuredClone(site));
    expect(s.$schema).toBeUndefined();
    const { $schema, ...rest } = site;
    void $schema;
    expect(s).toEqual(rest);
  });
});
