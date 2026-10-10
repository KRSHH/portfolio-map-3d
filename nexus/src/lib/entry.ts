import { instanceHref } from "../../../federation/protocol.ts";

/** Direct entry into a map's walk view, preserving the Nexus arrival marker. */
export function planetEntryHref(world: { id: string; url: string }): string {
  const u = new URL(instanceHref(world.url));
  const geographic = world.id === "india-ecosystem-map" || world.id === "florida-ecosystem-map";
  if (geographic) u.pathname += "walkable-map.html";
  else u.searchParams.set("view", "walk");
  return u.toString();
}
