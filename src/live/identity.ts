/* Visitor identity: every browser gets an anonymous id, stored locally, and
   a distinct avatar + display name derived from it. Nothing personal is
   collected — the id is random, the name is generated ("Curious Manatee 42").

   The avatar is a pure function of the id (and an optional re-roll count). The
   id itself never leaves the browser: live explorers send the name and avatar
   fields, under a separate random id per tab (see presence.ts). */

export const HATS = ["cap", "straw", "beanie", "bucket", "visor", "none"] as const;
export const GEAR = ["backpack", "satchel", "scarf", "none"] as const;
export type Hat = (typeof HATS)[number];
export type Gear = (typeof GEAR)[number];

/** Explorer outfit colors: saturated enough to read at distance on grass and sand. */
export const BODY_COLORS = ["#0c7a8c", "#2a78d6", "#4a3aa7", "#c2185b", "#e34948", "#eb6834", "#1f9a3a", "#7a9a01", "#9a5bd6", "#00a3b4"] as const;
export const ACCENT_COLORS = ["#ff3a61", "#f5b301", "#ffffff", "#1d1f24", "#12a594", "#ff8a3d", "#6fb7ff", "#f2e8cf"] as const;
export const SKIN_TONES = ["#f6d7c3", "#ecc19c", "#d39a6e", "#b07b52", "#8a5a3b", "#5e3a24"] as const;

const ADJECTIVES = [
  "Curious", "Bold", "Bright", "Brave", "Calm", "Clever", "Daring", "Eager", "Friendly", "Gentle", "Happy", "Keen",
  "Lively", "Lucky", "Mellow", "Nimble", "Plucky", "Quick", "Quiet", "Sunny", "Swift", "Witty", "Zesty", "Breezy",
];
/** Coastal wildlife (the generator's words: sanitizeName accepts only names made from these lists). */
const ANIMALS = [
  "Manatee", "Pelican", "Heron", "Osprey", "Dolphin", "Egret", "Ibis", "Sea Turtle", "Gator", "Flamingo",
  "Stingray", "Tarpon", "Snook", "Spoonbill", "Otter", "Tortoise", "Sandpiper", "Kingfisher", "Seahorse", "Crab",
];

export interface AvatarSpec {
  body: string;
  accent: string;
  skin: string;
  hat: Hat;
  gear: Gear;
}

export interface Visitor {
  id: string;
  name: string;
  avatar: AvatarSpec;
}

const KEY = "portfolio-map-visitor-v1";

function hash32(s: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

const pick = <T,>(list: readonly T[], id: string, salt: number): T => list[hash32(id, salt) % list.length];

/** Deterministic avatar + name for an id. `roll` lets a visitor re-roll their look. */
export function deriveVisitor(id: string, roll = 0): Visitor {
  const seed = roll ? `${id}#${roll}` : id;
  const avatar: AvatarSpec = {
    body: pick(BODY_COLORS, seed, 1),
    accent: pick(ACCENT_COLORS, seed, 2),
    skin: pick(SKIN_TONES, seed, 3),
    hat: pick(HATS, seed, 4),
    gear: pick(GEAR, seed, 5),
  };
  if (avatar.accent === avatar.body) avatar.accent = "#ffffff";
  const name = `${pick(ADJECTIVES, seed, 6)} ${pick(ANIMALS, seed, 7)} ${10 + (hash32(seed, 8) % 90)}`;
  return { id, name, avatar };
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let current: Visitor | null = null;

/** This browser's visitor. Persists across visits when storage is available. */
export function getVisitor(): Visitor {
  if (current) return current;
  let id = "";
  let roll = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved.id === "string" && /^[\w-]{8,64}$/.test(saved.id)) {
      id = saved.id;
      roll = Number.isInteger(saved.roll) ? saved.roll : 0;
    }
  } catch {
    /* storage unavailable: a session-only identity */
  }
  if (!id) {
    id = randomId();
    try {
      localStorage.setItem(KEY, JSON.stringify({ id, roll: 0 }));
    } catch {
      /* ignore */
    }
  }
  current = deriveVisitor(id, roll);
  return current;
}

/** Give this visitor a new look and name (the id stays the same). */
export function rerollVisitor(): Visitor {
  const v = getVisitor();
  let roll = 0;
  try {
    roll = (JSON.parse(localStorage.getItem(KEY) || "{}").roll ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify({ id: v.id, roll }));
  } catch {
    roll = Math.floor(Math.random() * 1000) + 1;
  }
  current = deriveVisitor(v.id, roll);
  listeners.forEach((fn) => fn(current!));
  return current;
}

const listeners = new Set<(v: Visitor) => void>();
export function onVisitorChange(fn: (v: Visitor) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Validate an avatar received from another visitor; anything unexpected falls back to a safe default. */
export function sanitizeAvatar(a: unknown): AvatarSpec {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const color = (v: unknown, list: readonly string[]) => (typeof v === "string" && list.includes(v) ? v : list[0]);
  return {
    body: color(o.body, BODY_COLORS),
    accent: color(o.accent, ACCENT_COLORS),
    skin: color(o.skin, SKIN_TONES),
    hat: HATS.includes(o.hat as Hat) ? (o.hat as Hat) : "none",
    gear: GEAR.includes(o.gear as Gear) ? (o.gear as Gear) : "none",
  };
}

/** Control and format characters (bidi overrides, zero-width marks): never shown in received text. */
export function stripInvisible(s: string): string {
  return s.replace(/[\p{Cc}\p{Cf}]/gu, "");
}

/** The generator's grammar: an adjective, an animal, a number from 10 to 99. */
const NAME_RE = new RegExp(`^(?:${ADJECTIVES.join("|")}) (?:${ANIMALS.join("|")}) [1-9][0-9]$`);

/**
 * Display names from other visitors. Real clients only ever send a generated name, and anyone on the
 * public channel can send any text, so anything outside the generator's grammar is shown as "Explorer".
 */
export function sanitizeName(n: unknown): string {
  if (typeof n !== "string" || n.length > 64) return "Explorer";
  const clean = stripInvisible(n).trim();
  return NAME_RE.test(clean) ? clean : "Explorer";
}
