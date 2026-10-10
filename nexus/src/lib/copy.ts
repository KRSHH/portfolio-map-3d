/* The words the Nexus uses about an instance, in that instance's own labels
   ("46 companies in 4 tracks", "1 startup in 1 cohort"). Pure functions, unit-tested. */
import { bareHost, type Manifest, type OwnerProof } from "../../../federation/protocol.ts";

type Counted = Pick<Manifest, "counts" | "labels">;

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "46 companies in 4 tracks". */
export function countLine(m: Counted): string {
  const { counts: c, labels: l } = m;
  return `${c.companies} ${plural(c.companies, l.company, l.companies)} in ${c.districts} ${plural(c.districts, l.district, l.districts)}`;
}

/** "46 companies · 4 tracks", for labels and lists. */
export function shortCountLine(m: Counted): string {
  const { counts: c, labels: l } = m;
  return `${c.companies} ${plural(c.companies, l.company, l.companies)} · ${c.districts} ${plural(c.districts, l.district, l.districts)}`;
}

/** "12 mentors", or null when the instance counts no people. */
export function peopleLine(m: Counted): string | null {
  return m.labels.people && m.counts.people > 0 ? `${m.counts.people} ${m.labels.people}` : null;
}

/** "Published by Embarc Collective", or null when the publisher is the map's own organization. */
export function publisherLine(m: Pick<Manifest, "name" | "publisher">): string | null {
  return m.publisher.name.trim() && m.publisher.name.trim() !== m.name.trim() ? `Published by ${m.publisher.name}` : null;
}

/** How the publisher vouched for the map, in a few words ("Verified: on acme.vc"), or null. */
export function proofLine(proof: OwnerProof | null, publisherWebsite: string | null): string | null {
  let host: string | null = null;
  try {
    host = publisherWebsite ? bareHost(publisherWebsite) : null;
  } catch {
    host = null;
  }
  switch (proof) {
    case "domain":
      return host ? `Verified: on ${host}` : "Verified";
    case "dns":
      return host ? `Verified: DNS record on ${host}` : "Verified";
    case "link":
      return host ? `Verified: linked from ${host}` : "Verified";
    case "maintainer":
      return "Verified by the network's maintainers";
    default:
      return null;
  }
}

/** "Tracks" from "tracks"; leaves "FinTech" alone. */
export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const SKIP = new Set(["the", "a", "an", "of", "and", "&"]);

/** Up to two initials for a badge: "Sample Harbor Ventures" -> "SH", "The Lab" -> "L". */
export function initials(name: string): string {
  const words = name
    .split(/[\s\-–—/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const kept = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const use = kept.length ? kept : words;
  return use
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join("");
}

/** "map.example.org" from "https://map.example.org/path". */
export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 9, 2026" from "2026-10-09"; the input unchanged if it is not a date. */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : iso;
}
