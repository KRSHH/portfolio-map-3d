/* Small math and geometry helpers for the walk world. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seededRandom } from "../../data/layout";

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Shortest-arc interpolation between two angles (radians). */
export function lerpAngle(from: number, to: number, t: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** Deterministic 2D value noise in [0, 1]. */
export function valueNoise2D(seed: number): (x: number, y: number) => number {
  const rand = seededRandom(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const at = (x: number, y: number) => table[((y & (size - 1)) * size) + (x & (size - 1))];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Paint every vertex of a geometry one color (for merged, vertex-colored props). */
export function paint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

/** Merge painted geometries into one (disposes the inputs). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("walk: geometry merge failed");
  merged.computeVertexNormals();
  return merged;
}

/**
 * Let a material dissolve (screen-door dither) where it comes within
 * `range.value.y` of the camera, fully gone inside `range.value.x`. Keeps a
 * tree or prop right beside the lens from filling the frame; no sorting or
 * transparency needed, and shadows (a separate depth pass) are unaffected.
 * `range` is shared, so one uniform update per frame drives every material.
 */
export function withNearFade<T extends THREE.Material>(m: T, range: { value: THREE.Vector2 }): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNearFade = range;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vNearDist;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvNearDist = length(mvPosition.xyz);");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec2 uNearFade;\nvarying float vNearDist;").replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      if (vNearDist < uNearFade.y) {
        float keep = smoothstep(uNearFade.x, uNearFade.y, vNearDist);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (keep < n) discard;
      }`,
    );
  };
  m.customProgramCacheKey = () => "walk-near-fade";
  return m;
}

/** A canvas texture with sensible defaults. */
export function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
