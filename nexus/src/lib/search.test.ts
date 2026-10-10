import { describe, expect, it } from "vitest";
import { NEXUS_URL, PROTOCOL, type ManifestCompany, type NetworkInstance } from "../../../federation/protocol.ts";
import { buildNetwork } from "./network.ts";
import { buildIndex, filterCompanies, fold, matches, searchNetwork } from "./search.ts";

function inst(id: string, name: string, companies: Partial<ManifestCompany>[], joined = "2026-09-01"): NetworkInstance {
  const list: ManifestCompany[] = companies.map((c, i) => ({ slug: `${id}-c${i}`, name: `C${i}`, district: "main", description: null, website: null, keywords: [], ...c }));
  return {
    entry: { id, name, url: `https://${id}.example.org`, joined, maintainer: "someone" },
    status: "verified",
    checked: "2026-10-01",
    logoFile: null,
    proof: "domain",
    problems: [],
    manifest: {
      protocol: PROTOCOL,
      id,
      name,
      publisher: { name: id === "prairie" ? "Plains Holdings" : name, website: null },
      url: `https://${id}.example.org`,
      tagline: null,
      logo: null,
      accent: "#3366ff",
      nexus: NEXUS_URL,
      framework: { name: "portfolio-map-3d", version: "1.0.0" },
      labels: { company: "company", companies: "companies", district: "track", districts: "tracks", people: null },
      counts: { companies: list.length, people: 0, districts: 1 },
      districts: [{ slug: "main", label: "FinTech", color: "#ff0000", count: list.length }],
      companies: list,
      updated: "2026-10-01",
    },
  };
}

const model = buildNetwork({
  protocol: PROTOCOL,
  generated: "2026-10-09",
  instances: [
    inst("harbor", "Harbor Ventures", [
      { name: "Robo Docks", keywords: ["robotics"], description: "Builds robots for ports." },
      { name: "Email Wizard", description: "Sends email for shops." },
      { name: "AI Ledger", keywords: ["ai", "accounting"] },
      { name: "Café Numérique", description: "Runs cafés." },
    ]),
    inst("prairie", "Prairie Lab", [{ name: "Harbor Freight Analytics", description: "Ships things." }, { name: "Field Robotics", keywords: ["robotics"] }], "2026-09-02"),
  ],
});
const index = buildIndex(model.worlds);
const names = (q: string) => searchNetwork(index, q).groups.map((g) => [g.world.id, g.worldMatch, g.companies.map((c) => c.company.name)]);

describe("fold and matches", () => {
  it("ignores case, accents and curly apostrophes", () => {
    expect(fold("Café ÉCOLE’s")).toBe("cafe ecole's");
    expect(matches("Café Numérique", "cafe numerique")).toBe(true);
  });

  it("needs every word, and short words only at a word start", () => {
    expect(matches("AI tools for shops", "ai shops")).toBe(true);
    expect(matches("AI tools for shops", "ai farms")).toBe(false);
    expect(matches("Sends email", "ai")).toBe(false);
    expect(matches("Sends email", "mai")).toBe(false);
    expect(matches("Sends email", "mail")).toBe(true);
    expect(matches("anything", "   ")).toBe(true);
  });
});

describe("searchNetwork", () => {
  it("finds companies by name, keyword and description, grouped by world", () => {
    expect(names("robotics")).toEqual([
      ["harbor", false, ["Robo Docks"]],
      ["prairie", false, ["Field Robotics"]],
    ]);
    expect(names("ports")).toEqual([["harbor", false, ["Robo Docks"]]]);
  });

  it("keeps the short-word rule: 'ai' finds AI, not email", () => {
    expect(names("ai")).toEqual([["harbor", false, ["AI Ledger"]]]);
  });

  it("finds a world by name without listing all its companies", () => {
    expect(names("prairie")).toEqual([["prairie", true, []]]);
  });

  it("combines a world's name with a company's own words", () => {
    expect(names("harbor robotics")).toEqual([["harbor", false, ["Robo Docks"]]]);
    // "Harbor" in a company's own name counts too, in another world.
    expect(names("harbor")).toEqual([
      ["harbor", true, []],
      ["prairie", false, ["Harbor Freight Analytics"]],
    ]);
  });

  it("finds a world by its publisher's name", () => {
    expect(names("plains")).toEqual([["prairie", true, []]]);
  });

  it("finds companies by their district's label", () => {
    expect(searchNetwork(index, "fintech").totalCompanies).toBe(6);
  });

  it("lists names that start with the query first and counts beyond the limit", () => {
    const r = searchNetwork(index, "fintech", { perWorld: 2, worlds: 12 });
    expect(r.groups[0].companies).toHaveLength(2);
    expect(r.groups[0].total).toBe(4);
    expect(r.totalWorlds).toBe(2);
    expect(searchNetwork(index, "c").groups.flatMap((g) => g.companies.map((c) => c.company.name))[0]).toBe("Café Numérique");
  });

  it("returns nothing for a blank query", () => {
    expect(searchNetwork(index, "  ")).toEqual({ groups: [], totalCompanies: 0, totalWorlds: 0 });
  });
});

describe("filterCompanies", () => {
  it("filters one world's companies by text and district", () => {
    const harbor = index.find((w) => w.world.id === "harbor")!;
    expect(filterCompanies(harbor, "", null)).toHaveLength(4);
    expect(filterCompanies(harbor, "email", null).map((c) => c.company.name)).toEqual(["Email Wizard"]);
    expect(filterCompanies(harbor, "", "other")).toHaveLength(0);
    // The world's own name does not filter its companies.
    expect(filterCompanies(harbor, "harbor", null)).toHaveLength(0);
  });
});
