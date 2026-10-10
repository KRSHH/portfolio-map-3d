/* Side panels: the provider finder, the industries (district) index and
   the about/method panel. Desktop: a drawer on the left. Mobile: a sheet
   from the bottom. Only one is open at a time (store.panel). */
import { ArrowRight, Moon, Orbit, Sun, Waypoints, X } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { COMPANIES, DISTRICTS, HAS_PEOPLE, hostOf, INDUSTRIES, PEOPLE, SERVICES, SITE, companiesByDistrict, companiesTouching, districtBySlug } from "../data/catalog";
import { NETWORK_NAME, NEXUS_HREF } from "../network";
import { L, article, count } from "../site";
import { finderActive, useFinderResults, useStore, type FinderState } from "../state/store";
import { DistrictIcon, LogoThumb } from "./bits";
import { useTheme } from "./TopBar";
import { isNarrow } from "./viewport";

export default function Panels() {
  const panel = useStore((s) => s.panel);
  const openPanel = useStore((s) => s.openPanel);
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!panel) {
      // A panel closed while holding focus must not leave walk controls locked.
      useStore.getState().setInputLocked(false);
      // Focus went down with the panel (Esc, the close button, a pick on a phone): return it to the opener.
      const back = opener.current;
      opener.current = null;
      const active = document.activeElement;
      if (back?.isConnected && (!active || active === document.body)) back.focus({ preventScroll: true });
      return;
    }
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    if (prev && prev !== document.body && !el?.contains(prev)) opener.current = prev;
    el?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // The search, the walk popover and the detail sheet take Esc first and mark it handled.
      const st = useStore.getState();
      if (e.key !== "Escape" || e.defaultPrevented || st.selected || st.person) return;
      e.preventDefault();
      openPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, openPanel]);

  if (!panel) return null;
  const title = panel === "finder" ? `Find a provider among the ${L.companies}` : panel === "districts" ? L.Districts : "About this map";
  return (
    <aside
      ref={ref}
      className={`panel panel-${panel}`}
      aria-labelledby="panel-title"
      onFocusCapture={() => useStore.getState().setInputLocked(true)}
      onBlurCapture={() => useStore.getState().setInputLocked(false)}
    >
      <header className="panel-head">
        <h2 id="panel-title">{title}</h2>
        <button type="button" className="icon-btn" onClick={() => openPanel(null)} aria-label="Close panel">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="panel-body">
        {panel === "finder" && <Finder />}
        {panel === "districts" && <Districts />}
        {panel === "help" && <About />}
      </div>
    </aside>
  );
}

function Finder() {
  const finder = useStore((s) => s.finder);
  const setFinder = useStore((s) => s.setFinder);
  const select = useStore((s) => s.select);
  const openPanel = useStore((s) => s.openPanel);
  const results = useFinderResults();
  const servicesWithCounts = useMemo(
    () => SERVICES.map((s) => ({ ...s, count: COMPANIES.filter((m) => m.services.includes(s.slug)).length })),
    [],
  );
  const active = finderActive(finder);

  return (
    <div className="finder">
      <p className="lede">Looking for a vendor or partner? Start with the {L.companies} on this map. Pick what you need and, optionally, your industry.</p>
      <label className="field">
        <span>What do you need?</span>
        <select data-autofocus value={finder.service ?? ""} onChange={(e) => setFinder({ service: e.target.value || null })}>
          <option value="">Any service</option>
          {servicesWithCounts.map((s) => (
            <option key={s.slug} value={s.slug} disabled={s.count === 0}>
              {s.label} ({s.count})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Your industry <em>(optional)</em></span>
        <select value={finder.industry ?? ""} onChange={(e) => setFinder({ industry: e.target.value || null })}>
          <option value="">Not specified</option>
          {INDUSTRIES.filter((i) => i.slug !== "cross-industry").map((i) => (
            <option key={i.slug} value={i.slug}>{i.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Keywords <em>(optional)</em></span>
        <input type="search" placeholder="e.g. HIPAA, video, payroll, chatbot" value={finder.text} onChange={(e) => setFinder({ text: e.target.value })} />
      </label>
      {active && (
        <button type="button" className="link-btn" onClick={() => setFinder({ service: null, industry: null, text: "" })}>
          Clear
        </button>
      )}

      <div className="finder-results" aria-live="polite">
        {!active ? (
          <p className="muted">Choose a service or an industry to see matching {L.companies}. Matches light up in the 3D views.</p>
        ) : results.length === 0 ? (
          <p className="muted">{emptyHint(finder)}</p>
        ) : (
          <>
            <p className="finder-count"><strong>{results.length}</strong> {results.length === 1 ? L.company : L.companies} could help</p>
            <ul className="finder-list">
              {results.map((f) => (
                <li key={f.company.slug}>
                  <button type="button" className="finder-item" onClick={() => { select(f.company.slug, { fly: true }); if (isNarrow()) openPanel(null); }}>
                    <LogoThumb company={f.company} size={30} />
                    <span className="finder-item-text">
                      <strong>{f.company.name}</strong>
                      <span className="muted small">{f.reasons.slice(0, 3).join(" · ") || districtBySlug.get(f.company.district)!.label}</span>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="note">
        Matches are based on what each {L.company} offers and who it serves. They are starting points for an introduction, not endorsements.
      </p>
    </div>
  );
}

/** What to loosen when the finder finds nobody: only the filters that are actually set. */
function emptyHint(f: FinderState): string {
  const tips = [f.service && "choose another service", f.industry && "clear the industry", f.text.trim() && "use fewer keywords"].filter(Boolean) as string[];
  const list = tips.length > 1 ? `${tips.slice(0, -1).join(", ")} or ${tips[tips.length - 1]}` : tips[0] ?? "";
  return `No ${L.company} matches all of these. ${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
}

function Districts() {
  const focus = useStore((s) => s.focusDistrict);
  const focusOn = useStore((s) => s.focusOn);
  const select = useStore((s) => s.select);
  const openPanel = useStore((s) => s.openPanel);
  return (
    <div className="districts">
      <p className="lede">
        {L.Companies} are grouped into {count(DISTRICTS.length, L.district, L.districts)}. {article(L.Company)} sits in one {L.district} and may touch others.
      </p>
      <ul className="district-list">
        {DISTRICTS.map((d) => {
          const own = companiesByDistrict.get(d.slug) ?? [];
          const touching = companiesTouching(d.slug).length;
          const isOpen = focus === d.slug;
          return (
            <li key={d.slug} className={isOpen ? "is-open" : ""}>
              <button type="button" className="district-row" aria-expanded={isOpen} onClick={() => focusOn(isOpen ? null : d.slug)}>
                <span className="district-swatch" style={{ background: d.color }}><DistrictIcon slug={d.slug} size={14} /></span>
                <span className="district-name">{d.label}</span>
                <span className="district-count" title={`${own.length} in this ${L.district}, ${touching} including secondary`}>{own.length}</span>
              </button>
              {isOpen && (
                <ul className="district-companies">
                  {own.map((m) => (
                    <li key={m.slug}>
                      <button type="button" onClick={() => { select(m.slug, { fly: true }); if (isNarrow()) openPanel(null); }}>
                        <LogoThumb company={m} size={20} /> {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {focus && (
        <button type="button" className="link-btn" onClick={() => focusOn(null)}>
          Show all {L.districts}
        </button>
      )}
    </div>
  );
}

function About() {
  return (
    <div className="about">
      {SITE.map.notice && <p className="notice">{SITE.map.notice}</p>}
      <p className="lede">
        A 3D map of {SITE.org.name}'s {count(COMPANIES.length, L.company, L.companies)}: who they are, what they do, who founded them, and who among
        them could work with whom.
      </p>
      <Block title="Three ways to explore">
        <ul>
          <li>
            <strong>Globe</strong> — every {L.company} in its {L.district}'s region of a turning globe. Select a logo to see its connections.
            {HAS_PEOPLE && (
              <>
                {" "}Switch to <strong>{L.People}</strong> for a globe of {SITE.org.name}'s {count(PEOPLE.length, L.person, L.people)}.
              </>
            )}
          </li>
          <li>
            <strong>Walk</strong> — a small explorer on an island of {L.districts}, with a drop pin and logo for every {L.company}
            {HAS_PEOPLE && `, and an area with a pin for every one of the ${L.people}`}. WASD or arrows to walk, Shift to run, Enter to open the
            nearest pin. The portal on the plaza leads to the Nexus.
          </li>
          <li>
            <strong>List</strong> — the same records as a searchable directory, no 3D required.
          </li>
        </ul>
      </Block>
      <Block title="How to read it">
        <ul>
          <li>
            <strong>{L.Districts}</strong> group {L.companies}. They are not locations.
          </li>
          <li>
            <strong>Known connections</strong> are relationships between two {L.companies} that a source records, such as a shared founder or a
            customer.
          </li>
          <li>
            <strong>Potential fits</strong> are suggested introductions: one {L.company} offers a service that matches another's industry. They are
            not existing relationships.
          </li>
          {HAS_PEOPLE && (
            <li>
              <strong>{L.People}</strong> are {SITE.org.name}'s own roster. The map does not link them to any {L.company}.
            </li>
          )}
        </ul>
      </Block>
      <Block title={`Part of the ${NETWORK_NAME}`}>
        <p>
          This map is built on portfolio-map-3d, an open source framework. Every map built on it links to the Nexus, a shared world where each
          map in the network is a world of its own, so visitors can see them all and travel between them.
        </p>
        <p>
          <a className="btn btn-quiet" href={NEXUS_HREF}>
            <Orbit size={16} aria-hidden="true" /> Open the Nexus
          </a>
        </p>
      </Block>
      <ThemeBlock />
      <Block title="Shortcuts">
        <ul className="shortcuts">
          <li><kbd>/</kbd> search</li>
          <li><kbd>Esc</kbd> close</li>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</li>
          <li><kbd>Q</kbd>/<kbd>E</kbd> turn camera</li>
          <li><kbd>Enter</kbd> open the nearest pin</li>
        </ul>
      </Block>
      <p className="note">
        <Waypoints size={13} aria-hidden="true" /> Spot something out of date? Let {SITE.org.name} know{SITE.org.website ? <> at <a href={SITE.org.website}>{hostOf(SITE.org.website)}</a></> : null}.
      </p>
    </div>
  );
}

/** The theme toggle, for screens too narrow to show it in the top bar. */
function ThemeBlock() {
  const [theme, toggle] = useTheme();
  return (
    <section className="about-block about-theme">
      <h3>Theme</h3>
      <button type="button" className="btn btn-quiet" onClick={toggle}>
        {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />} {theme === "dark" ? "Switch to light" : "Switch to dark"}
      </button>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="about-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
