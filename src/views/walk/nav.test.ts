import { describe, expect, it } from "vitest";
import { PEOPLE, DISTRICTS, COMPANIES } from "../../data/catalog";
import { PEOPLE_AREA, layoutWorld } from "../../data/layout";
import {
  AVATAR_RADIUS,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  arrivalFly,
  cameraRelative,
  clearPitch,
  districtEntrance,
  headingTo,
  lookLift,
  nearClutter,
  pitchFor,
  resolveCollisions,
  standNear,
  toBoxFrame,
  type Box,
  type Circle,
} from "./nav";

const layout = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);

describe("follow camera curve", () => {
  it("pitches up as it pulls back, within sane bounds", () => {
    expect(pitchFor(ZOOM_MIN)).toBeLessThan(pitchFor(ZOOM_DEFAULT));
    expect(pitchFor(ZOOM_DEFAULT)).toBeLessThan(pitchFor(ZOOM_MAX));
    expect(pitchFor(ZOOM_MIN)).toBeGreaterThan(0.1);
    expect(pitchFor(ZOOM_MAX)).toBeLessThan(Math.PI / 2 - 0.2);
  });
  it("aims above the walker when close and straight at it when far", () => {
    expect(lookLift(ZOOM_MIN)).toBeGreaterThan(lookLift(ZOOM_DEFAULT));
    expect(lookLift(ZOOM_MAX)).toBe(0);
  });
});

describe("camera-relative movement", () => {
  it("forward walks away from the camera", () => {
    // Camera due south of the walker (+z): forward is -z.
    const f = cameraRelative(1, 0, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    // Right is +x when looking toward -z.
    const r = cameraRelative(0, 1, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });
  it("rotates with the camera", () => {
    // Camera due east (+x): forward is -x.
    const f = cameraRelative(1, 0, Math.PI / 2);
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });
  it("does not walk faster on diagonals", () => {
    const d = cameraRelative(1, 1, 0.7);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
  it("headingTo matches the avatar's rotation.y convention (0 faces +z)", () => {
    expect(headingTo(0, 0, 0, 5)).toBeCloseTo(0);
    expect(headingTo(0, 0, 5, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe("collisions", () => {
  const post: Circle = { x: 10, z: 10, r: 0.7 };
  it("pushes the walker out of a circle", () => {
    const p = resolveCollisions(layout, 10.2, 10, [post], []);
    expect(Math.hypot(p.x - post.x, p.z - post.z)).toBeGreaterThanOrEqual(post.r + AVATAR_RADIUS - 1e-6);
  });
  it("pushes the walker out of the hub's box along the shallow side", () => {
    const box = { x: 0, z: 0, hx: 6, hz: 4 };
    const p = resolveCollisions(layout, 1, 3.8, [], [box]);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(4 + AVATAR_RADIUS);
  });
  it("pushes the walker out of a rotated box square to its walls", () => {
    const box: Box = { x: 3, z: -2, hx: 6, hz: 2, rot: 0.6 };
    // A point just inside the box's local +z wall, 1 along it.
    const c = Math.cos(box.rot!);
    const s = Math.sin(box.rot!);
    const at = (lx: number, lz: number) => ({ x: box.x + lx * c + lz * s, z: box.z - lx * s + lz * c });
    const inside = at(1, 1.8);
    const p = resolveCollisions(layout, inside.x, inside.z, [], [box]);
    const local = toBoxFrame(box, p.x, p.z);
    expect(local.lx).toBeCloseTo(1);
    expect(local.lz).toBeCloseTo(2 + AVATAR_RADIUS);
    // Outside the rotated box, though inside its axis-aligned bounds: left alone.
    const corner = at(0, 3.5);
    const q = resolveCollisions(layout, corner.x, corner.z, [], [box]);
    expect(q.x).toBeCloseTo(corner.x);
    expect(q.z).toBeCloseTo(corner.z);
  });
  it("treats rot 0 exactly like an axis-aligned box", () => {
    const a = resolveCollisions(layout, 1, 3.8, [], [{ x: 0, z: 0, hx: 6, hz: 4 }]);
    const b = resolveCollisions(layout, 1, 3.8, [], [{ x: 0, z: 0, hx: 6, hz: 4, rot: 0 }]);
    expect(b).toEqual(a);
  });
  it("leaves the walker outside both of two touching rotated boxes", () => {
    const rot = 0.7;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    // Two boxes side by side along their shared local x axis, touching at local x = 0.
    const left: Box = { x: -4 * c, z: 4 * s, hx: 4, hz: 3, rot };
    const right: Box = { x: 3 * c, z: -3 * s, hx: 3, hz: 6, rot };
    // A point in the inside corner where the short box meets the tall one.
    const lx = -0.2;
    const lz = 3.1;
    const p = resolveCollisions(layout, lx * c + lz * s, -lx * s + lz * c, [], [left, right]);
    for (const b of [left, right]) {
      const l = toBoxFrame(b, p.x, p.z);
      expect(Math.abs(l.lx) >= b.hx + AVATAR_RADIUS - 1e-6 || Math.abs(l.lz) >= b.hz + AVATAR_RADIUS - 1e-6).toBe(true);
    }
  });
  it("keeps the walker on the island", () => {
    const p = resolveCollisions(layout, layout.islandRadius * 3, 0, [], []);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(layout.islandRadius);
  });
});

describe("fly targets", () => {
  it("stands ~4 units from a company's pin, facing it, clear of other pins", () => {
    const circles: Circle[] = [...layout.pins.values()].map((p) => ({ x: p.x, z: p.z, r: 0.7 }));
    expect(COMPANIES.length).toBeGreaterThan(0);
    for (const m of COMPANIES) {
      const pin = layout.pins.get(m.slug)!;
      const disc = layout.discs.find((d) => d.slug === pin.district)!;
      const s = standNear(layout, pin, disc, circles, []);
      expect(Math.hypot(s.x - pin.x, s.z - pin.z)).toBeCloseTo(4, 0);
      expect(Math.abs(Math.atan2(Math.sin(s.heading - headingTo(s.x, s.z, pin.x, pin.z)), Math.cos(s.heading - headingTo(s.x, s.z, pin.x, pin.z))))).toBeLessThan(1e-6);
      for (const c of circles) expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThanOrEqual(c.r + AVATAR_RADIUS - 0.01);
    }
  });
  it("never stands inside a rotated building", () => {
    const pin = { x: 0, z: 40 };
    // A long rotated block right beside the pin, covering the default (outward) spot.
    const block: Box = { x: 0, z: 46, hx: 9, hz: 2.5, rot: 0.4 };
    const s = standNear(layout, pin, null, [], [block]);
    const l = toBoxFrame(block, s.x, s.z);
    expect(Math.abs(l.lx) >= block.hx + AVATAR_RADIUS || Math.abs(l.lz) >= block.hz + AVATAR_RADIUS).toBe(true);
    expect(Math.hypot(s.x - pin.x, s.z - pin.z)).toBeCloseTo(4, 0);
  });

  it("stands ~4 units from a person's pin in the People area, facing it, clear of other pins", () => {
    const circles: Circle[] = [...layout.pins.values()].map((p) => ({ x: p.x, z: p.z, r: 0.7 }));
    const area = layout.discs.find((d) => d.slug === PEOPLE_AREA)!;
    for (const c of PEOPLE) {
      const pin = layout.pins.get(c.slug)!;
      const s = standNear(layout, pin, area, circles, [], { yawOffset: 0.45, tilt: 0.08, cameraDistance: 16 });
      expect(Math.hypot(s.x - pin.x, s.z - pin.z)).toBeCloseTo(4, 0);
      expect(s.heading).toBeCloseTo(headingTo(s.x, s.z, pin.x, pin.z));
      for (const k of circles) expect(Math.hypot(s.x - k.x, s.z - k.z)).toBeGreaterThanOrEqual(k.r + AVATAR_RADIUS - 0.01);
    }
  });
  it("prefers a spot where the camera isn't looking through a tree", () => {
    const pin = { x: 0, z: 40 };
    // A tall tree right behind the default (outward) spot.
    const tree: Circle = { x: 0, z: 52, r: 1.5, h: 6 };
    const s = standNear(layout, pin, null, [], [], { blockers: [tree], cameraDistance: 16 });
    const lift = clearPitch(s.x, 1.2, s.z, s.heading + Math.PI, pitchFor(16), 16, [tree]) - pitchFor(16);
    expect(lift).toBeLessThan(1e-6);
  });
  it("still stands ~4 units from the pin, facing it, when the camera looks over the shoulder", () => {
    const circles: Circle[] = [...layout.pins.values()].map((p) => ({ x: p.x, z: p.z, r: 0.7 }));
    for (const m of COMPANIES) {
      const pin = layout.pins.get(m.slug)!;
      const disc = layout.discs.find((d) => d.slug === pin.district)!;
      const s = standNear(layout, pin, disc, circles, [], { yawOffset: 0.45, tilt: 0.08, cameraDistance: 16 });
      expect(Math.hypot(s.x - pin.x, s.z - pin.z)).toBeCloseTo(4, 0);
      expect(s.heading).toBeCloseTo(headingTo(s.x, s.z, pin.x, pin.z));
    }
  });
  it("prefers a spot without a tree crowding the foreground, even one that hides nothing", () => {
    const pin = { x: 0, z: 40 };
    // Beside the sight line of the default (outward, +z) spot, a few units in front of its camera.
    const tree: Circle = { x: 3.2, z: 54, r: 1.8, h: 5.5 };
    const s = standNear(layout, pin, null, [], [], { blockers: [tree], cameraDistance: 16 });
    expect(nearClutter(s.x, s.z, s.heading + Math.PI, Math.cos(pitchFor(16)) * 16, [tree])).toBe(0);
  });
  it("enters a district on its road, facing its center", () => {
    for (const disc of layout.discs) {
      const e = districtEntrance(disc);
      const along = Math.hypot(e.x, e.z);
      expect(along).toBeLessThan(Math.hypot(disc.x, disc.z));
      expect(Math.hypot(e.x - disc.x, e.z - disc.z)).toBeLessThan(disc.r);
      expect(e.heading).toBeCloseTo(headingTo(e.x, e.z, disc.x, disc.z));
    }
  });
});

describe("nearClutter", () => {
  it("counts tall things in the near half of the view, not behind the walker or far to the side", () => {
    // Camera at yaw 0 sits toward +z, 15 back.
    expect(nearClutter(0, 0, 0, 15, [])).toBe(0);
    expect(nearClutter(0, 0, 0, 15, [{ x: 3, z: 11, r: 1.8, h: 5 }])).toBeGreaterThan(0);
    expect(nearClutter(0, 0, 0, 15, [{ x: 0, z: -6, r: 1.8, h: 5 }])).toBe(0);
    expect(nearClutter(0, 0, 0, 15, [{ x: 12, z: 11, r: 1.8, h: 5 }])).toBe(0);
  });
});

describe("clearPitch", () => {
  it("raises the camera only for obstacles between it and the walker", () => {
    const base = 0.3;
    // Camera at yaw 0 sits toward +z. A tree at +z blocks; one at -z does not.
    expect(clearPitch(0, 1.2, 0, 0, base, 22, [{ x: 0, z: 8, r: 1.5, h: 5 }])).toBeGreaterThan(base);
    expect(clearPitch(0, 1.2, 0, 0, base, 22, [{ x: 0, z: -8, r: 1.5, h: 5 }])).toBe(base);
    // Low things never matter.
    expect(clearPitch(0, 1.2, 0, 0, base, 22, [{ x: 0, z: 8, r: 1, h: 0.8 }])).toBe(base);
  });
});

describe("arrivalFly", () => {
  it("goes to the open company, not to an older district or Overview fly", () => {
    expect(arrivalFly("signalforge", { kind: "district", slug: "health", nonce: 5 })).toEqual({ kind: "company", slug: "signalforge", nonce: 5 });
    expect(arrivalFly("signalforge", { kind: "home", nonce: 7 })).toEqual({ kind: "company", slug: "signalforge", nonce: 7 });
    // A stale fly to another company loses too.
    expect(arrivalFly("signalforge", { kind: "company", slug: "brightpath-care", nonce: 3 })).toEqual({ kind: "company", slug: "signalforge", nonce: 3 });
  });

  it("replays a pending fly to the open company as is, and needs no fly to reach a company", () => {
    const pending = { kind: "company" as const, slug: "signalforge", nonce: 9 };
    expect(arrivalFly("signalforge", pending)).toBe(pending);
    expect(arrivalFly("signalforge", null)).toEqual({ kind: "company", slug: "signalforge", nonce: -1 });
  });

  it("acts on the pending fly when no company or person is open", () => {
    const district = { kind: "district" as const, slug: "health", nonce: 4 };
    expect(arrivalFly(null, district)).toBe(district);
    expect(arrivalFly(null, district, null)).toBe(district);
    expect(arrivalFly(null, null)).toBeNull();
  });

  it("goes to the open person the same way: a pending fly to them as is, anything older loses", () => {
    const pending = { kind: "person" as const, slug: "ada-lindqvist", nonce: 9 };
    // "See on the map", a deep link, a search pick: the person's own fly request.
    expect(arrivalFly(null, pending, "ada-lindqvist")).toBe(pending);
    // A person opened from a list card (no fly), then the Walk tab: an older fly is not replayed.
    expect(arrivalFly(null, { kind: "district", slug: "health", nonce: 5 }, "ada-lindqvist")).toEqual({ kind: "person", slug: "ada-lindqvist", nonce: 5 });
    expect(arrivalFly(null, { kind: "company", slug: "signalforge", nonce: 6 }, "ada-lindqvist")).toEqual({ kind: "person", slug: "ada-lindqvist", nonce: 6 });
    expect(arrivalFly(null, { kind: "person", slug: "marcus-oyelaran", nonce: 7 }, "ada-lindqvist")).toEqual({ kind: "person", slug: "ada-lindqvist", nonce: 7 });
    expect(arrivalFly(null, null, "ada-lindqvist")).toEqual({ kind: "person", slug: "ada-lindqvist", nonce: -1 });
  });
});
