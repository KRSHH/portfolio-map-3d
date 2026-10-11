/* The walk world, running the vendored SummerTime scene (src/summer): the real town, the real kid,
   the real camera, controls, light, LUT grade and sound — laid out like Ambition's map
   (src/summer/mapOverlay.ts): a founding hub (monument, pylons, Nexus portal) at the town
   center, one neighborhood per district plus the people area, spawn south of the monument.

   This file only hosts the engine and the overlay: a div for the canvas, a loader while the
   town boots. The engine is a module-level singleton (like the original): it boots once per
   page load. A persistent host div owns the canvas and the input listeners, and each React
   mount moves that div here, so StrictMode remounts and view switches keep working. */
import { useEffect, useRef, useState } from "react";
import { DISTRICTS, PEOPLE, SITE, companiesByDistrict } from "../../data/catalog";
import { PORTAL_HREF } from "../../network";
import { useStore } from "../../state/store";

interface Boot {
  engine: { active: boolean; render(time: number, delta: number): void };
  controller: unknown;
  overlay: { mountLayer(host: HTMLElement): void; setSelected(slug: string | null, isPerson: boolean): void };
}

let boot: Promise<Boot> | null = null;
let persistentHost: HTMLDivElement | null = null;

function bootOnce(): Promise<Boot> {
  if (!boot) {
    boot = (async () => {
      const { client } = await import("../../summer/core/client");
      if (!client.capabilities.webgl) throw new Error("WebGL2 is not available in this browser.");
      const { gsap } = await import("gsap");
      const { CustomEase } = await import("gsap/CustomEase");
      gsap.registerPlugin(CustomEase);
      CustomEase.create("inOut1", "M0,0 C0.5,0 0.1,1 1,1");
      CustomEase.create("inOut2", "M0,0 C0.56,0 0,1 1,1");
      CustomEase.create("inOut3", "M0,0 C0.6,0 0,1 1,1");
      CustomEase.create("inOut4", "M0,0 C0.4,0 -0.06,1 1,1");
      const { engine } = await import("../../summer/engine/globals");
      const { clock } = await import("../../summer/engine/clock");
      const { MainController } = await import("../../summer/scene/mainController");
      persistentHost = document.createElement("div");
      persistentHost.style.position = "absolute";
      persistentHost.style.inset = "0";
      const safariDesktop = client.browser.name === "safari" && client.device === "desktop";
      engine.init({
        webglContainer: persistentHost,
        fingers: 2,
        contextMenu: false,
        DPR: safariDesktop ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
        adaptiveDPR: true,
      });
      engine.active = true;
      const controller = new MainController() as unknown as { environment: unknown; ready: Promise<void> };
      if (import.meta.env.DEV) (window as unknown as { __summer?: unknown }).__summer = { engine, controller };
      // Like the original main.ts: the loop runs from boot; readiness only releases the intro.
      clock.start((time, delta) => engine.render(time, delta));
      await controller.ready;
      // This is what fades the white intro photo into the town (MainController.playIntro waits on it).
      engine.initialSceneLoaded.resolve();
      // The map overlay: Ambition-style layout in the real town.
      const { buildMapOverlay } = await import("../../summer/mapOverlay");
      const store = useStore.getState();
      const overlay = buildMapOverlay(controller.environment, {
        orgName: SITE.org.name,
        districts: DISTRICTS.map((d) => ({ ...d, companies: companiesByDistrict.get(d.slug) ?? [] })),
        people: PEOPLE,
      }, {
        onMeetCompany: (slug) => store.select(slug, { fly: false }),
        onMeetPerson: (slug) => store.selectPerson(slug, { fly: false }),
        goNexus: () => window.location.assign(PORTAL_HREF),
      });
      const syncSelection = () => {
        const s = useStore.getState();
        overlay.setSelected(s.selected ?? s.person, s.selected == null && s.person != null);
      };
      syncSelection();
      const off = useStore.subscribe(syncSelection);
      if (import.meta.env.DEV) (window as unknown as { __summer?: unknown }).__summer = { engine, controller, overlay, off };
      return { engine, controller, overlay };
    })();
    boot.catch(() => {
      boot = null;
      persistentHost = null;
    });
  }
  return boot;
}

export default function SummerWalk() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const host = hostRef.current;
        if (!host) return;
        const b = await bootOnce();
        if (!alive) return;
        // Move the persistent canvas host here (first mount appends, remounts re-append).
        if (persistentHost && persistentHost.parentNode !== host) host.append(persistentHost);
        b.overlay.mountLayer(host);
        b.engine.active = true;
        setReady(true);
      } catch (err) {
        console.error("SummerWalk failed to start:", err);
        if (alive) setFailed(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
      // Pause rendering while unmounted; the next mount resumes. The shared loop stays up.
      boot?.then((b) => {
        b.engine.active = false;
      }).catch(() => {});
    };
  }, []);

  return (
    <div className="view walk-view" role="region" aria-label="Walkable world">
      <div ref={hostRef} className="walk-canvas" style={{ position: "absolute", inset: 0 }} />
      {!ready && !failed && (
        <div className="walk-card walk-intro" style={{ position: "absolute", top: 16, left: 16 }}>
          <h2>Loading the town…</h2>
          <p>Fetching the models, textures and sound.</p>
        </div>
      )}
      {failed && (
        <div className="walk-card walk-intro" style={{ position: "absolute", top: 16, left: 16 }}>
          <h2>The town could not start</h2>
          <p>{failed}</p>
        </div>
      )}
    </div>
  );
}
