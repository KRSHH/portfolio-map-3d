/* The ?debug probe's handle on the live 3D scenes.

   While a 3D view is mounted it registers its renderer, scene, camera,
   logo badges and controller here, so the probe (DebugProbe.tsx, a lazy
   chunk loaded only when the URL has ?debug) can measure the real scene
   on the device: badge visibility, opacity, fade, texture uploads, and a
   GPU readback through the live renderer. Without ?debug, registerScene()
   does nothing and holds no reference. */
import type * as THREE from "three";
import type { BadgeSprite, GlobeController } from "../views/mindmap/controller";
import type { GlobeNodeBase } from "../views/mindmap/globeLayout";
import type { WalkEngine } from "../views/walk/engine";
import type { BadgeMesh } from "../views/walk/pins";

/** The URL asks for the probe (?debug). Read once at boot, in production builds too. */
export const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

interface SceneHandles {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

/** A mounted 3D view, as the probe sees it. `badges` are the live logo objects in company order. */
export type ProbeScene =
  | (SceneHandles & { view: "mindmap"; badges: readonly BadgeSprite[]; controller: GlobeController<GlobeNodeBase> })
  | (SceneHandles & { view: "walk"; badges: readonly BadgeMesh[]; controller: WalkEngine });

let current: ProbeScene | null = null;
const listeners = new Set<(s: ProbeScene | null) => void>();

/** Shows a mounted scene to the probe. Returns the unregister function. Does nothing without ?debug. */
export function registerScene(s: ProbeScene): () => void {
  if (!DEBUG) return () => {};
  current = s;
  for (const fn of listeners) fn(s);
  return () => {
    if (current !== s) return;
    current = null;
    for (const fn of listeners) fn(null);
  };
}

/** The scene registered now, if any. */
export function probeScene(): ProbeScene | null {
  return current;
}

/** Calls `fn` whenever a scene registers or unregisters. Returns the unsubscribe function. */
export function onProbeScene(fn: (s: ProbeScene | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
