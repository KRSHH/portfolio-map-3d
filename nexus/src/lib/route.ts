/* The Nexus's addresses. Everything it shows can be linked to:

     /                     the landing page
     /?world               the world, overview
     /?world=<id>          the world, turned to one instance with its panel open
     /?world&from=<id>     an arrival from an instance (protocol.ts nexusHref): framed on it, welcomed
     ...&via=portal        the visitor walked through the walk world's portal (a short transition)
     ...&sample            fictional sample data instead of network.json (development only; badged)

   Pure functions, unit-tested. */
import { ID_PATTERN, arrivalFrom } from "../../../federation/protocol.ts";

export interface Route {
  mode: "landing" | "world";
  /** The instance whose panel is open, or null for the overview. */
  world: string | null;
  /** The instance the visitor arrived from, or null. */
  from: string | null;
  via: "portal" | null;
  sample: boolean;
}

export const LANDING: Route = { mode: "landing", world: null, from: null, via: null, sample: false };

export function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const sample = p.has("sample");
  if (!p.has("world")) return { ...LANDING, sample };
  const w = p.get("world");
  const world = w && ID_PATTERN.test(w) ? w : null;
  const from = arrivalFrom(search);
  return { mode: "world", world, from, via: from && p.get("via") === "portal" ? "portal" : null, sample };
}

/** The query string for a route ("" for the plain landing page). */
export function routeSearch(r: Route): string {
  const parts: string[] = [];
  if (r.mode === "world") {
    parts.push(r.world && ID_PATTERN.test(r.world) ? `world=${r.world}` : "world");
    if (r.from && ID_PATTERN.test(r.from)) {
      parts.push(`from=${r.from}`);
      if (r.via === "portal") parts.push("via=portal");
    }
  }
  if (r.sample) parts.push("sample");
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * Did the address name a map the visitor came from (`?world&from=…`), well formed or not? A map
 * that is not a world here gets a neutral note, and its id is never echoed back.
 */
export function namesArrival(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.has("world") && p.has("from");
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeSearch(a) === routeSearch(b);
}
