/* What the Nexus does when its WebGL context is lost (the same rule as the maps).

   three.js asks the browser to restore a lost context and uploads every texture again when it
   comes back. Two things are left to the scene:
   - restored: repaint the canvases and ask for a frame (a still scene renders on demand);
   - giveUp: the browser may never restore the context. If no restore arrives within `waitMs`
     of visible time, the scene is rebuilt with a fresh canvas and context.
   Time spent hidden does not count: a browser may hold a restore until the tab is visible. */

export interface ContextWatchHooks {
  restored(): void;
  giveUp(): void;
}

/** The parts of `document` the watch reads (a stand-in in tests). */
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export const RESTORE_WAIT_MS = 3000;

/** Watches `canvas` for context loss and restore. Returns the function that stops watching. */
export function watchContext(canvas: EventTarget, hooks: ContextWatchHooks, waitMs = RESTORE_WAIT_MS, doc: VisibilitySource = document): () => void {
  let lost = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    disarm();
    if (!lost || doc.visibilityState !== "visible") return;
    timer = setTimeout(() => {
      timer = undefined;
      if (lost) hooks.giveUp();
    }, waitMs);
  };
  const onLost = () => {
    lost = true;
    arm();
  };
  const onRestored = () => {
    lost = false;
    disarm();
    hooks.restored();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  doc.addEventListener("visibilitychange", arm);
  return () => {
    disarm();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    doc.removeEventListener("visibilitychange", arm);
  };
}
