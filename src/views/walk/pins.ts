/* Drop pins for companies and people: a slim post, a map-pin head, and a
   badge floating above, always facing the camera. A company's pin is in its
   district color under its logo badge; a person's is in the person scene
   color (--scene-person) under their circular headshot badge, ringed in
   --person (personBadge; initials when the page shows no photo). One pin
   system carries both, so people cost no extra instanced meshes; nothing
   links a person pin to any company.

   Posts and heads are instanced meshes (per-instance color and opacity);
   badges are one plane each, sharing a geometry per kind, with the cached
   badge texture from src/three/logoTexture.ts (cached as bytes; dispose()
   frees this renderer's copy and the next mount uploads it again). Pins drop in with a staggered bounce on load, the
   selected pin bobs over a glowing ground ring, and pins outside the
   current highlight fade back (to FADED, never so far that the logo stops
   reading as a logo). On the bright afternoon ground every badge sits on a
   thin ink keyline with a soft shadow (one instanced draw for all of them),
   which keeps it apart from sand, paving, grass and sky alike
   (pins.test.ts). */
import * as THREE from "three";
import { districtOf } from "../../data/catalog";
import type { WorldLayout } from "../../data/layout";
import type { Person, Company } from "../../data/types";
import { cpuCanvas } from "../../three/cpuCanvas";
import { personBadge, companyBadge, type Badge } from "../../three/logoTexture";
import { personSceneColor, mix } from "./palette";
import { damp } from "./util";
import type { Collider } from "./world";

export const PIN_RADIUS = 0.7;
/** A company's logo badge: a 2:1 plate, centered at BADGE_Y. */
export const BADGE_W = 3.4;
export const BADGE_Y = 3.95;
const HEAD_Y = 2.2;
/**
 * A person's headshot badge: a circle, on a square plane. Its lowest point sits closer to the pin
 * head than a plate's flat edge can (0.2 above the head's top), which keeps its top, and its name
 * label, in view when a fly-to frames it above the details sheet.
 */
export const PERSON_BADGE_W = 2.5;
const PERSON_BADGE_Y = HEAD_Y + 0.74 + PERSON_BADGE_W / 2;
const POST_H = 1.8;
const DROP_HEIGHT = 18;
const DROP_TIME = 0.8;
/** Opacity of a pin outside the current highlight (a search, a district focus, the provider
 *  finder). An ink logo on a white plate at this opacity keeps about 3:1 contrast over the
 *  ground, so a dimmed badge still reads as a logo while the matches stand out. */
export const FADED = 0.6;

/** The ink keyline around every badge: its color and width in world units. */
export const KEYLINE = { color: "#1d1f24", width: 0.075 } as const;

/** Badges right in front of the lens fade back so they don't wall off the view: 1 from 10 units
 *  away, down to 0.22 within 4 units. */
export function nearFade(distance: number): number {
  return distance >= 10 ? 1 : distance <= 4 ? 0.22 : 0.22 + ((distance - 4) / 6) * 0.78;
}

/** A badge's material opacity: its pin's highlight opacity, capped (not multiplied) by the
 *  near-lens fade, so a dimmed pin close to the camera is no fainter than any other close pin. */
export function badgeOpacity(pinOpacity: number, distance: number): number {
  return Math.min(pinOpacity, nearFade(distance));
}

/** A company's logo badge: a camera-facing plane with the cached badge texture. */
export type BadgeMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/**
 * How solid a badge is at distance `dc` from the camera. Badges right in front of the lens fade
 * back so they don't wall off the view. A face in the foreground is more jarring than a logo, so a
 * person's headshot also fades when it stands between the camera and the walker (`focus` is the
 * camera's distance to the walker): a fly-to can set the camera down beside a neighboring person,
 * whose face would then fill a corner of the screen. Pins beside or ahead of the walker stay solid,
 * and the person the visitor has open is never faded this way.
 */
export function lensFade(dc: number, headshot: boolean, focus = Infinity): number {
  const lens = nearFade(dc);
  if (!headshot) return lens;
  const full = focus - 1;
  const floor = focus * 0.68;
  const fore = dc >= full ? 1 : dc <= floor ? 0.1 : 0.1 + ((dc - floor) / (full - floor)) * 0.9;
  return Math.min(lens, fore);
}

export interface PinSystem {
  root: THREE.Group;
  /** Objects to raycast for clicks/taps. */
  pickables: THREE.Object3D[];
  /** The logo and headshot badges, in pin order (the ?debug probe measures them). */
  badges: readonly BadgeMesh[];
  /** Company or person slug for a raycast hit on one of the pickables. */
  slugOf(hit: THREE.Intersection): string | null;
  colliders: Collider[];
  /** Each badge as a tall obstacle, for choosing fly-to views (badges crowd the foreground like tree crowns). */
  blockers: Collider[];
  /** Pin order (index → slug) and positions: companies first, then people. */
  slugs: string[];
  xs: Float32Array;
  zs: Float32Array;
  indexOf: Map<string, number>;
  /** True for a person's pin. */
  isPerson(i: number): boolean;
  /** The pin's color as CSS: the company's district color, or the person scene color. */
  colorOf(i: number): string;
  setHighlight(h: Set<string> | null): void;
  setSelected(slug: string | null): void;
  /** Start the drop-in wave from (x, z), or place every pin at once. */
  drop(now: number, fromX: number, fromZ: number, animate: boolean): void;
  /** World-space point just above the badge, for a DOM name label. */
  labelAnchor(i: number, out: THREE.Vector3): THREE.Vector3;
  /** 0..1 current opacity of pin i (for fading its DOM label too). */
  opacityOf(i: number): number;
  /** Pin i has landed (or is landing): its badge is drawn. False while it waits to drop in. */
  isShown(i: number): boolean;
  /** `focus`: the camera's distance to the walker (headshots nearer the lens than that fade; see lensFade). */
  update(now: number, dt: number, time: number, reduced: boolean, camera: THREE.Camera, focus?: number): void;
  dispose(): void;
}

function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** Teardrop map-pin head (tip down) as a lathe. */
function pinHeadGeometry(): THREE.BufferGeometry {
  const R = 0.44;
  const cy = 0.1;
  const tipY = -0.64;
  const alpha = Math.asin(R / (cy - tipY));
  const theta = Math.PI / 2 - alpha;
  const pts = [new THREE.Vector2(0.001, tipY)];
  // Faceted, like the rest of the world's props.
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const phi = theta + ((Math.PI - theta) * i) / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * Math.sin(phi)), cy - R * Math.cos(phi)));
  }
  return new THREE.LatheGeometry(pts, 9);
}

/** Lambert material with a per-instance opacity attribute. */
function fadingMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true, transparent: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float instanceOpacity;\nvarying float vInstOpacity;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstOpacity = instanceOpacity;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vInstOpacity;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vInstOpacity;");
  };
  m.customProgramCacheKey = () => "walk-pin-fade";
  return m;
}

/**
 * The keylines: one camera-facing quad per badge, instanced, each drawing a rounded rectangle (a
 * logo plate) or a circle (a headshot) a keyline wider than its badge, in ink, with a soft shadow
 * around it, antialiased from its distance field. Per instance: half width, half height and corner
 * radius (aBack.xyz) and opacity (aBack.w, the badge's own).
 */
function keylineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uInk: { value: new THREE.Color(KEYLINE.color) } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 aBack;
      varying vec2 vP;
      varying vec4 vBack;
      void main() {
        vBack = aBack;
        // The quad reaches past the keyline by the shadow's width.
        vec2 reach = aBack.xy + 0.22;
        vP = position.xy * 2.0 * reach;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position.xy * 2.0 * reach, 0.0, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      varying vec2 vP;
      varying vec4 vBack;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = abs(vP) - (vBack.xy - vBack.z);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vBack.z;
        float aa = max(fwidth(d), 1e-4);
        float line = 1.0 - smoothstep(-aa, aa, d);
        float shadow = (1.0 - smoothstep(0.0, 0.2, d)) * 0.28;
        float a = max(line, shadow) * vBack.w;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uInk, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function glowTexture(): THREE.CanvasTexture {
  const S = 128;
  const [cv, ctx] = cpuCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.0)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(0.62, "rgba(255,255,255,1)");
  g.addColorStop(0.72, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface PinItem {
  slug: string;
  person: boolean;
  color: string;
  badge: () => Badge;
}

export function buildPins(layout: WorldLayout, companies: readonly Company[], people: readonly Person[] = []): PinSystem {
  const root = new THREE.Group();
  root.name = "pins";
  const list: PinItem[] = [
    ...companies.filter((m) => layout.pins.has(m.slug)).map((m) => ({ slug: m.slug, person: false, color: districtOf(m).color, badge: () => companyBadge(m, false) })),
    ...people.filter((c) => layout.pins.has(c.slug)).map((c) => ({ slug: c.slug, person: true, color: personSceneColor(), badge: () => personBadge(c) })),
  ];
  const n = list.length;
  const slugs = list.map((m) => m.slug);
  const indexOf = new Map(slugs.map((s, i) => [s, i]));
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  list.forEach((m, i) => {
    const p = layout.pins.get(m.slug)!;
    xs[i] = p.x;
    zs[i] = p.z;
  });
  const colliders: Collider[] = list.map((_, i) => ({ x: xs[i], z: zs[i], r: PIN_RADIUS }));
  // Per pin: badge center height and half height.
  const badgeY = list.map((m) => (m.person ? PERSON_BADGE_Y : BADGE_Y));
  const badgeHalf = list.map((m) => (m.person ? PERSON_BADGE_W / 2 : BADGE_W / 4));
  const blockers: Collider[] = list.map((m, i) => ({ x: xs[i], z: zs[i], r: (m.person ? PERSON_BADGE_W : BADGE_W) / 2, h: badgeY[i] + badgeHalf[i] }));

  const ink = new THREE.Color("#1d1f24");
  const colors = list.map((m) => new THREE.Color(m.color));

  // Posts (with a little footing) and heads, instanced.
  const postGeo = new THREE.CylinderGeometry(0.06, 0.085, POST_H, 6).translate(0, POST_H / 2, 0);
  const footGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.1, 10).translate(0, 0.05, 0);
  const headGeo = pinHeadGeometry();
  const opacityAttr = () => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  for (const g of [postGeo, footGeo, headGeo]) g.setAttribute("instanceOpacity", opacityAttr());
  const postMat = fadingMaterial();
  const headMat = fadingMaterial();
  const posts = new THREE.InstancedMesh(postGeo, postMat, Math.max(1, n));
  const feet = new THREE.InstancedMesh(footGeo, postMat, Math.max(1, n));
  const heads = new THREE.InstancedMesh(headGeo, headMat, Math.max(1, n));
  posts.count = feet.count = heads.count = n;
  for (const im of [posts, feet, heads]) {
    im.castShadow = true;
    im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
  }
  feet.castShadow = false;
  feet.receiveShadow = true;
  // The heads' shadows carry the pin; a post a few pixels wide adds nothing but shadow-pass work.
  posts.castShadow = false;
  list.forEach((_, i) => {
    posts.setColorAt(i, mix(colors[i], ink, 0.35));
    feet.setColorAt(i, mix(colors[i], ink, 0.15));
    heads.setColorAt(i, colors[i]);
  });
  root.add(posts, feet, heads);

  // Badges: one plane per pin, one shared geometry per kind (logo plates 2:1, headshots square).
  const badgeGeo = new THREE.PlaneGeometry(BADGE_W, BADGE_W / 2);
  const personGeo = new THREE.PlaneGeometry(PERSON_BADGE_W, PERSON_BADGE_W);
  const badgeMats: THREE.MeshBasicMaterial[] = [];
  const badges: BadgeMesh[] = list.map((m, i) => {
    const { texture } = m.badge();
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.04, toneMapped: false });
    badgeMats.push(mat);
    const mesh = new THREE.Mesh(m.person ? personGeo : badgeGeo, mat);
    mesh.userData.pin = i;
    mesh.renderOrder = 3;
    root.add(mesh);
    return mesh;
  });

  // Keylines: one instanced draw behind every badge.
  const backGeo = new THREE.PlaneGeometry(1, 1);
  const backAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4).setUsage(THREE.DynamicDrawUsage);
  list.forEach((m, i) => {
    const k = KEYLINE.width;
    if (m.person) backAttr.setXYZW(i, PERSON_BADGE_W / 2 + k, PERSON_BADGE_W / 2 + k, PERSON_BADGE_W / 2 + k, 1);
    // The plate's corner radius is 44/256 of its height (src/three/logoTexture.ts).
    else backAttr.setXYZW(i, BADGE_W / 2 + k, BADGE_W / 4 + k, (BADGE_W / 2) * (44 / 256) + k, 1);
  });
  backGeo.setAttribute("aBack", backAttr);
  const backMat = keylineMaterial();
  const backs = new THREE.InstancedMesh(backGeo, backMat, Math.max(1, n));
  backs.count = n;
  backs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  backs.frustumCulled = false;
  backs.renderOrder = 2.9;
  backs.raycast = () => {};
  root.add(backs);
  const toCam = new THREE.Vector3();
  const backPos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);

  // Selection: a glowing ground ring.
  const glowTex = glowTexture();
  const ringMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
  const ringGeo = new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 2;
  ring.visible = false;
  root.add(ring);

  const opacity = new Float32Array(n).fill(1);
  const target = new Float32Array(n).fill(1);
  const dropAt = new Float32Array(n).fill(-1); // performance.now() seconds when the pin starts falling
  let dropping = true; // every pin waits in the air (hidden badge) until drop()
  let selected = -1;
  let bobT = 0;

  const m4 = new THREE.Matrix4();
  const yOffset = (i: number, now: number) => {
    if (!dropping) return 0;
    const t0 = dropAt[i];
    if (t0 < 0) return DROP_HEIGHT;
    const t = (now - t0) / DROP_TIME;
    if (t <= 0) return DROP_HEIGHT;
    if (t >= 1) return 0;
    return (1 - easeOutBounce(t)) * DROP_HEIGHT;
  };
  const yOff = new Float32Array(n);
  const bob = (i: number) => (i === selected ? 0.35 + Math.sin(bobT * 3) * 0.3 : 0);

  let highlight: Set<string> | null = null;
  /** Fade targets: highlighted (or everyone, with no highlight) plus the selected pin stay solid. */
  function retarget() {
    for (let i = 0; i < n; i++) target[i] = !highlight || highlight.has(slugs[i]) || i === selected ? 1 : FADED;
  }

  function setHighlight(h: Set<string> | null) {
    highlight = h;
    retarget();
  }

  function setSelected(slug: string | null) {
    const i = slug ? indexOf.get(slug) ?? -1 : -1;
    selected = i;
    ring.visible = i >= 0;
    if (i >= 0) {
      ring.position.set(xs[i], 0.07, zs[i]);
      ringMat.color.copy(colors[i]).lerp(new THREE.Color(1, 1, 1), 0.15);
    }
    retarget();
  }

  function drop(now: number, fromX: number, fromZ: number, animate: boolean) {
    if (!animate) {
      dropping = false;
      return;
    }
    dropping = true;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(xs[i] - fromX, zs[i] - fromZ);
      dropAt[i] = now + 0.35 + d * 0.011 + ((i * 37) % 11) * 0.012;
    }
  }

  function labelAnchor(i: number, out: THREE.Vector3) {
    return out.set(xs[i], badgeY[i] + badgeHalf[i] + 0.25 + yOff[i], zs[i]);
  }

  function update(now: number, dt: number, time: number, reduced: boolean, camera: THREE.Camera, focus = Infinity) {
    bobT = reduced ? 0 : time;
    const k = damp(9, dt);
    let fadeChanged = false;
    let allLanded = true;
    for (let i = 0; i < n; i++) {
      if (Math.abs(opacity[i] - target[i]) > 0.002) {
        opacity[i] += (target[i] - opacity[i]) * (reduced ? 1 : k);
        fadeChanged = true;
      }
      const y = yOffset(i, now);
      if (y > 0) allLanded = false;
      yOff[i] = y + (reduced ? (i === selected ? 0.35 : 0) : bob(i));
      const waiting = y >= DROP_HEIGHT - 0.01;
      if (waiting) m4.makeScale(0, 0, 0);
      else m4.makeTranslation(xs[i], y, zs[i]);
      posts.setMatrixAt(i, m4);
      feet.setMatrixAt(i, m4);
      if (!waiting) m4.makeTranslation(xs[i], HEAD_Y + yOff[i], zs[i]);
      heads.setMatrixAt(i, m4);
      const b = badges[i];
      b.position.set(xs[i], badgeY[i] + yOff[i], zs[i]);
      b.quaternion.copy(camera.quaternion);
      // Capped, not multiplied (see badgeOpacity): a dimmed pin near the lens is no fainter than any other close pin.
      badgeMats[i].opacity = Math.min(opacity[i], lensFade(camera.position.distanceTo(b.position), !!list[i].person && i !== selected, focus));
      b.visible = !waiting;
      // Its keyline, a hair behind it, at its opacity.
      toCam.copy(camera.position).sub(b.position).normalize();
      backPos.copy(b.position).addScaledVector(toCam, -0.03);
      m4.compose(backPos, camera.quaternion, b.visible ? one : zero);
      backs.setMatrixAt(i, m4);
      backAttr.setW(i, badgeMats[i].opacity);
    }
    backs.instanceMatrix.needsUpdate = true;
    backAttr.needsUpdate = true;
    if (dropping && allLanded) dropping = false;
    posts.instanceMatrix.needsUpdate = feet.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    if (fadeChanged) {
      for (const g of [postGeo, footGeo, headGeo]) {
        const a = g.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute;
        (a.array as Float32Array).set(opacity);
        a.needsUpdate = true;
      }
    }
    if (selected >= 0) {
      const pulse = reduced ? 1 : 1 + Math.sin(time * 3.2) * 0.07;
      ring.scale.set(pulse, 1, pulse);
      ringMat.opacity = reduced ? 0.9 : 0.75 + Math.sin(time * 3.2) * 0.2;
      ring.position.set(xs[selected], 0.07, zs[selected]);
    }
  }

  function slugOf(hit: THREE.Intersection): string | null {
    const o = hit.object;
    if (typeof o.userData.pin === "number") return slugs[o.userData.pin] ?? null;
    if ((o === heads || o === posts) && hit.instanceId !== undefined) return slugs[hit.instanceId] ?? null;
    return null;
  }

  function dispose() {
    for (const g of [postGeo, footGeo, headGeo, badgeGeo, personGeo, ringGeo, backGeo]) g.dispose();
    backMat.dispose();
    backs.dispose();
    // Disposing the cached badge textures too releases this renderer: three.js keeps a 'dispose'
    // listener on every texture it uploads, which would otherwise hold the dead view alive.
    for (const m of badgeMats) m.map?.dispose();
    for (const m of [postMat, headMat, ringMat, ...badgeMats]) m.dispose();
    glowTex.dispose();
    for (const im of [posts, feet, heads]) im.dispose();
  }

  return {
    root,
    pickables: badges,
    badges,
    slugOf,
    colliders,
    blockers,
    slugs,
    xs,
    zs,
    indexOf,
    isPerson: (i) => list[i]?.person ?? false,
    colorOf: (i) => list[i]?.color ?? "#888888",
    setHighlight,
    setSelected,
    drop,
    labelAnchor,
    opacityOf: (i) => opacity[i],
    isShown: (i) => badges[i]?.visible ?? false,
    update,
    dispose,
  };
}
