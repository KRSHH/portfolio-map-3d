# Architecture

A static single-page app (Vite 8 + React 19 + TypeScript), two procedurally built three.js views
(React Three Fiber), a zustand store mirrored into the URL, and one optional realtime service.
Built from the Embarc Member Map and the Ambition Accelerated Community Map, whose hard-won fixes
for real devices it keeps.

## Code map

```
src/site.ts        the site config (site/site.json) and the labels helper L
src/network.ts     the map's link into the network: NEXUS_HREF, PORTAL_HREF, arrival from the Nexus
src/data/          catalog (the one reader of site/), types, graph (connections, provider finder),
                   search (companies, people), labels, layout (the walk world's geometry), hub (the
                   hub's and the portal's footprints), tests
src/state/         zustand store + URL deep-link sync
src/three/         badge and label textures shared by both views (baked to byte arrays), logo
                   measurement (logoInfo), CPU-backed canvases, the WebGL context-loss watch
src/live/          live explorers: anonymous identity, presence (Supabase Realtime or BroadcastChannel)
src/components/    the shell: TopBar, DetailSheet, PersonDetail, Panels (finder, districts, about),
                   ListView, NexusArrival, shared bits (district icons, logo thumbnails)
src/views/         mindmap/ (both globes: controller, globeContent, globeLayout, personLayout),
                   walk/ (engine, world, hub, portal, pins, minimap, nav, avatar, explorers),
                   diag/ (the /?diag graphics check)
src/debug/         the ?debug scene probe
federation/        the network protocol (plain TypeScript, read by the map, the Nexus and Node)
scripts/           validate-site, manifest, import-csv (+ csv), new-site, check-bundle,
                   build-network, check-registry, contract-patterns
nexus/             the Nexus app (landing page + shared world)
```

## Data flow

```
site/site.json ─┐
site/taxonomy.json ─┤                         ┌─▶ the app (src/data/catalog.ts; the build drops sources)
site/data/*.json ───┼─ scripts/validate-site ─┤
site/logos/, people/, brand/ ─┘               └─▶ dist/portfolio-map.json (scripts/manifest.mjs) ─▶ the Nexus
```

`src/data/catalog.ts` is the only module that imports `site/`. Logos and headshots are found by
file name (`import.meta.glob`), so adding one is dropping a file. `publicData()` in
`vite.config.ts` keeps only the fields the app reads in the production bundle.

## Why it is built this way

- **Static.** The data is small (tens to a few thousand records), public, and changes when the
  organization's list changes. A static build is the cheapest thing to host and the simplest to
  keep honest. three.js and React Three Fiber load only with a 3D view; the List never downloads
  them.
- **Deterministic layouts.** The globe's regions (`globeLayout.ts`) and the walk world's ring
  (`layout.ts`) are hand-written and come out the same on every visit, sized by company counts.
- **Badges as bytes.** Every badge is painted on one shared canvas and copied into a `DataTexture`.
  Chrome for Android can evict or wipe 2D canvases it holds, and a cached canvas texture then
  uploads blank in the next view; bytes in ordinary memory cannot be wiped. Every other canvas that
  backs a texture is CPU-backed (`cpuCanvas`), because a GPU process loss wipes GPU-backed
  canvases. Each view redraws after a context restore and starts over if none comes.
- **Logos measured in the browser.** `src/three/logoInfo.ts` reads a small copy of each logo once:
  opaque corners → the logo's own background; light artwork → an ink plate; otherwise white; empty
  margins trimmed. No image pipeline to install.
- **One engine per view, no per-frame React state.** The globe runs on one `GlobeController` with a
  `GlobeContent` per globe; the walk world on `WalkEngine`. React renders the HUD and real buttons
  for labels; the engines position them.
- **Accessibility.** Every record is reachable without 3D; labels in the 3D views are real buttons;
  Esc closes one layer at a time; reduced motion turns off auto-rotation, drop-ins and easing.

## Extending

- A district icon: add the lucide icon to `DISTRICT_ICONS` in `src/components/bits.tsx`.
- Your own hub building: replace `src/data/hub.ts` and `src/views/walk/hub.ts`, keeping exports.
- A field the UI should read: add it to `types.ts`, the validator's whitelist, and check that
  `publicData()` keeps it.
- Never remove the portal, the Nexus link, the meta tag or the manifest
  ([NETWORK.md](../NETWORK.md)).
