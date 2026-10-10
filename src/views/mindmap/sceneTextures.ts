/* Procedural canvas textures for the company globe. No network assets: the
   only image loaded is the publisher's own logo from site/brand/. Every texture made
   here is owned by the caller, which disposes it on unmount. */
import * as THREE from "three";
import { SITE, initials, siteFile } from "../../data/catalog";
import { cpuCanvas } from "../../three/cpuCanvas";

/** CPU-backed (see src/three/cpuCanvas.ts): a GPU loss would otherwise blank the core and atmosphere. */
const canvas = cpuCanvas;

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft white radial falloff; tint it with material.color. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(0.65, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c, false);
}

/**
 * The atmosphere: a soft ring of light. Transparent inside RING (as a share
 * of the half-width), brightest just outside it, fading to nothing at the
 * edge. Scaled so the ring sits on the globe's silhouette. Tint with color.
 */
export const ATMOSPHERE_RING = 0.8;
export function atmosphereTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const r = ATMOSPHERE_RING;
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(r - 0.06, "rgba(255,255,255,0)");
  g.addColorStop(r - 0.005, "rgba(255,255,255,0.5)");
  g.addColorStop(r + 0.02, "rgba(255,255,255,0.42)");
  g.addColorStop(r + 0.07, "rgba(255,255,255,0.16)");
  g.addColorStop(r + 0.13, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, false);
}

export interface CoreColors {
  ink: string;
  teal: string;
  paper: string;
}

/** The organization's name on up to two lines, split at the space nearest the middle. */
export function nameLines(name: string): string[] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || name.length <= 12) return [name.trim()];
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * The core: a soft glow in the accent around a paper disc carrying the publisher's logo
 * (site.json org.logo, its version for light grounds), or, without one, its initials and its name.
 * Square texture.
 */
export function coreTexture(colors: CoreColors): THREE.CanvasTexture {
  const S = 768;
  const [c, ctx] = canvas(S, S);
  const texture = finish(c);
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.27;
  const paint = (logo: HTMLImageElement | null) => {
    ctx.clearRect(0, 0, S, S);
    // glow
    ctx.save();
    ctx.globalAlpha = 0.55;
    const g = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, S / 2);
    g.addColorStop(0, colors.teal);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    // rim + disc
    ctx.fillStyle = colors.teal;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.paper;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    if (logo && logo.naturalWidth > 0) {
      // The logo, contained in the disc's inscribed box (a wordmark gets the width, a mark the height).
      const boxW = R * 1.5;
      const boxH = R * 0.95;
      const k = Math.min(boxW / logo.naturalWidth, boxH / logo.naturalHeight);
      const w = logo.naturalWidth * k;
      const h = logo.naturalHeight * k;
      ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
    } else {
      const m = R * 0.82;
      const my = cy - R * 0.26;
      ctx.fillStyle = colors.ink;
      ctx.font = `700 ${Math.round(m * 0.62)}px "Instrument Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(SITE.org.name), cx, my);
      ctx.font = `650 ${Math.round(R * 0.2)}px "Instrument Sans", system-ui, sans-serif`;
      nameLines(SITE.org.name).forEach((line, i) => ctx.fillText(line, cx, cy + R * (0.38 + i * 0.24), R * 1.7));
    }
    texture.needsUpdate = true;
  };
  paint(null);
  const src = siteFile(SITE.org.logo);
  const fonts = document.fonts?.ready ?? Promise.resolve();
  if (src) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => fonts.then(() => paint(img));
    img.onerror = () => fonts.then(() => paint(null));
    img.src = src;
  } else fonts.then(() => paint(null));
  return texture;
}
