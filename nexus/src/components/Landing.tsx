/* The landing page: the framework, and the network it joins. Its hero is the live Nexus,
   drifting behind the headline; everything below is plain, factual text. */
import { useEffect, useRef } from "react";
import { FRAMEWORK, FRAMEWORK_REPO, MANIFEST_FILE, OWNER_DNS_LABEL, ownerTxtValue } from "../../../federation/protocol.ts";
import { PROMO_VIDEO, WHITE_GLOVE, intakeHref, isPublicGitHubForm } from "../config.ts";
import { formatDate, plural } from "../lib/copy.ts";
import { LANDING, type Route } from "../lib/route.ts";
import { routeHref } from "../hooks/useRoute.ts";
import type { NetworkState } from "../hooks/useNetwork.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import type { NexusEngine } from "../three/engine.ts";
import { CodeBlock } from "./CodeBlock.tsx";
import { ArrowRight, Check, Code, Directory, External, Globe, Mark, Walk } from "./Icons.tsx";
import { NetworkList } from "./NetworkList.tsx";
import { SceneHost } from "./SceneHost.tsx";

/** "fritzhand/portfolio-map-3d", from the repository's address. */
const REPO_PATH = new URL(FRAMEWORK_REPO).pathname.replace(/^\/|\/$/g, "");

/** The framework's example map, deployed next to the Nexus (a separate app). */
const EXAMPLE_MAP = `${import.meta.env.BASE_URL}example/`;

const REGISTRY_EXAMPLE = `{
  "id": "your-map",
  "name": "Your Portfolio",
  "url": "https://map.example.org",
  "joined": "2026-10-09",
  "maintainer": "your-github-handle"
}`;

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
      ? `${model.worlds.length} ${plural(model.worlds.length, "map", "maps")} in the network, ${model.companies.toLocaleString("en-US")} ${plural(model.companies, "company", "companies")} in all.`
      : "No maps have joined yet. Yours can be the first.";

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
            <span className="brand-sub">{FRAMEWORK}</span>
          </a>
          <nav className="site-nav" aria-label="Sections">
            {route.sample ? <span className="sample-badge">Sample data</span> : null}
            <a className="nav-link nav-optional" href="#how">
              How it works
            </a>
            <a className="nav-link nav-optional" href="#network">
              Network
            </a>
            <a className="nav-link nav-optional" href="#built-for-you">
              Built for you
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
              <p className="eyebrow">Open source · {FRAMEWORK}</p>
              <h1 id="hero-title">Every portfolio, one shared world.</h1>
              <p className="lede">
                {FRAMEWORK} is an open source framework for publishing your companies as a 3D globe, a walkable world and a searchable directory. Every map built with it links into
                this shared world, the Nexus.
              </p>
              <div className="cta-row">
                <button type="button" className="btn btn-primary btn-large" onClick={() => onEnter()}>
                  Enter the Nexus <ArrowRight size={20} />
                </button>
                <a className="btn btn-outline btn-large" href="#get-started">
                  Build your map
                </a>
                <a className="btn btn-ghost btn-large" href={FRAMEWORK_REPO}>
                  <Code size={20} /> GitHub
                </a>
              </div>
              <p className="hero-example">
                <a className="text-link" href={EXAMPLE_MAP}>
                  See the example map <ArrowRight size={16} />
                </a>
              </p>
              <p className="hero-stat" aria-live="polite">
                {stat}
              </p>
            </div>
          </div>
        </section>

        {PROMO_VIDEO ? (
          <section className="section section-alt" id="video" aria-labelledby="video-title">
            <div className="container">
              <h2 id="video-title">The network in {PROMO_VIDEO.seconds} seconds</h2>
              <p className="section-lede" id="video-caption">
                {PROMO_VIDEO.caption}
              </p>
              {/* preload="none": nothing is fetched until the visitor presses play. */}
              <video className="promo-video" controls playsInline preload="none" poster={PROMO_VIDEO.poster} aria-labelledby="video-title" aria-describedby="video-caption">
                <source src={PROMO_VIDEO.src} type="video/mp4" />
              </video>
              {PROMO_VIDEO.portrait ? (
                <p className="promo-alt">
                  <a className="text-link" href={PROMO_VIDEO.portrait}>
                    The vertical cut, for phones <ArrowRight size={16} />
                  </a>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="section" id="ways" aria-labelledby="ways-title">
          <div className="container">
            <h2 id="ways-title">Three ways in, one data set</h2>
            <p className="section-lede">Every map built with the framework shows the same records three ways. Visitors choose the one that suits them.</p>
            <ul className="ways">
              <li className="way">
                <Globe size={28} className="way-icon" />
                <h3>Globe</h3>
                <p>A slowly rotating globe of company logos. Each district is its own region of the sphere, sized by its number of companies. Select a logo and the company's details slide up.</p>
              </li>
              <li className="way">
                <Walk size={28} className="way-icon" />
                <h3>Walk</h3>
                <p>An explorer in a walkable world of districts, with a pin and logo for every company. Walk up to a pin, or click it, to open the company. A portal in the world leads here.</p>
              </li>
              <li className="way">
                <Directory size={28} className="way-icon" />
                <h3>Directory</h3>
                <p>The same records as a searchable, filterable list. No 3D required: every record is reachable here, by keyboard and by screen reader.</p>
              </li>
            </ul>
          </div>
        </section>

        <section className="section section-alt" id="how" aria-labelledby="how-title">
          <div className="container">
            <h2 id="how-title">How the network works</h2>
            <p className="section-lede">Joining is a short handshake between your map and the Nexus. The framework does most of it for you.</p>
            <ol className="steps steps-4">
              <li className="step">
                <span className="step-n" aria-hidden="true">
                  1
                </span>
                <h3>Publish</h3>
                <p>
                  Your map's build writes <code>{MANIFEST_FILE}</code>: its name, its publisher, its districts and a public index of its companies, from the same data the map
                  shows.
                </p>
              </li>
              <li className="step">
                <span className="step-n" aria-hidden="true">
                  2
                </span>
                <h3>Link</h3>
                <p>The portal in the walk world, the Nexus button in the top bar and a meta tag in the page all lead here. The build checks that they are there.</p>
              </li>
              <li className="step">
                <span className="step-n" aria-hidden="true">
                  3
                </span>
                <h3>Prove</h3>
                <p>Your organization vouches for the map, automatically: the map lives on your own domain (such as map.yourorg.com), or your homepage links to it, or a DNS TXT record says so.</p>
              </li>
              <li className="step">
                <span className="step-n" aria-hidden="true">
                  4
                </span>
                <h3>Review</h3>
                <p>A maintainer approves your registry pull request against the criteria in NETWORK.md: a real organization publishing its own companies, the data contract kept, no impersonation.</p>
              </li>
            </ol>
            <div className="how-detail">
              <div className="how-text">
                <h3>Shown after all four, and only while they hold</h3>
                <p>
                  A map appears as a world only after all four steps. Each time the Nexus is built, it checks every map again. A map that stops linking here, or whose proof goes
                  away, drops out of the world; it stays in the network list with the reason in plain words. A map that cannot be reached stays, dimmed and marked “Not reachable at
                  last check”, with its last good manifest.
                </p>
                <p>A link to the Nexus from a map that has not joined only opens the Nexus. Manifests carry no email addresses or phone numbers: the checks reject them.</p>
              </div>
              <div className="how-code">
                <p className="code-caption">Check all of this against your live map before you apply:</p>
                <CodeBlock code="npm run join-check -- https://map.yourorg.com" label="Check your map before you apply" />
                <p className="code-caption">
                  The DNS proof, if you use it: a TXT record at <code>{OWNER_DNS_LABEL}.yourorg.com</code>
                </p>
                <CodeBlock code={ownerTxtValue("your-map")} label="The TXT record's value" />
                <p className="code-caption">
                  Your registry entry, <code>registry/instances/your-map.json</code>:
                </p>
                <CodeBlock code={REGISTRY_EXAMPLE} label="registry/instances/your-map.json" lang="json" />
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="get-started" aria-labelledby="start-title">
          <div className="container">
            <h2 id="start-title">Get started</h2>
            <p className="section-lede">
              You need Node 22 and somewhere to host static files. To see what you get first, open{" "}
              <a className="text-link" href={EXAMPLE_MAP}>
                the example map
              </a>
              .
            </p>
            <ol className="commands">
              <li>
                <h3>Copy the framework</h3>
                <CodeBlock code={`npx degit ${REPO_PATH} my-map`} label="Copy the framework" />
              </li>
              <li>
                <h3>Install</h3>
                <CodeBlock code="cd my-map && npm install" label="Install" />
              </li>
              <li>
                <h3>Run it locally</h3>
                <CodeBlock code="npm run dev" label="Run it locally" />
              </li>
              <li>
                <h3>Make it yours</h3>
                <p>
                  Edit <code>site/site.json</code> and the records in <code>site/data/</code>.
                </p>
              </li>
              <li>
                <h3>Build</h3>
                <CodeBlock code="npm run build" label="Build" />
                <p>The build checks your data and writes a static site, with its manifest, to <code>dist/</code>.</p>
              </li>
              <li>
                <h3>Deploy anywhere static</h3>
                <p>
                  Upload <code>dist/</code> to any static host. Then join the network: the four steps in{" "}
                  <span className="nowrap">
                    <a className="text-link" href="#how">
                      How the network works
                    </a>
                    .
                  </span>
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="section section-alt" id="built-for-you" aria-labelledby="built-title">
          <div className="container">
            <h2 id="built-title">Have it built for you</h2>
            <p className="section-lede">Prefer not to do it yourself? We can set up, launch and maintain your map for you.</p>
            <p className="provider">{WHITE_GLOVE.provider ? `Offered by ${WHITE_GLOVE.provider}` : `Offered by the maintainers of ${FRAMEWORK}`}</p>
            <ul className="packages">
              {[...WHITE_GLOVE.packages.filter((p) => !p.addon), ...WHITE_GLOVE.packages.filter((p) => p.addon)].map((p) => (
                <li key={p.id} className={p.addon ? "package is-addon" : "package"}>
                  {p.addon ? <p className="package-kicker">Add-on</p> : null}
                  <h3>{p.name}</h3>
                  <p className="package-summary">{p.summary}</p>
                  <ul className="includes">
                    {p.includes.map((line) => (
                      <li key={line}>
                        <Check size={18} className="include-icon" />
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
                  <p className="package-price">{p.price ?? "Quoted per organization"}</p>
                  {p.checkoutUrl ? (
                    <a className="btn btn-outline btn-small" href={p.checkoutUrl}>
                      Book<span className="sr-only">: {p.name}</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            {WHITE_GLOVE.note ? <p className="muted wg-note">{WHITE_GLOVE.note}</p> : null}
            <div className="wg-cta">
              <a className="btn btn-primary btn-large" href={intakeHref(WHITE_GLOVE.intake)}>
                Request a setup <ArrowRight size={20} />
              </a>
              {"email" in WHITE_GLOVE.intake ? (
                <p className="muted wg-public">
                  Opens an email to <a href={`mailto:${WHITE_GLOVE.intake.email}`}>{WHITE_GLOVE.intake.email}</a> with a few questions to answer.
                </p>
              ) : isPublicGitHubForm(WHITE_GLOVE.intake.url) ? (
                <p className="muted wg-public">Requests made through GitHub are public: include only what you'd put on your website.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section" id="network" aria-labelledby="network-title">
          <div className="container">
            <div className="section-head">
              <h2 id="network-title">The network</h2>
              {route.sample ? <span className="sample-badge">Sample data</span> : null}
            </div>
            <p className="section-lede">
              Every map in the registry{model?.generated ? `, as of the last check on ${formatDate(model.generated)}` : ""}. This list is the network without the 3D: every map is
              reachable from here.
            </p>
            {net.status === "loading" ? <p className="muted">Loading the network…</p> : null}
            {net.status === "error" ? <p className="status status-problem">{net.message}</p> : null}
            {model ? <NetworkList model={model} onSee={gl === "unavailable" ? undefined : (id) => onEnter(id)} joinHref="#how" /> : null}
          </div>
        </section>

        <section className="section section-alt" id="principles" aria-labelledby="principles-title">
          <div className="container">
            <h2 id="principles-title">Principles</h2>
            <ul className="principles">
              <li>
                <h3>Provenance first</h3>
                <p>Every fact keeps its source in the data. What is unknown stays empty; nothing is invented to fill a gap.</p>
              </li>
              <li>
                <h3>No personal contact data</h3>
                <p>The validators reject email addresses and phone numbers, in a map's records and in every manifest that crosses the network.</p>
              </li>
              <li>
                <h3>Static and serverless</h3>
                <p>A map is a static site: no server, no database, no accounts. Host it anywhere. The Nexus is static too, rebuilt from the registry.</p>
              </li>
              <li>
                <h3>Accessible</h3>
                <p>Every record is reachable without 3D, by keyboard and by screen reader. Focus is always visible, and reduced motion is honored.</p>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Mark size={24} className="brand-mark" />
            <span>The Nexus</span>
          </div>
          <p>
            {FRAMEWORK} is open source under the MIT License.{" "}
            <a className="text-link" href={FRAMEWORK_REPO}>
              Source on GitHub <External size={14} />
            </a>
          </p>
          <p>
            The Nexus is itself open source: <code>nexus/</code> in the repo.
          </p>
          {route.sample ? <p className="muted">This page is showing fictional sample data (?sample), not the network.</p> : null}
        </div>
      </footer>
    </>
  );
}
