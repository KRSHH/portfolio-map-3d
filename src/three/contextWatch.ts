/* What a 3D view does when its WebGL context is lost.

   three.js asks the browser to restore a lost context (it calls preventDefault
   on webglcontextlost) and rebuilds its GL state when the context comes back,
   uploading every texture again from its source. Two things are left to the
   view:
   - restored: a canvas that renders on demand (the globe under reduced motion)
     must ask for a frame, or it stays blank until the next input;
   - giveUp: the browser may never restore the context (it lost the GPU process
     and will not give this context back). While lost, the canvas draws nothing
     but the DOM labels stay: names over an empty scene. If no restore arrives
     within `waitMs` of visible time, the view remounts with a fresh context.
   Time spent hidden does not count: a browser may hold a restore until the tab
   is visible again. */

export interface ContextWatchHooks {
  restored(): void;
  giveUp(): void;
}

/** The parts of `document` the watch reads (a stand-in in tests). */
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export const RESTORE_WAIT_MS = 4000;

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
