import { describe, expect, it } from "vitest";
import { callTool, type AgentTool } from "../federation/agent.ts";
import { mapTools } from "./agent";
import { COMPANIES, DISTRICTS, PEOPLE } from "./data/catalog";
import { useStore } from "./state/store";

const tools = mapTools();
const call = (name: string, input: unknown) => callTool(tools.find((t) => t.name === name) as AgentTool, input);

describe("the map's WebMCP tools", () => {
  it("are read-only but for opening a company, and worded with the site's labels", () => {
    expect(tools.map((t) => t.name)).toEqual(["search_companies", "get_company", "list_districts", "open_company", "list_services", "find_providers"]);
    for (const t of tools) expect(t.hints.readOnly ?? false).toBe(t.name !== "open_company");
    expect(tools[0].title).toBe("Search the companies");
  });

  it("search_companies finds companies, never people, with links on the map", async () => {
    const r = (await call("search_companies", { query: "signalforge" })) as { total: number; results: { slug: string; link: string }[] };
    expect(r.results[0].slug).toBe("signalforge");
    expect(r.results[0].link).toBe("https://wearenexus.xyz/example/?company=signalforge");
    // A person's name finds nothing here: the roster is not linked to companies.
    const person = PEOPLE[0].name.split(" ")[0];
    const none = (await call("search_companies", { query: person })) as { results: { slug: string }[] };
    expect(none.results.every((x) => COMPANIES.some((c) => c.slug === x.slug))).toBe(true);
  });

  it("search_companies keeps to one district when asked", async () => {
    const district = DISTRICTS[0].slug;
    const r = (await call("search_companies", { query: "a", district, limit: 50 })) as { results: { slug: string }[] };
    for (const x of r.results) {
      const c = COMPANIES.find((m) => m.slug === x.slug)!;
      expect(c.district === district || c.secondaryDistricts.includes(district)).toBe(true);
    }
  });

  it("get_company carries what the map shows and no sources", async () => {
    const c = (await call("get_company", { slug: "brightpath-care" })) as { name: string; district: string; founders: unknown[] };
    expect(c).toMatchObject({ name: "Brightpath Care", district: "Health & Life Sciences" });
    expect(c.founders[0]).toEqual({ name: "Maya Ortiz", title: "CEO and Co-Founder" });
    expect(JSON.stringify(c)).not.toMatch(/"sources"|"source"|"retrieved"|descriptionSource/);
    await expect(call("get_company", { slug: "no-such-company" })).rejects.toThrow(/No company has the slug/);
  });

  it("list_districts counts every company once", async () => {
    const r = (await call("list_districts", {})) as { districts: { count: number }[] };
    expect(r.districts.reduce((n, d) => n + d.count, 0)).toBe(COMPANIES.length);
  });

  it("find_providers takes a service by slug or name and labels results as suggestions", async () => {
    const bySlug = (await call("find_providers", { service: "data-analytics" })) as { kind: string; results: { reasons: string[] }[] };
    expect(bySlug.kind).toMatch(/suggestions/);
    expect(bySlug.results.length).toBeGreaterThan(0);
    for (const r of bySlug.results) expect(r.reasons.length).toBeGreaterThan(0);
    await expect(call("find_providers", { service: "time travel" })).rejects.toThrow(/not one of the map's services/);
  });

  it("open_company selects the company on the map", async () => {
    await call("open_company", { slug: "signalforge" });
    expect(useStore.getState().selected).toBe("signalforge");
    await expect(call("open_company", { slug: "Signalforge!" })).rejects.toThrow(/does not fit/);
  });
});
