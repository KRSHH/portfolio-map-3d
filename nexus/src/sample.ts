/* Fictional sample data for developing the Nexus. Used ONLY when the address has ?sample, and
   the page then says "Sample data" in a visible badge. Production shows network.json only.

   Every instance, company and description here is made up: ids start with "sample-", addresses
   are https://sample-<n>.example.org, company names are generated from syllables, and no
   description describes a real company. Eight instances are worlds (one of them unreachable at
   its last check), and three are listed only, to show the network list's other states (no
   backlink, never read, not confirmed by its publisher). Publishers vouch in each of the
   protocol's ways (OwnerProof). Every manifest passes the protocol's validateManifest
   (sample.test.ts). Deterministic. */
import { FRAMEWORK, MAINTAINERS, NEXUS_URL, PROTOCOL, type InstanceStatus, type Manifest, type NetworkInstance, type NetworkSnapshot, type OwnerProof, type RegistryEntry } from "../../federation/protocol.ts";
import { verifyInstance } from "../../federation/validate.ts";
import { fnv1a, seeded } from "./lib/hash.ts";

interface Sector {
  suffix: string[];
  keywords: string[];
  does: string[];
}

/** Generic sectors: the suffixes, keywords and one-line descriptions the generator draws from. */
const SECTORS: Record<string, Sector> = {
  FinTech: { suffix: ["Pay", "Ledger", "Capital"], keywords: ["payments", "lending", "accounting", "compliance"], does: ["Builds payment tools for small businesses.", "Automates bookkeeping for independent contractors.", "Offers lending software for community banks."] },
  Climate: { suffix: ["Carbon", "Climate", "Grid"], keywords: ["carbon accounting", "emissions", "adaptation", "sustainability"], does: ["Measures building emissions from utility data.", "Plans flood adaptation for coastal towns.", "Tracks supply chain emissions for manufacturers."] },
  Health: { suffix: ["Health", "Care", "Clinic"], keywords: ["digital health", "clinics", "patient intake", "care coordination"], does: ["Schedules home visits for care teams.", "Digitizes patient intake for outpatient clinics.", "Coordinates referrals between primary care and specialists."] },
  Logistics: { suffix: ["Freight", "Route", "Logistics"], keywords: ["shipping", "warehousing", "fleet", "last mile"], does: ["Routes last-mile deliveries for regional grocers.", "Matches freight loads with independent carriers.", "Tracks warehouse inventory with shelf cameras."] },
  "AI & Data": { suffix: ["AI", "Data", "Labs"], keywords: ["machine learning", "data pipelines", "analytics", "ai"], does: ["Labels training data for computer vision teams.", "Builds forecasting models for retail demand.", "Turns support transcripts into searchable answers."] },
  Biotech: { suffix: ["Bio", "Therapeutics", "Genomics"], keywords: ["biotech", "diagnostics", "lab automation", "assays"], does: ["Develops rapid assays for veterinary clinics.", "Automates sample handling for research labs.", "Screens enzymes for food processing."] },
  "Clean Energy": { suffix: ["Energy", "Solar", "Power"], keywords: ["solar", "storage", "energy efficiency", "ev charging"], does: ["Designs battery storage for farms.", "Monitors rooftop solar output for installers.", "Schedules EV charging for fleet depots."] },
  Consumer: { suffix: ["Goods", "Home", "Co"], keywords: ["consumer", "e-commerce", "subscriptions", "retail"], does: ["Sells refillable cleaning supplies by subscription.", "Runs a marketplace for secondhand outdoor gear.", "Makes modular furniture for small apartments."] },
  Cybersecurity: { suffix: ["Secure", "Shield", "Sec"], keywords: ["security", "identity", "threat detection", "zero trust"], does: ["Detects account takeovers for online stores.", "Manages device access for hybrid teams.", "Audits cloud permissions for startups."] },
  Education: { suffix: ["Learning", "Academy", "Edu"], keywords: ["edtech", "tutoring", "workforce training", "k-12"], does: ["Matches students with peer tutors.", "Builds apprenticeship programs for trade schools.", "Tracks reading progress for elementary teachers."] },
  Enterprise: { suffix: ["Systems", "Works", "Cloud"], keywords: ["saas", "workflow", "procurement", "operations"], does: ["Automates purchase approvals for mid-size companies.", "Builds field-service scheduling software.", "Keeps contract renewals on one calendar."] },
  Hardware: { suffix: ["Robotics", "Devices", "Instruments"], keywords: ["robotics", "sensors", "manufacturing", "iot"], does: ["Builds inspection robots for pipelines.", "Makes low-cost air quality sensors.", "Designs grippers for warehouse robots."] },
  Media: { suffix: ["Media", "Studio", "Audio"], keywords: ["media", "video", "podcasts", "creators"], does: ["Edits short video for local newsrooms.", "Hosts podcast analytics for independent shows.", "Licenses music for small creators."] },
  Mobility: { suffix: ["Mobility", "Motion", "Transit"], keywords: ["mobility", "transit", "micromobility", "parking"], does: ["Maps curb space for city transit teams.", "Runs shared e-bike fleets for campuses.", "Predicts parking demand for event venues."] },
  "Ocean Tech": { suffix: ["Marine", "Ocean", "Tide"], keywords: ["ocean", "aquaculture", "marine sensors", "ports"], does: ["Monitors oyster farms with buoy sensors.", "Maps seagrass with underwater drones.", "Schedules berths for small ports."] },
  "Food & Agriculture": { suffix: ["Farms", "Foods", "Harvest"], keywords: ["agtech", "food safety", "irrigation", "farming"], does: ["Controls irrigation from soil moisture data.", "Traces produce lots for food safety recalls.", "Grows greens in shipping-container farms."] },
};

const SECTOR_NAMES = Object.keys(SECTORS);

const START = ["Al", "Bri", "Cal", "Dor", "El", "Fen", "Gal", "Hal", "Ir", "Jas", "Kel", "Lum", "Mor", "Nev", "Or", "Pel", "Quil", "Ros", "Sol", "Tam", "Ul", "Ver", "Wyn", "Yar", "Zen"];
const MID = ["a", "e", "i", "o", "an", "er", "is", "or", "u"];
const END = ["dex", "lo", "mira", "nix", "ra", "sto", "va", "ven", "wick", "zo", "tel", "bry"];

const PALETTE = ["#4cc9f0", "#f72585", "#80ed99", "#ffb703", "#9d7bff", "#fb8500", "#2ec4b6", "#e9c46a", "#ff6b6b", "#06d6a0", "#3a86ff", "#c77dff"];

interface SampleDef {
  key: string;
  name: string;
  tagline: string | null;
  accent: string;
  labels: Manifest["labels"];
  /** District labels; a label that is a sector draws its companies from it, others from any sector. */
  districts: string[];
  companies: number;
  people: number;
  joined: string;
  status: InstanceStatus;
  checked: string | null;
  /** A Nexus other than ours (to show "no backlink"). */
  nexus?: string;
  /** No manifest was ever read. */
  noManifest?: boolean;
  problems?: string[];
  /** Who publishes it; by default the map's own organization, on the map's own host. */
  publisher?: Manifest["publisher"];
  /** How the publisher vouched for it (verified instances); "domain" by default. */
  proof?: OwnerProof | null;
}

const L = (company: string, companies: string, district: string, districts: string, people: string | null = null): Manifest["labels"] => ({ company, companies, district, districts, people });

const TIMED_OUT = "the manifest could not be fetched at the last check (the request timed out)";

const DEFS: SampleDef[] = [
  { key: "harbor", name: "Sample Harbor Ventures", tagline: "A fictional seed fund, for trying out the Nexus.", accent: "#4cc9f0", labels: L("company", "companies", "track", "tracks", "mentors"), districts: ["FinTech", "Climate", "Health", "Logistics"], companies: 46, people: 12, joined: "2026-06-02", status: "verified", checked: "2026-10-09" },
  { key: "foundry", name: "Sample Foundry Collective", tagline: "A fictional accelerator with twelve sectors.", accent: "#f4a261", labels: L("startup", "startups", "sector", "sectors"), districts: ["AI & Data", "Biotech", "Clean Energy", "Consumer", "Cybersecurity", "Education", "Enterprise", "FinTech", "Hardware", "Health", "Media", "Mobility"], companies: 120, people: 0, joined: "2026-06-15", status: "verified", checked: "2026-10-09" },
  { key: "prairie", name: "Sample Prairie Accelerator", tagline: "A fictional three-cohort program.", accent: "#80ed99", labels: L("company", "companies", "cohort", "cohorts", "coaches"), districts: ["Spring cohort", "Summer cohort", "Fall cohort"], companies: 18, people: 5, joined: "2026-07-01", status: "verified", checked: "2026-10-09" },
  { key: "coastline", name: "Sample Coastline Fund", tagline: "A fictional fund for coastal economies.", accent: "#ff6b9d", labels: L("portfolio company", "portfolio companies", "focus area", "focus areas"), districts: ["Ocean Tech", "Food & Agriculture", "Health", "Climate", "Enterprise", "Consumer"], companies: 34, people: 0, joined: "2026-07-20", status: "verified", checked: "2026-10-09", publisher: { name: "Sample Coastline Fund", website: "https://coastline-fund.example.com" }, proof: "dns" },
  { key: "summit", name: "Sample Summit Incubator", tagline: null, accent: "#a78bfa", labels: L("member", "members", "industry", "industries", "advisors"), districts: ["Health", "Education", "Hardware", "Enterprise", "Media"], companies: 9, people: 3, joined: "2026-08-03", status: "verified", checked: "2026-10-09", publisher: { name: "Sample Summit Incubator", website: null }, proof: "maintainer" },
  { key: "meridian", name: "Sample Meridian Lab", tagline: "A fictional university venture lab.", accent: "#ffd166", labels: L("team", "teams", "program", "programs"), districts: ["Research", "Pre-seed", "Growth"], companies: 6, people: 0, joined: "2026-08-21", status: "verified", checked: "2026-10-09" },
  { key: "northwind", name: "Sample Northwind Network", tagline: "A fictional regional network, unreachable at its last check.", accent: "#2ec4b6", labels: L("company", "companies", "district", "districts"), districts: ["AI & Data", "Cybersecurity", "FinTech", "Health", "Logistics", "Mobility", "Clean Energy", "Enterprise"], companies: 72, people: 0, joined: "2026-09-02", status: "unreachable", checked: "2026-09-28", problems: [TIMED_OUT] },
  { key: "lantern", name: "Sample Lantern Studio", tagline: "A fictional venture studio, published by its parent.", accent: "#ff6b6b", labels: L("venture", "ventures", "studio", "studios"), districts: ["Consumer", "Media", "Education", "Health"], companies: 25, people: 0, joined: "2026-09-15", status: "verified", checked: "2026-10-09", publisher: { name: "Sample Lantern Holdings", website: "https://lantern-holdings.example.com" }, proof: "link" },
  { key: "drift", name: "Sample Drift Labs", tagline: "A fictional map that links to another Nexus.", accent: "#c77dff", labels: L("company", "companies", "sector", "sectors"), districts: ["Hardware", "Enterprise"], companies: 7, people: 0, joined: "2026-09-20", status: "no-backlink", checked: "2026-10-09", nexus: "https://another-nexus.example.org" },
  { key: "quarry", name: "Sample Quarry Partners", tagline: null, accent: "#e9c46a", labels: L("company", "companies", "track", "tracks"), districts: ["Climate"], companies: 3, people: 0, joined: "2026-10-01", status: "unreachable", checked: null, noManifest: true, problems: [TIMED_OUT] },
  { key: "ember", name: "Sample Ember Partners", tagline: "A fictional map its publisher has not vouched for.", accent: "#06d6a0", labels: L("company", "companies", "sector", "sectors"), districts: ["Enterprise", "FinTech"], companies: 8, people: 0, joined: "2026-10-05", status: "unconfirmed", checked: "2026-10-09", publisher: { name: "Sample Ember Partners", website: "https://ember-partners.example.com" }, proof: null, problems: ["the map is not on its publisher's domain (ember-partners.example.com), the publisher's homepage does not link to it, and the domain has no _portfolio-map DNS record"] },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Split `total` across `n` districts with uneven weights, at least one each when there are enough. */
function splitCounts(total: number, n: number, rand: () => number): number[] {
  const weights = Array.from({ length: n }, () => 0.35 + rand() * 1.3);
  const sum = weights.reduce((a, b) => a + b, 0);
  const floor = total >= n ? 1 : 0;
  const counts = weights.map((w) => Math.max(floor, Math.floor((w / sum) * total)));
  let diff = total - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % n) {
    if (diff > 0) {
      counts[i]++;
      diff--;
    } else if (counts[i] > floor) {
      counts[i]--;
      diff++;
    }
  }
  return counts;
}

function buildManifest(def: SampleDef, n: number): Manifest {
  const rand = seeded(fnv1a(`sample:${def.key}`));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const districtSlugs = def.districts.map(slugify);
  const counts = splitCounts(def.companies, def.districts.length, rand);
  const used = new Set<string>();
  const companies: Manifest["companies"] = [];
  def.districts.forEach((label, di) => {
    for (let i = 0; i < counts[di]; i++) {
      const sector = SECTORS[label] ?? SECTORS[pick(SECTOR_NAMES)];
      let name = "";
      let slug = "";
      for (let tries = 0; !slug || used.has(slug); tries++) {
        const stem = pick(START) + pick(MID) + pick(END);
        name = `${stem} ${pick(sector.suffix)}${tries > 6 ? ` ${tries}` : ""}`;
        slug = slugify(name);
      }
      used.add(slug);
      const kw = [...sector.keywords].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2));
      companies.push({
        slug,
        name,
        district: districtSlugs[di],
        description: rand() < 0.14 ? null : pick(sector.does),
        website: null,
        keywords: kw,
      });
    }
  });
  const offset = n % PALETTE.length;
  return {
    protocol: PROTOCOL,
    id: `sample-${def.key}`,
    name: def.name,
    publisher: def.publisher ?? { name: def.name, website: `https://sample-${n}.example.org` },
    url: `https://sample-${n}.example.org`,
    tagline: def.tagline,
    logo: null,
    accent: def.accent,
    nexus: def.nexus ?? NEXUS_URL,
    framework: { name: FRAMEWORK, version: "1.0.0" },
    labels: def.labels,
    counts: { companies: companies.length, people: def.people, districts: def.districts.length },
    districts: def.districts.map((label, i) => ({ slug: districtSlugs[i], label, color: PALETTE[(i + offset) % PALETTE.length], count: counts[i] })),
    companies,
    updated: def.checked ?? "2026-09-30",
  };
}

function buildInstance(def: SampleDef, n: number): NetworkInstance {
  const manifest = buildManifest(def, n);
  const entry: RegistryEntry = { id: manifest.id, name: def.name, url: manifest.url, joined: def.joined, maintainer: "sample-maintainer" };
  if (def.proof === "maintainer") entry.ownerConfirmedBy = MAINTAINERS[0];
  if (def.noManifest) return { entry, status: def.status, checked: def.checked, manifest: null, logoFile: null, proof: null, problems: def.problems ?? [] };
  const v = verifyInstance(entry, manifest);
  const shown = def.status === "verified";
  const problems = def.status === "verified" ? [] : def.status === "no-backlink" ? v.problems : (def.problems ?? []);
  return { entry, status: def.status, checked: def.checked, manifest, logoFile: null, proof: shown ? (def.proof === undefined ? "domain" : def.proof) : null, problems };
}

/** Builds the sample snapshot (the same every time). */
export function buildSampleNetwork(): NetworkSnapshot {
  return { protocol: PROTOCOL, generated: "2026-10-09", instances: DEFS.map((d, i) => buildInstance(d, i + 1)) };
}

export const SAMPLE_NETWORK: NetworkSnapshot = buildSampleNetwork();
