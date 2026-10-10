import { describe, expect, it } from "vitest";
import { CLOUD_TOP, PUFF_SQUEEZE, cumulusField } from "./sky";

describe("cumulusField", () => {
  const field = cumulusField();

  it("comes out the same on every visit, and differs by seed", () => {
    expect(cumulusField()).toEqual(field);
    expect(cumulusField("another-sky")).not.toEqual(field);
  });

  it("spreads the clouds around the whole horizon, none piled on another", () => {
    const us = field.map((c) => c.u);
    expect([...us].sort((a, b) => a - b)).toEqual(us);
    expect(us[0]).toBeGreaterThanOrEqual(0);
    expect(us[us.length - 1]).toBeLessThan(1);
    for (let i = 1; i < us.length; i++) expect(us[i] - us[i - 1]).toBeGreaterThan(0.2 / field.length);
    // The wrap-around gap, too.
    expect(1 - us[us.length - 1] + us[0]).toBeLessThan(2 / field.length);
  });

  it("keeps most clouds low on the horizon, and every cloud inside the panorama", () => {
    expect(field.filter((c) => c.base < 0.15).length).toBeGreaterThanOrEqual(field.length / 2);
    for (const c of field) {
      expect(c.base).toBeGreaterThan(0);
      expect(c.base + c.h).toBeLessThan(1);
      expect(c.puffs.length).toBeGreaterThanOrEqual(5);
      for (const q of c.puffs) {
        expect(Math.abs(q.x)).toBeLessThan(0.55);
        expect(q.r).toBeGreaterThan(0);
      }
    }
  });

  it("paints puffs narrower than tall, so they look round in the sky", () => {
    expect(CLOUD_TOP).toBeGreaterThan(0);
    expect(CLOUD_TOP).toBeLessThan(1);
    expect(PUFF_SQUEEZE).toBeGreaterThan(0.3);
    expect(PUFF_SQUEEZE).toBeLessThan(1);
  });
});
