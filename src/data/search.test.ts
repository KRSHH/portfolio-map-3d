import { describe, expect, it } from "vitest";
import { PEOPLE, COMPANIES, personBySlug } from "./catalog";
import { LABELS } from "./labels";
import { personMatches, personSearchText, nameStartsWith, searchAll } from "./search";
import type { Person } from "./types";

const person = (slug: string): Person => personBySlug.get(slug)!;

/** A fictional person who is not in the example data, for spellings it does not have. */
const fixture = (name: string, title: string, bio: string[] = []): Person => ({
  slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name,
  title,
  summary: bio[0] ?? null,
  bio,
  headshot: null,
  linkedin: null,
  focusAreas: [],
  sources: [{ title: "Test fixture", kind: "org-records" }],
});

describe("person search", () => {
  it("finds a person by name and by title", () => {
    expect(personMatches(person("ada-lindqvist"), "ada")).toBe(true);
    expect(personMatches(person("ada-lindqvist"), "Lindqvist")).toBe(true);
    expect(personMatches(person("ada-lindqvist"), "fundraising")).toBe(true);
    expect(personMatches(person("marcus-oyelaran"), "go-to-market")).toBe(true);
    expect(personMatches(person("renee-castillo"), "renée castillo")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(personMatches(person("ada-lindqvist"), "ada coach")).toBe(true);
    expect(personMatches(person("ada-lindqvist"), "ada sales")).toBe(false);
  });

  it("matches short words only at the start of a word", () => {
    expect(personMatches(person("marcus-oyelaran"), "go")).toBe(true); // "Go-to-Market Coach"
    expect(personMatches(person("marcus-oyelaran"), "ai")).toBe(false); // no word of "Marcus Oyelaran, Go-to-Market Coach" starts with "ai"
    expect(personMatches(person("marcus-oyelaran"), "rket")).toBe(true); // four letters or more match inside a word
    expect(personMatches(fixture("Dr. Ines Navarro", "Clinical Advisor"), "dr")).toBe(true);
  });

  it("finds a curly-apostrophe name typed with a straight apostrophe, or none", () => {
    const nora = fixture("Nora O’Hare", "Operations Coach");
    expect(personMatches(nora, "o'hare")).toBe(true);
    expect(personMatches(nora, "o’hare")).toBe(true);
    expect(personMatches(nora, "ohare")).toBe(true);
  });

  it("never finds a person by a company their bio mentions", () => {
    // The map shows no link between people and companies.
    const p = fixture("Ines Navarro", "Sales Coach", ["I coached the team at Signalforge through its first sales hires."]);
    expect(personMatches(p, "signalforge")).toBe(false);
    expect(personSearchText(p)).not.toContain("signalforge");
    const r = searchAll("signalforge", COMPANIES, [...PEOPLE, p], LABELS);
    expect(r.companies.map((m) => m.slug)).toContain("signalforge");
    expect(r.people).toEqual([]);
    for (const c of PEOPLE) expect(personSearchText(c)).toBe([c.name, c.name.replace(/[’‘ʼ`]/g, "'"), c.name.replace(/[’‘ʼ`]/g, "'").replace(/'/g, ""), c.title].join(" • ").toLowerCase());
  });

  it("matches everyone on a blank query", () => {
    expect(PEOPLE.every((c) => personMatches(c, "  "))).toBe(true);
  });
});

describe("searchAll", () => {
  it("returns nothing for a blank query", () => {
    expect(searchAll("  ", COMPANIES, PEOPLE, LABELS)).toEqual({ companies: [], people: [], peopleFirst: false, total: { companies: 0, people: 0 } });
  });

  it("lists people first when a person's name starts with the query and no company's does", () => {
    const r = searchAll("ada", COMPANIES, PEOPLE, LABELS);
    expect(r.people.map((c) => c.slug)).toEqual(["ada-lindqvist"]);
    expect(r.peopleFirst).toBe(true);
    expect(searchAll("hiro", COMPANIES, PEOPLE, LABELS).peopleFirst).toBe(true);
    expect(searchAll("ines", COMPANIES, [fixture("Dr. Ines Navarro", "Clinical Advisor")], LABELS).peopleFirst).toBe(true);
  });

  it("keeps companies first otherwise, and finds companies only by company fields", () => {
    const r = searchAll("signalforge", COMPANIES, PEOPLE, LABELS);
    expect(r.companies.map((m) => m.slug)).toEqual(["signalforge"]);
    expect(r.people).toEqual([]);
    expect(r.peopleFirst).toBe(false);
    // A company's name starts with "re" (Retrofit Works) as well as a person's (Renée Castillo).
    const re = searchAll("re", COMPANIES, PEOPLE, LABELS);
    expect(re.people.map((c) => c.slug)).toContain("renee-castillo");
    expect(re.companies[0].slug).toBe("retrofit-works");
    expect(re.peopleFirst).toBe(false);
  });

  it("caps each group and puts names that start with the query first", () => {
    const r = searchAll("coach", COMPANIES, PEOPLE, LABELS, { companies: 8, people: 3 });
    expect(r.people).toHaveLength(3);
    // The total counts every match, for "See all … in the list".
    expect(r.total.people).toBe(PEOPLE.filter((c) => /coach/i.test(c.title) || /coach/i.test(c.name)).length);
    expect(r.total.people).toBeGreaterThan(3);
    const g = searchAll("g", COMPANIES, PEOPLE, LABELS, { companies: 50, people: 50 });
    expect(g.people.map((c) => c.slug)).toEqual(["grace-whitfield", "marcus-oyelaran"]);
    const firstNonPrefix = g.people.findIndex((c) => !nameStartsWith(c.name, "g"));
    expect(g.people.slice(firstNonPrefix).every((c) => !nameStartsWith(c.name, "g"))).toBe(true);
    const firstCompany = g.companies.findIndex((m) => !nameStartsWith(m.name, "g"));
    expect(g.companies.slice(firstCompany).every((m) => !nameStartsWith(m.name, "g"))).toBe(true);
  });

  it("treats a name as starting with the query when only the honorific is in the way", () => {
    expect(nameStartsWith("Dr. Ines Navarro", "ine")).toBe(true);
    expect(nameStartsWith("Dr. Ines Navarro", "dr. ine")).toBe(true);
    expect(nameStartsWith("Nora O’Hare", "nora o'h")).toBe(true);
    expect(nameStartsWith("Ada Lindqvist", "")).toBe(false);
  });
});
