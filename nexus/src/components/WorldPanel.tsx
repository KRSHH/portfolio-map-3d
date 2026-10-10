/* One world, in words: its name, counts in its own labels, districts, and a filterable list
   of its companies, each linking into the map. A side panel on wide screens, a bottom sheet on
   phones. The parent gives it key={world id}, so its filters start fresh for each world. */
import { useEffect, useMemo, useRef, useState } from "react";
import { instanceHref } from "../../../federation/protocol.ts";
import { capitalize, countLine, formatDate, hostOf, peopleLine, proofLine, publisherLine } from "../lib/copy.ts";
import { filterCompanies, type IndexedWorld } from "../lib/search.ts";
import { ArrowRight, Check, Close, External } from "./Icons.tsx";
import { LogoBadge } from "./LogoBadge.tsx";

const PAGE = 60;

interface Props {
  iw: IndexedWorld;
  highlight: string | null;
  initialFilter: string;
  onClose: () => void;
}

export function WorldPanel({ iw, highlight, initialFilter, onClose }: Props) {
  const w = iw.world;
  const m = w.manifest;
  const [filter, setFilter] = useState(initialFilter);
  const [district, setDistrict] = useState<string | null>(null);
  const list = useMemo(() => filterCompanies(iw, filter, district), [iw, filter, district]);
  const hlIndex = highlight ? list.findIndex((c) => c.company.slug === highlight) : -1;
  const [limit, setLimit] = useState(() => Math.max(PAGE, hlIndex + 20));
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const people = peopleLine(m);
  const publisher = publisherLine(m);
  const proof = w.status === "verified" ? proofLine(w.proof, w.publisher.website) : null;
  const districts = useMemo(() => new Map(m.districts.map((d) => [d.slug, d])), [m]);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  // Bring the company chosen in search into view, once.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight || scrolled.current === highlight) return;
    scrolled.current = highlight;
    body.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: "center" });
  }, [highlight]);

  return (
    <aside className={`panel${w.status === "unreachable" ? " is-dim" : ""}`} aria-labelledby="panel-title">
      <div className="panel-head">
        <LogoBadge name={w.name} accent={w.accent} logo={w.logo} size={48} />
        <div className="panel-title">
          <h2 id="panel-title" ref={title} tabIndex={-1}>
            {w.name}
          </h2>
          <p className="panel-host">{hostOf(w.url)}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={`Close ${w.name}`}>
          <Close />
        </button>
      </div>
      <div className="panel-body" ref={body}>
        {w.status === "unreachable" ? (
          <p className="status status-unreachable">Not reachable at last check. Shown from its manifest of {formatDate(m.updated)}.</p>
        ) : null}
        {w.tagline ? <p className="panel-tagline">{w.tagline}</p> : null}
        {publisher || proof ? (
          <div className="panel-meta">
            {publisher ? <p className="publisher">{publisher}</p> : null}
            {proof ? (
              <p className="proof">
                <Check size={15} />
                {proof}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="panel-counts">
          {countLine(m)}
          {people ? ` · ${people}` : ""}
        </p>
        <a className="btn btn-primary btn-block" href={instanceHref(w.url)}>
          Enter {w.name} <ArrowRight size={18} />
        </a>

        <h3 className="panel-h">{capitalize(m.labels.districts)}</h3>
        <div className="chips" role="group" aria-label={`Show one ${m.labels.district}'s ${m.labels.companies}`}>
          {m.districts.map((d) => (
            <button key={d.slug} type="button" className="chip chip-btn" aria-pressed={district === d.slug} onClick={() => setDistrict(district === d.slug ? null : d.slug)}>
              <span className="dot" style={{ background: d.color }} aria-hidden="true" />
              {d.label}
              <span className="chip-n">{d.count}</span>
            </button>
          ))}
        </div>

        <div className="panel-list-head">
          <h3 className="panel-h">{capitalize(m.labels.companies)}</h3>
          <span className="panel-list-count" role="status">
            {list.length === iw.companies.length ? iw.companies.length : `${list.length} of ${iw.companies.length}`}
          </span>
        </div>
        <label className="sr-only" htmlFor="panel-filter">
          Filter {m.labels.companies}
        </label>
        <input
          id="panel-filter"
          className="field"
          type="search"
          placeholder={`Filter ${m.labels.companies}`}
          value={filter}
          autoComplete="off"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filter) {
              e.stopPropagation();
              setFilter("");
            }
          }}
        />
        {list.length ? (
          <ul className="co-list">
            {list.slice(0, limit).map(({ company: c }) => {
              const d = districts.get(c.district);
              return (
                <li key={c.slug} data-slug={c.slug} className={`co${c.slug === highlight ? " is-hl" : ""}`}>
                  <a className="co-link" href={instanceHref(w.url, c.slug)}>
                    <span className="co-name">{c.name}</span>
                    <span className="sr-only">, in {w.name}</span>
                    <External size={15} className="co-ext" />
                  </a>
                  {d ? (
                    <span className="chip-mini">
                      <span className="dot" style={{ background: d.color }} aria-hidden="true" />
                      {d.label}
                    </span>
                  ) : null}
                  {c.description ? <p className="co-desc">{c.description}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No {m.labels.companies} match.</p>
        )}
        {list.length > limit ? (
          <button type="button" className="btn btn-outline btn-block" onClick={() => setLimit(Infinity)}>
            Show all {list.length}
          </button>
        ) : null}
        <p className="panel-foot">
          Manifest updated {formatDate(m.updated)}
          {w.checked ? ` · checked ${formatDate(w.checked)}` : ""}
        </p>
      </div>
    </aside>
  );
}
