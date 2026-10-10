import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { MANIFEST_FILE, NEXUS_META, NEXUS_URL, nexusHref } from "../federation/protocol.ts";
import { publicData } from "../vite.config.ts";
import { checkNetwork, scanDir, scanText } from "./check-bundle.mjs";
import { buildManifest, readSite } from "./manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c2lnbmF0dXJl`;

const base = mkdtempSync(join(tmpdir(), "check-bundle-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("check-bundle", () => {
  it("passes publishable and anon keys", () => {
    expect(scanText(`const k="sb_publishable_oCVHG6mBeHrfZJO4NTzAIw_NlEM9V9B";`)).toEqual([]);
    expect(scanText(`apikey:"${jwt({ iss: "supabase", role: "anon" })}"`)).toEqual([]);
    expect(scanText("eyJhbGciOi.not-a-token and plain text")).toEqual([]);
  });

  it("fails on a secret key or a JWT that isn't anon", () => {
    expect(scanText(`x="sb_secret_CANARYSECRET999"`)).toHaveLength(1);
    expect(scanText(`x="${jwt({ role: "service_role" })}"`)[0]).toMatch(/service_role/);
    expect(scanText(`x="${jwt({ sub: "1234" })}"`)[0]).toMatch(/role null/);
  });

  it("fails when the data files' provenance ships", () => {
    expect(scanText(`source:{kind:"org-records",title:"Example Collective's records"}`)[0]).toMatch(/organization's records/);
    expect(scanText(`source:{kind:"company-supplied",title:"Jane Doe, CEO (email)",retrieved:"2026-10-09"}`)[0]).toMatch(/company-supplied/);
    expect(scanText(`{descriptionSource:{url:"https://example.com"}}`)[0]).toMatch(/descriptionSource/);
    expect(scanText(`{"_about":"The companies on the map."}`)[0]).toMatch(/_about/);
  });

  it("finds the example site's provenance in its data files, and none in what publicData keeps", () => {
    for (const [file, path] of [["companies.json", "data/companies.json"], ["people.json", "data/people.json"], ["taxonomy.json", "taxonomy.json"], ["site.json", "site.json"]]) {
      const data = JSON.parse(readFileSync(join(root, "site", path), "utf8"));
      expect(scanText(JSON.stringify(publicData(file, structuredClone(data)))), file).toEqual([]);
      if (file !== "site.json") expect(scanText(JSON.stringify(data)).length, file).toBeGreaterThan(0);
    }
  });

  it("scans every text file in a build, at any depth", () => {
    const dir = join(base, "scan");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<script></script>");
    writeFileSync(join(dir, "assets", "app.js"), `const k="sb_publishable_x";`);
    writeFileSync(join(dir, "assets", "logo.png"), "sb_secret_IN_A_BINARY_FILE");
    expect(scanDir(dir)).toEqual([]);
    writeFileSync(join(dir, "assets", "WalkView-abc.js"), `const env={K:"sb_secret_CANARYSECRET999"};`);
    const found = scanDir(dir);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^assets[\\/]WalkView-abc\.js: Supabase secret key/);
  });
});

describe("checkNetwork (the build's link into the Portfolio Map Network)", () => {
  let n = 0;
  /** A minimal build linked into the network, with one change. */
  function build(change = () => {}) {
    const dir = join(base, `dist-${n++}`);
    mkdirSync(join(dir, "assets"), { recursive: true });
    const files = {
      [MANIFEST_FILE]: JSON.stringify(buildManifest(readSite(root), "2026-10-09")),
      "index.html": `<head><meta name="${NEXUS_META}" content="${nexusHref("example-collective")}" /></head>`,
      "assets/index-abc.js": `const nexus="${NEXUS_URL}";`,
    };
    change(files);
    for (const [f, text] of Object.entries(files)) if (text !== null) writeFileSync(join(dir, f), text);
    return checkNetwork(dir);
  }

  it("passes a build with the manifest, the meta tag and the Nexus link", () => {
    expect(build()).toEqual([]);
  });

  it("fails a build without the manifest, or with one that is not valid", () => {
    expect(build((f) => (f[MANIFEST_FILE] = null))[0]).toMatch(/portfolio-map\.json is missing/);
    expect(build((f) => (f[MANIFEST_FILE] = "{not json"))).toEqual(["portfolio-map.json is not valid JSON"]);
    const m = buildManifest(readSite(root), "2026-10-09");
    m.protocol = "portfolio-map/0";
    expect(build((f) => (f[MANIFEST_FILE] = JSON.stringify(m))).some((p) => p.startsWith("portfolio-map.json: protocol"))).toBe(true);
  });

  it("fails a manifest that names another Nexus", () => {
    const m = buildManifest(readSite(root), "2026-10-09");
    m.nexus = "https://other-nexus.example";
    expect(build((f) => (f[MANIFEST_FILE] = JSON.stringify(m)))).toEqual([`portfolio-map.json: names https://other-nexus.example as its Nexus, not ${NEXUS_URL}`]);
  });

  it("fails a build whose index.html lacks the meta tag, or whose scripts lost the Nexus link", () => {
    expect(build((f) => (f["index.html"] = "<head></head>"))).toEqual([`index.html lacks the ${NEXUS_META} meta tag`]);
    expect(build((f) => (f["assets/index-abc.js"] = "const nothing = 1;"))[0]).toMatch(/^no script links to the Nexus/);
  });
});
