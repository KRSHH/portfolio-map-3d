# Deploying

`npm run build` produces `dist/`, a static site: no server, no database, no secrets. Any static
host works. Set `map.url` in `site/site.json` to the address you deploy at first: link previews,
the manifest and the network use it.

## Vercel

Import the repository. `vercel.json` already sets the framework (Vite), `npm ci`, `npm run build`,
`dist`, cache headers, security headers, and the cross-origin header on `/portfolio-map.json`.
Every push to `main` deploys. Vercel sets `VERCEL_ENV=production` on production deploys, which
picks the live-explorer channel ([live-explorers.md](./live-explorers.md)).

## Netlify

Build command `npm run build`, publish directory `dist`, Node 22. Add to `netlify.toml`:

```toml
[[headers]]
  for = "/portfolio-map.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
```

## GitHub Pages and other hosts

Build in CI and publish `dist/`. The map works under a sub-path too (`https://you.github.io/map`):
set `map.url` to that address and the build takes its path as Vite's `base` by itself (or set
`BASE_PATH`); `vite preview` serves it there. Set `LIVE_ENV=production` on your production build if
you turn on live explorers and your host doesn't set `VERCEL_ENV`.

For GitHub Pages, set Settings → Pages → Source to **GitHub Actions** (not "Deploy from a branch",
which publishes the unbuilt repository) and add `.github/workflows/pages.yml`:

```yaml
name: Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

To join the network from a sub-path on a shared host like `github.io`, the domain is not yours, so
prove ownership with a link from your website's homepage or a DNS record
([network.md](./network.md#the-publishers-proof)).

## What the build checks

1. `scripts/validate-site.mjs`: the content contract on `site/`, and the network manifest.
2. `tsc`: types.
3. `vite build`, which also writes `/portfolio-map.json` and `/brand/*`.
4. `scripts/check-bundle.mjs`: no Supabase secret key or non-anon token, no provenance, and the
   link into the network (manifest, meta tag, Nexus address) present.

Any failure stops the deploy, so a broken contract never goes live.

## The Nexus

The network's maintainers deploy the Nexus from this repository with Vercel at its own domain,
**https://wearenexus.xyz**, with the example map beside it at `/example/`. One command builds the
whole site into `nexus/dist/`:

```bash
npm run nexus:site
```

It builds the example map (its base, `/example/`, comes from `map.url`), checks every map in the
registry (`scripts/build-network.mjs`, the example from the build it is about to publish), builds
the Nexus at the root, and puts the example inside it. Every push to `main` deploys; the **Nexus
refresh** workflow (`.github/workflows/nexus-refresh.yml`) asks Vercel for a rebuild every day, so
maps that join appear and maps that break the handshake drop out. The Nexus's address is
`NEXUS_URL` in `federation/protocol.ts`; a move keeps the old address in `ACCEPTED_NEXUS_URLS`.

Setting it up (once):

1. Vercel → Add New → Project → import this repository. **Root Directory: `nexus`.** That folder's
   `vercel.json` sets everything else (install and build from the repository root, output
   `nexus/dist`, headers); the root `vercel.json` is for maps, not the Nexus. Leave "Include files
   outside the root directory in the Build Step" on, and the Node.js version at 22.x or later. No
   environment variables. Deploy.
2. Settings → Domains: add `wearenexus.xyz`, and `www.wearenexus.xyz` redirecting to it. At the
   domain's registrar, add the DNS records the Domains page shows (or switch the domain to Vercel's
   nameservers). Vercel issues the certificate once the records resolve.
3. Settings → Git → Deploy Hooks: create one for the branch `main` and copy its URL. In GitHub, add
   it as the repository secret `NEXUS_DEPLOY_HOOK` (Settings → Secrets and variables → Actions). Run
   **Nexus refresh** once (Actions → Nexus refresh → Run workflow) to check it.
4. GitHub → Settings → Pages: unpublish the site and set the source to none, so GitHub Pages stops
   serving a second copy.
