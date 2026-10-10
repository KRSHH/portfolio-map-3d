/* The catalog: the one place the app reads site/ (site.json, taxonomy.json, data/*.json, and the
   logo, headshot and brand files). Everything here is public; scripts/validate-site.mjs checks it
   before every build, and the production build drops the sources (publicData() in vite.config.ts). */
import companiesFile from "../../site/data/companies.json";
import peopleFile from "../../site/data/people.json";
import taxonomy from "../../site/taxonomy.json";
import { SITE } from "../site";
import type { Company, District, DistrictSlug, Person, Vocab } from "./types";

/** Files in a site/ folder by slug (file name without extension), as the URLs Vite serves them at. */
function bySlug(files: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const slug = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
    if (typeof url === "string") out.set(slug, url);
  }
  return out;
}

const LOGOS = bySlug(import.meta.glob("../../site/logos/*.{svg,png,webp,jpg,jpeg}", { eager: true, query: "?url", import: "default" }));
const HEADSHOTS = bySlug(import.meta.glob("../../site/people/*.{webp,png,jpg,jpeg}", { eager: true, query: "?url", import: "default" }));
const BRAND = new Map(
  Object.entries(import.meta.glob("../../site/brand/*.{svg,png,webp,jpg,jpeg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>).map(([path, url]) => [
    path.replace("../../site/", ""),
    url,
  ]),
);

/** The URL of a file under site/ named in site.json (e.g. "brand/logo.svg"), or null. */
export function siteFile(path: string | null): string | null {
  return path ? BRAND.get(path) ?? null : null;
}

type CompanyRecord = Omit<Company, "logo">;
type PersonRecord = Omit<Person, "headshot">;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

export const COMPANIES: Company[] = (companiesFile.companies as unknown as CompanyRecord[]).map((c) => ({ ...c, logo: LOGOS.get(c.slug) ?? null })).sort(byName);

/** A person's name without a leading honorific ("Dr. Ana Ruiz" -> "Ana Ruiz"), for sorting and initials. */
export const withoutHonorific = (name: string) => name.replace(/^\s*(dr|mr|mrs|ms|prof)\.?\s+/i, "");

/** The people roster, alphabetical by name (honorifics ignored). No person is ever linked to a company. */
export const PEOPLE: Person[] = ((peopleFile.people ?? []) as unknown as PersonRecord[])
  .map((p) => ({ ...p, headshot: HEADSHOTS.get(p.slug) ?? null }))
  .sort((a, b) => withoutHonorific(a.name).localeCompare(withoutHonorific(b.name), "en", { sensitivity: "base" }));
export const personBySlug = new Map(PEOPLE.map((c) => [c.slug, c]));
/** Does this map have a people roster? Without one, every people control, globe and area is left out. */
export const HAS_PEOPLE = PEOPLE.length > 0;

/** Districts in ring order (the order the palette was checked in). */
export const DISTRICTS: District[] = taxonomy.districts as District[];
export const SERVICES: Vocab[] = taxonomy.services;
export const INDUSTRIES: Vocab[] = taxonomy.industriesServed;
export const CONNECTION_KINDS: Vocab[] = taxonomy.connectionKinds;
/** Does any company offer a service? Without one, the provider finder is left out. */
export const HAS_FINDER = COMPANIES.some((c) => c.services.length > 0);

export const companyBySlug = new Map(COMPANIES.map((m) => [m.slug, m]));
export const districtBySlug = new Map(DISTRICTS.map((d) => [d.slug, d])) as Map<DistrictSlug, District>;
export const serviceLabel = new Map(SERVICES.map((s) => [s.slug, s.label]));
export const industryLabel = new Map(INDUSTRIES.map((s) => [s.slug, s.label]));
export const connectionLabel = new Map(CONNECTION_KINDS.map((s) => [s.slug, s.label]));

export const companiesByDistrict: Map<DistrictSlug, Company[]> = new Map(DISTRICTS.map((d) => [d.slug, COMPANIES.filter((m) => m.district === d.slug)]));

export function districtOf(m: Company): District {
  return districtBySlug.get(m.district)!;
}

/** Companies whose primary district is d, plus those that list it as secondary. */
export function companiesTouching(d: DistrictSlug): Company[] {
  return COMPANIES.filter((m) => m.district === d || m.secondaryDistricts.includes(d));
}

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Initials for a person: first and last name, honorifics skipped ("Dr. Ana Ruiz" -> "AR"). */
export function personInitials(name: string): string {
  const words = withoutHonorific(name).replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [words[0]?.slice(0, 2) ?? "?"]).join("");
  return letters.toUpperCase();
}

export { SITE };
