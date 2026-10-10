/* What to draw from the selected company: documented connections (facts,
   always sourced) and potential fits (derived suggestions). Kept apart so
   the scene and the legend can never blur the two. */
import { COMPANIES, companyBySlug } from "../../data/catalog";
import { documentedLinks, potentialClients, potentialProviders, type Fit, type Link } from "../../data/graph";
import { LABELS } from "../../data/labels";
import type { Company } from "../../data/types";

export interface SelectionLinks {
  company: Company;
  documented: { other: Company; link: Link }[];
  /** Companies who could serve the selected company. */
  providers: Fit[];
  /** Companies the selected company could serve. */
  clients: Fit[];
  /** Every company drawn with a line to the selected one. */
  related: Set<string>;
}

let allLinks: Link[] | null = null;
export function allDocumentedLinks(): Link[] {
  if (!allLinks) allLinks = documentedLinks(COMPANIES);
  return allLinks;
}

const cache = new Map<string, SelectionLinks>();

export function selectionLinks(slug: string | null): SelectionLinks | null {
  if (!slug) return null;
  const hit = cache.get(slug);
  if (hit) return hit;
  const company = companyBySlug.get(slug);
  if (!company) return null;
  const documented: SelectionLinks["documented"] = [];
  for (const link of allDocumentedLinks()) {
    if (link.a !== slug && link.b !== slug) continue;
    const other = companyBySlug.get(link.a === slug ? link.b : link.a);
    if (other) documented.push({ other, link });
  }
  const providers = potentialProviders(company, COMPANIES, LABELS);
  const clients = potentialClients(company, COMPANIES, LABELS);
  const related = new Set<string>([...documented.map((d) => d.other.slug), ...providers.map((f) => f.company.slug), ...clients.map((f) => f.company.slug)]);
  const out: SelectionLinks = { company, documented, providers, clients, related };
  cache.set(slug, out);
  return out;
}
