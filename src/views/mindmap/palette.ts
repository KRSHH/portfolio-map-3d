/* Scene colors for the globe, read once from the CSS tokens in
   src/styles/tokens.css so the 3D scene and the HUD legend share one
   source. District colors never come from here: they come from data
   (district.color). The fallbacks only apply if a token is missing. */

export interface GlobePalette {
  /** Documented connections (sourced facts). */
  documented: string;
  /** Potential providers of the selected company (derived suggestions). */
  provider: string;
  /** Potential clients of the selected company (derived suggestions). */
  client: string;
  /** Neutral line color for the legend's structure swatch. */
  line: string;
  /** The core's rim and glow (the accent). */
  teal: string;
  ink: string;
  paper: string;
  /** Atmosphere tint around the globe. */
  atmosphere: string;
  /** Glass tint of the people globe (no regions: one even tint). */
  personGlass: string;
  /** Stems and surface pins under the people's badges. */
  personStem: string;
}

const FALLBACK: GlobePalette = {
  documented: "#0c7a8c",
  provider: "#eda100",
  client: "#2a78d6",
  line: "#9aa9b4",
  teal: "#0c7a8c",
  ink: "#1d1f24",
  paper: "#ffffff",
  atmosphere: "#9fd3ea",
  personGlass: "#c3dbe2",
  personStem: "#8a98a6",
};

let cached: GlobePalette | null = null;

export function globePalette(): GlobePalette {
  if (cached) return cached;
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  cached = {
    documented: v("--mindmap-documented", v("--brand-accent", FALLBACK.documented)),
    provider: v("--mindmap-provider", FALLBACK.provider),
    client: v("--mindmap-client", FALLBACK.client),
    line: v("--mindmap-line", FALLBACK.line),
    teal: v("--brand-accent", FALLBACK.teal),
    ink: v("--brand-ink", FALLBACK.ink),
    paper: v("--mindmap-bg-top", FALLBACK.paper),
    atmosphere: v("--mindmap-atmosphere", v("--scene-sky-top", FALLBACK.atmosphere)),
    personGlass: v("--mindmap-person-glass", FALLBACK.personGlass),
    personStem: v("--mindmap-person-stem", FALLBACK.personStem),
  };
  return cached;
}
