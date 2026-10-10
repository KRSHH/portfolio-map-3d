/* The engine's view of the network model: what each world shows, in its own labels. */
import { initials, plural, shortCountLine } from "../lib/copy.ts";
import type { NetworkModel } from "../lib/network.ts";
import type { EngineWorld } from "./engine.ts";

export function engineWorlds(model: NetworkModel): EngineWorld[] {
  return model.worlds.map((w) => ({
    id: w.id,
    placement: w.placement,
    accent: w.accent,
    dim: w.status === "unreachable",
    title: w.name,
    subtitle: w.status === "unreachable" ? "Not reachable at last check" : shortCountLine(w.manifest),
    initials: initials(w.name),
    logoUrl: w.logo ? `${import.meta.env.BASE_URL}${w.logo}` : null,
    districts: w.manifest.districts.map((d) => ({ slug: d.slug, color: d.color, count: d.count })),
    companies: w.manifest.companies.map((c) => ({ slug: c.slug, district: c.district })),
  }));
}

/** The core's label line: how many maps link here. */
export function coreSubtitle(model: NetworkModel): string {
  const n = model.worlds.length;
  return n ? `${n} ${plural(n, "map links", "maps link")} here` : "No maps yet";
}
