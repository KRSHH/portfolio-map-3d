# The network protocol (portfolio-map/1)

The Portfolio Map Network connects every map built with this framework through one shared world,
the **Nexus**. The protocol is small: a manifest each map publishes, a backlink, a publisher's
proof, and a registry of maps a maintainer has approved. Together they make the **linking
handshake** (Publish, Link, Prove, Review; [NETWORK.md](../NETWORK.md) has the terms and the review
criteria). Its constants, types, links and checks are one file each in
[`federation/`](../federation), shared by the map, the Nexus and the scripts.

```
 your map (site/)                                     the Nexus (nexus/)
 ─────────────────                                    ──────────────────
 npm run build ──▶ dist/portfolio-map.json  ◀── fetch ── scripts/build-network.mjs
                   dist/index.html (meta)   ◀── fetch ──   reads registry/instances/*.json
                   the portal, the Nexus link ───────────▶ /?world&from=<id>   (visitors)
                                            ◀──────────── <url>/?from=nexus    (visitors)
```

## The manifest

`<map url>/portfolio-map.json`, written by the build from `site/` (`scripts/manifest.mjs`). The
build validates it against the protocol (`federation/validate.ts`) and fails on a problem.

```json
{
  "protocol": "portfolio-map/1",
  "id": "acme-ventures",
  "name": "Acme Ventures",
  "publisher": { "name": "Acme Ventures", "website": "https://acme.vc" },
  "url": "https://map.acme.vc",
  "tagline": "Acme's portfolio, mapped in 3D.",
  "logo": "https://map.acme.vc/brand/logo.svg",
  "accent": "#0c7a8c",
  "nexus": "https://wearenexus.xyz",
  "framework": { "name": "portfolio-map-3d", "version": "0.1.0" },
  "labels": { "company": "startup", "companies": "startups", "district": "track", "districts": "tracks", "people": "mentors" },
  "counts": { "companies": 42, "people": 12, "districts": 5 },
  "districts": [{ "slug": "fintech", "label": "FinTech", "color": "#2a78d6", "count": 9 }],
  "companies": [{ "slug": "acme-pay", "name": "Acme Pay", "district": "fintech", "description": "…", "website": "https://acmepay.example", "keywords": ["payments"] }],
  "updated": "2026-10-09"
}
```

- Every field is required (`null` where allowed); unknown fields are rejected.
- `url` and `nexus` are https; `url` has no trailing slash, query or hash.
- Counts must add up: `counts.companies` is the index's length, each district's `count` the number
  of companies in it.
- Texts travel verbatim; one longer than the limits (`LIMITS` in `federation/protocol.ts`) is left
  out rather than cut. Email addresses and phone numbers are rejected anywhere.
- `labels.people` is `null` when the map has no people roster.
- `publisher` is who publishes the map and their own website (`site.json` `org.name` and
  `org.website`). It is what step 3 of the handshake checks. Usually the same organization as
  `name`; a program's map may be published by its platform partner.

Hosts must serve it as JSON; cross-origin reads are welcome (`vercel.json` adds
`Access-Control-Allow-Origin: *` for it).

## The backlink

A map links to the Nexus in four places, all written by the framework:

| Where | What |
|---|---|
| The walk world | A portal on the plaza; walking through it opens `NEXUS/?world&from=<id>&via=portal`. |
| The top bar | A **Nexus** link to `NEXUS/?world&from=<id>`. |
| The About panel | "Part of the Portfolio Map Network", with the same link. |
| `index.html` | `<meta name="portfolio-map:nexus" content="NEXUS/?world&from=<id>">`, readable without running the app. |

`npm run build` fails when the manifest, the meta tag or the Nexus address is missing from the
bundle (`scripts/check-bundle.mjs`).

## The publisher's proof

So that nobody can list a map in someone else's name, the organization behind a map vouches for
it, in one of these ways (`OwnerProof` in `federation/protocol.ts`), checked in this order:

| Proof | What to do | Example |
|---|---|---|
| `domain` | Nothing: deploy the map on your website's domain or a subdomain of it. The recommended setup. | `https://map.acme.vc` for `https://acme.vc` |
| `dns` | Add a TXT record `_portfolio-map.<your domain>` with the value `portfolio-map-verification=<your id>`. | `_portfolio-map.acme.vc  TXT  "portfolio-map-verification=acme-ventures"` |
| `link` | Link to the map from your website's homepage (an `<a href>` naming the map's address). | `<a href="https://acme-map.vercel.app">Our portfolio in 3D</a>` |
| `maintainer` | When none fits, a maintainer confirms it another way and sets `ownerConfirmedBy` in your registry entry to their GitHub handle. | |

A shared hosting domain (`github.io`, `vercel.app`, `netlify.app` and the others in `SHARED_HOSTS`)
is nobody's own, so it can never vouch for a map: name your organization's own website. A map
*hosted* on one (`acme.github.io/map`) proves ownership with a homepage link or a DNS record.

## The registry

`registry/instances/<id>.json`, one file per map ([registry/README.md](../registry/README.md)):
`id`, `name`, `url`, `joined`, `maintainer` (a GitHub handle), and `ownerConfirmedBy` only when a
maintainer confirmed the publisher by hand. CI runs `npm run registry:check`. The fourth step of
the handshake, review, is this pull request: `.github/CODEOWNERS` makes a maintainer's approval
required for anything under `registry/` (turn on "Require review from Code Owners" in the
repository's branch protection for `main`).

## The Nexus's check

`scripts/build-network.mjs` runs before every Nexus build (and on a schedule). For each entry it
fetches the manifest and the page, then:

| Status | When | In the Nexus |
|---|---|---|
| `verified` | The manifest keeps the protocol, names the entry's id and url and the Nexus, the page has the meta tag, and the publisher vouches for the map. | A world, with how it was verified. Its logo is copied into the Nexus. |
| `unreachable` | The manifest or page could not be read. | Its last good world, marked "not reachable at last check". |
| `invalid` | The manifest breaks the protocol or names another id or address. | Listed, not a world. |
| `no-backlink` | The manifest names another Nexus, or the page lost the meta tag. | Listed as not linked, not a world. |
| `unconfirmed` | The publisher has not vouched for the map (no proof above). | Listed, with what to do, not a world. |

It writes `nexus/public/network.json` (`NetworkSnapshot` in `federation/protocol.ts`).

## Links between worlds

- Into the Nexus: `nexusHref(id, via)` → `NEXUS/?world&from=<id>[&via=portal]`. The Nexus opens
  its world turned to that map, says where the visitor came from, and offers the way back.
- Into a map: `instanceHref(url, company?)` → `<url>/?from=nexus[&company=<slug>]`. The map opens
  (at the company, if one is named) and offers the way back to the Nexus.

## Joining

1. Set `org.website` in `site/site.json`, then build and deploy your map, ideally on your own domain
   or a subdomain of it.
2. Run `npm run join-check -- https://<your map>`. It checks Publish, Link and Prove against the
   live map, says what to fix if anything fails, and prints your registry file.
3. Add that file as `registry/instances/<your network.id>.json` by pull request (or open a "Join
   the network" issue and a maintainer adds it for you).
4. A maintainer reviews it (NETWORK.md) and merges. The Nexus shows your world from its next build.

A link to the Nexus from a site that has not joined only opens the Nexus: the Nexus says the map
the visitor came from has not joined the network yet, and shows nothing in its name.

## Versioning

The protocol id is `portfolio-map/1`. Additions that old readers can ignore keep the id; anything
else becomes `portfolio-map/2`, and the Nexus reads both for a transition period.
