import { describe, expect, it } from "vitest";
import { NEXUS_URL, PROTOCOL, type Manifest, type RegistryEntry } from "./protocol.ts";
import { isHttpsUrl, offlineProof, validateManifest, validateRegistry, validateRegistryEntry, verifyInstance } from "./validate.ts";

// scripts/manifest.mjs is plain JavaScript without type declarations: import it untyped and say what it returns.
const { buildManifest, readSite } = (await import("../scripts/manifest.mjs" as string)) as {
  buildManifest: (site: unknown, today?: string) => Manifest;
  readSite: () => unknown;
};

/** The example site's manifest, as the build writes it. */
const manifest = (): Manifest => buildManifest(readSite(), "2026-10-09");

/** A copy of the manifest with one change. */
const edit = (change: (m: Record<string, any>) => void) => {
  const m = structuredClone(manifest()) as Record<string, any>;
  change(m);
  return m;
};

const entry: RegistryEntry = { id: "example-collective", name: "Example Collective", url: "https://wearenexus.xyz/example", joined: "2026-10-09", maintainer: "example-maintainer" };

describe("validateManifest", () => {
  it("accepts the manifest built from the example site", () => {
    const m = manifest();
    expect(m.protocol).toBe(PROTOCOL);
    expect(m.nexus).toBe(NEXUS_URL);
    expect(validateManifest(m)).toEqual([]);
  });

  it("rejects anything that is not an object", () => {
    for (const v of [null, [], "manifest", 42]) expect(validateManifest(v)).toEqual(["the manifest is not a JSON object"]);
  });

  it("rejects unknown fields, at the top and inside", () => {
    expect(validateManifest(edit((m) => (m.contact = "someone")))).toContain('manifest: unexpected field "contact"');
    expect(validateManifest(edit((m) => (m.companies[0].founders = [])))).toContain('companies[0]: unexpected field "founders"');
    expect(validateManifest(edit((m) => (m.districts[0].note = "x")))).toContain('districts[0]: unexpected field "note"');
  });

  it("rejects a missing field", () => {
    expect(validateManifest(edit((m) => delete m.updated))).toContain('manifest: missing field "updated"');
  });

  it("rejects another protocol", () => {
    expect(validateManifest(edit((m) => (m.protocol = "portfolio-map/2")))).toContain(`protocol: expected "${PROTOCOL}"`);
  });

  it("rejects an email address or a phone number in a description", () => {
    expect(validateManifest(edit((m) => (m.companies[0].description = "Write to hello@brightpath-care.example for a demo.")))).toContain("companies[0].description: looks like it holds an email address");
    expect(validateManifest(edit((m) => (m.companies[0].description = "Call 813-555-0100 to book.")))).toContain("companies[0].description: looks like it holds a phone number");
  });

  it("rejects a description longer than the protocol allows", () => {
    expect(validateManifest(edit((m) => (m.companies[0].description = "x".repeat(401))))).toContain("companies[0].description: longer than 400 characters");
  });

  it("rejects a company in a district the manifest does not list", () => {
    expect(validateManifest(edit((m) => (m.companies[0].district = "space")))).toContain("companies[0].district: not one of the manifest's districts");
  });

  it("rejects counts that do not add up", () => {
    expect(validateManifest(edit((m) => (m.counts.companies += 1)))).toContain(`counts.companies: says ${manifest().companies.length + 1}, the index lists ${manifest().companies.length}`);
    expect(validateManifest(edit((m) => (m.counts.districts = 1))).some((p) => p.startsWith("counts.districts: says 1"))).toBe(true);
    const p = validateManifest(edit((m) => (m.districts[0].count += 1)));
    expect(p.some((x) => x.startsWith(`districts "${manifest().districts[0].slug}": count says`))).toBe(true);
    expect(validateManifest(edit((m) => (m.counts.people = -1)))).toContain("counts.people: expected a whole number");
  });

  it("rejects an http address where https is required", () => {
    expect(validateManifest(edit((m) => (m.url = "http://wearenexus.xyz/example")))).toContain("url: expected an https address");
    expect(validateManifest(edit((m) => (m.companies[0].website = "http://brightpath-care.example")))).toContain("companies[0].website: expected an https address or null");
    expect(validateManifest(edit((m) => (m.logo = "http://example.org/logo.svg")))).toContain("logo: expected an https address or null");
  });

  it("rejects a map address with a trailing slash, a query or a hash", () => {
    expect(validateManifest(edit((m) => (m.url += "/")))).toContain(`url: expected "${manifest().url}" (no trailing slash, query or hash)`);
  });

  it("rejects duplicate slugs and bad colors", () => {
    expect(validateManifest(edit((m) => (m.companies[1].slug = m.companies[0].slug))).some((p) => p.includes("twice"))).toBe(true);
    expect(validateManifest(edit((m) => (m.accent = "teal")))).toContain('accent: expected a color like "#3366ff"');
  });
});

describe("validateRegistryEntry", () => {
  it("accepts a well-formed entry in a file named for its id", () => {
    expect(validateRegistryEntry(entry, "example-collective.json")).toEqual([]);
    expect(validateRegistryEntry(entry)).toEqual([]);
  });

  it("needs the file to be named <id>.json", () => {
    expect(validateRegistryEntry(entry, "example.json")).toEqual(['the file must be named "example-collective.json"']);
  });

  it("needs a GitHub handle as the maintainer, never an email address", () => {
    for (const maintainer of ["someone@example.org", "@example-maintainer", "-bad", "bad--handle", "x".repeat(40)])
      expect(validateRegistryEntry({ ...entry, maintainer }), maintainer).toContain("maintainer: expected a GitHub handle (no @, no email)");
  });

  it("needs an https address with no trailing slash", () => {
    expect(validateRegistryEntry({ ...entry, url: `${entry.url}/` })).toContain(`url: expected "${entry.url}" (no trailing slash, query or hash)`);
    expect(validateRegistryEntry({ ...entry, url: "http://wearenexus.xyz/example" })).toContain("url: expected an https address");
  });

  it("rejects unknown fields, a bad id and a bad date", () => {
    expect(validateRegistryEntry({ ...entry, email: "x" })).toContain('entry: unexpected field "email"');
    expect(validateRegistryEntry({ ...entry, id: "Example" })).toContain("id: expected lowercase letters, digits and hyphens (2-48 characters)");
    expect(validateRegistryEntry({ ...entry, joined: "09-Oct-2026" })).toContain("joined: expected YYYY-MM-DD");
    expect(validateRegistryEntry("entry")).toEqual(["the entry is not a JSON object"]);
  });

  it("takes ownerConfirmedBy only from a maintainer", () => {
    expect(validateRegistryEntry({ ...entry, ownerConfirmedBy: "fritzhand" })).toEqual([]);
    expect(validateRegistryEntry({ ...entry, ownerConfirmedBy: "someone-else" }).join(" ")).toContain("ownerConfirmedBy: only a maintainer");
  });
});

describe("the manifest's publisher", () => {
  it("is required, with a name and an https website or null", () => {
    expect(validateManifest({ ...manifest(), publisher: { name: "Acme", website: null } })).toEqual([]);
    expect(validateManifest({ ...manifest(), publisher: { name: "Acme", website: "http://acme.example" } })).toContain("publisher.website: expected an https address or null");
    expect(validateManifest({ ...manifest(), publisher: { name: "Acme", website: null, email: "x" } })).toContain('publisher: unexpected field "email"');
    const { publisher, ...rest } = manifest() as Record<string, unknown>;
    void publisher;
    expect(validateManifest(rest)).toContain('manifest: missing field "publisher"');
  });

  it("offlineProof: the publisher's domain or a maintainer, else the network decides", () => {
    const m = manifest();
    const onDomain = { ...m, url: "https://map.acme.example", publisher: { name: "Acme", website: "https://acme.example" } };
    expect(offlineProof({ ...entry, url: onDomain.url }, onDomain)).toBe("domain");
    const off = { ...m, publisher: { name: "Acme", website: "https://acme.example" } };
    expect(offlineProof(entry, off)).toBeNull();
    expect(offlineProof({ ...entry, ownerConfirmedBy: "fritzhand" }, off)).toBe("maintainer");
  });
});

describe("validateRegistry", () => {
  it("accepts distinct entries", () => {
    expect(validateRegistry([entry, { ...entry, id: "another-map", url: "https://another-map.example" }])).toEqual([]);
  });

  it("finds an id or an address listed twice", () => {
    expect(validateRegistry([entry, { ...entry, url: "https://another-map.example" }])).toEqual(['id "example-collective" is listed twice']);
    expect(validateRegistry([entry, { ...entry, id: "another-map", url: `${entry.url}/` }])).toEqual([`address ${entry.url} is listed twice`]);
  });
});

describe("verifyInstance", () => {
  it("verifies a valid manifest that matches its entry and links back to the Nexus", () => {
    expect(verifyInstance(entry, manifest())).toEqual({ status: "verified", problems: [] });
  });

  it("calls a manifest that fails the protocol invalid, with its problems", () => {
    const r = verifyInstance(entry, edit((m) => (m.protocol = "other")));
    expect(r.status).toBe("invalid");
    expect(r.problems).toContain(`protocol: expected "${PROTOCOL}"`);
  });

  it("calls a manifest for another id or address invalid", () => {
    expect(verifyInstance({ ...entry, id: "someone-else" }, manifest())).toEqual({ status: "invalid", problems: ['the manifest\'s id is "example-collective", the registry\'s is "someone-else"'] });
    expect(verifyInstance({ ...entry, url: "https://another-map.example" }, manifest()).status).toBe("invalid");
  });

  it("finds no backlink when the manifest names another Nexus", () => {
    const r = verifyInstance(entry, edit((m) => (m.nexus = "https://other-nexus.example")));
    expect(r.status).toBe("no-backlink");
    expect(r.problems[0]).toMatch(/links to https:\/\/other-nexus\.example, not to the Nexus/);
  });
});

describe("isHttpsUrl", () => {
  it("takes absolute https addresses without credentials", () => {
    expect(isHttpsUrl("https://example.org/a")).toBe(true);
    for (const bad of ["http://example.org", "https://user:pw@example.org", "https://exa mple.org", "/relative", null, 42]) expect(isHttpsUrl(bad)).toBe(false);
  });
});
