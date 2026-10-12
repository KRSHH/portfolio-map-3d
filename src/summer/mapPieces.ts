/* The island's set pieces, stood where the plan puts them (mapLayout.ts, plan.pieces): each built from
   its model (pieces/models.ts) in the town's look, flat-shaded Lambert in the town's colors, with
   lamp glass that glows a little, glazing you can see through and unlit flames.

   A piece stands level on the pad the ground keeps for it (mapGround.islandHeight); its small loose
   things (crops, haystacks, tents, fruit trees) each settle on the ground where they are. What turns
   (a windmill's sails, an observatory's dome) turns on its own mesh, and the boats ride the sea's own
   swell (swellLift), so they float on the water the sea shader draws; under reduced motion the sails
   and the dome hold still and the boats only rise and fall with the sea. Every piece's colliders come
   back as boxes for the island's collider. */
import { DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Material } from "three";
import { hashString, seededRandom } from "../data/layout";
import { SEA_Y, swellLift } from "./mapGround";
import type { MapPlan } from "./mapLayout";
import { mergeParts, type Part } from "./pieces/kit";
import { PIECE_MODELS, townPieces } from "./pieces/models";

/** A collision box: w by d, from y up h, turned ry about its middle (x, z). */
export interface PieceBox {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface PiecesBuild {
  group: Group;
  colliders: PieceBox[];
  /** Turn the sails and the dome, and float the boats, at `time` (seconds). */
  update(time: number): void;
}

export function buildPieces(plan: Pick<MapPlan, "pieces">, groundY: (x: number, z: number) => number, still: boolean): PiecesBuild {
  const group = new Group();
  group.name = "set-pieces";
  const palette = townPieces();
  const rand = seededRandom(hashString("summer-pieces"));
  const solid = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glass = new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xfff1cf, emissiveIntensity: 0.35 });
  const panes = new MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide });
  const lit = new MeshBasicMaterial({ vertexColors: true });
  const colliders: PieceBox[] = [];
  const movers: Array<(t: number) => void> = [];
  const m4 = new Matrix4();

  const mesh = (parts: Part[], material: Material, shadow: boolean) => {
    const m = new Mesh(mergeParts(parts), material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };

  for (const p of plan.pieces) {
    const model = PIECE_MODELS[p.kind](palette, rand);
    const y = groundY(p.x, p.z);
    const yaw = p.facing;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const at = (lx: number, lz: number) => ({ x: p.x + lx * cos + lz * sin, z: p.z - lx * sin + lz * cos });
    const into = { solid: [] as Part[], glass: [] as Part[], panes: [] as Part[], lit: [] as Part[] };
    const stand = (list: Part[], parts: readonly Part[] | undefined, py: number) => {
      if (!parts) return;
      m4.makeRotationY(yaw).setPosition(p.x, py, p.z);
      for (const g of parts) {
        g.applyMatrix4(m4);
        list.push(g);
      }
    };
    stand(into.solid, model.parts, y);
    stand(into.glass, model.glass, y);
    stand(into.panes, model.panes, y);
    stand(into.lit, model.lit, y);
    for (const l of model.loose ?? []) {
      const w = at(l.x, l.z);
      const ly = groundY(w.x, w.z);
      stand(into.solid, l.parts, ly);
      stand(into.lit, l.lit, ly);
    }
    const holder = new Group();
    holder.name = `piece-${p.kind}`;
    if (into.solid.length) holder.add(mesh(into.solid, solid, true));
    if (into.glass.length) holder.add(mesh(into.glass, glass, false));
    if (into.panes.length) holder.add(mesh(into.panes, panes, false));
    if (into.lit.length) holder.add(mesh(into.lit, lit, false));
    group.add(holder);

    // Colliders: heights in the model are above the piece's ground, and a loose thing stands on the
    // ground where it is, so a box spans both: from the lower of the two up to its height above the higher.
    const box = (lx: number, lz: number, w: number, d: number, h: number) => {
      const c = at(lx, lz);
      const g = groundY(c.x, c.z);
      const base = Math.min(y, g) - 0.3;
      colliders.push({ w, d, h: Math.max(y, g) + h - base, x: c.x, y: base, z: c.z, ry: yaw });
    };
    for (const c of model.colliders) box(c.x, c.z, c.r * 1.8, c.r * 1.8, c.h ?? 4);
    for (const b of model.boxes ?? []) box(b.x, b.z, b.hx * 2, b.hz * 2, b.h ?? 4);

    if (model.turn) {
      const { axis, speed, rest } = model.turn;
      const spinner = new Group();
      spinner.name = "turns";
      spinner.position.set(p.x, y, p.z);
      spinner.rotation.y = yaw;
      const part = mesh(model.turn.parts, solid, true);
      part.position.copy(model.turn.at);
      spinner.add(part);
      group.add(spinner);
      const phase = rand() * 6;
      part.rotation[axis] = rest;
      if (!still) movers.push((t) => (part.rotation[axis] = t * speed + phase));
    }
    for (const b of model.afloat ?? []) {
      const boat = mesh(b.parts, solid, true);
      boat.name = "boat";
      boat.userData.sink = b.sink;
      boat.userData.bob = b.bob[0];
      const w = at(b.x, b.z);
      boat.position.set(w.x, SEA_Y - b.sink, w.z);
      boat.rotation.y = yaw + b.yaw;
      group.add(boat);
      const phase = rand() * 6;
      movers.push((t) => {
        boat.position.y = SEA_Y + swellLift(t) - b.sink + (still ? 0 : Math.sin(t * b.bob[1] + phase) * b.bob[0]);
        boat.rotation.z = still ? 0 : Math.sin(t * b.roll[1] + phase) * b.roll[0];
      });
    }
  }

  return {
    group,
    colliders,
    update(time) {
      for (const m of movers) m(time);
    },
  };
}
