/* The areas on the walk world's ring: the districts (site/taxonomy.json), then, when the site has
   a people roster, the people area (src/data/layout.ts appends its disc). The people area is not a
   district: it is not in the taxonomy, no company is in it, and nothing about it points at an
   industry or a company (docs/data-contract.md). It is drawn and labeled with the same machinery
   as a district, in the neutral person color (its scene tint, --scene-person). */
import { DISTRICTS, HAS_PEOPLE, PEOPLE, companiesByDistrict } from "../../data/catalog";
import { PEOPLE_AREA, type AreaSlug } from "../../data/layout";
import { L } from "../../site";
import { personSceneColor } from "./palette";

export interface Area {
  slug: AreaSlug;
  label: string;
  /** The arch sign's text. */
  short: string;
  /** The district color, or the person scene color: for 3D props, the minimap and the landmark icon (the DOM uses tokens). */
  color: string;
  /** Pins in the area. */
  count: number;
  /** What one pin is and what several are, for "12 companies" / "1 coach". */
  noun: string;
  plural: string;
}

export const isPeopleArea = (slug: AreaSlug | string | null | undefined): boolean => slug === PEOPLE_AREA;

let cached: Area[] | null = null;

/** Every area in ring order: the districts, then the people area. Read once (the person color comes from a design token). */
export function walkAreas(): Area[] {
  cached ??= [
    ...DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color, count: companiesByDistrict.get(d.slug)?.length ?? 0, noun: L.company, plural: L.companies })),
    ...(HAS_PEOPLE ? [{ slug: PEOPLE_AREA, label: L.People, short: L.People, color: personSceneColor(), count: PEOPLE.length, noun: L.person, plural: L.people }] : []),
  ];
  return cached;
}

export function areaBySlug(slug: AreaSlug | string | null | undefined): Area | undefined {
  return slug ? walkAreas().find((a) => a.slug === slug) : undefined;
}

/** "12 companies", "1 company", "6 coaches". */
export function countLabel(a: Area): string {
  return `${a.count} ${a.count === 1 ? a.noun : a.plural}`;
}
