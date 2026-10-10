/* Checks for what crosses the network: a manifest an instance publishes, and a registry entry.
   Each returns a list of problems in plain words (empty = valid). The Nexus build runs them on
   every manifest it fetches, the map's build runs them on the manifest it writes, and CI runs the
   registry check on every pull request. Pure functions, no imports beyond the protocol. */
import {
  ACCEPTED_NEXUS_URLS,
  HEX_COLOR,
  ID_PATTERN,
  LIMITS,
  MAINTAINERS,
  PROTOCOL,
  normalizeUrl,
  onPublisherDomain,
  type InstanceStatus,
  type Manifest,
  type OwnerProof,
  type RegistryEntry,
} from "./protocol.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Text that must never travel through the network: email addresses and phone numbers. */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: Json): v is string => typeof v === "string";

/** An absolute https URL with no credentials. */
export function isHttpsUrl(v: Json): v is string {
  if (!isStr(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !/\s/.test(v);
  } catch {
    return false;
  }
}

function keysOnly(o: Record<string, Json>, allowed: readonly string[], where: string, out: string[], optional: readonly string[] = []) {
  for (const k of Object.keys(o)) if (!allowed.includes(k) && !optional.includes(k)) out.push(`${where}: unexpected field "${k}"`);
  for (const k of allowed) if (!(k in o)) out.push(`${where}: missing field "${k}"`);
}

function text(v: Json, where: string, max: number, out: string[], nullable = false) {
  if (v === null && nullable) return;
  if (!isStr(v) || !v.trim()) return void out.push(`${where}: expected ${nullable ? "text or null" : "text"}`);
  if (v.length > max) out.push(`${where}: longer than ${max} characters`);
  if (EMAIL.test(v)) out.push(`${where}: looks like it holds an email address`);
  if (PHONE.test(v)) out.push(`${where}: looks like it holds a phone number`);
}

function count(v: Json, where: string, out: string[]) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) out.push(`${where}: expected a whole number`);
}

const MANIFEST_KEYS = ["protocol", "id", "name", "publisher", "url", "tagline", "logo", "accent", "nexus", "framework", "labels", "counts", "districts", "companies", "updated"] as const;
const LABEL_KEYS = ["company", "companies", "district", "districts", "people"] as const;
const COUNT_KEYS = ["companies", "people", "districts"] as const;
const DISTRICT_KEYS = ["slug", "label", "color", "count"] as const;
const COMPANY_KEYS = ["slug", "name", "district", "description", "website", "keywords"] as const;

/** Problems with a manifest as fetched (any JSON value). */
export function validateManifest(m: Json): string[] {
  const out: string[] = [];
  if (!isObj(m)) return ["the manifest is not a JSON object"];
  keysOnly(m, MANIFEST_KEYS, "manifest", out);
  if (m.protocol !== PROTOCOL) out.push(`protocol: expected "${PROTOCOL}"`);
  if (!isStr(m.id) || !ID_PATTERN.test(m.id)) out.push("id: expected lowercase letters, digits and hyphens (2-48 characters)");
  text(m.name, "name", LIMITS.name, out);
  if (!isObj(m.publisher)) out.push("publisher: expected { name, website }");
  else {
    keysOnly(m.publisher, ["name", "website"], "publisher", out);
    text(m.publisher.name, "publisher.name", LIMITS.name, out);
    if (m.publisher.website !== null && !isHttpsUrl(m.publisher.website)) out.push("publisher.website: expected an https address or null");
  }
  if (!isHttpsUrl(m.url)) out.push("url: expected an https address");
  else if (normalizeUrl(m.url) !== m.url) out.push(`url: expected "${normalizeUrl(m.url)}" (no trailing slash, query or hash)`);
  text(m.tagline, "tagline", LIMITS.tagline, out, true);
  if (m.logo !== null && !isHttpsUrl(m.logo)) out.push("logo: expected an https address or null");
  if (!isStr(m.accent) || !HEX_COLOR.test(m.accent)) out.push('accent: expected a color like "#3366ff"');
  if (!isHttpsUrl(m.nexus)) out.push("nexus: expected the Nexus's https address");
  if (!isObj(m.framework) || !isStr(m.framework.name) || !isStr(m.framework.version)) out.push("framework: expected { name, version }");
  else keysOnly(m.framework, ["name", "version"], "framework", out);
  if (!isObj(m.labels)) out.push("labels: expected an object");
  else {
    keysOnly(m.labels, LABEL_KEYS, "labels", out);
    for (const k of LABEL_KEYS) text(m.labels[k], `labels.${k}`, LIMITS.label, out, k === "people");
  }
  if (!isObj(m.counts)) out.push("counts: expected an object");
  else {
    keysOnly(m.counts, COUNT_KEYS, "counts", out);
    for (const k of COUNT_KEYS) count(m.counts[k], `counts.${k}`, out);
  }
  if (!isStr(m.updated) || !DATE.test(m.updated)) out.push("updated: expected YYYY-MM-DD");

  const districtSlugs = new Set<string>();
  if (!Array.isArray(m.districts) || !m.districts.length) out.push("districts: expected at least one district");
  else {
    if (m.districts.length > LIMITS.districts) out.push(`districts: more than ${LIMITS.districts}`);
    m.districts.forEach((d, i) => {
      const w = `districts[${i}]`;
      if (!isObj(d)) return void out.push(`${w}: expected an object`);
      keysOnly(d, DISTRICT_KEYS, w, out);
      if (!isStr(d.slug) || !ID_PATTERN.test(d.slug)) out.push(`${w}.slug: expected an id`);
      else if (districtSlugs.has(d.slug)) out.push(`${w}.slug: "${d.slug}" twice`);
      else districtSlugs.add(d.slug);
      text(d.label, `${w}.label`, LIMITS.label, out);
      if (!isStr(d.color) || !HEX_COLOR.test(d.color)) out.push(`${w}.color: expected "#rrggbb"`);
      count(d.count, `${w}.count`, out);
    });
  }

  if (!Array.isArray(m.companies)) out.push("companies: expected a list");
  else {
    if (m.companies.length > LIMITS.companies) out.push(`companies: more than ${LIMITS.companies}`);
    const slugs = new Set<string>();
    const perDistrict = new Map<string, number>();
    m.companies.forEach((c, i) => {
      const w = `companies[${i}]`;
      if (!isObj(c)) return void out.push(`${w}: expected an object`);
      keysOnly(c, COMPANY_KEYS, w, out);
      if (!isStr(c.slug) || !ID_PATTERN.test(c.slug)) out.push(`${w}.slug: expected an id`);
      else if (slugs.has(c.slug)) out.push(`${w}.slug: "${c.slug}" twice`);
      else slugs.add(c.slug);
      text(c.name, `${w}.name`, LIMITS.name, out);
      if (!isStr(c.district) || !districtSlugs.has(c.district)) out.push(`${w}.district: not one of the manifest's districts`);
      else perDistrict.set(c.district, (perDistrict.get(c.district) ?? 0) + 1);
      text(c.description, `${w}.description`, LIMITS.description, out, true);
      if (c.website !== null && !isHttpsUrl(c.website)) out.push(`${w}.website: expected an https address or null`);
      if (!Array.isArray(c.keywords) || c.keywords.length > LIMITS.keywords) out.push(`${w}.keywords: expected at most ${LIMITS.keywords} keywords`);
      else c.keywords.forEach((k, j) => text(k, `${w}.keywords[${j}]`, LIMITS.keyword, out));
    });
    if (isObj(m.counts) && m.counts.companies !== m.companies.length) out.push(`counts.companies: says ${String(m.counts.companies)}, the index lists ${m.companies.length}`);
    if (Array.isArray(m.districts)) {
      if (isObj(m.counts) && m.counts.districts !== m.districts.length) out.push(`counts.districts: says ${String(m.counts.districts)}, the manifest lists ${m.districts.length}`);
      for (const d of m.districts) if (isObj(d) && isStr(d.slug) && d.count !== (perDistrict.get(d.slug) ?? 0)) out.push(`districts "${d.slug}": count says ${String(d.count)}, the index lists ${perDistrict.get(d.slug) ?? 0}`);
    }
  }
  return out;
}

const ENTRY_KEYS = ["id", "name", "url", "joined", "maintainer"] as const;
const ENTRY_OPTIONAL = ["ownerConfirmedBy"] as const;

/** Problems with a registry entry; `file` is its file name (it must be "<id>.json"). */
export function validateRegistryEntry(e: Json, file?: string): string[] {
  const out: string[] = [];
  if (!isObj(e)) return ["the entry is not a JSON object"];
  keysOnly(e, ENTRY_KEYS, "entry", out, ENTRY_OPTIONAL);
  if ("ownerConfirmedBy" in e && (!isStr(e.ownerConfirmedBy) || !MAINTAINERS.includes(e.ownerConfirmedBy))) out.push(`ownerConfirmedBy: only a maintainer (${MAINTAINERS.join(", ")}) sets it, with their GitHub handle`);
  if (!isStr(e.id) || !ID_PATTERN.test(e.id)) out.push("id: expected lowercase letters, digits and hyphens (2-48 characters)");
  else if (file && file !== `${e.id}.json`) out.push(`the file must be named "${e.id}.json"`);
  text(e.name, "name", LIMITS.name, out);
  if (!isHttpsUrl(e.url)) out.push("url: expected an https address");
  else if (normalizeUrl(e.url) !== e.url) out.push(`url: expected "${normalizeUrl(e.url)}" (no trailing slash, query or hash)`);
  if (!isStr(e.joined) || !DATE.test(e.joined)) out.push("joined: expected YYYY-MM-DD");
  if (!isStr(e.maintainer) || !GITHUB_HANDLE.test(e.maintainer)) out.push("maintainer: expected a GitHub handle (no @, no email)");
  return out;
}

/** Problems across the whole registry: duplicate ids or addresses. */
export function validateRegistry(entries: RegistryEntry[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) out.push(`id "${e.id}" is listed twice`);
    ids.add(e.id);
    const u = isHttpsUrl(e.url) ? normalizeUrl(e.url) : e.url;
    if (urls.has(u)) out.push(`address ${u} is listed twice`);
    urls.add(u);
  }
  return out;
}

/**
 * Does this manifest belong to this registry entry and link back to the Nexus? A manifest that
 * validates but names another id or address, or a Nexus that is not ours, is not verified. (The
 * publisher's proof and the page's meta tag need the network: scripts/build-network.mjs checks
 * them after this.)
 */
export function verifyInstance(entry: RegistryEntry, manifest: Json): { status: InstanceStatus; problems: string[] } {
  const problems = validateManifest(manifest);
  if (problems.length) return { status: "invalid", problems };
  const m = manifest as Manifest;
  const out: string[] = [];
  if (m.id !== entry.id) out.push(`the manifest's id is "${m.id}", the registry's is "${entry.id}"`);
  if (normalizeUrl(m.url) !== normalizeUrl(entry.url)) out.push(`the manifest's url is ${m.url}, the registry's is ${entry.url}`);
  if (out.length) return { status: "invalid", problems: out };
  const nexus = normalizeUrl(m.nexus);
  if (!ACCEPTED_NEXUS_URLS.includes(nexus)) return { status: "no-backlink", problems: [`the manifest links to ${nexus}, not to the Nexus (${ACCEPTED_NEXUS_URLS.join(" or ")})`] };
  return { status: "verified", problems: [] };
}

/**
 * The proof of ownership that needs no network: the map on the publisher's own domain, or a
 * maintainer's confirmation in the registry entry. null: the Nexus build must look further (the
 * publisher's homepage, its DNS).
 */
export function offlineProof(entry: RegistryEntry, manifest: Manifest): OwnerProof | null {
  if (onPublisherDomain(manifest.url, manifest.publisher.website)) return "domain";
  if (entry.ownerConfirmedBy && MAINTAINERS.includes(entry.ownerConfirmedBy)) return "maintainer";
  return null;
}
