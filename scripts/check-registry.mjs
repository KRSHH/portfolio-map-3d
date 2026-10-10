#!/usr/bin/env node
/* ============================================================
   check-registry.mjs — CI's check on registry/instances/: every
   file is one instance, named <id>.json, with the fields the
   protocol asks for (federation/validate.ts), and no id or address
   is listed twice. It does not fetch anything: the Nexus build
   (scripts/build-network.mjs) checks each map's manifest and
   backlink. With --fetch it does that too, for one pull request's
   new entry: node scripts/check-registry.mjs --fetch <id>
   ============================================================ */
import { fileURLToPath } from "node:url";
import { checkInstance, readRegistry } from "./build-network.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { entries, problems } = readRegistry();
  if (problems.length) {
    console.error(`registry: ${problems.length} problem(s) in registry/instances/ (docs/network.md)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`registry: OK — ${entries.length} instance(s).`);
  const i = process.argv.indexOf("--fetch");
  if (i > 0) {
    const id = process.argv[i + 1];
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      console.error(`registry: no instance "${id}"`);
      process.exit(1);
    }
    const result = await checkInstance(entry, null);
    if (result.status !== "verified") {
      console.error(`registry: ${id} is ${result.status}\n  ${result.problems.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`registry: ${id} is verified — its manifest keeps the protocol and it links to the Nexus.`);
  }
}
