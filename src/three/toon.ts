/* Toon shading for the walk world's lit props, the painted look: a soft two-tone terminator instead
   of a smooth Lambert falloff, cool sky light in the shadows, cloud shadows drifting across the land,
   and plants that sway in the wind. A patch on three.js's Lambert material, so shadow maps,
   instancing, vertex and instance colors and fog keep working, with no texture but one small cloud
   map baked on a CPU canvas (nothing is fetched).

   - toonRamp(): the terminator. Faces turned toward the sun are fully lit, faces turned away get
     only the hemisphere (sky) light, with a short soft band between them.
   - Cloud shadows: a tileable noise map in world x/z, drifting with time, takes some of the sun
     (never the sky light, so shadows keep their color).
   - Wind: vertices sway with their height above the object's base (trees, palms, grass).
   - Near fade: the screen-door dissolve near the lens every walk prop has (see util.withNearFade).

   patchToon() edits a material's shader source in onBeforeCompile and can be combined with other
   patches; toonMaterial() is the common case. toon.test.ts checks that every piece of three.js
   source it edits is still there. */
import * as THREE from "three";
import { cpuCanvas } from "./cpuCanvas";

/** Uniforms shared by every toon material of one scene (one update per frame drives them all). */
export interface ToonShared {
  /** Tileable cloud-shadow map (red channel). */
  cloudMap: { value: THREE.Texture | null };
  /** World units → map coordinates. */
  cloudScale: { value: number };
  /** The map's drift (map coordinates). */
  cloudOffset: { value: THREE.Vector2 };
  /** How much of the sun a cloud takes, 0..1. */
  cloudStrength: { value: number };
  /** Seconds, for the wind. Frozen under reduced motion. */
  windTime: { value: number };
}

export interface ToonOptions {
  shared: ToonShared;
  /** Wind sway in world units at a height of 4 (0 or absent: still). */
  wind?: number;
  /** The near-lens dissolve range (util.withNearFade); absent: none. */
  nearFade?: { value: THREE.Vector2 };
}

export function createToonShared(cloudMap: THREE.Texture | null): ToonShared {
  return {
    cloudMap: { value: cloudMap },
    cloudScale: { value: 1 / 420 },
    cloudOffset: { value: new THREE.Vector2(0.13, 0.57) },
    cloudStrength: { value: 0.32 },
    windTime: { value: 0 },
  };
}

/** The source the patch edits, with what it becomes (toon.test.ts checks each `from` exists). */
export const TOON_EDITS = {
  /** In ShaderChunk.lights_lambert_pars_fragment: the Lambert term becomes the toon terminator, clouded. */
  lambert: {
    from: "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
    to: "float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) ) * toonCloud;",
  },
  vertexCommon: "#include <common>",
  vertexBegin: "#include <begin_vertex>",
  vertexProject: "#include <project_vertex>",
  fragmentCommon: "#include <common>",
  fragmentLambertPars: "#include <lights_lambert_pars_fragment>",
  fragmentClipping: "#include <clipping_planes_fragment>",
} as const;

const TOON_PARS = /* glsl */ `
float toonCloud = 1.0;
// A soft two-tone terminator with a little gradient on the lit side (never above 1).
float toonRamp(float ndl) {
  return smoothstep(-0.06, 0.2, ndl) * (0.86 + 0.14 * smoothstep(0.2, 0.9, ndl));
}
`;

/** The vertex half: wind sway, the world position the cloud shadows need, the near-lens distance. */
function patchToonVertex(shader: THREE.WebGLProgramParametersWithUniforms, o: ToonOptions): void {
  const wind = o.wind ?? 0;
  if (wind > 0) {
    shader.uniforms.uToonWindTime = o.shared.windTime;
    shader.uniforms.uToonWind = { value: wind };
  }
  let vs = shader.vertexShader.replace(
    TOON_EDITS.vertexCommon,
    `${TOON_EDITS.vertexCommon}
    varying vec3 vToonWorld;
    ${wind > 0 ? "uniform float uToonWindTime;\nuniform float uToonWind;" : ""}
    ${o.nearFade ? "varying float vNearDist;" : ""}`,
  );
  if (wind > 0) {
    vs = vs.replace(
      TOON_EDITS.vertexBegin,
      `${TOON_EDITS.vertexBegin}
      {
        vec3 toonBase = vec3(0.0);
        #ifdef USE_INSTANCING
          toonBase = instanceMatrix[3].xyz;
        #endif
        float toonSeed = fract(sin(dot(toonBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float toonH = max(transformed.y, 0.0) * 0.25;
        float toonBend = toonH * toonH * uToonWind;
        // Gusts roll across the land; each plant keeps its own phase.
        float toonGust = 0.55 + 0.45 * sin(uToonWindTime * 0.31 + toonBase.x * 0.011 + toonBase.z * 0.007);
        transformed.x += sin(uToonWindTime * 1.25 + toonSeed * 6.2831 + transformed.y * 0.35) * toonBend * toonGust;
        transformed.z += sin(uToonWindTime * 1.61 + toonSeed * 3.17 + transformed.y * 0.27) * toonBend * toonGust * 0.6;
      }`,
    );
  }
  shader.vertexShader = vs.replace(
    TOON_EDITS.vertexProject,
    `${TOON_EDITS.vertexProject}
    {
      vec4 toonWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        toonWorld = instanceMatrix * toonWorld;
      #endif
      vToonWorld = (modelMatrix * toonWorld).xyz;
      ${o.nearFade ? "vNearDist = length(mvPosition.xyz);" : ""}
    }`,
  );
}

/** Edit a Lambert shader in onBeforeCompile (alone, or alongside another patch). */
export function patchToon(shader: THREE.WebGLProgramParametersWithUniforms, o: ToonOptions): void {
  const s = o.shared;
  shader.uniforms.uToonCloudMap = s.cloudMap;
  shader.uniforms.uToonCloudScale = s.cloudScale;
  shader.uniforms.uToonCloudOffset = s.cloudOffset;
  shader.uniforms.uToonCloudStrength = s.cloudStrength;
  if (o.nearFade) shader.uniforms.uNearFade = o.nearFade;
  patchToonVertex(shader, o);
  const lambert = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(TOON_EDITS.lambert.from, TOON_EDITS.lambert.to);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      TOON_EDITS.fragmentCommon,
      `${TOON_EDITS.fragmentCommon}
      uniform sampler2D uToonCloudMap;
      uniform float uToonCloudScale;
      uniform vec2 uToonCloudOffset;
      uniform float uToonCloudStrength;
      varying vec3 vToonWorld;
      ${o.nearFade ? "uniform vec2 uNearFade;\nvarying float vNearDist;" : ""}
      ${TOON_PARS}`,
    )
    .replace(TOON_EDITS.fragmentLambertPars, lambert)
    .replace(
      TOON_EDITS.fragmentClipping,
      `${TOON_EDITS.fragmentClipping}
      ${
        o.nearFade
          ? `if (vNearDist < uNearFade.y) {
        float keep = smoothstep(uNearFade.x, uNearFade.y, vNearDist);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (keep < n) discard;
      }`
          : ""
      }
      {
        float cl = texture2D(uToonCloudMap, vToonWorld.xz * uToonCloudScale + uToonCloudOffset).r;
        toonCloud = 1.0 - uToonCloudStrength * smoothstep(0.5, 0.78, cl);
      }`,
    );
}

/** The program cache key for a set of toon options (materials with the same key share a program). */
export function toonKey(o: ToonOptions, extra = ""): string {
  return `toon|w${o.wind ? 1 : 0}|n${o.nearFade ? 1 : 0}|${extra}`;
}

/** A Lambert material with the toon patch. */
export function toonMaterial(params: THREE.MeshLambertMaterialParameters, o: ToonOptions): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial(params);
  m.userData.toon = true;
  m.onBeforeCompile = (shader) => patchToon(shader, o);
  // Wind amplitude is a uniform, so materials that differ only in it share a program.
  m.customProgramCacheKey = () => toonKey(o);
  return m;
}

/**
 * Give an existing Lambert material the toon look, after whatever patch it already has (the
 * near-lens dissolve, the hub's cutaway, the pins' fading). Its program key is taken now, before
 * the wrap, so two materials patched differently never share a program. Does nothing to other
 * materials or to one already toon.
 */
export function toonifyMaterial(m: THREE.Material, shared: ToonShared): void {
  if (!(m instanceof THREE.MeshLambertMaterial) || m.userData.toon) return;
  m.userData.toon = true;
  const before = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    patchToon(shader, { shared });
  };
  m.customProgramCacheKey = () => `${key}|toon`;
  m.needsUpdate = true;
}

/** toonifyMaterial() for every mesh under `root`. */
export function toonify(root: THREE.Object3D, shared: ToonShared): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) toonifyMaterial(m, shared);
  });
}

/**
 * The depth material for a swaying, shadow-casting mesh, so its shadow sways with it (an unswayed
 * shadow would leave the canopy shading itself in flickering patches).
 */
export function toonDepthMaterial(o: ToonOptions): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => patchToonVertex(shader, { shared: o.shared, wind: o.wind });
  m.customProgramCacheKey = () => `toon-depth|w${o.wind ? 1 : 0}`;
  return m;
}

/* ------------------------------------------------------------------ cloud shadows */

/** Tileable value noise on a `period`-cell lattice over [0, 1)², sampled at (u, v). */
function periodicNoise(table: Float32Array, period: number, u: number, v: number): number {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const at = (i: number, j: number) => table[(((j % period) + period) % period) * 64 + (((i % period) + period) % period)];
  const a = at(xi, yi);
  const b = at(xi + 1, yi);
  const c = at(xi, yi + 1);
  const d = at(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Cloud-shadow values for a size×size tile (0..1, tileable in both directions): four octaves of
 * periodic value noise, deterministic for a seed. Pure, so its tiling is tested.
 */
export function cloudField(size: number, seed = 1): Float32Array {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const octaves = [4, 8, 16, 32].map((period) => {
    const t = new Float32Array(64 * 64);
    for (let i = 0; i < t.length; i++) t[i] = rand();
    return { period, table: t };
  });
  const out = new Float32Array(size * size);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.55;
      for (const o of octaves) {
        v += periodicNoise(o.table, o.period, x / size, y / size) * amp;
        amp *= 0.5;
      }
      out[y * size + x] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / Math.max(1e-6, hi - lo);
  return out;
}

/** The cloud-shadow map as a repeating texture (CPU-backed canvas: survives a GPU process loss). */
export function cloudShadowTexture(size = 256, seed = 7): THREE.CanvasTexture {
  const [cv, ctx] = cpuCanvas(size, size);
  const field = cloudField(size, seed);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = Math.round(field[i] * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
