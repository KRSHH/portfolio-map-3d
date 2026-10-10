/* A logo's ink: the part of its artboard that holds anything. Some logo files carry empty space on
   one side of the artboard (a wordmark set in a wider box, a mark with room left for a tagline);
   drawn by its artboard, such a logo sits off center on a sign. The signs that show the publisher's
   logo (the hub's rooftop sign in the walk world, the core of the globe) draw only its ink, centered
   in their space. */
import { cpuCanvas } from "./cpuCanvas";

export interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The bounding box of the pixels whose alpha is above `threshold` in a w×h RGBA buffer, in pixels,
 * or null when nothing there holds ink. Pure (logoInk.test.ts).
 */
export function inkBox(data: ArrayLike<number>, w: number, h: number, threshold = 8): InkBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The longest side a logo is rasterized at to find its ink. */
const PROBE = 512;
/** The largest canvas a logo is rasterized into before its ink is copied out. */
const MAX_SIDE = 4096;
const inkCache = new WeakMap<HTMLImageElement, InkBox>();

/** The ink of a loaded image, in its own (natural) units; its whole artboard when it cannot be read. */
export function logoInk(img: HTMLImageElement): InkBox {
  const cached = inkCache.get(img);
  if (cached) return cached;
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  let box: InkBox = { x: 0, y: 0, w: nw, h: nh };
  try {
    const s = PROBE / Math.max(nw, nh);
    const pw = Math.max(1, Math.round(nw * s));
    const ph = Math.max(1, Math.round(nh * s));
    const [, ctx] = cpuCanvas(pw, ph);
    ctx.drawImage(img, 0, 0, pw, ph);
    const found = inkBox(ctx.getImageData(0, 0, pw, ph).data, pw, ph);
    if (found) {
      // Back to natural units, a pixel of the probe wider each way (antialiased edges).
      const x0 = Math.max(0, (found.x - 1) / s);
      const y0 = Math.max(0, (found.y - 1) / s);
      const x1 = Math.min(nw, (found.x + found.w + 1) / s);
      const y1 = Math.min(nh, (found.y + found.h + 1) / s);
      box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  } catch {
    // An image the canvas cannot read back (another origin): its artboard stands in for its ink.
  }
  inkCache.set(img, box);
  return box;
}

/**
 * Draw a loaded logo as large as fits a boxW × boxH box centered on (cx, cy), by its ink: the
 * empty part of its artboard is left out, so the logo itself is centered. Drawn at its final size
 * first and its ink copied out, so a vector logo stays crisp.
 */
export function drawLogoInk(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, boxW: number, boxH: number): void {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!(nw > 0 && nh > 0)) return;
  const ink = logoInk(img);
  const k = Math.min(boxW / ink.w, boxH / ink.h, MAX_SIDE / Math.max(nw, nh));
  const w = ink.w * k;
  const h = ink.h * k;
  const [full, fctx] = cpuCanvas(Math.max(1, Math.ceil(nw * k)), Math.max(1, Math.ceil(nh * k)));
  fctx.imageSmoothingQuality = "high";
  fctx.drawImage(img, 0, 0, nw * k, nh * k);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, ink.x * k, ink.y * k, w, h, cx - w / 2, cy - h / 2, w, h);
  // Let the scratch canvas go now rather than at garbage collection.
  full.width = full.height = 0;
}
