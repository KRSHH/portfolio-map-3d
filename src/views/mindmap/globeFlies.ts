/* Which store fly requests each globe acts on. Pure, so the rules are unit-tested.

   The companies globe follows company, district and Overview requests; the people globe follows
   person requests. Only the globe in view listens. A globe the visitor switches back to acts on a
   request made while it was away (a company picked in the search while the people globe was up,
   say), and on nothing older: otherwise it resumes exactly as it was left. */
import type { FlyRequest, Roster } from "../../state/store";
import type { FlyInput } from "./controller";

export function ownsFly(roster: Roster, f: FlyRequest): boolean {
  return roster === "people" ? f.kind === "person" : f.kind !== "person";
}

/** The request as the controller takes it. */
export function flyInput(f: FlyRequest): FlyInput {
  return { kind: f.kind, slug: f.slug };
}

/** A globe's first move when it first appears: to what a deep link (or the visitor) opened. */
export function firstFly(roster: Roster, s: { selected: string | null; person: string | null; focusDistrict: string | null }): FlyInput | null {
  if (roster === "people") return s.person ? { kind: "person", slug: s.person } : null;
  if (s.selected) return { kind: "company", slug: s.selected };
  if (s.focusDistrict) return { kind: "district", slug: s.focusDistrict };
  return null;
}

/** On coming back into view: the request made while this globe was away, if it is one for this globe. */
export function missedFly(roster: Roster, fly: FlyRequest | null, seen: number): FlyInput | null {
  return fly && fly.nonce > seen && ownsFly(roster, fly) ? flyInput(fly) : null;
}
