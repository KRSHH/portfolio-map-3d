# The data contract

The map is a provenance system: every fact it shows has a source, nothing is invented, and some
things never ship. `scripts/validate-site.mjs` enforces what it can before every build.

## The rules

1. **Every record keeps its sources.** A company or person needs at least one source; a
   description needs its `descriptionSource`; a founder or leader needs a `source`; a documented
   connection needs a source naming both companies.
2. **Never invent.** Unknown stays `null` (or `[]`) and the interface leaves it out. Never write a
   description for a company; copy it from a source, verbatim.
3. **Never ship personal contact data.** Email addresses, phone numbers and street addresses with a
   unit number are rejected in every string. Only public profile links (LinkedIn) for people a
   source names.
4. **Documented vs derived.** A *known connection* is a relationship a source records between two
   companies. A *potential fit* is derived (`src/data/graph.ts`) from what one company offers and
   the industry another is in; the interface always labels it as a suggestion.
5. **People are not linked to companies.** The people roster (coaches, mentors) has no
   connections, highlights or suggestions to companies, districts or industries. Search finds a
   person by name and title only, never by the companies their bio mentions.
6. **The live map shows no sources.** Provenance stays in `site/`; the production build drops it
   (`publicData()` in `vite.config.ts`) and `scripts/check-bundle.mjs` fails a build that ships it.

## Sources

```json
{ "url": "https://acme.vc/portfolio", "title": "Acme Ventures: Portfolio", "retrieved": "2026-10-09" }
{ "kind": "company-supplied", "title": "Sent by the company's CEO by email", "retrieved": "2026-10-09" }
{ "kind": "org-records", "title": "Acme's portfolio records, exported 2026-10-09" }
```

A source without a `url` must say why: `company-supplied` (the company's own words, sent or
approved by it; who and how in `title`) or `org-records` (your organization's own records, which
you choose to publish).

## A company (`site/data/companies.json`)

| Field | Type | Notes |
|---|---|---|
| `slug` | id | Lowercase letters, digits, hyphens; unique across companies and people. Names the logo file and deep links (`?company=<slug>`). |
| `name` | text | As the company writes it. |
| `district` | district slug | Its one primary district. |
| `secondaryDistricts` | district slugs | Others it also belongs to (drawn faint on the globe). |
| `tags` | text[] | Your directory's tags, verbatim. |
| `website` | URL \| null | |
| `description` | text \| null | One verbatim description (600 characters at most). |
| `descriptionSource` | source \| null | Required with a description. |
| `location` | text \| null | Where the company says it is based. |
| `linkedin` | URL \| null | Its LinkedIn company page. |
| `founders`, `leaders` | `{ name, title, source, linkedin? }[]` | A founder needs a source naming them founder of this company; CEO-only mentions go in `leaders`. |
| `services` | service slugs | What it sells to other companies (the provider finder). Leave empty for consumer-only companies. |
| `servesIndustries` | industry slugs | Who it sells to. `cross-industry` for anyone. |
| `businessModel` | `B2B` \| `B2C` \| `B2B2C` \| `B2G` \| `Nonprofit` \| `Unknown` | |
| `keywords` | text[] | Extra search terms. |
| `providerPitch` | text \| null | One sentence on what it offers other companies, from its own words. |
| `connections` | `{ with, kind, summary, source }[]` | Documented only. `with` is another company's slug; `kind` a connection kind. |
| `sources` | source[] | At least one. |
| `logoPlate` | optional | Overrides the measured logo plate. |

## A person (`site/data/people.json`)

`slug`, `name`, `title`, `summary` (text or null), `bio` (paragraphs), `linkedin` (a
`linkedin.com/in/` URL or null), `focusAreas` (service slugs their own text supports), `sources`.
No company, district or industry fields, by design.

## What the network sees

Your public manifest (`/portfolio-map.json`, [network.md](./network.md)) carries your organization,
districts and, per company, the name, district, website, keywords and (unless
`network.shareDescriptions` is `false`) the description. No sources, founders or people.
