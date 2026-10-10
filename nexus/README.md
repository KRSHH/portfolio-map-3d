# The Nexus

The landing page of portfolio-map-3d and the shared 3D world every map built with it links to.
Each map in the network is a world around a glowing core; a bridge of light runs from every world
into the core (the link each map makes to the Nexus). Nothing joins two worlds: the Nexus implies
no relationship between organizations.

It is a separate static app in this folder (Vite, React 19, TypeScript, three.js), deployed by
Vercel at <https://wearenexus.xyz> (served at the root), with the example map at
<https://wearenexus.xyz/example/>. It reads the protocol from
[`../federation`](../federation) and the network from `public/network.json`.

## Addresses

| Address | What it shows |
|---|---|
| `/` | The landing page. Its hero is the live Nexus, drifting. |
| `/?world` | The world: every map as a world, a list of worlds, and search across the network. |
| `/?world=<id>` | The world, turned to one map with its panel open (shareable). |
| `/?world&from=<id>` | An arrival from a map (`nexusHref()` in the protocol): framed on its world, with a welcome and a way back. A `from` that is not a world here gets a neutral note instead, and the id is not echoed. |
| `…&via=portal` | The visitor walked through a map's portal: a short ring-of-light transition (none under reduced motion). |
| `…&sample` | Fictional sample data (`src/sample.ts`) instead of `network.json`, with a visible "Sample data" badge. For development only. |

Built for a base path (below), the same addresses follow it (`/<base>/?world`).

## Run it

From the repository root (Node 22; dependencies are the root `package.json`'s):

```bash
npx vite --config nexus/vite.config.ts          # dev server, http://localhost:5180/
npx vitest run --config nexus/vite.config.ts    # unit tests
npx tsc -p nexus/tsconfig.json                  # type check
npx vite build --config nexus/vite.config.ts    # build to nexus/dist
npx vite preview --config nexus/vite.config.ts  # serve the build, http://localhost:4180/
```

The root `package.json` wraps them: `npm run nexus:dev`, `npm run nexus:preview`, and
`npm run nexus:build`, which first refreshes `public/network.json` from the registry, then
type-checks and builds. Open `/?sample` or `/?world&sample` to work with the sample network.

## The network file

`public/network.json` is a `NetworkSnapshot` (`federation/protocol.ts`), written by
`node scripts/build-network.mjs` from `registry/instances/`. Never edit it by hand. The build
script fetches every manifest, validates it, checks the backlink and the publisher's proof of
ownership, and copies logos to `public/instances/`.

The Nexus checks the snapshot again with the protocol's own functions (`src/lib/network.ts`):

- `verified` instances are worlds;
- `unreachable` instances with a last good manifest are dimmed worlds, marked "Not reachable at
  last check";
- `invalid`, `no-backlink` and `unconfirmed` instances, and unreachable ones never read, are never
  worlds. The network list on the landing page shows them apart, with the reason in plain words.

A logo is loaded only from a relative path under the Nexus (`instances/<id>.<ext>`); anything else
shows the world's initials.

## Deploy

Vercel, from `main`, with this folder as the project's Root Directory: `vercel.json` here runs
`npm run nexus:site` from the repository root, which builds the example map, the network, then the
Nexus at the root (the default base, `/`), with the example map next to it at `/example/`. A
scheduled workflow (`.github/workflows/nexus-refresh.yml`) rebuilds it daily through a deploy hook.
Setup steps: [docs/deploying.md](../docs/deploying.md#the-nexus).

The Nexus also works under a path. `vite.config.ts` reads `NEXUS_BASE` (default `/`), and every
URL the app builds goes through `import.meta.env.BASE_URL`: `network.json`, logos, the favicon,
the example map link and in-app navigation. All addresses are query strings on the base path, so
no host needs a fallback page. To check a build under a path locally:

```bash
NEXUS_BASE=/some/path/ npx vite build --config nexus/vite.config.ts
npx vite preview --config nexus/vite.config.ts --base /some/path/
# then open http://localhost:4180/some/path/ and /some/path/?world&sample
```

`NEXUS_URL` in `federation/protocol.ts` is the deployed address (`https://wearenexus.xyz`). It
fills `og:url` and the canonical link at build time, and it is what every map's manifest must
name to count as linking back (`ACCEPTED_NEXUS_URLS` also accepts its www form, and keeps an old
address after a move).

## Configure

`src/config.ts` holds the "Have it built for you" section: the provider, where requests go
(`intake`: an email address, today jeremy@embarccollective.com, which "Request a setup" opens as an
email with the request's questions filled in; or an https form, and a GitHub form shows a note that
requests are public), an optional note, and the packages (a `price` of `null` reads "Quoted per organization"; a `checkoutUrl` adds a "Book"
button). `config.test.ts` checks it.

## Link previews

`public/og.png` is the link-preview image (1200 × 630, under 1 MB), named by `og:image` and
`twitter:image` in `index.html` with the Nexus's absolute address. It is a capture of the landing
page's hero at 1200 × 630 with the navigation, buttons and counts hidden, the lede shortened and
the address added; the worlds in it are the network as it was on 10-Oct-2026 (Ambition
Accelerated, Embarc Collective and Example Collective). Retake it when the hero changes or the
picture no longer matches the network. `src/og.test.ts` checks its size and the tags.

## How it is built

```
src/
  App.tsx            the two pages, one 3D engine shared by both
  components/        Landing, WorldMode (HUD), WorldPanel, NetworkSearch, WorldList,
                     NetworkList (cards; also the no-3D fallback), CodeBlock, SceneHost, icons
  hooks/             useRoute (the address is the state), useNetwork, useEngine, useMedia
  lib/               pure, unit-tested logic: network (the model), layout (where worlds stand),
                     surface (what a world's surface shows), search, declutter (labels),
                     route, hud (the HUD's geometry), copy, color
  three/             engine (the scene), paint (every canvas), fromModel, cpuCanvas,
                     contextWatch, webgl
  styles/            tokens.css (every color; tokens.test.ts checks contrast), base, landing, world
  sample.ts          the fictional sample network (?sample only)
  config.ts          the white-glove section
```

- **Layout** (`lib/layout.ts`): a golden-angle spiral on a tilted disc. Slots go in join order, so
  older maps keep their place as new ones join; a map that drops out leaves its slot empty. A
  world's size grows with the square root of its company count.
- **Surfaces** (`lib/surface.ts`, `three/paint.ts`): district bands proportional (by area) to their
  company counts, in the map's own district colors, a light for each company, and a rim in the
  map's accent.
- **Labels** are painted on canvases and kept apart on screen (`lib/declutter.ts`): the world in
  view keeps its label, then the nearest; none sits under the HUD or the landing headline.
- **No network assets in 3D**: no remote fonts, models or environment maps. Labels use the page's
  font once it has loaded (falling back to system-ui).
- **Render on demand**: the loop runs only while something moves and stops when the scene is
  still, off screen or hidden. Under `prefers-reduced-motion` (read live) there is no drift, flow
  or spin, and camera moves are instant. React never updates per frame.
- **WebGL context loss**: every texture's canvas is CPU-backed and repainted after a restore; if
  the browser does not restore the context within 3 seconds, the engine is rebuilt with a fresh
  canvas. Without WebGL 2 the world mode shows the network as a list.
- **Accessibility**: every world is reachable from the list of worlds and from search, by keyboard
  (`/` focuses search, Esc closes what is open); landmarks, a skip link, visible focus, 44 px touch
  targets, and announcements for search results and arrivals.
