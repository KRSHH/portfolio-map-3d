import { describe, expect, it } from "vitest";
import { COMPANIES, companyBySlug, districtBySlug } from "./catalog";
import { documentedLinks, findProviders, fitScore, genericTags, industriesOf, matchesText, potentialClients, potentialProviders, sharedTagPeers, type Labels } from "./graph";
import { LABELS } from "./labels";
import type { Company } from "./types";

/** A hand-made districts map: most like the example's, plus one whose companies are all nonprofits. */
const districts = new Map([
  ["health", { industries: ["healthcare", "life-sciences"] }],
  ["fintech", { industries: ["financial-services", "insurance"] }],
  ["commerce", { industries: ["retail-ecommerce", "consumers"] }],
  ["ai-data", { industries: ["technology"] }],
  ["community", { industries: ["nonprofits"] }],
]);
const labels: Labels = { industry: (s) => s, service: (s) => s, districts };

function company(over: Partial<Company> & { slug: string }): Company {
  return {
    name: over.slug,
    district: "ai-data",
    secondaryDistricts: [],
    tags: [],
    website: null,
    logo: null,
    description: null,
    descriptionSource: null,
    location: null,
    linkedin: null,
    founders: [],
    leaders: [],
    services: [],
    servesIndustries: [],
    businessModel: "B2B",
    keywords: [],
    providerPitch: null,
    connections: [],
    sources: [],
    ...over,
  };
}

const clinic = company({ slug: "clinic", district: "health", tags: ["Healthcare"] });
const cyber = company({ slug: "cyber", services: ["cybersecurity"], servesIndustries: ["healthcare", "financial-services"] });
const hr = company({ slug: "hr", services: ["hr-recruiting"], servesIndustries: ["startups", "small-business"] });
const generic = company({ slug: "generic", services: ["software-development"], servesIndustries: ["cross-industry"] });
const consumer = company({ slug: "consumer", district: "commerce", businessModel: "B2C", servesIndustries: ["consumers"] });
const partner = company({ slug: "partner", district: "community", tags: ["Community Partner"] });
const all = [clinic, cyber, hr, generic, consumer, partner];

describe("industriesOf", () => {
  it("maps a district to customer industries and adds stage segments", () => {
    expect(industriesOf(clinic, districts)).toEqual(expect.arrayContaining(["healthcare", "life-sciences", "startups", "small-business"]));
  });
  it("treats companies in a district whose only industry is nonprofits as nonprofits, not startups", () => {
    expect(industriesOf(partner, districts)).toContain("nonprofits");
    expect(industriesOf(partner, districts)).not.toContain("startups");
    expect(industriesOf(partner, districts)).not.toContain("small-business");
  });
  it("includes secondary districts", () => {
    const m = company({ slug: "x", district: "health", secondaryDistricts: ["fintech"] });
    expect(industriesOf(m, districts)).toEqual(expect.arrayContaining(["healthcare", "financial-services"]));
  });
  it("adds only the stage segments for a district it does not know", () => {
    expect(industriesOf(company({ slug: "x", district: "space" }), districts).sort()).toEqual(["small-business", "startups"]);
  });
  it("reads the example taxonomy's industries", () => {
    const m = companyBySlug.get("ledgerline-health")!;
    expect(industriesOf(m, districtBySlug)).toEqual(expect.arrayContaining(["healthcare", "life-sciences", "financial-services", "insurance", "startups"]));
  });
});

describe("fitScore", () => {
  it("returns null for companies that describe no business services", () => {
    expect(fitScore(consumer, industriesOf(clinic, districts), labels)).toBeNull();
  });
  it("ranks an industry-specific provider above a generic one", () => {
    const a = fitScore(cyber, industriesOf(clinic, districts), labels)!;
    const b = fitScore(generic, industriesOf(clinic, districts), labels)!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons.join(" ")).toMatch(/healthcare/);
  });
  it("filters by required service", () => {
    expect(fitScore(cyber, industriesOf(clinic, districts), labels, "hr-recruiting")).toBeNull();
    expect(fitScore(hr, industriesOf(clinic, districts), labels, "hr-recruiting")?.reasons[0]).toMatch(/Offers/);
  });
});

describe("potentialProviders / potentialClients", () => {
  it("never suggests a company to itself and orders by score", () => {
    const fits = potentialProviders(clinic, all, labels);
    expect(fits.map((f) => f.company.slug)).not.toContain("clinic");
    expect(fits[0].company.slug).toBe("cyber");
    for (let i = 1; i < fits.length; i++) expect(fits[i - 1].score).toBeGreaterThanOrEqual(fits[i].score);
  });
  it("finds who a provider could serve", () => {
    expect(potentialClients(cyber, all, labels).map((f) => f.company.slug)).toContain("clinic");
  });
  it("returns nothing for consumer-only companies", () => {
    expect(potentialClients(consumer, all, labels)).toEqual([]);
  });
  it("suggests the example's healthcare providers to a health company", () => {
    const quietmind = companyBySlug.get("quietmind")!;
    const fits = potentialProviders(quietmind, COMPANIES, LABELS).map((f) => f.company.slug);
    expect(fits).toEqual(expect.arrayContaining(["brightpath-care", "ledgerline-health"]));
    expect(fits).not.toContain("quietmind");
    expect(potentialClients(companyBySlug.get("roundup-savings")!, COMPANIES, LABELS)).toEqual([]);
  });
});

describe("findProviders", () => {
  it("returns only companies offering the requested service", () => {
    const r = findProviders({ service: "cybersecurity", industry: "healthcare", text: "" }, all, labels);
    expect(r.map((f) => f.company.slug)).toEqual(["cyber"]);
  });
  it("matches free text across descriptions and keywords", () => {
    const m = company({ slug: "video", services: ["media-content"], keywords: ["Brand video production"], servesIndustries: ["cross-industry"] });
    const r = findProviders({ service: null, industry: null, text: "video production" }, [...all, m], labels);
    expect(r.map((f) => f.company.slug)).toEqual(["video"]);
  });
  it("keeps only providers that serve the chosen industry or sell across industries, direct ones first", () => {
    const broad = company({ slug: "broad", services: ["cybersecurity"], servesIndustries: ["cross-industry", "startups"] });
    const retail = company({ slug: "retail", services: ["cybersecurity"], servesIndustries: ["retail-ecommerce"] });
    const r = findProviders({ service: "cybersecurity", industry: "healthcare", text: "" }, [...all, broad, retail], labels);
    expect(r.map((f) => f.company.slug)).toEqual(["cyber", "broad"]);
  });
  it("lists the same providers when only an industry is chosen", () => {
    const r = findProviders({ service: null, industry: "healthcare", text: "" }, all, labels);
    expect(r.map((f) => f.company.slug)).toEqual(["cyber", "generic"]);
  });
  it("puts direct providers first even when a cross-industry one scores higher", () => {
    const big = company({ slug: "big", services: ["data-analytics"], servesIndustries: ["enterprise"] });
    const broad = company({ slug: "broad", services: ["data-analytics"], servesIndustries: ["cross-industry", "startups"] });
    const r = findProviders({ service: null, industry: "enterprise", text: "" }, [broad, big], labels);
    expect(r.map((f) => f.company.slug)).toEqual(["big", "broad"]);
    expect(r[0].reasons).toEqual(["Serves enterprise"]);
  });
});

describe("findProviders on the example data", () => {
  const slugs = (service: string | null, industry: string | null) => findProviders({ service, industry, text: "" }, COMPANIES, LABELS).map((f) => f.company.slug);

  it("does not list providers of a service that serve neither the industry nor every industry", () => {
    const r = slugs("data-analytics", "healthcare");
    // Ledgerline Health serves healthcare; Signalforge sells across industries.
    expect(r).toEqual(["ledgerline-health", "signalforge"]);
    for (const s of ["datadock", "pocket-sensor"]) expect(r).not.toContain(s);
  });
  it("narrows an industry-only search to companies that serve it", () => {
    const withServices = COMPANIES.filter((m) => m.services.length).length;
    const r = slugs(null, "healthcare");
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(withServices / 2);
    for (const s of r) {
      const m = COMPANIES.find((x) => x.slug === s)!;
      expect(m.servesIndustries.some((i) => i === "healthcare" || i === "cross-industry")).toBe(true);
    }
    expect(r.slice(0, 2).sort()).toEqual(["brightpath-care", "ledgerline-health"]);
  });
  it("finds the nonprofits' bookkeeper", () => {
    expect(slugs("finance-operations", "nonprofits")).toEqual(["ledgerly"]);
  });
  it("gives every result a reason, for every industry", () => {
    for (const industry of ["healthcare", "enterprise", "startups", "small-business", "consumers", "agriculture", "nonprofits"]) {
      for (const f of findProviders({ service: null, industry, text: "" }, COMPANIES, LABELS)) expect(f.reasons.length).toBeGreaterThan(0);
    }
  });
  it("never lists a company that sells no services", () => {
    const r = slugs(null, null);
    for (const s of ["roundup-savings", "pawprint-supply", "cellwise-labs", "greenrow-farms"]) expect(r).not.toContain(s);
  });
});

describe("matchesText", () => {
  const m = company({
    slug: "acme",
    name: "Guardwise4",
    description: "Security awareness training for startups; email phishing tests. AI-assisted. HR teams and partners.",
    tags: ["Smart City"],
  });
  it("matches short words only at the start of a word", () => {
    expect(matchesText(m, "ai")).toBe(true); // "AI-assisted"
    expect(matchesText(company({ slug: "x", description: "Email and maintenance training" }), "ai")).toBe(false);
    expect(matchesText(company({ slug: "x", description: "For startups, partners and smart homes" }), "art")).toBe(false);
    expect(matchesText(company({ slug: "x", description: "Three channels" }), "hr")).toBe(false);
    expect(matchesText(m, "hr")).toBe(true);
  });
  it("matches words of four or more letters anywhere, so partial names work", () => {
    expect(matchesText(m, "guardwi")).toBe(true);
    expect(matchesText(m, "ishing")).toBe(true);
  });
  it("requires every word of the query, in any order", () => {
    expect(matchesText(m, "phishing email")).toBe(true);
    expect(matchesText(m, "phishing payroll")).toBe(false);
    expect(matchesText(m, "   ")).toBe(true);
  });
  it("treats regex characters literally", () => {
    expect(matchesText(company({ slug: "x", description: "C++ and .NET" }), "c++")).toBe(true);
    expect(matchesText(company({ slug: "x", description: "C++ and .NET" }), ".net")).toBe(true);
    expect(matchesText(company({ slug: "x", description: "plain" }), "(a")).toBe(false);
  });
  it("finds a company by its people, its location, and its services' and industries' labels", () => {
    // A fresh record per call style: searchText caches each company's text the first time it is built (the app always passes LABELS).
    const x = () => company({ slug: "x", founders: [{ name: "Ines Navarro", title: "Founder", source: { title: "t", kind: "org-records" } }], location: "Lisbon", services: ["payments-lending"], servesIndustries: ["insurance"] });
    const labeled = x();
    expect(matchesText(labeled, "navarro", LABELS)).toBe(true);
    expect(matchesText(labeled, "lisbon", LABELS)).toBe(true);
    expect(matchesText(labeled, "banking", LABELS)).toBe(true);
    expect(matchesText(labeled, "insurance", LABELS)).toBe(true);
    expect(matchesText(x(), "payments-lending")).toBe(true);
  });
  it("keeps the false hits for short queries down on the example data", () => {
    const count = (q: string) => COMPANIES.filter((x) => matchesText(x, q, LABELS)).length;
    expect(count("art")).toBeLessThan(10);
    expect(count("signalfo")).toBe(1);
    expect(count("pet")).toBe(1);
  });
});

describe("documentedLinks", () => {
  it("dedupes mirrored connections and drops links to unknown companies", () => {
    const a = company({ slug: "a", connections: [{ with: "b", kind: "partnership", summary: "s", source: { url: "https://x.test", title: "x" } }, { with: "ghost", kind: "other", summary: "s", source: { url: "https://x.test", title: "x" } }] });
    const b = company({ slug: "b", connections: [{ with: "a", kind: "partnership", summary: "s", source: { url: "https://x.test", title: "x" } }] });
    expect(documentedLinks([a, b])).toEqual([{ a: "a", b: "b", kind: "partnership", summary: "s", sourceUrl: "https://x.test" }]);
  });
  it("draws the example's documented connections once each, with no URL when the source has none", () => {
    const links = documentedLinks(COMPANIES);
    expect(links.map((l) => [l.a, l.b, l.kind]).sort()).toEqual([
      ["brightpath-care", "signalforge", "customer"],
      ["fernway-pay", "parsewell", "partnership"],
      ["signalforge", "tern-robotics", "shared-founder"],
    ]);
    for (const l of links) expect(l.sourceUrl).toBe("");
  });
});

describe("sharedTagPeers", () => {
  it("ignores generic tags: on more than a third of the companies, and on at least three", () => {
    const x = company({ slug: "x", tags: ["B2B", "AI"] });
    const y = company({ slug: "y", tags: ["B2B"] });
    const z = company({ slug: "z", tags: ["B2B"] });
    expect(genericTags([x, y, z])).toEqual(new Set(["B2B"]));
    expect(sharedTagPeers(x, [x, y, z])).toEqual([]);
    // Two companies are too few for any tag to be generic.
    expect(genericTags([x, y]).size).toBe(0);
    expect(sharedTagPeers(x, [x, y])).toEqual([y]);
  });
  it("finds peers by a specific tag", () => {
    const x = company({ slug: "x", tags: ["B2B", "AI"] });
    const w = company({ slug: "w", tags: ["AI"] });
    const others = ["y", "z"].map((slug) => company({ slug, tags: ["B2B"] }));
    expect(sharedTagPeers(x, [x, w, ...others])).toEqual([w]);
  });
  it("finds peers in the example data, never the company itself", () => {
    const peers = sharedTagPeers(companyBySlug.get("signalforge")!, COMPANIES).map((m) => m.slug);
    expect(peers).toEqual(expect.arrayContaining(["datadock", "contextual"]));
    expect(peers).not.toContain("signalforge");
  });
});
