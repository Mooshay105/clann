// Sanity checks on the committed data files, so a bad `bun run pull-data` is caught before deploy.
import { describe, expect, test } from "bun:test";
import clansFile from "@/data/clans.json";
import namesFile from "@/data/names.json";
import { normName } from "@/lib/normalise";
import { colorsInThreadcount, parseSett } from "@/lib/tartan/sett";
import type { ClansFile, NamesFile } from "@/lib/types";

const { clans } = clansFile as ClansFile;
const { names } = namesFile as NamesFile;
const slugs = new Set(clans.map((c) => c.slug));

describe("data/clans.json", () => {
  test("has clans with unique, URL-safe slugs", () => {
    expect(clans.length).toBeGreaterThan(300);
    expect(slugs.size).toBe(clans.length);
    for (const c of clans) expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("every clan has a name and a Wikipedia URL", () => {
    for (const c of clans) {
      expect(c.name.trim()).not.toBe("");
      expect(c.wikipediaUrl).toStartWith("https://en.wikipedia.org/wiki/");
    }
  });

  test("references with a slug point at clans that exist", () => {
    for (const c of clans)
      for (const ref of [...c.parents, ...c.descendants, ...c.septs, ...c.branches, ...c.allies, ...c.rivals])
        if (ref.slug) expect(slugs).toContain(ref.slug);
  });

  test("every tartan parses and has a colour for each code it uses", () => {
    for (const c of clans)
      for (const t of c.tartans) {
        expect(parseSett(t.threadcount)).not.toBeNull();
        for (const code of colorsInThreadcount(t.threadcount)) expect(t.palette[code]).toMatch(/^#[0-9a-f]{6}$/);
      }
  });

  test("seat coordinates are real latitudes and longitudes", () => {
    for (const c of clans)
      if (c.seatCoords) {
        expect(Math.abs(c.seatCoords.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(c.seatCoords.lon)).toBeLessThanOrEqual(180);
      }
  });
});

describe("data/names.json", () => {
  test("keys are unique and normalised", () => {
    expect(new Set(names.map((n) => n.key)).size).toBe(names.length);
    for (const n of names) expect(n.key).toBe(normName(n.key));
  });

  test("every name lists its display spelling and at least one clan that exists", () => {
    for (const n of names) {
      expect(n.spellings).toContain(n.name);
      expect(n.clans.length).toBeGreaterThan(0);
      for (const c of n.clans) {
        expect(slugs).toContain(c.slug);
        expect(["clan", "sept"]).toContain(c.as);
      }
    }
  });
});
