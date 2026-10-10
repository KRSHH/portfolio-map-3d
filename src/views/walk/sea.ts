/* The sea around the island, written for the phone: no reflection pass. The water reflects the
   sky's own gradient by a fresnel term worked out in the shader, catches the low sun in a glint,
   ripples with two scrolling layers of one small normal map baked on a CPU canvas, and lets the
   seabed show through where the camera looks down into the shallows (the ground mesh colors the
   seabed sand, turquoise, blue). Surf rolls in along the waterline: a steady line at the shore and
   a broken wave line moving in from offshore (both still under reduced motion). */
import * as THREE from "three";
import { hashString } from "../../data/layout";
import { cpuCanvas } from "../../three/cpuCanvas";
import type { ScenePalette } from "./palette";
import { SEA_LEVEL, type Terrain } from "./terrain";
import { clamp, valueNoise2D } from "./util";

/** A tileable normal map for the ripples (CPU-backed canvas). */
function rippleNormals(): THREE.CanvasTexture {
  const size = 128;
  const [cv, ctx] = cpuCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const n = valueNoise2D(hashString("walk-sea"));
  // Tileable: blend the four shifted copies across the seams.
  const hAt = (x: number, y: number) => {
    const fx = x / size;
    const fy = y / size;
    const s = (u: number, v: number) => n(u * 0.12, v * 0.12) + 0.45 * n(u * 0.29 + 40, v * 0.29 + 40);
    return s(x, y) * (1 - fx) * (1 - fy) + s(x - size, y) * fx * (1 - fy) + s(x, y - size) * (1 - fx) * fy + s(x - size, y - size) * fx * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = hAt(x + 1, y) - hAt(x - 1, y);
      const dy = hAt(x, y + 1) - hAt(x, y - 1);
      const o = (y * size + x) * 4;
      img.data[o] = clamp(128 + dx * 230, 0, 255);
      img.data[o + 1] = clamp(128 + dy * 230, 0, 255);
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface Sea {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

export function buildSea(p: ScenePalette, sunDir: THREE.Vector3, terrain: Terrain): Sea {
  const group = new THREE.Group();
  group.name = "sea";
  const normals = rippleNormals();

  const water = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uWater: { value: p.sea.clone() },
        uHorizon: { value: p.skyBottom.clone() },
        uZenith: { value: p.skyMid.clone() },
        uSun: { value: p.sun.clone() },
        uSunDir: { value: sunDir.clone() },
        uNormal: { value: null },
        uTime: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uWater;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform sampler2D uNormal;
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = vWorld.xz;
        vec3 a = texture2D(uNormal, q * 0.034 + vec2(uTime * 0.011, uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 b = texture2D(uNormal, q * 0.087 + vec2(-uTime * 0.009, uTime * 0.014)).xyz * 2.0 - 1.0;
        vec3 n = normalize(vec3((a.x + b.x) * 0.3, 1.0, (a.y + b.y) * 0.3));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, R.y));
        vec3 col = mix(uWater, sky, 0.1 + 0.72 * fres);
        // The sun on the water.
        col += uSun * pow(max(dot(R, uSunDir), 0.0), 240.0) * 0.9;
        // Looking down, the seabed shows through; at a glance, the sky's reflection fills it.
        gl_FragColor = vec4(col, mix(0.6, 0.97, fres));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  water.uniforms.uNormal.value = normals;
  const plane = new THREE.PlaneGeometry(5000, 5000);
  const sea = new THREE.Mesh(plane, water);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_LEVEL, 0);
  sea.renderOrder = 1;
  sea.name = "sea-surface";
  group.add(sea);

  /* ----- surf along the waterline ----- */
  const foamGeo = waterlineStrip(terrain, -0.7, 2.6, SEA_LEVEL + 0.03);
  const foam = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFoam: { value: new THREE.Color(1, 1, 1).lerp(p.sand, 0.12).lerp(p.sea, p.dark ? 0.45 : 0) }, uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFoam;
      uniform float uTime;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash1(float n) { return fract(sin(n) * 43758.5453); }
      float noise1(float x) {
        float i = floor(x);
        float f = fract(x);
        return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f));
      }
      void main() {
        float along = vUv.x;
        float v = vUv.y; // 0 on the wet sand, 1 offshore
        // A steady line where the water meets the beach.
        float shore = smoothstep(0.06, 0.17, v) * (1.0 - smoothstep(0.2, 0.34, v));
        // A wave line rolling in from offshore, each stretch of coast on its own beat.
        float cyc = fract(uTime * 0.085 + noise1(along * 0.045) * 0.7);
        float pos = mix(0.96, 0.24, cyc);
        float wave = (1.0 - smoothstep(0.0, 0.055, abs(v - pos))) * smoothstep(0.0, 0.18, cyc) * (1.0 - smoothstep(0.7, 1.0, cyc));
        float lace = smoothstep(0.3, 0.72, noise1(along * 0.8 + uTime * 0.35) * 0.6 + noise1(along * 2.1 - uTime * 0.27) * 0.4);
        float a = max(shore * (0.5 + 0.38 * lace), wave * lace * 0.8);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uFoam, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const surf = new THREE.Mesh(foamGeo, foam);
  surf.renderOrder = 2;
  surf.name = "surf";
  group.add(surf);

  return {
    group,
    update(time) {
      water.uniforms.uTime.value = time;
      foam.uniforms.uTime.value = time;
    },
    dispose() {
      plane.dispose();
      foamGeo.dispose();
      water.dispose();
      foam.dispose();
      normals.dispose();
    },
  };
}

/**
 * A strip around the island along its waterline, from `inner` (negative: up the beach) to `outer`
 * units offshore, with uv = (distance along the coast, 0 at the inner edge to 1 at the outer).
 */
function waterlineStrip(terrain: Terrain, inner: number, outer: number, y: number): THREE.BufferGeometry {
  const n = 360;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let along = 0;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const w = terrain.waterlineAt(a);
    if (i > 0) along += Math.hypot(c * w - px, s * w - pz);
    px = c * w;
    pz = s * w;
    for (const [off, v] of [
      [inner, 0],
      [outer, 1],
    ] as const) {
      verts.push(c * (w + off), y, s * (w + off));
      uvs.push(along, v);
    }
    if (i < n) {
      const q = i * 2;
      idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}
