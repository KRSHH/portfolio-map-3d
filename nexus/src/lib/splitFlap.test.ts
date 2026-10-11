import { describe, expect, it } from "vitest";
import { BOARD_STAGGER_MS, CASCADE_EVERY_MS, DIGIT_STAGGER_MS, FLAPS, FLAP_MS, alignFrom, flapSequence, startAt } from "./splitFlap.ts";

describe("flapSequence", () => {
  it("refreshes a digit by turning the drum a few flaps and landing where it was", () => {
    expect(flapSequence("4", "4", 3)).toEqual(["2", "3", "4"]);
    // Counting up across the drum's seam.
    expect(flapSequence("0", "0", 3)).toEqual(["8", "9", "0"]);
    expect(flapSequence("1", "1", 5)).toEqual(["7", "8", "9", "0", "1"]);
  });

  it("turns a changed digit forward around the drum, as far as it has to and no further", () => {
    expect(flapSequence("5", "6", 6)).toEqual(["6"]);
    expect(flapSequence("9", "2", 6)).toEqual(["0", "1", "2"]);
    // Farther than the cap: the last flaps before the new digit.
    expect(flapSequence("1", "9", 4)).toEqual(["6", "7", "8", "9"]);
  });

  it("turns a new digit up from a blank, starting at 0", () => {
    expect(flapSequence(" ", "0", 6)).toEqual(["0"]);
    expect(flapSequence(" ", "2", 6)).toEqual(["0", "1", "2"]);
  });

  it("always lands on the digit, one flap at a time in drum order", () => {
    for (const from of [" ", ..."0123456789"]) {
      for (const to of "0123456789") {
        for (const flaps of [1, 3, 5, 6]) {
          const seq = flapSequence(from, to, flaps);
          expect(seq.at(-1)).toBe(to);
          expect(seq.length).toBeGreaterThan(0);
          expect(seq.length).toBeLessThanOrEqual(flaps);
          for (let i = 1; i < seq.length; i++) expect((Number(seq[i]) - Number(seq[i - 1]) + 10) % 10).toBe(1);
        }
      }
    }
  });

  it("does not turn anything off the drum", () => {
    expect(flapSequence(",", ",", 4)).toEqual([]);
    expect(flapSequence("1", "K", 4)).toEqual(["K"]);
  });
});

describe("alignFrom", () => {
  it("lines the old number up with the new one on its last digit", () => {
    expect(alignFrom("29", "31")).toEqual(["2", "9"]);
    expect(alignFrom("29", "105")).toEqual([" ", "2", "9"]);
    expect(alignFrom("105", "29")).toEqual(["0", "5"]);
    expect(alignFrom("", "7")).toEqual([" "]);
  });
});

describe("the cascade's timing", () => {
  it("sweeps the boards in order, each board left to right", () => {
    expect(startAt(0, 0)).toBe(0);
    expect(startAt(0, 2)).toBe(2 * DIGIT_STAGGER_MS);
    expect(startAt(1, 0)).toBe(BOARD_STAGGER_MS);
    expect(startAt(1, 1)).toBeGreaterThan(startAt(1, 0));
    expect(startAt(2, 0)).toBeGreaterThan(startAt(1, 0));
  });

  it("finishes a full page of boards well before the next refresh", () => {
    // Twelve boards of seven digits, the last digit turning the most flaps a change can take.
    const last = startAt(11, 6) + FLAPS.change * FLAP_MS;
    expect(last).toBeLessThan(CASCADE_EVERY_MS / 2);
  });

  it("keeps each fold long enough to see, and a refresh a few flaps long", () => {
    expect(FLAP_MS).toBeGreaterThanOrEqual(100);
    expect(FLAPS.min).toBeGreaterThanOrEqual(2);
    expect(FLAPS.max).toBeGreaterThanOrEqual(FLAPS.min);
    expect(FLAPS.change).toBeLessThan(10);
  });
});
