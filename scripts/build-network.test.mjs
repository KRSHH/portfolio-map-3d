import { describe, expect, it } from "vitest";
import { NEXUS_URL, manifestUrl, ownerTxtValue } from "../federation/protocol.ts";
import { checkInstance, ownerProof } from "./build-network.mjs";
import { buildManifest, readSite } from "./manifest.mjs";

/** The example site's manifest, published by Acme on acme.example, the map on a subdomain of it unless a test moves it. */
const base = buildManifest(readSite(), "2026-10-09");
const manifest = { ...base, url: "https://map.acme.example", publisher: { name: "Acme", website: "https://www.acme.example" }, logo: "https://map.acme.example/brand/logo.svg" };
const entry = { id: manifest.id, name: manifest.name, url: manifest.url, joined: "2026-10-09", maintainer: "someone" };
const page = `<!doctype html><meta name="portfolio-map:nexus" content="${NEXUS_URL}/?world&from=${manifest.id}">`;
const noTxt = async () => [];

/** A stand-in for the network: URL -> body (or an Error to throw). */
function fetcher(routes) {
  return async (url) => {
    const r = routes[url];
    if (r === undefined || r instanceof Error) throw r ?? new Error("HTTP 404");
    return { buf: Buffer.from(typeof r === "string" ? r : JSON.stringify(r)), type: url.endsWith(".svg") ? "image/svg+xml" : "application/json" };
  };
}
const site = (m, extra = {}) => fetcher({ [manifestUrl(m.url)]: m, [`${m.url}/`]: page, ...extra });

describe("checkInstance: the handshake", () => {
  it("verifies a map on its publisher's domain that links back, and copies its logo", async () => {
    const r = await checkInstance(entry, null, site(manifest, { [manifest.logo]: "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>" }), "2026-10-09", noTxt);
    expect(r).toMatchObject({ status: "verified", proof: "domain", problems: [], logoFile: `instances/${entry.id}.svg` });
    expect(r.manifest.id).toBe(entry.id);
  });

  it("drops a map whose page no longer carries the Nexus meta tag", async () => {
    const r = await checkInstance(entry, null, fetcher({ [manifestUrl(entry.url)]: manifest, [`${entry.url}/`]: "<!doctype html><title>x</title>" }), undefined, noTxt);
    expect(r).toMatchObject({ status: "no-backlink", manifest: null, proof: null });
  });

  it("drops a map whose manifest names another Nexus", async () => {
    const r = await checkInstance(entry, null, site({ ...manifest, nexus: "https://elsewhere.example" }), undefined, noTxt);
    expect(r.status).toBe("no-backlink");
  });

  it("marks a manifest for another id invalid", async () => {
    const r = await checkInstance(entry, null, site({ ...manifest, id: "someone-else" }), undefined, noTxt);
    expect(r.status).toBe("invalid");
  });

  it("keeps the last good world of a map that is down", async () => {
    const previous = { entry, status: "verified", checked: "2026-10-01", manifest, logoFile: null, proof: "domain", problems: [] };
    const r = await checkInstance(entry, previous, fetcher({}), undefined, noTxt);
    expect(r).toMatchObject({ status: "unreachable", manifest, checked: "2026-10-01", proof: "domain" });
  });

  it("never copies an SVG logo that carries a script", async () => {
    const r = await checkInstance(entry, null, site(manifest, { [manifest.logo]: "<svg onload='alert(1)'/>" }), undefined, noTxt);
    expect(r.status).toBe("verified");
    expect(r.logoFile).toBeNull();
  });
});

describe("ownerProof: the publisher vouches for the map", () => {
  const elsewhere = { ...manifest, url: "https://acme-map.vercel.example" };
  const elsewhereEntry = { ...entry, url: elsewhere.url };

  it("leaves a map off the publisher's domain unconfirmed, and says how to fix it", async () => {
    const r = await checkInstance(elsewhereEntry, null, site(elsewhere, { "https://www.acme.example": "<a href='/about'>About</a>" }), undefined, noTxt);
    expect(r.status).toBe("unconfirmed");
    expect(r.manifest).toBeNull();
    expect(r.problems[0]).toContain(`_portfolio-map.acme.example = "${ownerTxtValue(entry.id)}"`);
  });

  it("accepts a link to the map from the publisher's homepage", async () => {
    const home = fetcher({ "https://www.acme.example": `<a class="x" href="https://acme-map.vercel.example/">Our portfolio in 3D</a>` });
    expect(await ownerProof(elsewhereEntry, elsewhere, home, noTxt)).toBe("link");
  });

  it("accepts the DNS TXT record on the publisher's domain, and only for this id", async () => {
    const txt = async (name) => (name === "_portfolio-map.acme.example" ? [ownerTxtValue(entry.id)] : []);
    expect(await ownerProof(elsewhereEntry, elsewhere, fetcher({}), txt)).toBe("dns");
    const other = async () => [ownerTxtValue("another-map")];
    expect(await ownerProof(elsewhereEntry, elsewhere, fetcher({}), other)).toBeNull();
  });

  it("accepts a maintainer's confirmation in the registry, and nobody else's", async () => {
    expect(await ownerProof({ ...elsewhereEntry, ownerConfirmedBy: "fritzhand" }, elsewhere, fetcher({}), noTxt)).toBe("maintainer");
    expect(await ownerProof({ ...elsewhereEntry, ownerConfirmedBy: "someone" }, elsewhere, fetcher({}), noTxt)).toBeNull();
  });

  it("cannot vouch without a publisher website", async () => {
    expect(await ownerProof(elsewhereEntry, { ...elsewhere, publisher: { name: "Acme", website: null } }, fetcher({}), noTxt)).toBeNull();
  });

  it("never lets a shared hosting domain vouch, by domain, link or DNS", async () => {
    const shared = { ...manifest, url: "https://acme.github.io/map", publisher: { name: "Acme", website: "https://github.io" } };
    const e = { ...entry, url: shared.url };
    const home = fetcher({ "https://github.io": `<a href="https://acme.github.io/map">x</a>` });
    const txt = async () => [ownerTxtValue(entry.id)];
    expect(await ownerProof(e, shared, home, txt)).toBeNull();
  });

  it("does not take a look-alike domain for the publisher's", async () => {
    const lookalike = { ...manifest, url: "https://map.notacme.example" };
    expect(await ownerProof({ ...entry, url: lookalike.url }, lookalike, fetcher({}), noTxt)).toBeNull();
    const suffix = { ...manifest, url: "https://evilacme.example" };
    expect(await ownerProof({ ...entry, url: suffix.url }, suffix, fetcher({}), noTxt)).toBeNull();
  });
});
