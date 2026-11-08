import { describe, expect, test } from "bun:test";
import { normName } from "@/lib/normalise";

describe("normName", () => {
  test("lower-cases and trims", () => {
    expect(normName("  Grant  ")).toBe("grant");
  });

  test("treats Mac, Mc and M' the same", () => {
    expect(normName("MacDonald")).toBe("macdonald");
    expect(normName("McDonald")).toBe("macdonald");
    expect(normName("M'Donald")).toBe("macdonald");
    expect(normName("M’Donald")).toBe("macdonald");
  });

  test("joins a spaced Mac/Mc prefix", () => {
    expect(normName("Mac Donald")).toBe("macdonald");
    expect(normName("Mc Intosh")).toBe("macintosh");
  });

  test("leaves names that only start with 'mac' alone", () => {
    expect(normName("Mack")).toBe("mack");
  });

  test("strips accents", () => {
    expect(normName("Ó Néill")).toBe("o neill");
  });

  test("drops apostrophes inside names", () => {
    expect(normName("O'Brien")).toBe("obrien");
  });

  test("spells out & and collapses punctuation to single spaces", () => {
    expect(normName("Smith & Sons")).toBe("smith and sons");
    expect(normName("Stewart, of--Appin!")).toBe("stewart of appin");
  });

  test("every spelling of a grouped name normalises the same way", () => {
    expect(new Set(["McGrouther", "MacGrouther", "M'Grouther"].map(normName)).size).toBe(1);
  });
});
