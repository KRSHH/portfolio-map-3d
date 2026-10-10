/* Media queries and the viewport, read without per-frame state: React re-renders only when a
   query flips or the window is resized. */
import { useSyncExternalStore } from "react";

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** prefers-reduced-motion, live: the 3D world stops its drift and flow the moment it changes. */
export function useReducedMotion(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)");
}

let viewport = { w: 0, h: 0 };
function readViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w !== viewport.w || h !== viewport.h) viewport = { w, h };
  return viewport;
}

export function useViewport(): { w: number; h: number } {
  return useSyncExternalStore((onChange) => {
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, readViewport);
}
