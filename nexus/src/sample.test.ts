import { describe, expect, it } from "vitest";
import { ID_PATTERN, NEXUS_URL, onPublisherDomain } from "../../federation/protocol.ts";
import { offlineProof, validateManifest, validateRegistryEntry, verifyInstance } from "../../federation/validate.ts";
import { buildNetwork } from "./lib/network.ts";
import { SAMPLE_NETWORK, buildSampleNetwork } from "./sample.ts";

describe("sample network", () => {
  it("has every manifest pass the protocol's validateManifest", () => {
    const manifests = SAMPLE_NETWORK.instances.flatMap((i) => (i.manifest ? [i.manifest] : []));
    expect(manifests.length).toBeGreaterThanOrEqual(8);
    for (const m of manifests) expect(validateManifest(m), m.id).toEqual([]);
  });

  it("has valid registry entries, sample- ids and example.org addresses", () => {
    SAMPLE_NETWORK.instances.forEach((inst, i) => {
      expect(validateRegistryEntry(inst.entry, `${inst.entry.id}.json`)).toEqual([]);
      expect(inst.entry.id).toMatch(/^sample-/);
      expect(ID_PATTERN.test(inst.entry.id)).toBe(true);
      expect(inst.entry.url).toBe(`https://sample-${i + 1}.example.org`);
      expect(inst.entry.name).toMatch(/^Sample /);
    });
  });

  it("verifies the instances it marks verified, and only those link elsewhere that say so", () => {
    for (const inst of SAMPLE_NETWORK.instances) {
      if (!inst.manifest) continue;
      const v = verifyInstance(inst.entry, inst.manifest);
      if (inst.status === "no-backlink") expect(v.status).toBe("no-backlink");
      else {
        expect(v.status).toBe("verified");
        expect(inst.manifest.nexus).toBe(NEXUS_URL);
      }
    }
  });

  it("shows eight worlds with varied sizes, one of them unreachable", () => {
    const model = buildNetwork(SAMPLE_NETWORK);
    expect(model.worlds).toHaveLength(8);
    const sizes = model.worlds.map((w) => w.manifest.counts.companies);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(120);
    const districts = model.worlds.map((w) => w.manifest.counts.districts);
    expect(Math.min(...districts)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...districts)).toBeLessThanOrEqual(12);
    expect(model.worlds.filter((w) => w.status === "unreachable")).toHaveLength(1);
    expect(model.listed.filter((l) => !l.world).map((l) => l.status).sort()).toEqual(["no-backlink", "unconfirmed", "unreachable"]);
  });

  it("records a proof for every world, consistent with what can be checked offline", () => {
    const proofs = new Set<string>();
    for (const inst of SAMPLE_NETWORK.instances) {
      if (inst.status !== "verified") {
        expect(inst.proof).toBeNull();
        continue;
      }
      expect(inst.proof).not.toBeNull();
      proofs.add(inst.proof!);
      if (inst.proof === "domain") expect(onPublisherDomain(inst.manifest!.url, inst.manifest!.publisher.website)).toBe(true);
      if (inst.proof === "domain" || inst.proof === "maintainer") expect(offlineProof(inst.entry, inst.manifest!)).toBe(inst.proof);
      if (inst.proof === "link" || inst.proof === "dns") expect(offlineProof(inst.entry, inst.manifest!)).toBeNull();
    }
    expect([...proofs].sort()).toEqual(["dns", "domain", "link", "maintainer"]);
  });

  it("gives each instance's districts distinct colors", () => {
    for (const inst of SAMPLE_NETWORK.instances) {
      if (!inst.manifest) continue;
      const colors = inst.manifest.districts.map((d) => d.color.toLowerCase());
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildSampleNetwork())).toBe(JSON.stringify(SAMPLE_NETWORK));
  });
});
