/* ============================================================
   manifest.mjs — the map's public manifest for the Portfolio Map
   Network (federation/protocol.ts): who publishes the map, its
   districts, and a light index of its companies. The build writes
   it to dist/portfolio-map.json and the dev server serves it at
   /portfolio-map.json; the Nexus reads it to show this map as a
   world. It is built from the same site/ files the map shows, so
   it cannot drift from them, and it carries no sources.
   Usage: node scripts/manifest.mjs   (prints it, with any problems)
   ============================================================ */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAMEWORK, LIMITS, NEXUS_URL, PROTOCOL, normalizeUrl } from "../federation/protocol.ts";
import { isHttpsUrl, validateManifest } from "../federation/validate.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Everything under site/ the map reads, as plain JSON. */
export function readSite(root = ROOT) {
  const site = readJson(join(root, "site", "site.json"));
  const taxonomy = readJson(join(root, "site", "taxonomy.json"));
  const companies = readJson(join(root, "site", "data", "companies.json")).companies ?? [];
  let people = [];
  try {
    people = readJson(join(root, "site", "data", "people.json")).people ?? [];
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const pkg = readJson(join(root, "package.json"));
  return { site, taxonomy, companies, people, version: pkg.version };
}

/** The stable public path the build copies a site/ brand file to ("brand/logo.svg" -> "/brand/logo.svg"). */
export const brandPath = (file) => (file ? `/${file.replace(/^\/+/, "")}` : null);

/**
 * The manifest for this site. `today` is YYYY-MM-DD. Texts travel verbatim: a description or
 * keyword too long for the protocol's limits is left out rather than cut.
 */
export function buildManifest({ site, taxonomy, companies, people, version }, today = new Date().toISOString().slice(0, 10)) {
  const url = normalizeUrl(site.map.url);
  const counts = new Map(taxonomy.districts.map((d) => [d.slug, 0]));
  for (const c of companies) counts.set(c.district, (counts.get(c.district) ?? 0) + 1);
  const share = site.network.shareDescriptions !== false;
  const logo = site.org.logo ? `${url}${brandPath(site.org.logo)}` : null;
  return {
    protocol: PROTOCOL,
    id: site.network.id,
    name: site.org.name,
    publisher: { name: site.org.name, website: isHttpsUrl(site.org.website) ? site.org.website : null },
    url,
    tagline: site.map.tagline && site.map.tagline.length <= LIMITS.tagline ? site.map.tagline : null,
    logo,
    accent: site.theme.accent,
    nexus: NEXUS_URL,
    framework: { name: FRAMEWORK, version },
    labels: {
      company: site.labels.company,
      companies: site.labels.companies,
      district: site.labels.district,
      districts: site.labels.districts,
      people: people.length ? site.labels.people : null,
    },
    counts: { companies: companies.length, people: people.length, districts: taxonomy.districts.length },
    districts: taxonomy.districts.map((d) => ({ slug: d.slug, label: d.label, color: d.color, count: counts.get(d.slug) ?? 0 })),
    companies: companies.map((c) => ({
      slug: c.slug,
      name: c.name,
      district: c.district,
      description: share && c.description && c.description.length <= LIMITS.description ? c.description : null,
      website: isHttpsUrl(c.website) ? c.website : null,
      keywords: (c.keywords ?? []).filter((k) => k.length <= LIMITS.keyword).slice(0, LIMITS.keywords),
    })),
    updated: today,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = buildManifest(readSite());
  console.log(JSON.stringify(manifest, null, 2));
  const problems = validateManifest(manifest);
  if (problems.length) {
    console.error(`manifest: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}
