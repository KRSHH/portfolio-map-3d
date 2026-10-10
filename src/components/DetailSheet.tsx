/* The bottom slider: details for the selected company, or for the selected person.

   Two heights — "peek" (identity, description, the main actions) and
   "expanded" (services and connections; a person's full bio). Drag the handle,
   click it, or use the expand button. Esc closes. The sheet publishes its
   live height as --sheet-h so the 3D views keep their HUD above it.

   A person's sheet describes the person only: no company, industry or potential
   fit appears on it, and no person appears on a company's sheet (CLAUDE.md). */
import { ChevronDown, ChevronUp, Copy, ExternalLink, Footprints, Building2, Link2, MapPin, Network, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COMPANIES, personBySlug, connectionLabel, districtBySlug, hostOf, industryLabel, companyBySlug, companiesByDistrict, serviceLabel } from "../data/catalog";
import { genericTags, potentialClients, potentialProviders, sharedTagPeers, type Fit } from "../data/graph";
import { LABELS } from "../data/labels";
import type { Company, CompanyPerson } from "../data/types";
import { L } from "../site";
import { useStore } from "../state/store";
import { DistrictChip, LogoThumb } from "./bits";
import PersonDetail from "./PersonDetail";

export default function DetailSheet() {
  const selected = useStore((s) => s.selected);
  const personSlug = useStore((s) => s.person);
  const company = selected ? companyBySlug.get(selected) ?? null : null;
  const person = !company && personSlug ? personBySlug.get(personSlug) ?? null : null;
  /** What the sheet shows: one company or one person (the store never selects both). */
  const subject = company ?? person;
  const expanded = useStore((s) => s.sheetExpanded);
  const setExpanded = useStore((s) => s.setSheetExpanded);
  const select = useStore((s) => s.select);
  const selectPerson = useStore((s) => s.selectPerson);
  const close = () => (company ? select(null) : selectPerson(null));
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  /** The person or company the sheet showed last, for a place to put focus when it closes. */
  const shown = useRef<{ kind: "person" | "company"; slug: string } | null>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const [dragDy, setDragDy] = useState(0);

  // Publish height for the views' HUD.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = sheetRef.current;
    if (!subject || !el) {
      root.style.setProperty("--sheet-h", "0px");
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty("--sheet-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--sheet-h", "0px");
    };
  }, [subject]);

  // Focus management: move focus to the title when a company or person opens; restore on close.
  useEffect(() => {
    if (subject) {
      shown.current = company ? { kind: "company", slug: company.slug } : { kind: "person", slug: subject.slug };
      if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null;
      titleRef.current?.focus({ preventScroll: true });
      bodyRef.current?.scrollTo({ top: 0 });
    } else {
      // The sheet may close while it holds focus (Esc, a selection elsewhere): release the
      // walk-controls lock its onFocusCapture set, or the walk view would stay frozen.
      useStore.getState().setInputLocked(false);
    }
    if (!subject && returnFocus.current) {
      const el = returnFocus.current;
      returnFocus.current = null;
      // Only when focus went down with the sheet: an Esc pressed in an open panel leaves focus there.
      const active = document.activeElement;
      if (!active || active === document.body) {
        // Back where it came from; a sheet opened by a link (focus was nowhere) hands it to the
        // record in view instead: the person's name on the globe or their list card, else the walk world.
        const target = el.isConnected && el !== document.body ? el : closedSheetFocus(shown.current);
        target?.focus({ preventScroll: true });
      }
    }
  }, [subject]);

  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        const t = e.target as HTMLElement | null;
        if (t?.closest(".search")) return;
        // Handled: an open panel waits for the next Esc.
        e.preventDefault();
        const st = useStore.getState();
        if (st.selected) st.select(null);
        else st.selectPerson(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject]);

  if (!subject) return null;

  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    setDragDy(dy);
  };
  const onHandleUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragDy(0);
    if (!d) return;
    if (!d.moved) return setExpanded(!expanded);
    if (dragDy < -40) setExpanded(true);
    else if (dragDy > 60) expanded ? setExpanded(false) : close();
  };

  return (
    <aside
      ref={sheetRef}
      className={`sheet ${expanded ? "sheet-expanded" : "sheet-peek"}`}
      aria-labelledby="sheet-title"
      style={dragDy ? { transform: `translate(-50%, ${Math.max(-80, dragDy)}px)`, transition: "none" } : undefined}
      onFocusCapture={() => useStore.getState().setInputLocked(true)}
      onBlurCapture={() => useStore.getState().setInputLocked(false)}
    >
      <div className="sheet-handle-row">
        <button
          type="button"
          className="sheet-handle"
          aria-label={expanded ? "Collapse details" : "Expand details"}
          aria-expanded={expanded}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => { drag.current = null; setDragDy(0); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        >
          <span aria-hidden="true" />
        </button>
        <div className="sheet-top-actions">
          <button type="button" className="icon-btn" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Show less" : "Show more"} title={expanded ? "Show less" : "Show more"}>
            {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close details" title="Close (Esc)">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="sheet-body" ref={bodyRef}>
        {company ? (
          <CompanyDetail company={company} titleRef={titleRef} expanded={expanded} onMore={() => setExpanded(true)} />
        ) : (
          person && <PersonDetail person={person} titleRef={titleRef} expanded={expanded} onMore={() => setExpanded(true)} />
        )}
      </div>
    </aside>
  );
}

/** Where focus goes when a sheet that was opened without a focused control closes. */
function closedSheetFocus(last: { kind: "person" | "company"; slug: string } | null): HTMLElement | null {
  if (last) {
    const attr = last.kind === "person" ? "data-person" : "data-company";
    for (const el of document.querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(last.slug)}"]`)) {
      if (!el.hidden && el.getClientRects().length > 0) return el;
    }
  }
  return document.querySelector<HTMLElement>(".walk-view");
}

function CompanyDetail({ company: m, titleRef, expanded, onMore }: { company: Company; titleRef: React.Ref<HTMLHeadingElement>; expanded: boolean; onMore: () => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);
  const providers = useMemo(() => potentialProviders(m, COMPANIES, LABELS, 6), [m]);
  const clients = useMemo(() => potentialClients(m, COMPANIES, LABELS, 6), [m]);
  const peers = useMemo(() => (companiesByDistrict.get(m.district) ?? []).filter((p) => p.slug !== m.slug), [m]);
  const tagPeers = useMemo(() => sharedTagPeers(m, COMPANIES).filter((p) => p.district !== m.district).slice(0, 12), [m]);
  const generic = useMemo(() => genericTags(COMPANIES), []);
  const [copied, setCopied] = useState(false);
  const district = districtBySlug.get(m.district)!;
  const founders = m.founders.length ? m.founders : [];

  const goTo = (v: "mindmap" | "walk") => {
    setView(v);
    // Ask the newly mounted view to fly once it is listening.
    setTimeout(() => select(m.slug, { fly: true, expand: false }), 60);
  };
  const share = async () => {
    const url = new URL(window.location.href);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url.toString());
    }
  };

  return (
    <article className="company">
      <header className="company-head">
        <LogoThumb company={m} size={56} />
        <div className="company-id">
          <h2 id="sheet-title" ref={titleRef} tabIndex={-1}>{m.name}</h2>
          <div className="company-meta">
            <DistrictChip slug={m.district} onClick={() => focusOn(m.district)} />
            {m.secondaryDistricts.map((d) => <DistrictChip key={d} slug={d} short onClick={() => focusOn(d)} />)}
            {m.location && <span className="chip chip-quiet"><MapPin size={12} aria-hidden="true" />{m.location}</span>}
            {m.businessModel !== "Unknown" && <span className="chip chip-quiet" title="Business model">{m.businessModel}</span>}
          </div>
        </div>
      </header>

      {m.description && <p className="company-desc">{m.description}</p>}

      <div className="company-actions">
        {m.website && (
          <a className="btn btn-primary" href={m.website} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> {hostOf(m.website) ?? "Website"}
          </a>
        )}
        {m.linkedin && (
          <a className="btn btn-quiet" href={m.linkedin} target="_blank" rel="noopener noreferrer">
            <Building2 size={15} aria-hidden="true" /> LinkedIn
          </a>
        )}
        {view !== "walk" && (
          <button type="button" className="btn btn-quiet" onClick={() => goTo("walk")}>
            <Footprints size={15} aria-hidden="true" /> Walk there
          </button>
        )}
        {view !== "mindmap" && (
          <button type="button" className="btn btn-quiet" onClick={() => goTo("mindmap")}>
            <Network size={15} aria-hidden="true" /> Show on the globe
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={share}>
          {copied ? <Copy size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} {copied ? "Link copied" : "Share"}
        </button>
      </div>
      {founders.length > 0 ? (
        <Section title={founders.length > 1 ? "Founders" : "Founder"}>
          <TeamList people={founders} />
        </Section>
      ) : m.leaders.length > 0 ? (
        <Section title="Leadership">
          <TeamList people={m.leaders} />
        </Section>
      ) : null}

      {!expanded && (
        <button type="button" className="sheet-more" onClick={onMore}>
          Services and connections <ChevronUp size={15} aria-hidden="true" />
        </button>
      )}

      {expanded && (
        <>
          <Section title={`What they offer other ${L.companies}`}>
            {m.providerPitch && <p>{m.providerPitch}</p>}
            {m.services.length ? (
              <div className="chips">{m.services.map((s) => <span key={s} className="chip">{serviceLabel.get(s) ?? s}</span>)}</div>
            ) : (
              <p className="muted">{m.businessModel === "B2C" ? "Sells primarily to consumers." : "No business services listed yet."}</p>
            )}
            {m.servesIndustries.length > 0 && (
              <>
                <h4 className="mini-head">Customers</h4>
                <div className="chips">{m.servesIndustries.map((s) => <span key={s} className="chip chip-quiet">{industryLabel.get(s) ?? s}</span>)}</div>
              </>
            )}
            {m.keywords.length > 0 && <p className="keywords">{m.keywords.join(" · ")}</p>}
          </Section>

          <Section title="Connections">
            {m.connections.length > 0 && <h4 className="mini-head">Known connections</h4>}
            {m.connections.length > 0 && (
              <ul className="conn-list">
                {m.connections.map((c) => {
                  const o = companyBySlug.get(c.with);
                  if (!o) return null;
                  return (
                    <li key={`${c.with}-${c.kind}`}>
                      <CompanyButton company={o} onPick={() => select(o.slug, { fly: true })} />
                      <span className="conn-kind">{connectionLabel.get(c.kind) ?? c.kind}</span>
                      <span className="muted">{c.summary}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <FitList title={`${L.Companies} who could serve ${m.name}`} fits={providers} onPick={(s) => select(s, { fly: true })} empty={`No ${L.company}'s listed services line up with this ${L.company}'s industry.`} />
            <FitList title={`${L.Companies} ${m.name} could serve`} fits={clients} onPick={(s) => select(s, { fly: true })} empty={m.services.length ? `No strong matches among the ${L.companies}.` : "No business services listed yet."} />
            <p className="note">Potential fits are suggested introductions, based on what each {L.company} offers and who it serves. They are not existing relationships.</p>

            <h4 className="mini-head">Also in {district.label} ({peers.length})</h4>
            <div className="peer-grid">
              {peers.map((p) => <CompanyButton key={p.slug} company={p} compact onPick={() => select(p.slug, { fly: true })} />)}
            </div>
            {tagPeers.length > 0 && (
              <>
                <h4 className="mini-head">Also tagged {m.tags.filter((t) => !generic.has(t)).join(", ")}</h4>
                <div className="peer-grid">
                  {tagPeers.map((p) => <CompanyButton key={p.slug} company={p} compact onPick={() => select(p.slug, { fly: true })} />)}
                </div>
              </>
            )}
          </Section>
        </>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sheet-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function FitList({ title, fits, onPick, empty }: { title: string; fits: Fit[]; onPick: (slug: string) => void; empty: string }) {
  return (
    <>
      <h4 className="mini-head">{title} <span className="badge-derived">Potential fit</span></h4>
      {fits.length ? (
        <ul className="fit-list">
          {fits.map((f) => (
            <li key={f.company.slug}>
              <CompanyButton company={f.company} onPick={() => onPick(f.company.slug)} />
              <span className="muted small">{f.reasons.join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </>
  );
}

export function CompanyButton({ company, onPick, compact = false }: { company: Company; onPick: () => void; compact?: boolean }) {
  return (
    <button type="button" className={`company-btn ${compact ? "company-btn-compact" : ""}`} onClick={onPick}>
      <LogoThumb company={company} size={compact ? 22 : 26} />
      <span>{company.name}</span>
    </button>
  );
}

function TeamList({ people }: { people: CompanyPerson[] }) {
  return (
    <ul className="team">
      {people.map((p) => (
        <li key={p.name}>
          <strong>{p.name}</strong> <span className="muted">{p.title}</span>
          {p.linkedin && (
            <a className="person-link" href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on LinkedIn`} title="LinkedIn">
              in
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
