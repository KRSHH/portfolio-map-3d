import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchContext, type VisibilitySource } from "./contextWatch.ts";

class FakeDoc extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = "visible";
  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

describe("watchContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const canvas = new EventTarget();
    const doc = new FakeDoc();
    const hooks = { restored: vi.fn(), giveUp: vi.fn() };
    const stop = watchContext(canvas, hooks, 3000, doc);
    return { canvas, doc, hooks, stop };
  }

  it("redraws on restore and does not give up", () => {
    const { canvas, hooks } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(1000);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    vi.advanceTimersByTime(5000);
    expect(hooks.restored).toHaveBeenCalledOnce();
    expect(hooks.giveUp).not.toHaveBeenCalled();
  });

  it("gives up after the wait when no restore comes", () => {
    const { canvas, hooks } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(2999);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.giveUp).toHaveBeenCalledOnce();
  });

  it("does not count hidden time", () => {
    const { canvas, doc, hooks } = setup();
    doc.set("hidden");
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(10000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    doc.set("visible");
    vi.advanceTimersByTime(3000);
    expect(hooks.giveUp).toHaveBeenCalledOnce();
  });

  it("stops watching", () => {
    const { canvas, hooks, stop } = setup();
    stop();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(10000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
  });
});
