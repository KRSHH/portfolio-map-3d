/* Color arithmetic: WCAG contrast, ink on a color, and the mixes the world painter uses. */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/** "#rrggbb" (or "#rgb") to [r, g, b] in 0..255, or null. */
export function parseHex(hex: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** A CSS color written as "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(r, g, b, a)", or null. */
export function parseCssColor(css: string): RGBA | null {
  const hex = parseHex(css);
  if (hex) return [...hex, 1];
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** A translucent color laid over an opaque one. */
export function composite(fg: RGBA, bg: RGB): RGB {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

/** WCAG relative luminance of an sRGB color. */
export function luminance(c: RGB | string): number {
  const rgb = typeof c === "string" ? parseHex(c) : c;
  if (!rgb) return 0;
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrast(a: RGB | string, b: RGB | string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const INK_DARK = "#05060f";
export const INK_LIGHT = "#ffffff";

/** The ink (near black or white) that reads best on `hex`. */
export function inkOn(hex: string): string {
  return contrast(INK_DARK, hex) >= contrast(INK_LIGHT, hex) ? INK_DARK : INK_LIGHT;
}

/** `a` moved toward `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** `hex` with its saturation reduced by `amount` (0..1) and its brightness scaled by `light`. */
export function muted(hex: string, amount: number, light = 1): string {
  const c = parseHex(hex) ?? [0, 0, 0];
  const gray = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return toHex([(c[0] + (gray - c[0]) * amount) * light, (c[1] + (gray - c[1]) * amount) * light, (c[2] + (gray - c[2]) * amount) * light]);
}
