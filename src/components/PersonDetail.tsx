/* The detail sheet's person variant.

   Everything shown is the organization's own text about the person, verbatim (site/data/people.json):
   the headshot, name and title, the LinkedIn profile only when a source gives one, the summary at
   the peek height, and the whole bio, on its own, behind "Read full bio" (the expanded height); and
   focus areas, which are services-vocabulary labels. Nothing here names, links or suggests a
   company, district or industry: the map shows no connection between the people roster and the
   companies (docs/data-contract.md). Bios that mention a company keep it as plain text.

   The main action takes the visitor to the person's place in the walk world. */
import { ChevronUp, Copy, Footprints, Link2, Network, UserRound } from "lucide-react";
import { useState } from "react";
import { SITE, serviceLabel } from "../data/catalog";
import { L } from "../site";
import type { Person } from "../data/types";
import { useStore } from "../state/store";
import { PersonThumb } from "./bits";

export default function PersonDetail({ person: c, titleRef, expanded, onMore }: { person: Person; titleRef: React.Ref<HTMLHeadingElement>; expanded: boolean; onMore: () => void }) {
  const view = useStore((s) => s.view);
  const seeOnMap = useStore((s) => s.seePersonOnMap);
  const setView = useStore((s) => s.setView);
  const [copied, setCopied] = useState(false);
  // The card's text at peek height (the bio's opening). Expanded, the full bio stands alone.
  const lead = expanded ? null : c.summary ?? c.bio[0] ?? null;
  const hasMore = c.bio.length > 1 || (c.bio.length === 1 && lead !== c.bio[0]);

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <article className="company person">
      <header className="company-head">
        <PersonThumb person={c} size={64} />
        <div className="company-id">
          <h2 id="sheet-title" ref={titleRef} tabIndex={-1}>
            {c.name}
          </h2>
          <p className="person-specialty">{c.title}</p>
          <div className="company-meta">
            <span className="chip chip-quiet">
              <UserRound size={12} aria-hidden="true" />
              {SITE.org.name} {L.person}
            </span>
          </div>
        </div>
      </header>

      {lead && <p className="company-desc">{lead}</p>}

      <div className="company-actions">
        {/* In the walk world the same request walks the visitor over from wherever they are. */}
        <button type="button" className="btn btn-primary" onClick={() => seeOnMap(c.slug)}>
          <Footprints size={15} aria-hidden="true" /> {view === "walk" ? "Walk there" : "See on the map"}
        </button>
        {c.linkedin && (
          <a className="btn btn-quiet" href={c.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn: ${c.name}`}>
            <span className="person-link person-link-inline" aria-hidden="true">
              in
            </span>
            LinkedIn
          </a>
        )}
        {view !== "mindmap" && (
          <button type="button" className="btn btn-quiet" onClick={() => setView("mindmap")}>
            <Network size={15} aria-hidden="true" /> Show on the {L.people} globe
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={share}>
          {copied ? <Copy size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} {copied ? "Link copied" : "Share"}
        </button>
      </div>

      {c.focusAreas.length > 0 && (
        <section className="sheet-section">
          <h3>Focus areas</h3>
          <div className="chips">
            {c.focusAreas.map((s) => (
              <span key={s} className="chip">
                {serviceLabel.get(s) ?? s}
              </span>
            ))}
          </div>
        </section>
      )}

      {!expanded && hasMore && (
        <button type="button" className="sheet-more" onClick={onMore}>
          Read full bio <ChevronUp size={15} aria-hidden="true" />
        </button>
      )}

      {expanded && c.bio.length > 0 && (
        <section className="sheet-section person-bio">
          <h3>Bio</h3>
          {c.bio.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}
    </article>
  );
}
