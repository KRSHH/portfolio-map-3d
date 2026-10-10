# The registry

One JSON file per map in the Portfolio Map Network, named `<id>.json`, where `<id>` is the map's
`network.id` in its `site/site.json`:

```json
{
  "id": "acme-ventures",
  "name": "Acme Ventures",
  "url": "https://map.acme.vc",
  "joined": "2026-10-09",
  "maintainer": "your-github-handle"
}
```

- `url`: the map's public address, https, no trailing slash (its manifest is at
  `<url>/portfolio-map.json`).
- `joined`: the day the pull request is merged (a maintainer may adjust it).
- `maintainer`: a GitHub handle, never an email address.
- `ownerConfirmedBy` (only when needed, set by a maintainer): the maintainer's GitHub handle, when
  they confirmed by other means that the publisher stands behind the map, because none of the
  automatic proofs fits (docs/network.md, "The publisher's proof").

Run `npm run join-check -- https://<your map>` first: it checks the handshake against your live map
and prints this file. Add your file by pull request. CI runs `npm run registry:check`; a maintainer
runs `node scripts/check-registry.mjs --fetch <id>` (the same checks), reviews the map against
NETWORK.md and merges. The Nexus picks the map up at its next build. See
[docs/network.md](../docs/network.md#joining) and [NETWORK.md](../NETWORK.md).
