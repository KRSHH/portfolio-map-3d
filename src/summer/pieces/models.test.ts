import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import { seededRandom } from "../../data/layout";
import { PIECE_INFO, PIECE_KINDS } from "./kinds";
import type { Part } from "./kit";
import { PIECE_MODELS, townPieces, type PieceModel } from "./models";

const build = (kind: (typeof PIECE_KINDS)[number]) => PIECE_MODELS[kind](townPieces(), seededRandom(7));

/** Every part a model stands on the ground with (not its boats, not what turns: those are placed apart). */
const standing = (m: PieceModel): Part[] => [...m.parts, ...(m.glass ?? []), ...(m.panes ?? []), ...(m.lit ?? []), ...(m.loose ?? []).flatMap((l) => [...l.parts, ...(l.lit ?? [])])];

describe("the set pieces' models", () => {
  it("has a model for every kind, and only those", () => {
    expect(Object.keys(PIECE_MODELS).sort()).toEqual([...PIECE_KINDS].sort());
  });

  for (const kind of PIECE_KINDS) {
    describe(kind, () => {
      const m = build(kind);

      it("is made of painted, unindexed parts that merge into one mesh", () => {
        const parts = [...standing(m), ...(m.turn?.parts ?? []), ...(m.afloat ?? []).flatMap((b) => b.parts)];
        expect(parts.length).toBeGreaterThan(0);
        for (const g of parts) {
          expect(g.index).toBeNull();
          expect(g.attributes.position.count).toBe(g.attributes.color.count);
          expect(g.attributes.uv).toBeUndefined();
        }
      });

      it("keeps within its footprint, colliders included (the pier's deck runs on out to sea)", () => {
        const fp = PIECE_INFO[kind].footprint;
        const box = new Box3();
        for (const g of standing(m)) {
          g.computeBoundingBox();
          box.union(g.boundingBox!);
        }
        const reach = kind === "pier" ? 40 : fp;
        expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(fp + 1);
        expect(-box.min.z).toBeLessThanOrEqual(fp + 1);
        expect(box.max.z).toBeLessThanOrEqual(reach + 1);
        for (const c of m.colliders) expect(Math.hypot(c.x, c.z) + c.r).toBeLessThanOrEqual(fp + 1);
        for (const b of m.boxes ?? []) expect(Math.hypot(Math.abs(b.x) + b.hx, Math.abs(b.z) + b.hz)).toBeLessThanOrEqual(fp + 3.5);
      });

      it("is the same every time it is built", () => {
        const a = standing(build(kind)).map((g) => g.attributes.position.count);
        const b = standing(build(kind)).map((g) => g.attributes.position.count);
        expect(a).toEqual(b);
      });
    });
  }

  it("gives the landmarks something the kid bumps into", () => {
    for (const kind of ["lighthouse", "windmill", "tower", "observatory", "greenhouse", "huts", "boathouse"] as const) {
      const m = build(kind);
      expect(m.colliders.length + (m.boxes?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});
