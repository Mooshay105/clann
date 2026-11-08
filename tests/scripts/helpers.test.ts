import { describe, expect, test } from "bun:test";
import {
  chunk,
  clanKey,
  dedupeRefs,
  deepMerge,
  formatTime,
  ordered,
  qid,
  refSort,
  round,
  slugify,
  wikiUrl,
} from "@/scripts/lib/helpers";
import type { Clan } from "@/lib/types";

describe("wikiUrl", () => {
  test("underscores spaces and keeps , : / readable", () => {
    expect(wikiUrl("Clan Donald")).toBe("https://en.wikipedia.org/wiki/Clan_Donald");
    expect(wikiUrl("Clan MacDonald of Clanranald, x: a/b")).toBe(
      "https://en.wikipedia.org/wiki/Clan_MacDonald_of_Clanranald,_x:_a/b",
    );
  });

  test("percent-encodes everything else", () => {
    expect(wikiUrl("Ó Néill")).toBe("https://en.wikipedia.org/wiki/%C3%93_N%C3%A9ill");
  });
});

describe("chunk / qid / round", () => {
  test("chunk splits into groups of n", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  test("qid strips the entity prefix", () => {
    expect(qid("http://www.wikidata.org/entity/Q42")).toBe("Q42");
  });

  test("round keeps five decimals", () => {
    expect(round(57.1234567)).toBe(57.12346);
  });
});

describe("formatTime", () => {
  const t = "+1745-04-16T00:00:00Z";

  test("day, month and year precision", () => {
    expect(formatTime(t, 11)).toBe("1745-04-16");
    expect(formatTime(t, 10)).toBe("1745-04");
    expect(formatTime(t, 9)).toBe("1745");
  });

  test("decade precision", () => {
    expect(formatTime(t, 8)).toBe("1740s");
  });

  test("century precision with the right ordinal", () => {
    expect(formatTime("+1300-00-00T00:00:00Z", 7)).toBe("13th century");
    expect(formatTime("+1301-00-00T00:00:00Z", 7)).toBe("14th century");
    expect(formatTime("+2001-00-00T00:00:00Z", 7)).toBe("21st century");
    expect(formatTime("+2101-00-00T00:00:00Z", 7)).toBe("22nd century");
    expect(formatTime("+0201-00-00T00:00:00Z", 7)).toBe("3rd century");
    expect(formatTime("+1101-00-00T00:00:00Z", 7)).toBe("12th century");
    expect(formatTime("+1001-00-00T00:00:00Z", 7)).toBe("11th century");
  });

  test("millennium precision", () => {
    expect(formatTime("+1500-00-00T00:00:00Z", 6)).toBe("2. millennium");
  });

  test("BC dates", () => {
    expect(formatTime("-0150-00-00T00:00:00Z", 9)).toBe("150 BC");
    expect(formatTime("-0150-03-01T00:00:00Z", 11)).toBe("-0150-03-01");
  });

  test("unparseable values pass through", () => {
    expect(formatTime("sometime", 9)).toBe("sometime");
  });
});

describe("slugify / clanKey", () => {
  test("slugify", () => {
    expect(slugify("Clan MacDonald of Clanranald")).toBe("clan-macdonald-of-clanranald");
    expect(slugify("Ó Néill & Sons")).toBe("o-neill-and-sons");
    expect(slugify("O'Brien")).toBe("obrien");
    expect(slugify("--Grant--")).toBe("grant");
  });

  test("clanKey drops 'Clan' and a trailing (qualifier)", () => {
    expect(clanKey("Clan Donald (disambiguation)")).toBe("donald");
    expect(clanKey("Clan McLeod")).toBe("macleod");
    expect(clanKey("Stewart of Appin")).toBe("stewart of appin");
  });
});

describe("deepMerge", () => {
  test("merges nested objects", () => {
    expect(deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 4, e: 5 } })).toEqual({ a: 1, b: { c: 2, d: 4, e: 5 } });
  });

  test("null deletes a key", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 });
  });

  test("arrays and scalars are replaced, not merged", () => {
    expect(deepMerge({ a: [1, 2], b: "x" }, { a: [3], b: "y" })).toEqual({ a: [3], b: "y" });
  });

  test("undefined patch keeps the base; does not mutate the base", () => {
    const base = { a: { b: 1 } };
    expect(deepMerge(base, undefined)).toBe(base);
    deepMerge(base, { a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});

describe("ordered", () => {
  test("known keys in a fixed order, unknown keys last and sorted, undefined dropped", () => {
    const clan = {
      zeta: 1,
      tartans: [],
      name: "Clan Grant",
      motto: undefined,
      slug: "grant",
      alpha: 2,
    } as unknown as Clan;
    expect(Object.keys(ordered(clan))).toEqual(["slug", "name", "tartans", "alpha", "zeta"]);
  });
});

describe("refSort / dedupeRefs", () => {
  test("refs with a slug come first, then by name", () => {
    const refs = [{ name: "Zed" }, { slug: "b", name: "B" }, { name: "Abe" }, { slug: "a", name: "A" }];
    expect(refs.sort(refSort).map((r) => r.name)).toEqual(["A", "B", "Abe", "Zed"]);
  });

  test("dedupes by slug, or by name (case-insensitive) when unresolved", () => {
    expect(
      dedupeRefs([
        { slug: "grant", name: "Clan Grant" },
        { slug: "grant", name: "Grant" },
        { name: "Allan" },
        { name: "allan" },
      ]),
    ).toEqual([{ slug: "grant", name: "Clan Grant" }, { name: "Allan" }]);
  });
});
