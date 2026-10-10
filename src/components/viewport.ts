/* Viewport helpers shared by the shell. NARROW_QUERY matches the phone layout in
   app.css (@media (max-width: 760px)), where panels become bottom sheets. */
export const NARROW_QUERY = "(max-width: 760px)";

/** True when the phone layout applies right now. */
export function isNarrow(): boolean {
  try {
    return window.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
}
