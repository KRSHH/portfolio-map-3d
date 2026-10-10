/* 2D canvases that keep their pixels in ordinary memory.

   Chrome (Android especially) keeps a 2D canvas on the GPU by default. When the GPU process is
   lost, those canvases come back blank, and three.js re-uploads textures from them blank once
   the WebGL context is restored. `willReadFrequently` keeps the canvas in main memory, where a
   GPU loss cannot reach it. Every canvas that backs a texture in the Nexus comes from here (the
   same rule as the maps; src/three/cpuCanvas.ts). */

/** A new w×h canvas and its CPU-backed 2D context. */
export function cpuCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  return [c, ctx];
}
