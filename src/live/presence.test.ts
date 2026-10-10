import { describe, expect, it } from "vitest";
import { RUN_MULTIPLIER, WALK_SPEED } from "../data/layout";
import { admitPose, connectionId, evictable, plausibleMove, sanitizePose, type Pose, type RemoteExplorer } from "./presence";

const pose = (x: number, z: number, moving = true): Pose => ({ x, z, heading: 0, moving, running: false, district: null });
const explorer = (id = "explorer-1", seen = 0): RemoteExplorer => ({ id, name: "Explorer", avatar: {} as RemoteExplorer["avatar"], pose: null, samples: [], seen, jump: null });
const TOP = WALK_SPEED * RUN_MULTIPLIER;

describe("pose plausibility", () => {
  it("lets any real walk or run through, with margin for jitter", () => {
    // 125 ms of running, delivered on time, bunched up, or late.
    for (const dt of [0, 10, 125, 400, 2000]) expect(plausibleMove(pose(0, 0), pose(TOP * 0.125, 0), dt)).toBe(true);
    expect(plausibleMove(pose(0, 0), pose(TOP * 2, 0), 2000)).toBe(true);
    // Credit for elapsed time stops at 2 s: a minute of samples lost in a stall arrives as a jump,
    // which the samples that follow confirm (see admitPose).
    expect(plausibleMove(pose(0, 0), pose(TOP * 60, 0), 60000)).toBe(false);
  });

  it("refuses moves no explorer can make", () => {
    expect(plausibleMove(pose(0, 0), pose(200, 0), 125)).toBe(false);
    // Standing still for a minute doesn't let one sample drag an explorer across the world.
    expect(plausibleMove(pose(0, 0), pose(500, 500), 60000)).toBe(false);
  });
});

describe("admitPose", () => {
  it("places a newcomer at its first sample and follows a normal walk", () => {
    const r = explorer();
    expect(admitPose(r, pose(10, 10), 1000)).toBe(true);
    for (let i = 1; i <= 20; i++) expect(admitPose(r, pose(10 + i * 1.1, 10), 1000 + i * 125)).toBe(true);
    expect(r.pose?.x).toBeCloseTo(32);
    expect(r.samples).toHaveLength(8);
    expect(r.seen).toBe(1000 + 20 * 125);
  });

  it("ignores a lone forged sample under someone's id, and jitter between two places", () => {
    const r = explorer();
    admitPose(r, pose(0, 0), 0);
    expect(admitPose(r, pose(900, 900), 125)).toBe(false);
    expect(r.pose).toEqual(pose(0, 0));
    expect(r.seen).toBe(0);
    let t = 125;
    for (let i = 0; i < 40; i++) {
      t += 60;
      admitPose(r, i % 2 ? pose(0, 0) : pose(-700, 300), t);
    }
    expect(Math.hypot(r.pose!.x, r.pose!.z)).toBeLessThan(1);
  });

  it("follows a real teleport once the sender's repeats confirm it", () => {
    const r = explorer();
    admitPose(r, pose(0, 0, false), 0);
    expect(admitPose(r, pose(400, -250, false), 5000)).toBe(false);
    expect(admitPose(r, pose(400, -250, false), 5125)).toBe(false);
    expect(admitPose(r, pose(400, -250, false), 5250)).toBe(true);
    expect(r.pose).toEqual(pose(400, -250, false));
    // No interpolation across the world from the old spot.
    expect(r.samples).toHaveLength(1);
    expect(r.jump).toBeNull();
    // Walking on from there is ordinary again.
    expect(admitPose(r, pose(401, -250), 5375)).toBe(true);
  });
});

describe("evictable", () => {
  it("names the explorer heard from least recently, once it has been quiet for a while", () => {
    const list = [explorer("a-explorer", 5000), explorer("b-explorer", 1000), explorer("c-explorer", 9000)];
    expect(evictable(list, 30000)).toBe("b-explorer");
    expect(evictable(list, 10999)).toBeNull();
    expect(evictable(list, 11000)).toBe("b-explorer");
    expect(evictable([], 50000)).toBeNull();
  });
});

describe("connectionId", () => {
  it("is fresh, random and valid on the wire", () => {
    const ids = new Set(Array.from({ length: 200 }, connectionId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[\w-]{8,64}$/);
  });
});

describe("sanitizePose", () => {
  it("keeps only well-formed, bounded fields", () => {
    expect(sanitizePose({ x: 1, z: 2, heading: 0.5, moving: true, running: "yes", district: "health" })).toEqual({ x: 1, z: 2, heading: 0.5, moving: true, running: false, district: "health" });
    expect(sanitizePose({ x: 1e9, z: -1e9, district: "<b>" })).toEqual({ x: 2000, z: -2000, heading: 0, moving: false, running: false, district: null });
    expect(sanitizePose({ x: "1", z: 2 })).toBeNull();
    expect(sanitizePose({ x: NaN, z: 2 })).toBeNull();
    // An extreme heading is wrapped into (-pi, pi], so interpolating between two of them stays a number.
    const big = sanitizePose({ x: 0, z: 0, heading: 1.7e308 })!.heading;
    expect(Number.isFinite(big) && Math.abs(big) <= Math.PI).toBe(true);
    expect(sanitizePose({ x: 0, z: 0, heading: 0.5 + 4 * Math.PI })!.heading).toBeCloseTo(0.5, 9);
    expect(sanitizePose(null)).toBeNull();
  });
});
