import { beforeEach, describe, expect, it } from "vitest";
import { personFly, enterMindmap, queryFits, switchGlobe, useStore, type Stash } from "./store";

const initial = useStore.getState();
const reset = () => useStore.setState(initial, true);
const empty: Stash = { companies: null, people: null };

describe("switchGlobe (pure)", () => {
  it("sets the companies globe's selection and focus aside and brings back the person open before", () => {
    const s = { roster: "companies" as const, selected: "signalforge", person: null, focusDistrict: "health" as const, sheetExpanded: true, query: "", stash: { companies: null, people: { person: "ada-lindqvist", sheetExpanded: false, query: "" } } };
    expect(switchGlobe(s, "people")).toEqual({
      roster: "people",
      selected: null,
      focusDistrict: null,
      person: "ada-lindqvist",
      sheetExpanded: false,
      query: "",
      stash: { companies: { selected: "signalforge", focusDistrict: "health", sheetExpanded: true, query: "" }, people: null },
    });
  });

  it("brings the companies globe back as it was, setting the open person aside", () => {
    const s = { roster: "people" as const, selected: null, person: "ada-lindqvist", focusDistrict: null, sheetExpanded: true, query: "", stash: { companies: { selected: "signalforge", focusDistrict: null, sheetExpanded: false, query: "Signalforge" }, people: null } };
    expect(switchGlobe(s, "companies")).toEqual({
      roster: "companies",
      person: null,
      selected: "signalforge",
      focusDistrict: null,
      sheetExpanded: false,
      query: "Signalforge",
      stash: { companies: null, people: { person: "ada-lindqvist", sheetExpanded: true, query: "" } },
    });
  });

  it("sets the search text aside with the globe it was typed on", () => {
    const s = { roster: "companies" as const, selected: null, person: null, focusDistrict: null, sheetExpanded: false, query: "Signalforge", stash: empty };
    expect(switchGlobe(s, "people")).toMatchObject({ query: "", stash: { companies: { selected: null, focusDistrict: null, sheetExpanded: false, query: "Signalforge" }, people: null } });
    const c = { roster: "people" as const, selected: null, person: null, focusDistrict: null, sheetExpanded: false, query: "fundraising", stash: empty };
    expect(switchGlobe(c, "companies")).toMatchObject({ query: "", stash: { companies: null, people: { person: null, sheetExpanded: false, query: "fundraising" } } });
  });

  it("does nothing for the globe already in view", () => {
    expect(switchGlobe({ roster: "people", selected: null, person: null, focusDistrict: null, sheetExpanded: false, query: "", stash: empty }, "people")).toEqual({});
  });
});

describe("enterMindmap (pure)", () => {
  it("brings up the globe that carries what the sheet shows", () => {
    const base = { selected: null, person: null, focusDistrict: null, sheetExpanded: false, query: "", stash: empty };
    expect(enterMindmap({ ...base, roster: "companies", person: "ada-lindqvist" })).toMatchObject({ roster: "people" });
    expect(enterMindmap({ ...base, roster: "people", selected: "signalforge" })).toMatchObject({ roster: "companies" });
    expect(enterMindmap({ ...base, roster: "companies" })).toEqual({});
  });

  it("keeps a district focus off the people globe, for later", () => {
    expect(enterMindmap({ roster: "people", selected: null, person: null, focusDistrict: "health", sheetExpanded: false, query: "", stash: empty })).toEqual({
      focusDistrict: null,
      stash: { companies: { selected: null, focusDistrict: "health", sheetExpanded: false, query: "" }, people: null },
    });
  });

  it("keeps search text that matches nothing on the globe for the other globe", () => {
    const base = { selected: null, person: null, focusDistrict: null, sheetExpanded: false, stash: empty };
    // A company search typed in the walk view, then a person opened there: the people globe opens clean.
    expect(enterMindmap({ ...base, roster: "companies", person: "ada-lindqvist", query: "Signalforge" })).toEqual({
      roster: "people",
      query: "",
      focusDistrict: null,
      stash: { companies: { selected: null, focusDistrict: null, sheetExpanded: false, query: "Signalforge" }, people: null },
    });
    // A person's name typed in the walk view, then the companies globe: it waits for the people globe.
    expect(enterMindmap({ ...base, roster: "companies", query: "Ada Lindqvist" })).toEqual({ query: "", stash: { companies: null, people: { person: null, sheetExpanded: false, query: "Ada Lindqvist" } } });
    // Text that matches something on the globe in view stays.
    expect(enterMindmap({ ...base, roster: "people", person: "ada-lindqvist", query: "fundraising" })).toEqual({});
  });

  it("knows which globe a search matches", () => {
    expect(queryFits("Signalforge", "companies")).toBe(true);
    expect(queryFits("Signalforge", "people")).toBe(false);
    expect(queryFits("Ada", "people")).toBe(true);
    expect(queryFits("  ", "people")).toBe(true);
  });
});

describe("store: people", () => {
  beforeEach(reset);

  it("makes a person fly request", () => {
    expect(personFly("ada-lindqvist", 3)).toEqual({ kind: "person", slug: "ada-lindqvist", nonce: 3 });
    useStore.getState().selectPerson("ada-lindqvist", { fly: true });
    const s = useStore.getState();
    expect(s.fly).toMatchObject({ kind: "person", slug: "ada-lindqvist" });
    expect(s.person).toBe("ada-lindqvist");
  });

  it("selects either a company or a person, never both", () => {
    const st = () => useStore.getState();
    st().setView("list");
    st().select("signalforge");
    st().selectPerson("ada-lindqvist");
    expect([st().selected, st().person]).toEqual([null, "ada-lindqvist"]);
    st().select("signalforge");
    expect([st().selected, st().person]).toEqual(["signalforge", null]);
  });

  it("ignores unknown people", () => {
    useStore.getState().selectPerson("nobody-here");
    expect(useStore.getState().person).toBeNull();
  });

  it("ignores unknown companies and districts, and a person's slug as a company", () => {
    const st = () => useStore.getState();
    st().select("nobody-here");
    st().select("ada-lindqvist");
    st().focusOn("space");
    expect([st().selected, st().focusDistrict]).toEqual([null, null]);
  });

  it("clears the district focus when a person opens: no industry beside a person", () => {
    const st = () => useStore.getState();
    st().setView("walk");
    st().focusOn("health");
    st().selectPerson("ada-lindqvist", { fly: false });
    expect(st().focusDistrict).toBeNull();
    // ...and a district picked later closes the person.
    st().focusOn("health");
    expect([st().focusDistrict, st().person]).toEqual(["health", null]);
  });

  it("on the mind map, a person brings up the people globe and the companies globe comes back as it was", () => {
    const st = () => useStore.getState();
    st().select("signalforge", { fly: true, expand: true });
    st().selectPerson("ada-lindqvist", { fly: true });
    expect(st()).toMatchObject({ roster: "people", person: "ada-lindqvist", selected: null });
    st().setRoster("companies");
    expect(st()).toMatchObject({ roster: "companies", selected: "signalforge", sheetExpanded: true, person: null });
    // ...and the person is waiting on the people globe.
    st().setRoster("people");
    expect(st()).toMatchObject({ roster: "people", person: "ada-lindqvist", selected: null });
  });

  it("on the mind map, picking a company brings up the companies globe", () => {
    const st = () => useStore.getState();
    st().setRoster("people");
    st().select("signalforge", { fly: true });
    expect(st()).toMatchObject({ roster: "companies", selected: "signalforge" });
  });

  it("off the mind map, Companies | People only switches the list", () => {
    const st = () => useStore.getState();
    st().setView("list");
    st().select("signalforge");
    st().setRoster("people");
    expect(st()).toMatchObject({ roster: "people", selected: "signalforge", stash: empty });
    // Back on the mind map, the open company brings up its globe.
    st().setView("mindmap");
    expect(st().roster).toBe("companies");
  });

  it("opening the provider finder on the people globe brings up the companies globe", () => {
    const st = () => useStore.getState();
    st().setRoster("people");
    st().openPanel("finder");
    expect(st()).toMatchObject({ roster: "companies", panel: "finder" });
  });

  it("See on the map opens the walk world with a person fly request, the person still open", () => {
    const st = () => useStore.getState();
    st().selectPerson("ada-lindqvist", { fly: false });
    const before = st().fly?.nonce ?? 0;
    st().seePersonOnMap("ada-lindqvist");
    expect(st()).toMatchObject({ view: "walk", person: "ada-lindqvist", selected: null, focusDistrict: null });
    expect(st().fly).toMatchObject({ kind: "person", slug: "ada-lindqvist" });
    expect(st().fly!.nonce).toBeGreaterThan(before);
    // "Walk there" in the walk view: a fresh request each time.
    const n = st().fly!.nonce;
    st().seePersonOnMap("ada-lindqvist");
    expect(st().fly!.nonce).toBeGreaterThan(n);
    st().seePersonOnMap("nobody");
    expect(st().person).toBe("ada-lindqvist");
  });

  it("See on the map drops an expanded sheet to its peek height, as a company's Walk there does", () => {
    const st = () => useStore.getState();
    st().selectPerson("marcus-oyelaran", { fly: false, expand: true });
    expect(st().sheetExpanded).toBe(true);
    st().seePersonOnMap("marcus-oyelaran");
    expect(st()).toMatchObject({ view: "walk", person: "marcus-oyelaran", sheetExpanded: false });
    // Walk there, in the walk view, after the visitor opened the full bio again.
    st().setSheetExpanded(true);
    st().seePersonOnMap("marcus-oyelaran");
    expect(st().sheetExpanded).toBe(false);
  });

  it("a company search left in the box never washes out the people globe, and comes back with the companies globe", () => {
    const st = () => useStore.getState();
    // Search "Signalforge" and pick the company: the text stays in the box.
    st().setQuery("Signalforge");
    st().select("signalforge", { fly: true });
    st().setRoster("people");
    expect(st()).toMatchObject({ roster: "people", query: "", person: null, selected: null });
    // ...the people globe has no search, so every person shows at full strength.
    st().setQuery("fundraising");
    st().setRoster("companies");
    expect(st()).toMatchObject({ roster: "companies", query: "Signalforge", selected: "signalforge" });
    // ...and the text typed on the people globe waits there.
    st().setRoster("people");
    expect(st()).toMatchObject({ roster: "people", query: "fundraising" });
  });

  it("a person picked while a company search is in the box sets that search aside with the companies globe", () => {
    const st = () => useStore.getState();
    st().setQuery("Signalforge");
    st().select("signalforge", { fly: true });
    st().selectPerson("ada-lindqvist", { fly: true });
    expect(st()).toMatchObject({ roster: "people", person: "ada-lindqvist", query: "" });
    st().setRoster("companies");
    expect(st()).toMatchObject({ selected: "signalforge", query: "Signalforge" });
  });

  it("a company picked in the search from the people globe keeps its search text in view", () => {
    const st = () => useStore.getState();
    st().selectPerson("ada-lindqvist", { fly: true });
    st().setQuery("Signalforge");
    st().select("signalforge", { fly: true });
    expect(st()).toMatchObject({ roster: "companies", selected: "signalforge", query: "Signalforge" });
    st().setRoster("people");
    expect(st()).toMatchObject({ roster: "people", person: "ada-lindqvist", query: "" });
  });

  it("in the list, a search pick shows the tab of the roster it belongs to", () => {
    const st = () => useStore.getState();
    st().setView("list");
    expect(st().roster).toBe("companies");
    st().selectPerson("marcus-oyelaran", { fly: true });
    expect(st()).toMatchObject({ roster: "people", person: "marcus-oyelaran" });
    st().select("signalforge", { fly: true });
    expect(st()).toMatchObject({ roster: "companies", selected: "signalforge", person: null });
  });
});
