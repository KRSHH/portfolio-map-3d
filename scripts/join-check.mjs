#!/usr/bin/env node
/* ============================================================
   join-check.mjs — before you apply to join the network: checks
   your deployed map against the whole linking handshake, the way
   the Nexus will (docs/network.md):

     1. Publish  your manifest is at <url>/portfolio-map.json and
                 keeps the protocol;
     2. Link     it names the Nexus, and your page carries the
                 portfolio-map:nexus meta tag;
     3. Prove    your publisher vouches for the map (on its domain,
                 a link from its homepage, or a DNS TXT record);
     4. Review   prints the registry file to add by pull request.

   Usage: npm run join-check -- https://map.yourorg.com
   ============================================================ */
import { fileURLToPath } from "node:url";
import { manifestUrl, normalizeUrl } from "../federation/protocol.ts";
import { checkInstance } from "./build-network.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raw = process.argv[2];
  if (!raw || !/^https:\/\//.test(raw)) {
    console.error("Usage: npm run join-check -- https://map.yourorg.com");
    process.exit(2);
  }
  const url = normalizeUrl(raw);
  let manifest;
  try {
    const res = await fetch(manifestUrl(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    console.error(`✗ Publish: could not read ${manifestUrl(url)} (${e.message}). Deploy the map built with npm run build.`);
    process.exit(1);
  }
  const entry = { id: String(manifest.id ?? ""), name: String(manifest.name ?? ""), url, joined: new Date().toISOString().slice(0, 10), maintainer: "your-github-handle" };
  const r = await checkInstance(entry, null);
  const steps = {
    invalid: "✗ Publish: the manifest breaks the protocol",
    "no-backlink": "✗ Link: the map does not link to the Nexus",
    unconfirmed: "✗ Prove: your publisher has not vouched for the map",
    unreachable: "✗ the map could not be read",
  };
  if (r.status !== "verified") {
    console.error(`${steps[r.status]}\n  ${r.problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ Publish: ${manifestUrl(url)} keeps the protocol (${manifest.counts.companies} ${manifest.labels.companies}).`);
  console.log("✓ Link: the manifest and the page link to the Nexus.");
  console.log(`✓ Prove: ${{ domain: "the map is on your publisher's domain", dns: "your DNS TXT record vouches for it", link: "your homepage links to it", maintainer: "a maintainer confirmed it" }[r.proof]}.`);
  console.log(`→ Review: open a pull request adding registry/instances/${entry.id}.json:\n${JSON.stringify({ ...entry, maintainer: "<your GitHub handle>" }, null, 2)}`);
}
