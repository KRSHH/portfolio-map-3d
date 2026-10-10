/* The ?debug probe's log: what happened to the page, the WebGL context and the app state, and
   when, so a copied report shows the moment the logos went missing. Started once by
   DebugProbe; it watches each scene a view registers (context loss and restore on its canvas,
   shader compile errors through renderer.debug.onShaderError) for as long as it is mounted. */
import { useStore } from "../state/store";
import { onProbeScene, probeScene, type ProbeScene } from "./registry";

export interface ProbeEvent {
  /** performance.now(), ms. */
  t: number;
  kind: string;
  detail: string;
}

export interface Counters {
  contextLost: number;
  contextRestored: number;
  /** performance.now() of the last context loss or restore, ms. */
  lastContextEvent: number | null;
  shaderErrors: { t: number; detail: string }[];
  /** gl.getError() results by name, summed over the visit. */
  glErrors: Record<string, number>;
  /** Uncaught errors and unhandled rejections on the page. */
  pageErrors: number;
  /** WebGL renderers seen this visit (each view mount makes a new one). */
  renderers: number;
}

/** One line per second: the numbers that change when logos vanish. */
export interface HistoryRow {
  t: number;
  scene: string | null;
  visible: number | null;
  inView: number | null;
  front: number | null;
  opacityMedian: number | null;
  fadeMedian: number | null;
  uploaded: number | null;
  fps: number | null;
  lost: boolean | null;
}

const MAX_EVENTS = 80;
const MAX_HISTORY = 120;

export const events: ProbeEvent[] = [];
export const history: HistoryRow[] = [];
export const counters: Counters = { contextLost: 0, contextRestored: 0, lastContextEvent: null, shaderErrors: [], glErrors: {}, pageErrors: 0, renderers: 0 };

const now = () => Math.round(performance.now());

export function log(kind: string, detail: string): void {
  events.push({ t: now(), kind, detail: detail.slice(0, 300) });
  if (events.length > MAX_EVENTS) events.shift();
}

export function pushHistory(row: HistoryRow): void {
  history.push(row);
  if (history.length > MAX_HISTORY) history.shift();
}

const GL_ERRORS: Record<number, string> = {
  0x0500: "INVALID_ENUM",
  0x0501: "INVALID_VALUE",
  0x0502: "INVALID_OPERATION",
  0x0505: "OUT_OF_MEMORY",
  0x0506: "INVALID_FRAMEBUFFER_OPERATION",
  0x9242: "CONTEXT_LOST_WEBGL",
};

/** Reads (and so clears) every pending gl.getError() flag; counts and logs them. */
export function drainGlErrors(gl: WebGLRenderingContext | WebGL2RenderingContext): string[] {
  const found: string[] = [];
  for (let k = 0; k < 8; k++) {
    const e = gl.getError();
    if (e === gl.NO_ERROR) break;
    const name = GL_ERRORS[e] ?? `0x${e.toString(16)}`;
    found.push(name);
    counters.glErrors[name] = (counters.glErrors[name] ?? 0) + 1;
  }
  if (found.length) log("gl-error", found.join(", "));
  return found;
}

let detachScene = () => {};
const renderers = new WeakSet<object>();

function watchScene(s: ProbeScene | null): void {
  detachScene();
  detachScene = () => {};
  if (!s) {
    log("scene", "unmounted");
    return;
  }
  if (!renderers.has(s.renderer)) {
    renderers.add(s.renderer);
    counters.renderers++;
  }
  log("scene", `${s.view} mounted (renderer ${counters.renderers} this visit, ${s.badges.length} badges)`);
  const canvas = s.renderer.domElement;
  const lost = (e: Event) => {
    counters.contextLost++;
    counters.lastContextEvent = now();
    log("context", `lost${(e as WebGLContextEvent).statusMessage ? `: ${(e as WebGLContextEvent).statusMessage}` : ""}`);
  };
  const restored = () => {
    counters.contextRestored++;
    counters.lastContextEvent = now();
    log("context", "restored");
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  // Setting the hook replaces three.js's own console report, so this one logs to the console too.
  const debug = s.renderer.debug;
  const previous = debug.onShaderError;
  const onShaderError: NonNullable<typeof previous> = (gl, program, vs, fs) => {
    const detail = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)]
      .map((l) => l?.trim())
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1200);
    counters.shaderErrors.push({ t: now(), detail });
    log("shader", detail || "link failed, no log");
    console.error("THREE.WebGLProgram: shader error (recorded by ?debug):", detail);
  };
  debug.onShaderError = onShaderError;
  detachScene = () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
    if (debug.onShaderError === onShaderError) debug.onShaderError = previous;
  };
}

/** A short name for what was tapped: its accessible name, title or text. */
function targetName(el: Element): string {
  const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.tagName.toLowerCase();
  return name.replace(/\s+/g, " ").trim().slice(0, 60);
}

let started = false;

/** Starts listening (once per page). */
export function startRecorder(): void {
  if (started) return;
  started = true;
  log("probe", `started · ${document.visibilityState}`);

  document.addEventListener("visibilitychange", () => log("page", `visibility ${document.visibilityState}`));
  window.addEventListener("pagehide", (e) => log("page", `pagehide${e.persisted ? " (to bfcache)" : ""}`));
  window.addEventListener("pageshow", (e) => log("page", `pageshow${e.persisted ? " (from bfcache)" : ""}`));
  document.addEventListener("freeze", () => log("page", "freeze"));
  document.addEventListener("resume", () => log("page", "resume"));
  window.addEventListener("error", (e) => {
    counters.pageErrors++;
    log("error", e.message || "error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    counters.pageErrors++;
    log("error", `unhandled rejection: ${String((e.reason as Error | undefined)?.message ?? e.reason)}`);
  });
  // Taps on buttons and links outside the probe (Overview, Key, view switches…), for the timeline.
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("button, a, [role='button']");
      if (el && !el.closest(".dbg")) log("tap", targetName(el));
    },
    true,
  );

  useStore.subscribe((s, p) => {
    const parts: string[] = [];
    if (s.view !== p.view) parts.push(`view ${s.view}`);
    if (s.selected !== p.selected) parts.push(`selected ${s.selected ?? "none"}`);
    if (s.focusDistrict !== p.focusDistrict) parts.push(`district ${s.focusDistrict ?? "none"}`);
    if (s.query !== p.query) parts.push(`query "${s.query}"`);
    if (s.panel !== p.panel) parts.push(`panel ${s.panel ?? "none"}`);
    if (s.finder !== p.finder) parts.push(`finder ${[s.finder.service, s.finder.industry, s.finder.text].filter(Boolean).join(" / ") || "cleared"}`);
    if (s.fly !== p.fly && s.fly) parts.push(`fly ${s.fly.kind}${s.fly.slug ? ` ${s.fly.slug}` : ""}`);
    if (parts.length) log("state", parts.join(", "));
  });

  onProbeScene(watchScene);
  const current = probeScene();
  if (current) watchScene(current);
}
