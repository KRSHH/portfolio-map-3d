/* Adaptive resolution for the 3D views: the pixel ratio steps down while a device cannot hold a
   smooth frame rate and back up once it can, so a slow device keeps a usable frame rate. Pure, so
   its rules are tested (adaptiveDpr.test.ts); the views apply the multiplier it returns to their
   base pixel ratio.

   It waits out the first seconds (shader compiles and texture uploads), then judges a few seconds
   of frames at a time by their median frame rate, at least MIN_FRAMES frames each: a hitch or a gap
   (a garbage collection, a tab coming back from the background) moves the median little, while a
   device that is slow on every frame, even by seconds, is still judged slow. If it keeps changing
   direction it stops and holds, so a device on the edge does not flicker between two
   resolutions. */

/** The fewest frames one judgment rests on. */
const MIN_FRAMES = 5;

export interface AdaptiveDprOptions {
  /** The lowest multiplier of the base pixel ratio. */
  min?: number;
  /** Below this average frame rate the ratio steps down. */
  lowFps?: number;
  /** At or above this average frame rate the ratio steps back up. */
  highFps?: number;
  /** How much one step changes the multiplier. */
  step?: number;
  /** Seconds of frames averaged for each decision. */
  interval?: number;
  /** Seconds ignored after the start. */
  warmup?: number;
  /** Changes of direction before it holds where it is. */
  flipLimit?: number;
}

export class AdaptiveDpr {
  /** The current multiplier of the base pixel ratio, min..1. */
  value = 1;
  /** True once it has stopped adapting (too many changes of direction). */
  holding = false;
  private readonly min: number;
  private readonly lowFps: number;
  private readonly highFps: number;
  private readonly step: number;
  private readonly interval: number;
  private readonly warmup: number;
  private readonly flipLimit: number;
  private elapsed = 0;
  private windowTime = 0;
  private readonly frames: number[] = [];
  private direction = 0;
  private flips = 0;

  constructor(o: AdaptiveDprOptions = {}) {
    this.min = o.min ?? 0.6;
    this.lowFps = o.lowFps ?? 40;
    this.highFps = o.highFps ?? 55;
    this.step = o.step ?? 0.1;
    this.interval = o.interval ?? 3;
    this.warmup = o.warmup ?? 2;
    this.flipLimit = o.flipLimit ?? 4;
  }

  /** Feed one frame's duration in seconds. Returns the new multiplier when it changes, else null. */
  sample(dt: number): number | null {
    if (this.holding || !(dt > 0) || !Number.isFinite(dt)) return null;
    this.elapsed += dt;
    if (this.elapsed < this.warmup) return null;
    this.windowTime += dt;
    this.frames.push(dt);
    if (this.windowTime < this.interval || this.frames.length < MIN_FRAMES) return null;
    const fps = 1 / median(this.frames);
    this.windowTime = 0;
    this.frames.length = 0;
    let next = this.value;
    if (fps < this.lowFps) next = Math.max(this.min, round(this.value - this.step));
    else if (fps >= this.highFps) next = Math.min(1, round(this.value + this.step));
    if (next === this.value) return null;
    const dir = Math.sign(next - this.value);
    if (this.direction !== 0 && dir !== this.direction) this.flips++;
    this.direction = dir;
    this.value = next;
    if (this.flips >= this.flipLimit) this.holding = true;
    return next;
  }
}

const round = (v: number) => Math.round(v * 100) / 100;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The pixel ratio a view starts from: the device's, capped at `cap`, and never so high that the
 * drawing buffer holds more than `budget` pixels (a large window at a high ratio costs fill rate
 * for no visible gain). Never below 1.
 */
export function budgetDpr(devicePixelRatio: number, width: number, height: number, cap: number, budget: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = Math.max(1, width * height);
  return Math.max(1, Math.min(dpr, cap, Math.sqrt(budget / area)));
}
