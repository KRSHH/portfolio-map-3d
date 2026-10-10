# The Portfolio Map Network

Every map built with portfolio-map-3d links to the **Nexus**: the 3D world where the maps in the
network appear together, so a visitor to any one map can see the others and travel between them.
Linking to the Nexus is open to every map. **Appearing in it is not**: a map becomes a world there
only after the linking handshake below, and it drops out if it stops keeping it.

## The one requirement

**A map built with this framework links to the Nexus.** In practice you keep what the framework
already does:

- the **portal** on the walk world's plaza (`src/views/walk/portal.ts`);
- the **Nexus** link in the top bar and the "Part of the Portfolio Map Network" section in the
  About panel (`src/network.ts`);
- the `portfolio-map:nexus` **meta tag** in `index.html` and the **manifest** at
  `/portfolio-map.json`, both written by the build (`vite.config.ts`, `scripts/manifest.mjs`).

You may restyle them to fit your brand, translate them, and move them within the same places. You
may not remove them or hide them from visitors. `npm run build` checks that the manifest, the meta
tag and the Nexus address are in the bundle (`scripts/check-bundle.mjs`).

## The linking handshake

Four steps. The first three are checked by machine, every time the Nexus is built; the fourth is
one person's approval, once. `npm run join-check -- https://your-map` runs the first three against
your deployed map before you apply.

| Step | What it proves | How |
|---|---|---|
| **1. Publish** | The map is a real portfolio-map and says who it is. | Its manifest (`/portfolio-map.json`) keeps the protocol and names the same id and address as its registry entry. The build writes it. |
| **2. Link** | The map links to the Nexus. | Its manifest names the Nexus, and its page carries the `portfolio-map:nexus` meta tag. The build writes both. |
| **3. Prove** | The organization behind the map vouches for it, so nobody can list a map in someone else's name. | One of: the map is on the publisher's own domain or a subdomain of it (`map.yourorg.com`; nothing to do); the publisher's homepage links to the map; or a DNS TXT record `_portfolio-map.yourorg.com` with the value `portfolio-map-verification=<your id>`. When none of these fits, a maintainer confirms it another way and records it in the registry entry (`ownerConfirmedBy`). |
| **4. Review** | A person has looked at it. | A maintainer approves the pull request that adds `registry/instances/<id>.json` (only maintainers can: `.github/CODEOWNERS`). |

A map that fails a step is listed with the reason (`invalid`, `no-backlink`, `unconfirmed`) and is
not shown as a world. A map that cannot be reached keeps its last good world, marked "not
reachable at last check".

## What the review looks at

The maintainers approve an entry when:

1. **It is a real organization publishing its own companies**: an accelerator, incubator, fund,
   university program, chamber, community. Not a list scraped from someone else, not a single
   company's marketing site.
2. **It keeps the data contract** ([docs/data-contract.md](./docs/data-contract.md)): every fact
   has a source, nothing is invented, no personal contact data. A spot check of a few records.
3. **It does not impersonate**: the map's name and publisher match the organization that vouched
   for it in step 3.
4. **Its content is appropriate** for a shared public space: no spam, nothing unlawful or hateful.
5. **It keeps the link** (the one requirement above).

The review is a few minutes, not an audit. A maintainer may ask a question on the pull request.

## Removal

A map leaves the world at the next build when its handshake breaks (the link or the proof goes
away). A maintainer removes a registry entry, by pull request with the reason, when a map no
longer meets the review criteria; its maintainer is told on the pull request. You can leave at any
time by deleting your entry.

## What the network shares

Only what your map already publishes: your organization's name, publisher and website, logo,
accent color and labels, your districts with their counts, and for each company its name,
district, website, keywords and (unless you set `network.shareDescriptions` to `false`) its
description. No sources, no people, no founders, no contact data. The Nexus stores nothing about
visitors.

## On the license

The framework's code is released under the MIT License ([LICENSE](./LICENSE)). The requirement
and the handshake above are the conditions for being listed in the network and shown in the Nexus,
and the framework's build checks the link; they are not additional terms of the MIT License.
