/* The Nexus portal: a ring of light standing on the plaza beside the hub (PORTAL in
   src/data/hub.ts). Walking through it opens the Nexus, the Portfolio Map Network's shared world,
   where every map built on this framework is a world of its own (src/network.ts). It is the walk
   world's half of the network's one requirement, so it is always built.

   One ring (a torus in the network's two colors), a swirling disc inside it (a small shader,
   still under reduced motion), a plinth with the words "The Nexus" on both faces, and a soft glow
   on the ground. Text is painted on a CPU-backed canvas (src/three/cpuCanvas.ts) and repainted
   when the web font arrives. */
import * as THREE from "three";
import { PORTAL } from "../../data/hub";
import { NETWORK_NAME } from "../../network";
import { cpuCanvas } from "../../three/cpuCanvas";
import type { ScenePalette } from "./palette";
import { canvasTexture, merge, paint, withNearFade } from "./util";

/** The network's colors: the Nexus's cyan and violet. */
export const NEXUS_CYAN = "#3ee6ff";
export const NEXUS_VIOLET = "#8b5cf6";

type Own = <T extends { dispose(): void }>(x: T) => T;

export interface PortalBuild {
  group: THREE.Group;
  /** The plaque's top, for label placement. */
  top: number;
  update(time: number, reduced: boolean): void;
  dispose(): void;
}

export function buildPortal(p: ScenePalette, own: Own, nearFade: { value: THREE.Vector2 }): PortalBuild {
  const group = new THREE.Group();
  group.name = "nexus-portal";
  group.position.set(PORTAL.x, 0, PORTAL.z);
  group.rotation.y = PORTAL.facing;
  const R = PORTAL.r;
  const cy = R + 0.55;
  const cyan = new THREE.Color(NEXUS_CYAN);
  const violet = new THREE.Color(NEXUS_VIOLET);

  // The ring, colored around its circumference from cyan to violet and back.
  const torus = new THREE.TorusGeometry(R, 0.32, 14, 72);
  const n = torus.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(torus.attributes.position.getY(i), torus.attributes.position.getX(i));
    c.copy(cyan).lerp(violet, (Math.sin(a) + 1) / 2);
    col.set([c.r, c.g, c.b], i * 3);
  }
  torus.setAttribute("color", new THREE.BufferAttribute(col, 3));
  torus.translate(0, cy, 0);
  const ring = new THREE.Mesh(own(torus), own(withNearFade(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), nearFade)));
  ring.name = "portal-ring";
  group.add(ring);

  // The plinth under the ring, and the two posts the walker passes between.
  const stone = p.ink.clone().lerp(p.rock, 0.25);
  const plinth = merge([
    paint(new THREE.BoxGeometry(R * 2 + 1.6, 0.5, PORTAL.depth + 0.8).translate(0, 0.25, 0), stone),
    paint(new THREE.CylinderGeometry(0.42, 0.55, cy - 0.3, 10).translate(-R - 0.1, 0.5 + (cy - 0.3) / 2 - 0.25, 0), stone),
    paint(new THREE.CylinderGeometry(0.42, 0.55, cy - 0.3, 10).translate(R + 0.1, 0.5 + (cy - 0.3) / 2 - 0.25, 0), stone),
  ]);
  const base = new THREE.Mesh(own(plinth), own(withNearFade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), nearFade)));
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // The swirl inside the ring.
  const uniforms = { uTime: { value: 0 }, uA: { value: cyan }, uB: { value: violet } };
  const swirl = new THREE.Mesh(
    own(new THREE.CircleGeometry(R - 0.2, 64).translate(0, cy, 0)),
    own(
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uA;
          uniform vec3 uB;
          varying vec2 vUv;
          void main() {
            vec2 q = vUv - 0.5;
            float r = length(q) * 2.0;
            float a = atan(q.y, q.x);
            float s = sin(a * 3.0 + r * 9.0 - uTime * 1.6) * 0.5 + 0.5;
            vec3 col = mix(uA, uB, s);
            col = mix(col, vec3(1.0), smoothstep(0.35, 0.0, r) * 0.55);
            float alpha = (0.35 + 0.4 * s) * smoothstep(1.0, 0.82, r);
            gl_FragColor = vec4(col, alpha);
            #include <colorspace_fragment>
          }`,
      }),
    ),
  );
  swirl.name = "portal-swirl";
  swirl.renderOrder = 2;
  group.add(swirl);

  // A glow on the ground before and behind it.
  const [gc, gctx] = cpuCanvas(128, 128);
  const g = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(62,230,255,0.55)");
  g.addColorStop(0.5, "rgba(139,92,246,0.22)");
  g.addColorStop(1, "rgba(139,92,246,0)");
  gctx.fillStyle = g;
  gctx.fillRect(0, 0, 128, 128);
  const glow = new THREE.Mesh(
    own(new THREE.PlaneGeometry(R * 3.2, R * 3.2).rotateX(-Math.PI / 2).translate(0, 0.06, 0)),
    own(new THREE.MeshBasicMaterial({ map: own(canvasTexture(gc)), transparent: true, depthWrite: false, toneMapped: false })),
  );
  group.add(glow);

  // The words on the plinth's two faces.
  const [tc, tctx] = cpuCanvas(1024, 160);
  const tex = own(canvasTexture(tc));
  const paintWords = () => {
    tctx.clearRect(0, 0, 1024, 160);
    tctx.fillStyle = "#ffffff";
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.font = `700 78px "Instrument Sans", system-ui, sans-serif`;
    tctx.fillText("THE NEXUS", 512, 58);
    tctx.font = `500 40px "Instrument Sans", system-ui, sans-serif`;
    tctx.fillStyle = NEXUS_CYAN;
    tctx.fillText(NETWORK_NAME, 512, 124);
    tex.needsUpdate = true;
  };
  paintWords();
  let disposed = false;
  (document.fonts?.ready ?? Promise.resolve()).then(() => !disposed && paintWords());
  const wordsMat = own(withNearFade(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }), nearFade));
  // A dark plaque on the ring's crown carries them, readable from both sides.
  const ww = R * 2.1;
  const wh = ww * (160 / 1024);
  const plaqueY = cy + R + 0.35 + wh / 2;
  const plaque = new THREE.Mesh(own(new THREE.BoxGeometry(ww + 0.3, wh + 0.2, 0.14).translate(0, plaqueY, 0)), own(withNearFade(new THREE.MeshLambertMaterial({ color: stone }), nearFade)));
  group.add(plaque);
  for (const side of [1, -1]) {
    const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(ww, wh)), wordsMat);
    plane.position.set(0, plaqueY, side * 0.08);
    if (side < 0) plane.rotation.y = Math.PI;
    group.add(plane);
  }

  return {
    group,
    top: plaqueY + wh / 2 + 0.1,
    update(time, reduced) {
      if (!reduced) uniforms.uTime.value = time;
    },
    dispose() {
      disposed = true;
    },
  };
}
