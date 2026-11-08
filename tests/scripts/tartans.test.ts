import { describe, expect, test } from "bun:test";
import { matchTartans, parseCsv, TARTAN_SOURCES } from "@/scripts/lib/tartans";

describe("parseCsv", () => {
  test("quoted fields, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿Name,Category\r\n"Grant, Clan",Clan\r\n"Say ""hi""",x')).toEqual([
      { Name: "Grant, Clan", Category: "Clan" },
      { Name: 'Say "hi"', Category: "x" },
    ]);
  });

  test("newlines inside quotes; blank lines and missing fields", () => {
    expect(parseCsv('A,B,C\n"line 1\nline 2",b\n\n')).toEqual([{ A: "line 1\nline 2", B: "b", C: "" }]);
  });

  test("trims headers and values", () => {
    expect(parseCsv(" A , B \n 1 , 2 \n")).toEqual([{ A: "1", B: "2" }]);
  });
});

// ---------------------------------------------------------------------------

type Row = { Name: string; Category?: string; Threadcount: string; Palette: string };
const csv = (rows: Row[]) =>
  ["Name,Category,Threadcount,Palette", ...rows.map((r) => [r.Name, r.Category ?? "", r.Threadcount, r.Palette].map((v) => `"${v}"`).join(","))].join("\n");

const RG = "R#FF0000 G#00FF00";
const CSVS: Record<(typeof TARTAN_SOURCES)[number], string> = {
  "register-of-tartans": csv([
    { Name: "Grant", Category: "Clan", Threadcount: "R/8 G/8", Palette: RG },
    { Name: "Grant #2", Category: "Clan", Threadcount: "R/4 G/4", Palette: RG },
    { Name: "Grant Hunting", Category: "Clan", Threadcount: "G/8 B/8", Palette: "G#00ff00 B#0000ff" },
    { Name: "Grant (Anc)", Category: "Clan", Threadcount: "R/8 G/8", Palette: "R#aa0000 G#00aa00" },
    // Y is not defined here: it falls back to the most common Y in all sources.
    { Name: "Grant Modern", Category: "Clan", Threadcount: "R/8 Y/8", Palette: "R#ff0000" },
    { Name: "Grant Dress", Category: "Clan", Threadcount: "W/8 R/8", Palette: "W#ffffff R#ff0000" },
    { Name: "Grant Dress", Category: "Clan", Threadcount: "W/8 G/8", Palette: "W#ffffff G#00ff00" },
    { Name: "Grant Corporate", Category: "Corporate", Threadcount: "R/8 G/8", Palette: RG },
    { Name: "Grant", Category: "Clan", Threadcount: "not a sett", Palette: RG },
    { Name: "Grant (error)", Category: "Clan", Threadcount: "R/8 G/8", Palette: RG },
    { Name: "Grant of Somewhere", Category: "Clan", Threadcount: "R/8 G/8", Palette: RG },
    { Name: "Nobody", Category: "Clan", Threadcount: "R/8 G/8", Palette: RG },
  ]),
  // Same plain Grant again: a lower-priority source, so it is dropped.
  "tartans-authority": csv([{ Name: "Grant", Category: "Clan", Threadcount: "R/8 K/8", Palette: "R#ff0000 K#000000" }]),
  // House of Tartan puts the category at the end of the name.
  "house-of-tartan": csv([{ Name: "Stewart Clan Tartan Number: 1", Threadcount: "R/8 W/8", Palette: "R#ff0000 W#ffffff" }]),
  weddslist: csv([
    { Name: "(12) Unrelated", Threadcount: "Y/4 K/4", Palette: "Y#ffff00 K#000000" },
    { Name: "(13) Unrelated Too", Threadcount: "Y/4 K/4", Palette: "Y#ffff00 K#000000" },
    { Name: "(14) Odd One", Threadcount: "Y/4 K/4", Palette: "Y#eeee00 K#000000" },
  ]),
};

describe("matchTartans", async () => {
  const urls: string[] = [];
  const clanKeys = new Map([
    ["grant", ["grant"]],
    ["stewart", ["stewart", "royal-stewart"]],
  ]);
  const { tartans, report } = await matchTartans(clanKeys, async (source, url) => {
    urls.push(url);
    return CSVS[source];
  });
  const grant = tartans.get("grant")!;

  test("loads every source, pinned to one commit", () => {
    expect(urls).toHaveLength(TARTAN_SOURCES.length);
    for (const url of urls) expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/thetartan\/tartan-database\/[0-9a-f]{40}\//);
  });

  test("orders variants: plain, Modern, Ancient, Hunting, Dress", () => {
    expect(grant.map((t) => t.variant ?? "")).toEqual(["", "#2", "Modern", "Ancient", "Hunting", "Dress", "Dress"]);
  });

  test("keeps the highest-priority source for the same named tartan", () => {
    expect(grant[0]).toEqual({
      name: "Grant",
      threadcount: "R/8 G/8",
      palette: { G: "#00ff00", R: "#ff0000" },
      source: "register-of-tartans",
    });
    expect(grant.some((t) => t.source === "tartans-authority")).toBe(false);
  });

  test("bracketed abbreviations become the variant", () => {
    expect(grant.find((t) => t.variant === "Ancient")!.name).toBe("Grant (Anc)");
  });

  test("missing colours come from the most common hex for that code", () => {
    expect(grant.find((t) => t.variant === "Modern")!.palette).toEqual({ R: "#ff0000", Y: "#ffff00" });
  });

  test("qualified names ('Grant of Somewhere') do not match the bare clan", () => {
    expect(grant.some((t) => t.name.includes("Somewhere"))).toBe(false);
  });

  test("reports one name with several setts as ambiguous", () => {
    expect(report.ambiguous).toEqual([{ slug: "grant", variant: "Dress", setts: 2 }]);
  });

  test("House of Tartan names lose their category; shared names are reported", () => {
    expect(tartans.get("stewart")![0]).toMatchObject({ name: "Stewart", threadcount: "R/8 W/8", source: "house-of-tartan" });
    expect(tartans.get("royal-stewart")).toEqual(tartans.get("stewart")!);
    expect(report.multiClan).toEqual([{ tartan: "house-of-tartan: Stewart", slugs: ["royal-stewart", "stewart"] }]);
  });

  test("counts rows, matches, invalid setts and skipped categories", () => {
    expect(report.stats["register-of-tartans"]).toEqual({ rows: 12, matched: 7, invalid: 1, skippedCategory: 2 });
    expect(report.stats["weddslist"]).toEqual({ rows: 3, matched: 0, invalid: 0, skippedCategory: 0 });
  });
});
