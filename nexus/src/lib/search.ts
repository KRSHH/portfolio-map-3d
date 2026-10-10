/* Search across the network: every company in every world's public index, and the worlds'
   names. The word rules are the maps' own: every word typed must match, and a word shorter
   than four letters matches only at the start of a word ("ai" finds "AI tools", not "email").
   Case, accents and curly apostrophes are ignored.

   A company is found by its name, keywords, description and district, together with its
   world's name (and its publisher's) ("harbor robotics" finds the robotics companies in Sample Harbor Ventures), as
   long as at least one word matches the company itself: a search for a world's name finds
   the world, not every company in it. Results are grouped by world. Pure functions, unit-tested. */
import type { ManifestCompany, ManifestDistrict } from "../../../federation/protocol.ts";
import type { World } from "./network.ts";

/** Lowercase, without accents, with plain apostrophes. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[’‘ʼ`]/g, "'")
    .toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One test per word of `query` (over folded text), or null for a blank query. */
export function wordTests(query: string): ((haystack: string) => boolean)[] | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => {
    if (w.length >= 4) return (s: string) => s.includes(w);
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(w)}`, "u");
    return (s: string) => re.test(s);
  });
}

/** Does `text` match every word of `query`? A blank query matches everything. */
export function matches(text: string, query: string): boolean {
  const tests = wordTests(query);
  return !tests || tests.every((t) => t(fold(text)));
}

export interface IndexedCompany {
  company: ManifestCompany;
  district: ManifestDistrict | undefined;
  text: string;
}

export interface IndexedWorld {
  world: World;
  nameText: string;
  companies: IndexedCompany[];
}

export type SearchIndex = IndexedWorld[];

/** What a company is found by, folded. */
export function companyText(c: ManifestCompany, district?: ManifestDistrict): string {
  return fold([c.name, ...c.keywords, c.description ?? "", district?.label ?? ""].join(" • "));
}

export function buildIndex(worlds: readonly World[]): SearchIndex {
  return worlds.map((world) => {
    const districts = new Map(world.manifest.districts.map((d) => [d.slug, d]));
    return {
      world,
      nameText: fold(`${world.name} • ${world.publisher.name}`),
      companies: world.manifest.companies.map((company) => {
        const district = districts.get(company.district);
        return { company, district, text: companyText(company, district) };
      }),
    };
  });
}

export interface CompanyHit {
  company: ManifestCompany;
  district: ManifestDistrict | undefined;
}

export interface WorldHit {
  world: World;
  /** The world's own name matches every word. */
  worldMatch: boolean;
  /** The first matching companies (names that start with the query first). */
  companies: CompanyHit[];
  /** How many companies match in all. */
  total: number;
}

export interface SearchResult {
  groups: WorldHit[];
  /** Matching companies across all worlds, and worlds with any match. */
  totalCompanies: number;
  totalWorlds: number;
}

export const SEARCH_LIMITS = { perWorld: 5, worlds: 12 };

export function searchNetwork(index: SearchIndex, query: string, limits = SEARCH_LIMITS): SearchResult {
  const tests = wordTests(query);
  if (!tests) return { groups: [], totalCompanies: 0, totalWorlds: 0 };
  const q = fold(query.trim());
  const groups: WorldHit[] = [];
  let totalCompanies = 0;
  for (const iw of index) {
    const byName = tests.map((t) => t(iw.nameText));
    const worldMatch = byName.every(Boolean);
    const hits: (CompanyHit & { rank: number })[] = [];
    for (const ic of iw.companies) {
      let own = false;
      let all = true;
      for (let i = 0; i < tests.length; i++) {
        const hit = tests[i](ic.text);
        own ||= hit;
        if (!hit && !byName[i]) {
          all = false;
          break;
        }
      }
      if (!all || !own) continue;
      const name = fold(ic.company.name);
      hits.push({ company: ic.company, district: ic.district, rank: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2 });
    }
    if (!worldMatch && !hits.length) continue;
    hits.sort((a, b) => a.rank - b.rank);
    totalCompanies += hits.length;
    groups.push({
      world: iw.world,
      worldMatch,
      companies: hits.slice(0, limits.perWorld).map(({ company, district }) => ({ company, district })),
      total: hits.length,
    });
  }
  groups.sort((a, b) => Number(b.worldMatch) - Number(a.worldMatch) || b.total - a.total || a.world.name.localeCompare(b.world.name, "en"));
  return { groups: groups.slice(0, limits.worlds), totalCompanies, totalWorlds: groups.length };
}

/** A world's companies that match `query` on their own text (the panel's filter). */
export function filterCompanies(iw: IndexedWorld, query: string, district: string | null): IndexedCompany[] {
  const tests = wordTests(query);
  return iw.companies.filter((ic) => (!district || ic.company.district === district) && (!tests || tests.every((t) => t(ic.text))));
}
