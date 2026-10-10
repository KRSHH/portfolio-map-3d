/* Connections and provider matching.

   Two kinds of link exist, and the UI never blurs them:

   1. DOCUMENTED connections — a public source records a relationship
      between two companies (partnership, customer, shared founder…).
      These are facts and always carry their source.
   2. POTENTIAL fits — derived here from each company's public description:
      company A offers a service and serves the kind of industry company B
      is in. These are suggestions for introductions, not relationships,
      and are labeled that way wherever they appear.

   Pure functions over a company list so they can be unit-tested. */
import type { Company, District } from "./types";

/** Customer segments that describe a company's stage/size rather than its industry. */
const STAGE_SEGMENTS = ["startups", "small-business"];
const GENERIC = new Set(["cross-industry", "enterprise", ...STAGE_SEGMENTS]);

/**
 * The industries a company operates in — what a provider would need to serve to be relevant: its
 * districts' industries (site/taxonomy.json `industries`), plus the stage segments every company
 * is a customer in (startups, small businesses), except in a district whose industries are only
 * "nonprofits".
 */
export function industriesOf(m: Company, districts: ReadonlyMap<string, Pick<District, "industries">>): string[] {
  const set = new Set<string>();
  for (const d of [m.district, ...m.secondaryDistricts]) for (const i of districts.get(d)?.industries ?? []) set.add(i);
  const own = districts.get(m.district)?.industries ?? [];
  if (!(own.length === 1 && own[0] === "nonprofits")) for (const s of STAGE_SEGMENTS) set.add(s);
  return [...set];
}

export interface Fit {
  company: Company;
  score: number;
  reasons: string[];
}

export interface Labels {
  industry: (slug: string) => string;
  service: (slug: string) => string;
  /** The districts by slug, for each district's industries. */
  districts: ReadonlyMap<string, Pick<District, "industries">>;
}

/** How well `provider` could serve a company operating in `industries`. 0 = no fit. */
export function fitScore(provider: Company, industries: string[], labels: Labels, service?: string | null): Fit | null {
  if (!provider.services.length) return null;
  if (service && !provider.services.includes(service)) return null;
  const reasons: string[] = [];
  let score = 0;
  const specific = provider.servesIndustries.filter((i) => !GENERIC.has(i) && industries.includes(i));
  if (specific.length) {
    score += 3 + Math.min(specific.length - 1, 1);
    reasons.push(`Serves ${specific.map(labels.industry).join(" and ").toLowerCase()}`);
  }
  const stage = provider.servesIndustries.filter((i) => STAGE_SEGMENTS.includes(i) && industries.includes(i));
  if (stage.length) {
    score += 1.5;
    reasons.push(stage.includes("startups") ? "Works with startups" : "Works with small businesses");
  }
  if (provider.servesIndustries.includes("cross-industry")) {
    score += 1;
    reasons.push("Sells across industries");
  }
  if (service) {
    score += 2;
    reasons.unshift(`Offers ${labels.service(service).toLowerCase()}`);
  }
  return score > 0 ? { company: provider, score, reasons } : null;
}

/** Companies who could provide services to `client`, best first. */
export function potentialProviders(client: Company, all: Company[], labels: Labels, limit = 8): Fit[] {
  const industries = industriesOf(client, labels.districts);
  return all
    .filter((p) => p.slug !== client.slug)
    .map((p) => fitScore(p, industries, labels))
    .filter((f): f is Fit => !!f && f.score >= 2.5)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, limit);
}

/** Companies that `provider` could serve, best first. */
export function potentialClients(provider: Company, all: Company[], labels: Labels, limit = 8): Fit[] {
  return all
    .filter((c) => c.slug !== provider.slug)
    .map((c) => {
      const f = fitScore(provider, industriesOf(c, labels.districts), labels);
      return f && f.score >= 3 ? { ...f, company: c } : null;
    })
    .filter((f): f is Fit => !!f)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, limit);
}

export interface ProviderQuery {
  service: string | null;
  industry: string | null;
  text: string;
}

/**
 * The provider finder: who in the portfolio offers `service`. With an industry chosen, only
 * companies that list it among the industries they serve (shown first) or that sell across
 * industries are kept. Every result carries at least one reason.
 */
export function findProviders(q: ProviderQuery, all: Company[], labels: Labels): Fit[] {
  const text = q.text.trim();
  const industry = q.industry;
  const industries = industry ? [industry, ...STAGE_SEGMENTS] : [...STAGE_SEGMENTS];
  const servesDirectly = (m: Company) => !!industry && m.servesIndustries.includes(industry);
  const results: Fit[] = [];
  for (const m of all) {
    if (!m.services.length) continue;
    if (q.service && !m.services.includes(q.service)) continue;
    if (industry && !servesDirectly(m) && !m.servesIndustries.includes("cross-industry")) continue;
    if (text && !matchesText(m, text, labels)) continue;
    const fit = fitScore(m, industries, labels, q.service) ?? { company: m, score: 0, reasons: [] };
    // fitScore names specific industries and stage segments; "Large enterprises" is said here, next to the service.
    if (industry === "enterprise" && servesDirectly(m)) fit.reasons.splice(q.service ? 1 : 0, 0, `Serves ${labels.industry(industry).toLowerCase()}`);
    if (text) {
      fit.score += 1;
      fit.reasons.push(`Matches “${text}”`);
    }
    if (!q.service && !text && !industry) fit.reasons.unshift(...m.services.slice(0, 2).map((s) => `Offers ${labels.service(s).toLowerCase()}`));
    // A company with nothing to say for itself is not one that "could help".
    if (fit.reasons.length) results.push(fit);
  }
  const tier = (f: Fit) => (servesDirectly(f.company) ? 0 : 1);
  return results.sort((a, b) => tier(a) - tier(b) || b.score - a.score || a.company.name.localeCompare(b.company.name));
}

/**
 * Free-text search across name, description, keywords, tags, services and people.
 * Every word of the query must match: short words (under 4 characters) only at the start
 * of a word, so "ai" finds "AI" but not "email"; longer ones anywhere, so "signalf" finds Signalforge.
 */
export function matchesText(m: Company, needle: string, labels?: Labels): boolean {
  const test = textMatcher(needle);
  return test ? test(searchText(m, labels)) : true;
}

let lastMatcher: { needle: string; test: ((haystack: string) => boolean) | null } | null = null;
/** A predicate over a lowercase haystack for `needle`, or null when the needle is blank. Person search uses the same rules. */
export function textMatcher(needle: string): ((haystack: string) => boolean) | null {
  if (lastMatcher?.needle === needle) return lastMatcher.test;
  const tokens = needle.toLowerCase().split(/\s+/).filter(Boolean);
  const checks = tokens.map((t) => {
    if (t.length >= 4) return (s: string) => s.includes(t);
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");
    return (s: string) => re.test(s);
  });
  const test = checks.length ? (s: string) => checks.every((c) => c(s)) : null;
  lastMatcher = { needle, test };
  return test;
}

/** One cache per kind of call: with labels the text holds service and industry names, without it their slugs. */
const searchCache = new WeakMap<Company, string>();
const searchCacheLabeled = new WeakMap<Company, string>();
export function searchText(m: Company, labels?: Labels): string {
  const cache = labels ? searchCacheLabeled : searchCache;
  let s = cache.get(m);
  if (!s) {
    s = [
      m.name,
      m.description,
      m.providerPitch,
      m.location,
      ...m.tags,
      ...m.keywords,
      ...m.founders.map((p) => p.name),
      ...m.leaders.map((p) => p.name),
      ...(labels ? m.services.map(labels.service) : m.services),
      ...(labels ? m.servesIndustries.map(labels.industry) : m.servesIndustries),
    ]
      .filter(Boolean)
      .join(" • ")
      .toLowerCase();
    cache.set(m, s);
  }
  return s;
}

export interface Link {
  a: string;
  b: string;
  kind: string;
  summary: string;
  sourceUrl: string;
}

/** Every documented connection once (a<b), for drawing. */
export function documentedLinks(all: Company[]): Link[] {
  const seen = new Set<string>();
  const out: Link[] = [];
  const slugs = new Set(all.map((m) => m.slug));
  for (const m of all)
    for (const c of m.connections) {
      if (!slugs.has(c.with)) continue;
      const [a, b] = [m.slug, c.with].sort();
      const key = `${a}|${b}|${c.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b, kind: c.kind, summary: c.summary, sourceUrl: c.source.url ?? "" });
    }
  return out;
}

/**
 * Tags too common to say anything: carried by more than a third of all companies (and by at
 * least three), like a directory's "B2B".
 */
export function genericTags(all: Company[]): Set<string> {
  const n = new Map<string, number>();
  for (const m of all) for (const t of new Set(m.tags)) n.set(t, (n.get(t) ?? 0) + 1);
  return new Set([...n].filter(([, k]) => k >= 3 && k > all.length / 3).map(([t]) => t));
}

/** Companies sharing at least one specific (not generic) tag with m. */
export function sharedTagPeers(m: Company, all: Company[]): Company[] {
  const generic = genericTags(all);
  const tags = m.tags.filter((t) => !generic.has(t));
  if (!tags.length) return [];
  return all.filter((o) => o.slug !== m.slug && o.tags.some((t) => tags.includes(t)));
}
