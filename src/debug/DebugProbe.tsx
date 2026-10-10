/* ?debug: a small floating panel over the live 3D views. It measures the real scene on this
   device and says in plain words why the logo badges are, or are not, showing.

   Loaded only when the URL has ?debug (src/App.tsx). Collapsed by default to a "debug" chip
   under the top bar, whose dot turns amber or red when a finding needs attention. It samples
   the registered scene once a second (probe.ts) and keeps a log of page, WebGL context and
   app-state events (recorder.ts). "GPU check" draws every live badge through the live renderer
   and reads the pixels back. Nothing is sent anywhere: "Copy report" puts JSON on the clipboard. */
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHighlight } from "../state/store";
import { explain, runGpuCheck, takeSnapshot, worst, type GpuCheck, type Snapshot, type Spread } from "./probe";
import { counters, events, history, log, pushHistory, startRecorder } from "./recorder";
import { onProbeScene, probeScene } from "./registry";
import { SITE } from "../site";
import "./debug.css";

const f2 = (n: number | null | undefined) => (n == null ? "–" : Number.isFinite(n) ? n.toFixed(2) : String(n));
const spread = (s: Spread | null, fmt: (n: number) => string = f2) => (s ? `${fmt(s.min)} / ${fmt(s.median)} / ${fmt(s.max)}` : "–");
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const dash = (v: string | number | boolean | null | undefined) => (v === null || v === undefined || v === "" ? "–" : String(v));

/** Copies with the old execCommand path, for pages where the async clipboard is unavailable. */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

type Row = [label: string, value: string, flagged?: boolean];

function rowsFor(s: Snapshot, gpu: GpuCheck | null): Row[] {
  const g = s.gl;
  const b = s.badges;
  const tx = s.textures;
  const st = s.state;
  const visitErrors = Object.entries(counters.glErrors).map(([k, n]) => `${k}×${n}`).join(", ");
  const rows: Row[] = [
    ["view", `${s.view} · scene ${dash(s.scene)} · page ${s.page.visibility}`],
    ["theme", `app ${s.theme.app ?? "auto"} (stored ${s.theme.stored ?? "none"}) · OS ${s.theme.osDark ? "dark" : "light"}`],
    ["dpr", `device ${s.page.dpr} · renderer ${g ? g.pixelRatio : "–"} · window ${s.page.viewport.join("×")}`],
  ];
  if (g) {
    rows.push(
      ["canvas", `${g.css.join("×")} css · ${g.buffer.join("×")} buffer`],
      ["gpu", `${g.gpu} · ${g.version} · aa ${dash(g.antialias)} · alpha ${dash(g.alpha)}`],
      ["context", `${g.lost ? "LOST" : "ok"} · lost ${counters.contextLost} · restored ${counters.contextRestored} · last ${counters.lastContextEvent === null ? "never" : secs(counters.lastContextEvent)}`, g.lost || counters.contextLost > 0],
      ["renderer", `textures ${g.textures} · geometries ${g.geometries} · programs ${g.programs}${g.failedPrograms ? ` (${g.failedPrograms} failed)` : ""} · calls ${g.calls} · fps ${dash(g.fps)}${g.stalledMs >= 1500 ? ` · no frame for ${secs(g.stalledMs)}` : ""}`, g.failedPrograms > 0 || g.stalledMs >= 2500],
    );
  }
  rows.push(
    ["errors", `gl ${s.glErrors.join(", ") || "none"} (visit: ${visitErrors || "none"}) · shader ${counters.shaderErrors.length} · page ${counters.pageErrors}`, !!visitErrors || counters.shaderErrors.length > 0],
    ["state", `selected ${dash(st.selected)} · district ${dash(st.focusDistrict)} · query ${st.query ? JSON.stringify(st.query) : "–"} · finder ${dash(st.finder)} · panel ${dash(st.panel)}`],
    ["highlight", `${st.highlight === null ? "null (none)" : `Set of ${st.highlight}`} · sheet ${st.sheet || "0px"} · reduced motion ${st.reducedMotion ? "yes" : "no"}`],
  );
  if (s.controller) rows.push(["controller", Object.entries(s.controller).map(([k, v]) => `${k} ${dash(v)}`).join(" · ")]);
  if (b) {
    rows.push(
      ["badges", `${b.count} · visible ${b.visible} · in view ${b.inView} · front ${b.front}`, b.visible < b.count || (b.visible > 0 && b.inView === 0)],
      ["opacity", `${spread(b.opacity)} (min/med/max) · <0.3: ${b.lowOpacity} (front ${b.frontLowOpacity})`, b.front > 0 && b.frontLowOpacity >= b.front / 2],
    );
    if (b.view === "mindmap") rows.push(["fade", `${spread(b.fade)} · >0.5: ${b.highFade}`, b.highFade > 0]);
    rows.push([
      "hidden",
      `${b.view === "walk" ? "by drop" : "visible=false"} ${b.hidden} · scale 0 ${b.scaleZero} · non-finite ${b.nonFinite}${b.view === "walk" ? ` · past fog ${b.fogged}` : ""}`,
      b.hidden > 0 || b.scaleZero > 0 || b.nonFinite > 0,
    ]);
  }
  if (tx) {
    rows.push([
      "textures",
      `${tx.count} · data ${tx.withData} · bytes ok ${tx.bytesOk} · v>0 ${tx.versioned} · uploaded ${tx.uploaded} · stale ${tx.stale} · gl ok ${tx.liveGl}`,
      tx.withData < tx.count || tx.bytesOk < tx.withData || tx.uploaded < tx.count || tx.stale > 0 || tx.liveGl < tx.uploaded,
    ]);
  }
  if (gpu) {
    const f = gpu.frame;
    const ok = !gpu.error && gpu.live.drawn === gpu.tested && gpu.plain.drawn === gpu.tested && f.changed + f.occluded === f.candidates;
    rows.push([
      "gpu check",
      gpu.error
        ? `${gpu.view}: ${gpu.error}`
        : `${gpu.view} · live ${gpu.live.drawn}/${gpu.tested} (color ok ${gpu.live.colorOk}, rim alpha ${spread(gpu.live.alpha, String)}) · plain ${gpu.plain.drawn}/${gpu.tested} · in frame ${f.changed}/${f.candidates}${f.occluded ? ` (+${f.occluded} behind scenery)` : ""} · programs ${dash(gpu.programs.live)}/${dash(gpu.programs.target)}/${dash(gpu.programs.frame)} · ${gpu.ms} ms`,
      !ok,
    ]);
  }
  return rows;
}

export default function DebugProbe() {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [gpu, setGpu] = useState<GpuCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState<string | null>(null);
  const highlight = useHighlight();
  const highlightRef = useRef(highlight);
  useEffect(() => {
    highlightRef.current = highlight;
  }, [highlight]);

  useEffect(() => {
    startRecorder();
    const tick = () => {
      const s = takeSnapshot(highlightRef.current);
      pushHistory({
        t: s.t,
        scene: s.scene,
        visible: s.badges?.visible ?? null,
        inView: s.badges?.inView ?? null,
        front: s.badges?.front ?? null,
        opacityMedian: s.badges?.opacity ? Math.round(s.badges.opacity.median * 100) / 100 : null,
        fadeMedian: s.badges?.fade ? Math.round(s.badges.fade.median * 100) / 100 : null,
        uploaded: s.textures?.uploaded ?? null,
        fps: s.gl?.fps ?? null,
        lost: s.gl?.lost ?? null,
      });
      setSnap(s);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // A GPU check describes one renderer; a view switch (or remount) makes a new one.
  useEffect(() => onProbeScene(() => setGpu(null)), []);

  const findings = snap ? explain(snap, gpu) : [];
  const level = worst(findings);

  const check = () => {
    if (!probeScene()) {
      setNote("No 3D scene to check: open the globe or the walk.");
      return;
    }
    setBusy(true);
    setNote("Checking…");
    // The check blocks the main thread for a moment; let the label paint first.
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        const t = probeScene();
        if (t) {
          const r = runGpuCheck(t);
          log("gpu-check", r.error ? `error: ${r.error}` : `${r.view}: live ${r.live.drawn}/${r.tested}, plain ${r.plain.drawn}/${r.tested}, in frame ${r.frame.changed}/${r.frame.candidates}, behind scenery ${r.frame.occluded}`);
          setGpu(r);
          setNote("");
        } else setNote("The 3D scene went away before the check ran.");
        setBusy(false);
      }, 0),
    );
  };

  const copy = async () => {
    const text = JSON.stringify(
      {
        probe: `${SITE.map.title} ?debug report`,
        generated: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        device: {
          dpr: window.devicePixelRatio,
          deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
          cores: navigator.hardwareConcurrency ?? null,
          screen: [window.screen.width, window.screen.height],
          jsHeapMB: (() => {
            const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
            return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
          })(),
        },
        findings,
        snapshot: snap,
        gpuCheck: gpu,
        counters,
        events,
        history,
      },
      null,
      2,
    );
    setManual(null);
    try {
      await navigator.clipboard.writeText(text);
      setNote("Report copied to the clipboard.");
    } catch {
      if (legacyCopy(text)) setNote("Report copied to the clipboard.");
      else {
        setManual(text);
        setNote("Copying was blocked: select the text below and copy it.");
      }
    }
  };

  return (
    <div className={`dbg${open ? " is-open" : ""}`} data-level={level}>
      <button type="button" className="dbg-chip" aria-expanded={open} aria-controls="dbg-body" onClick={() => setOpen((v) => !v)} title="Scene probe (?debug)">
        <span className="dbg-dot" aria-hidden="true" />
        debug
        {open ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </button>
      {open && (
        <div className="dbg-body" id="dbg-body">
          <div className="dbg-actions">
            <button type="button" className="dbg-btn" onClick={check} disabled={busy}>
              GPU check
            </button>
            <button type="button" className="dbg-btn" onClick={copy}>
              Copy report
            </button>
          </div>
          {note && (
            <p className="dbg-note" role="status">
              {note}
            </p>
          )}
          {manual !== null && <textarea className="dbg-manual" readOnly value={manual} onFocus={(e) => e.currentTarget.select()} aria-label="Report JSON" />}
          <ul className="dbg-findings" aria-label="Findings">
            {findings.map((f, i) => (
              <li key={i} data-level={f.level}>
                {f.text}
              </li>
            ))}
          </ul>
          {snap && (
            <dl className="dbg-rows">
              {rowsFor(snap, gpu).map(([k, v, flagged]) => (
                <div key={k} className={flagged ? "is-flagged" : undefined}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <details className="dbg-events">
            <summary>Events ({events.length})</summary>
            <ol>
              {events
                .slice(-15)
                .reverse()
                .map((e, i) => (
                  <li key={`${e.t}-${i}`}>
                    {secs(e.t)} {e.kind}: {e.detail}
                  </li>
                ))}
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}
