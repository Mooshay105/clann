import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ClanEntry, listNames } from "@/components/ClanEntry";
import { search } from "@/components/Finder";
import { labels } from "@/components/Tartan";
import TartanCloth from "@/components/TartanCloth";
import type { ClanSummary, SurnameHit } from "@/lib/clans";
import type { ClanTartan } from "@/lib/types";

const clan = (slug: string, name: string, motto?: string): ClanSummary => ({
  slug,
  name,
  chiefed: true,
  ...(motto ? { motto } : {}),
});

const clans = [
  clan("macdonald", "Clan MacDonald", "Per mare per terras"),
  clan("donald", "Clan Donald"),
  clan("macdonell-of-glengarry", "Clan MacDonell of Glengarry"),
  clan("grant", "Clan Grant", "Stand fast"),
  clan("macleod", "Clan MacLeod", "Hold fast"),
];
const surnames: SurnameHit[] = [
  { key: "macgrouther", name: "McGrouther", spellings: ["MacGruther", "Magruder"], clans: ["gregor", "drummond"] },
  { key: "donaldson", name: "Donaldson", spellings: [], clans: ["macdonald"] },
];

describe("Finder search", () => {
  const ids = (q: string) => search(q, clans, surnames).map((r) => (r.kind === "clan" ? r.clan.slug : `name:${r.hit.key}`));

  test("empty query finds nothing", () => {
    expect(search("", clans, surnames)).toEqual([]);
  });

  test("exact clan name ranks first", () => {
    expect(ids("donald")[0]).toBe("donald");
  });

  test("prefix matches rank above word and substring matches", () => {
    expect(ids("macdon")).toEqual(["macdonald", "macdonell-of-glengarry"]);
    // "glen" starts a word in "macdonell of glengarry".
    expect(ids("glen")).toEqual(["macdonell-of-glengarry"]);
  });

  test("short queries skip substring matches", () => {
    expect(ids("ld")).toEqual([]);
    expect(ids("ald")).toContain("macdonald");
  });

  test("mottoes match only with 4+ letters", () => {
    expect(ids("fast")).toEqual(["grant", "macleod"]);
    expect(ids("fas")).toEqual([]);
  });

  test("surnames match by any spelling (already normalised query)", () => {
    expect(ids("magruder")).toEqual(["name:macgrouther"]);
    expect(ids("macgrouther")).toEqual(["name:macgrouther"]);
  });

  test("an exact surname beats a clan prefix match", () => {
    const results = search("donaldson", clans, surnames);
    expect(results[0]).toMatchObject({ kind: "surname", score: 90 });
  });
});

describe("listNames", () => {
  test("joins names in English", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("Tartan variant labels", () => {
  const t = (name: string, variant?: string, source = "register-of-tartans"): ClanTartan => ({
    name,
    ...(variant ? { variant } : {}),
    threadcount: "R4 G4",
    palette: {},
    source,
  });

  test("uses the variant, or 'Standard'", () => {
    expect(labels([t("Grant"), t("Grant", "Hunting"), t("Grant", "#2")])).toEqual(["Standard", "Hunting", "Standard #2"]);
  });

  test("adds the name when variants clash across names", () => {
    expect(labels([t("Grant"), t("Grant of Rothiemurchus")])).toEqual([
      "Standard (Grant)",
      "Standard (Grant of Rothiemurchus)",
    ]);
  });

  test("adds the source when names also clash", () => {
    expect(labels([t("Grant", undefined, "register-of-tartans"), t("Grant", undefined, "weddslist")])).toEqual([
      "Standard (Scottish Register of Tartans)",
      "Standard (Weddslist)",
    ]);
  });

  test("numbers labels that are still the same", () => {
    expect(labels([t("Grant"), t("Grant")])).toEqual(["Standard 1", "Standard 2"]);
  });
});

describe("TartanCloth", () => {
  const props = { label: "Test tartan", width: 200, height: 200, settPx: 160, idPrefix: "t:1" };

  test("renders an accessible SVG with one stripe per sett colour", () => {
    const html = renderToStaticMarkup(
      <TartanCloth {...props} threadcount="R/8 G/8" palette={{ R: "#ff0000", G: "#00ff00" }} />,
    );
    expect(html).toStartWith("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Test tartan"');
    expect(html).toContain("<title>Test tartan</title>");
    expect(html).toContain('fill="#ff0000"');
    expect(html).toContain('fill="#00ff00"');
    // idPrefix is sanitised for use in url(#…).
    expect(html).toContain('id="t1-c"');
    expect(html).not.toContain("t:1");
  });

  test("falls back to a plain box for a bad threadcount", () => {
    const html = renderToStaticMarkup(<TartanCloth {...props} threadcount="nope" palette={{}} />);
    expect(html).toStartWith("<div");
    expect(html).toContain('aria-label="Test tartan"');
  });
});

describe("ClanEntry", () => {
  test("links to the clan and shows its motto and selvedge", () => {
    const html = renderToStaticMarkup(
      <ClanEntry
        clan={{
          ...clan("grant", "Clan Grant", "Stand fast"),
          tartan: { name: "Grant", threadcount: "R4 G4", palette: { R: "#ff0000", G: "#00ff00" } },
        }}
      />,
    );
    expect(html).toContain('href="/clans/grant"');
    expect(html).toContain("Clan Grant");
    expect(html).toContain("Stand fast");
    expect(html).toContain("linear-gradient");
  });

  test("works without a motto or tartan", () => {
    const html = renderToStaticMarkup(<ClanEntry clan={clan("bell", "Clan Bell")} />);
    expect(html).toContain("Clan Bell");
    expect(html).not.toContain("entry-meta");
    expect(html).not.toContain("linear-gradient");
  });
});
