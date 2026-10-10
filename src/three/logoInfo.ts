/* Logo measurement, in the browser.

   A map's logos are whatever files the organization drops into site/logos/: transparent PNGs,
   white-on-transparent marks, opaque JPEGs with their own background, SVGs with wide margins.
   Each is measured once, when it first loads, from a small copy of its pixels:

     plate  "self"  the corners are opaque: the logo carries its own background, which fills
                    the plate behind it (bg = the corners' color);
            "dark"  the artwork is light (white-on-transparent): it goes on an ink plate;
            "light" anything else: a white plate.
     crop   the box the artwork covers, so empty margins don't shrink the mark.

   A company's `logoPlate` overrides the plate when the measurement picks the wrong one. Pure
   pixel math lives in measurePixels() so it is unit-tested without a browser. */
import type { Company, LogoInfo } from "../data/types";
import { cpuCanvas } from "./cpuCanvas";

/** The longest side of the copy the measurement reads. */
const SAMPLE = 96;

const images = new Map<string, Promise<HTMLImageElement | null>>();
const infos = new Map<string, Promise<LogoInfo | null>>();

/** Load an image once per URL (null when it fails). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * Measure RGBA pixels (w×h, row-major): the plate, the background color of an opaque logo, and
 * the artwork's box in this sample's pixels.
 */
export function measurePixels(px: Uint8ClampedArray | Uint8Array, w: number, h: number): { plate: LogoInfo["plate"]; bg: string | null; box: { x: number; y: number; w: number; h: number } } {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const opaqueCorners = corners.every((i) => px[i + 3] > 230);
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const i of corners) {
    bgR += px[i] / 4;
    bgG += px[i + 1] / 4;
    bgB += px[i + 2] / 4;
  }
  // Pixels that are artwork: visible, and (on an opaque logo) different from the background.
  const isArt = (i: number) => {
    if (px[i + 3] < 40) return false;
    if (!opaqueCorners) return true;
    return Math.abs(px[i] - bgR) + Math.abs(px[i + 1] - bgG) + Math.abs(px[i + 2] - bgB) > 36;
  };
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let art = 0;
  let light = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (!isArt(i)) continue;
      art++;
      if (lum(px[i], px[i + 1], px[i + 2]) > 0.72) light++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const box = x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  if (opaqueCorners) return { plate: "self", bg: hex(bgR, bgG, bgB), box };
  return { plate: art > 0 && light / art > 0.6 ? "dark" : "light", bg: null, box };
}

/** Measure a loaded image. Falls back to a white plate and the whole image if the pixels can't be read. */
export function measureImage(img: HTMLImageElement, override?: LogoInfo["plate"] | null): LogoInfo {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = Math.min(1, SAMPLE / Math.max(W, H));
  const sw = Math.max(1, Math.round(W * k));
  const sh = Math.max(1, Math.round(H * k));
  let measured: ReturnType<typeof measurePixels>;
  try {
    const [, ctx] = cpuCanvas(sw, sh);
    ctx.drawImage(img, 0, 0, sw, sh);
    measured = measurePixels(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
  } catch {
    measured = { plate: "light", bg: null, box: { x: 0, y: 0, w: sw, h: sh } };
  }
  // The box back in image pixels, padded by one sample pixel so antialiased edges are kept.
  const sx = W / sw;
  const sy = H / sh;
  const x = Math.max(0, (measured.box.x - 1) * sx);
  const y = Math.max(0, (measured.box.y - 1) * sy);
  const crop = { x, y, w: Math.min(W - x, (measured.box.w + 2) * sx), h: Math.min(H - y, (measured.box.h + 2) * sy) };
  const plate = override ?? measured.plate;
  // An opaque logo keeps its whole frame: its background is part of the mark.
  return { w: plate === "self" ? W : crop.w, h: plate === "self" ? H : crop.h, plate, bg: plate === "self" ? measured.bg ?? "#ffffff" : null, crop: plate === "self" ? { x: 0, y: 0, w: W, h: H } : crop };
}

/** A company's logo image and its measurements (null when it has no logo or the file fails to load). */
export function companyLogo(c: Company): Promise<{ img: HTMLImageElement; info: LogoInfo } | null> {
  if (!c.logo) return Promise.resolve(null);
  const src = c.logo;
  return loadImage(src).then((img) => {
    if (!img) return null;
    let p = infos.get(src);
    if (!p) {
      p = Promise.resolve(measureImage(img, c.logoPlate));
      infos.set(src, p);
    }
    return p.then((info) => (info ? { img, info } : null));
  });
}
