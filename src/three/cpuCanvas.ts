/* 2D canvases that keep their pixels in ordinary memory.

   Chrome (Android especially) keeps a 2D canvas on the GPU by default. When
   the GPU process is lost (the tab is backgrounded under memory pressure, the
   driver resets, the GPU process crashes), those canvases come back blank. The
   WebGL context is restored and three.js uploads every texture again from its
   source, so a texture painted on such a canvas turns blank or black for the
   rest of the visit. `willReadFrequently` makes Chrome keep the canvas in main
   memory, where a GPU loss cannot reach it (verified by killing the GPU process
   under Chromium: GPU-backed canvases read back empty, these keep their pixels).

   Every canvas that backs a texture or is copied from later must come from
   here. The first getContext("2d") call fixes a canvas's attributes, so the
   canvas must not have been given a context before. */

/** A new w×h canvas and its CPU-backed 2D context. */
export function cpuCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, cpuContext(c)];
}

/** The CPU-backed 2D context of `c` (created on the first call; later calls return the same context). */
export function cpuContext(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}
