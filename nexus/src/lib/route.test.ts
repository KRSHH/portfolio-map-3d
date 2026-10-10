import { describe, expect, it } from "vitest";
import { nexusHref } from "../../../federation/protocol.ts";
import { LANDING, namesArrival, parseRoute, routeSearch } from "./route.ts";

describe("parseRoute", () => {
  it("reads the landing page", () => {
    expect(parseRoute("")).toEqual(LANDING);
    expect(parseRoute("?sample")).toEqual({ ...LANDING, sample: true });
    expect(parseRoute("?from=acme")).toEqual(LANDING);
  });

  it("reads the world, its selection and an arrival", () => {
    expect(parseRoute("?world")).toEqual({ mode: "world", world: null, from: null, via: null, sample: false });
    expect(parseRoute("?world=acme-ventures")).toMatchObject({ mode: "world", world: "acme-ventures" });
    expect(parseRoute("?world&from=acme")).toMatchObject({ mode: "world", world: null, from: "acme", via: null });
    expect(parseRoute("?world&from=acme&via=portal&sample")).toEqual({ mode: "world", world: null, from: "acme", via: "portal", sample: true });
  });

  it("reads the links instances make (protocol.ts nexusHref)", () => {
    const link = new URL(nexusHref("acme", "link"));
    const portal = new URL(nexusHref("acme", "portal"));
    expect(parseRoute(link.search)).toMatchObject({ mode: "world", from: "acme", via: null });
    expect(parseRoute(portal.search)).toMatchObject({ mode: "world", from: "acme", via: "portal" });
    expect(parseRoute(new URL(nexusHref(null)).search)).toMatchObject({ mode: "world", from: null });
  });

  it("ignores malformed ids", () => {
    expect(parseRoute("?world=Not%20An%20Id")).toMatchObject({ mode: "world", world: null });
    expect(parseRoute("?world&from=<script>")).toMatchObject({ from: null, via: null });
    expect(parseRoute("?world&from=a--b")).toMatchObject({ from: null });
    expect(parseRoute("?world&via=portal")).toMatchObject({ from: null, via: null });
  });
});

describe("namesArrival", () => {
  it("notices any from=, even a malformed one, in the world only", () => {
    expect(namesArrival("?world&from=acme")).toBe(true);
    expect(namesArrival("?world&from=%3Cscript%3E")).toBe(true);
    expect(namesArrival("?world&from=")).toBe(true);
    expect(namesArrival("?world")).toBe(false);
    expect(namesArrival("?from=acme")).toBe(false);
  });
});

describe("routeSearch", () => {
  it("round-trips", () => {
    for (const s of ["", "?sample", "?world", "?world=acme", "?world&from=acme", "?world&from=acme&via=portal", "?world=acme&from=beta&sample"]) {
      expect(routeSearch(parseRoute(s))).toBe(s);
    }
  });

  it("drops invalid ids and a portal without an arrival", () => {
    expect(routeSearch({ mode: "world", world: "BAD ID", from: null, via: "portal", sample: false })).toBe("?world");
    expect(routeSearch({ mode: "landing", world: "acme", from: "acme", via: null, sample: false })).toBe("");
  });
});
