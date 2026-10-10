/* Live explorers: who else is walking the company world right now.

   Transport, chosen at start:
   - "supabase": Supabase Realtime (presence + broadcast) on one public channel.
     vite.config.ts injects the project URL, the publishable key and the channel
     name at build time: production deploys use the production channel, every
     other build (Vercel previews, local builds, CI) a separate preview channel.
     The dev server stays off unless the URL says ?live=supabase.
     No database tables are touched.
   - "local": BroadcastChannel between tabs of the same browser — for
     development and tests. Enable with ?live=local.
   - "off": nothing configured, or ?live=off; the world stays single-player and says so.

   What is sent: a random id made fresh for this tab (never the visitor id kept in
   the browser), the generated name and avatar, and the explorer's in-world pose
   (x, z, heading, moving, running, district). Nothing else.
   Poses are throttled (≈8/s while moving). After the pose that says the explorer
   stopped, standing still sends nothing, and a hidden tab sends nothing. Presence
   (which carries the standing pose for newcomers) is re-tracked when the explorer
   comes to a stop, at most every 30 s, and when the tab is shown again. (The local
   transport keeps a 5 s heartbeat: it has no presence service.)

   Everything received is validated before use. Ids are chosen by each client and
   cannot be authenticated on a public channel: anyone holding the public key can
   claim any id, name or pose. So names must match the generator's grammar,
   moves faster than any explorer can run are held back, and a full list makes
   room by dropping the explorer heard from least recently. */
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { RUN_MULTIPLIER, WALK_SPEED } from "../data/layout";
import { sanitizeAvatar, sanitizeName, type AvatarSpec, type Visitor } from "./identity";

/* Injected by vite.config.ts (`define`). Never read import.meta.env as a whole object:
   Vite would inline every exposed variable into the bundle. */
declare const __LIVE_URL__: string;
declare const __LIVE_KEY__: string;
declare const __LIVE_CHANNEL__: string;

export type LiveStatus = "off" | "connecting" | "live" | "error";
export type Transport = "supabase" | "local" | "off";

export interface Pose {
  x: number;
  z: number;
  /** Facing, radians (same convention as the local avatar's rotation.y). */
  heading: number;
  moving: boolean;
  running: boolean;
  district: string | null;
}

export interface RemoteExplorer {
  id: string;
  name: string;
  avatar: AvatarSpec;
  /** Latest pose received, plus a short history for interpolation. */
  pose: Pose | null;
  samples: { t: number; pose: Pose }[];
  /** performance.now() of the last message that showed this explorer is there. */
  seen: number;
  /** A move too fast to be walking, held back until more samples agree with it (a teleport). */
  jump?: { t: number; pose: Pose; n: number } | null;
  /** The pose came from presence (where the explorer last stood), not yet from a live pose. */
  fromPresence?: boolean;
}

export interface LiveState {
  transport: Transport;
  status: LiveStatus;
  reason: string | null;
  /** Other explorers present (never includes this visitor). */
  others: RemoteExplorer[];
}

export interface LiveSession {
  getState(): LiveState;
  subscribe(fn: (s: LiveState) => void): () => void;
  /** Call freely (e.g. every frame); sends are throttled and deduplicated. */
  publish(pose: Pose): void;
  /** Re-announce after the visitor re-rolls their avatar. */
  updateVisitor(v: Visitor): void;
  close(): void;
}

const SEND_INTERVAL_MS = 125;
/** Presence re-track while standing: at most this often (each track fans out to everyone). */
const TRACK_MIN_MS = 30000;
const STALE_MS = 60000; // local transport only; background tabs are throttled, so be generous
const LOCAL_HEARTBEAT_MS = 5000;
const MAX_OTHERS = 60;
/** A full list only drops someone who has been quiet this long, so a crowd doesn't churn. */
const EVICT_QUIET_MS = 10000;
const WORLD_LIMIT = 2000;
const INTERP_DELAY_MS = 140;
/** Consecutive agreeing samples that confirm a teleport (the sender repeats one for this). */
const JUMP_CONFIRM = 3;
/** After the service closes the channel, wait this long before opening a new one. */
const REJOIN_MS = [5000, 15000, 30000, 60000];

const LIVE_URL = __LIVE_URL__;
const LIVE_KEY = __LIVE_KEY__;
const CHANNEL = __LIVE_CHANNEL__;

export function liveTransport(): Transport {
  const forced = new URLSearchParams(window.location.search).get("live");
  if (forced === "off") return "off";
  if (forced === "local") return "local";
  // The dev server never joins a Supabase channel unless asked (?live=supabase), so local
  // development and automated tests don't appear as phantom explorers.
  if (import.meta.env.DEV && forced !== "supabase") return "off";
  return LIVE_URL && LIVE_KEY ? "supabase" : "off";
}

export function sanitizePose(p: unknown): Pose | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const x = num(o.x);
  const z = num(o.z);
  const h = num(o.heading);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)),
    z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z)),
    heading: Number.isFinite(h) ? Math.atan2(Math.sin(h), Math.cos(h)) : 0,
    moving: o.moving === true,
    running: o.running === true,
    district: typeof o.district === "string" && /^[a-z-]{1,40}$/.test(o.district) ? o.district : null,
  };
}

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{8,64}$/.test(id);

/** The fastest a real explorer moves: running speed in the walk engine, units per second. */
const TOP_SPEED = WALK_SPEED * RUN_MULTIPLIER;

/**
 * Could an explorer have walked from `a` to `b` in `dtMs`? Generous on purpose: 2.5× top speed
 * plus 2 units, and the interval is read as at least 250 ms (jitter bunches packets) and at most
 * 2 s (so an explorer who stood still for a minute can't be dragged across the world in one sample).
 */
export function plausibleMove(a: Pose, b: Pose, dtMs: number): boolean {
  const dt = Math.min(2000, Math.max(250, dtMs)) / 1000;
  return Math.hypot(b.x - a.x, b.z - a.z) <= TOP_SPEED * 2.5 * dt + 2;
}

/**
 * Apply a received pose. A move too fast to be walking is held back; it is applied only when
 * JUMP_CONFIRM samples in a row agree with it (a real teleport, which the sender repeats).
 * A lone forged sample never moves anyone. Returns whether the pose was applied.
 */
export function admitPose(r: RemoteExplorer, pose: Pose, now: number): boolean {
  const last = r.samples[r.samples.length - 1];
  if (last && !plausibleMove(last.pose, pose, now - last.t)) {
    const j = r.jump;
    if (j && plausibleMove(j.pose, pose, now - j.t)) r.jump = { t: now, pose, n: j.n + 1 };
    else r.jump = { t: now, pose, n: 1 };
    if (r.jump.n < JUMP_CONFIRM) return false;
    r.samples.length = 0; // relocated: don't interpolate across the world
  }
  r.jump = null;
  r.pose = pose;
  r.seen = now;
  r.samples.push({ t: now, pose });
  if (r.samples.length > 8) r.samples.splice(0, r.samples.length - 8);
  return true;
}

/** The explorer to drop when the list is full: the one heard from least recently, if quiet for EVICT_QUIET_MS. */
export function evictable(others: Iterable<RemoteExplorer>, now: number): string | null {
  let pick: RemoteExplorer | null = null;
  for (const r of others) if (!pick || r.seen < pick.seen) pick = r;
  return pick && now - pick.seen >= EVICT_QUIET_MS ? pick.id : null;
}

/** Interpolated pose for rendering, ~140 ms behind real time for smoothness. */
export function poseAt(r: RemoteExplorer, now = performance.now()): Pose | null {
  const s = r.samples;
  if (!s.length) return r.pose;
  const t = now - INTERP_DELAY_MS;
  if (t <= s[0].t) return s[0].pose;
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1];
    const b = s[i];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      let dh = b.pose.heading - a.pose.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      return { ...b.pose, x: a.pose.x + (b.pose.x - a.pose.x) * k, z: a.pose.z + (b.pose.z - a.pose.z) * k, heading: a.pose.heading + dh * k };
    }
  }
  const last = s[s.length - 1];
  // Past the newest sample: hold position; "moving" only if the sample is fresh.
  return { ...last.pose, moving: last.pose.moving && t - last.t < 400 };
}

/**
 * One random id per open tab, unrelated to the visitor id stored in this browser, so that id
 * never goes on the wire. (The generated name does stay the same between visits; the in-app
 * note and the README say so.) Two tabs are two explorers (same look), never one avatar
 * jumping between them.
 */
export function connectionId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `c-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function startLive(visitor: Visitor): LiveSession {
  const transport = liveTransport();
  let me = visitor;
  const conn = connectionId();
  const others = new Map<string, RemoteExplorer>();
  const listeners = new Set<(s: LiveState) => void>();
  let state: LiveState = {
    transport,
    status: transport === "off" ? "off" : "connecting",
    reason:
      transport !== "off"
        ? null
        : new URLSearchParams(window.location.search).get("live") === "off"
          ? "Live explorers are turned off for this page."
          : import.meta.env.DEV
            ? "Live explorers are off in development. Add ?live=supabase or ?live=local to the URL."
            : "Live explorers aren't switched on for this site yet.",
    others: [],
  };
  let lastSent = 0;
  let lastPose: Pose | null = null;
  let lastSentPose: Pose | null = null;
  /** Sends left that repeat a teleport, so receivers can confirm it. */
  let repeats = 0;
  let closed = false;

  const emit = () => {
    state = { ...state, others: [...others.values()] };
    listeners.forEach((fn) => fn(state));
  };
  const setStatus = (status: LiveStatus, reason: string | null = null) => {
    state = { ...state, status, reason };
    emit();
  };

  /**
   * Add or update an explorer. A newcomer to a full list gets in only when `makeRoom` is set
   * (it has just shown it is there) and someone has been quiet long enough to drop.
   */
  const upsert = (id: unknown, name: unknown, avatar: unknown, makeRoom: boolean): RemoteExplorer | null => {
    if (!validId(id) || id === conn) return null;
    let r = others.get(id);
    if (!r) {
      const now = performance.now();
      if (others.size >= MAX_OTHERS) {
        const drop = makeRoom ? evictable(others.values(), now) : null;
        if (!drop) return null;
        others.delete(drop);
      }
      r = { id, name: sanitizeName(name), avatar: sanitizeAvatar(avatar), pose: null, samples: [], seen: now, jump: null };
      others.set(id, r);
    } else {
      if (name !== undefined) r.name = sanitizeName(name);
      if (avatar !== undefined) r.avatar = sanitizeAvatar(avatar);
    }
    return r;
  };
  const onPose = (id: unknown, rawPose: unknown) => {
    if (!validId(id)) return;
    const pose = sanitizePose(rawPose);
    if (!pose) return;
    const r = others.get(id) ?? unknownPose(id);
    if (r && admitPose(r, pose, performance.now())) r.fromPresence = false;
  };

  /* ---------------- transports ---------------- */
  /** A pose from someone not in the list (joined before us, dropped as stale, or waiting for room). */
  let unknownPose: (id: string) => RemoteExplorer | null = () => null;
  let sendPose: (p: Pose) => void = () => {};
  /** The explorer has come to a stop (or moved while standing, e.g. a teleport). */
  let settled: () => void = () => {};
  let announce: () => void = () => {};
  let onVisible: () => void = () => {};
  let teardown: () => void = () => {};

  if (transport === "local") {
    const bc = new BroadcastChannel(CHANNEL);
    const hello = (kind: "hello" | "here") => bc.postMessage({ kind, id: conn, name: me.name, avatar: me.avatar, pose: lastPose });
    let lastWho = 0;
    unknownPose = () => {
      const now = performance.now();
      if (now - lastWho > 1000) {
        lastWho = now;
        bc.postMessage({ kind: "who", id: conn });
      }
      return null;
    };
    bc.onmessage = (e) => {
      const m = e.data as Record<string, unknown>;
      if (!m || typeof m !== "object") return;
      if (m.kind === "hello" || m.kind === "here") {
        const r = upsert(m.id, m.name, m.avatar, true);
        if (r) {
          r.seen = performance.now();
          if (m.pose) onPose(m.id, m.pose);
          if (m.kind === "hello") hello("here");
          emit();
        }
      } else if (m.kind === "who") {
        hello("here");
      } else if (m.kind === "pose") {
        onPose(m.id, m.pose);
      } else if (m.kind === "bye" && typeof m.id === "string") {
        others.delete(m.id);
        emit();
      }
    };
    sendPose = (p) => bc.postMessage({ kind: "pose", id: conn, pose: p });
    announce = () => hello("hello");
    onVisible = announce;
    const bye = () => bc.postMessage({ kind: "bye", id: conn });
    window.addEventListener("pagehide", bye);
    // The local transport has no presence service: this heartbeat is how other tabs know we're still here.
    const heartbeat = window.setInterval(() => hello("here"), LOCAL_HEARTBEAT_MS);
    teardown = () => {
      window.clearInterval(heartbeat);
      bye();
      window.removeEventListener("pagehide", bye);
      bc.close();
    };
    announce();
    setStatus("live");
  } else if (transport === "supabase") {
    let client: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    /** Only a joined channel may send: realtime-js turns a broadcast on an unjoined channel into a REST request. */
    let joined = false;
    let rejoins = 0;
    let rejoinTimer = 0;
    let trackTimer = 0;
    let trackedAt = -Infinity;
    let trackedPose: Pose | null = null;

    const track = () => {
      window.clearTimeout(trackTimer);
      trackTimer = 0;
      if (!joined || !channel) return;
      trackedAt = performance.now();
      trackedPose = lastPose;
      void channel.track({ name: me.name, avatar: me.avatar, pose: lastPose });
    };
    /** Re-track at most every TRACK_MIN_MS; a change inside that window waits for the next slot. */
    const retrack = () => {
      if (!joined || trackTimer) return;
      const wait = trackedAt + TRACK_MIN_MS - performance.now();
      if (wait <= 0) track();
      else
        trackTimer = window.setTimeout(() => {
          trackTimer = 0;
          // Walking again: the next stop will track the pose where it ends.
          if (!lastPose?.moving) track();
        }, wait);
    };
    const leaveLive = (status: LiveStatus, reason: string) => {
      joined = false;
      window.clearTimeout(trackTimer);
      trackTimer = 0;
      others.clear();
      setStatus(status, reason);
    };

    sendPose = (p) => {
      // The same test realtime-js makes (socket open, channel joined), so send() never falls back to REST.
      if (joined && channel?.state === "joined" && client?.isConnected()) void channel.send({ type: "broadcast", event: "pose", payload: { id: conn, pose: p } });
    };
    settled = () => {
      const p = lastPose;
      const t = trackedPose;
      if (p && (!t || Math.abs(p.x - t.x) > 0.5 || Math.abs(p.z - t.z) > 0.5 || p.district !== t.district)) retrack();
    };
    announce = track;
    onVisible = retrack;
    unknownPose = (id) => {
      // Someone present but not shown (the list was full) has just moved: let them in if someone is idle.
      const metas = (channel?.presenceState() as Record<string, { name?: unknown; avatar?: unknown }[]> | undefined)?.[id];
      const meta = metas?.[metas.length - 1];
      if (!meta) return null;
      const r = upsert(id, meta.name, meta.avatar, true);
      if (r) emit();
      return r;
    };

    const join = () => {
      if (closed || !client) return;
      const ch = client.channel(CHANNEL, { config: { presence: { key: conn }, broadcast: { self: false, ack: false } } });
      channel = ch;
      ch.on("presence", { event: "sync" }, () => {
        if (ch !== channel) return;
        const present = ch.presenceState() as Record<string, { name?: unknown; avatar?: unknown; pose?: unknown }[]>;
        const ids = new Set(Object.keys(present));
        for (const id of [...others.keys()]) if (!ids.has(id)) others.delete(id);
        for (const [id, metas] of Object.entries(present)) {
          const meta = metas[metas.length - 1];
          const r = upsert(id, meta?.name, meta?.avatar, false);
          // Presence holds where an explorer last stood: it places them for a newcomer, and moves them
          // when they re-track after their next stop, until a live pose takes over.
          const pose = r && (!r.pose || r.fromPresence) ? sanitizePose(meta?.pose) : null;
          if (r && pose) {
            r.pose = pose;
            r.samples = [{ t: performance.now(), pose }];
            r.jump = null;
            r.fromPresence = true;
          }
        }
        emit();
      })
        .on("broadcast", { event: "pose" }, ({ payload }) => {
          if (ch !== channel || !joined) return;
          const p = payload as { id?: unknown; pose?: unknown };
          onPose(p?.id, p?.pose);
        })
        .subscribe((status) => {
          if (ch !== channel || closed) return;
          if (status === "SUBSCRIBED") {
            joined = true;
            rejoins = 0;
            track();
            setStatus("live");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // realtime-js keeps retrying this channel and reports SUBSCRIBED once it is back.
            leaveLive("error", "Couldn't reach the live explorers service. Walking still works.");
          } else if (status === "CLOSED") {
            // The service closed the channel. realtime-js never rejoins a closed channel, so open a new one after a pause.
            channel = null;
            leaveLive("error", "Lost the connection to other explorers. Trying again shortly; walking still works.");
            rejoinTimer = window.setTimeout(join, REJOIN_MS[Math.min(rejoins++, REJOIN_MS.length - 1)]);
          }
        });
    };

    import("@supabase/realtime-js")
      .then(({ RealtimeClient }) => {
        if (closed) return;
        client = new RealtimeClient(`${LIVE_URL}/realtime/v1`, { params: { apikey: LIVE_KEY, eventsPerSecond: 12 } });
        join();
      })
      .catch(() => setStatus("error", "Couldn't load the live explorers service. Walking still works."));

    teardown = () => {
      window.clearTimeout(rejoinTimer);
      window.clearTimeout(trackTimer);
      joined = false;
      const ch = channel;
      const c = client;
      channel = null;
      client = null;
      // Leaving the channel ends this explorer's presence for everyone.
      if (c)
        void (ch ? c.removeChannel(ch) : Promise.resolve())
          .catch(() => {})
          .finally(() => c.disconnect());
    };
  }

  const onVisibility = () => {
    if (!isHidden() && !closed) onVisible();
  };
  if (transport !== "off") document.addEventListener("visibilitychange", onVisibility);

  // Drop explorers we haven't heard from in a while (local transport has no presence service).
  const sweep =
    transport === "local"
      ? window.setInterval(() => {
          const now = performance.now();
          let changed = false;
          for (const [id, r] of others) {
            if (now - r.seen > STALE_MS) {
              others.delete(id);
              changed = true;
            }
          }
          if (changed) emit();
        }, 4000)
      : 0;

  const same = (a: Pose | null, b: Pose) =>
    !!a && Math.abs(a.x - b.x) < 0.02 && Math.abs(a.z - b.z) < 0.02 && Math.abs(a.heading - b.heading) < 0.02 && a.moving === b.moving && a.district === b.district;

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    publish(pose) {
      // A hidden tab sends nothing; it can't move while hidden anyway.
      if (transport === "off" || closed || isHidden()) return;
      const p = { ...pose, x: Math.round(pose.x * 100) / 100, z: Math.round(pose.z * 100) / 100, heading: Math.round(pose.heading * 1000) / 1000 };
      lastPose = p;
      if (!p.moving) settled();
      const now = performance.now();
      if (now - lastSent < SEND_INTERVAL_MS) return;
      const changed = !same(lastSentPose, p);
      if (!changed && repeats <= 0) return;
      // A teleport (fly to a company, a district, home): send it a few times so others can confirm it.
      if (changed && lastSentPose && !plausibleMove(lastSentPose, p, 0)) repeats = JUMP_CONFIRM - 1;
      else repeats = Math.max(0, repeats - 1);
      lastSent = now;
      lastSentPose = p;
      sendPose(p);
    },
    updateVisitor(v) {
      me = v;
      announce();
    },
    close() {
      closed = true;
      window.clearInterval(sweep);
      document.removeEventListener("visibilitychange", onVisibility);
      teardown();
      others.clear();
      listeners.clear();
    },
  };
}
