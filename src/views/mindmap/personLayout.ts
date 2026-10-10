/* Deterministic geometry for the people globe.

   The people have no regions and no order that means anything on a sphere, so they are spread
   evenly: a Fibonacci spiral, relaxed by mutual repulsion until neighbors are about equally far
   apart. They are kept to a band around the globe's spin equator (BAND, as a share of the
   sphere's height) so that every person passes in front of the viewer as the globe turns; with
   18 people that settles into rows of 5, 8 and 5, about 45 degrees apart. The local +Y axis is
   the spin axis (spinAxisFor() returns it for a layout without regions). Pure functions,
   unit-tested; nothing here links a person to a company, district or industry. */
import type { Person } from "../../data/types";
import { GOLDEN_ANGLE, angleBetween, type GlobeLayoutOf, type GlobeNodeBase, type Vec3 } from "./globeLayout";

/** People sit within this height of the equator (0.7 = about 44 degrees of latitude). */
export const BAND = 0.7;
const RELAX_STEPS = 600;

export interface PersonNode extends GlobeNodeBase {
  person: Person;
}

function clampToBand(p: Vec3, band: number): Vec3 {
  if (Math.abs(p[1]) <= band) return p;
  const y = Math.sign(p[1]) * band;
  const r = Math.sqrt(1 - y * y);
  const h = Math.hypot(p[0], p[2]) || 1;
  return [(p[0] / h) * r, y, (p[2] / h) * r];
}

/** n unit vectors spread evenly over the band |y| <= band: a Fibonacci spiral, then relaxed by repulsion. */
export function bandPoints(n: number, band = BAND, steps = RELAX_STEPS): Vec3[] {
  const p: Vec3[] = [];
  for (let k = 0; k < n; k++) {
    const y = band * (1 - (2 * k + 1) / n);
    const r = Math.sqrt(1 - y * y);
    p.push([r * Math.cos(k * GOLDEN_ANGLE), y, r * Math.sin(k * GOLDEN_ANGLE)]);
  }
  if (n < 2) return p;
  const f: Vec3[] = p.map(() => [0, 0, 0]);
  for (let it = 0; it < steps; it++) {
    // A step that shrinks as the points settle; every point moves the same distance each step.
    const step = 0.02 * (1 - it / steps) + 0.002;
    for (let i = 0; i < n; i++) {
      const fi = f[i];
      fi[0] = fi[1] = fi[2] = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = p[i][0] - p[j][0];
        const dy = p[i][1] - p[j][1];
        const dz = p[i][2] - p[j][2];
        const l2 = dx * dx + dy * dy + dz * dz || 1e-9;
        const k = 1 / (l2 * Math.sqrt(l2));
        fi[0] += dx * k;
        fi[1] += dy * k;
        fi[2] += dz * k;
      }
    }
    for (let i = 0; i < n; i++) {
      const fl = Math.hypot(f[i][0], f[i][1], f[i][2]) || 1;
      const q: Vec3 = [p[i][0] + (f[i][0] / fl) * step, p[i][1] + (f[i][1] / fl) * step, p[i][2] + (f[i][2] / fl) * step];
      const l = Math.hypot(q[0], q[1], q[2]) || 1;
      p[i] = clampToBand([q[0] / l, q[1] / l, q[2] / l], band);
    }
  }
  return p;
}

function round(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

/** The people globe: one node per person, in the order given, evenly spread; no regions. */
export function personGlobeLayout(people: Person[], band = BAND): GlobeLayoutOf<PersonNode> {
  const pts = bandPoints(people.length, band);
  const nodes: PersonNode[] = people.map((person, index) => ({ person, index, slug: person.slug, region: -1, secondary: [], dir: pts[index].map(round) as Vec3 }));
  let spacing = Math.PI;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) spacing = Math.min(spacing, angleBetween(nodes[i].dir, nodes[j].dir));
  return { regions: [], nodes, regionIndex: new Map(), nodeIndex: new Map(nodes.map((nd) => [nd.slug, nd.index])), spacing, gap: 0, coverage: 0 };
}
