import { describe, expect, it } from "vitest";
import { AdaptiveDpr, budgetDpr } from "./adaptiveDpr";

/** Feed `seconds` of frames at `fps`; returns every change reported. */
function run(a: AdaptiveDpr, fps: number, seconds: number): number[] {
  const out: number[] = [];
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) {
    const v = a.sample(dt);
    if (v !== null) out.push(v);
  }
  return out;
}

describe("AdaptiveDpr", () => {
  it("leaves a smooth device at full resolution", () => {
    const a = new AdaptiveDpr();
    expect(run(a, 60, 30)).toEqual([]);
    expect(a.value).toBe(1);
  });

  it("steps down a device that takes seconds per frame", () => {
    const a = new AdaptiveDpr({ min: 0.6, warmup: 2, interval: 3 });
    expect(run(a, 0.5, 40)).toEqual([0.9, 0.8, 0.7, 0.6]);
  });

  it("judges the typical frame, not a hitch", () => {
    const a = new AdaptiveDpr({ warmup: 0, interval: 3 });
    for (let i = 0; i < 10; i++) {
      run(a, 50, 2);
      a.sample(1);
    }
    expect(a.value).toBe(1);
  });

  it("ignores a long gap (a tab coming back from the background)", () => {
    const a = new AdaptiveDpr({ warmup: 0, interval: 1 });
    run(a, 60, 2);
    expect(a.sample(600)).toBeNull();
    expect(run(a, 60, 3)).toEqual([]);
    expect(a.value).toBe(1);
  });

  it("waits out the start before judging", () => {
    const a = new AdaptiveDpr({ warmup: 2, interval: 3 });
    expect(run(a, 20, 4.9)).toEqual([]);
    expect(a.value).toBe(1);
  });

  it("steps down a struggling device to its floor, one step per interval", () => {
    const a = new AdaptiveDpr({ min: 0.6, step: 0.1, interval: 3, warmup: 2 });
    const changes = run(a, 25, 2 + 3 * 6);
    expect(changes).toEqual([0.9, 0.8, 0.7, 0.6]);
    expect(a.value).toBe(0.6);
  });

  it("steps back up once the device keeps up", () => {
    const a = new AdaptiveDpr({ interval: 3, warmup: 0 });
    run(a, 25, 6.1);
    expect(a.value).toBe(0.8);
    run(a, 60, 6.1);
    expect(a.value).toBe(1);
  });

  it("holds once it keeps changing direction", () => {
    const a = new AdaptiveDpr({ interval: 1, warmup: 0, flipLimit: 3 });
    for (let i = 0; i < 6; i++) run(a, i % 2 ? 60 : 20, 1.01);
    expect(a.holding).toBe(true);
    const held = a.value;
    run(a, 10, 10);
    expect(a.value).toBe(held);
  });

  it("ignores bad input", () => {
    const a = new AdaptiveDpr({ warmup: 0, interval: 1 });
    for (const dt of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY]) expect(a.sample(dt)).toBeNull();
    expect(run(a, 60, 2)).toEqual([]);
    expect(a.value).toBe(1);
  });
});

describe("budgetDpr", () => {
  it("keeps the device ratio when the buffer fits the budget", () => {
    expect(budgetDpr(2, 1440, 900, 2.5, 8_000_000)).toBe(2);
  });
  it("caps it", () => {
    expect(budgetDpr(3, 390, 844, 2.5, 8_000_000)).toBe(2.5);
  });
  it("trims a large window to the pixel budget, never below 1", () => {
    const r = budgetDpr(2, 2560, 1440, 2.5, 5_000_000);
    expect(2560 * 1440 * r * r).toBeLessThanOrEqual(5_000_001);
    expect(budgetDpr(2, 8000, 8000, 2.5, 1_000_000)).toBe(1);
    expect(budgetDpr(Number.NaN, 100, 100, 2, 1e6)).toBe(1);
  });
});
