/* startLive over a fake Realtime client: what this tab sends, and when. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveVisitor } from "./identity";
import { startLive, type LiveSession, type Pose } from "./presence";

type Handler = (...a: unknown[]) => void;

const net = vi.hoisted(() => {
  class FakeChannel {
    state = "joining";
    sent: unknown[] = [];
    tracks: unknown[] = [];
    present: Record<string, unknown[]> = {};
    private handlers: Record<string, Handler[]> = { presence: [], broadcast: [] };
    private onStatus: Handler = () => {};
    constructor(
      readonly name: string,
      readonly opts: { config: { presence: { key: string } } },
    ) {}
    on(type: string, _filter: unknown, cb: Handler) {
      this.handlers[type].push(cb);
      return this;
    }
    subscribe(cb: Handler) {
      this.onStatus = cb;
      return this;
    }
    send(a: unknown) {
      this.sent.push(a);
      return Promise.resolve("ok");
    }
    track(m: unknown) {
      this.tracks.push(m);
      return Promise.resolve("ok");
    }
    presenceState() {
      return this.present;
    }
    /* test controls */
    status(s: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") {
      this.state = s === "SUBSCRIBED" ? "joined" : s === "CLOSED" ? "closed" : "errored";
      this.onStatus(s);
    }
    sync(present: Record<string, unknown[]>) {
      this.present = present;
      this.handlers.presence.forEach((f) => f());
    }
    pose(payload: unknown) {
      this.handlers.broadcast.forEach((f) => f({ payload }));
    }
  }
  class RealtimeClient {
    connected = true;
    channels: FakeChannel[] = [];
    constructor(
      readonly url: string,
      readonly opts: unknown,
    ) {
      state.clients.push(this);
    }
    channel(name: string, opts: FakeChannel["opts"]) {
      const c = new FakeChannel(name, opts);
      this.channels.push(c);
      return c;
    }
    isConnected() {
      return this.connected;
    }
    removeChannel() {
      return Promise.resolve("ok");
    }
    disconnect() {
      return Promise.resolve("ok");
    }
  }
  const state = { clients: [] as RealtimeClient[], RealtimeClient };
  return state;
});
vi.mock("@supabase/realtime-js", () => ({ RealtimeClient: net.RealtimeClient }));

const visitor = deriveVisitor("visitor-0001-persistent-id");
let doc: { visibilityState: string; listeners: Handler[] };
let session: LiveSession | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
  net.clients.length = 0;
  doc = { visibilityState: "visible", listeners: [] };
  vi.stubGlobal("window", {
    location: { search: "?live=supabase" },
    setTimeout: (f: Handler, ms: number) => setTimeout(f, ms),
    clearTimeout: (t: number) => clearTimeout(t),
    setInterval: (f: Handler, ms: number) => setInterval(f, ms),
    clearInterval: (t: number) => clearInterval(t),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("document", {
    get visibilityState() {
      return doc.visibilityState;
    },
    addEventListener: (_t: string, f: Handler) => doc.listeners.push(f),
    removeEventListener: (_t: string, f: Handler) => (doc.listeners = doc.listeners.filter((g) => g !== f)),
  });
});

afterEach(() => {
  session?.close();
  session = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function start() {
  session = startLive(visitor);
  await vi.dynamicImportSettled();
  const client = net.clients[0];
  return { s: session, client, ch: () => client.channels[client.channels.length - 1] };
}

const at = (x: number, moving: boolean): Pose => ({ x, z: 0, heading: 0, moving, running: false, district: null });

/** Publish every frame (60 fps) for `ms`, walking or standing. Returns where the walker ends up. */
function frames(s: LiveSession, ms: number, from: number, moving: boolean): number {
  let x = from;
  for (let t = 0; t < ms; t += 16) {
    if (moving) x += 0.15;
    s.publish(at(x, moving));
    vi.advanceTimersByTime(16);
  }
  return x;
}

describe("live session over Supabase Realtime", () => {
  it("joins with a fresh per-tab id, never the stored visitor id", async () => {
    const { ch } = await start();
    const key = ch().opts.config.presence.key;
    expect(key).toMatch(/^[\w-]{8,64}$/);
    expect(key).not.toContain(visitor.id.slice(0, 8));
  });

  it("sends nothing until the channel is joined, and nothing while it is down", async () => {
    const { s, client, ch } = await start();
    let x = frames(s, 2000, 0, true);
    expect(ch().sent).toHaveLength(0);
    expect(ch().tracks).toHaveLength(0);
    expect(s.getState().status).toBe("connecting");

    ch().status("SUBSCRIBED");
    expect(s.getState().status).toBe("live");
    expect(ch().tracks).toHaveLength(1);
    x = frames(s, 1000, x, true);
    const walking = ch().sent.length;
    expect(walking).toBeGreaterThanOrEqual(7);
    expect(walking).toBeLessThanOrEqual(9);

    // The socket drops before realtime-js has told the channel: still nothing goes out.
    client.connected = false;
    x = frames(s, 1000, x, true);
    expect(ch().sent).toHaveLength(walking);
    client.connected = true;

    ch().sync({ "other-explorer-1": [{ name: "Calm Heron 31", pose: { x: 5, z: 5 } }] });
    expect(s.getState().others).toHaveLength(1);
    ch().status("CHANNEL_ERROR");
    expect(s.getState().status).toBe("error");
    expect(s.getState().others).toHaveLength(0);
    frames(s, 2000, x, true);
    expect(ch().sent).toHaveLength(walking);
    expect(ch().tracks).toHaveLength(1);

    // realtime-js rejoins on its own; the session goes live again.
    ch().status("SUBSCRIBED");
    expect(s.getState().status).toBe("live");
    expect(ch().tracks).toHaveLength(2);
  });

  it("is silent while standing; re-tracks on stopping at most every 30 s", async () => {
    const { s, ch } = await start();
    ch().status("SUBSCRIBED");
    let x = frames(s, 1000, 0, true);
    const sent = ch().sent.length;
    // Stop: one pose saying so, and a presence re-track held back to 30 s after the first track.
    x = frames(s, 120000, x, false);
    expect(ch().sent.length - sent).toBe(1);
    expect(ch().tracks).toHaveLength(2);
    expect((ch().tracks[1] as { pose: Pose }).pose.x).toBeCloseTo(x, 1);

    // Walk and stop again, well past the window: re-tracked right away.
    x = frames(s, 500, x, true);
    frames(s, 1000, x, false);
    expect(ch().tracks).toHaveLength(3);
    // ...and a second stop inside the window waits for the next slot.
    x = frames(s, 500, x, true);
    frames(s, 1000, x, false);
    expect(ch().tracks).toHaveLength(3);
    frames(s, 30000, x, false);
    expect(ch().tracks).toHaveLength(4);
  });

  it("sends nothing while the tab is hidden, and re-announces when it is shown", async () => {
    const { s, ch } = await start();
    ch().status("SUBSCRIBED");
    vi.advanceTimersByTime(60000);
    doc.visibilityState = "hidden";
    doc.listeners.forEach((f) => f());
    frames(s, 3000, 0, true);
    vi.advanceTimersByTime(300000);
    expect(ch().sent).toHaveLength(0);
    expect(ch().tracks).toHaveLength(1);
    doc.visibilityState = "visible";
    doc.listeners.forEach((f) => f());
    expect(ch().tracks).toHaveLength(2);
  });

  it("repeats a teleport so others can confirm it", async () => {
    const { s, ch } = await start();
    ch().status("SUBSCRIBED");
    frames(s, 1000, 0, false);
    const before = ch().sent.length;
    frames(s, 1000, 400, false);
    const after = ch().sent.slice(before) as { payload: { pose: Pose } }[];
    expect(after).toHaveLength(3);
    for (const m of after) expect(m.payload.pose.x).toBe(400);
  });

  it("opens a new channel after the service closes one, instead of waiting forever", async () => {
    const { s, client, ch } = await start();
    ch().status("SUBSCRIBED");
    ch().status("CLOSED");
    expect(s.getState().status).toBe("error");
    expect(client.channels).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(client.channels).toHaveLength(2);
    ch().status("SUBSCRIBED");
    expect(s.getState().status).toBe("live");
  });

  it("places standing explorers from presence, follows their next stop, and prefers live poses", async () => {
    const { s, ch } = await start();
    ch().status("SUBSCRIBED");
    const meta = (x: number) => ({ "other-explorer-1": [{ name: "Calm Heron 31", pose: { x, z: 0 } }] });
    const x = () => s.getState().others[0].pose?.x;
    ch().sync(meta(5));
    expect(x()).toBe(5);
    // They walked off and stopped far away; their deferred re-track arrives as a new presence.
    ch().sync(meta(300));
    expect(x()).toBe(300);
    // Once live poses arrive they take over: an older presence never pulls the explorer back.
    vi.advanceTimersByTime(500);
    ch().pose({ id: "other-explorer-1", pose: { x: 301, z: 0, moving: true } });
    expect(x()).toBe(301);
    ch().sync(meta(300));
    expect(x()).toBe(301);
  });

  it("shows only generated names, and a full list makes room for someone who moves", async () => {
    const { s, ch } = await start();
    ch().status("SUBSCRIBED");
    const present: Record<string, unknown[]> = {};
    for (let i = 0; i < 60; i++) present[`fake-explorer-${i}`] = [{ name: i ? "Calm Heron 31" : "Map Staff: claim a prize" }];
    ch().sync(present);
    expect(s.getState().others).toHaveLength(60);
    expect(s.getState().others[0].name).toBe("Explorer");
    expect(s.getState().others[1].name).toBe("Calm Heron 31");

    vi.advanceTimersByTime(12000);
    ch().sync({ ...present, "real-explorer-1": [{ name: "Swift Otter 77", pose: { x: 1, z: 1 } }] });
    expect(s.getState().others.map((o) => o.id)).not.toContain("real-explorer-1");
    // Moving proves they are there: the explorer quiet the longest gives up their place.
    ch().pose({ id: "real-explorer-1", pose: { x: 2, z: 1, moving: true } });
    const ids = s.getState().others.map((o) => o.id);
    expect(ids).toHaveLength(60);
    expect(ids).toContain("real-explorer-1");
    expect(s.getState().others.find((o) => o.id === "real-explorer-1")?.name).toBe("Swift Otter 77");
  });
});
