// @ts-nocheck
// The map's world inside the SummerTime engine: an island generated from the map's own data.
//
// NOT the baked SummerTime town. One plan (mapLayout.ts, worked out from src/data/layout.ts and
// the kid's scale) says where everything stands; mapGround.ts gives the ground's height there.
// This file builds it: the terrain mesh and its painted texture, the sea around it, the scattered
// town models (trees, bushes, rocks, grass, palms, lamp posts), our props from mapProps.ts
// (pavilions, arches, masts, fingerposts, the Walking times board, stalls, beacons, bunting), the
// set pieces round the rim (mapPieces.ts), the beach props and critters, a BVH collider (terrain +
// prop boxes), the kid with the town's controls, camera and sound, and the map overlay
// (mapOverlay.ts: monument, portal, pins, HUD).

import {
  AnimationMixer,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  HemisphereLight,
  InstancedBufferAttribute,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Spherical,
  Vector3,
} from 'three';
import { gsap } from 'gsap';
import { COMPANIES, DISTRICTS, PEOPLE } from '../data/catalog';
import { layoutWorld, seededRandom } from '../data/layout';
import { L } from '../site';
import { GROUND_COLORS, SEA_Y, beachSpots, coveSand, hillSide, islandHeight, scatter, seaSound } from './mapGround';
import { CAMERA, DISTRICT_PAVING, MONUMENT_PAD, ROAD_W, kidTheta, planFromLayout, type MapPlan } from './mapLayout';
import { ROOF_KINDS, buildArch, buildBeacon, buildBoard, buildBunting, buildFingerpost, buildMast, buildPavilion, buildStall } from './mapProps';
import { client } from './core/client';
import { events } from './core/events';
import { clock } from './engine/clock';
import { AudioController } from './engine/audio';
import { Characters } from './engine/characters';
import { BaseScene } from './engine/scene';
import { FollowSunLight } from './engine/sunlight';
import { geometryLoader } from './engine/loaders/geometries';
import { createInstancedGeometry } from './engine/loaders/instancing';
import { depthCharsMaterial, phongMaterial } from './scene/materials';
import { makeInstanced } from './scene/helpers';
import { Sky } from './scene/sky';
import { Sea } from './scene/sea';
import { buildMapOverlay } from './mapOverlay';
import { buildPieces } from './mapPieces';
import { cpuCanvas } from '../three/cpuCanvas';

/** The people area's color on the island and in the HUD (never a district's). */
export const PEOPLE_COLOR = '#8a8f98';
const TEX = 2048;

/** Paint the island's ground: sea bed, sand, grass and hills, the plaza and its paths, the ring street, the roads, the district pavings. */
function paintGround(plan: MapPlan, extent: number): HTMLCanvasElement {
  const [canvas, ctx] = cpuCanvas(TEX, TEX);
  const px = TEX / (extent * 2);
  const w = (v: number) => (v + extent) * px;
  const C = GROUND_COLORS;
  const rand = seededRandom(7);
  const disc = (x: number, z: number, r: number) => {
    ctx.beginPath();
    ctx.arc(w(x), w(z), Math.max(0, r * px), 0, Math.PI * 2);
  };
  const { land, water } = plan.island;
  ctx.fillStyle = C.seabed;
  ctx.fillRect(0, 0, TEX, TEX);
  disc(0, 0, water + 4);
  ctx.fillStyle = C.sand;
  ctx.fill();
  ctx.strokeStyle = C.wetSand;
  ctx.lineWidth = 4 * px;
  disc(0, 0, water - 1);
  ctx.stroke();
  disc(0, 0, land);
  ctx.fillStyle = C.grass;
  ctx.fill();
  // Mottled grass, inside the shore.
  ctx.save();
  disc(0, 0, land - 1);
  ctx.clip();
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(143,188,102,0.25)' : 'rgba(107,156,78,0.25)';
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * land;
    ctx.beginPath();
    ctx.ellipse(w(Math.cos(a) * r), w(Math.sin(a) * r), (4 + rand() * 16) * px, (3 + rand() * 10) * px, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hills a deeper green, the higher the darker; the coves' floors sandy toward the beach.
  const cell = 2.5;
  for (let z = -land; z < land; z += cell) {
    for (let x = -land; x < land; x += cell) {
      const sand = coveSand(plan, x + cell / 2, z + cell / 2);
      if (sand > 0.02) {
        ctx.fillStyle = C.sand;
        ctx.globalAlpha = Math.min(1, sand * 1.2);
        ctx.fillRect(w(x), w(z), cell * px + 1, cell * px + 1);
        continue;
      }
      const h = islandHeight(plan, x + cell / 2, z + cell / 2);
      if (h < 1.8) continue;
      ctx.fillStyle = C.hill;
      ctx.globalAlpha = Math.min(0.5, (h - 1.8) / 10);
      ctx.fillRect(w(x), w(z), cell * px + 1, cell * px + 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // District pavings, each ringed in its color.
  for (const c of plan.clusters) {
    disc(c.cx, c.cz, c.r + DISTRICT_PAVING);
    ctx.fillStyle = C.paving;
    ctx.fill();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 0.9 * px;
    disc(c.cx, c.cz, c.r + DISTRICT_PAVING - 0.7);
    ctx.stroke();
  }
  // Roads: stone, edged in their district's color, a dashed line down the middle.
  ctx.lineCap = 'round';
  for (const s of plan.spokes) {
    ctx.strokeStyle = C.road;
    ctx.lineWidth = ROAD_W * px;
    ctx.beginPath();
    ctx.moveTo(w(s.ax), w(s.az));
    ctx.lineTo(w(s.bx), w(s.bz));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  for (const s of plan.spokes) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.32 * px;
    for (const side of [-1, 1]) {
      const o = (ROAD_W / 2 - 0.45) * side;
      ctx.beginPath();
      ctx.moveTo(w(s.ax - uz * o), w(s.az + ux * o));
      ctx.lineTo(w(s.bx - uz * o), w(s.bz + ux * o));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = C.roadLine;
    ctx.lineWidth = 0.4 * px;
    ctx.setLineDash([2.2 * px, 2.2 * px]);
    ctx.beginPath();
    ctx.moveTo(w(s.ax), w(s.az));
    ctx.lineTo(w(s.bx), w(s.bz));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  // The ring street.
  ctx.strokeStyle = C.road;
  ctx.lineWidth = plan.street.width * px;
  disc(0, 0, plan.street.r);
  ctx.stroke();
  ctx.strokeStyle = C.roadLine;
  ctx.lineWidth = 0.32 * px;
  ctx.setLineDash([2.2 * px, 2.2 * px]);
  disc(0, 0, plan.street.r);
  ctx.stroke();
  ctx.setLineDash([]);
  // The plaza: paving, two rings, and a path from the monument to each road in that road's colors.
  disc(0, 0, plan.plaza.r);
  ctx.fillStyle = C.plaza;
  ctx.fill();
  ctx.strokeStyle = C.plazaLine;
  ctx.lineWidth = 0.35 * px;
  for (const r of [plan.plaza.r - 1.2, MONUMENT_PAD + 6]) {
    disc(0, 0, r);
    ctx.stroke();
  }
  // Each path is the plaza's paving tinted with its road's color, fading in from the monument.
  ctx.lineCap = 'round';
  for (const c of plan.clusters) {
    const ux = Math.cos(c.angle);
    const uz = Math.sin(c.angle);
    const a = MONUMENT_PAD + 1;
    const b = plan.plaza.r + 0.5;
    const grad = ctx.createLinearGradient(w(ux * a), w(uz * a), w(ux * b), w(uz * b));
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.35, c.color);
    grad.addColorStop(1, c.color);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 3.6 * px;
    ctx.beginPath();
    ctx.moveTo(w(ux * a), w(uz * a));
    ctx.lineTo(w(ux * b), w(uz * b));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
  return canvas;
}

export interface BoxCollider {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export class MapScene extends BaseScene {
  declare audioController: AudioController;
  declare sky: Sky;
  declare sea: Sea;
  declare terrainMesh: Mesh;
  declare characters: { mesh: any };
  declare overlay: ReturnType<typeof buildMapOverlay>;
  plan: MapPlan;
  /** Reduced motion: no swaying cloth. */
  readonly still: boolean;
  colliderBoxes: BoxCollider[] = [];
  private propUpdates: Array<(time: number, camX: number, camZ: number) => void> = [];
  private shiftDown = false;

  constructor() {
    super();
    const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
    this.plan = planFromLayout(
      layout,
      DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })),
      { label: L.People, color: PEOPLE_COLOR },
    );
    this.still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    void this.init();
  }

  /** The ground's height at (x, z): the ground truth every placement reads. */
  groundY(x: number, z: number): number {
    return islandHeight(this.plan, x, z);
  }

  private async init() {
    this.setupCamera();
    this.audioController = new AudioController(this, 0.25);
    this.audioController.beachBlend = (x: number, z: number) => seaSound(this.plan, x, z);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftDown = false;
    });
    window.addEventListener('blur', () => {
      this.shiftDown = false;
    });
    const sky = new Sky(this as any);
    const sea = new Sea(this as any);
    await Promise.all([sky.ready, sea.ready]);
    this.sky = sky;
    this.sea = sea;
    this.surroundWithSea();
    this.buildTerrain();
    await this.scatterProps();
    await this.addCritters();
    // The overlay's hub pieces (monument, pylons, portal posts) collide.
    const overlay = buildMapOverlay(this as any);
    this.overlay = overlay;
    for (const b of overlay.colliders) this.colliderBoxes.push({ ...b, y: this.groundY(b.x, b.z) });
    await this.addCharacters();
    this.setupLights();
    (this.sea.mesh as any).addReflectedObject(this.sky.mesh);
    this.ready.resolve();
  }

  private setupCamera() {
    this.camera.shake.set(0.08, 0.08, 0.02);
    this.camera.shakeSpeed.setScalar(0.2);
    this.camera.near = 1;
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();
    if (client.device === 'mobile') {
      this.camera.displacement.position.y = 0;
    }
  }

  /** The town's sea covers only its east; ours rings the island, out past the camera's far plane from any shore. */
  private surroundWithSea() {
    const mesh = this.sea.mesh as Mesh;
    const size = 2 * (this.plan.island.extent + this.camera.far);
    const geo = new PlaneGeometry(size, size);
    // Keep the town's ripple size: its 500-unit plane mapped the normal texture once.
    const uv = geo.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 500), uv.getY(i) * (size / 500));
    mesh.geometry.dispose();
    mesh.geometry = geo;
    mesh.position.set(0, SEA_Y, 0);
    mesh.updateMatrixWorld(true);
  }

  private setupLights() {
    const hemi = new HemisphereLight('#33434f', '#737575', 0.7);
    this.add(hemi);
    const sun = new FollowSunLight({
      scene: this,
      positionOffset: new Spherical(100, Math.PI * 0.2, Math.PI * -1.75),
      forwardOffset: 6,
      castShadow: true,
      shadowMapSize: 2048,
      shadowSize: 12,
      csm: true,
      csmBoundingSphere: (this.characters.mesh._collisionPhysics as any)._colliderMesh?.geometry?.boundingSphere,
      csmNear: 50,
      csmLODLevel: client.oldIphone ? 1 : 3,
      skipCSMMeshes: [this.characters.mesh, this.sky.mesh, this.sea.mesh],
    });
    sun.shadow.normalBias = 0.07;
    this.add(sun);
  }

  private buildTerrain(): void {
    const EXTENT = this.plan.island.extent;
    const NR = 84;
    const NS = 160;
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let ri = 0; ri <= NR; ri++) {
      // Power distribution: denser near the plaza, and no degenerate ring at
      // the center (the r<1 hole hides under the monument's pad).
      const r = Math.pow((ri + 1) / (NR + 1), 1.2) * EXTENT;
      for (let si = 0; si <= NS; si++) {
        const a = (si / NS) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        positions.push(x, this.groundY(x, z), z);
        uvs.push((x + EXTENT) / (EXTENT * 2), (z + EXTENT) / (EXTENT * 2));
      }
    }
    for (let ri = 0; ri < NR; ri++) {
      for (let si = 0; si < NS; si++) {
        // Wound so faces point up (radial × tangential is down).
        const a = ri * (NS + 1) + si;
        const b = a + NS + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const tex = new CanvasTexture(paintGround(this.plan, EXTENT));
    tex.anisotropy = 4;
    // flipY=false: canvas row 0 is v=0, matching the planar UV mapping above.
    tex.flipY = false;
    (tex as any).encoding = 3001;
    const mesh = new Mesh(geo, new MeshLambertMaterial({ map: tex }));
    mesh.name = 'island';
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    mesh.matrixWorldAutoUpdate = false;
    this.add(mesh);
    this.terrainMesh = mesh;
    (this as any).terrain = { mesh };
  }

  private makeColliderGeometry(): BufferGeometry {
    const t = this.terrainMesh.geometry.index ? this.terrainMesh.geometry.toNonIndexed() : this.terrainMesh.geometry;
    const pos: number[] = [...(t.attributes.position.array as Float32Array)];
    const nor: number[] = [...(t.attributes.normal.array as Float32Array)];
    for (const b of this.colliderBoxes) {
      const g = new BoxGeometry(b.w, b.h, b.d);
      g.rotateY(b.ry);
      g.translate(b.x, b.y + b.h / 2, b.z);
      const part = g.toNonIndexed();
      pos.push(...(part.attributes.position.array as Float32Array));
      nor.push(...(part.attributes.normal.array as Float32Array));
      g.dispose();
      part.dispose();
    }
    const geo = new BufferGeometry();
    const count = pos.length / 3;
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    // The physics worker and the BVH raycast expect an indexed geometry
    // (the town's collider.bin is indexed); identity-index the soup.
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = i;
    geo.setIndex(new BufferAttribute(index, 1));
    return geo;
  }

  /** Stand a prop at (x, z) on the ground, turned `ry`; its colliders join the collider. */
  private placeProp(build: { group: any; colliders: Array<{ w: number; h: number; d: number; x: number; z: number; ry: number }>; update?: (t: number, cx: number, cz: number) => void }, x: number, z: number, ry = 0) {
    const gy = this.groundY(x, z);
    build.group.position.set(x, gy, z);
    build.group.rotation.y = ry;
    this.add(build.group);
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    for (const c of build.colliders) {
      this.colliderBoxes.push({ w: c.w, h: c.h, d: c.d, x: x + c.x * cos + c.z * sin, y: gy, z: z - c.x * sin + c.z * cos, ry: ry + c.ry });
    }
    if (build.update) this.propUpdates.push(build.update);
  }

  private async scatterProps(): Promise<void> {
    const plan = this.plan;
    const rand = seededRandom(1234);
    const instanceData = (pts: Array<[number, number]>, s0: number, s1: number, turn: boolean) => {
      const g = new BufferGeometry();
      const n = pts.length;
      const parr = new Float32Array(n * 3);
      const sarr = new Float32Array(n);
      const qarr = new Float32Array(n * 4);
      const q = new Quaternion();
      const up = new Vector3(0, 1, 0);
      pts.forEach(([x, z], i) => {
        parr.set([x, this.groundY(x, z), z], i * 3);
        sarr[i] = s0 + rand() * (s1 - s0);
        q.setFromAxisAngle(up, turn ? rand() * Math.PI * 2 : 0);
        qarr.set([q.x, q.y, q.z, q.w], i * 4);
      });
      g.setAttribute('position', new BufferAttribute(parr, 3));
      g.setAttribute('scale', new BufferAttribute(sarr, 1));
      g.setAttribute('quaternion', new BufferAttribute(qarr, 4));
      return g;
    };
    const scatterInstanced = async (baseFile: string, materialOptions: Record<string, boolean>, pts: Array<[number, number]>, s0: number, s1: number, name: string, turn = true) => {
      if (!pts.length) return null;
      const base = await geometryLoader.load(baseFile);
      const geo = createInstancedGeometry(base, instanceData(pts, s0, s1, turn));
      const mesh = makeInstanced(geo as any, phongMaterial(materialOptions as any), name);
      this.add(mesh);
      return base;
    };
    // Trees gather on the hills; bushes, rocks and grass all round; palms on the east beach.
    const hilly = (x: number, z: number) => hillSide(x, z) > 0.4 && this.groundY(x, z) > 1.2;
    await scatterInstanced('tree.bin', { isTree: true }, scatter(rand, plan, 95, 2, (x, z) => hilly(x, z) || rand() < 0.22), 0.8, 1.4, 'trees');
    await scatterInstanced('bush.bin', { isBush: true }, scatter(rand, plan, 85, 1, () => true), 0.8, 1.5, 'bushes');
    await scatterInstanced('rock1.bin', { isRock: true }, scatter(rand, plan, 16, 1, hilly), 0.9, 1.8, 'rocks1');
    await scatterInstanced('rock2.bin', { isRock: true }, scatter(rand, plan, 20, 1, () => true), 0.9, 1.7, 'rocks2');
    await scatterInstanced('grass.bin', { isGrass: true }, scatter(rand, plan, 1700, 0, () => true), 0.8, 1.6, 'grass');
    await scatterInstanced('palmtree.bin', { isPalmTree: true }, beachSpots(rand, plan, 18, plan.beach, 5), 0.85, 1.25, 'palms');
    // Lamp posts: round the plaza's edge, along each road, round the ring street.
    const lamps = [...plan.lamps.plaza, ...plan.lamps.roads, ...plan.lamps.street].map((l): [number, number] => [l.x, l.z]);
    const lampBase = await scatterInstanced('lightpost.bin', { isLightPost: true }, lamps, 1, 1, 'lightposts', false);
    let lampTop = 6.5;
    if (lampBase) {
      lampBase.computeBoundingBox();
      lampTop = lampBase.boundingBox.max.y;
    }

    // Each district: its pavilion (a roof of its own), its arch on the road in, its banner mast, its beacon.
    plan.clusters.forEach((c, i) => {
      this.placeProp(buildPavilion(c.color, i % ROOF_KINDS), c.cx, c.cz, c.sign.facing);
      this.placeProp(buildArch(c.color, c.short), c.sign.x, c.sign.z, c.sign.facing);
      this.placeProp(buildMast(c.color, c.short, this.still), c.mast.x, c.mast.z, c.mast.facing);
      this.placeProp(buildBeacon(c.color), c.cx, c.cz);
    });
    for (const s of plan.stalls) this.placeProp(buildStall(s.color), s.x, s.z, s.ry);
    for (const p of plan.posts) this.placeProp(buildFingerpost(p.text, p.color), p.x, p.z, p.facing);
    // The set pieces round the island: one on the shore and one in the hills of each wedge.
    {
      const pieces = buildPieces(plan, (x, z) => this.groundY(x, z), this.still);
      this.add(pieces.group);
      this.colliderBoxes.push(...pieces.colliders);
      this.propUpdates.push((t) => pieces.update(t));
    }
    this.placeProp(
      buildBoard('Walking times', plan.board.rows.map((r) => ({ text: `${r.text} · ${r.seconds}s`, color: r.color, bearing: r.bearing }))),
      plan.board.x,
      plan.board.z,
      plan.board.facing,
    );
    // Bunting between neighboring plaza lamps, over each road's mouth.
    {
      const tops = plan.lamps.plaza
        .map((l) => ({ ...l, a: Math.atan2(l.z, l.x) }))
        .sort((p, q) => p.a - q.a)
        .map((l) => ({ x: l.x, y: this.groundY(l.x, l.z) + lampTop - 0.4, z: l.z, a: l.a }));
      const roads = plan.clusters.map((c) => c.angle);
      const spans = [];
      tops.forEach((t, i) => {
        const n = tops[(i + 1) % tops.length];
        if (n === t) return;
        // Only between lamps either side of one road.
        const span = ((n.a - t.a) + Math.PI * 4) % (Math.PI * 2);
        const crossing = roads.filter((g) => ((g - t.a) + Math.PI * 4) % (Math.PI * 2) < span).length;
        if (crossing !== 1) return;
        spans.push({ ax: t.x, ay: t.y, az: t.z, bx: n.x, by: n.y, bz: n.z });
      });
      if (spans.length) this.add(buildBunting(spans, [...plan.clusters.map((c) => c.color), '#f7f1e2']).group);
    }
    this.beforeRenderCbs.push(() => {
      const t = clock.time;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      for (const u of this.propUpdates) u(t, cx, cz);
    });

    // Beach props: the town's parasols and sandcastles, recentered on the sand.
    const placeClone = async (file: string, materialOptions: Record<string, boolean>, tx: number, tz: number, ry: number) => {
      const geo = await geometryLoader.load(file);
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const ox = cx * Math.cos(ry) + cz * Math.sin(ry);
      const oz = -cx * Math.sin(ry) + cz * Math.cos(ry);
      const gy = this.groundY(tx, tz);
      const mesh = new Mesh(geo, phongMaterial(materialOptions as any));
      mesh.position.set(tx - ox, gy - box.min.y - 0.05, tz - oz);
      mesh.rotation.y = ry;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    };
    const beachKinds: Array<[string, Record<string, boolean>]> = [
      ['parasol.bin', { isParasol: true }],
      ['sandcastles1.bin', { isCastles: true }],
      ['parasol.bin', { isParasol: true }],
      ['sandcastles2.bin', { isCastles: true }],
    ];
    for (let i = 0; i < plan.beach.length; i++) {
      const [file, mat] = beachKinds[i % beachKinds.length];
      const b = plan.beach[i];
      await placeClone(file, mat, b.x, b.z, b.facing);
    }
  }

  private async addCritters(): Promise<void> {
    const add = async (meshFile: string, bonesFile: string, animFile: string, mat: Record<string, boolean>, x: number, z: number, ry: number) => {
      const [skinned, clip] = await Promise.all([geometryLoader.skin(meshFile, bonesFile), geometryLoader.skinAnimation(animFile)]);
      (skinned as any).material = phongMaterial(mat as any);
      const geo = (skinned as any).geometry as BufferGeometry;
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const gy = this.groundY(x, z);
      (skinned as any).position.set(x, gy - box.min.y, z);
      (skinned as any).rotation.y = ry;
      (skinned as any).frustumCulled = false;
      (skinned as any).receiveShadow = true;
      (skinned as any).castShadow = true;
      this.add(skinned as any);
      const mixer = new AnimationMixer(skinned as any);
      const action = mixer.clipAction(clip as any);
      action.play();
      mixer.update(0.1);
      (skinned as any).onBeforeRender = () => {
        const player = (this.characters as any)?.mesh?._localObject;
        if (!player || (skinned as any).position.distanceTo(player.position) > 25) return;
        if (!this.still) mixer.update(clock.delta * 0.001);
        (skinned as any).updateMatrixWorld();
      };
    };
    const { cats, sloth } = this.plan.critters;
    await add('cats.bin', 'cats-bones.bin', 'cats-anim.bin', { isCats: true }, cats.x, cats.z, cats.facing);
    await add('sloth.bin', 'sloth-bones.bin', 'sloth-anim.bin', { isSloth: true }, sloth.x, sloth.z, sloth.facing);
  }

  private async addCharacters(): Promise<void> {
    const [skinned, clips] = await Promise.all([
      geometryLoader.skin('kid.bin', 'kid-bones.bin'),
      Promise.all(['kid-idle.bin', 'kid-run.bin', 'kid-air.bin', 'kid-bored.bin'].map((c) => geometryLoader.skinAnimation(c))),
    ]);
    (skinned as any).geometry.setAttribute('instanceSeed', new InstancedBufferAttribute(new Float32Array(128), 1));
    (skinned as any).material = phongMaterial({ isCharacters: true });
    (skinned as any).customDepthMaterial = depthCharsMaterial();
    const colliderMesh = new Mesh(this.makeColliderGeometry());
    const spawn = this.plan.spawn;
    // The camera rides behind the kid, so the arrival opens on the view the plan framed.
    const back = new Vector3(-Math.sin(spawn.facing) * CAMERA.back, 1.2, -Math.cos(spawn.facing) * CAMERA.back);
    const mesh = new Characters(skinned as any, clips as any, {
      animationsOptions: [{ speed: 1 }, { speed: 1.1 }, { speed: 1 }, { speed: 1 }],
      colliderMesh,
      radiusPercentage: 0.2,
      floorDetectInclination: 0.8,
      positionForce: 0.02,
      damp: 0.92,
      initialPosition: [spawn.x, this.groundY(spawn.x, spawn.z) + 0.5, spawn.z],
      initialRadius: 0,
      camera: this.camera,
      relativeCameraPosition: back,
      lookatMeshOffset: new Vector3(0, 1.1, -0.5),
      initialData: { seed: 0 },
      customAttribUpdate: (local: any, _clientId: string, instanceId: number) => {
        (mesh as any).geometry.attributes.instanceSeed.setX(instanceId, local.userData.seed);
      },
    });
    (this as any).characters = { mesh };
    this.add(mesh as any);
    this.add((mesh as any)._controls.circles);
    // The kid starts out facing the way the camera looks.
    const theta = kidTheta(spawn.facing);
    (mesh as any)._localObject.spherical.theta = theta;
    (mesh as any)._localObject.targetSpherical.theta = theta;
    const walkR = this.plan.island.walk;
    this.beforeRenderCbs.push(() => {
      (mesh as any).geometry.attributes.instanceSeed.needsUpdate = true;
      // Hold Shift to run (ignored while typing in the page).
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      (mesh as any)._collisionPhysics._positionForce = this.shiftDown && !typing ? 0.036 : 0.02;
      (mesh as any).update();
      this.audioController?.updatePlayerPosition(
        (mesh as any)._localObject.position.toArray(),
        (mesh as any)._localObject.velocityHorizontal,
        (mesh as any)._localObject.userData.a === 0,
      );
      // Stay on the island: the sea is scenery.
      const p = (mesh as any)._localObject.position;
      const r = Math.hypot(p.x, p.z);
      if (r > walkR) {
        p.x *= walkR / r;
        p.z *= walkR / r;
      }
    });
    events.on('webgl_character_controls_enable', (enabled: boolean) => {
      if (enabled) (mesh as any)._controls.enable();
      else (mesh as any)._controls.disable();
    });
  }

  playIntroAnimation() {
    this.camera.followSphericalZoom = this.still ? 0 : 12;
    this.camera.updateCamera();
    this.camera.spherical.copy(this.camera.sphericalTarget);
    if (!this.still) gsap.to(this.camera, { followSphericalZoom: 0, delay: 0, ease: 'inOut3', duration: 6 });
    this.camera.touchAmount = 0;
    gsap.to(this.camera, { touchAmount: 1, delay: this.still ? 0 : 4, duration: this.still ? 0.01 : 4 });
    gsap.delayedCall(this.still ? 0.2 : 1.5, () => {
      events.emit('webgl_character_controls_enable', true);
      this.audioController.canPlaySound.resolve();
    });
  }
}
