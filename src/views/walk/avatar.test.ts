import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GEAR, HATS, deriveVisitor, type AvatarSpec } from "../../live/identity";
import { buildAvatar, gearParts, hatParts, specKey } from "./avatar";

const accent = new THREE.Color("#ff8a3d");
const body = new THREE.Color("#2a78d6");

function vertexCount(parts: THREE.BufferGeometry[]): number {
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  parts.forEach((g) => g.dispose());
  return n;
}

/** Sorted vertex colors of a built avatar: a fingerprint of how it looks. */
function colorPrint(spec: AvatarSpec): string {
  const a = buildAvatar(spec);
  const seen = new Set<string>();
  a.root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    const c = g?.attributes.color;
    if (!c) return;
    for (let i = 0; i < c.count; i += 3) seen.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
  });
  a.dispose();
  return [...seen].sort().join(";");
}

describe("avatar builder", () => {
  it("has six distinct hats (one of them none) and four kinds of gear (one of them none)", () => {
    const hats = HATS.map((h) => vertexCount(hatParts(h, accent, body)));
    expect(hats).toHaveLength(6);
    expect(hats[HATS.indexOf("none")]).toBe(0);
    expect(new Set(hats).size).toBe(6);
    const gear = GEAR.map((g) => vertexCount(gearParts(g, accent, body)));
    expect(gear).toHaveLength(4);
    expect(gear[GEAR.indexOf("none")]).toBe(0);
    expect(new Set(gear).size).toBe(4);
  });

  it("builds an explorer about 1.8 units tall standing on y=0", () => {
    const a = buildAvatar(deriveVisitor("visitor-height-check").avatar);
    a.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(a.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.1);
    expect(box.max.y).toBeGreaterThan(1.6);
    expect(box.max.y).toBeLessThan(2.4);
    a.dispose();
  });

  it("draws different visitors differently and the same visitor the same", () => {
    const one = deriveVisitor("11111111-aaaa").avatar;
    const two = deriveVisitor("22222222-bbbb").avatar;
    expect(specKey(one)).not.toBe(specKey(two));
    expect(colorPrint(one)).not.toBe(colorPrint(two));
    expect(colorPrint(one)).toBe(colorPrint({ ...one }));
  });

  it("walks: the legs swing while moving and rest when idle or with reduced motion", () => {
    const a = buildAvatar(deriveVisitor("walker-1").avatar);
    const legs = () => {
      const figure = a.root.children[0];
      return [figure.children[0].rotation.x, figure.children[1].rotation.x];
    };
    // The gait starts at a random phase, so the last frame alone can land on a zero crossing:
    // check the widest swing over the half second instead.
    let widest = 0;
    for (let i = 0; i < 30; i++) {
      a.animate(1 / 60, i / 60, 1, false);
      const [l, r] = legs();
      widest = Math.max(widest, Math.abs(l) + Math.abs(r));
    }
    expect(widest).toBeGreaterThan(0.05);
    a.animate(1 / 60, 1, 1, true);
    expect(legs()).toEqual([0, 0]);
    a.dispose();
  });
});
