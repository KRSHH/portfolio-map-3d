// @ts-nocheck
// Our own map props in the town's style: flat-shaded Lambert solids in the town palette (stone,
// wood, bronze, cream, and each district's color), with boards painted by labelTexture(), graded
// by the same sun, shadows and LUT as everything else. Sized for the kid (about 1.8 tall): signs
// a kid walks under hang above the follow camera (about 2.7 up), so it never passes through one.
//
// Each piece serves the map: a pavilion at each district's heart (its roof's shape is that
// district's own), an arch where its road arrives, a banner mast that marks it from across the
// island, a fingerpost at each road's mouth, the Walking times board at the arrival, market stalls
// on the ring street, a soft beacon over each district for the far side of the hills, bunting over
// the plaza. Collision boxes come back with each piece for the BVH collider.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
} from 'three';
import { labelTexture } from '../three/logoTexture';
import { cpuCanvas } from '../three/cpuCanvas';
import { inkOn } from './mapLabels';

const WOOD = '#6e5138';
const WOOD_DARK = '#54402c';
const STONE = '#cfc0a0';
const STONE_DARK = '#a89a7c';
const BRONZE = '#8a6a3a';
const CREAM = '#f3e8cf';
const INK = '#3a352c';
/** The ink for type on a district's color: the site's ink or white, whichever reads better (3:1 or more at board sizes). */
const DEEP_INK = '#1d1f24';

/** One material per color, shared by every prop. */
const lamberts = new Map<string, MeshLambertMaterial>();
const lambert = (color: string) => {
  let m = lamberts.get(color);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true });
    lamberts.set(color, m);
  }
  return m;
};
/**
 * A district-colored surface that keeps its color in shade: lit like everything else, plus a little
 * of its own color (a banner is cloth the light comes through; a roof seen from its shady side).
 */
const tints = new Map<string, MeshLambertMaterial>();
const tinted = (color: string, glow: number, side = 0) => {
  const key = `${color}|${glow}|${side}`;
  let m = tints.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: glow, side });
    tints.set(key, m);
  }
  return m;
};
const cloth = (color: string) => tinted(color, 0.3, DoubleSide);

/** Canvas textures are sRGB art; flag them so the r148 renderer decodes them. */
function srgb<T>(tex: T): T {
  (tex as any).encoding = 3001;
  return tex;
}
const shadowed = <T extends Mesh>(m: T): T => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const add = (parent: Object3D, child: Object3D, x = 0, y = 0, z = 0) => {
  child.position.set(x, y, z);
  parent.add(child);
  return child;
};

export interface PropBuild {
  group: Group;
  /** Collision boxes in the prop's local frame (y from its base). */
  colliders: Array<{ w: number; h: number; d: number; x: number; z: number; ry: number }>;
  /** Per-frame update; receives seconds and the camera's ground position. */
  update?: (time: number, camX: number, camZ: number) => void;
}

/**
 * A painted board readable from both faces: `text` on a pill `width` wide, its type in `ink` on `bg`.
 * Its front faces local +z.
 */
function board(text: string, width: number, bg: string, ink: string, size = 56, depth = 0.02): Group {
  const label = labelTexture(text, { bg, color: ink, size, weight: 650 });
  const geo = new PlaneGeometry(width, width / label.aspect);
  const mat = new MeshBasicMaterial({ map: srgb(label.texture), transparent: true, toneMapped: false });
  const front = new Mesh(geo, mat);
  const back = new Mesh(geo, mat);
  back.rotation.y = Math.PI;
  front.position.z = depth;
  back.position.z = -depth;
  const g = new Group();
  g.add(front, back);
  g.userData.height = width / label.aspect;
  return g;
}

/* ---------------- district pavilion ---------------- */

/** How many roof shapes there are; a district's index picks one, so neighbors differ. */
export const ROOF_KINDS = 6;

/** A roof in the district's color, its eave at y 0, under a cream trim. */
function roof(kind: number, color: string): Group {
  const g = new Group();
  const tint = tinted(color, 0.12);
  const trim = (r: number, y = 0) => add(g, shadowed(new Mesh(new CylinderGeometry(r, r, 0.18, 12), lambert(CREAM))), 0, y + 0.09, 0);
  const finial = (y: number) => add(g, shadowed(new Mesh(new SphereGeometry(0.28, 8, 6), lambert(BRONZE))), 0, y, 0);
  switch (((kind % ROOF_KINDS) + ROOF_KINDS) % ROOF_KINDS) {
    case 0: {
      // Six-sided cone.
      trim(3.7);
      add(g, shadowed(new Mesh(new ConeGeometry(4.3, 2.0, 6), tint)), 0, 0.18 + 1.0, 0).rotation.y = Math.PI / 6;
      finial(2.35);
      break;
    }
    case 1: {
      // Two tiers.
      trim(3.7);
      add(g, shadowed(new Mesh(new ConeGeometry(4.4, 1.1, 8), tint)), 0, 0.18 + 0.55, 0);
      add(g, shadowed(new Mesh(new CylinderGeometry(1.5, 1.5, 0.7, 8), lambert(WOOD_DARK))), 0, 1.4, 0);
      add(g, shadowed(new Mesh(new ConeGeometry(2.7, 1.5, 8), tint)), 0, 1.75 + 0.75, 0);
      finial(3.35);
      break;
    }
    case 2: {
      // Dome.
      trim(3.7);
      const dome = new Mesh(new SphereGeometry(3.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), tint);
      dome.scale.y = 0.62;
      add(g, shadowed(dome), 0, 0.18, 0);
      finial(0.18 + 3.7 * 0.62 + 0.2);
      break;
    }
    case 3: {
      // Square hip roof.
      add(g, shadowed(new Mesh(new BoxGeometry(5.6, 0.18, 5.6), lambert(CREAM))), 0, 0.09, 0);
      add(g, shadowed(new Mesh(new ConeGeometry(4.3, 1.7, 4), tint)), 0, 0.18 + 0.85, 0).rotation.y = Math.PI / 4;
      finial(2.05);
      break;
    }
    case 4: {
      // Tall tent with a pennant.
      trim(3.7);
      add(g, shadowed(new Mesh(new ConeGeometry(4.0, 3.2, 10), tint)), 0, 0.18 + 1.6, 0);
      add(g, shadowed(new Mesh(new CylinderGeometry(0.05, 0.05, 1.0, 5), lambert(WOOD_DARK))), 0, 3.38 + 0.5, 0);
      const flag = new Mesh(pennantGeometry(0.9, 0.5), cloth(color));
      add(g, flag, 0.02, 4.1, 0);
      break;
    }
    default: {
      // Drum and spire.
      trim(3.7);
      add(g, shadowed(new Mesh(new ConeGeometry(4.3, 1.1, 8), tint)), 0, 0.18 + 0.55, 0);
      add(g, shadowed(new Mesh(new CylinderGeometry(1.1, 1.1, 1.1, 8), lambert(CREAM))), 0, 1.25 + 0.55, 0);
      add(g, shadowed(new Mesh(new ConeGeometry(1.5, 2.0, 8), tint)), 0, 2.35 + 1.0, 0);
      finial(4.45);
    }
  }
  return g;
}

/**
 * District pavilion: an octagonal stone platform, six slim posts and a roof in the district's color,
 * the roof's shape picked by `roofKind` so neighbors differ. Its name is on the arch and the mast;
 * the kid walks under the roof (only the posts collide).
 */
export function buildPavilion(color: string, roofKind: number): PropBuild {
  const g = new Group();
  add(g, shadowed(new Mesh(new CylinderGeometry(3.6, 3.85, 0.3, 8), lambert(STONE_DARK))), 0, 0.15, 0);
  const colliders: PropBuild['colliders'] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 3.0;
    const z = Math.sin(a) * 3.0;
    add(g, shadowed(new Mesh(new CylinderGeometry(0.12, 0.15, 2.85, 6), lambert(WOOD))), x, 0.3 + 1.42, z);
    colliders.push({ w: 0.4, h: 3, d: 0.4, x, z, ry: 0 });
  }
  add(g, shadowed(new Mesh(new CylinderGeometry(3.3, 3.3, 0.24, 12), lambert(WOOD_DARK))), 0, 3.27, 0);
  const top = roof(roofKind, color);
  top.position.y = 3.39;
  g.add(top);
  return { group: g, colliders };
}

/* ---------------- arch over a district's road ---------------- */

/**
 * The arch where a road reaches a district: two slim posts either side of the road and a beam, with
 * the district's name on its color across the beam (painted, so it reads in sun or shade). The kid
 * and the follow camera pass under it. Faces local +z.
 */
export function buildArch(color: string, name: string): PropBuild {
  const g = new Group();
  const beamY = 3.65;
  for (const x of [-2.7, 2.7]) {
    add(g, shadowed(new Mesh(new BoxGeometry(0.42, 0.28, 0.42), lambert(STONE_DARK))), x, 0.14, 0);
    add(g, shadowed(new Mesh(new CylinderGeometry(0.1, 0.13, beamY + 0.1 - 0.28, 6), lambert(WOOD))), x, 0.28 + (beamY + 0.1 - 0.28) / 2, 0);
    add(g, shadowed(new Mesh(new SphereGeometry(0.15, 8, 6), lambert(BRONZE))), x, beamY + 0.2, 0);
  }
  add(g, shadowed(new Mesh(new BoxGeometry(5.8, 0.2, 0.2), lambert(WOOD_DARK))), 0, beamY, 0);
  const sign = board(name, 2.0, color, inkOn(color, DEEP_INK), 60, 0.13);
  sign.position.y = beamY + 0.05;
  g.add(sign);
  return {
    group: g,
    colliders: [-2.7, 2.7].map((x) => ({ w: 0.4, h: 3.8, d: 0.4, x, z: 0, ry: 0 })),
  };
}

/* ---------------- banner mast ---------------- */

/** A pennant: a long triangle from its hoist (x 0) out to its tip. */
function pennantGeometry(length: number, height: number): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, height / 2);
  s.lineTo(length, 0);
  s.lineTo(0, -height / 2);
  s.closePath();
  return new ShapeGeometry(s);
}

/** A hanging banner with a swallowtail, `w` wide and `h` tall, its top edge at y 0. */
function bannerGeometry(w: number, h: number): ShapeGeometry {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, -h);
  s.lineTo(0, -h + w * 0.28);
  s.lineTo(-w / 2, -h);
  s.closePath();
  return new ShapeGeometry(s);
}

export const MAST_HEIGHT = 12.6;

/**
 * The district's landmark: a tall mast with a banner in its color and its name, and a pennant on
 * top. The banner faces local +z (toward the plaza); it stands out over pins, roofs and the hills
 * between districts. `still` holds the cloth still (reduced motion).
 */
export function buildMast(color: string, name: string, still = false): PropBuild {
  const g = new Group();
  add(g, shadowed(new Mesh(new BoxGeometry(1.5, 0.45, 1.5), lambert(STONE_DARK))), 0, 0.22, 0);
  add(g, shadowed(new Mesh(new BoxGeometry(1.05, 0.4, 1.05), lambert(STONE))), 0, 0.65, 0);
  add(g, shadowed(new Mesh(new CylinderGeometry(0.12, 0.2, MAST_HEIGHT - 0.85, 7), lambert(WOOD))), 0, 0.85 + (MAST_HEIGHT - 0.85) / 2, 0);
  add(g, shadowed(new Mesh(new BoxGeometry(3.8, 0.16, 0.16), lambert(WOOD_DARK))), 0, MAST_HEIGHT - 1.1, 0.22);
  add(g, shadowed(new Mesh(new SphereGeometry(0.24, 8, 6), lambert(BRONZE))), 0, MAST_HEIGHT + 0.1, 0);
  // The banner hangs from the crossbar, in front of the pole, with the name on both faces.
  const banner = new Group();
  banner.position.set(0, MAST_HEIGHT - 1.2, 0.3);
  g.add(banner);
  const cloth0 = shadowed(new Mesh(bannerGeometry(3.4, 5.2), cloth(color)));
  banner.add(cloth0);
  const sign = board(name, 2.9, color, inkOn(color, DEEP_INK), 64);
  sign.position.set(0, -1.15, 0);
  banner.add(sign);
  const stripe = new Mesh(new PlaneGeometry(3.4, 0.16), new MeshBasicMaterial({ color: CREAM, side: DoubleSide, toneMapped: false }));
  stripe.position.set(0, -0.18, 0.01);
  banner.add(stripe);
  const pennant = new Mesh(pennantGeometry(1.6, 0.75), cloth(color));
  pennant.position.set(0.06, MAST_HEIGHT - 0.25, 0);
  g.add(pennant);
  const phase = (name.length * 1.7) % 6.28;
  return {
    group: g,
    colliders: [{ w: 1.5, h: 2.2, d: 1.5, x: 0, z: 0, ry: 0 }],
    update: still
      ? undefined
      : (time) => {
          pennant.rotation.y = Math.sin(time * 1.6 + phase) * 0.35;
          banner.rotation.x = Math.sin(time * 1.1 + phase) * 0.035;
        },
  };
}

/* ---------------- fingerpost ---------------- */

/** A fingerpost's pointed tip: a flat triangle pointing +x. */
function tipGeometry(): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0.19);
  s.lineTo(0.3, 0);
  s.lineTo(0, -0.19);
  s.closePath();
  return new ShapeGeometry(s);
}

/** A flat arrow pointing +y, for the Walking times board. */
function arrowGeometry(): ShapeGeometry {
  const s = new Shape();
  s.moveTo(-0.035, -0.13);
  s.lineTo(0.035, -0.13);
  s.lineTo(0.035, 0.02);
  s.lineTo(0.11, 0.02);
  s.lineTo(0, 0.14);
  s.lineTo(-0.11, 0.02);
  s.lineTo(-0.035, 0.02);
  s.closePath();
  return new ShapeGeometry(s);
}

/**
 * One slim post with one arm, kid height: `text` on the district's color, the board facing local +z
 * (turn the group to face the reader) and its pointed end out along local +x, the reader's right.
 */
export function buildFingerpost(text: string, color: string): PropBuild {
  const g = new Group();
  add(g, shadowed(new Mesh(new CylinderGeometry(0.075, 0.1, 2.55, 6), lambert(WOOD))), 0, 1.27, 0);
  add(g, shadowed(new Mesh(new SphereGeometry(0.12, 8, 6), lambert(BRONZE))), 0, 2.6, 0);
  const arm = board(text, 1.75, color, inkOn(color, DEEP_INK), 52);
  arm.position.set(0.97, 2.15, 0);
  g.add(arm);
  // A pointed tip at its outer end.
  add(g, new Mesh(tipGeometry(), cloth(color)), 1.84, 2.15, 0);
  return { group: g, colliders: [{ w: 0.3, h: 2.6, d: 0.3, x: 0, z: 0, ry: 0 }] };
}

/* ---------------- the Walking times board ---------------- */

/**
 * The Walking times board at the arrival: a low lectern, its face tilted back toward the reader and
 * kept below the follow camera's eye, so the districts beyond stay in view over it. A title, then
 * one row per district (its name and time on foot on its color, an arrow pointing the way it lies
 * for the reader); one column up to four rows, two beyond. Faces local +z.
 */
export function buildBoard(title: string, rows: Array<{ text: string; color: string; bearing: number }>): PropBuild {
  const g = new Group();
  const cols = rows.length > 4 ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const step = 0.3;
  const rowH = 0.24;
  const colW = 1.75;
  const panelW = cols * colW + 0.3;
  const panelH = per * step + 0.55;
  const tilt = 0.45;
  const bottom = 0.55;
  // Legs, then the panel leaning back on them.
  for (const x of [-panelW / 2 + 0.2, panelW / 2 - 0.2]) {
    add(g, shadowed(new Mesh(new BoxGeometry(0.12, bottom + 0.3, 0.12), lambert(WOOD))), x, (bottom + 0.3) / 2, -0.15);
  }
  const face = new Group();
  face.position.set(0, bottom, 0);
  face.rotation.x = -tilt;
  g.add(face);
  add(face, shadowed(new Mesh(new BoxGeometry(panelW + 0.16, panelH + 0.16, 0.08), lambert(WOOD))), 0, panelH / 2, -0.06);
  add(face, shadowed(new Mesh(new BoxGeometry(panelW, panelH, 0.04), lambert(CREAM))), 0, panelH / 2, 0);
  const head = labelTexture(title, { color: INK, size: 56, weight: 700 });
  const headH = 0.26;
  add(face, new Mesh(new PlaneGeometry(headH * head.aspect, headH), new MeshBasicMaterial({ map: srgb(head.texture), transparent: true, toneMapped: false })), 0, panelH - 0.2, 0.03);
  const arrowGeo = arrowGeometry();
  const arrowMat = new MeshBasicMaterial({ color: INK, side: DoubleSide, toneMapped: false });
  rows.forEach((row, i) => {
    const col = Math.floor(i / per);
    const k = i % per;
    const x0 = -panelW / 2 + 0.15 + col * colW;
    const y = panelH - 0.5 - k * step;
    const label = labelTexture(row.text, { bg: row.color, color: inkOn(row.color, DEEP_INK), size: 52, weight: 650 });
    const w = Math.min(colW - 0.4, rowH * label.aspect);
    add(face, new Mesh(new PlaneGeometry(w, w / label.aspect), new MeshBasicMaterial({ map: srgb(label.texture), transparent: true, toneMapped: false })), x0 + 0.32 + w / 2, y, 0.03);
    // The arrow: up the board is straight on, tilted the way the district lies.
    const arrow = new Mesh(arrowGeo, arrowMat);
    arrow.scale.setScalar(0.8);
    arrow.rotation.z = -row.bearing;
    add(face, arrow, x0 + 0.12, y, 0.03);
  });
  return { group: g, colliders: [{ w: panelW, h: bottom + panelH * Math.cos(tilt), d: 0.9, x: 0, z: -0.2, ry: 0 }] };
}

/* ---------------- market stall ---------------- */

/** Market stall: posts, striped awning, counter, crates. Faces local +z. */
export function buildStall(color: string): PropBuild {
  const g = new Group();
  for (const [x, z, h] of [[-1.4, -1, 2.6], [1.4, -1, 2.6], [-1.4, 1, 2.2], [1.4, 1, 2.2]] as Array<[number, number, number]>) {
    add(g, shadowed(new Mesh(new CylinderGeometry(0.08, 0.1, h, 6), lambert(WOOD))), x, h / 2, z);
  }
  const [ac, actx] = cpuCanvas(256, 128);
  for (let i = 0; i < 8; i++) {
    actx.fillStyle = i % 2 ? '#f7f1e2' : color;
    actx.fillRect((i * 256) / 8, 0, 256 / 8 + 1, 128);
  }
  actx.fillStyle = 'rgba(90,70,50,0.25)';
  actx.fillRect(0, 108, 256, 20);
  const awning = new Mesh(new PlaneGeometry(3.6, 1.9), new MeshLambertMaterial({ map: srgb(new CanvasTexture(ac)), flatShading: true, side: DoubleSide }));
  awning.rotation.x = -0.35;
  add(g, shadowed(awning), 0, 2.55, 0.1);
  add(g, shadowed(new Mesh(new BoxGeometry(2.8, 0.9, 1.2), lambert(WOOD_DARK))), 0, 0.45, 0.3);
  add(g, shadowed(new Mesh(new BoxGeometry(2.9, 0.12, 1.3), lambert(WOOD))), 0, 0.96, 0.3);
  add(g, shadowed(new Mesh(new BoxGeometry(0.7, 0.7, 0.7), lambert(WOOD))), -0.6, 0.35, -0.9);
  add(g, shadowed(new Mesh(new BoxGeometry(0.55, 0.55, 0.55), lambert(WOOD_DARK))), 0.15, 0.28, -0.95);
  add(g, shadowed(new Mesh(new BoxGeometry(0.6, 0.5, 0.6), lambert('#7a9a4e'))), 0.9, 1.25, 0.3);
  return { group: g, colliders: [{ w: 3, h: 2.6, d: 2.6, x: 0, z: 0, ry: 0 }] };
}

/* ---------------- beacon ---------------- */

/**
 * District beacon: a soft additive light pillar over the pavilion, turned to the camera. It shows
 * from far off (over the hills) and fades out as the camera comes near, where the mast takes over.
 */
export function buildBeacon(color: string): PropBuild {
  const [c, ctx] = cpuCanvas(64, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new CanvasTexture(c);
  const mat = new MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const H = 26;
  const mesh = new Mesh(new PlaneGeometry(2.4, H), mat);
  mesh.position.y = 8 + H / 2;
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const g = new Group();
  g.add(mesh);
  return {
    group: g,
    colliders: [],
    update: (_time, camX, camZ) => {
      mesh.rotation.y = Math.atan2(camX - g.position.x, camZ - g.position.z);
      const d = Math.hypot(camX - g.position.x, camZ - g.position.z);
      const t = Math.min(1, Math.max(0, (d - 30) / 60));
      mat.opacity = 0.26 * t * t * (3 - 2 * t);
      mesh.visible = mat.opacity > 0.005;
    },
  };
}

/* ---------------- bunting ---------------- */

/** Bunting spans between lamp tops: rope lines + instanced color flags. */
export function buildBunting(spans: Array<{ ax: number; ay: number; az: number; bx: number; by: number; bz: number }>, colors: string[]): PropBuild {
  const g = new Group();
  const ropePts: number[] = [];
  const flagMats: number[][] = [];
  const rand = (() => {
    let a = 99;
    return () => {
      a = (a * 16807) % 2147483647;
      return (a - 1) / 2147483646;
    };
  })();
  for (const s of spans) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const n = Math.max(4, Math.round(len / 1.2));
    let prev: [number, number, number] | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sag = Math.sin(t * Math.PI) * Math.min(2.2, len * 0.06);
      const p: [number, number, number] = [s.ax + (s.bx - s.ax) * t, s.ay + (s.by - s.ay) * t - sag, s.az + (s.bz - s.az) * t];
      if (prev) ropePts.push(...prev, ...p);
      prev = p;
      if (i > 0 && i < n) flagMats.push([...p, rand()]);
    }
  }
  const ropeGeo = new BufferGeometry();
  ropeGeo.setAttribute('position', new Float32BufferAttribute(ropePts, 3));
  g.add(new Line(ropeGeo, new LineBasicMaterial({ color: '#e8dcc2' })));
  if (flagMats.length) {
    const flags = new InstancedMesh(new PlaneGeometry(0.55, 0.75), new MeshLambertMaterial({ side: DoubleSide, flatShading: true }), flagMats.length);
    const dummy = new Object3D();
    const col = new Color();
    flagMats.forEach(([x, y, z, r], i) => {
      dummy.position.set(x, y - 0.38, z);
      dummy.rotation.set(0, r * Math.PI, 0);
      dummy.updateMatrix();
      flags.setMatrixAt(i, dummy.matrix);
      flags.setColorAt(i, col.set(colors[i % colors.length]));
    });
    flags.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    flags.frustumCulled = false;
    g.add(flags);
  }
  return { group: g, colliders: [] };
}
