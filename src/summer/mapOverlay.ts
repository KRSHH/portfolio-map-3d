// @ts-nocheck
// The map overlay: Ambition-style layout built inside the real SummerTime town.
//
// A founding hub at the town center (monument, four pylons, the Nexus portal,
// spawn), one neighborhood per district plus the people area (sunflower pin
// clusters with arch signs), all positioned by the pure plan in mapPlan.ts.
//
// New 3D assets are procedural but speak the town's language: flat-shaded
// Lambert stone/wood/bronze (the town's sun, shadows and LUT grade them like
// everything else), canvas-painted boards via cpuCanvas, and the companies'
// real logo badges from src/three/logoTexture.ts. Standard three.js materials
// pick up the town's cascaded-shadow rewrite automatically (materials.ts
// patches the shared light chunk), so no custom shaders except the portal
// curtain (adapted from src/views/walk/portal.ts to three r148).
//
// The overlay also owns its DOM: district chips (projected each frame),
// a meet prompt near pins, and the portal card. Built once per page load,
// like the engine itself.

import {
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  BoxGeometry,
  Raycaster,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { client } from './core/client';
import { events } from './core/events';
import { clock } from './engine/clock';
import { companyBadge, personBadge, labelTexture } from '../three/logoTexture';
import { cpuCanvas } from '../three/cpuCanvas';
import { heightAt, planSummerMap, type MapPlan } from './mapPlan';
import { frustumcullInstanced } from './scene/helpers';
import type { Company, Person } from '../data/types';

const DOWN = new Vector3(0, -1, 0);

export interface OverlayCatalog {
  orgName: string;
  districts: Array<{ slug: string; label: string; short: string; color: string; companies: Company[] }>;
  people: Person[];
}

export interface OverlayHooks {
  onMeetCompany(slug: string): void;
  onMeetPerson(slug: string): void;
  goNexus(): void;
}

interface Pin {
  slug: string;
  district: string;
  isPerson: boolean;
  x: number;
  y: number;
  z: number;
  badge: Mesh;
  headIndex: number;
}

const lambert = (color: string | number) => new MeshLambertMaterial({ color, flatShading: true });
/** Canvas textures are sRGB art; flag them so the r148 renderer decodes them. */
function srgb<T>(tex: T): T {
  (tex as any).encoding = 3001; // sRGBEncoding in r148
  return tex;
}
function canvasTex(canvas: HTMLCanvasElement) {
  const t = new CanvasTexture(canvas);
  t.anisotropy = 4;
  return srgb(t);
}

export interface MapOverlay {
  plan: MapPlan;
  mountLayer(host: HTMLElement): void;
  setSelected(slug: string | null, isPerson: boolean): void;
}

export function buildMapOverlay(scene: any, catalog: OverlayCatalog, hooks: OverlayHooks): MapOverlay {
  const plan = planSummerMap(
    catalog.districts.map((d) => ({
      slug: d.slug,
      label: d.label,
      short: d.short,
      color: d.color,
      companies: d.companies.map((c) => ({ slug: c.slug, name: c.name })),
    })),
    catalog.people.map((p) => ({ slug: p.slug })),
  );
  const companyBySlug = new Map(catalog.districts.flatMap((d) => d.companies).map((c) => [c.slug, c]));
  const personBySlug = new Map(catalog.people.map((p) => [p.slug, p]));
  const colorByDistrict = new Map(catalog.districts.map((d) => [d.slug, d.color]));

  const raycaster = new Raycaster();
  const groundY = (x: number, z: number): number => {
    raycaster.set(new Vector3(x, 40, z), DOWN);
    const hit = raycaster.intersectObject(scene.terrain.mesh, false)[0];
    return hit ? hit.point.y : heightAt(x, z);
  };

  const root = new Group();
  root.name = 'map-overlay';
  scene.add(root);
  const add = (parent: Object3D, child: Object3D, x = 0, y = 0, z = 0) => {
    child.position.set(x, y, z);
    parent.add(child);
    return child;
  };
  const shadowed = <T extends Mesh>(m: T): T => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // ---- founding hub: monument ----
  {
    const m = plan.monument;
    const gy = groundY(m.x, m.z);
    const g = new Group();
    g.position.set(m.x, gy, m.z);
    g.rotation.y = m.facing;
    root.add(g);
    const stone = lambert('#cfc0a0');
    const stoneDark = lambert('#a89a7c');
    add(g, shadowed(new Mesh(new CircleGeometry(7, 28).rotateX(-Math.PI / 2), lambert('#d9cba6'))), 0, 0.03, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(5.4, 0.5, 5.4), stoneDark)), 0, 0.28, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(4.2, 0.5, 4.2), stone)), 0, 0.78, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(3.0, 0.5, 3.0), stoneDark)), 0, 1.28, 0);
    const shaft = add(g, shadowed(new Mesh(new CylinderGeometry(0.55, 1.05, 5.4, 4), stone)), 0, 1.53 + 2.7, 0);
    shaft.rotation.y = Math.PI / 4;
    add(g, shadowed(new Mesh(new ConeGeometry(0.78, 0.9, 4), lambert('#8a6a3a'))), 0, 1.53 + 5.4 + 0.45, 0).rotation.y = Math.PI / 4;
    // Plaque with the publisher's name, facing the spawn (world -z).
    const badge = labelTexture(catalog.orgName, { bg: '#3a3630', color: '#f5ead0', size: 64, weight: 600 });
    const board = new Mesh(
      new PlaneGeometry(2.6, (2.6 / badge.aspect) * 1.0),
      new MeshBasicMaterial({ map: srgb(badge.texture), transparent: true, toneMapped: false }),
    );
    // The group is rotated π (facing the spawn), so its local +z is world -z.
    board.position.set(0, 1.0, 1.53);
    g.add(board);
  }

  // ---- pylons: four lantern pillars on the monument's north arc ----
  for (const p of plan.pylons) {
    const gy = groundY(p.x, p.z);
    const g = new Group();
    g.position.set(p.x, gy, p.z);
    root.add(g);
    add(g, shadowed(new Mesh(new BoxGeometry(1.1, 0.4, 1.1), lambert('#a89a7c'))), 0, 0.2, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(0.7, 3.0, 0.7), lambert('#cfc0a0'))), 0, 1.9, 0);
    const lampGlass = new Mesh(
      new BoxGeometry(0.55, 0.6, 0.55),
      new MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
    );
    add(g, lampGlass, 0, 3.7, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(1.0, 0.3, 1.0), lambert('#8a6a3a'))), 0, 4.15, 0);
  }

  // ---- Nexus portal (Ambition's ring, town-dressed) ----
  const PORTAL_R = 3.4;
  let curtainUniforms = { uTime: { value: 0 } };
  {
    const p = plan.portal;
    const gy = groundY(p.x, p.z);
    const g = new Group();
    g.position.set(p.x, gy, p.z);
    g.rotation.y = p.facing;
    root.add(g);
    const cy = PORTAL_R + 0.24;
    const frame = lambert('#4a4238');
    add(g, shadowed(new Mesh(new TorusGeometry(PORTAL_R, 0.18, 8, 64).translate(0, cy, 0), frame)));
    const inner = new Mesh(
      new TorusGeometry(PORTAL_R - 0.12, 0.03, 6, 64).translate(0, cy, 0.1),
      new MeshBasicMaterial({ color: '#ffd1a3', toneMapped: false }),
    );
    g.add(inner);
    const stone = lambert('#8f8468');
    add(g, shadowed(new Mesh(new BoxGeometry(PORTAL_R * 2 + 1.8, 0.35, 1.9).translate(0, 0.17, 0), stone)));
    add(g, shadowed(new Mesh(new CylinderGeometry(0.2, 0.3, cy, 8).translate(-PORTAL_R - 0.15, cy / 2, 0), stone)));
    add(g, shadowed(new Mesh(new CylinderGeometry(0.2, 0.3, cy, 8).translate(PORTAL_R + 0.15, cy / 2, 0), stone)));
    // Warm light curtain (GLSL adapted from the procedural portal: r148 uses encodings_fragment).
    curtainUniforms = { uTime: { value: 0 } };
    const curtain = new Mesh(
      new CircleGeometry(PORTAL_R - 0.16, 48).translate(0, cy, 0),
      new ShaderMaterial({
        uniforms: { ...curtainUniforms, uA: { value: new Color('#e9a56e') }, uB: { value: new Color('#cc7292') } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
          void main() {
            vec2 q = vUv - 0.5;
            float edge = 1.0 - smoothstep(0.88, 1.0, length(q) * 2.0);
            float drift = uTime * 0.13;
            float bend = sin(vUv.y * 4.2 + drift) * 0.09 + sin(vUv.y * 9.0 - drift * 0.7) * 0.025;
            float folds = sin((vUv.x + bend) * 29.0 + drift);
            float ribbons = pow(0.5 + 0.5 * folds, 3.0);
            float veil = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
            vec3 col = mix(uA, uB, smoothstep(0.12, 0.9, vUv.y));
            col = mix(col, vec3(1.0, 0.88, 0.73), ribbons * 0.32);
            float alpha = edge * (0.10 + veil * (0.15 + ribbons * 0.40));
            gl_FragColor = vec4(col, alpha);
            #include <encodings_fragment>
          }`,
      }),
    );
    curtain.renderOrder = 2;
    g.add(curtain);
    // Glow pad + nameplate.
    const [gc, gctx] = cpuCanvas(128, 128);
    const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(238,171,117,0.30)');
    grad.addColorStop(1, 'rgba(238,171,117,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glow = new Mesh(
      new PlaneGeometry(PORTAL_R * 2.4, PORTAL_R * 1.7).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: canvasTex(gc), transparent: true, depthWrite: false, toneMapped: false }),
    );
    add(g, glow, 0, 0.08, 0);
    const words = labelTexture('Nexus', { bg: '#3a3630', color: '#ffd9a8', size: 72, weight: 600 });
    const plateH = 2.2 / words.aspect;
    const plateY = cy + PORTAL_R + 0.18 + plateH / 2;
    add(g, shadowed(new Mesh(new BoxGeometry(2.5, plateH + 0.2, 0.16), stone)), 0, plateY, 0);
    const plate = new Mesh(
      new PlaneGeometry(2.2, plateH),
      new MeshBasicMaterial({ map: srgb(words.texture), transparent: true, toneMapped: false }),
    );
    add(g, plate, 0, plateY, 0.1);
  }

  // ---- neighborhood pins: instanced posts + heads, individual logo badges ----
  const pins: Pin[] = [];
  const pickables: Object3D[] = [];
  const slugByObject = new Map<number, Pin>();
  const postGeo = new CylinderGeometry(0.09, 0.13, 1.9, 7).translate(0, 0.95, 0);
  const headGeo = new OctahedronGeometry(0.45).translate(0, 2.35, 0);
  const allPins: Array<{ slug: string; district: string; isPerson: boolean; x: number; z: number }> = [];
  for (const c of plan.clusters) {
    for (const p of c.pins) allPins.push({ ...p, isPerson: c.slug === 'people' });
  }
  const posts = new InstancedMesh(postGeo, lambert('#7a5c3e'), allPins.length);
  const heads = new InstancedMesh(headGeo, lambert('#ffffff'), allPins.length);
  posts.castShadow = heads.castShadow = true;
  const dummy = new Object3D();
  const tmpColor = new Color();
  allPins.forEach((p, i) => {
    const gy = groundY(p.x, p.z);
    dummy.position.set(p.x, gy - 0.1, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    const color = p.isPerson ? '#6b7280' : (colorByDistrict.get(p.district) ?? '#888888');
    heads.setColorAt(i, tmpColor.set(color));
    // Badge plate above the head.
    const holder = p.isPerson ? personBySlug.get(p.slug) : companyBySlug.get(p.slug);
    const badge = p.isPerson
      ? personBadge(holder as Person)
      : companyBadge(holder as Company, false);
    srgb(badge.texture);
    const w = p.isPerson ? 2.3 : 3.1;
    const mesh = new Mesh(
      new PlaneGeometry(w, w / badge.aspect),
      new MeshBasicMaterial({ map: badge.texture, transparent: true, toneMapped: false }),
    );
    mesh.position.set(p.x, gy + (p.isPerson ? 4.1 : 3.9), p.z);
    mesh.renderOrder = 3;
    root.add(mesh);
    const pin: Pin = { slug: p.slug, district: p.district, isPerson: p.isPerson, x: p.x, y: gy, z: p.z, badge: mesh, headIndex: i };
    pins.push(pin);
    pickables.push(mesh);
    slugByObject.set(mesh.id, pin);
  });
  posts.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  frustumcullInstanced(posts);
  frustumcullInstanced(heads);
  root.add(posts, heads);

  // ---- arch signs: posts + beam + painted board facing the monument ----
  for (const c of plan.clusters) {
    const gy = groundY(c.sign.x, c.sign.z);
    const g = new Group();
    g.position.set(c.sign.x, gy, c.sign.z);
    g.rotation.y = c.sign.facing;
    root.add(g);
    const wood = lambert('#6e5138');
    add(g, shadowed(new Mesh(new CylinderGeometry(0.14, 0.17, 3.4, 7), wood)), -2.4, 1.7, 0);
    add(g, shadowed(new Mesh(new CylinderGeometry(0.14, 0.17, 3.4, 7), wood)), 2.4, 1.7, 0);
    add(g, shadowed(new Mesh(new BoxGeometry(5.6, 0.35, 0.35), new MeshLambertMaterial({ color: c.color, flatShading: true }))), 0, 3.5, 0);
    const board = labelTexture(c.short, { bg: '#f3e8cf', color: '#3a352c', size: 56, weight: 600 });
    const bw = 4.6;
    const mesh = new Mesh(
      new PlaneGeometry(bw, bw / board.aspect),
      new MeshBasicMaterial({ map: srgb(board.texture), transparent: true, toneMapped: false }),
    );
    add(g, mesh, 0, 2.45, 0.05);
  }

  // ---- DOM: district chips, meet prompt, portal card (walk.css styles) ----
  const clusterGroundY = new Map<string, number>();
  for (const c of plan.clusters) clusterGroundY.set(c.slug, groundY(c.cx, c.cz));
  const layer = document.createElement('div');
  layer.className = 'summer-layer';
  const chipEls = new Map<string, HTMLButtonElement>();
  for (const c of plan.clusters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `walk-district-label${c.slug === 'people' ? ' is-people' : ''}`;
    if (c.slug !== 'people') b.style.setProperty('--d', c.color);
    b.innerHTML = `<span class="walk-district-text"><strong></strong><span></span></span>`;
    b.querySelector('strong')!.textContent = c.label;
    b.querySelector('.walk-district-text > span')!.textContent =
      `${c.count} ${c.count === 1 ? (c.slug === 'people' ? 'person' : 'company') : c.slug === 'people' ? 'people' : 'companies'}`;
    b.addEventListener('click', () => {
      scene.characters?.mesh?.snap?.([c.sign.x, 0, c.sign.z]);
    });
    b.style.opacity = '0';
    layer.append(b);
    chipEls.set(c.slug, b);
  }
  const prompt = document.createElement('button');
  prompt.type = 'button';
  prompt.className = 'walk-prompt summer-prompt';
  prompt.hidden = true;
  layer.append(prompt);
  const portalCard = document.createElement('div');
  portalCard.className = 'walk-portal-card summer-portal-card';
  portalCard.hidden = true;
  portalCard.innerHTML = `<strong>Through the portal to the Nexus…</strong><p class="walk-portal-what">The shared world of every map in the network.</p><div class="walk-portal-actions"><button type="button" class="btn btn-primary">Go now</button><button type="button" class="btn btn-quiet">Stay here</button></div>`;
  const [goBtn, stayBtn] = portalCard.querySelectorAll('button');
  let portalCooldownUntil = 0;
  goBtn.addEventListener('click', () => hooks.goNexus());
  stayBtn.addEventListener('click', () => {
    portalCard.hidden = true;
    portalCooldownUntil = performance.now() + 20000;
  });
  const mountLayer = (host: HTMLElement) => {
    if (layer.parentNode !== host) host.append(layer);
  };

  // ---- picking + per-frame updates ----
  const ndc = new Vector2();
  const projV = new Vector3();
  let nearPin: Pin | null = null;
  let selected: { slug: string; isPerson: boolean } | null = null;
  const playerPos = (): Vector3 | null => scene.characters?.mesh?._localObject?.position ?? null;

  events.on('touch_click', (touch: any) => {
    if (!touch || !scene.camera) return;
    ndc.set(touch.position01.x * 2 - 1, touch.position01.y * 2 - 1);
    raycaster.setFromCamera(ndc as any, scene.camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const pin = hit ? slugByObject.get(hit.object.id) : undefined;
    if (pin) (pin.isPerson ? hooks.onMeetPerson : hooks.onMeetCompany)(pin.slug);
  });

  // Enter meets the nearby pin (the prompt's hint). Ignored while typing.
  events.on('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !nearPin) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable || ae.closest('.sheet, .panel'))) return;
    e.preventDefault();
    (nearPin.isPerson ? hooks.onMeetPerson : hooks.onMeetCompany)(nearPin.slug);
  });

  const cssPos = (x: number, y: number, z: number): { x: number; y: number; visible: boolean } => {
    projV.set(x, y, z).project(scene.camera);
    const behind = projV.z > 1;
    return {
      x: (projV.x * 0.5 + 0.5) * client.screen.w,
      y: (-projV.y * 0.5 + 0.5) * client.screen.h,
      visible: !behind && Math.abs(projV.x) < 1.1 && Math.abs(projV.y) < 1.1,
    };
  };

  scene.beforeRenderCbs.push(() => {
    curtainUniforms.uTime.value = clock.time;
    // Badges face the camera.
    for (const p of pins) p.badge.quaternion.copy(scene.camera.quaternion);
    const player = playerPos();
    // Nearest pin → meet prompt.
    let best: Pin | null = null;
    let bestD = 4.2;
    if (player) {
      for (const p of pins) {
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (best !== nearPin) {
      nearPin = best;
      for (const p of pins) {
        const on = p === nearPin || (selected && p.slug === selected.slug);
        p.badge.scale.setScalar(on ? 1.18 : 1);
      }
      if (nearPin) {
        const holder = nearPin.isPerson ? personBySlug.get(nearPin.slug) : companyBySlug.get(nearPin.slug);
        prompt.innerHTML = '';
        const dot = document.createElement('span');
        dot.className = 'walk-dot';
        dot.style.background = nearPin.isPerson ? '#6b7280' : (colorByDistrict.get(nearPin.district) ?? '#888');
        prompt.append(dot, document.createTextNode(`Meet ${(holder as any)?.name ?? nearPin.slug}  `));
        const kbd = document.createElement('kbd');
        kbd.textContent = 'Enter';
        prompt.append(kbd);
        prompt.hidden = false;
        prompt.onclick = () => ((nearPin!.isPerson ? hooks.onMeetPerson : hooks.onMeetCompany)(nearPin!.slug));
      } else {
        prompt.hidden = true;
        prompt.onclick = null;
      }
    }
    // Portal card within range (with a cooldown after "Stay here").
    if (player) {
      const d = Math.hypot(player.x - plan.portal.x, player.z - plan.portal.z);
      const cool = performance.now() < portalCooldownUntil;
      portalCard.hidden = cool || d > 7.5;
      if (!portalCard.hidden) {
        const s = cssPos(plan.portal.x, 6.5, plan.portal.z);
        portalCard.style.transform = `translate(-50%,-100%) translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
      }
    }
    // District chips follow their neighborhoods.
    for (const c of plan.clusters) {
      const el = chipEls.get(c.slug)!;
      const s = cssPos(c.cx, (clusterGroundY.get(c.slug) ?? 0) + 7.5, c.cz);
      el.style.transform = `translate(-50%,-100%) translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
      el.style.opacity = s.visible ? '1' : '0';
      el.style.pointerEvents = s.visible ? 'auto' : 'none';
    }
  });

  return {
    plan,
    mountLayer,
    setSelected(slug, isPerson) {
      selected = slug ? { slug, isPerson } : null;
      for (const p of pins) {
        const on = p === nearPin || (selected && p.slug === selected.slug);
        p.badge.scale.setScalar(on ? 1.18 : 1);
      }
    },
  } as MapOverlay;
}
