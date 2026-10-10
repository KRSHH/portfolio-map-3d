#!/usr/bin/env node
/* ============================================================
   check-bundle.mjs — runs after every build (npm postbuild).
   Exits 1 if dist/ holds a Supabase key that must never reach a
   browser:
   - a secret key (sb_secret_…);
   - a JWT whose payload role is anything but "anon" (a service_role
     key, or a token with no role at all).
   vite.config.ts already refuses such a key under the variable names
   it reads; this scans what actually shipped, whatever route it took.
   Also exits 1 if the data files' provenance shipped (publicData() in
   vite.config.ts drops it: the sources, which descriptions a company
   supplied itself or came from the organization's records, the data
   files' _about notes), or if the build lost its link into the
   Portfolio Map Network: the manifest (portfolio-map.json) and the
   Nexus address in index.html and in the app's code.
   Usage: node scripts/check-bundle.mjs [dir]   (default: dist)
   ============================================================ */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_FILE, NEXUS_META, NEXUS_URL } from "../federation/protocol.ts";
import { validateManifest } from "../federation/validate.ts";

/** Image, font and media files can't carry a key in readable form; everything else is scanned. */
const BINARY = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".glb", ".bin", ".mp4", ".webm"]);
const JWT = /eyJ[\w-]{4,}\.(eyJ[\w-]{4,})\.[\w-]*/g;
/** Provenance that stays in site/ (strings that only the data files' source fields and notes carry). */
const PROVENANCE = [
  ["descriptionSource", "company provenance (descriptionSource)"],
  ["company-supplied", "a source kind naming a company's own words (company-supplied)"],
  ["org-records", "a source kind naming the organization's records (org-records)"],
  ['"_about"', "a data file's _about note"],
];

function role(payload) {
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role ?? null;
  } catch {
    return undefined; // not a JWT after all
  }
}

/** Problems in one file's text, as "what: where" strings. */
export function scanText(text) {
  const found = [];
  const secret = text.indexOf("sb_secret_");
  if (secret >= 0) found.push(`Supabase secret key (sb_secret_…) at offset ${secret}`);
  for (const [needle, what] of PROVENANCE) {
    const at = text.indexOf(needle);
    if (at >= 0) found.push(`${what} at offset ${at}`);
  }
  for (const m of text.matchAll(JWT)) {
    const r = role(m[1]);
    if (r !== undefined && r !== "anon") found.push(`JWT with role ${JSON.stringify(r)} at offset ${m.index}`);
  }
  return found;
}

/** Every problem under `dir`, as "file: what" strings. */
export function scanDir(dir) {
  const found = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!BINARY.has(extname(name).toLowerCase())) for (const f of scanText(readFileSync(p, "utf8"))) found.push(`${relative(dir, p)}: ${f}`);
    }
  };
  walk(dir);
  return found;
}

/**
 * The build's link into the Portfolio Map Network (docs/network.md): a valid manifest that names
 * the Nexus, the Nexus meta tag in index.html, and the Nexus address in the app's code (the top
 * bar's link and the walk world's portal). Problems as "what" strings.
 */
export function checkNetwork(dir) {
  const found = [];
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) found.push(`${MANIFEST_FILE} is missing (the site plugin in vite.config.ts writes it)`);
  else {
    let m = null;
    try {
      m = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      found.push(`${MANIFEST_FILE} is not valid JSON`);
    }
    if (m) {
      for (const p of validateManifest(m)) found.push(`${MANIFEST_FILE}: ${p}`);
      if (m.nexus !== NEXUS_URL) found.push(`${MANIFEST_FILE}: names ${m.nexus} as its Nexus, not ${NEXUS_URL}`);
    }
  }
  const index = join(dir, "index.html");
  if (!existsSync(index) || !readFileSync(index, "utf8").includes(`name="${NEXUS_META}"`)) found.push(`index.html lacks the ${NEXUS_META} meta tag`);
  const assets = join(dir, "assets");
  const js = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith(".js")) : [];
  if (!js.some((f) => readFileSync(join(assets, f), "utf8").includes(NEXUS_URL))) found.push(`no script links to the Nexus (${NEXUS_URL}): the top bar's link and the walk world's portal are gone`);
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  const network = checkNetwork(dir);
  if (network.length) {
    console.error(`check-bundle: this build is not linked into the Portfolio Map Network\n  ${network.join("\n  ")}\nEvery map built on portfolio-map-3d links to the Nexus (NETWORK.md, docs/network.md).`);
    process.exit(1);
  }
  const found = scanDir(dir);
  if (found.length) {
    console.error(`check-bundle: ${found.length} thing(s) that must not ship\n  ${found.join("\n  ")}\nA key: remove it from the build environment and rebuild; rotate it if this build was deployed. Provenance: check publicData() in vite.config.ts and that src/ imports site/ only through src/data/catalog.ts.`);
    process.exit(1);
  }
  console.log(`check-bundle: OK — linked into the Portfolio Map Network; no secret or non-anon Supabase key and no data provenance in ${relative(process.cwd(), dir) || "."}.`);
}
