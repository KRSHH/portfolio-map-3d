/* Scene colors for the globe, read from the current CSS tokens in
   src/styles/tokens.css so the 3D scene and the HUD legend share one
   source. District colors never come from here: they come from data
   (district.color). The fallbacks only apply if a token is missing. */

export interface GlobePalette {
  dark: boolean;
  /** The globe surface's own tone, under the district tints. */
  surface: string;
  /** The seams between territories and the rim's light. */
  rim: string;
  /** The light on the globe's day side (warm) and night side (cool): materials.ts's terminator. */
  dayLight: string;
  nightLight: string;
  /** How strongly the territories tint the surface (1 = full). */
  tint: number;
  /** How much of the day side's light a drifting cloud takes, 0..1. */
  cloudShadow: number;
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
  dark: false,
  surface: "#ebe6dc",
  rim: "#ffffff",
  dayLight: "#fffcf6",
  nightLight: "#c0c9d8",
  tint: 1,
  cloudShadow: 0.08,
  documented: "#0c7a8c",
  provider: "#eda100",
  client: "#2a78d6",
  line: "#9aa9b4",
  teal: "#0c7a8c",
  ink: "#1d1f24",
  paper: "#ffffff",
  atmosphere: "#6db6e6",
  personGlass: "#6db6e6",
  personStem: "#71717a",
};

export function globePalette(): GlobePalette {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const dark = cs.colorScheme.includes("dark");
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    dark,
    surface: dark ? "#18181b" : FALLBACK.surface,
    rim: dark ? "#52525b" : FALLBACK.rim,
    dayLight: dark ? "#f5ede0" : FALLBACK.dayLight,
    nightLight: dark ? "#4d5470" : FALLBACK.nightLight,
    tint: dark ? 0.58 : FALLBACK.tint,
    cloudShadow: dark ? 0.22 : FALLBACK.cloudShadow,
    documented: v("--mindmap-documented", v("--brand-accent", FALLBACK.documented)),
    provider: v("--mindmap-provider", FALLBACK.provider),
    client: v("--mindmap-client", FALLBACK.client),
    line: v("--mindmap-line", FALLBACK.line),
    teal: v("--brand-accent", FALLBACK.teal),
    ink: v("--brand-ink", FALLBACK.ink),
    // Publisher artwork and badge dimming use a light plate in either interface theme.
    paper: "#ffffff",
    // A sky-blue halo by day; a cool moonlit one in the dark theme.
    atmosphere: dark ? "#5b7398" : FALLBACK.atmosphere,
    // The people globe: one even sky-blue tint (a moonlit blue in the dark theme).
    personGlass: dark ? "#5f80ad" : FALLBACK.personGlass,
    personStem: v("--text-muted", FALLBACK.personStem),
  };
}

/** Theme toggles and OS changes repaint an already-mounted scene. */
export function watchGlobePalette(change: (palette: GlobePalette) => void): () => void {
  let last = "";
  const refresh = () => {
    const palette = globePalette();
    const key = JSON.stringify(palette);
    if (key === last) return;
    last = key;
    change(palette);
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", refresh);
  refresh();
  return () => {
    observer.disconnect();
    media.removeEventListener("change", refresh);
  };
}
