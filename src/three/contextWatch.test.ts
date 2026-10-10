import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { watchContext, type VisibilitySource } from "./contextWatch";

class FakeDoc extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = "visible";
  set(v: DocumentVisibilityState) {
    this.visibilityState = v;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

describe("watchContext", () => {
  let canvas: EventTarget;
  let doc: FakeDoc;
  let hooks: { restored: Mock<() => void>; giveUp: Mock<() => void> };
  beforeEach(() => {
    vi.useFakeTimers();
    canvas = new EventTarget();
    doc = new FakeDoc();
    hooks = { restored: vi.fn<() => void>(), giveUp: vi.fn<() => void>() };
  });
  afterEach(() => vi.useRealTimers());
  const lose = () => canvas.dispatchEvent(new Event("webglcontextlost"));
  const restore = () => canvas.dispatchEvent(new Event("webglcontextrestored"));

  it("wakes the view when the context comes back, and does not give up", () => {
    watchContext(canvas, hooks, 1000, doc);
    lose();
    vi.advanceTimersByTime(500);
    restore();
    vi.advanceTimersByTime(5000);
    expect(hooks.restored).toHaveBeenCalledTimes(1);
    expect(hooks.giveUp).not.toHaveBeenCalled();
  });

  it("gives up once, after the wait, when the context never comes back", () => {
    watchContext(canvas, hooks, 1000, doc);
    lose();
    vi.advanceTimersByTime(999);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.giveUp).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(hooks.giveUp).toHaveBeenCalledTimes(1);
  });

  it("does not count time spent hidden", () => {
    watchContext(canvas, hooks, 1000, doc);
    doc.set("hidden");
    lose();
    vi.advanceTimersByTime(60_000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    doc.set("visible");
    vi.advanceTimersByTime(999);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    doc.set("hidden");
    vi.advanceTimersByTime(60_000);
    doc.set("visible");
    restore();
    vi.advanceTimersByTime(60_000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    expect(hooks.restored).toHaveBeenCalledTimes(1);
  });

  it("stops watching when disposed", () => {
    const stop = watchContext(canvas, hooks, 1000, doc);
    lose();
    stop();
    vi.advanceTimersByTime(5000);
    restore();
    expect(hooks.giveUp).not.toHaveBeenCalled();
    expect(hooks.restored).not.toHaveBeenCalled();
  });
});
