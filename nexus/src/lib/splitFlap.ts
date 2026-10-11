/* Split-flap motion for the count boards, the way a station's departure board turns: each digit's
   upper flap falls over the hinge onto the lower half to show the next character, a few flaps in a
   row, and the boards on the page refresh together every few seconds in a cascade that sweeps them
   in reading order, each board's digits left to right. A board flips in when it first comes into
   view, and its digits turn from the old numbers to the new ones when they change.

   Purely visual: the digits are aria-hidden (each count is spoken once), every flap is a compositor
   animation (Web Animations on transform and filter), a board flips only while it is on screen and
   the page is visible, and with reduced motion nothing moves. The faces draw their character from
   data-c (CSS attr()), so React keeps owning the text; the engine only ever restores what React
   rendered (data-char) when it is done. Timing and sequences are pure (splitFlap.test.ts). */

/** One flap: the upper half falls (half of it), then the lower half lands (the other half). */
export const FLAP_MS = 150;
/** How far apart a board's digits start, left to right. */
export const DIGIT_STAGGER_MS = 70;
/** How far apart the boards on the page start, in reading order. */
export const BOARD_STAGGER_MS = 220;
/** How often the boards on screen refresh. */
export const CASCADE_EVERY_MS = 12_000;
/** How many flaps a digit turns in a refresh (at random in this range), and at most when its value changes. */
export const FLAPS = { min: 3, max: 5, change: 6 } as const;

const DRUM = "0123456789";

/**
 * The characters a digit shows, flap by flap, on its way from `from` to `to`: counting up around
 * the drum into `to`, as a board's drum turns, `flaps` long at most. A digit that stays the same
 * turns exactly `flaps` flaps and lands where it was (a refresh); a blank turns from "0"; anything
 * off the drum lands in one flap. Never empty unless nothing changes off the drum.
 */
export function flapSequence(from: string, to: string, flaps: number): string[] {
  const t = DRUM.indexOf(to);
  if (t < 0) return from === to ? [] : [to];
  const f = DRUM.indexOf(from);
  const turn = from === to ? flaps : f < 0 ? t + 1 : (t - f + DRUM.length) % DRUM.length;
  const n = Math.max(1, Math.min(turn, flaps, DRUM.length));
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k--) out.push(DRUM[(t - k + DRUM.length) % DRUM.length]);
  return out;
}

/**
 * What each digit of `after` showed in `before`, the numbers aligned on their last digit (ones turn
 * to ones); blank where `before` was shorter.
 */
export function alignFrom(before: string, after: string): string[] {
  const shift = before.length - after.length;
  return [...after].map((_, i) => before[i + shift] ?? " ");
}

/** When a digit starts in a cascade (ms): its board's place in the sweep, then its place on the board. */
export function startAt(board: number, digit: number): number {
  return board * BOARD_STAGGER_MS + digit * DIGIT_STAGGER_MS;
}

/* ------------------------------------------------------------------ the flaps */

const FALL: Keyframe[] = [
  { transform: "rotateX(0deg)", filter: "brightness(1)" },
  { transform: "rotateX(-90deg)", filter: "brightness(0.62)" },
];
const LAND: Keyframe[] = [
  { transform: "rotateX(90deg)", filter: "brightness(0.62)" },
  { transform: "rotateX(0deg)", filter: "brightness(1)" },
];

interface Faces {
  top: HTMLElement;
  bottom: HTMLElement;
  fall: HTMLElement;
  land: HTMLElement;
}

function facesOf(digit: HTMLElement): Faces | null {
  const q = (name: string) => digit.querySelector<HTMLElement>(`.${name}`);
  const top = q("flap-top");
  const bottom = q("flap-bottom");
  const fall = q("flap-leaf-top");
  const land = q("flap-leaf-bottom");
  return top && bottom && fall && land ? { top, bottom, fall, land } : null;
}

/** Which run turns each digit now: a run that was overtaken leaves the digit to the newer one. */
const owner = new WeakMap<HTMLElement, AbortSignal>();

/** Every face on `c`, the leaves put away. */
function show(digit: HTMLElement, faces: Faces, c: string): void {
  for (const el of [faces.top, faces.bottom, faces.fall, faces.land]) el.dataset.c = c;
  digit.classList.remove("is-flipping");
}

/** Back on the digit's own character (what React rendered), unless a newer run has the digit. */
function settle(digit: HTMLElement, faces: Faces, signal: AbortSignal): void {
  if (owner.get(digit) === signal) show(digit, faces, digit.dataset.char ?? "");
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const stop = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** Turn one digit through `sequence`, starting from `from` (on its faces already). */
async function turn(digit: HTMLElement, faces: Faces, from: string, sequence: readonly string[], signal: AbortSignal): Promise<void> {
  const live: Animation[] = [];
  const stop = () => {
    for (const a of live.splice(0)) a.cancel();
  };
  signal.addEventListener("abort", stop, { once: true });
  digit.classList.add("is-flipping");
  let shown = from;
  const half = FLAP_MS / 2;
  try {
    for (const next of sequence) {
      if (signal.aborted) return;
      stop();
      // Behind the falling flap the next character's upper half waits; the old lower half stays
      // until the next character's lower half lands on it.
      faces.top.dataset.c = next;
      faces.bottom.dataset.c = shown;
      faces.fall.dataset.c = shown;
      faces.land.dataset.c = next;
      live.push(faces.fall.animate(FALL, { duration: half, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" }));
      const land = faces.land.animate(LAND, { duration: half, delay: half, easing: "cubic-bezier(0, 0.55, 0.45, 1)", fill: "both" });
      live.push(land);
      await land.finished;
      faces.bottom.dataset.c = next;
      shown = next;
    }
  } catch {
    // Cancelled: the board left the page, or motion became reduced.
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
    settle(digit, faces, signal);
  }
}

const canAnimate = () => typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

/* ------------------------------------------------------------------ the boards on the page */

const boards = new Set<HTMLElement>();
const onScreen = new Set<HTMLElement>();
const seen = new WeakSet<HTMLElement>();
const running = new Map<HTMLElement, AbortController>();
const lastFlip = new WeakMap<HTMLElement, number>();
let observer: IntersectionObserver | null = null;
let timer = 0;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const inReadingOrder = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/**
 * Flip a board's digits, left to right, as the `order`th board of a cascade: each from `from[i]`
 * (what it showed before; its own value when absent, which makes it a refresh) to its value.
 */
export function flipBoard(board: HTMLElement, from?: readonly string[], order = 0): void {
  if (!canAnimate() || reducedMotion()) return;
  const before = running.get(board);
  const ctl = new AbortController();
  running.set(board, ctl);
  // A run under way stops at once (its flaps cancel); this one takes its digits over.
  before?.abort();
  lastFlip.set(board, performance.now() + startAt(order, 0));
  const digits = [...board.querySelectorAll<HTMLElement>(".split-digit")];
  const turns = digits.map((digit, i) => {
    const faces = facesOf(digit);
    if (!faces) return Promise.resolve();
    const to = digit.dataset.char ?? "";
    const start = from?.[i] ?? to;
    const flaps = start === to ? FLAPS.min + Math.floor(Math.random() * (FLAPS.max - FLAPS.min + 1)) : FLAPS.change;
    const sequence = flapSequence(start, to, flaps);
    owner.set(digit, ctl.signal);
    // Until its turn comes, a digit keeps showing where it starts.
    show(digit, faces, sequence.length ? start : to);
    if (!sequence.length) return Promise.resolve();
    return wait(startAt(order, i), ctl.signal).then((go) => (go ? turn(digit, faces, start, sequence, ctl.signal) : settle(digit, faces, ctl.signal)));
  });
  void Promise.all(turns).then(() => {
    if (running.get(board) === ctl) running.delete(board);
  });
}

/** The boards on screen, not already turning or just turned, refresh in reading order. */
function cascade(candidates: Iterable<HTMLElement>): void {
  if (document.hidden || reducedMotion()) return;
  const now = performance.now();
  const due = [...candidates].filter((b) => !running.has(b) && now - (lastFlip.get(b) ?? -Infinity) > CASCADE_EVERY_MS / 2).sort(inReadingOrder);
  due.forEach((b, i) => flipBoard(b, undefined, i));
}

function watchViewport(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver !== "function") return observer;
  observer = new IntersectionObserver(
    (entries) => {
      const arriving: HTMLElement[] = [];
      for (const e of entries) {
        const board = e.target as HTMLElement;
        if (!e.isIntersecting) {
          onScreen.delete(board);
          continue;
        }
        onScreen.add(board);
        if (!seen.has(board)) {
          seen.add(board);
          arriving.push(board);
        }
      }
      // A board flips in the first time it comes into view.
      if (arriving.length) cascade(arriving);
    },
    { threshold: 0.6 },
  );
  return observer;
}

/** Join a board to the page's cascade; returns the way out (it stops any flap under way). */
export function watchBoard(board: HTMLElement): () => void {
  boards.add(board);
  const io = watchViewport();
  if (io) io.observe(board);
  else onScreen.add(board);
  if (!timer) timer = window.setInterval(() => cascade(onScreen), CASCADE_EVERY_MS);
  return () => {
    boards.delete(board);
    onScreen.delete(board);
    io?.unobserve(board);
    running.get(board)?.abort();
    running.delete(board);
    if (!boards.size && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}

/** Is this board on screen (and so worth flipping now)? */
export function boardInView(board: HTMLElement): boolean {
  return onScreen.has(board);
}
