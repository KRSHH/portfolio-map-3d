import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { badgeStats, explain, spread, type GpuCheck, type Snapshot } from "./probe";
import type { ProbeScene } from "./registry";

const noCounters = { contextLost: 0, contextRestored: 0, lastContextEvent: null, shaderErrors: [], glErrors: {} };

/** A globe-like scene: `n` badge sprites in front of a camera, with the controller fields the probe reads. */
function globeScene(n: number, edit?: (s: THREE.Sprite, i: number) => void): ProbeScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const badges = Array.from({ length: n }, (_, i) => {
    const m = new THREE.SpriteMaterial({ transparent: true, opacity: 1 });
    m.userData.fade = { value: 0 };
    const s = new THREE.Sprite(m);
    s.position.set(i - n / 2, 0, 0);
    edit?.(s, i);
    scene.add(s);
    return s;
  });
  scene.updateMatrixWorld();
  const controller = { vis: new Float32Array(n).fill(1), facing: new Float32Array(n).fill(1), layout: { nodes: [] } };
  const renderer = { properties: { has: () => false, get: () => ({}) } };
  return { view: "mindmap", renderer, scene, camera, badges, controller } as unknown as ProbeScene;
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    t: 10_000,
    view: "mindmap",
    scene: "mindmap",
    theme: { app: "dark", stored: "dark", osDark: false },
    page: { visibility: "visible", dpr: 3, viewport: [412, 915] },
    gl: { gpu: "test", version: "WebGL 2", lost: false, css: [412, 859], buffer: [824, 1718], pixelRatio: 2, antialias: true, alpha: true, textures: 130, geometries: 6, programs: 6, failedPrograms: 0, calls: 130, triangles: 1000, fps: 60, stalledMs: 0 },
    glErrors: [],
    state: { selected: null, focusDistrict: null, query: "", panel: null, finder: null, highlight: null, sheet: "0px", reducedMotion: false },
    controller: { camera: "0, 0, 400" },
    badges: { view: "mindmap", count: 127, visible: 127, inView: 127, front: 40, opacity: { min: 0.1, median: 0.6, max: 1 }, lowOpacity: 60, frontLowOpacity: 0, fade: { min: 0, median: 0, max: 0 }, highFade: 0, hidden: 0, scaleZero: 0, nonFinite: 0, fogged: 0, noMap: 0, notUploaded: 0 },
    textures: { count: 127, withData: 127, bytesOk: 127, versioned: 127, uploaded: 127, stale: 0, liveGl: 127 },
    ...over,
  };
}

function gpuCheck(over: Partial<GpuCheck> = {}): GpuCheck {
  const pass = { drawn: 127, colorOk: 127, alpha: { min: 255, median: 255, max: 255 }, failed: [] };
  return {
    at: "",
    t: 9_500,
    ms: 50,
    view: "mindmap",
    tested: 127,
    live: pass,
    plain: pass,
    frame: { candidates: 40, changed: 40, occluded: 0, occluders: [], unchanged: [] },
    programs: { live: 1, target: 2, frame: 1 },
    glErrors: [],
    ...over,
  };
}

describe("spread", () => {
  it("reports min, median and max", () => {
    expect(spread([])).toBeNull();
    expect(spread([3, 1, 2])).toEqual({ min: 1, median: 2, max: 3 });
    expect(spread([4, 1, 3, 2])).toEqual({ min: 1, median: 2.5, max: 4 });
  });
});

describe("badgeStats", () => {
  it("counts visible, in-view and front badges and their opacity and fade", () => {
    const t = globeScene(6, (s, i) => {
      if (i === 0) s.visible = false;
      if (i === 1) s.material.opacity = 0.1;
      if (i === 2) (s.material.userData.fade as { value: number }).value = 0.8;
      if (i === 3) s.position.set(0, 0, 50); // behind the camera
      if (i === 4) s.scale.set(0, 1, 1);
    });
    if (t.view !== "mindmap") throw new Error("expected a globe scene");
    t.controller.facing[5] = 0.1; // near the rim: in view, but faded by design
    const st = badgeStats(t);
    expect(st.count).toBe(6);
    expect(st.hidden).toBe(1);
    expect(st.visible).toBe(5);
    expect(st.inView).toBe(3); // not the one behind the camera, nor the zero-scale one
    expect(st.front).toBe(2); // the rim badge is not front
    expect(st.lowOpacity).toBe(1);
    expect(st.frontLowOpacity).toBe(1);
    expect(st.highFade).toBe(1);
    expect(st.scaleZero).toBe(1);
    expect(st.nonFinite).toBe(0);
    expect(st.fade).toEqual({ min: 0, median: 0, max: 0.8 });
  });

  it("does not count walk badges right in front of the lens (faded there by design) as front", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const badges = [2, 3, 8, 20].map((d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ transparent: true, opacity: d < 4 ? 0.22 : 1 }));
      m.position.set(0, 0, -d);
      scene.add(m);
      return m;
    });
    scene.updateMatrixWorld();
    const renderer = { properties: { has: () => false, get: () => ({}) } };
    const st = badgeStats({ view: "walk", renderer, scene, camera, badges, controller: { pins: { slugs: [] } } } as unknown as ProbeScene);
    expect(st.inView).toBe(4);
    expect(st.front).toBe(2);
    expect(st.lowOpacity).toBe(2);
    expect(st.frontLowOpacity).toBe(0);
  });

  it("flags non-finite positions", () => {
    const st = badgeStats(globeScene(2, (s, i) => i === 1 && s.position.setX(Number.NaN)));
    expect(st.nonFinite).toBe(1);
  });
});

describe("explain", () => {
  it("says there is nothing to measure in the list view", () => {
    const f = explain(snapshot({ view: "list", scene: null, gl: null, badges: null, textures: null }), null, noCounters);
    expect(f).toHaveLength(1);
    expect(f[0].text).toMatch(/List view/);
  });

  it("reports healthy badges with one ok finding", () => {
    const f = explain(snapshot(), null, noCounters);
    expect(f.map((x) => x.level)).toEqual(["ok"]);
    expect(f[0].text).toMatch(/healthy/);
  });

  it("puts the worst findings first", () => {
    const s = snapshot();
    const f = explain({ ...s, badges: { ...s.badges!, hidden: 127, visible: 0, inView: 0, front: 0 } }, null, { ...noCounters, glErrors: { INVALID_OPERATION: 2 } });
    expect(f[0].level).toBe("bad");
    expect(f[0].text).toMatch(/127 of 127 badges are switched off/);
    expect(f.at(-1)!.level).toBe("warn");
  });

  it("calls front badges below 30% opacity faded, not missing", () => {
    const s = snapshot();
    const f = explain({ ...s, badges: { ...s.badges!, frontLowOpacity: 30, opacity: { min: 0.1, median: 0.2, max: 1 } } }, null, noCounters);
    expect(f[0]).toEqual({ level: "bad", text: expect.stringMatching(/30 of the 40 front badges are below 30% opacity .*faded out, not missing/) });
  });

  it("blames the badge material when only a plain material draws the textures", () => {
    const f = explain(snapshot(), gpuCheck({ live: { drawn: 0, colorOk: 0, alpha: null, failed: [] } }), noCounters);
    expect(f[0].text).toMatch(/127 of 127 badges draw nothing through their own material \(a plain material draws them/);
  });

  it("explains badges hidden behind scenery without raising an alarm", () => {
    const f = explain(snapshot(), gpuCheck({ frame: { candidates: 40, changed: 31, occluded: 9, occluders: ["world › Mesh (BoxGeometry)"], unchanged: [] } }), noCounters);
    expect(f.every((x) => x.level === "ok")).toBe(true);
    expect(f.map((x) => x.text).join("\n")).toMatch(/31 of 40 front badges in view show in the live frame \(9 more are behind world/);
  });

  it("flags badges that draw alone but add nothing to the live frame", () => {
    const f = explain(snapshot(), gpuCheck({ frame: { candidates: 40, changed: 2, occluded: 0, occluders: [], unchanged: ["a"] } }), noCounters);
    expect(f[0].level).toBe("bad");
    expect(f[0].text).toMatch(/38 of 40 front badges in view add nothing to the live frame, although they draw on their own/);
  });

  it("calls a stopped render loop, unless reduced motion renders on demand", () => {
    const s = snapshot();
    const stalled = { ...s, gl: { ...s.gl!, fps: 0, stalledMs: 4000 } };
    expect(explain(stalled, null, noCounters)[0]).toEqual({ level: "bad", text: "The scene has not drawn a frame for 4.0 s." });
    expect(explain({ ...stalled, state: { ...s.state, reducedMotion: true } }, null, noCounters).every((f) => f.level === "ok")).toBe(true);
    expect(explain({ ...s, gl: { ...s.gl!, fps: 0, stalledMs: 900 } }, null, noCounters).every((f) => f.level === "ok")).toBe(true);
  });

  it("names the search, finder or district that dims badges on purpose", () => {
    const s = snapshot();
    const searched = explain({ ...s, state: { ...s.state, query: "quietmind ", highlight: 1 } }, null, noCounters);
    expect(searched[0]).toEqual({ level: "warn", text: expect.stringMatching(/^126 of 127 badges are dimmed on purpose by the search “quietmind”, which matches 1\. Clear it/) });
    const finder = explain({ ...s, state: { ...s.state, query: "x", panel: "finder", finder: "cybersecurity", highlight: 9 } }, null, noCounters);
    expect(finder[0].text).toMatch(/^118 of 127 badges are dimmed on purpose by the provider finder \(cybersecurity\)/);
    const district = explain({ ...s, state: { ...s.state, focusDistrict: "health", highlight: 20 } }, null, noCounters);
    expect(district[0].text).toMatch(/by the health district focus/);
    // A highlight that matches everyone dims nothing.
    expect(explain({ ...s, state: { ...s.state, query: "a", highlight: 127 } }, null, noCounters).every((f) => f.level === "ok")).toBe(true);
  });

  it("notes an open company without raising an alarm", () => {
    const s = snapshot();
    const f = explain({ ...s, state: { ...s.state, selected: "quietmind" } }, null, noCounters);
    expect(f.every((x) => x.level === "ok")).toBe(true);
    expect(f[0].text).toBe("quietmind is open: the other badges step back until it is closed.");
  });

  it("ignores a GPU check made in the other view", () => {
    const f = explain(snapshot(), gpuCheck({ view: "walk", live: { drawn: 0, colorOk: 0, alpha: null, failed: [] } }), noCounters);
    expect(f.map((x) => x.level)).toEqual(["ok"]);
  });
});
