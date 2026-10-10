/* App state. One store shared by the shell and both 3D views.
   Views read `selected`, `focusDistrict` and the highlight set; they
   write through `select()` and listen to `fly` requests (a nonce bump
   means "move the camera/avatar to this target").

   People are a second roster beside the companies. At most one of `selected` (a company) and
   `person` is set, and the detail sheet shows that one. On the mind map one globe shows at a
   time (`roster`): the companies globe or the people globe, and the sheet only ever shows
   something that is on the globe in view. Switching globes there sets the other globe's
   selection and district focus aside (`stash`) and brings them back on the way back, so the
   companies globe returns exactly as it was. The search text is set aside the same way: it belongs
   to the globe it was typed on, so a company search never washes out the people globe. Nothing
   links a person to a company, district or industry (CLAUDE.md): selecting a person clears the
   district focus and highlights no company. */
import { useMemo } from "react";
import { create } from "zustand";
import { HAS_PEOPLE, PEOPLE, COMPANIES, personBySlug, districtBySlug, companyBySlug, companiesTouching } from "../data/catalog";
import { findProviders, matchesText } from "../data/graph";
import { LABELS } from "../data/labels";
import { personMatches } from "../data/search";
import type { DistrictSlug } from "../data/types";
import { isNarrow } from "../components/viewport";

export type View = "mindmap" | "walk" | "list";
export type Panel = "finder" | "districts" | "help" | null;
/** Which roster the globe and the list show: the companies, or the organization's people (site.json labels.people). */
export type Roster = "companies" | "people";

export interface FlyRequest {
  /** "person": take the visitor to a person (the people globe turns to them; the walk world takes the walker there). */
  kind: "company" | "district" | "home" | "person";
  slug?: string;
  nonce: number;
}

export interface FinderState {
  service: string | null;
  industry: string | null;
  text: string;
}

/** What one globe was showing when the visitor switched to the other one on the mind map: its selection, district focus and search text. */
export interface Stash {
  companies: { selected: string | null; focusDistrict: DistrictSlug | null; sheetExpanded: boolean; query: string } | null;
  people: { person: string | null; sheetExpanded: boolean; query: string } | null;
}

interface State {
  view: View;
  roster: Roster;
  selected: string | null;
  person: string | null;
  sheetExpanded: boolean;
  focusDistrict: DistrictSlug | null;
  query: string;
  panel: Panel;
  finder: FinderState;
  fly: FlyRequest | null;
  stash: Stash;
  /** True while a text field, sheet or panel has keyboard focus: walk controls pause. */
  inputLocked: boolean;

  setView: (v: View) => void;
  /** Show companies or people: on the mind map this switches globes, in the list it switches tabs. */
  setRoster: (r: Roster) => void;
  select: (slug: string | null, opts?: { fly?: boolean; expand?: boolean }) => void;
  selectPerson: (slug: string | null, opts?: { fly?: boolean; expand?: boolean }) => void;
  /** "See on the map": open the walk world and take the visitor to the person's place there. */
  seePersonOnMap: (slug: string) => void;
  setSheetExpanded: (v: boolean) => void;
  focusOn: (d: DistrictSlug | null, opts?: { fly?: boolean }) => void;
  setQuery: (q: string) => void;
  openPanel: (p: Panel) => void;
  setFinder: (f: Partial<FinderState>) => void;
  flyHome: () => void;
  setInputLocked: (v: boolean) => void;
}

let nonce = 0;
const next = () => ++nonce;

/** The fly request that takes the visitor to a person (honored by the people globe and the walk world). */
export function personFly(slug: string, n: number): FlyRequest {
  return { kind: "person", slug, nonce: n };
}

type Slice = Pick<State, "roster" | "selected" | "person" | "focusDistrict" | "sheetExpanded" | "query" | "stash">;

/** The companies globe's state, to set aside while the people globe is up (null when there is nothing to keep). */
function companiesAside(s: Pick<Slice, "selected" | "focusDistrict" | "sheetExpanded" | "query">): Stash["companies"] {
  return s.selected || s.focusDistrict || s.query.trim() ? { selected: s.selected, focusDistrict: s.focusDistrict, sheetExpanded: s.selected ? s.sheetExpanded : false, query: s.query } : null;
}

/** The people globe's state, to set aside while the companies globe is up (null when there is nothing to keep). */
function peopleAside(s: Pick<Slice, "person" | "sheetExpanded" | "query">): Stash["people"] {
  return s.person || s.query.trim() ? { person: s.person, sheetExpanded: s.person ? s.sheetExpanded : false, query: s.query } : null;
}

/**
 * The change that puts globe `to` in view on the mind map: what the other globe was showing (its
 * selection, for the companies globe the district focus, and the search text typed on it) goes to
 * the stash, and what this globe showed when the visitor left it comes back. Pure, so it can be
 * unit-tested.
 */
export function switchGlobe(s: Slice, to: Roster): Partial<Slice> {
  if (s.roster === to) return {};
  if (to === "people") {
    const back = s.stash.people;
    return { roster: "people", selected: null, focusDistrict: null, person: back?.person ?? null, sheetExpanded: back?.sheetExpanded ?? false, query: back?.query ?? "", stash: { companies: companiesAside(s), people: null } };
  }
  const back = s.stash.companies;
  return {
    roster: "companies",
    person: null,
    selected: back?.selected ?? null,
    focusDistrict: back?.focusDistrict ?? null,
    sheetExpanded: back?.sheetExpanded ?? false,
    query: back?.query ?? "",
    stash: { companies: null, people: peopleAside(s) },
  };
}

/** Does the search text match anything on this globe? (A blank search fits both.) */
export function queryFits(query: string, roster: Roster): boolean {
  const q = query.trim();
  if (!q) return true;
  return roster === "people" ? PEOPLE.some((c) => personMatches(c, q)) : COMPANIES.some((m) => matchesText(m, q, LABELS));
}

/**
 * Entering the mind map: the globe in view must carry what the sheet shows. A person open in the
 * sheet brings up the people globe, a company the companies globe; a district focus set in another
 * view waits in the stash while the people globe is up. Search text typed in another view stays
 * in view when it matches something on that globe, and otherwise waits for the other globe, so
 * the globe never opens washed out by a search meant for the other one.
 */
export function enterMindmap(s: Slice): Partial<Slice> {
  const to: Roster = s.person ? "people" : s.selected ? "companies" : s.roster;
  const patch: Partial<Slice> = to === s.roster ? {} : { roster: to };
  const aside = queryFits(s.query, to) ? "" : s.query;
  if (aside) patch.query = "";
  if (to === "people") {
    if (s.focusDistrict || aside) {
      // A focus picked in another view replaces what the companies globe held; search text alone joins it.
      const prev = to === s.roster && !s.focusDistrict ? s.stash.companies : null;
      patch.focusDistrict = null;
      patch.stash = { companies: { selected: prev?.selected ?? null, focusDistrict: s.focusDistrict ?? prev?.focusDistrict ?? null, sheetExpanded: prev?.sheetExpanded ?? false, query: aside }, people: null };
    } else if (to !== s.roster) patch.stash = { companies: null, people: null };
    return patch;
  }
  if (aside) patch.stash = { companies: null, people: { ...(to === s.roster && s.stash.people ? s.stash.people : { person: null, sheetExpanded: false }), query: aside } };
  else if (to !== s.roster) patch.stash = { companies: null, people: s.stash.people };
  return patch;
}

const EMPTY_STASH: Stash = { companies: null, people: null };

export const useStore = create<State>((set, get) => ({
  view: "mindmap",
  roster: "companies",
  selected: null,
  person: null,
  sheetExpanded: false,
  focusDistrict: null,
  query: "",
  panel: null,
  finder: { service: null, industry: null, text: "" },
  fly: null,
  stash: EMPTY_STASH,
  inputLocked: false,

  setView: (view) => {
    const s = get();
    set(view === "mindmap" && s.view !== "mindmap" ? { view, ...enterMindmap(s) } : { view });
  },
  setRoster: (roster) => {
    const s = get();
    if (roster === s.roster || (roster === "people" && !HAS_PEOPLE)) return;
    // Off the mind map the switch only changes which cards the list shows; nothing is set aside.
    set(s.view === "mindmap" ? switchGlobe(s, roster) : { roster, stash: EMPTY_STASH });
  },
  select: (slug, opts = {}) => {
    if (slug && !companyBySlug.has(slug)) return;
    const s = get();
    const patch: Partial<State> = {
      selected: slug,
      // On phones a panel covers the lower stage where the sheet opens; selecting from anywhere
      // (finder, a 3D logo, a list card above the panel) closes it so the company is shown.
      ...(slug && isNarrow() ? { panel: null } : {}),
      sheetExpanded: opts.expand ?? false,
      fly: slug && opts.fly !== false ? { kind: "company", slug, nonce: next() } : s.fly,
    };
    if (slug) {
      patch.person = null;
      if (s.view === "mindmap" && s.roster === "people") {
        // A company lives on the companies globe: bring it up, setting the open person aside. The
        // search text found this company (search is the way to a company from the people globe),
        // so it stays in view.
        patch.roster = "companies";
        patch.stash = { companies: null, people: s.person ? { person: s.person, sheetExpanded: s.sheetExpanded, query: "" } : null };
      } else if (s.view === "mindmap") patch.stash = { ...s.stash, companies: null };
      // The list shows the roster the open sheet belongs to (a company picked in the search, say).
      else if (s.view === "list" && s.roster === "people") Object.assign(patch, { roster: "companies", stash: EMPTY_STASH });
    }
    set(patch);
  },
  selectPerson: (slug, opts = {}) => {
    if (!slug) return set({ person: null });
    if (!personBySlug.has(slug)) return;
    const s = get();
    const patch: Partial<State> = {
      person: slug,
      selected: null,
      // A person belongs to no industry: no district stays in focus beside them.
      focusDistrict: null,
      ...(isNarrow() ? { panel: null } : {}),
      sheetExpanded: opts.expand ?? false,
      fly: opts.fly !== false ? personFly(slug, next()) : s.fly,
    };
    if (s.view === "mindmap" && s.roster === "companies") {
      // A person lives on the people globe: bring it up, setting the companies globe's state
      // (selection, district focus and any search typed on it) aside.
      patch.roster = "people";
      patch.query = "";
      patch.stash = { companies: companiesAside(s), people: null };
    } else if (s.view === "mindmap") patch.stash = { ...s.stash, people: null };
    else if (s.view === "list" && s.roster === "companies") Object.assign(patch, { roster: "people", stash: EMPTY_STASH });
    set(patch);
  },
  seePersonOnMap: (slug) => {
    if (!personBySlug.has(slug)) return;
    // The walk view acts on the pending request when it opens, and on new ones while it is open.
    // The sheet drops to its peek height, as a company's "Walk there" does, so the world is in view.
    set({ view: "walk", person: slug, selected: null, focusDistrict: null, sheetExpanded: false, ...(isNarrow() ? { panel: null } : {}), fly: personFly(slug, next()) });
  },
  setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
  focusOn: (d, opts = {}) => {
    if (d && !districtBySlug.has(d)) return;
    const s = get();
    const fly = d && opts.fly !== false ? { kind: "district" as const, slug: d, nonce: next() } : s.fly;
    if (!d) return set({ focusDistrict: null, fly });
    // Districts belong to the companies globe. Off the mind map an open person sheet closes: no person has a district.
    if (s.view === "mindmap" && s.roster === "people") return set({ ...switchGlobe(s, "companies"), focusDistrict: d, fly });
    set({ focusDistrict: d, fly, person: null });
  },
  setQuery: (query) => set({ query }),
  openPanel: (panel) => {
    const s = get();
    // The provider finder lights up companies, so on the mind map it brings up the companies globe.
    if (panel === "finder" && s.view === "mindmap" && s.roster === "people") return set({ ...switchGlobe(s, "companies"), panel });
    set({ panel });
  },
  setFinder: (f) => set({ finder: { ...get().finder, ...f } }),
  flyHome: () => set({ fly: { kind: "home", nonce: next() }, focusDistrict: null }),
  setInputLocked: (inputLocked) => set({ inputLocked }),
}));

export function finderActive(f: FinderState): boolean {
  return !!(f.service || f.industry || f.text.trim());
}

/** Provider-finder results for the current finder state (empty when inactive). */
export function useFinderResults() {
  const finder = useStore((s) => s.finder);
  return useMemo(() => (finderActive(finder) ? findProviders(finder, COMPANIES, LABELS) : []), [finder]);
}

/**
 * The set of companies to emphasize, or null for "show everything normally".
 * Priority: provider finder (when its panel is open) > search query > focused district.
 */
export function useHighlight(): Set<string> | null {
  const panel = useStore((s) => s.panel);
  const finder = useStore((s) => s.finder);
  const query = useStore((s) => s.query);
  const focus = useStore((s) => s.focusDistrict);
  return useMemo(() => {
    if (panel === "finder" && finderActive(finder)) return new Set(findProviders(finder, COMPANIES, LABELS).map((f) => f.company.slug));
    const q = query.trim();
    if (q) return new Set(COMPANIES.filter((m) => matchesText(m, q, LABELS)).map((m) => m.slug));
    if (focus) return new Set(companiesTouching(focus).map((m) => m.slug));
    return null;
  }, [panel, finder, query, focus]);
}

/** People to emphasize on the people globe (name or specialty matches the search), or null for all of them. */
export function usePersonHighlight(): Set<string> | null {
  const query = useStore((s) => s.query);
  return useMemo(() => {
    const q = query.trim();
    return q ? new Set(PEOPLE.filter((c) => personMatches(c, q)).map((c) => c.slug)) : null;
  }, [query]);
}
