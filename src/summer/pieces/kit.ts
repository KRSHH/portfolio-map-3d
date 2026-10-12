/* Small shape builders for the island's set pieces (models.ts): painted, faceted parts in a local
   frame (y up, the front toward +z, the origin at the center of the footprint on the ground). A part
   is a non-indexed, vertex-colored geometry, so a whole piece merges into one mesh (mergeParts) and
   takes the town's flat-shaded Lambert light like every other prop.

   Ported from the procedural walk world's kit, with its boat hull, to stand on its own here. One
   change for the town's look: colors are solid, with no vertical wash. Nothing here reads the DOM or
   the scene. */
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, SphereGeometry, Vector3 } from "three";

export type Part = BufferGeometry;

export interface Shape {
  /** Turn about the part's own center (y), before it is placed. */
  rotY?: number;
}

/** A new color, `k` times as bright. */
export const tone = (c: Color, k: number) => c.clone().multiplyScalar(k);
/** A new color `t` of the way from a to b. */
export const blend = (a: Color, b: Color, t: number) => a.clone().lerp(b, t);

/** Paint every vertex of a geometry one color (non-indexed, without uvs). */
export function paint(geometry: BufferGeometry, color: Color): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

/** Merge painted parts into one geometry: positions and colors, with face normals recomputed. */
export function mergeParts(parts: readonly Part[]): BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3).fill(1);
  let o = 0;
  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part;
    const count = g.attributes.position.count;
    pos.set(g.attributes.position.array as ArrayLike<number>, o * 3);
    const c = g.attributes.color;
    if (c) col.set(c.array as ArrayLike<number>, o * 3);
    o += count;
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(pos, 3));
  out.setAttribute("color", new BufferAttribute(col, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

function place(g: Part, x: number, y: number, z: number, color: Color, s: Shape): Part {
  if (s.rotY) g.rotateY(s.rotY);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A box standing on y (its bottom), centered on x and z. */
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: Color, s: Shape = {}): Part =>
  place(new BoxGeometry(w, h, d), x, y + h / 2, z, color, s);

/** A cylinder (or a cone, with rTop 0) standing on y. */
export const cyl = (rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: Color, s: Shape = {}): Part =>
  place(new CylinderGeometry(rTop, rBot, h, seg), x, y + h / 2, z, color, s);

/** A faceted ball, squashed in y by `sy`, centered at y. */
export const ball = (r: number, x: number, y: number, z: number, color: Color, sy = 1, detail = 0): Part =>
  paint(new IcosahedronGeometry(r, detail).scale(1, sy, 1).translate(x, y, z), color);

/** A square-based pyramid (a hip or tower roof): base w by d, standing on y. */
export const pyramid = (w: number, d: number, h: number, x: number, y: number, z: number, color: Color, s: Shape = {}): Part =>
  place(new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, d), x, y + h / 2, z, color, s);

/** A single triangle (a sail, a pennant), painted; seen from the side its corners turn counter-clockwise, or both with a double-sided material. */
export function tri(a: Vector3, b: Vector3, c: Vector3, color: Color): Part {
  const g = new BufferGeometry().setFromPoints([a, b, c]);
  g.computeVertexNormals();
  return paint(g, color);
}

/** A straight bar from a to b (a wire, a rail, a rope). */
export function bar(a: Vector3, b: Vector3, thick: number, color: Color): Part {
  const len = a.distanceTo(b);
  const g = new BoxGeometry(thick, thick, len);
  const m = new Matrix4().lookAt(a, b, new Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return paint(g, color);
}

/** A part turned inside out: its triangles face the other way, so it is seen from within (the inside of a boat). */
export function inside(g: Part): Part {
  const pos = g.attributes.position as BufferAttribute;
  const col = g.attributes.color as BufferAttribute | undefined;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (const a of col ? [pos, col] : [pos]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A small boat's hull: a long, faceted shell with a rim along its gunwale, its keel at y 0 and its bow toward +z. */
export function hull(len: number, wide: number, color: Color, trim: Color): Part[] {
  const g = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(wide / 2, 0.55, len / 2).translate(0, 0.5, 0);
  return [paint(g, color), box(wide * 0.8, 0.07, len * 0.7, 0, 0.5, 0, trim)];
}

/** Corners of a flat quad as two triangles, facing the way a-b-c turns counter-clockwise. */
function quad(out: number[], a: number[], b: number[], c: number[], d: number[]): void {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

/**
 * A gabled roof on y: the ridge runs along z (or along x with `ridgeX`), `span` wide across the
 * eaves and `len` long, `h` tall, with its eaves overhanging. The slopes take `roof`, the gable ends
 * `wall`, the soffit a darker tone.
 */
export function gable(span: number, len: number, h: number, x: number, y: number, z: number, roof: Color, wall: Color, o: { overhang?: number; ridgeX?: boolean } = {}): Part {
  const over = o.overhang ?? 0.45;
  const a = span / 2 + over;
  const b = len / 2 + over * 0.6;
  const pos: number[] = [];
  const col: number[] = [];
  const paintFrom = (from: number, c: Color) => {
    for (let i = from; i < pos.length; i += 3) col.push(c.r, c.g, c.b);
  };
  let s0 = pos.length;
  // Slopes (the eave at y 0 and the ridge at y h).
  quad(pos, [-a, 0, -b], [-a, 0, b], [0, h, b], [0, h, -b]);
  quad(pos, [a, 0, b], [a, 0, -b], [0, h, -b], [0, h, b]);
  paintFrom(s0, roof);
  s0 = pos.length;
  // The gable ends, set in a little from the eaves' ends.
  const ib = len / 2;
  const ia = span / 2;
  pos.push(-ia, 0, ib, ia, 0, ib, 0, h * (ia / a), ib);
  pos.push(ia, 0, -ib, -ia, 0, -ib, 0, h * (ia / a), -ib);
  paintFrom(s0, wall);
  s0 = pos.length;
  // The soffit.
  quad(pos, [-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]);
  paintFrom(s0, tone(roof, 0.55));
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (o.ridgeX) g.rotateY(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
