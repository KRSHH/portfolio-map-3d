import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { applyUrlState, parseUrl, urlSearch } from "./url";

const initial = useStore.getState();
const reset = () => useStore.setState(initial, true);

describe("parseUrl", () => {
  it("reads a person, the people globe and the people list", () => {
    expect(parseUrl("?person=ada-lindqvist")).toMatchObject({ person: "ada-lindqvist", roster: null, company: null });
    expect(parseUrl("?globe=people").roster).toBe("people");
    expect(parseUrl("?view=list&list=people").roster).toBe("people");
    expect(parseUrl("?view=list&list=people")).toMatchObject({ view: "list" });
  });

  it("drops anything unknown", () => {
    expect(parseUrl("?person=nobody-here&globe=planets&view=space&company=nobody&district=moon&need=magic&for=dragons")).toEqual({
      view: null, company: null, person: null, district: null, need: null, forIndustry: null, query: null, roster: null,
    });
    // A company slug is not a person, and a person slug is not a company.
    expect(parseUrl("?person=signalforge&company=ada-lindqvist")).toMatchObject({ person: null, company: null });
  });

  it("reads a company, a district, the provider finder and the search", () => {
    expect(parseUrl("?view=walk&company=signalforge&district=health&need=cybersecurity&for=healthcare&q=video")).toMatchObject({
      view: "walk", company: "signalforge", district: "health", need: "cybersecurity", forIndustry: "healthcare", query: "video",
    });
    expect(parseUrl(`?q=${"x".repeat(200)}`).query).toHaveLength(80);
  });

  it("reads the framework's parameter names, not the production map's short ones", () => {
    expect(parseUrl("?m=signalforge&d=health&coach=ada-lindqvist")).toMatchObject({ company: null, district: null, person: null });
  });
});

describe("urlSearch", () => {
  const base = { view: "mindmap" as const, roster: "companies" as const, selected: null, person: null, focusDistrict: null, panel: null, finder: { service: null, industry: null, text: "" }, query: "" };

  it("writes the people globe and the open person", () => {
    expect(urlSearch({ ...base, roster: "people", person: "ada-lindqvist" }, "")).toBe("globe=people&person=ada-lindqvist");
  });

  it("writes the list's people tab, and nothing for the roster in the walk view", () => {
    expect(urlSearch({ ...base, view: "list", roster: "people" }, "")).toBe("view=list&list=people");
    expect(urlSearch({ ...base, view: "walk", roster: "people", person: "ada-lindqvist" }, "")).toBe("view=walk&person=ada-lindqvist");
  });

  it("writes the open company, the district focus, the finder and the search", () => {
    expect(urlSearch({ ...base, view: "walk", selected: "signalforge", focusDistrict: "health", query: " video " }, "")).toBe("view=walk&company=signalforge&district=health&q=video");
    expect(urlSearch({ ...base, panel: "finder", finder: { service: "cybersecurity", industry: "healthcare", text: "" } }, "")).toBe("need=cybersecurity&for=healthcare");
    // The finder's choices are written only while its panel is open.
    expect(urlSearch({ ...base, finder: { service: "cybersecurity", industry: null, text: "" } }, "")).toBe("");
  });

  it("writes nothing for the default state and keeps the test switches", () => {
    expect(urlSearch(base, "")).toBe("");
    expect(urlSearch(base, "?live=off&diag")).toBe("live=off&diag=");
    expect(urlSearch(base, "?debug&from=nexus")).toBe("debug=");
  });
});

describe("deep links into the store", () => {
  beforeEach(reset);

  it("?person= opens the person on the people globe", () => {
    applyUrlState(parseUrl("?person=ada-lindqvist"));
    expect(useStore.getState()).toMatchObject({ view: "mindmap", roster: "people", person: "ada-lindqvist", selected: null });
    expect(useStore.getState().fly).toMatchObject({ kind: "person", slug: "ada-lindqvist" });
  });

  it("opens a person in the list and in the walk world", () => {
    applyUrlState(parseUrl("?view=list&list=people&person=renee-castillo"));
    expect(useStore.getState()).toMatchObject({ view: "list", roster: "people", person: "renee-castillo" });
    reset();
    applyUrlState(parseUrl("?view=walk&person=marcus-oyelaran"));
    expect(useStore.getState()).toMatchObject({ view: "walk", person: "marcus-oyelaran" });
    expect(useStore.getState().fly).toMatchObject({ kind: "person", slug: "marcus-oyelaran" });
  });

  it("?company= opens the company and flies to it", () => {
    applyUrlState(parseUrl("?company=signalforge&district=ai-data"));
    expect(useStore.getState()).toMatchObject({ roster: "companies", selected: "signalforge", focusDistrict: "ai-data" });
    expect(useStore.getState().fly).toMatchObject({ kind: "company", slug: "signalforge" });
  });

  it("?need= and ?for= open the provider finder", () => {
    applyUrlState(parseUrl("?need=cybersecurity&for=healthcare"));
    expect(useStore.getState()).toMatchObject({ panel: "finder", finder: { service: "cybersecurity", industry: "healthcare" } });
  });

  it("?globe=people with a company opens the people globe and keeps the company for the way back", () => {
    applyUrlState(parseUrl("?globe=people&company=signalforge"));
    expect(useStore.getState()).toMatchObject({ roster: "people", selected: null });
    useStore.getState().setRoster("companies");
    expect(useStore.getState().selected).toBe("signalforge");
  });

  it("keeps the search text on the globe the link opens", () => {
    applyUrlState(parseUrl("?globe=people&q=fundraising"));
    expect(useStore.getState()).toMatchObject({ roster: "people", query: "fundraising" });
    reset();
    applyUrlState(parseUrl("?person=ada-lindqvist&q=coach"));
    expect(useStore.getState()).toMatchObject({ roster: "people", person: "ada-lindqvist", query: "coach" });
    expect(urlSearch(useStore.getState(), "")).toBe("globe=people&person=ada-lindqvist&q=coach");
  });

  it("round-trips: what the store writes, it reads back", () => {
    applyUrlState(parseUrl("?globe=people&person=ada-lindqvist"));
    const qs = urlSearch(useStore.getState(), "");
    expect(qs).toBe("globe=people&person=ada-lindqvist");
    reset();
    applyUrlState(parseUrl(`?${qs}`));
    expect(useStore.getState()).toMatchObject({ roster: "people", person: "ada-lindqvist" });
  });
});
