import { describe, expect, it } from "vitest";
import type { FlyRequest } from "../../state/store";
import { firstFly, flyInput, missedFly, ownsFly } from "./globeFlies";

const fly = (kind: FlyRequest["kind"], nonce: number, slug?: string): FlyRequest => ({ kind, slug, nonce });

describe("which globe follows which fly request", () => {
  it("sends person requests to the people globe and everything else to the companies globe", () => {
    expect(ownsFly("people", fly("person", 1, "ada-lindqvist"))).toBe(true);
    for (const k of ["company", "district", "home"] as const) {
      expect(ownsFly("people", fly(k, 1))).toBe(false);
      expect(ownsFly("companies", fly(k, 1))).toBe(true);
    }
    expect(ownsFly("companies", fly("person", 1, "ada-lindqvist"))).toBe(false);
  });

  it("turns a store request into a controller request", () => {
    expect(flyInput(fly("person", 4, "ada-lindqvist"))).toEqual({ kind: "person", slug: "ada-lindqvist" });
  });

  it("makes a globe's first move to what is open on it", () => {
    expect(firstFly("companies", { selected: "signalforge", person: null, focusDistrict: "health" })).toEqual({ kind: "company", slug: "signalforge" });
    expect(firstFly("companies", { selected: null, person: null, focusDistrict: "health" })).toEqual({ kind: "district", slug: "health" });
    expect(firstFly("companies", { selected: null, person: "ada-lindqvist", focusDistrict: null })).toBeNull();
    expect(firstFly("people", { selected: null, person: "ada-lindqvist", focusDistrict: null })).toEqual({ kind: "person", slug: "ada-lindqvist" });
    expect(firstFly("people", { selected: "signalforge", person: null, focusDistrict: "health" })).toBeNull();
  });

  it("on the way back acts only on a request made while away, and only one of its own", () => {
    // A company picked in the search while the people globe was up.
    expect(missedFly("companies", fly("company", 9, "signalforge"), 7)).toEqual({ kind: "company", slug: "signalforge" });
    // Nothing new since the globe went away: it resumes exactly as it was.
    expect(missedFly("companies", fly("company", 7, "signalforge"), 7)).toBeNull();
    // A newer request, but for the other globe.
    expect(missedFly("companies", fly("person", 9, "ada-lindqvist"), 7)).toBeNull();
    expect(missedFly("people", fly("person", 9, "ada-lindqvist"), 7)).toEqual({ kind: "person", slug: "ada-lindqvist" });
    expect(missedFly("people", null, 0)).toBeNull();
  });
});
