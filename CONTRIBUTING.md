# Contributing

Thank you for helping. Two kinds of contribution land here:

## Joining the network

Add `registry/instances/<your-id>.json` by pull request ([docs/network.md](./docs/network.md#joining)).
Keep the pull request to that one file.

## Improving the framework or the Nexus

1. Open an issue first for anything larger than a fix, so we can agree on the shape.
2. Work on a branch; keep changes to `site/` out of framework pull requests (the example is shared
   by everyone).
3. Before you push: `npm run validate && npm test && npm run build`, and `npm run nexus:build` when
   you touch `nexus/` or `federation/`.
4. Follow [CLAUDE.md](./CLAUDE.md): it is the operating manual for people and coding agents alike.
   In short: provenance first, never invent, no personal contact data, people never linked to
   companies, organization-specific words only from `site/site.json`, and the link to the Nexus is
   never weakened.
5. A change to the manifest's shape is a protocol change ([docs/network.md](./docs/network.md#versioning)).

By contributing you agree that your contribution is released under the MIT License.
