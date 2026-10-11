// @ts-nocheck
// Our own map props in the town's style: flat-shaded Lambert solids in the town
// palette (stone, wood, bronze, cream) plus canvas-painted boards, graded by the
// same sun, shadows and LUT as everything else. Nothing here is a forced fit:
// each piece serves the map — district pavilions anchor the neighborhoods,
// market stalls give the village ring life, fingerposts and the spawn totem tell
// you what's where, beacons mark districts across the island, bunting dresses
// the plaza. Collision boxes are returned alongside for the BVH collider.

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  AdditiveBlending,
  Float32BufferAttribute,
} from 'three';
import { labelTexture } from '../three/logoTexture';
import { cpuCanvas } from '../three/cpuCanvas';

const lambert = (color: string | number) => new MeshLambertMaterial({ color, flatShading: true });
const WOOD = '#6e5138';
const WOOD_DARK = '#54402c';
const STONE = '#cfc0a0';
const STONE_DARK = '#a89a7c';
const BRONZE = '#8a6a3a';
const CREAM = '#f3e8cf';
const INK = '#3a352c';

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
  /** Per-frame update (beacons, curtains); receives seconds. */
  update?: (time: number, camX: number, camZ: number) => void;
}

/** District pavilion: stone platform, six wooden posts, district-colored roof, hanging board. */
export function buildPavilion(color: string, name: string, boardFacing: number): PropBuild {
  const g = new Group();
  add(g, shadowed(new Mesh(new CylinderGeometry(4.2, 4.5, 0.35, 18), lambert(STONE_DARK))), 0, 0.17, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(g, shadowed(new Mesh(new CylinderGeometry(0.16, 0.2, 3.4, 7), lambert(WOOD))), Math.cos(a) * 3.4, 2.05, Math.sin(a) * 3.4);
  }
  add(g, shadowed(new Mesh(new CylinderGeometry(3.9, 3.9, 0.3, 18), lambert(WOOD_DARK))), 0, 3.9, 0);
  add(g, shadowed(new Mesh(new ConeGeometry(5.0, 2.0, 6), lambert(color))), 0, 5.05, 0).rotation.y = Math.PI / 6;
  add(g, shadowed(new Mesh(new SphereGeometry(0.35, 8, 6), lambert(BRONZE))), 0, 6.25, 0);
  const board = labelTexture(name, { bg: CREAM, color: INK, size: 60, weight: 600 });
  const bw = 3.4;
  const mesh = new Mesh(
    new PlaneGeometry(bw, bw / board.aspect),
    new MeshBasicMaterial({ map: srgb(board.texture), transparent: true, toneMapped: false, side: DoubleSide }),
  );
  mesh.position.set(Math.sin(boardFacing) * 3.35, 2.9, Math.cos(boardFacing) * 3.35);
  mesh.rotation.y = boardFacing;
  g.add(mesh);
  return { group: g, colliders: [{ w: 7, h: 4.5, d: 7, x: 0, z: 0, ry: 0 }] };
}

/** Market stall: posts, striped awning, counter, crates. Faces local +z. */
export function buildStall(color: string): PropBuild {
  const g = new Group();
  for (const [x, z, h] of [[-1.4, -1, 2.6], [1.4, -1, 2.6], [-1.4, 1, 2.2], [1.4, 1, 2.2]] as Array<[number, number, number]>) {
    add(g, shadowed(new Mesh(new CylinderGeometry(0.09, 0.11, h, 6), lambert(WOOD))), x, h / 2, z);
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

/** Painted arm board (both faces readable). */
function armBoard(text: string, bg: string, w = 2.6): Group {
  const badge = labelTexture(text, { bg, color: '#ffffff', size: 54, weight: 600 });
  const geo = new PlaneGeometry(w, w / badge.aspect);
  const mat = new MeshBasicMaterial({ map: srgb(badge.texture), transparent: true, toneMapped: false });
  const grp = new Group();
  const f = new Mesh(geo, mat);
  const b = new Mesh(geo, mat);
  b.rotation.y = Math.PI;
  b.position.z = -0.03;
  f.position.z = 0.03;
  grp.add(f, b);
  const holder = new Group();
  holder.add(grp);
  return holder;
}

/**
 * Fingerpost: one post, one arm per entry. Each arm {text, color, yaw} points
 * its own way; caller computes the yaws. Arms sit 0.75 apart from y=2.9 down.
 */
export function buildFingerpost(arms: Array<{ text: string; color: string; yaw: number }>): PropBuild {
  const g = new Group();
  const top = 2.9 + (arms.length - 1) * 0.75 + 0.3;
  add(g, shadowed(new Mesh(new CylinderGeometry(0.11, 0.14, top, 7), lambert(WOOD))), 0, top / 2, 0);
  add(g, shadowed(new Mesh(new SphereGeometry(0.18, 8, 6), lambert(BRONZE))), 0, top + 0.1, 0);
  arms.forEach((arm, i) => {
    const y = 2.9 + (arms.length - 1 - i) * 0.75;
    const holder = armBoard(arm.text, arm.color);
    holder.position.y = y;
    holder.rotation.y = arm.yaw;
    // Shift the board out along its facing so the post doesn't swallow it.
    holder.translateZ(1.15);
    g.add(holder);
  });
  return { group: g, colliders: [] };
}

/** District beacon: a soft additive light pillar, Y-billboarded, fading near the player. */
export function buildBeacon(color: string): PropBuild {
  const [c, ctx] = cpuCanvas(64, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new CanvasTexture(c);
  const mat = new MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity: 0.32,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(3.2, 15), mat);
  mesh.position.y = 4 + 7.5;
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
      mat.opacity = d < 8 ? 0.05 : 0.32;
    },
  };
}

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
      const p: [number, number, number] = [
        s.ax + (s.bx - s.ax) * t,
        s.ay + (s.by - s.ay) * t - sag,
        s.az + (s.bz - s.az) * t,
      ];
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
