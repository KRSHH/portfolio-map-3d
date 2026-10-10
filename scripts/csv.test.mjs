import { describe, expect, it } from "vitest";
import { parseCsv, recordsOf } from "./csv.mjs";

describe("parseCsv", () => {
  it("reads plain fields, CRLF and LF records, and drops a byte-order mark", () => {
    expect(parseCsv("a,b,c\r\n1,2,3\n4,5,6")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(parseCsv("﻿Track,Company\nFinTech,DubPay")).toEqual([
      ["Track", "Company"],
      ["FinTech", "DubPay"],
    ]);
    // A lone CR ends a record too.
    expect(parseCsv("a\rb")).toEqual([["a"], ["b"]]);
  });

  it("keeps commas, quotes and line breaks inside quoted fields, verbatim", () => {
    expect(parseCsv('name,bio\n"Acme, Inc.","He said ""hi"".\nSecond line, still the bio."')).toEqual([
      ["name", "bio"],
      ["Acme, Inc.", 'He said "hi".\nSecond line, still the bio.'],
    ]);
    // Nothing is trimmed: spaces are part of the cell.
    expect(parseCsv(" a , b ")).toEqual([[" a ", " b "]]);
  });

  it("ends the last record at a final line break, and keeps empty cells", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b,\n")).toEqual([["a", "b", ""]]);
    expect(parseCsv('"",x')).toEqual([["", "x"]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("fails closed on malformed quoting, naming the line", () => {
    expect(() => parseCsv('a,b\n1,2"3')).toThrow(/line 2: a quote inside an unquoted field/);
    expect(() => parseCsv('a,"b"c')).toThrow(/line 1: text after a closing quote/);
    expect(() => parseCsv('a\n"open\nstill open')).toThrow(/line 2: a quoted field is never closed/);
  });
});

describe("recordsOf", () => {
  it("keys every record by the header", () => {
    expect(recordsOf(parseCsv("Track,Company\nFinTech,DubPay\nHealthTech,Thrive25"))).toEqual({
      header: ["Track", "Company"],
      records: [
        { Track: "FinTech", Company: "DubPay" },
        { Track: "HealthTech", Company: "Thrive25" },
      ],
    });
  });

  it("refuses a repeated column name or a record of the wrong length", () => {
    expect(() => recordsOf(parseCsv("a,a\n1,2"))).toThrow(/repeats a column name/);
    expect(() => recordsOf(parseCsv("a,b\n1,2,3"))).toThrow(/3 cells, but the header has 2/);
    expect(() => recordsOf([])).toThrow(/no header row/);
  });
});
