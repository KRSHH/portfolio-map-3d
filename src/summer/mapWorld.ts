// @ts-nocheck
// The map's world inside the SummerTime engine: Ambition-style layout, town assets.
//
// NOT the baked SummerTime town. The island, roads and neighborhoods are generated
// from the map's own layout (src/data/layout.ts — the same data the procedural world,
// minimap and HUD read, so everything agrees), and dressed with SummerTime's models:
// houses, lamp posts, trees, palms, rocks, grass, the kid, sky, sea, sun and LUT grade.
// New work here is placement + terrain; every model and the whole look come from the town.
//
// Contents: deterministic terrain (plaza, spoke roads, district pads, beach, hills),
// a painted ground canvas (grass/sand/roads), scattered town props (instanced with the
// town's own materials), a BVH collider (terrain + building boxes), the kid with the
// town's controls/camera/audio, and the map overlay (monument, portal, pins, signs).

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
  Spherical,
  Vector3,
} from 'three';
import { gsap } from 'gsap';
import { COMPANIES, DISTRICTS, PEOPLE } from '../data/catalog';
import { layoutWorld, seededRandom, type WorldLayout } from '../data/layout';
import { islandHeight, scatter, spokes } from './mapGround';
import { buildPavilion, buildStall, buildFingerpost, buildBeacon, buildBunting } from './mapProps';
import { stallSpots, fingerpostSpots } from './mapLayout';
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
import { makeInstanced, frustumcullInstanced } from './scene/helpers';
import { Sky } from './scene/sky';
import { Sea } from './scene/sea';
import { buildMapOverlay } from './mapOverlay';
import { cpuCanvas } from '../three/cpuCanvas';

/** Paint the island canvas: grass, sand ring, plaza, spoke roads, district pads. */
const EXTENT = 175;
const PX = 2048 / (EXTENT * 2);
function paintGround(layout: WorldLayout, colorBySlug: Map<string, string>): HTMLCanvasElement {
  const [canvas, ctx] = cpuCanvas(2048, 2048);
  const w = (x: number) => (x + EXTENT) * PX;
  const rand = seededRandom(7);
  ctx.fillStyle = '#7fa39a';
  ctx.fillRect(0, 0, 2048, 2048);
  ctx.fillStyle = '#79a85b';
  ctx.beginPath();
  ctx.arc(1024, 1024, 163 * PX, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(143,188,102,0.25)' : 'rgba(107,156,78,0.25)';
    ctx.beginPath();
    ctx.ellipse(1024 + (rand() - 0.5) * 2 * 150 * PX, 1024 + (rand() - 0.5) * 2 * 150 * PX, 30 + rand() * 130, 20 + rand() * 90, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#e2d1a2';
  ctx.lineWidth = 17 * PX;
  ctx.beginPath();
  ctx.arc(1024, 1024, 154.5 * PX, 0, Math.PI * 2);
  ctx.stroke();
  for (const d of layout.discs) {
    ctx.fillStyle = 'rgba(216,203,166,0.55)';
    ctx.beginPath();
    ctx.arc(w(d.x), w(d.z), (d.r + 3) * PX, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#b3aa97';
  ctx.lineCap = 'round';
  for (const s of spokes(layout)) {
    ctx.lineWidth = 6 * PX;
    ctx.beginPath();
    ctx.moveTo(w(s.ax), w(s.az));
    ctx.lineTo(w(s.bx), w(s.bz));
    ctx.stroke();
  }
  // Each spoke's edge lines take its district's color: follow the color home.
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const d of layout.discs) {
    const color = colorBySlug.get(d.slug) ?? '#888888';
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6 * PX;
    const ux = Math.cos(d.angle);
    const uz = Math.sin(d.angle);
    for (const side of [-3.4, 3.4]) {
      ctx.beginPath();
      ctx.moveTo(w(ux * 46 - uz * side), w(uz * 46 + ux * side));
      ctx.lineTo(w(d.x - ux * (d.r * 0.4) - uz * side), w(d.z - uz * (d.r * 0.4) + ux * side));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.lineWidth = 6.4 * PX;
  ctx.beginPath();
  ctx.arc(1024, 1024, 57.5 * PX, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#cdc3ac';
  ctx.beginPath();
  ctx.arc(1024, 1024, 52 * PX, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,90,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1024, 1024, 20 * PX, 0, Math.PI * 2);
  ctx.stroke();
  // Radial ticks point down each spoke.
  ctx.strokeStyle = 'rgba(120,110,90,0.65)';
  ctx.lineWidth = 3;
  for (const d of layout.discs) {
    ctx.beginPath();
    ctx.moveTo(1024 + Math.cos(d.angle) * 22 * PX, 1024 + Math.sin(d.angle) * 22 * PX);
    ctx.lineTo(1024 + Math.cos(d.angle) * 44 * PX, 1024 + Math.sin(d.angle) * 44 * PX);
    ctx.stroke();
  }
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
  declare overlay: { mountLayer(host: HTMLElement): void; setSelected(slug: string | null, isPerson: boolean): void };
  layout: WorldLayout;
  colliderBoxes: BoxCollider[] = [];
  private propUpdates: Array<(time: number, camX: number, camZ: number) => void> = [];
  private shiftDown = false;

  constructor() {
    super();
    this.layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
    void this.init();
  }

  private async init() {
    this.setupCamera();
    this.audioController = new AudioController(this, 0.25);
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
    this.buildTerrain();
    await this.scatterProps();
    await this.addCritters();
    // The overlay's hub pieces (monument, pylons, portal posts) collide.
    const overlay = buildMapOverlay(this as any);
    this.overlay = overlay;
    for (const b of overlay.colliders) {
      this.colliderBoxes.push({ ...b, y: islandHeight(this.layout, b.x, b.z) });
    }
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
    const NR = 72;
    const NS = 128;
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
        positions.push(x, islandHeight(this.layout, x, z), z);
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
    const tex = new CanvasTexture(paintGround(this.layout, new Map(DISTRICTS.map((d) => [d.slug, d.color]))));
    tex.anisotropy = 4;
    // flipY=false: canvas row 0 is v=0, matching the planar UV mapping below.
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

  private boxCollider(w: number, h: number, d: number, x: number, z: number, ry = 0): void {
    if (w <= 0) return;
    this.colliderBoxes.push({ w, h, d, x, y: islandHeight(this.layout, x, z), z, ry });
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

  private async scatterProps(): Promise<void> {
    const rand = seededRandom(1234);
    const barns: Array<[number, number]> = [];
    const placeProp = (build: { group: any; colliders: BoxCollider[]; update?: (t: number, cx: number, cz: number) => void }, x: number, z: number, ry = 0) => {
      const gy = islandHeight(this.layout, x, z);
      build.group.position.set(x, gy, z);
      build.group.rotation.y = ry;
      this.add(build.group);
      for (const c of build.colliders) {
        const cos = Math.cos(ry);
        const sin = Math.sin(ry);
        this.colliderBoxes.push({
          w: c.w, h: c.h, d: c.d,
          x: x + c.x * cos + c.z * sin,
          y: gy,
          z: z - c.x * sin + c.z * cos,
          ry,
        });
      }
      if (build.update) this.propUpdates.push((t) => build.update!(t, this.camera.position.x, this.camera.position.z));
    };
    const instanceData = (pts: Array<[number, number]>, s0: number, s1: number) => {
      const g = new BufferGeometry();
      const n = pts.length;
      const parr = new Float32Array(n * 3);
      const sarr = new Float32Array(n);
      pts.forEach(([x, z], i) => {
        parr.set([x, islandHeight(this.layout, x, z), z], i * 3);
        sarr[i] = s0 + rand() * (s1 - s0);
      });
      g.setAttribute('position', new BufferAttribute(parr, 3));
      g.setAttribute('scale', new BufferAttribute(sarr, 1));
      return g;
    };
    const scatterInstanced = async (
      baseFile: string,
      materialOptions: Record<string, boolean>,
      pts: Array<[number, number]>,
      s0: number,
      s1: number,
      name: string,
    ) => {
      if (!pts.length) return;
      const base = await geometryLoader.load(baseFile);
      const geo = createInstancedGeometry(base, instanceData(pts, s0, s1));
      const mesh = makeInstanced(geo as any, phongMaterial(materialOptions as any), name);
      this.add(mesh);
    };
    const west = (x: number) => x < -15;
    const beachArc = (x: number, z: number) => x > 100 && Math.abs(Math.atan2(z, x)) < 0.65;
    await scatterInstanced('tree.bin', { isTree: true }, scatter(rand, this.layout, barns, 150, 2, (x, z) => islandHeight(this.layout, x, z) > 0.6 && (west(x) || rand() < 0.3)), 0.8, 1.4, 'trees');
    await scatterInstanced('bush.bin', { isBush: true }, scatter(rand, this.layout, barns, 130, 1, () => true), 0.8, 1.5, 'bushes');
    await scatterInstanced('rock1.bin', { isRock: true }, scatter(rand, this.layout, barns, 22, 1, (x) => west(x)), 0.9, 1.8, 'rocks1');
    await scatterInstanced('rock2.bin', { isRock: true }, scatter(rand, this.layout, barns, 30, 1, () => true), 0.9, 1.7, 'rocks2');
    await scatterInstanced('grass.bin', { isGrass: true }, scatter(rand, this.layout, barns, 2600, 0, () => true), 0.8, 1.6, 'grass');
    await scatterInstanced('palmtree.bin', { isPalmTree: true }, scatter(rand, this.layout, barns, 26, 2, (x, z) => beachArc(x, z) && islandHeight(this.layout, x, z) > -0.4), 0.85, 1.25, 'palms');
    // Lamps: plaza ring, spokes, village ring.
    const lamps: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      lamps.push([Math.cos(a) * 54, Math.sin(a) * 54]);
    }
    for (const d of this.layout.discs) {
      const ux = Math.cos(d.angle);
      const uz = Math.sin(d.angle);
      const px = ux * 46;
      const pz = uz * 46;
      const ex = d.x - ux * d.r * 0.4;
      const ez = d.z - uz * d.r * 0.4;
      [0.3, 0.55, 0.8].forEach((t, k) => {
        const side = k % 2 ? 1 : -1;
        lamps.push([px + (ex - px) * t - uz * 4 * side, pz + (ez - pz) * t + ux * 4 * side]);
      });
    }
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2 + 0.1;
      lamps.push([Math.cos(a) * 57.5, Math.sin(a) * 57.5]);
    }
    await scatterInstanced('lightpost.bin', { isLightPost: true }, lamps, 1, 1, 'lightposts');

    // --- district pavilions + beacons: one per neighborhood, in its color ---
    const colorBySlug = new Map(DISTRICTS.map((d) => [d.slug, d.color]));
    for (const d of this.layout.discs) {
      const color = d.slug === 'people' ? '#8a8f98' : (colorBySlug.get(d.slug) ?? '#888888');
      const label = d.slug === 'people' ? 'People' : (DISTRICTS.find((dd) => dd.slug === d.slug)?.short ?? d.slug);
      placeProp(buildPavilion(color, label, Math.atan2(-d.x, -d.z)), d.x, d.z);
      placeProp(buildBeacon(color), d.x, d.z);
    }
    // --- market stalls on the village ring ---
    const stallColors = [...DISTRICTS.map((d) => d.color), '#f3e8cf'];
    for (const s of stallSpots(this.layout, stallColors)) {
      placeProp(buildStall(s.color), s.x, s.z, s.ry);
    }
    // --- fingerposts where spokes leave the plaza + the spawn totem ---
    const fingers = fingerpostSpots(
      this.layout,
      DISTRICTS.map((dd) => ({ slug: dd.slug, label: dd.label, short: dd.short, color: dd.color })),
    );
    for (const f of fingers.posts) {
      const g = buildFingerpost(f.arms);
      g.group.position.set(f.x, islandHeight(this.layout, f.x, f.z), f.z);
      this.add(g.group);
    }
    {
      const t = fingers.totem;
      const g = buildFingerpost(t.arms);
      g.group.position.set(t.x, islandHeight(this.layout, t.x, t.z), t.z);
      g.group.scale.setScalar(1.15);
      this.add(g.group);
      this.colliderBoxes.push({ w: 1, h: 5.5, d: 1, x: t.x, y: islandHeight(this.layout, t.x, t.z), z: t.z, ry: 0 });
    }
    // --- bunting between the plaza lamps ---
    {
      const tops: Array<[number, number, number]> = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const x = Math.cos(a) * 54;
        const z = Math.sin(a) * 54;
        tops.push([x, islandHeight(this.layout, x, z) + 7, z]);
      }
      const spans = tops.map(([ax, ay, az], i) => {
        const [bx, by, bz] = tops[(i + 1) % tops.length];
        return { ax, ay, az, bx, by, bz };
      });
      const bunting = buildBunting(spans, [...DISTRICTS.map((d) => d.color), '#f7f1e2']);
      this.add(bunting.group);
    }
    this.beforeRenderCbs.push(() => {
      const t = clock.time;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      for (const u of this.propUpdates) u(t, cx, cz);
    });

    // --- beach props: town parasols and sandcastles, recentered on the sand ---
    await placeClone('machine.bin', { isMachine: true }, -64, 66, 0.6, null);
    await placeClone('machine.bin', { isMachine: true }, 66, -62, -0.4, null);
    await placeClone('parasol.bin', { isParasol: true }, 128, 18, 0.3, null);
    await placeClone('parasol.bin', { isParasol: true }, 122, -32, -0.5, null);
    await placeClone('sandcastles1.bin', { isCastles: true }, 132, 44, 0.2, null);
    await placeClone('sandcastles2.bin', { isCastles: true }, 134, -8, -0.2, null);
  }

  private async addCritters(): Promise<void> {
    const add = async (meshFile: string, bonesFile: string, animFile: string, mat: Record<string, boolean>, x: number, z: number, ry: number) => {
      const [skinned, clip] = await Promise.all([
        geometryLoader.skin(meshFile, bonesFile),
        geometryLoader.skinAnimation(animFile),
      ]);
      (skinned as any).material = phongMaterial(mat as any);
      const geo = (skinned as any).geometry as BufferGeometry;
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const gy = islandHeight(this.layout, x, z);
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
        mixer.update(clock.delta * 0.001);
        (skinned as any).updateMatrixWorld();
      };
    };
    const commerce = this.layout.discs.find((d) => d.slug === 'commerce');
    if (commerce) await add('cats.bin', 'cats-bones.bin', 'cats-anim.bin', { isCats: true }, commerce.x - 4, commerce.z + 6, 2.2);
    await add('sloth.bin', 'sloth-bones.bin', 'sloth-anim.bin', { isSloth: true }, -58, 34, -0.7);
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
    const mesh = new Characters(skinned as any, clips as any, {
      animationsOptions: [{ speed: 1 }, { speed: 1.1 }, { speed: 1 }, { speed: 1 }],
      colliderMesh,
      radiusPercentage: 0.2,
      floorDetectInclination: 0.8,
      positionForce: 0.02,
      damp: 0.92,
      initialPosition: [this.layout.spawn.x, 2, this.layout.spawn.z],
      initialRadius: 4,
      camera: this.camera,
      // Spawn faces the plaza (-z): mirror the town's camera offsets, a touch farther out.
      relativeCameraPosition: new Vector3(0, 1.2, 6.9),
      lookatMeshOffset: new Vector3(0, 1.1, -0.5),
      initialData: { seed: 0 },
      customAttribUpdate: (local: any, _clientId: string, instanceId: number) => {
        (mesh as any).geometry.attributes.instanceSeed.setX(instanceId, local.userData.seed);
      },
    });
    (this as any).characters = { mesh };
    this.add(mesh as any);
    this.add((mesh as any)._controls.circles);
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
      const maxR = this.layout.islandRadius - 6;
      const r = Math.hypot(p.x, p.z);
      if (r > maxR) {
        p.x *= maxR / r;
        p.z *= maxR / r;
      }
    });
    events.on('webgl_character_controls_enable', (enabled: boolean) => {
      if (enabled) (mesh as any)._controls.enable();
      else (mesh as any)._controls.disable();
    });
  }

  playIntroAnimation() {
    this.camera.followSphericalZoom = 12;
    this.camera.updateCamera();
    this.camera.spherical.copy(this.camera.sphericalTarget);
    gsap.to(this.camera, { followSphericalZoom: 0, delay: 0, ease: 'inOut3', duration: 6 });
    this.camera.touchAmount = 0;
    gsap.to(this.camera, { touchAmount: 1, delay: 4, duration: 4 });
    gsap.delayedCall(1.5, () => {
      events.emit('webgl_character_controls_enable', true);
      this.audioController.canPlaySound.resolve();
    });
  }
}
