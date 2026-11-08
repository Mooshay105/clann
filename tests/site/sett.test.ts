import { describe, expect, test } from "bun:test";
import { colorsInThreadcount, parseSett, parseTokens } from "@/lib/tartan/sett";

describe("parseTokens", () => {
  test("reads colour, pivot and count", () => {
    expect(parseTokens("B/24 W4 R/2")).toEqual([
      { color: "B", count: 24, pivot: true },
      { color: "W", count: 4, pivot: false },
      { color: "R", count: 2, pivot: true },
    ]);
  });

  test("accepts lower case, extra whitespace and fractional counts", () => {
    expect(parseTokens("  b24\t lg1.5 ")).toEqual([
      { color: "B", count: 24, pivot: false },
      { color: "LG", count: 1.5, pivot: false },
    ]);
  });

  test("rejects empty or malformed threadcounts", () => {
    expect(parseTokens("")).toBeNull();
    expect(parseTokens("   ")).toBeNull();
    expect(parseTokens("B24 nonsense")).toBeNull();
    expect(parseTokens("B24 24")).toBeNull();
    expect(parseTokens("B0")).toBeNull();
  });
});

describe("parseSett", () => {
  test("reflects a symmetric sett around both pivots", () => {
    const sett = parseSett("B/24 W4 B24 R2 K24 G24 W/2")!;
    expect(sett.symmetric).toBe(true);
    expect(sett.stripes.map((s) => `${s.color}${s.count}`).join(" ")).toBe(
      "B24 W4 B24 R2 K24 G24 W2 G24 K24 R2 B24 W4",
    );
    expect(sett.total).toBe(182);
  });

  test("repeats an asymmetric sett as written", () => {
    const sett = parseSett("G24 A12 G12 R30 K2 R2 K4")!;
    expect(sett.symmetric).toBe(false);
    expect(sett.stripes).toHaveLength(7);
    expect(sett.total).toBe(86);
  });

  test("merges neighbouring stripes of the same colour", () => {
    expect(parseSett("R4 R6 G2")!.stripes).toEqual([
      { color: "R", count: 10 },
      { color: "G", count: 2 },
    ]);
  });

  test("merges across the wrap seam", () => {
    expect(parseSett("R4 G2 R6")!.stripes).toEqual([
      { color: "R", count: 10 },
      { color: "G", count: 2 },
    ]);
  });

  test("a single pivot token is not treated as symmetric", () => {
    const sett = parseSett("B/24")!;
    expect(sett.symmetric).toBe(false);
    expect(sett.total).toBe(24);
  });

  test("total always equals the sum of the stripes", () => {
    for (const tc of ["B/24 W4 B24 R2 K24 G24 W/2", "K4 R24 K24 Y4", "R/8 G/8"]) {
      const sett = parseSett(tc)!;
      expect(sett.total).toBe(sett.stripes.reduce((n, s) => n + s.count, 0));
    }
  });

  test("returns null for invalid input", () => {
    expect(parseSett("not a sett")).toBeNull();
  });
});

describe("colorsInThreadcount", () => {
  test("lists colour codes once, in first-seen order", () => {
    expect(colorsInThreadcount("B24 W4 B24 R2 W4")).toEqual(["B", "W", "R"]);
  });

  test("is empty for invalid input", () => {
    expect(colorsInThreadcount("???")).toEqual([]);
  });
});
