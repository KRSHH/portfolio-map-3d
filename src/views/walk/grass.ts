/* Grass tufts around the walker: small three-bladed tufts that sway in the wind and part around
   the walker's feet, on grassy ground only (not on the plaza, a road, the beach, a district's core
   or its rings), shrinking to nothing at the edge of a circle that travels with the walker.

   Cheap by construction: one draw call for every tuft (an instanced geometry whose tufts are
   placed in the vertex shader from a per-tuft attribute, no matrices), no transparency, no
   shadow casting. Where tufts may grow is worked out on the CPU in square chunks of ground, cached,
   and a few chunks at most per frame (so a fly to a district never stalls a frame); a chunk's tufts
   stand on jittered grid points that depend only on the point, so they never jump when the
   circle moves. */
import * as THREE from "three";
import { CORE_RADIUS, PLAZA_RADIUS, onRoad, type WorldLayout } from "../../data/layout";
import { patchToon, type ToonShared } from "../../three/toon";
import { mix, type ScenePalette } from "./palette";
import { SEA_LEVEL, type Terrain } from "./terrain";

/** The tufts' circle radius around the walker, and their grid spacing. */
export const GRASS_RADIUS = { fine: 30, coarse: 23 } as const;
export const GRASS_SPACING = { fine: 0.95, coarse: 1.3 } as const;
/** Chunk side, world units. */
const CHUNK = 24;

/**
 * May a tuft grow at (x, z)? Grassy ground only: on land above the beach, off the plaza and the
 * roads (and their verges), and inside a district only on its lawn: never in its core clearing or
 * on its edge rings, never at a pin's foot. Pure (grass.test.ts).
 */
export function grassAt(layout: WorldLayout, terrain: Pick<Terrain, "heightAt" | "sandAt">, x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r < PLAZA_RADIUS + 1.2) return false;
  if (terrain.sandAt(r, Math.atan2(z, x)) > 0.2) return false;
  if (terrain.heightAt(x, z) < SEA_LEVEL + 0.3) return false;
  if (onRoad(layout, x, z, 0.7)) return false;
  for (const d of layout.discs) {
    const dr = Math.hypot(x - d.x, z - d.z);
    if (dr >= d.r + 0.4) continue;
    if (dr < CORE_RADIUS + 0.7 || dr > d.r - 1.9) return false;
    for (const pin of layout.pins.values()) if (pin.district === d.slug && (pin.x - x) ** 2 + (pin.z - z) ** 2 < 1.1) return false;
    return true;
  }
  return true;
}

/** A small deterministic hash of a grid point, 0..1 (one per channel k). */
function hash2(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The tufts of one chunk: x, y, z, yaw, scale, tint per tuft. */
function chunkTufts(layout: WorldLayout, terrain: Terrain, cx: number, cz: number, spacing: number): Float32Array {
  const out: number[] = [];
  const n = Math.round(CHUNK / spacing);
  const step = CHUNK / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cx * n + i;
      const gj = cz * n + j;
      const x = (gi + 0.15 + hash2(gi, gj, 0) * 0.7) * step;
      const z = (gj + 0.15 + hash2(gi, gj, 1) * 0.7) * step;
      if (!grassAt(layout, terrain, x, z)) continue;
      out.push(x, terrain.heightAt(x, z), z, hash2(gi, gj, 2) * Math.PI * 2, 0.7 + hash2(gi, gj, 3) * 0.65, hash2(gi, gj, 4));
    }
  }
  return new Float32Array(out);
}

/** One tuft: three blades, each a triangle with both faces, its base dark and its tip light, normals up. */
function tuftGeometry(p: ScenePalette): THREE.InstancedBufferGeometry {
  const base = mix(p.grassDark, p.treeDark, 0.25);
  const tip = p.grassTip;
  const pos: number[] = [];
  const col: number[] = [];
  const heights = [0.42, 0.33, 0.38];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.3;
    const lean = 0.22;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = 0.055;
    const h = heights[b];
    // Base corners across the blade, tip leaning outward.
    const p0 = [-sa * w, 0, ca * w];
    const p1 = [sa * w, 0, -ca * w];
    const p2 = [ca * lean * h, h, sa * lean * h];
    for (const tri of [
      [p0, p1, p2],
      [p1, p0, p2],
    ]) {
      for (const v of tri) pos.push(v[0], v[1], v[2]);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return g;
}

export interface GrassField {
  mesh: THREE.Mesh;
  /** Follow the walker; call every frame. `time` is frozen under reduced motion by the caller. */
  update(x: number, z: number, time: number): void;
  dispose(): void;
}

export function buildGrass(layout: WorldLayout, terrain: Terrain, p: ScenePalette, shared: ToonShared, coarse: boolean): GrassField {
  const radius = coarse ? GRASS_RADIUS.coarse : GRASS_RADIUS.fine;
  const spacing = coarse ? GRASS_SPACING.coarse : GRASS_SPACING.fine;
  const capacity = Math.ceil((Math.PI * radius * radius) / (spacing * spacing)) + 64;
  const perFrame = coarse ? 1 : 2;

  const geo = tuftGeometry(p);
  const tuft = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const shape = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aTuft", tuft);
  geo.setAttribute("aShape", shape);
  geo.instanceCount = 0;

  const uWalker = { value: new THREE.Vector3(0, 0, 0) };
  const uTime = { value: 0 };
  const uRadius = { value: radius };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Toon shaded below, by its own patch (toonify must not patch it twice).
  mat.userData.toon = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassWalker = uWalker;
    shader.uniforms.uGrassTime = uTime;
    shader.uniforms.uGrassRadius = uRadius;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aTuft;
        attribute vec2 aShape;
        uniform vec3 uGrassWalker;
        uniform float uGrassTime;
        uniform float uGrassRadius;`,
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        #ifdef USE_COLOR
          vColor.rgb *= 0.84 + 0.32 * aShape.y;
        #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float c = cos(aTuft.w);
          float s = sin(aTuft.w);
          float k = aShape.x;
          vec2 off = aTuft.xz - uGrassWalker.xz;
          float dist = length(off);
          // Shrink to nothing toward the circle's edge, so tufts never pop in or out.
          k *= smoothstep(uGrassRadius, uGrassRadius - 6.0, dist);
          vec3 v = vec3(c * transformed.x + s * transformed.z, transformed.y, -s * transformed.x + c * transformed.z) * k;
          float h = clamp(transformed.y / 0.42, 0.0, 1.0);
          // Wind: slow rolling gusts plus a quick flutter.
          float w = sin(uGrassTime * 1.7 + aTuft.x * 0.31 + aTuft.z * 0.23) * 0.11 + sin(uGrassTime * 3.3 + aTuft.x * 0.9 - aTuft.z * 0.7) * 0.035;
          v.x += w * h;
          v.z += w * 0.55 * h;
          // Part around the walker's feet.
          float part = (1.0 - smoothstep(0.25, 1.5, dist)) * h;
          v.xz += normalize(off + vec2(1e-4)) * part * 0.42;
          v.y *= 1.0 - part * 0.45;
          transformed = v + aTuft.xyz;
        }`,
      );
    patchToon(shader, { shared });
  };
  mat.customProgramCacheKey = () => "walk-grass";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "grass";
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // After the ground and the paving, before anything transparent.
  mesh.renderOrder = 0;

  const chunks = new Map<string, Float32Array>();
  const want: { cx: number; cz: number; d: number }[] = [];
  let lastX = Infinity;
  let lastZ = Infinity;
  let dirty = true;

  const rebuild = (x: number, z: number) => {
    const ta = tuft.array as Float32Array;
    const sa = shape.array as Float32Array;
    let n = 0;
    const r2 = radius * radius;
    const c0x = Math.floor((x - radius) / CHUNK);
    const c1x = Math.floor((x + radius) / CHUNK);
    const c0z = Math.floor((z - radius) / CHUNK);
    const c1z = Math.floor((z + radius) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const list = chunks.get(`${cx},${cz}`);
        if (!list) continue;
        for (let k = 0; k < list.length && n < capacity; k += 6) {
          const dx = list[k] - x;
          const dz = list[k + 2] - z;
          if (dx * dx + dz * dz > r2) continue;
          ta[n * 4] = list[k];
          ta[n * 4 + 1] = list[k + 1];
          ta[n * 4 + 2] = list[k + 2];
          ta[n * 4 + 3] = list[k + 3];
          sa[n * 2] = list[k + 4];
          sa[n * 2 + 1] = list[k + 5];
          n++;
        }
      }
    }
    geo.instanceCount = n;
    tuft.needsUpdate = true;
    shape.needsUpdate = true;
    tuft.addUpdateRange(0, n * 4);
    shape.addUpdateRange(0, n * 2);
  };

  return {
    mesh,
    update(x, z, time) {
      uTime.value = time;
      uWalker.value.set(x, 0, z);
      // Fill the chunks the circle needs, nearest first, a few per frame.
      want.length = 0;
      const c0x = Math.floor((x - radius) / CHUNK);
      const c1x = Math.floor((x + radius) / CHUNK);
      const c0z = Math.floor((z - radius) / CHUNK);
      const c1z = Math.floor((z + radius) / CHUNK);
      for (let cz = c0z; cz <= c1z; cz++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          if (chunks.has(`${cx},${cz}`)) continue;
          want.push({ cx, cz, d: Math.hypot((cx + 0.5) * CHUNK - x, (cz + 0.5) * CHUNK - z) });
        }
      }
      if (want.length) {
        want.sort((a, b) => a.d - b.d);
        for (let i = 0; i < Math.min(perFrame, want.length); i++) chunks.set(`${want[i].cx},${want[i].cz}`, chunkTufts(layout, terrain, want[i].cx, want[i].cz, spacing));
        dirty = true;
        // Forget chunks far behind (a long trip around the island would otherwise keep them all).
        if (chunks.size > 96) {
          for (const key of chunks.keys()) {
            const [kx, kz] = key.split(",").map(Number);
            if (Math.hypot((kx + 0.5) * CHUNK - x, (kz + 0.5) * CHUNK - z) > radius + CHUNK * 3) chunks.delete(key);
          }
        }
      }
      if (dirty || Math.hypot(x - lastX, z - lastZ) > 1.5) {
        rebuild(x, z);
        lastX = x;
        lastZ = z;
        dirty = false;
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      chunks.clear();
    },
  };
}
