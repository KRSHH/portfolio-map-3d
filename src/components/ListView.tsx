/* The list view: every company, or every person, as a card, filterable. This is the
   no-3D, fully keyboard- and screen-reader-friendly route to every record.
   Companies | People switches between the two rosters (the same switch as the globe's). */
import { useMemo } from "react";
import { COMPANIES, DISTRICTS, HAS_FINDER, HAS_PEOPLE, PEOPLE, SERVICES, SITE, districtBySlug } from "../data/catalog";
import { matchesText } from "../data/graph";
import { LABELS } from "../data/labels";
import { personMatches } from "../data/search";
import type { DistrictSlug } from "../data/types";
import { L } from "../site";
import { useStore } from "../state/store";
import { PersonThumb, DistrictChip, LogoThumb } from "./bits";

export default function ListView() {
  const roster = useStore((s) => s.roster);
  const setRoster = useStore((s) => s.setRoster);
  return (
    <div className="view list-view">
      <div className="list-inner">
        {SITE.map.notice && <p className="notice">{SITE.map.notice}</p>}
        {HAS_PEOPLE && (
          <div className="list-switch" role="group" aria-label="Show">
            <button type="button" className="list-switch-btn" aria-pressed={roster === "companies"} onClick={() => setRoster("companies")}>
              {L.Companies} <span className="list-switch-count">{COMPANIES.length}</span>
            </button>
            <button type="button" className="list-switch-btn" aria-pressed={roster === "people"} onClick={() => setRoster("people")}>
              {L.People} <span className="list-switch-count">{PEOPLE.length}</span>
            </button>
          </div>
        )}
        {roster === "people" && HAS_PEOPLE ? <PersonList /> : <CompanyList />}
      </div>
    </div>
  );
}

function CompanyList() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const focus = useStore((s) => s.focusDistrict);
  const focusOn = useStore((s) => s.focusOn);
  const finder = useStore((s) => s.finder);
  const setFinder = useStore((s) => s.setFinder);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);

  const list = useMemo(
    () =>
      COMPANIES.filter((m) => (!focus || m.district === focus || m.secondaryDistricts.includes(focus)))
        .filter((m) => !finder.service || m.services.includes(finder.service))
        .filter((m) => matchesText(m, query, LABELS)),
    [focus, finder.service, query],
  );

  return (
    <>
      <div className="list-filters" role="group" aria-label={`Filter ${L.companies}`}>
        <label className="field field-inline">
          <span>{L.District}</span>
          <select value={focus ?? ""} onChange={(e) => focusOn((e.target.value || null) as DistrictSlug | null, { fly: false })}>
            <option value="">All {L.districts}</option>
            {DISTRICTS.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
          </select>
        </label>
        {HAS_FINDER && (
          <label className="field field-inline">
            <span>Offers</span>
            <select value={finder.service ?? ""} onChange={(e) => setFinder({ service: e.target.value || null })}>
              <option value="">Any service</option>
              {SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label className="field field-inline field-grow">
          <span>Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, founder, keyword…" />
        </label>
        <p className="list-count" aria-live="polite">
          Showing <strong>{list.length}</strong> of {COMPANIES.length}
        </p>
      </div>

      <ul className="card-grid">
        {list.map((m) => {
          const d = districtBySlug.get(m.district)!;
          return (
            <li key={m.slug}>
              <button type="button" className={`card ${selected === m.slug ? "is-selected" : ""}`} data-company={m.slug} style={{ ["--d" as string]: d.color }} onClick={() => select(m.slug, { fly: false })}>
                <span className="card-logo"><LogoThumb company={m} size={40} /></span>
                <span className="card-name">{m.name}</span>
                <span className="card-desc">{m.description ?? (m.tags.length ? m.tags.join(" · ") : districtBySlug.get(m.district)!.label)}</span>
                {m.founders.length > 0 && <span className="card-founders">Founded by {m.founders.map((p) => p.name).join(", ")}</span>}
                <span className="card-foot"><DistrictChip slug={m.district} short /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="muted list-empty">No {L.companies} match these filters.</p>}
    </>
  );
}

/** The people roster, found by name and title (never by the companies their bios mention). */
function PersonList() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const selectPerson = useStore((s) => s.selectPerson);
  const person = useStore((s) => s.person);
  const list = useMemo(() => PEOPLE.filter((c) => personMatches(c, query)), [query]);

  return (
    <>
      <div className="list-filters" role="group" aria-label={`Filter ${L.people}`}>
        <label className="field field-inline field-grow">
          <span>Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or title…" />
        </label>
        <p className="list-count" aria-live="polite">
          Showing <strong>{list.length}</strong> of {PEOPLE.length}
        </p>
      </div>

      <ul className="card-grid">
        {list.map((c) => (
          <li key={c.slug}>
            <button type="button" className={`card card-person ${person === c.slug ? "is-selected" : ""}`} data-person={c.slug} onClick={() => selectPerson(c.slug, { fly: false })}>
              <span className="card-person-head">
                <PersonThumb person={c} size={52} />
                <span className="card-person-id">
                  <span className="card-name">{c.name}</span>
                  <span className="card-specialty">{c.title}</span>
                </span>
              </span>
              {(c.summary ?? c.bio[0]) && <span className="card-desc">{c.summary ?? c.bio[0]}</span>}
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <p className="muted list-empty">
          No {L.people} match “{query.trim()}”. {L.People} are found by name and title.
        </p>
      )}
    </>
  );
}
