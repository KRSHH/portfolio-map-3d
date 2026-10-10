import { describe, expect, it } from "vitest";
import { callTool, type AgentTool } from "../../federation/agent.ts";
import { nexusTools } from "./agent.ts";
import { buildNetwork } from "./lib/network.ts";
import { SAMPLE_NETWORK } from "./sample.ts";

const model = buildNetwork(SAMPLE_NETWORK);
const opened: string[] = [];
const tools = nexusTools(model, (id) => opened.push(id));
const call = (name: string, input: unknown) => callTool(tools.find((t) => t.name === name) as AgentTool, input);

describe("the Nexus's WebMCP tools", () => {
  it("list_maps lists every world, and only worlds", async () => {
    const r = (await call("list_maps", {})) as { maps: { id: string; size: string }[] };
    expect(r.maps.map((m) => m.id)).toEqual(model.worlds.map((w) => w.id));
    expect(r.maps[0].size).toMatch(/^\d+ .+ in \d+ .+$/);
  });

  it("search_network finds companies across maps, with links into each map", async () => {
    const r = (await call("search_network", { query: "robotics" })) as { totalCompanies: number; maps: { companies: { link: string }[] }[] };
    expect(r.totalCompanies).toBeGreaterThan(0);
    for (const m of r.maps) for (const c of m.companies) expect(c.link).toMatch(/^https:\/\/sample-\d+\.example\.org\/\?from=nexus/);
  });

  it("open_map turns the Nexus to a world it has", async () => {
    const id = model.worlds[0].id;
    await call("open_map", { id });
    expect(opened).toEqual([id]);
    await expect(call("open_map", { id: "not-a-world" })).rejects.toThrow(/No map in the network/);
  });
});
