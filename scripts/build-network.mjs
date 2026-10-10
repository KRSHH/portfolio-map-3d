#!/usr/bin/env node
/* ============================================================
   build-network.mjs — the Nexus's view of the network
   (nexus/public/network.json). For every instance in
   registry/instances/, it fetches the map's manifest
   (<url>/portfolio-map.json) and its index.html, and checks:

   - the manifest keeps the protocol (federation/validate.ts) and
     names the same id and address as the registry entry;
   - the map links back: its manifest names the Nexus, and its
     index.html carries the portfolio-map:nexus meta tag;
   - its publisher vouches for it: the map is on the publisher's
     domain, or a DNS TXT record or a homepage link says so, or a
     maintainer confirmed it (federation/protocol.ts OwnerProof).

   The fourth step of the handshake, review, is the registry pull
   request itself: only maintainers merge it (.github/CODEOWNERS).

   A verified map's logo is copied into nexus/public/instances/, so
   the Nexus draws it from its own origin. A map that cannot be
   reached keeps its last good manifest (status "unreachable"); one
   whose backlink is gone ("no-backlink") or whose publisher has not
   vouched for it ("unconfirmed") is listed and stays out of the world. Nothing else about a visitor or an instance is stored.

   Usage: node scripts/build-network.mjs [--keep-on-error] [--offline] [--local <id>=<dir>]
     --keep-on-error  exit 0 when some instances fail (the Nexus
                      build uses this: one map being down must not
                      stop the Nexus from deploying)
     --offline        fetch nothing; rebuild the snapshot from the
                      registry and the previous snapshot
     --local id=dir   read that instance's files from a build on disk
                      instead of its address (the Pages workflow deploys
                      the example map with the Nexus, so it checks the
                      very files it is about to publish)
   ============================================================ */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTxt } from "node:dns/promises";
import { NEXUS_META, OWNER_DNS_LABEL, PROTOCOL, bareHost, canVouch, manifestUrl, ownerTxtValue, pageLinksTo } from "../federation/protocol.ts";
import { offlineProof, validateRegistry, validateRegistryEntry, verifyInstance } from "../federation/validate.ts";
import { ROOT } from "./manifest.mjs";

const REGISTRY = join(ROOT, "registry", "instances");
const OUT = join(ROOT, "nexus", "public", "network.json");
const LOGOS = join(ROOT, "nexus", "public", "instances");
const TIMEOUT_MS = 12000;
const MAX_MANIFEST = 2 * 1024 * 1024;
const MAX_LOGO = 512 * 1024;
const LOGO_TYPES = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "image/svg+xml": "svg" };

/** Every registry entry, checked; throws on a broken registry (CI catches it first). */
export function readRegistry(dir = REGISTRY) {
  const entries = [];
  const problems = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
    let e;
    try {
      e = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (err) {
      problems.push(`${f}: not valid JSON (${err.message})`);
      continue;
    }
    const p = validateRegistryEntry(e, f);
    if (p.length) problems.push(...p.map((x) => `${f}: ${x}`));
    else entries.push(e);
  }
  problems.push(...validateRegistry(entries));
  return { entries, problems };
}

async function get(url, max, accept) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { accept, "user-agent": "portfolio-map-nexus (+https://github.com/fritzhand/portfolio-map-3d)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > max) throw new Error(`larger than ${max} bytes`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new Error(`larger than ${max} bytes`);
    return { buf, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() };
  } finally {
    clearTimeout(timer);
  }
}

/** TXT records at `name` (each record's chunks joined), or [] when there are none. */
async function txtRecords(name) {
  try {
    return (await resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

/**
 * How the map's publisher vouches for it (federation/protocol.ts OwnerProof), or null: on its own
 * domain, or a maintainer's confirmation (no network needed); else a DNS TXT record on its
 * domain; else a link to the map on its homepage.
 */
export async function ownerProof(entry, manifest, fetcher = get, txt = txtRecords) {
  const offline = offlineProof(entry, manifest);
  if (offline) return offline;
  const website = manifest.publisher.website;
  if (!canVouch(website)) return null;
  const host = bareHost(website);
  if ((await txt(`${OWNER_DNS_LABEL}.${host}`)).some((r) => r.trim() === ownerTxtValue(entry.id))) return "dns";
  try {
    const { buf } = await fetcher(website, MAX_MANIFEST, "text/html");
    if (pageLinksTo(buf.toString("utf8"), manifest.url)) return "link";
  } catch {
    /* the homepage could not be read: no link proof */
  }
  return null;
}

/** What to tell a map whose publisher has not vouched for it. */
export function proofHelp(entry, manifest) {
  const site = manifest.publisher.website;
  if (!site) return `its manifest names no publisher website (site.json org.website), so the publisher cannot vouch for it`;
  if (!canVouch(site)) return `its publisher website (${site}) is a shared hosting domain, which cannot vouch for a map: name your organization's own website in site.json org.website`;
  const host = bareHost(site);
  return `${manifest.publisher.name} (${host}) has not vouched for it: serve the map on ${host} or a subdomain of it, or link to ${manifest.url} from ${site}, or add the DNS TXT record ${OWNER_DNS_LABEL}.${host} = "${ownerTxtValue(entry.id)}"`;
}

/** Check one instance against the network; `previous` is its entry in the last snapshot, if any. */
export async function checkInstance(entry, previous, fetcher = get, today = new Date().toISOString().slice(0, 10), txt = txtRecords) {
  const down = (problem) => ({
    entry,
    status: "unreachable",
    checked: previous?.checked ?? null,
    manifest: previous?.manifest ?? null,
    logoFile: previous?.logoFile ?? null,
    proof: previous?.proof ?? null,
    problems: [problem],
  });
  const out = (status, problems) => ({ entry, status, checked: today, manifest: null, logoFile: null, proof: null, problems });
  let manifest;
  try {
    const { buf } = await fetcher(manifestUrl(entry.url), MAX_MANIFEST, "application/json");
    manifest = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return down(`could not read ${manifestUrl(entry.url)}: ${e.message}`);
  }
  // 1. Publish: the manifest keeps the protocol and names this entry. 2. Link: it names the Nexus.
  const v = verifyInstance(entry, manifest);
  if (v.status !== "verified") return out(v.status, v.problems);
  // 2. Link: the page itself carries the meta tag, which a crawler reads without running the app.
  try {
    const { buf } = await fetcher(`${entry.url.replace(/\/$/, "")}/`, MAX_MANIFEST, "text/html");
    if (!buf.toString("utf8").includes(`name="${NEXUS_META}"`)) return out("no-backlink", [`the map's page lacks the ${NEXUS_META} meta tag`]);
  } catch (e) {
    return down(`could not read the map's page: ${e.message}`);
  }
  // 3. Prove: the publisher vouches for the map. (4. Review is the registry pull request itself.)
  const proof = await ownerProof(entry, manifest, fetcher, txt);
  if (!proof) return out("unconfirmed", [proofHelp(entry, manifest)]);
  let logoFile = null;
  if (manifest.logo) {
    try {
      const { buf, type } = await fetcher(manifest.logo, MAX_LOGO, "image/*");
      const ext = LOGO_TYPES[type];
      if (ext && !(ext === "svg" && /<script\b|\son\w+\s*=/i.test(buf.toString("utf8")))) {
        logoFile = `instances/${entry.id}.${ext}`;
        writeLogo(logoFile, buf);
      }
    } catch {
      /* no logo: the Nexus draws the map's initials */
    }
  }
  return { entry, status: "verified", checked: today, manifest, logoFile, proof, problems: [] };
}

let logoWrites = new Map();
function writeLogo(rel, buf) {
  logoWrites.set(rel, buf);
}

/**
 * A fetcher that reads the instances in `locals` ({ id: dir }) from their builds on disk (by path
 * under their registry address) and fetches everything else.
 */
export function localFetcher(entries, locals, fallback = get) {
  const roots = entries.filter((e) => locals[e.id]).map((e) => ({ base: `${e.url.replace(/\/$/, "")}/`, dir: locals[e.id] }));
  const TYPES = { json: "application/json", html: "text/html", svg: "image/svg+xml", png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };
  return async (url, max, accept) => {
    const hit = roots.find((r) => `${url}/`.startsWith(r.base) || url.startsWith(r.base));
    if (!hit) return fallback(url, max, accept);
    const rel = decodeURIComponent(url.slice(hit.base.length).split(/[?#]/)[0]) || "index.html";
    if (rel.split("/").includes("..")) throw new Error("outside the build");
    const buf = readFileSync(join(hit.dir, rel));
    if (buf.length > max) throw new Error(`larger than ${max} bytes`);
    return { buf, type: TYPES[rel.split(".").pop()] ?? "application/octet-stream" };
  };
}

/** Build the snapshot. Returns it and the problems found. */
export async function buildNetwork({ offline = false, fetcher = get, previous = null } = {}) {
  const { entries, problems } = readRegistry();
  const prev = new Map((previous?.instances ?? []).map((i) => [i.entry.id, i]));
  logoWrites = new Map();
  const instances = [];
  for (const entry of entries) {
    if (offline) {
      const p = prev.get(entry.id);
      instances.push(p ? { ...p, entry, proof: p.proof ?? null } : { entry, status: "unreachable", checked: null, manifest: null, logoFile: null, proof: null, problems: ["not checked yet"] });
      continue;
    }
    instances.push(await checkInstance(entry, prev.get(entry.id), fetcher));
  }
  const snapshot = { protocol: PROTOCOL, generated: new Date().toISOString().slice(0, 10), instances };
  return { snapshot, problems: [...problems, ...instances.filter((i) => i.status !== "verified").map((i) => `${i.entry.id}: ${i.status} — ${i.problems.join("; ")}`)], logos: logoWrites };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const locals = Object.fromEntries(argv.flatMap((a, i) => (a === "--local" && argv[i + 1]?.includes("=") ? [argv[i + 1].split("=")] : [])));
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    /* first run */
  }
  const fetcher = Object.keys(locals).length ? localFetcher(readRegistry().entries, locals) : get;
  const { snapshot, problems, logos } = await buildNetwork({ offline: args.has("--offline"), previous, fetcher });
  // Logos: write the new ones, and drop files no instance names any more.
  mkdirSync(LOGOS, { recursive: true });
  for (const [rel, buf] of logos) writeFileSync(join(ROOT, "nexus", "public", rel), buf);
  const keep = new Set(snapshot.instances.map((i) => i.logoFile).filter(Boolean).map((f) => f.replace("instances/", "")));
  for (const f of readdirSync(LOGOS)) if (!keep.has(f) && f !== ".gitkeep") rmSync(join(LOGOS, f));
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const verified = snapshot.instances.filter((i) => i.status === "verified").length;
  console.log(`network: ${verified} of ${snapshot.instances.length} instance(s) verified → ${OUT.replace(`${ROOT}/`, "")}`);
  if (problems.length) {
    console.error(`network: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    if (!args.has("--keep-on-error")) process.exit(1);
  }
}
