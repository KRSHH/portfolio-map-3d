import { describe, expect, it } from "vitest";
import { PEOPLE, DISTRICTS, COMPANIES } from "../../data/catalog";
import { PEOPLE_AREA, layoutWorld } from "../../data/layout";
import { L } from "../../site";
import { areaBySlug, countLabel, isPeopleArea, walkAreas } from "./areas";

describe("walk areas", () => {
  const areas = walkAreas();

  it("lists the areas in ring order: every district, then the people area", () => {
    const world = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
    expect(areas.map((a) => a.slug)).toEqual(world.discs.map((d) => d.slug));
    expect(areas.at(-1)?.slug).toBe(PEOPLE_AREA);
  });

  it("gives the people area its own neutral color, not a district's, and the site's name for people", () => {
    const people = areaBySlug(PEOPLE_AREA)!;
    expect(isPeopleArea(people.slug)).toBe(true);
    expect(isPeopleArea("health")).toBe(false);
    expect(DISTRICTS.map((d) => d.color.toLowerCase())).not.toContain(people.color.toLowerCase());
    expect(people.label).toBe(L.People);
    expect(people.short).toBe(L.People);
  });

  it("names each district as the taxonomy does", () => {
    for (const d of DISTRICTS) expect(areaBySlug(d.slug)).toMatchObject({ label: d.label, short: d.short, color: d.color });
    expect(areaBySlug("space")).toBeUndefined();
    expect(areaBySlug(null)).toBeUndefined();
  });

  it("counts companies in a district and people in the people area, in the site's words", () => {
    expect(countLabel(areaBySlug(PEOPLE_AREA)!)).toBe(`${PEOPLE.length} ${L.people}`);
    const health = areaBySlug("health")!;
    expect(countLabel(health)).toBe(`${COMPANIES.filter((m) => m.district === "health").length} ${L.companies}`);
    expect(countLabel({ ...health, count: 1 })).toBe(`1 ${L.company}`);
    expect(countLabel({ ...areaBySlug(PEOPLE_AREA)!, count: 1 })).toBe(`1 ${L.person}`);
    // The example site calls its people coaches.
    expect(countLabel({ ...areaBySlug(PEOPLE_AREA)!, count: 2 })).toBe("2 coaches");
  });
});
