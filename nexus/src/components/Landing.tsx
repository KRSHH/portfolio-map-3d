/* The landing page: the framework, and the network it joins. Its hero is the live Nexus,
   drifting behind the headline; everything below is short, factual and in the third person. */
import { useEffect, useRef } from "react";
import { FRAMEWORK, FRAMEWORK_REPO, MANIFEST_FILE } from "../../../federation/protocol.ts";
import { PROMO_VIDEO, WHITE_GLOVE, intakeHref, isPublicGitHubForm } from "../config.ts";
import { formatDate, plural } from "../lib/copy.ts";
import { LANDING, type Route } from "../lib/route.ts";
import { routeHref } from "../hooks/useRoute.ts";
import type { NetworkState } from "../hooks/useNetwork.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import type { NexusEngine } from "../three/engine.ts";
import { CodeBlock } from "./CodeBlock.tsx";
import { ArrowRight, Check, Directory, External, GitHubMark, Globe, Mark, Walk } from "./Icons.tsx";
import { MusicButton } from "./MusicButton.tsx";
import { NetworkList } from "./NetworkList.tsx";
import { SceneHost } from "./SceneHost.tsx";

/** "fritzhand/portfolio-map-3d", from the repository's address. */
const REPO_PATH = new URL(FRAMEWORK_REPO).pathname.replace(/^\/|\/$/g, "");

/** The framework's example map, deployed next to the Nexus (a separate app). */
const EXAMPLE_MAP = `${import.meta.env.BASE_URL}example/`;

/** The guides and the network's terms, in the repository. */
const DOCS = `${FRAMEWORK_REPO}/tree/main/docs`;
const JOINING = `${FRAMEWORK_REPO}/blob/main/docs/network.md#joining`;
const TERMS = `${FRAMEWORK_REPO}/blob/main/NETWORK.md`;

const START = `npx degit ${REPO_PATH} my-map
cd my-map && npm install
npm run dev`;

interface Props {
  route: Route;
  net: NetworkState;
  engine: NexusEngine | null;
  gl: EngineStatus;
  onEnter: (worldId?: string) => void;
}

export function Landing({ route, net, engine, gl, onEnter }: Props) {
  const hero = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const model = net.status === "ready" ? net.model : null;

  useEffect(() => {
    document.title = "The Nexus · portfolio-map-3d";
  }, []);

  // The hero shows the Nexus in the space the headline leaves: to its right, or above it on phones.
  useEffect(() => {
    if (!engine) return;
    engine.showHero();
    const h = hero.current;
    const t = text.current;
    if (!h || !t) return;
    const measure = () => {
      const hr = h.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const wide = hr.width >= 900;
      engine.setInsets(wide ? { top: 64, right: 0, bottom: 0, left: Math.max(0, tr.right - hr.left - 40) } : { top: 56, right: 0, bottom: Math.max(0, hr.bottom - tr.top - 24), left: 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    ro.observe(t);
    return () => ro.disconnect();
  }, [engine]);

  const stat = !model
    ? ""
    : model.worlds.length
      ? `${model.worlds.length} ${plural(model.worlds.length, "map", "maps")} and ${model.companies.toLocaleString("en-US")} ${plural(model.companies, "company", "companies")} in the network.`
      : "No maps have joined yet.";

  // A price of null reads "Quoted per organization": said once when it holds for every package.
  const quoted = WHITE_GLOVE.packages.every((p) => p.price === null);
  const intake = WHITE_GLOVE.intake;

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href={routeHref({ ...LANDING, sample: route.sample })} aria-label="The Nexus, home">
            <Mark size={28} className="brand-mark" />
            <span className="brand-name">The Nexus</span>
          </a>
          <nav className="site-nav" aria-label="Sections">
            {route.sample ? <span className="sample-badge">Sample data</span> : null}
            <a className="nav-link nav-optional" href="#network">
              Network
            </a>
            <a className="nav-link nav-optional" href="#how">
              How it works
            </a>
            <a className="nav-link nav-optional" href="#built-for-you">
              Services
            </a>
            <a className="nav-link" href="#get-started">
              Get started
            </a>
            <a className="nav-link nav-github" href={FRAMEWORK_REPO}>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="hero" ref={hero} aria-labelledby="hero-title">
          {gl === "unavailable" ? (
            <div className="hero-scene hero-fallback" aria-hidden="true" />
          ) : (
            <SceneHost engine={engine} className="hero-scene" interactive={false} label="The Nexus: every map in the network as a world around a glowing core, drifting slowly." />
          )}
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-inner">
            <div className="hero-text" ref={text}>
              <h1 id="hero-title">
                <span>Every portfolio,</span> <span>one shared universe.</span>
              </h1>
              <p className="lede">
                {FRAMEWORK} is an open source framework for publishing an organization's companies as a 3D globe, a walkable world and a directory. Every map built with it links
                to the Nexus.
              </p>
              <div className="cta-row">
                <button type="button" className="btn btn-orb btn-large" onClick={() => onEnter()}>
                  Enter the Nexus <ArrowRight size={18} />
                </button>
                <a className="btn btn-outline btn-large" href="#get-started">
                  Get started
                </a>
                <a className="btn btn-outline btn-large btn-square" href={FRAMEWORK_REPO} aria-label={`${FRAMEWORK} on GitHub`} title={`${FRAMEWORK} on GitHub`}>
                  <GitHubMark size={20} />
                </a>
              </div>
              <p className="hero-meta">
                <span className="hero-stat" aria-live="polite">
                  {stat}
                </span>
                <a className="text-link" href={EXAMPLE_MAP}>
                  See the example map <ArrowRight size={16} />
                </a>
              </p>
            </div>
          </div>
        </section>

        {PROMO_VIDEO ? (
          <section className="section" id="video" aria-labelledby="video-title">
            <div className="container">
              <h2 id="video-title">The network in {PROMO_VIDEO.seconds} seconds</h2>
              {/* preload="none": nothing is fetched until the visitor presses play. */}
              <video className="promo-video" controls playsInline preload="none" poster={PROMO_VIDEO.poster} aria-labelledby="video-title" aria-describedby="video-caption">
                <source src={PROMO_VIDEO.src} type="video/mp4" />
              </video>
              <p className="video-meta">
                <span id="video-caption">{PROMO_VIDEO.caption}</span>
                {PROMO_VIDEO.portrait ? (
                  <a className="text-link" href={PROMO_VIDEO.portrait}>
                    The vertical cut, for phones <ArrowRight size={16} />
                  </a>
                ) : null}
              </p>
            </div>
          </section>
        ) : null}

        <section className="section" id="ways" aria-labelledby="ways-title">
          <div className="container">
            <h2 id="ways-title">Three ways in, one data set</h2>
            <ul className="panel-grid panel-grid-3">
              <li>
                <Globe size={20} className="item-icon" />
                <h3>Globe</h3>
                <p>A rotating globe of logos, with a region for each sector, track or program.</p>
              </li>
              <li>
                <Walk size={20} className="item-icon" />
                <h3>Walk</h3>
                <p>A walkable world with a pin for every company and a portal to the Nexus.</p>
              </li>
              <li>
                <Directory size={20} className="item-icon" />
                <h3>Directory</h3>
                <p>The same records as a searchable list, with no 3D required.</p>
              </li>
            </ul>
          </div>
        </section>

        <section className="section" id="network" aria-labelledby="network-title">
          <div className="container">
            <div className="section-head">
              <h2 id="network-title">The network</h2>
              {model?.generated ? <p className="section-note">Last checked {formatDate(model.generated)}</p> : null}
            </div>
            {net.status === "loading" ? <p className="muted section-body">Loading the network…</p> : null}
            {net.status === "error" ? <p className="status status-problem section-body">{net.message}</p> : null}
            {model ? <NetworkList model={model} onSee={gl === "unavailable" ? undefined : (id) => onEnter(id)} joinHref="#how" /> : null}
          </div>
        </section>

        <section className="section" id="how" aria-labelledby="how-title">
          <div className="container">
            <h2 id="how-title">How a map joins</h2>
            <ol className="panel-grid panel-grid-4">
              <li>
                <span className="step-n" aria-hidden="true">
                  01
                </span>
                <h3>Publish</h3>
                <p>
                  The build writes <code>{MANIFEST_FILE}</code>, a public index of the map's districts and companies.
                </p>
              </li>
              <li>
                <span className="step-n" aria-hidden="true">
                  02
                </span>
                <h3>Link</h3>
                <p>The map links to the Nexus from its walk world, top bar and About panel. The build fails without them.</p>
              </li>
              <li>
                <span className="step-n" aria-hidden="true">
                  03
                </span>
                <h3>Prove</h3>
                <p>The publisher vouches for the map with its own domain, a link from its homepage or a DNS record.</p>
              </li>
              <li>
                <span className="step-n" aria-hidden="true">
                  04
                </span>
                <h3>Review</h3>
                <p>A maintainer approves a one-file pull request to the registry.</p>
              </li>
            </ol>
            <div className="how-check">
              <p className="caption">
                <code>join-check</code> runs the first three steps against a live map:
              </p>
              <CodeBlock code="npm run join-check -- https://map.example.org" label="Check a map before applying" />
              <p className="fine">
                The Nexus checks every map again each time it is built; a map that stops linking or loses its proof drops out.{" "}
                <a className="text-link" href={JOINING}>
                  Joining guide <External size={14} />
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="get-started" aria-labelledby="start-title">
          <div className="container start">
            <div className="start-text">
              <h2 id="start-title">Get started</h2>
              <p>
                Requires Node 22.18 or later. A map's content lives in <code>site/</code>, where the example is fictional; <code>npm run build</code> writes a static site to{" "}
                <code>dist/</code> for any host.
              </p>
              <p>
                <a className="text-link" href={DOCS}>
                  Documentation <External size={14} />
                </a>
              </p>
            </div>
            <CodeBlock code={START} label="Start a map" />
          </div>
        </section>

        <section className="section" id="built-for-you" aria-labelledby="built-title">
          <div className="container">
            <h2 id="built-title">Services</h2>
            <p className="section-lede">Setup, custom walk worlds and ongoing care, by {WHITE_GLOVE.provider ?? `the maintainers of ${FRAMEWORK}`}.</p>
            <ul className="panel-grid panel-grid-3">
              {[...WHITE_GLOVE.packages.filter((p) => !p.addon), ...WHITE_GLOVE.packages.filter((p) => p.addon)].map((p) => (
                <li key={p.id} className={p.addon ? "package is-addon" : "package"}>
                  {p.addon ? <p className="package-kicker">Add-on to any package</p> : null}
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                  <ul className="includes">
                    {p.includes.map((line) => (
                      <li key={line}>
                        <Check size={16} className="include-icon" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  {p.exampleHref ? (
                    <p className="package-example">
                      <a className="text-link" href={p.exampleHref}>
                        See an example<span className="sr-only">: {p.name}</span> <ArrowRight size={16} />
                      </a>
                    </p>
                  ) : null}
                  {quoted ? null : <p className="package-price">{p.price ?? "Quoted per organization"}</p>}
                  {p.checkoutUrl ? (
                    <a className="btn btn-outline btn-small" href={p.checkoutUrl}>
                      Book<span className="sr-only">: {p.name}</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="wg-cta">
              <a className="btn btn-primary btn-large" href={intakeHref(intake)}>
                Request a setup <ArrowRight size={18} />
              </a>
              <p className="fine">
                {quoted ? "Pricing is quoted per organization. " : null}
                {"email" in intake ? (
                  <>
                    Requests go to <a href={`mailto:${intake.email}`}>{intake.email}</a> by email.
                  </>
                ) : isPublicGitHubForm(intake.url) ? (
                  "Requests made on GitHub are public."
                ) : null}
                {WHITE_GLOVE.note ? ` ${WHITE_GLOVE.note}` : null}
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="principles" aria-labelledby="principles-title">
          <div className="container">
            <h2 id="principles-title">Principles</h2>
            <ul className="panel-grid panel-grid-4">
              <li>
                <h3>Provenance first</h3>
                <p>Every fact keeps its source, and nothing is invented.</p>
              </li>
              <li>
                <h3>No personal contact data</h3>
                <p>Validators reject email addresses and phone numbers in records and manifests.</p>
              </li>
              <li>
                <h3>Static and serverless</h3>
                <p>A map is a static site, with no server, database or accounts.</p>
              </li>
              <li>
                <h3>Accessible</h3>
                <p>Every record is reachable without 3D, by keyboard and by screen reader.</p>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-top">
            <p className="footer-brand">
              <Mark size={24} className="brand-mark" />
              The Nexus
            </p>
            <nav className="footer-links" aria-label="Project">
              <a href={FRAMEWORK_REPO}>GitHub</a>
              <a href={DOCS}>Documentation</a>
              <a href={TERMS}>Network terms</a>
            </nav>
          </div>
          <p className="fine">
            {FRAMEWORK} and the Nexus are open source under the MIT License. Each map's name, data and logo belong to its publisher.
          </p>
        </div>
      </footer>

      <MusicButton />
    </>
  );
}
