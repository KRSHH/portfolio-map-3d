/* Graphics check: open /?diag on a device where logos don't show.

   Uploads one company's badge through several texture paths, draws each into
   a small render target and reads the pixels back from the GPU, so each path
   gets a PASS/FAIL measured on this device rather than judged by eye. It does
   that twice, in two WebGL renderers one after the other, because the 3D
   views share cached textures across renderers (every view switch makes a
   new one). It also checks every cached badge the app itself uses. Nothing is
   sent anywhere; the visitor screenshots the page. */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { COMPANIES } from "../../data/catalog";
import { badgeCanvas, companyBadge } from "../../three/logoTexture";

type Make = (src: HTMLCanvasElement) => THREE.Texture | Promise<THREE.Texture>;

function copyCanvas(src: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d", opts)!.drawImage(src, 0, 0);
  return c;
}

function imageTex(img: HTMLCanvasElement | ImageBitmap, mips = true): THREE.Texture {
  const t = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const PATHS: { id: string; label: string; make: Make }[] = [
  { id: "B", label: "Canvas texture (GPU canvas)", make: (s) => imageTex(copyCanvas(s)) },
  { id: "C", label: "Canvas texture (CPU canvas)", make: (s) => imageTex(copyCanvas(s, { willReadFrequently: true })) },
  { id: "D", label: "Canvas texture, no mipmaps", make: (s) => imageTex(copyCanvas(s), false) },
  { id: "E", label: "ImageBitmap texture", make: async (s) => imageTex(await createImageBitmap(s, { imageOrientation: "flipY" })) },
];

interface Rig {
  renderer: THREE.WebGLRenderer;
  /** Alpha (0–255) of the badge's rim after drawing `tex` `size` px wide. 0 = the badge is invisible. */
  rim(tex: THREE.Texture, size: number): number;
  dispose(): void;
}

function makeRig(): Rig {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const target = new THREE.WebGLRenderTarget(64, 64);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const mat = new THREE.MeshBasicMaterial({ transparent: true });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);
  const px = new Uint8Array(4);
  return {
    renderer,
    rim(tex, size) {
      mat.map = tex;
      mat.needsUpdate = true;
      quad.scale.set(size / 64, size / 128, 1);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      // A pixel just inside the badge's left edge, vertically centered: always opaque when drawn.
      renderer.readRenderTargetPixels(target, Math.floor(32 - size / 2 + Math.max(1, size * 0.02)), 32, 1, 1, px);
      renderer.setRenderTarget(null);
      return px[3];
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

interface Row {
  id: string;
  label: string;
  first: string;
  second: string;
}

const verdict = (a: number[]) => (a.every((v) => v > 0) ? "PASS" : a.some((v) => v > 0) ? "PARTIAL" : "FAIL");

export default function DiagView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState("Checking…");

  useEffect(() => {
    let disposed = false;
    const textures: THREE.Texture[] = [];
    let shown: Rig | null = null;

    const run = async () => {
      const sample = COMPANIES.find((m) => m.logo) ?? COMPANIES[0];
      const src = await badgeCanvas(sample, false);
      // Let every app badge finish loading its logo before measuring.
      for (const m of COMPANIES) for (const lab of [false, true]) companyBadge(m, lab);
      await new Promise((r) => setTimeout(r, 2500));
      if (disposed) return;

      const made: { id: string; label: string; tex: THREE.Texture | null; err?: string }[] = [
        { id: "A", label: "This app's textures (byte arrays)", tex: companyBadge(sample, false).texture },
      ];
      for (const p of PATHS) {
        try {
          const tex = await p.make(src);
          textures.push(tex);
          made.push({ id: p.id, label: p.label, tex });
        } catch (e) {
          made.push({ id: p.id, label: p.label, tex: null, err: (e as Error).message });
        }
      }

      const passes: Record<string, number[]>[] = [];
      const appCounts: number[] = [];
      for (let pass = 0; pass < 2; pass++) {
        const rig = makeRig();
        if (pass === 0) {
          const gl = rig.renderer.getContext();
          const dbg = gl.getExtension("WEBGL_debug_renderer_info");
          setInfo([
            navigator.userAgent,
            `${gl.getParameter(gl.VERSION)}`,
            `GPU: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`,
            `Max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} · DPR ${window.devicePixelRatio} · memory ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "?"} GB · three r${THREE.REVISION}`,
          ]);
        }
        const res: Record<string, number[]> = {};
        for (const r of made) if (r.tex) res[r.id] = [rig.rim(r.tex, 64), rig.rim(r.tex, 12)];
        passes.push(res);
        let ok = 0;
        for (const m of COMPANIES) for (const lab of [false, true]) if (rig.rim(companyBadge(m, lab).texture, 48) > 0) ok++;
        appCounts.push(ok);
        if (pass === 0) rig.dispose();
        else shown = rig;
      }
      if (disposed) return;

      // Show the second renderer's result so a human can eyeball it too.
      const rig = shown!;
      const W = 240;
      const H = 72 * made.length;
      rig.renderer.setSize(W, H);
      hostRef.current?.appendChild(rig.renderer.domElement);
      const scene = new THREE.Scene();
      made.forEach((r, i) => {
        if (!r.tex) return;
        for (const [w, x] of [[120, 72], [40, 190]] as const) {
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: r.tex, transparent: true }));
          mesh.position.set(x, H - 36 - i * 72, 0);
          scene.add(mesh);
        }
      });
      rig.renderer.render(scene, new THREE.OrthographicCamera(0, W, H, 0, -1, 1));

      const total = COMPANIES.length * 2;
      setRows(made.map((r) => ({ id: r.id, label: r.label, first: r.tex ? verdict(passes[0][r.id]) : `error: ${r.err}`, second: r.tex ? verdict(passes[1][r.id]) : "-" })));
      setSummary(`App badges visible: ${appCounts[0]} of ${total} in the first view, ${appCounts[1]} of ${total} after a view switch.`);
    };
    run().catch((e) => setSummary(`The check failed: ${(e as Error).message}`));

    return () => {
      disposed = true;
      textures.forEach((t) => t.dispose());
      shown?.renderer.domElement.remove();
      shown?.dispose();
    };
  }, []);

  const cell = (v: string) => ({ padding: 4, fontWeight: 700, color: v === "PASS" ? "var(--success, #0c7a63)" : "#c62c49" });

  return (
    <div className="diag" style={{ position: "fixed", inset: 0, overflow: "auto", padding: 16, background: "var(--bg)", color: "var(--text)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Graphics check</h1>
      <p style={{ margin: "0 0 12px", color: "var(--text-muted)" }}>Take a screenshot of this page and send it to whoever asked. Nothing is uploaded.</p>
      <p style={{ fontWeight: 700, margin: "0 0 8px" }}>{summary}</p>
      <table style={{ fontSize: 13, borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 4 }} colSpan={2}>
              Texture path
            </th>
            <th style={{ padding: 4 }}>First view</th>
            <th style={{ padding: 4 }}>After switch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: 4, fontWeight: 700 }}>{r.id}</td>
              <td style={{ padding: 4 }}>{r.label}</td>
              <td style={cell(r.first)}>{r.first}</td>
              <td style={cell(r.second)}>{r.second}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={hostRef} style={{ background: "#a9cf8a", lineHeight: 0, display: "inline-block", marginBottom: 12 }} />
      <ul style={{ fontSize: 12, paddingLeft: 18, margin: 0, wordBreak: "break-word", color: "var(--text-muted)" }}>
        {info.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
