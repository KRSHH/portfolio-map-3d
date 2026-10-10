/* The network as a list: every map in the registry, with what it calls things and how it
   stands. It is also the way to reach every map without 3D. Maps that are not worlds (their
   manifest fails the checks or does not link back) are listed apart, with the reason. A map's
   districts are left to its panel in the world, so a card stays a few lines long. */
import type { CSSProperties } from "react";
import { instanceHref } from "../../../federation/protocol.ts";
import { capitalize, countLine, formatDate, hostOf, peopleLine, proofLine, publisherLine } from "../lib/copy.ts";
import { statusText, type Listed, type NetworkModel, type World } from "../lib/network.ts";
import { ArrowRight, Check, External, Orbit } from "./Icons.tsx";
import { LogoBadge } from "./LogoBadge.tsx";

const sentence = (s: string) => {
  const t = capitalize(s.trim());
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

function WorldCard({ item, world, onSee, headingLevel }: { item: Listed; world: World; onSee?: (id: string) => void; headingLevel: 2 | 3 | 4 }) {
  const m = world.manifest;
  const people = peopleLine(m);
  const publisher = publisherLine(m);
  const proof = world.status === "verified" ? proofLine(world.proof, world.publisher.website) : null;
  const H = `h${headingLevel}` as const;
  return (
    <li className={`net-card${world.status === "unreachable" ? " is-dim" : ""}`} style={{ "--world-accent": world.accent } as CSSProperties}>
      <div className="net-card-head">
        <LogoBadge name={world.name} accent={world.accent} logo={world.logo} size={44} />
        <div className="net-card-title">
          <H>{world.name}</H>
          <p className="net-host">{hostOf(world.url)}</p>
        </div>
      </div>
      {world.status === "unreachable" ? (
        <p className="status status-unreachable">
          Not reachable at last check{item.checked ? `; shown from its manifest of ${formatDate(m.updated)}` : ""}.
        </p>
      ) : null}
      {world.tagline ? <p className="net-tagline">{world.tagline}</p> : null}
      {publisher || proof ? (
        <div className="net-meta">
          {publisher ? <p className="publisher">{publisher}</p> : null}
          {proof ? (
            <p className="proof">
              <Check size={15} />
              {proof}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="net-counts">
        {countLine(m)}
        {people ? ` · ${people}` : ""}
      </p>
      <div className="net-actions">
        <a className="btn btn-outline btn-small" href={instanceHref(world.url)}>
          Visit map<span className="sr-only">: {world.name}</span>
          <External size={16} />
        </a>
        {onSee ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onSee(world.id)}>
            <Orbit size={16} />
            See in the Nexus<span className="sr-only">: {world.name}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function HiddenItem({ item }: { item: Listed }) {
  return (
    <li className="net-hidden-item">
      <p className="net-hidden-name">
        <strong>{item.name}</strong> <span className="net-host">{hostOf(item.url)}</span>
      </p>
      <p className={`status ${item.status === "unreachable" ? "status-unreachable" : "status-problem"}`}>{statusText(item.status)}</p>
      {item.problems.length ? (
        <ul className="problems">
          {item.problems.slice(0, 3).map((p, i) => (
            <li key={i}>{sentence(p)}</li>
          ))}
          {item.problems.length > 3 ? <li>And {item.problems.length - 3} more.</li> : null}
        </ul>
      ) : null}
    </li>
  );
}

export function EmptyNetwork({ joinHref }: { joinHref?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">No maps have joined yet.</p>
      {joinHref ? (
        <a className="text-link" href={joinHref}>
          How to join <ArrowRight size={16} />
        </a>
      ) : null}
    </div>
  );
}

export function NetworkList({ model, onSee, headingLevel = 3, joinHref }: { model: NetworkModel; onSee?: (id: string) => void; headingLevel?: 2 | 3 | 4; joinHref?: string }) {
  const worlds = model.listed.filter((l) => l.world);
  const hidden = model.listed.filter((l) => !l.world);
  const H = `h${headingLevel}` as const;
  return (
    <div className="net">
      {worlds.length ? (
        <ul className="net-grid">
          {worlds.map((l) => (
            <WorldCard key={l.id} item={l} world={l.world!} onSee={onSee} headingLevel={headingLevel} />
          ))}
        </ul>
      ) : (
        <EmptyNetwork joinHref={joinHref} />
      )}
      {hidden.length ? (
        <div className="net-hidden">
          <H className="net-hidden-title">Not shown in the Nexus</H>
          <p className="muted">These maps are registered but did not pass the checks at the last build.</p>
          <ul className="net-hidden-list">
            {hidden.map((l) => (
              <HiddenItem key={l.id} item={l} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
