// lib/clans.ts reads the real data/*.json (tests run from the project root).
import { describe, expect, test } from "bun:test";
import {
  getClan,
  getName,
  getNameSlugs,
  getSlugs,
  getSummaries,
  getSurnames,
  lookupName,
  nameSlug,
  sortName,
} from "@/lib/clans";

describe("sortName / nameSlug", () => {
  test("sortName drops 'Clan' and normalises", () => {
    expect(sortName("Clan MacDonald")).toBe("macdonald");
    expect(sortName("clan McLeod")).toBe("macleod");
  });

  test("nameSlug swaps spaces for hyphens", () => {
    expect(nameSlug("mac an t sagairt")).toBe("mac-an-t-sagairt");
  });
});

describe("clans", () => {
  test("every slug resolves to its clan", async () => {
    const slugs = await getSlugs();
    expect(slugs.length).toBeGreaterThan(300);
    for (const slug of slugs.slice(0, 25)) expect((await getClan(slug))?.slug).toBe(slug);
  });

  test("unknown slug is undefined", async () => {
    expect(await getClan("not-a-clan")).toBeUndefined();
  });

  test("summaries are sorted alphabetically, ignoring 'Clan'", async () => {
    const keys = (await getSummaries()).map((s) => sortName(s.name));
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  test("summaries carry the first tartan and no empty optional fields", async () => {
    const summaries = await getSummaries();
    const withTartan = summaries.filter((s) => s.tartan);
    expect(withTartan.length).toBeGreaterThan(0);
    for (const s of summaries) {
      if ("motto" in s) expect(s.motto).toBeTruthy();
      if ("region" in s) expect(s.region).toBeTruthy();
    }
    const first = withTartan[0];
    const clan = (await getClan(first.slug))!;
    expect(first.tartan!.threadcount).toBe(clan.tartans[0].threadcount);
  });
});

describe("surnames", () => {
  test("only surnames claimed as a sept are listed", async () => {
    const hits = await getSurnames();
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.spellings).not.toContain(h.name);
    expect((await getNameSlugs()).length).toBe(hits.length);
  });

  test("lookupName finds a name by any spelling", async () => {
    for (const spelling of ["McGrouther", "MacGruther", "Magruder", "mcgrouther"]) {
      const entry = await lookupName(spelling);
      expect(entry?.key).toBe("macgrouther");
    }
    const entry = (await lookupName("McGrouther"))!;
    expect(entry.clans.map((c) => c.slug)).toContain("gregor");
  });

  test("lookupName is undefined for unknown names", async () => {
    expect(await lookupName("Zzyzx")).toBeUndefined();
  });

  test("getName resolves every name slug", async () => {
    for (const slug of (await getNameSlugs()).slice(0, 25)) expect(nameSlug((await getName(slug))!.key)).toBe(slug);
  });
});
