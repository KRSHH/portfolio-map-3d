/* How globe badges step back when something else is the focus: a search, the
   provider finder, a district, or an open company. Pure, so the floor below is
   unit-tested (dimming.test.ts).

   A badge's emphasis e runs from 1 (full strength) down to EMPHASIS.miss. A
   dimmed badge fades its colors toward the paper color (staying solid, so
   nothing behind it shows through) and loses a little opacity. The floor is
   set by contrast, not taste: at the strongest dimming an ink logo on a white
   plate keeps at least 3:1 contrast against its plate (the WCAG minimum for
   graphics), so it still reads as a logo. Earlier versions faded toward paper
   by up to 0.8 and then 0.5; mixed in linear light, 0.5 left an ink logo at
   about 1.9:1, a pale ghost on the near-white globe. */

/** Emphasis levels. */
export const EMPHASIS = {
  full: 1,
  /** With a company open: companies of its industry region, for context. */
  peer: 0.62,
  /** With a company open: everyone else. */
  other: 0.3,
  /** Outside the current highlight (no search match, not in the finder's results or the district). */
  miss: 0.15,
} as const;

/** Fade toward paper at emphasis 0. */
const FADE_MAX = 0.24;
/** Opacity factor at emphasis 0. */
const OPACITY_MIN = 0.9;

/** Emphasis of one company, given what is highlighted and what is open. */
export function emphasisOf(o: { inHighlight: boolean; hasSelection: boolean; selectedOrRelated: boolean; sameRegion: boolean }): number {
  let e: number = o.inHighlight ? EMPHASIS.full : EMPHASIS.miss;
  // With a company selected: it and the companies linked to it stay bright; its industry peers stay
  // readable for context; everything else steps back.
  if (o.hasSelection) e = o.selectedOrRelated ? EMPHASIS.full : o.sameRegion ? Math.min(e, EMPHASIS.peer) : Math.min(e, EMPHASIS.other);
  return e;
}

/** The badge material for emphasis e: an opacity factor and the fade toward paper (0..FADE_MAX). */
export function badgeDim(e: number): { opacity: number; fade: number } {
  const k = Math.min(1, Math.max(0, Number.isFinite(e) ? e : 1));
  return { opacity: OPACITY_MIN + (1 - OPACITY_MIN) * k, fade: (1 - k) * FADE_MAX };
}

/* ---- contrast (for tests and the reasoning above) ---- */

/** sRGB channel (0..1) to linear light. */
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast between a logo color and its plate once the badge is dimmed to emphasis e and drawn
 * over `behind` (all relative luminances). Follows the shader: mix toward paper in linear light,
 * then blend at the badge's opacity.
 */
export function dimmedContrast(e: number, logo: number, plate: number, paper: number, behind: number): number {
  const { opacity, fade } = badgeDim(e);
  const shade = (c: number) => (c + (paper - c) * fade) * opacity + behind * (1 - opacity);
  const a = shade(logo);
  const b = shade(plate);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
