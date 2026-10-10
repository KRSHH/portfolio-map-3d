import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TOON_EDITS, cloudField, createToonShared, patchToon, toonDepthMaterial, toonKey, toonMaterial } from "./toon";

/** A shader as onBeforeCompile sees it: three's source, includes unexpanded. */
function lambertShader(): THREE.WebGLProgramParametersWithUniforms {
  return {
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

describe("the toon patch", () => {
  it("finds every piece of three.js source it edits", () => {
    expect(THREE.ShaderChunk.lights_lambert_pars_fragment).toContain(TOON_EDITS.lambert.from);
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    for (const s of [TOON_EDITS.vertexCommon, TOON_EDITS.vertexBegin, TOON_EDITS.vertexProject]) expect(vertexShader).toContain(s);
    for (const s of [TOON_EDITS.fragmentCommon, TOON_EDITS.fragmentLambertPars, TOON_EDITS.fragmentClipping]) expect(fragmentShader).toContain(s);
    // The depth pass of a swaying, shadow-casting mesh.
    for (const s of [TOON_EDITS.vertexCommon, TOON_EDITS.vertexBegin, TOON_EDITS.vertexProject]) expect(THREE.ShaderLib.depth.vertexShader).toContain(s);
  });

  it("replaces the Lambert term with the clouded toon terminator", () => {
    const shared = createToonShared(null);
    const sh = lambertShader();
    patchToon(sh, { shared });
    expect(sh.fragmentShader).toContain(TOON_EDITS.lambert.to);
    expect(sh.fragmentShader).not.toContain("#include <lights_lambert_pars_fragment>");
    expect(sh.fragmentShader).toContain("toonCloud = 1.0 - uToonCloudStrength");
    expect(sh.vertexShader).toContain("vToonWorld = (modelMatrix * toonWorld).xyz;");
    // Shared uniforms are the same objects, so one update per frame drives every material.
    expect(sh.uniforms.uToonCloudStrength).toBe(shared.cloudStrength);
    expect(sh.vertexShader).not.toContain("uToonWind");
  });

  it("adds the sway and the near-lens dissolve only when asked", () => {
    const shared = createToonShared(null);
    const near = { value: new THREE.Vector2(1, 2) };
    const sh = lambertShader();
    patchToon(sh, { shared, wind: 0.2, nearFade: near });
    expect(sh.vertexShader).toContain("uniform float uToonWind;");
    expect(sh.uniforms.uToonWindTime).toBe(shared.windTime);
    expect(sh.uniforms.uToonWind.value).toBe(0.2);
    expect(sh.uniforms.uNearFade).toBe(near);
    expect(sh.fragmentShader).toContain("if (keep < n) discard;");
  });

  it("shares a program between materials that differ only in their wind strength", () => {
    const shared = createToonShared(null);
    const a = toonMaterial({ vertexColors: true }, { shared, wind: 0.1 });
    const b = toonMaterial({ vertexColors: true }, { shared, wind: 0.3 });
    const still = toonMaterial({ vertexColors: true }, { shared });
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).not.toBe(still.customProgramCacheKey());
    expect(toonKey({ shared, nearFade: { value: new THREE.Vector2() } })).not.toBe(toonKey({ shared }));
    for (const m of [a, b, still]) m.dispose();
  });

  it("sways a mesh's shadow with it", () => {
    const shared = createToonShared(null);
    const depth = toonDepthMaterial({ shared, wind: 0.2 });
    const sh = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    depth.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
    expect(sh.vertexShader).toContain("transformed.x += sin(uToonWindTime");
    // The depth pass samples no cloud map.
    expect(sh.fragmentShader).not.toContain("uToonCloudMap");
    depth.dispose();
  });
});

describe("cloudField", () => {
  const size = 64;
  const f = cloudField(size, 3);

  it("spans 0..1", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of f) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeCloseTo(0, 5);
    expect(hi).toBeCloseTo(1, 5);
  });

  it("tiles without a seam in either direction", () => {
    // Across the wrap, neighbors differ no more than neighbors anywhere else do.
    let inner = 0;
    let wrapX = 0;
    let wrapY = 0;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size - 1; j++) inner = Math.max(inner, Math.abs(f[i * size + j] - f[i * size + j + 1]));
      wrapX = Math.max(wrapX, Math.abs(f[i * size + size - 1] - f[i * size]));
      wrapY = Math.max(wrapY, Math.abs(f[(size - 1) * size + i] - f[i]));
    }
    expect(wrapX).toBeLessThanOrEqual(inner * 1.05);
    expect(wrapY).toBeLessThanOrEqual(inner * 1.05);
  });

  it("is the same for the same seed", () => {
    expect(cloudField(16, 9)).toEqual(cloudField(16, 9));
    expect(cloudField(16, 9)).not.toEqual(cloudField(16, 10));
  });
});
