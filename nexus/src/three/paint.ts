/* Everything the 3D scene shows as a picture is painted here, on CPU-backed canvases
   (cpuCanvas.ts): each world's surface, the labels, the core's glow and the nebula behind
   everything. No image, font or model is fetched for the scene; labels use the page's own
   font once it has loaded (falling back to system-ui), and a world's logo only from the
   Nexus's own origin. */
import { inkOn, mix, muted } from "../lib/color.ts";
import { fnv1a, seeded } from "../lib/hash.ts";
import { planBands, planDots, type SurfaceCompany, type SurfaceDistrict } from "../lib/surface.ts";

export const FONT_FAMILY = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const SPACE = "#05060f";

/* ---------- World surfaces ---------- */

export interface SurfaceInput {
  id: string;
  accent: string;
  districts: SurfaceDistrict[];
  companies: SurfaceCompany[];
  /** Unreachable at the last check: muted colors. */
  dim: boolean;
}

/**
 * A world's surface, equirectangular: its districts as wavy bands proportional to their
 * company counts (surface.ts), faint streaks, and a light dot for every company in its
 * district's band.
 */
export function paintSurface(ctx: CanvasRenderingContext2D, w: number, h: number, input: SurfaceInput): void {
  const rand = seeded(fnv1a(`surface:${input.id}`));
  const tone = (c: string) => (input.dim ? muted(c, 0.7, 0.55) : c);
  const bands = planBands(input.districts);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = tone(mix(input.accent, SPACE, 0.55));
  ctx.fillRect(0, 0, w, h);

  // Band edges wave gently; the waves repeat a whole number of times around, so the seam is invisible.
  const thickness = bands.map((b) => (b.v1 - b.v0) * h);
  const waves = bands.map((_, i) => {
    const room = Math.min(thickness[i - 1] ?? Infinity, thickness[i] ?? Infinity);
    return { k: 2 + Math.floor(rand() * 3), phase: rand() * Math.PI * 2, amp: Math.min(h * (0.008 + rand() * 0.012), room * 0.3) };
  });
  const edge = (i: number, x: number) => {
    if (i <= 0) return -1;
    if (i >= bands.length) return h + 1;
    const wv = waves[i];
    return bands[i].v0 * h + wv.amp * Math.sin((x / w) * Math.PI * 2 * wv.k + wv.phase);
  };
  const step = w / 96;
  bands.forEach((b, i) => {
    ctx.beginPath();
    ctx.moveTo(0, edge(i, 0));
    for (let x = step; x <= w + 0.01; x += step) ctx.lineTo(x, edge(i, x));
    for (let x = w; x >= -0.01; x -= step) ctx.lineTo(x, edge(i + 1, x));
    ctx.closePath();
    ctx.fillStyle = tone(b.color);
    ctx.fill();
  });

  // Streaks: thin light and dark currents across the bands.
  const lineScale = h / 256;
  for (let s = 0; s < 34; s++) {
    const y0 = rand() * h;
    const k = 1 + Math.floor(rand() * 3);
    const phase = rand() * Math.PI * 2;
    const amp = (1 + rand() * 4) * lineScale;
    ctx.beginPath();
    for (let x = 0; x <= w + 0.01; x += step) {
      const y = y0 + amp * Math.sin((x / w) * Math.PI * 2 * k + phase);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rand() < 0.55 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.16)";
    ctx.lineWidth = (0.6 + rand() * 2.6) * lineScale;
    ctx.stroke();
  }

  // Poles darken a little, so the texture's pinch there does not draw the eye.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(3,4,11,0.45)");
  g.addColorStop(0.16, "rgba(3,4,11,0)");
  g.addColorStop(0.84, "rgba(3,4,11,0)");
  g.addColorStop(1, "rgba(3,4,11,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A light for each company, round on the sphere (stretched across the texture near the poles).
  const r = Math.max(1.1, h / 115);
  const core = input.dim ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
  const halo = input.dim ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.22)";
  for (const d of planDots(input.companies, bands)) {
    const x = d.u * w;
    const y = d.v * h;
    const stretch = Math.min(4, 1 / Math.max(0.25, Math.sin(Math.PI * d.v)));
    for (const dx of x < r * 8 ? [0, w] : x > w - r * 8 ? [0, -w] : [0]) {
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r * 2.4 * stretch, r * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r * stretch, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---------- Labels ---------- */

export interface LabelContent {
  title: string;
  subtitle: string;
  accent: string;
  initials: string;
  logo: HTMLImageElement | null;
  /** Unreachable at the last check: the subtitle says so, in amber. */
  dim: boolean;
  /** Draw the Nexus mark instead of initials (the core's label). */
  mark?: boolean;
}

/** A label's layout in logical pixels (the canvas is `scale` times larger). */
export const LABEL = { height: 96, pad: 16, badge: 62, gap: 14, title: 32, subtitle: 23, maxText: 440 } as const;

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

const titleFont = (s: number) => `600 ${LABEL.title * s}px ${FONT_FAMILY}`;
const subtitleFont = (s: number) => `400 ${LABEL.subtitle * s}px ${FONT_FAMILY}`;

/** The canvas size a label needs at `scale`. */
export function labelSize(ctx: CanvasRenderingContext2D, c: LabelContent, scale: number): { w: number; h: number } {
  ctx.font = titleFont(scale);
  const tw = ctx.measureText(fitText(ctx, c.title, LABEL.maxText * scale)).width;
  ctx.font = subtitleFont(scale);
  const sw = ctx.measureText(fitText(ctx, c.subtitle, LABEL.maxText * scale)).width;
  const w = (LABEL.pad + LABEL.badge + LABEL.gap + LABEL.pad * 1.3) * scale + Math.max(tw, sw);
  // Whole multiples of 4 keep texture rows aligned.
  return { w: Math.ceil(w / 4) * 4, h: Math.ceil((LABEL.height * scale) / 4) * 4 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The Nexus mark (a hexagon around a triangle), centered at (cx, cy) with radius r. */
export function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, width: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const x = cx + r * 0.5 * Math.cos(a);
    const y = cy + r * 0.5 * Math.sin(a) + r * 0.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Paints a label on a canvas already sized by labelSize(). */
export function paintLabel(ctx: CanvasRenderingContext2D, w: number, h: number, c: LabelContent, scale: number): void {
  const s = scale;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const inset = 2 * s;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, (h - inset * 2) / 2);
  ctx.fillStyle = "rgba(6, 9, 24, 0.78)";
  ctx.fill();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = c.dim ? "rgba(255, 210, 127, 0.35)" : "rgba(170, 185, 255, 0.28)";
  ctx.stroke();

  // The badge: the logo on a light plate, the Nexus mark, or initials on the accent.
  const br = (LABEL.badge * s) / 2;
  const bx = LABEL.pad * s + br;
  const by = h / 2;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  if (c.mark) {
    ctx.fillStyle = "#0b1636";
    ctx.fill();
    drawMark(ctx, bx, by, br * 0.62, "#3be8ff", 3 * s);
  } else if (c.logo && c.logo.naturalWidth > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.save();
    ctx.clip();
    const box = br * 1.42;
    const k = Math.min(box / c.logo.naturalWidth, box / c.logo.naturalHeight);
    const lw = c.logo.naturalWidth * k;
    const lh = c.logo.naturalHeight * k;
    ctx.drawImage(c.logo, bx - lw / 2, by - lh / 2, lw, lh);
    ctx.restore();
  } else {
    ctx.fillStyle = c.dim ? muted(c.accent, 0.6, 0.7) : c.accent;
    ctx.fill();
    ctx.fillStyle = inkOn(c.dim ? muted(c.accent, 0.6, 0.7) : c.accent);
    ctx.font = `700 ${(c.initials.length > 1 ? 24 : 28) * s}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.initials, bx, by + 1 * s);
  }

  // Name and counts.
  const tx = (LABEL.pad + LABEL.badge + LABEL.gap) * s;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = titleFont(s);
  ctx.fillStyle = "#eef1ff";
  ctx.fillText(fitText(ctx, c.title, LABEL.maxText * s), tx, h / 2 - 2 * s);
  ctx.font = subtitleFont(s);
  ctx.fillStyle = c.dim ? "#ffd27f" : "#aeb6da";
  ctx.fillText(fitText(ctx, c.subtitle, LABEL.maxText * s), tx, h / 2 + 26 * s);
  ctx.restore();
}

/* ---------- Light and space ---------- */

/** A soft radial glow (white center into the given colors), for additive sprites. */
export function paintGlow(ctx: CanvasRenderingContext2D, size: number, stops: [number, string][]): void {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/**
 * The sky behind everything, equirectangular: deep space with soft violet, blue and teal
 * clouds, and a faint band of light across it. Seeded, so it is the same on every visit.
 */
export function paintNebula(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = seeded(20261009);
  ctx.fillStyle = "#03040b";
  ctx.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, color: string) => {
    for (const dx of [-w, 0, w]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  };
  const hues = ["rgba(110, 72, 230, A)", "rgba(40, 80, 210, A)", "rgba(20, 150, 180, A)", "rgba(160, 60, 170, A)"];
  ctx.globalCompositeOperation = "lighter";
  // The band: many soft clouds along a gentle wave.
  for (let i = 0; i < 70; i++) {
    const u = rand();
    const y = h * (0.5 + 0.16 * Math.sin(u * Math.PI * 2 + 0.7)) + (rand() - 0.5) * h * 0.12;
    blob(u * w, y, h * (0.05 + rand() * 0.12), hues[Math.floor(rand() * hues.length)].replace("A", (0.06 + rand() * 0.08).toFixed(3)));
  }
  // Larger, fainter clouds anywhere.
  for (let i = 0; i < 14; i++) {
    blob(rand() * w, h * (0.15 + rand() * 0.7), h * (0.18 + rand() * 0.25), hues[Math.floor(rand() * hues.length)].replace("A", (0.05 + rand() * 0.07).toFixed(3)));
  }
  // Faint far stars, painted into the sky for depth.
  for (let i = 0; i < 900; i++) {
    const y = h * (0.06 + rand() * 0.88);
    ctx.fillStyle = `rgba(220, 230, 255, ${(0.08 + rand() * 0.32).toFixed(2)})`;
    ctx.fillRect(rand() * w, y, 1, 1);
  }
  ctx.globalCompositeOperation = "source-over";
}
