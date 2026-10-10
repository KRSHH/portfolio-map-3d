/* The top-bar search over both rosters: companies and people.

   Companies are found as before (graph.ts matchesText: names, descriptions, keywords, tags,
   services, people). People are found by name and specialty only. Their bios name company
   companies in plain text, and a search for a company must never bring up a person: the map
   shows no link between people and companies (CLAUDE.md). Both use the same word rules: every
   word must match, short words only at the start of a word. Pure functions, unit-tested. */
import { withoutHonorific } from "./catalog";
import { matchesText, textMatcher, type Labels } from "./graph";
import type { Person, Company } from "./types";

const APOSTROPHES = /[’‘ʼ`]/g;

const personText = new WeakMap<Person, string>();
/** What a person is found by: the name (as published, with plain and no apostrophes too) and the specialty. */
export function personSearchText(c: Person): string {
  let s = personText.get(c);
  if (!s) {
    const plain = c.name.replace(APOSTROPHES, "'");
    s = [c.name, plain, plain.replace(/'/g, ""), c.title].join(" • ").toLowerCase();
    personText.set(c, s);
  }
  return s;
}

function normalizeNeedle(q: string): string {
  return q.replace(APOSTROPHES, "'");
}

/** Does the person's name or specialty match every word of `query`? A blank query matches everyone. */
export function personMatches(c: Person, query: string): boolean {
  const test = textMatcher(normalizeNeedle(query));
  return test ? test(personSearchText(c)) : true;
}

/** True when `name` (or the name without "Dr." and the like) starts with the query. */
export function nameStartsWith(name: string, query: string): boolean {
  const q = normalizeNeedle(query.trim()).toLowerCase();
  if (!q) return false;
  const n = name.replace(APOSTROPHES, "'").toLowerCase();
  return n.startsWith(q) || withoutHonorific(n).startsWith(q);
}

export interface SearchResults {
  companies: Company[];
  people: Person[];
  /** List the people first: a person's name starts with the query and no company's does. */
  peopleFirst: boolean;
  /** How many match in all, before each group is capped. */
  total: { companies: number; people: number };
}

export const SEARCH_LIMITS = { companies: 8, people: 5 };

/** Search results for the top bar, names that start with the query first in each group. */
export function searchAll(query: string, companies: Company[], people: Person[], labels?: Labels, limits = SEARCH_LIMITS): SearchResults {
  const q = query.trim();
  if (!q) return { companies: [], people: [], peopleFirst: false, total: { companies: 0, people: 0 } };
  const byPrefix = <T extends { name: string }>(a: T, b: T) => Number(!nameStartsWith(a.name, q)) - Number(!nameStartsWith(b.name, q));
  const m = companies.filter((x) => matchesText(x, q, labels)).sort(byPrefix);
  const c = people.filter((x) => personMatches(x, q)).sort(byPrefix);
  const peopleFirst = c.some((x) => nameStartsWith(x.name, q)) && !m.some((x) => nameStartsWith(x.name, q));
  return { companies: m.slice(0, limits.companies), people: c.slice(0, limits.people), peopleFirst, total: { companies: m.length, people: c.length } };
}
