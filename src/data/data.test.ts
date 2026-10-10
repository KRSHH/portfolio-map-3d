import { describe, expect, it } from "vitest";
import {
  COMPANIES,
  DISTRICTS,
  HAS_FINDER,
  HAS_PEOPLE,
  PEOPLE,
  SITE,
  companiesByDistrict,
  companiesTouching,
  companyBySlug,
  hostOf,
  initials,
  personBySlug,
  personInitials,
  serviceLabel,
  siteFile,
  withoutHonorific,
} from "./catalog";

// scripts/validate-site.mjs is plain JavaScript without type declarations: import it untyped and say what it returns.
const { validateSite } = (await import("../../scripts/validate-site.mjs" as string)) as { validateSite: () => { errors: string[]; warnings: string[] } };

describe("data contract", () => {
  it("passes the acceptance gate (whitelist, sources, vocabularies, personal data, files, manifest)", () => {
    expect(validateSite().errors).toEqual([]);
  });

  it("has every company in a district of the taxonomy", () => {
    expect(COMPANIES.length).toBeGreaterThan(0);
    const slugs = new Set(DISTRICTS.map((d) => d.slug));
    for (const m of COMPANIES) {
      expect(slugs.has(m.district)).toBe(true);
      for (const d of m.secondaryDistricts) expect(slugs.has(d)).toBe(true);
    }
    expect([...companiesByDistrict.values()].reduce((n, l) => n + l.length, 0)).toBe(COMPANIES.length);
  });

  it("gives every district the industries its companies buy as", () => {
    for (const d of DISTRICTS) expect(d.industries.length).toBeGreaterThan(0);
  });

  it("never marks unknown facts as empty strings", () => {
    for (const m of COMPANIES) {
      for (const k of ["description", "location", "linkedin", "providerPitch", "website", "logo"] as const) expect(m[k]).not.toBe("");
    }
  });

  it("sorts companies by name", () => {
    const names = COMPANIES.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });

  it("finds each company's logo file by its slug, and leaves the rest without one", () => {
    const withLogo = COMPANIES.filter((m) => m.logo).map((m) => m.slug);
    expect(withLogo.sort()).toEqual(["ampshare", "fernway-pay", "quietmind", "shelfmate", "signalforge", "tern-robotics"]);
    // The URL Vite serves the file at (small files inline as data URLs).
    expect(companyBySlug.get("signalforge")!.logo).toMatch(/^data:image\/svg\+xml|signalforge\.svg$/);
    expect(companyBySlug.get("shelfmate")!.logo).toMatch(/^data:image\/png|shelfmate\.png$/);
    expect(companyBySlug.get("brightpath-care")!.logo).toBeNull();
  });

  it("lists a company in a district it names as secondary", () => {
    const fintech = companiesTouching("fintech").map((m) => m.slug);
    expect(fintech).toContain("ledgerline-health");
    expect(fintech).toContain("ledgerly");
    expect(companiesByDistrict.get("fintech")!.map((m) => m.slug)).not.toContain("ledgerline-health");
  });

  it("turns on the provider finder and the people roster when the data has them", () => {
    expect(HAS_FINDER).toBe(COMPANIES.some((m) => m.services.length > 0));
    expect(HAS_FINDER).toBe(true);
    expect(HAS_PEOPLE).toBe(true);
  });

  it("reads the site's config and its brand files", () => {
    expect(SITE.network.id).toBe("example-collective");
    expect(siteFile(SITE.org.logo)).toMatch(/^data:image\/svg\+xml|logo\.svg$/);
    expect(siteFile(SITE.org.logoOnDark)).not.toBeNull();
    expect(siteFile("brand/missing.svg")).toBeNull();
    expect(siteFile(null)).toBeNull();
  });

  it("reads a website's host without www", () => {
    expect(hostOf("https://www.Signalforge.example/about")).toBe("signalforge.example");
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf(null)).toBeNull();
  });

  it("makes a company's initials from its first two words", () => {
    expect(initials("Tern Robotics")).toBe("TR");
    expect(initials("Signalforge")).toBe("SI");
    expect(initials("Lumen Grid AI")).toBe("LG");
  });
});

describe("people", () => {
  it("loads every person, with a headshot or none", () => {
    expect(PEOPLE).toHaveLength(6);
    for (const c of PEOPLE) {
      expect(c.name.trim()).not.toBe("");
      expect(c.title.trim()).not.toBe("");
      // The example site has no headshots: everyone gets an initials badge.
      expect(c.headshot).toBeNull();
    }
  });

  it("has no field linking a person to a company, district or industry", () => {
    const allowed = ["slug", "name", "title", "summary", "bio", "headshot", "linkedin", "focusAreas", "sources"];
    for (const c of PEOPLE) expect(Object.keys(c).sort()).toEqual([...allowed].sort());
    for (const c of PEOPLE) expect(companyBySlug.has(c.slug)).toBe(false);
  });

  it("labels every focus area from the services vocabulary", () => {
    for (const c of PEOPLE) for (const s of c.focusAreas) expect(serviceLabel.has(s)).toBe(true);
  });

  it("keeps the source's spelling of names", () => {
    expect(personBySlug.get("renee-castillo")?.name).toBe("Renée Castillo");
    expect(personBySlug.get("ada-lindqvist")?.title).toBe("Fundraising Coach");
  });

  it("sorts people by name, ignoring honorifics", () => {
    const names = PEOPLE.map((c) => withoutHonorific(c.name));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    expect(withoutHonorific("Dr. Ines Navarro")).toBe("Ines Navarro");
    expect(withoutHonorific("Prof Ines Navarro")).toBe("Ines Navarro");
  });

  it("makes initials from first and last name, skipping honorifics", () => {
    expect(personInitials("Dr. Ines Navarro")).toBe("IN");
    expect(personInitials("Nora O’Hare")).toBe("NO");
    expect(personInitials("Renée Castillo")).toBe("RC");
    expect(personInitials("Ada Maria Lindqvist")).toBe("AL");
    expect(personInitials("Cher")).toBe("CH");
  });
});
