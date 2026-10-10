/* Measurements for the ?debug probe (DebugProbe.tsx).

   Everything here reads the scene a 3D view registered (registry.ts) and
   changes nothing, except runGpuCheck(): it draws badges through the live
   renderer, reads the pixels back, and restores the renderer's state before
   returning. explain() turns a snapshot into plain-language findings. */
import * as THREE from "three";
import { useStore, type View } from "../state/store";
import { BADGE_H, BADGE_W } from "../three/logoTexture";
import type { BadgeSprite } from "../views/mindmap/controller";
import type { BadgeMesh } from "../views/walk/pins";
import { counters, drainGlErrors, type Counters } from "./recorder";
import { probeScene, type ProbeScene } from "./registry";

export interface Spread {
  min: number;
  median: number;
  max: number;
}

export function spread(values: readonly number[]): Spread | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { min: s[0], median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, max: s[s.length - 1] };
}

/* ------------------------------------------------------------------ badges */

export interface BadgeStats {
  view: ProbeScene["view"];
  count: number;
  /** visible = true on the badge and every ancestor. */
  visible: number;
  /** Visible, not scaled to zero, and inside the camera's view frustum. */
  inView: number;
  /** In view and facing the viewer, where a badge is drawn at full strength by design (globe:
   *  on the near side and away from the rim; walk: not right in front of the lens). */
  front: number;
  opacity: Spread | null;
  /** Material opacity below LOW_OPACITY, of every badge / of the front ones. */
  lowOpacity: number;
  frontLowOpacity: number;
  /** Globe: the uFade uniform (0 = the logo's colors, 1 = the paper color). */
  fade: Spread | null;
  highFade: number;
  /** visible = false (walk: waiting to drop in; globe: opacity cut-off). */
  hidden: number;
  scaleZero: number;
  /** NaN or Infinity in position, scale, opacity or fade. */
  nonFinite: number;
  /** Walk: farther than the fog's far distance, so drawn in solid fog color. */
  fogged: number;
  noMap: number;
  /** In view, but this renderer holds no GL texture for the badge (three.js uploads on first draw). */
  notUploaded: number;
}

export const LOW_OPACITY = 0.3;

const tmpM = new THREE.Matrix4();
const frustum = new THREE.Frustum();
const wp = new THREE.Vector3();

type Badge = BadgeSprite | BadgeMesh;

function badgeList(t: ProbeScene): readonly Badge[] {
  return t.badges;
}

function chainVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** This renderer's GL texture for `tex`, if it has uploaded it. */
function glTexture(r: THREE.WebGLRenderer, tex: THREE.Texture): { tex: WebGLTexture; version: number | undefined } | null {
  if (!r.properties.has(tex)) return null;
  const p = r.properties.get(tex) as { __webglTexture?: WebGLTexture | null; __version?: number };
  return p.__webglTexture ? { tex: p.__webglTexture, version: p.__version } : null;
}

const uploaded = (r: THREE.WebGLRenderer, tex: THREE.Texture) => glTexture(r, tex) !== null;

function fadeOf(b: Badge): number {
  return (b.material.userData.fade as { value: number } | undefined)?.value ?? 0;
}

/** Globe badges fade toward the rim, where they crowd in perspective; from this facing on they
 *  are drawn at full strength (controller.ts updateNodes: smoothstep(0.04, 0.42, facing)). */
const FACING_FULL = 0.42;

/** Walk badges closer to the lens than this are faded below LOW_OPACITY by design, so they don't
 *  wall off the view (pins.ts nearFade: 0.22 within 4 units, 1 from 10). */
const WALK_NEAR_FADED = 4.6;

/** On the near side of the globe and facing the viewer, or (walk) not right in front of the lens:
 *  where a badge should be strong. */
function isFront(t: ProbeScene, i: number): boolean {
  if (t.view === "mindmap") return (t.controller.vis[i] ?? 0) > 0.5 && (t.controller.facing[i] ?? 0) >= FACING_FULL;
  const b = t.badges[i];
  return !b || b.getWorldPosition(wp).distanceTo(t.camera.position) >= WALK_NEAR_FADED;
}

export function badgeStats(t: ProbeScene): BadgeStats {
  const cam = t.camera;
  frustum.setFromProjectionMatrix(tmpM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const fogFar = t.scene.fog instanceof THREE.Fog ? t.scene.fog.far : Infinity;
  const badges = badgeList(t);
  const ops: number[] = [];
  const fades: number[] = [];
  const st: BadgeStats = {
    view: t.view,
    count: badges.length,
    visible: 0,
    inView: 0,
    front: 0,
    opacity: null,
    lowOpacity: 0,
    frontLowOpacity: 0,
    fade: null,
    highFade: 0,
    hidden: 0,
    scaleZero: 0,
    nonFinite: 0,
    fogged: 0,
    noMap: 0,
    notUploaded: 0,
  };
  for (let i = 0; i < badges.length; i++) {
    const b = badges[i];
    const op = b.material.opacity;
    const fade = fadeOf(b);
    ops.push(op);
    if (t.view === "mindmap") fades.push(fade);
    if (!b.material.map) st.noMap++;
    const { position: p, scale: s } = b;
    if (![p.x, p.y, p.z, s.x, s.y, s.z, op, fade].every(Number.isFinite)) st.nonFinite++;
    if (s.x === 0 || s.y === 0) st.scaleZero++;
    if (op < LOW_OPACITY) st.lowOpacity++;
    if (fade > 0.5) st.highFade++;
    if (!chainVisible(b)) {
      st.hidden++;
      continue;
    }
    st.visible++;
    if (s.x === 0 || s.y === 0) continue; // draws nothing, wherever it is
    if (!(b instanceof THREE.Sprite ? frustum.intersectsSprite(b) : frustum.intersectsObject(b))) continue;
    st.inView++;
    if (b.material.map && !uploaded(t.renderer, b.material.map)) st.notUploaded++;
    if (b.getWorldPosition(wp).distanceTo(cam.position) > fogFar) st.fogged++;
    if (!isFront(t, i)) continue;
    st.front++;
    if (op < LOW_OPACITY) st.frontLowOpacity++;
  }
  st.opacity = spread(ops);
  st.fade = spread(fades);
  return st;
}

/** Company slug of badge i (for naming failures in a report). */
export function badgeSlug(t: ProbeScene, i: number): string {
  return (t.view === "mindmap" ? t.controller.layout.nodes[i]?.slug : t.controller.pins.slugs[i]) ?? `#${i}`;
}

/* ---------------------------------------------------------------- textures */

/* Where to sample a badge (see draw() in src/three/logoTexture.ts): the rim is 10 logical units
   wide and the logo box starts 44 units in, so 27 units in is always plain plate color. Both
   points sit at the plate's vertical center, which is opaque on every badge. */
const RIM_U = 4 / BADGE_W;
const PLATE_U = 27 / BADGE_W;
/** v (from the bottom, like the texture's rows) of the plate's vertical center. */
function plateV(aspect: number): number {
  return 1 - BADGE_H / 2 / (BADGE_W / aspect);
}

interface ByteImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

function byteImage(tex: THREE.Texture | null): ByteImage | null {
  const img = tex?.image as Partial<ByteImage> | null | undefined;
  if (!img?.data || !img.width || !img.height || img.data.length !== img.width * img.height * 4) return null;
  return img as ByteImage;
}

/** RGBA (0–255, as stored: sRGB) of the texel at uv. */
function texel(img: ByteImage, u: number, v: number): [number, number, number, number] {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
  const k = (y * img.width + x) * 4;
  return [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]];
}

export interface TextureStats {
  count: number;
  /** The byte array is there, sized width × height × 4. */
  withData: number;
  /** The plate pixel in the bytes is opaque (the badge was painted). */
  bytesOk: number;
  /** version > 0 (needsUpdate was set at least once). */
  versioned: number;
  /** This renderer holds a GL texture for it (badges never drawn yet, e.g. out of view, have none). */
  uploaded: number;
  /** Uploaded, but an older version than the bytes. */
  stale: number;
  /** gl.isTexture() is still true for the uploaded texture. Each call is a round trip to the GPU
   *  process, and only a context loss invalidates a texture three.js still holds, so this is
   *  measured after a loss and otherwise equals `uploaded`. */
  liveGl: number;
}

export function textureStats(t: ProbeScene): TextureStats {
  const gl = t.renderer.getContext();
  const maps = new Set<THREE.Texture>();
  for (const b of badgeList(t)) if (b.material.map) maps.add(b.material.map);
  const st: TextureStats = { count: maps.size, withData: 0, bytesOk: 0, versioned: 0, uploaded: 0, stale: 0, liveGl: 0 };
  for (const tex of maps) {
    const img = byteImage(tex);
    if (img) {
      st.withData++;
      if (texel(img, PLATE_U, plateV(img.width / img.height))[3] > 0) st.bytesOk++;
    }
    if (tex.version > 0) st.versioned++;
    const up = glTexture(t.renderer, tex);
    if (!up) continue;
    st.uploaded++;
    if (up.version !== tex.version) st.stale++;
    if (!counters.contextLost || gl.isTexture(up.tex)) st.liveGl++;
  }
  return st;
}

/* ---------------------------------------------------------------- renderer */

export interface GlStats {
  gpu: string;
  version: string;
  lost: boolean;
  /** Canvas size in CSS pixels and its drawing buffer in device pixels. */
  css: [number, number];
  buffer: [number, number];
  pixelRatio: number;
  antialias: boolean | null;
  alpha: boolean | null;
  textures: number;
  geometries: number;
  programs: number;
  /** Programs whose link failed (three's diagnostics.runnable === false). */
  failedPrograms: number;
  calls: number;
  triangles: number;
  /** Frames rendered since the last sample, per second (renderer.info.render.frame). */
  fps: number | null;
  /** How long the frame counter has not moved while the page was visible, ms. */
  stalledMs: number;
}

const gpuNames = new WeakMap<THREE.WebGLRenderer, string>();
const lastFrame = new WeakMap<THREE.WebGLRenderer, { frame: number; t: number; movedAt: number; visible: boolean }>();

function gpuName(r: THREE.WebGLRenderer, gl: WebGL2RenderingContext | WebGLRenderingContext): string {
  let name = gpuNames.get(r);
  if (!name && !gl.isContextLost()) {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gpuNames.set(r, name);
  }
  return name ?? "?";
}

export function glStats(t: ProbeScene, now: number): GlStats {
  const r = t.renderer;
  const gl = r.getContext();
  const canvas = r.domElement;
  const info = r.info;
  const attrs = gl.getContextAttributes();
  const prev = lastFrame.get(r);
  const frame = info.render.frame;
  const visible = document.visibilityState === "visible";
  // A hidden page draws nothing by design; only time spent visible counts as a stall.
  const movedAt = !prev || !prev.visible || frame !== prev.frame ? now : prev.movedAt;
  lastFrame.set(r, { frame, t: now, movedAt, visible });
  const programs = info.programs ?? [];
  return {
    gpu: gpuName(r, gl),
    version: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? "WebGL 2" : "WebGL 1",
    lost: gl.isContextLost(),
    css: [canvas.clientWidth, canvas.clientHeight],
    buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    pixelRatio: r.getPixelRatio(),
    antialias: attrs?.antialias ?? null,
    alpha: attrs?.alpha ?? null,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    programs: programs.length,
    failedPrograms: programs.filter((p) => (p as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false).length,
    calls: info.render.calls,
    triangles: info.render.triangles,
    fps: prev && now > prev.t ? Math.round(((frame - prev.frame) * 1000) / (now - prev.t)) : null,
    stalledMs: Math.round(now - movedAt),
  };
}

/* ---------------------------------------------------------------- snapshot */

export interface Snapshot {
  /** performance.now(), ms. */
  t: number;
  view: View;
  scene: ProbeScene["view"] | null;
  theme: { app: string | null; stored: string | null; osDark: boolean };
  page: { visibility: DocumentVisibilityState; dpr: number; viewport: [number, number] };
  gl: GlStats | null;
  /** gl.getError() results drained during this sample. */
  glErrors: string[];
  state: {
    selected: string | null;
    focusDistrict: string | null;
    query: string;
    panel: string | null;
    finder: string | null;
    /** null = no highlight (everyone at full strength), else the size of the highlighted set. */
    highlight: number | null;
    sheet: string;
    reducedMotion: boolean;
  };
  controller: Record<string, string | number | boolean | null> | null;
  badges: BadgeStats | null;
  textures: TextureStats | null;
}

function media(q: string): boolean {
  try {
    return window.matchMedia(q).matches;
  } catch {
    return false;
  }
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function controllerState(t: ProbeScene): Snapshot["controller"] {
  const c = t.camera.position;
  const cam = `${r2(c.x)}, ${r2(c.y)}, ${r2(c.z)}`;
  if (t.view === "mindmap") {
    const ctl = t.controller;
    return { selectedIndex: ctl.selected, focusRegion: ctl.focusRegion, hovered: ctl.hovered, playing: ctl.playing, reduced: ctl.reduced, camera: cam, cameraDistance: r2(c.length()), homeDistance: r2(ctl.homeDist) };
  }
  const e = t.controller;
  return { reduced: e.reduced, x: r2(e.x), z: r2(e.z), yaw: r2(e.yaw), camera: cam };
}

export function takeSnapshot(highlight: Set<string> | null): Snapshot {
  const t = probeScene();
  const now = performance.now();
  const s = useStore.getState();
  const finder = s.finder.service || s.finder.industry || s.finder.text.trim() ? [s.finder.service, s.finder.industry, s.finder.text.trim()].filter(Boolean).join(" / ") : null;
  return {
    t: Math.round(now),
    view: s.view,
    scene: t?.view ?? null,
    theme: { app: document.documentElement.dataset.theme ?? null, stored: stored("portfolio-map-theme"), osDark: media("(prefers-color-scheme: dark)") },
    page: { visibility: document.visibilityState, dpr: window.devicePixelRatio, viewport: [window.innerWidth, window.innerHeight] },
    gl: t ? glStats(t, now) : null,
    glErrors: t ? drainGlErrors(t.renderer.getContext()) : [],
    state: {
      selected: s.selected,
      focusDistrict: s.focusDistrict,
      query: s.query,
      panel: s.panel,
      finder,
      highlight: highlight ? highlight.size : null,
      sheet: getComputedStyle(document.documentElement).getPropertyValue("--sheet-h").trim(),
      reducedMotion: media("(prefers-reduced-motion: reduce)"),
    },
    controller: t ? controllerState(t) : null,
    badges: t ? badgeStats(t) : null,
    textures: t ? textureStats(t) : null,
  };
}

/* --------------------------------------------------------------- GPU check */

export interface GpuPass {
  /** Badges whose rim pixel came back with alpha > 0. */
  drawn: number;
  /** Drawn, and the plate pixel matches what the material should output (±COLOR_TOLERANCE). */
  colorOk: number;
  /** Rim alpha read back (0–255). */
  alpha: Spread | null;
  /** Slugs of badges that drew nothing (first 12). */
  failed: string[];
}

export interface GpuCheck {
  at: string;
  /** performance.now() when the check finished, ms. */
  t: number;
  ms: number;
  view: ProbeScene["view"];
  tested: number;
  /** Live material and texture, through the live renderer, into a render target. */
  live: GpuPass;
  /** The same textures with a plain MeshBasicMaterial at full opacity (the control). */
  plain: GpuPass;
  /** The live scene drawn twice to the canvas, with and without the badges: of the front badges
   *  in view, how many change their center pixel. A badge that does not is either behind scene
   *  geometry (`occluded`, found by a raycast; `occluders` names what) or unexplained (`unchanged`):
   *  it adds nothing to the frame people see. */
  frame: { candidates: number; changed: number; occluded: number; occluders: string[]; unchanged: string[] };
  /** three.js program ids for a front badge's material: in the last live frame, in the render
   *  target (a linear-output variant), and in the frame test (should equal the live one). */
  programs: { live: number | null; target: number | null; frame: number | null };
  glErrors: string[];
  error?: string;
}

const CELL = 144;
const DRAW_W = 128;
const COLS = 8;
const ROWS = 4;
const COLOR_TOLERANCE = 40;
/** A frame-test pixel counts as changed when a channel moves by more than this. */
const FRAME_DELTA = 6;

function programId(r: THREE.WebGLRenderer, m: THREE.Material | undefined): number | null {
  if (!m || !r.properties.has(m)) return null;
  return (r.properties.get(m) as { currentProgram?: { id: number } }).currentProgram?.id ?? null;
}

const linear = (c: number) => new THREE.Color().setRGB(c / 255, 0, 0, THREE.SRGBColorSpace).r;

/** What a badge material writes at a texel over a cleared (0,0,0,0) target, 0–255. */
function expected(px: readonly number[], opacity: number, fade: number, fadeColor: THREE.Color | null, alphaTest: number): number[] {
  let a = (px[3] / 255) * opacity;
  if (alphaTest > 0 && a < alphaTest) a = 0;
  const f = fadeColor ? [fadeColor.r, fadeColor.g, fadeColor.b] : [0, 0, 0];
  // NormalBlending (straight alpha): rgb · a + 0, alpha · 1 + 0.
  const rgb = [0, 1, 2].map((k) => {
    const c = linear(px[k]);
    return (c + (f[k] - c) * (fadeColor ? fade : 0)) * a * 255;
  });
  return [...rgb, a * 255];
}

function readPixel(gl: WebGLRenderingContext | WebGL2RenderingContext, x: number, y: number, out: Uint8Array): Uint8Array {
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

const raycaster = new THREE.Raycaster();

/** Whether `o` hides what is behind it: a visible mesh or sprite drawn opaque (or writing depth at full strength). */
function covers(o: THREE.Object3D): boolean {
  if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite) || !chainVisible(o)) return false;
  const mats = ([] as THREE.Material[]).concat(o.material);
  return mats.some((m) => m.visible && (!m.transparent || (m.depthWrite && m.opacity >= 0.9)));
}

/** The nearest object between the camera and badge `b` that hides it, if any. */
function occluder(t: ProbeScene, b: Badge, badgeSet: ReadonlySet<THREE.Object3D>): THREE.Object3D | null {
  const from = t.camera.getWorldPosition(new THREE.Vector3());
  const to = b.getWorldPosition(new THREE.Vector3());
  const dist = from.distanceTo(to);
  raycaster.set(from, to.sub(from).normalize());
  raycaster.camera = t.camera;
  raycaster.far = dist - 0.01;
  for (const hit of raycaster.intersectObjects(t.scene.children, true)) if (!badgeSet.has(hit.object) && covers(hit.object)) return hit.object;
  return null;
}

/** A readable name for an object: its nearest named ancestor, its type and its geometry's type. */
function objectName(o: THREE.Object3D): string {
  let owner = "";
  for (let p: THREE.Object3D | null = o; p && !owner; p = p.parent) owner = p.name;
  const geo = (o as THREE.Mesh).geometry?.type;
  return `${owner ? `${owner} › ` : ""}${o.type}${geo ? ` (${geo})` : ""}`;
}

/**
 * Draws every live badge through the live renderer and reads the pixels back (the technique of
 * src/views/diag/DiagView.tsx, but with the badges' own materials and this view's GL context).
 * Then draws the live scene twice to the canvas, with and without the badges, and checks that
 * each front badge in view changes its pixel. Restores the renderer's state afterwards; the
 * canvas ends with a normal frame.
 */
export function runGpuCheck(t: ProbeScene): GpuCheck {
  const started = performance.now();
  const r = t.renderer;
  const gl = r.getContext();
  const badges = badgeList(t);
  const pass = (): GpuPass => ({ drawn: 0, colorOk: 0, alpha: null, failed: [] });
  // Frame-test candidates (front badges in view), picked before anything is drawn.
  const cam3 = t.camera;
  const bw = gl.drawingBufferWidth;
  const bh = gl.drawingBufferHeight;
  const points: { i: number; x: number; y: number }[] = [];
  badges.forEach((b, i) => {
    if (!chainVisible(b) || b.material.opacity < LOW_OPACITY || !isFront(t, i)) return;
    b.getWorldPosition(wp).project(cam3);
    if (Math.abs(wp.x) > 0.96 || Math.abs(wp.y) > 0.96 || wp.z < -1 || wp.z > 1) return;
    points.push({ i, x: Math.floor(((wp.x + 1) / 2) * bw), y: Math.floor(((wp.y + 1) / 2) * bh) });
  });
  // A badge drawn in the last frame, to compare which GL program each pass used.
  const probeMat = badges[points[0]?.i ?? 0]?.material;
  const res: GpuCheck = {
    at: new Date().toISOString(),
    t: 0,
    ms: 0,
    view: t.view,
    tested: badges.length,
    live: pass(),
    plain: pass(),
    frame: { candidates: points.length, changed: 0, occluded: 0, occluders: [], unchanged: [] },
    programs: { live: programId(r, probeMat), target: null, frame: null },
    glErrors: drainGlErrors(gl),
  };
  if (gl.isContextLost()) {
    res.error = "The WebGL context is lost.";
    res.t = Math.round(performance.now());
    return res;
  }

  const saved = {
    target: r.getRenderTarget(),
    viewport: r.getViewport(new THREE.Vector4()),
    scissor: r.getScissor(new THREE.Vector4()),
    scissorTest: r.getScissorTest(),
    clear: r.getClearColor(new THREE.Color()),
    clearAlpha: r.getClearAlpha(),
    autoClear: r.autoClear,
  };
  const W = CELL * COLS;
  const H = CELL * ROWS;
  const target = new THREE.WebGLRenderTarget(W, H);
  const stage = new THREE.Scene();
  // The live badge program includes fog when the live scene has it; keep the same variant. The
  // stage sits 1 unit from the camera, so fog adds nothing.
  stage.fog = t.scene.fog;
  const cam = new THREE.OrthographicCamera(0, W, H, 0, 0.1, 10);
  cam.position.z = 1;
  const quad = new THREE.PlaneGeometry(1, 1);
  const plain = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  const buf = new Uint8Array(W * H * 4);
  const fadeColor = t.view === "mindmap" ? new THREE.Color(t.controller.palette.paper) : null;
  const at = (x: number, y: number) => {
    const k = (Math.min(H - 1, Math.max(0, Math.floor(y))) * W + Math.min(W - 1, Math.max(0, Math.floor(x)))) * 4;
    return [buf[k], buf[k + 1], buf[k + 2], buf[k + 3]];
  };

  try {
    r.autoClear = true;
    r.setClearColor(0x000000, 0);
    for (const variant of ["live", "plain"] as const) {
      const out = res[variant];
      const alphas: number[] = [];
      for (let start = 0; start < badges.length; start += COLS * ROWS) {
        stage.clear();
        const cells = badges.slice(start, start + COLS * ROWS).map((b, k) => {
          const tex = b.material.map;
          const img = byteImage(tex);
          if (!tex || !img) return null;
          const w = DRAW_W;
          const h = DRAW_W / (img.width / img.height);
          const cx = (k % COLS) * CELL + CELL / 2;
          const cy = H - (Math.floor(k / COLS) * CELL + CELL / 2);
          let obj: THREE.Object3D;
          if (variant === "plain") {
            let m = plain.get(tex);
            if (!m) plain.set(tex, (m = new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
            obj = new THREE.Mesh(quad, m);
          } else obj = b instanceof THREE.Sprite ? new THREE.Sprite(b.material) : new THREE.Mesh(quad, b.material);
          obj.position.set(cx, cy, 0);
          obj.scale.set(w, h, 1);
          stage.add(obj);
          return { b, img, x0: cx - w / 2, y0: cy - h / 2, w, h };
        });
        r.setRenderTarget(target);
        r.render(stage, cam);
        r.readRenderTargetPixels(target, 0, 0, W, H, buf);
        if (variant === "live" && probeMat && cells.some((c) => c?.b.material === probeMat)) res.programs.target = programId(r, probeMat);
        cells.forEach((c, k) => {
          const i = start + k;
          if (!c) {
            if (out.failed.length < 12) out.failed.push(badgeSlug(t, i));
            return;
          }
          const v = plateV(c.img.width / c.img.height);
          const rim = at(c.x0 + RIM_U * c.w, c.y0 + v * c.h);
          alphas.push(rim[3]);
          if (rim[3] === 0) {
            if (out.failed.length < 12) out.failed.push(badgeSlug(t, i));
            return;
          }
          out.drawn++;
          const live = variant === "live";
          const m = c.b.material;
          const want = expected(texel(c.img, PLATE_U, v), live ? m.opacity : 1, live ? fadeOf(c.b) : 0, live ? fadeColor : null, live ? m.alphaTest : 0);
          const got = at(c.x0 + PLATE_U * c.w, c.y0 + v * c.h);
          if (want.every((x, ch) => Math.abs(x - got[ch]) <= COLOR_TOLERANCE)) out.colorOk++;
        });
      }
      out.alpha = spread(alphas);
    }
    stage.clear();

    // The frame test: the live scene through the live camera, to the canvas, without and then with
    // the badges (so the canvas ends on a normal frame).
    r.setRenderTarget(null);
    const one = new Uint8Array(4);
    const was = badges.map((b) => b.visible);
    let without: number[][];
    try {
      for (const b of badges) b.visible = false;
      r.render(t.scene, cam3);
      without = points.map((p) => [...readPixel(gl, p.x, p.y, one)]);
    } finally {
      badges.forEach((b, k) => (b.visible = was[k]));
    }
    r.render(t.scene, cam3);
    res.programs.frame = programId(r, probeMat);
    const unchanged: number[] = [];
    points.forEach((p, k) => {
      const px = readPixel(gl, p.x, p.y, one);
      if (without[k].some((x, ch) => Math.abs(x - px[ch]) > FRAME_DELTA)) res.frame.changed++;
      else unchanged.push(p.i);
    });
    // Tell badges hidden behind scene geometry (expected) from ones that simply don't show.
    const badgeSet = new Set<THREE.Object3D>(badges);
    for (const i of unchanged) {
      const o = occluder(t, badges[i], badgeSet);
      if (o) {
        res.frame.occluded++;
        const name = objectName(o);
        if (res.frame.occluders.length < 6 && !res.frame.occluders.includes(name)) res.frame.occluders.push(name);
      } else if (res.frame.unchanged.length < 12) res.frame.unchanged.push(badgeSlug(t, i));
    }
  } catch (e) {
    res.error = (e as Error).message || String(e);
  } finally {
    r.setRenderTarget(saved.target);
    r.setViewport(saved.viewport);
    r.setScissor(saved.scissor);
    r.setScissorTest(saved.scissorTest);
    r.setClearColor(saved.clear, saved.clearAlpha);
    r.autoClear = saved.autoClear;
    target.dispose();
    quad.dispose();
    for (const m of plain.values()) m.dispose();
  }
  res.glErrors.push(...drainGlErrors(gl));
  res.t = Math.round(performance.now());
  res.ms = Math.round(res.t - started);
  return res;
}

/* ---------------------------------------------------------------- findings */

export type Level = "ok" | "warn" | "bad";

export interface Finding {
  level: Level;
  text: string;
}

/** No new frame for this long, on a visible page, means the render loop has stopped. */
const STALL_MS = 2500;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Plain-language reasons the badges are, or are not, showing. Worst first. */
export function explain(s: Snapshot, gpu: GpuCheck | null, c: Pick<Counters, "contextLost" | "contextRestored" | "lastContextEvent" | "shaderErrors" | "glErrors"> = counters): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, text: string) => out.push({ level, text });

  if (c.shaderErrors.length) add("bad", `${c.shaderErrors.length} shader program(s) failed to compile or link (see the report).`);
  const glErrTotal = Object.entries(c.glErrors);
  if (glErrTotal.length) add(glErrTotal.some(([k]) => k === "OUT_OF_MEMORY") ? "bad" : "warn", `GL errors this visit: ${glErrTotal.map(([k, n]) => `${k} ×${n}`).join(", ")}.`);

  const g = s.gl;
  const b = s.badges;
  const tx = s.textures;
  if (!s.scene || !g || !b || !tx) {
    add("warn", s.view === "list" ? "List view: there is no 3D scene to measure. Open the mind map or the walk." : "The 3D view has not registered a scene yet (still loading, or it failed to start).");
    return sortFindings(out);
  }

  if (g.lost) add("bad", `The WebGL context is lost: nothing draws until the browser restores it (lost ${c.contextLost}×, restored ${c.contextRestored}×).`);
  else if (c.contextLost) add("warn", `The WebGL context was lost ${c.contextLost}× and restored ${c.contextRestored}× this visit${c.lastContextEvent !== null ? ` (last at ${secs(c.lastContextEvent)})` : ""}.`);
  if (g.failedPrograms) add("bad", `${g.failedPrograms} GL program(s) failed to link.`);
  if (s.page.visibility === "visible" && g.stalledMs >= STALL_MS) {
    if (s.state.reducedMotion) add("ok", "Rendering on demand (reduced motion): no frames while nothing changes is expected.");
    else add("bad", `The scene has not drawn a frame for ${secs(g.stalledMs)}.`);
  }

  if (!b.count) add("bad", "There are no logo badges in the scene.");
  else {
    if (b.noMap) add("bad", `${b.noMap} badge(s) have no texture.`);
    if (b.nonFinite) add("bad", `${b.nonFinite} badge(s) have NaN or Infinity in position, scale, opacity or fade.`);
    if (b.scaleZero) add("bad", `${b.scaleZero} badge(s) are scaled to zero.`);
    if (b.hidden) {
      const why = b.view === "walk" ? "waiting to drop in (visible = false)" : "switched off (visible = false)";
      add(b.hidden === b.count ? "bad" : "warn", `${b.hidden} of ${b.count} badges are ${why}.`);
    }
    if (b.visible && !b.inView) add("bad", `No visible badge is inside the camera's view (camera at ${s.controller?.camera ?? "?"}).`);
    if (b.front) {
      const share = b.frontLowOpacity / b.front;
      if (share >= 0.5) add("bad", `${b.frontLowOpacity} of the ${b.front} front badges are below ${pct(LOW_OPACITY)} opacity (median ${b.opacity ? b.opacity.median.toFixed(2) : "?"}): they are faded out, not missing.`);
      else if (b.frontLowOpacity) add("warn", `${b.frontLowOpacity} of the ${b.front} front badges are below ${pct(LOW_OPACITY)} opacity.`);
    }
    if (b.highFade) add("warn", `${b.highFade} badge(s) are faded more than halfway toward the paper color (fade > 0.5).`);
    if (b.fogged) add("warn", `${b.fogged} badge(s) in view are past the fog's far distance (drawn in solid fog color).`);
    if (b.notUploaded) add(b.notUploaded === b.inView ? "bad" : "warn", `${b.notUploaded} of the ${b.inView} badges in view have no texture uploaded to this WebGL context.`);
  }

  // Dimming on purpose: the most common reason logos "disappear" is app state, not graphics. A
  // search kept after picking a result (on phones the search field folds away), a district focus or
  // the provider finder dims every company outside it; an open company steps the others back.
  const st = s.state;
  if (b.count && st.highlight !== null) {
    const by = st.panel === "finder" && st.finder ? `the provider finder (${st.finder})` : st.query.trim() ? `the search “${st.query.trim()}”` : st.focusDistrict ? `the ${st.focusDistrict} district focus` : "a highlight";
    const dimmed = Math.max(0, b.count - st.highlight);
    if (dimmed) add("warn", `${dimmed} of ${b.count} badges are dimmed on purpose by ${by}, which matches ${st.highlight}. Clear it, or press Overview on the globe, to show every company at full strength.`);
  }
  if (b.count && st.selected) add("ok", `${st.selected} is open: the other badges step back until it is closed.`);

  if (tx.count) {
    if (tx.withData < tx.count) add("bad", `${tx.count - tx.withData} of ${tx.count} badge textures have no pixel bytes.`);
    if (tx.bytesOk < tx.withData) add("bad", `${tx.withData - tx.bytesOk} badge textures are blank in memory (the plate pixel is transparent).`);
    if (!tx.uploaded && !b.notUploaded) add("bad", "No badge texture is uploaded to this WebGL context.");
    if (tx.stale) add("warn", `${tx.stale} badge textures changed but the new pixels are not uploaded yet.`);
    if (tx.liveGl < tx.uploaded) add("bad", `${tx.uploaded - tx.liveGl} uploaded badge textures are no longer valid GL objects.`);
  }

  if (gpu && gpu.view === s.scene) {
    const n = gpu.tested;
    const age = s.t - gpu.t;
    const label = age > 3000 ? `GPU check (${secs(age)} ago)` : "GPU check";
    if (gpu.error) add("bad", `${label} failed: ${gpu.error}`);
    else {
      if (gpu.plain.drawn < n) add("bad", `${label}: ${n - gpu.plain.drawn} of ${n} badge textures draw nothing even with a plain material (the uploaded pixels are empty).`);
      if (gpu.live.drawn < n) add("bad", `${label}: ${n - gpu.live.drawn} of ${n} badges draw nothing through their own material${gpu.plain.drawn === n ? " (a plain material draws them, so the badge material or shader fails here)" : ""}.`);
      if (gpu.live.colorOk < gpu.live.drawn) add("warn", `${label}: ${gpu.live.drawn - gpu.live.colorOk} badges draw, but not in the colors their material should produce.`);
      const f = gpu.frame;
      const missing = f.candidates - f.changed - f.occluded;
      if (missing > 0) {
        add(
          missing > (f.candidates - f.occluded) / 2 ? "bad" : "warn",
          `${label}: ${missing} of ${f.candidates} front badges in view add nothing to the live frame${gpu.live.drawn === n ? ", although they draw on their own and nothing opaque is in front of them: the scene blends them away (blending, depth or draw order)" : ""}.`,
        );
      }
      if (gpu.live.drawn === n && gpu.plain.drawn === n && !missing) {
        const hidden = f.occluded ? ` (${f.occluded} more ${f.occluded === 1 ? "is" : "are"} behind ${f.occluders.join(", ")})` : "";
        add("ok", `${label}: all ${n} badges draw through the live renderer${f.candidates ? `, and ${f.changed} of ${f.candidates} front badges in view show in the live frame${hidden}` : ""} (${gpu.ms} ms).`);
      }
    }
  }

  if (!out.some((f) => f.level !== "ok")) {
    add("ok", `Badges look healthy: ${b.visible} of ${b.count} visible, ${b.inView} in view, median opacity ${b.opacity ? b.opacity.median.toFixed(2) : "?"}, ${tx.uploaded} of ${tx.count} textures uploaded.`);
  }
  return sortFindings(out);
}

const RANK: Record<Level, number> = { bad: 0, warn: 1, ok: 2 };

function sortFindings(f: Finding[]): Finding[] {
  return f.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export function worst(f: readonly Finding[]): Level {
  return f.reduce<Level>((w, x) => (RANK[x.level] < RANK[w] ? x.level : w), "ok");
}
