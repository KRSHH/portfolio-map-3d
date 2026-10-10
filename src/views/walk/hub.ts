/* The hub: the publisher's pavilion at the center of the plaza (src/data/hub.ts holds its
   footprint). A glass hall on a low plinth with an upper volume set back on its roof, an accent
   band in the site's accent color (site.json theme.accent), a canopy over the entrance with the
   hub's name on its fascia (site.json labels.hub), planters, and a pole carrying a sign with the
   publisher's logo (site.json org.logo, or its name in type), whose head turns to the camera.

   Everything static is one merged, vertex-colored, flat-shaded mesh in the hub's local frame. Its
   material dissolves near the lens like the other props, and cuts a dithered window toward the
   walker when the building hides them. Signage is one canvas atlas (CPU-backed, see
   src/three/cpuCanvas.ts), painted again when the logo and the web font arrive. */
import * as THREE from "three";
import { siteFile } from "../../data/catalog";
import { HUB, HUB_CENTER, HUB_ROT, HUB_TOP, hubBeacon, hubBlockers, hubBoxes, hubColliders, type HubBox, type HubCircle } from "../../data/hub";
import { L, SITE } from "../../site";
import { cpuCanvas } from "../../three/cpuCanvas";
import { mix, type ScenePalette } from "./palette";
import { canvasTexture, merge, paint, withNearFade } from "./util";

export interface HubBuild {
  /** The building, in its own frame (positioned and turned onto the plaza). */
  group: THREE.Group;
  /** The beacon's sign head, in world space; its yaw follows the camera. */
  beaconHead: THREE.Group;
  colliders: HubCircle[];
  boxes: HubBox[];
  blockers: HubCircle[];
  hubTop: number;
  beacon: { x: number; z: number; foot: number; w: number; y0: number; y1: number };
  /** Walker head position and cutaway radius (w = 0: off). */
  occluder: { value: THREE.Vector4 };
  update(cameraYaw: number): void;
  dispose(): void;
}

type Own = <T extends { dispose(): void }>(x: T) => T;

/* ---------------- the signage atlas ---------------- */

const ATLAS_W = 1024;
const ATLAS_H = 512;
/** The beacon's face (its aspect is the sign's). */
const FACE = { x: 0, y: 0, w: 1024, h: Math.round(1024 / (HUB.beacon.w / HUB.beacon.h)) };
/** The hub's name for the canopy fascia, ink on transparent. */
const NAME = { x: 0, y: FACE.h + 16, w: 1024, h: 96 };

function uvRect(r: { x: number; y: number; w: number; h: number }, inset = 0) {
  return { u0: (r.x + inset) / ATLAS_W, u1: (r.x + r.w - inset) / ATLAS_W, v0: 1 - (r.y + r.h - inset) / ATLAS_H, v1: 1 - (r.y + inset) / ATLAS_H };
}

function atlasPlane(w: number, h: number, r: { u0: number; u1: number; v0: number; v1: number }): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? r.u1 : r.u0, uv.getY(i) ? r.v1 : r.v0);
  return g;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700): number {
  let s = size;
  ctx.font = `${weight} ${s}px "Instrument Sans", system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxW && s > 12) {
    s -= 2;
    ctx.font = `${weight} ${s}px "Instrument Sans", system-ui, sans-serif`;
  }
  return s;
}

/* ---------------- the hub material ---------------- */

/**
 * Lambert, vertex colors, flat shading, plus the near-lens dissolve every walk prop has and a
 * dithered cutaway along the line from the camera to the walker (uHubOcc), when the engine says
 * the building hides them.
 */
function hubMaterial(nearFade: { value: THREE.Vector2 }, occ: { value: THREE.Vector4 }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNearFade = nearFade;
    shader.uniforms.uHubOcc = occ;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHubWorld;\nvarying float vNearDist;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvNearDist = length(mvPosition.xyz);\nvHubWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec2 uNearFade;\nuniform vec4 uHubOcc;\nvarying vec3 vHubWorld;\nvarying float vNearDist;").replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      {
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (vNearDist < uNearFade.y && smoothstep(uNearFade.x, uNearFade.y, vNearDist) < n) discard;
        if (uHubOcc.w > 0.0) {
          vec3 ab = uHubOcc.xyz - cameraPosition;
          vec3 ap = vHubWorld - cameraPosition;
          float t = dot(ap, ab) / max(dot(ab, ab), 1e-4);
          if (t > 0.0 && t < 1.0) {
            float r = uHubOcc.w * mix(0.3, 1.0, t);
            if (smoothstep(r * 0.5, r, length(ap - ab * t)) < n) discard;
          }
        }
      }`,
    );
  };
  m.customProgramCacheKey = () => "walk-hub";
  return m;
}

/** Like paint(), but each vertex colored by the direction its face points (top or side). */
function paintFaces(geometry: THREE.BufferGeometry, side: THREE.Color, top: THREE.Color): THREE.BufferGeometry {
  const g = paint(geometry, side);
  const nrm = g.attributes.normal;
  const col = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (nrm.getY(i) > 0.5) col.setXYZ(i, top.r, top.g, top.b);
  return g;
}

export function buildHub(p: ScenePalette, own: Own, nearFade: { value: THREE.Vector2 }): HubBuild {
  const group = new THREE.Group();
  group.name = "hub";
  group.position.set(HUB_CENTER.x, 0, HUB_CENTER.z);
  group.rotation.y = HUB_ROT;
  const parts: THREE.BufferGeometry[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, side: THREE.Color, top = side) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(paintFaces(g, side, top));
  };

  const accent = new THREE.Color(SITE.theme.accent);
  const wall = mix(p.paint, p.roofWhite, 0.4);
  const roof = mix(p.coping, p.membrane, 0.5);
  const glass = mix(p.glass, p.skyTop, 0.22);
  const frame = mix(p.fascia, p.ink, 0.3);
  const H = HUB.hall;
  const U = HUB.upper;
  const G = HUB.glass;
  const C = HUB.canopy;
  const P = HUB.plinth;

  /* ----- the plinth and its front steps ----- */
  box(P.x0, P.x1, 0, P.h, P.z0, P.z1, p.concrete, mix(p.concrete, p.plaza, 0.35));

  /* ----- the hall: a light core, glazed on every face between corner piers ----- */
  box(H.x0 + 0.5, H.x1 - 0.5, P.h, H.deck, H.z0 + 0.5, H.z1 - 0.5, glass, roof);
  // Corner piers.
  for (const [x, z] of [[H.x0, H.z0], [H.x1 - 1.2, H.z0], [H.x0, H.z1 - 1.2], [H.x1 - 1.2, H.z1 - 1.2]] as const) box(x, x + 1.2, P.h, H.deck, z, z + 1.2, wall);
  // The floor slab line and the roof slab, proud of the glass.
  box(H.x0, H.x1, H.deck - 0.55, H.deck, H.z0, H.z1, wall, roof);
  box(H.x0, H.x1, P.h, G.y0, H.z0, H.z1, wall);
  // Mullions on the long faces and the ends.
  for (let x = G.x0 + 2.3; x < G.x1 - 0.5; x += 2.3) {
    box(x - 0.07, x + 0.07, G.y0, H.deck - 0.55, H.z1 - 0.55, H.z1 - 0.4, frame);
    box(x - 0.07, x + 0.07, G.y0, H.deck - 0.55, H.z0 + 0.4, H.z0 + 0.55, frame);
  }
  for (let z = H.z0 + 2.4; z < H.z1 - 1.2; z += 2.4) {
    box(H.x0 + 0.4, H.x0 + 0.55, G.y0, H.deck - 0.55, z - 0.07, z + 0.07, frame);
    box(H.x1 - 0.55, H.x1 - 0.4, G.y0, H.deck - 0.55, z - 0.07, z + 0.07, frame);
  }
  // A transom line across the glass.
  box(G.x0, G.x1, 4.55, 4.7, H.z1 - 0.55, H.z1 - 0.4, frame);
  // The doors under the canopy: darker glass in a frame.
  const D = HUB.doors;
  box(D.x0 - 0.15, D.x1 + 0.15, P.h, P.h + D.h + 0.15, H.z1 - 0.45, H.z1 - 0.3, frame);
  box(D.x0, D.x1, P.h, P.h + D.h, H.z1 - 0.32, H.z1 - 0.22, mix(p.glass, p.ink, 0.4));
  // The parapet and, under its coping, the accent band.
  const T = 0.32;
  for (const [x0, x1, z0, z1] of [
    [H.x0, H.x1, H.z0, H.z0 + T],
    [H.x0, H.x1, H.z1 - T, H.z1],
    [H.x0, H.x0 + T, H.z0, H.z1],
    [H.x1 - T, H.x1, H.z0, H.z1],
  ] as const) {
    box(x0, x1, H.deck, H.parapet - 0.1, z0, z1, accent);
    box(x0 - 0.04, x1 + 0.04, H.parapet - 0.1, H.parapet, z0 - 0.04, z1 + 0.04, p.coping);
  }

  /* ----- the upper volume: solid walls with a ribbon window ----- */
  box(U.x0, U.x1, H.deck, U.deck, U.z0, U.z1, wall, roof);
  box(U.x0 + 0.6, U.x1 - 0.6, H.deck + 1.0, U.deck - 1.0, U.z1 - 0.02, U.z1 + 0.06, glass);
  box(U.x0 - 0.02, U.x0 + 0.06, H.deck + 1.0, U.deck - 1.0, U.z0 + 0.6, U.z1 - 0.6, glass);
  box(U.x1 - 0.06, U.x1 + 0.02, H.deck + 1.0, U.deck - 1.0, U.z0 + 0.6, U.z1 - 0.6, glass);
  box(U.x0 - 0.05, U.x1 + 0.05, U.deck, U.parapet, U.z0 - 0.05, U.z1 + 0.05, p.coping, roof);

  /* ----- the canopy over the entrance, on two posts ----- */
  box(C.x0, C.x1, C.y, C.top, H.z1, C.z1, frame, mix(p.roofWhite, p.coping, 0.3));
  for (const post of C.posts) parts.push(paint(new THREE.CylinderGeometry(C.r, C.r, C.y - P.h, 10).translate(post.x, P.h + (C.y - P.h) / 2, post.z), frame));

  /* ----- planters with low planting ----- */
  for (const pl of HUB.planters) {
    box(pl.x0, pl.x1, 0, pl.h, pl.z0, pl.z1, p.concrete, p.mulch);
    for (let x = pl.x0 + 0.6; x < pl.x1 - 0.3; x += 0.9) parts.push(paint(new THREE.IcosahedronGeometry(0.42, 0).translate(x, pl.h + 0.25, (pl.z0 + pl.z1) / 2), x % 1.8 < 0.9 ? p.tree : p.treeDark));
  }

  /* ----- the beacon's pole (static; the sign head turns, see below) ----- */
  const bc = HUB.beacon;
  box(bc.x - 0.7, bc.x + 0.7, U.parapet, U.parapet + 0.45, bc.z - 0.7, bc.z + 0.7, p.concrete);
  parts.push(paint(new THREE.CylinderGeometry(0.38, 0.46, bc.bottom - 0.2 - (U.parapet + 0.45), 12).translate(bc.x, (U.parapet + 0.45 + bc.bottom - 0.2) / 2, bc.z), p.ink));

  /* ----- one merged mesh ----- */
  const occluder = { value: new THREE.Vector4(0, 0, 0, 0) };
  const hubMat = own(hubMaterial(nearFade, occluder));
  const mesh = new THREE.Mesh(own(merge(parts)), hubMat);
  parts.length = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "hub-building";
  group.add(mesh);

  /* ----- signage: one canvas atlas (the beacon's face; the hub's name for the fascia) ----- */
  const [atlas, atlasCtx] = cpuCanvas(ATLAS_W, ATLAS_H);
  const atlasTex = own(canvasTexture(atlas));
  atlasTex.anisotropy = 8;
  const css = (c: THREE.Color) => `#${c.getHexString()}`;
  let disposed = false;
  const paintAtlas = (logo: HTMLImageElement | null) => {
    const ctx = atlasCtx;
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
    // The beacon's light face, an accent keyline inside the edge, and the logo or the name.
    ctx.fillStyle = css(p.signPanel);
    ctx.fillRect(FACE.x, FACE.y, FACE.w, FACE.h);
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = 10;
    ctx.strokeRect(FACE.x + 18, FACE.y + 18, FACE.w - 36, FACE.h - 36);
    const boxW = FACE.w * 0.8;
    const boxH = FACE.h * 0.62;
    if (logo && logo.naturalWidth > 0) {
      const k = Math.min(boxW / logo.naturalWidth, boxH / logo.naturalHeight);
      const w = logo.naturalWidth * k;
      const h = logo.naturalHeight * k;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(logo, FACE.x + (FACE.w - w) / 2, FACE.y + (FACE.h - h) / 2, w, h);
    } else {
      ctx.fillStyle = css(p.ink);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitFont(ctx, SITE.org.name, boxW, Math.round(boxH * 0.6));
      ctx.fillText(SITE.org.name, FACE.x + FACE.w / 2, FACE.y + FACE.h / 2 + 4);
    }
    // The hub's name, for the canopy fascia.
    ctx.fillStyle = css(p.signPanel);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, L.hub, NAME.w - 40, 64);
    ctx.fillText(L.hub, NAME.x + NAME.w / 2, NAME.y + NAME.h / 2 + 2);
    atlasTex.needsUpdate = true;
  };
  paintAtlas(null);
  const fonts = document.fonts?.ready ?? Promise.resolve();
  const src = siteFile(SITE.org.logo);
  const logoImg = src ? new Image() : null;
  if (logoImg && src) {
    logoImg.decoding = "async";
    logoImg.onload = () => fonts.then(() => !disposed && paintAtlas(logoImg));
    logoImg.src = src;
  }
  fonts.then(() => !disposed && paintAtlas(logoImg?.complete ? logoImg : null));

  // Unlit (legible in any light), and dissolving when the camera passes close by.
  const signMat = own(
    withNearFade(new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), nearFade),
  );
  {
    // The hub's name across the canopy's front edge.
    const w = C.x1 - C.x0 - 0.6;
    const h = w * (NAME.h / NAME.w);
    const fascia = atlasPlane(w, Math.min(h, (C.top - C.y) * 2.6), uvRect(NAME, 2)).translate((C.x0 + C.x1) / 2, C.top + 0.42, C.z1 + 0.02);
    const signs = new THREE.Mesh(own(fascia), signMat);
    signs.name = "hub-signs";
    group.add(signs);
    // A backing strip so the light letters read against the sky.
    const back = new THREE.Mesh(own(new THREE.BoxGeometry(w + 0.3, 0.8, 0.12).translate((C.x0 + C.x1) / 2, C.top + 0.42, C.z1 - 0.06)), own(new THREE.MeshLambertMaterial({ color: mix(p.ink, accent, 0.25) })));
    group.add(back);
  }

  /* ----- the beacon's sign head (world space; turns to the camera like the district medallions) ----- */
  const beacon = hubBeacon();
  const beaconHead = new THREE.Group();
  // The follow camera rises over the roof when the building hides the walker, and can pass right by
  // the sign: it dissolves over a wider band than other props (gone within 8, whole beyond 16).
  const beaconFade = { value: new THREE.Vector2(8, 16) };
  beaconHead.name = "hub-beacon";
  beaconHead.position.set(beacon.x, 0, beacon.z);
  {
    const w = bc.w;
    const h = bc.h;
    const yc = (bc.bottom + bc.top) / 2;
    const frameParts = [
      paint(new THREE.BoxGeometry(w + 0.36, h + 0.36, 0.34).translate(0, yc, 0), p.ink),
      paint(new THREE.BoxGeometry(2.4, 0.34, 0.6).translate(0, bc.bottom - 0.2, 0), p.ink),
    ];
    const frameMesh = new THREE.Mesh(own(merge(frameParts)), own(withNearFade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), beaconFade)));
    frameMesh.castShadow = false;
    frameMesh.receiveShadow = true;
    const faceUV = uvRect(FACE, 1);
    const front = atlasPlane(w, h, faceUV).translate(0, yc, 0.175);
    const back = atlasPlane(w, h, faceUV).rotateY(Math.PI).translate(0, yc, -0.175);
    const faceGeo = own(mergeUV([front, back]));
    const faceMat = new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const faces = new THREE.Mesh(faceGeo, own(withNearFade(faceMat, beaconFade)));
    beaconHead.add(frameMesh, faces);
  }

  function update(cameraYaw: number) {
    beaconHead.rotation.y = cameraYaw;
  }

  function dispose() {
    disposed = true;
    if (logoImg) logoImg.onload = null;
  }

  return { group, beaconHead, colliders: hubColliders(), boxes: hubBoxes(), blockers: hubBlockers(), hubTop: HUB_TOP, beacon, occluder, update, dispose };
}

/** Merge indexed planes into one geometry, keeping their UVs (for the two faces of the beacon sign). */
function mergeUV(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const pa = g.attributes.position;
    const ua = g.attributes.uv;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      uv.push(ua.getX(i), ua.getY(i));
    }
    const ia = g.index!;
    for (let i = 0; i < ia.count; i++) idx.push(base + ia.getX(i));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/**
 * Paint the hub's ground onto the plaza canvas: a paved forecourt around the plinth with scored
 * joints, and a path from the entrance toward the spawn. `ctx` is already in world units (x right,
 * z down).
 */
export function drawHubGround(ctx: CanvasRenderingContext2D, p: ScenePalette, pxPerUnit: number) {
  const css = (c: THREE.Color) => `#${c.getHexString()}`;
  const P = HUB.plinth;
  ctx.save();
  ctx.translate(HUB_CENTER.x, HUB_CENTER.z);
  ctx.rotate(-HUB_ROT);
  const walk = mix(p.concrete, p.plaza, 0.55);
  const joint = mix(p.concrete, p.rock, 0.5);
  const x0 = P.x0 - 3;
  const x1 = P.x1 + 3;
  const z0 = P.z0 - 3;
  const z1 = HUB.canopy.z1 + 3;
  ctx.fillStyle = css(walk);
  ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  ctx.strokeStyle = css(joint);
  ctx.lineWidth = 1.2 / pxPerUnit;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 0.01; x += 1.5) {
    ctx.moveTo(x, z0);
    ctx.lineTo(x, z1);
  }
  for (let z = z0; z <= z1 + 0.01; z += 1.5) {
    ctx.moveTo(x0, z);
    ctx.lineTo(x1, z);
  }
  ctx.stroke();
  ctx.strokeStyle = css(mix(p.concrete, p.rock, 0.7));
  ctx.lineWidth = 2.2 / pxPerUnit;
  ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
  // The path from the doors toward the spawn.
  const d = HUB.doors;
  ctx.fillStyle = css(mix(walk, p.sand, 0.25));
  ctx.fillRect(d.x0 - 0.6, z1, d.x1 - d.x0 + 1.2, 18);
  ctx.restore();
}
