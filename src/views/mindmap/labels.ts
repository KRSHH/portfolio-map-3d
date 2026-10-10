/* Accessible names for the globe's district label buttons. */
import type { District } from "../../data/types";
import { L } from "../../site";

/**
 * A district label shows the short name and a company count ("Proptech 12"). Its accessible name
 * starts with that short name (WCAG 2.5.3 Label in Name: a voice-control user says what they
 * see), followed by the full district name when that adds words, then the count.
 */
export function regionButtonName(d: Pick<District, "short" | "label">, count: number): string {
  const rest = d.label.slice(d.short.length);
  const fullStartsWithShort = d.label.startsWith(d.short) && (rest === "" || /^\W/.test(rest));
  const name = fullStartsWithShort ? d.label : `${d.short} (${d.label})`;
  return `${name}: ${count} ${count === 1 ? L.company : L.companies}`;
}
