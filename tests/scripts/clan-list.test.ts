import { describe, expect, test } from "bun:test";
import { emptyish, parseClanList, splitMotto } from "@/scripts/lib/clan-list";

// Same shape as the table in [[List of Scottish clans]].
const LIST = `Intro text.
{| class="wikitable sortable"
|-
! style="width:8%;"|[[Scottish Clan|Clan]] name
! Crest badge
! Clan tartan
! Crest & motto
! Clan chief
! Notes
|- style="background: #d0e5f5;"
|[[Clan Donald|Donald]]<ref name="MyClan"/>
|[[File:Clan Donald crest.svg|100px|left]]
|[[File:Donald tartan.png|120px]]
|'''Crest:''' A hand in armour.<br />
'''Motto:''' {{lang|la|Per mare per terras}} [<nowiki />[[Latin]], 'By sea and by land']<br />
'''War cry:''' Fraoch Eilean<br />'''Plant badge:''' Heather
| '''Chief:''' [[Godfrey Macdonald, 8th Baron Macdonald|The Lord Macdonald]]<br />
'''Seat:''' [[Armadale Castle]]
|
|- style="background: #faecc8;"
|Abernethy<ref name="MyClan"/>
|
|
|'''Crest:''' A raven sable.<br />
'''Motto:''' {{lang|la|Salus per Christum}} [Latin, 'Salvation through Christ']
| '''Chief:''' none, [[armigerous clan]]<br />
'''Seat:''' [[Abernethy, Perth and Kinross]]
|
|-
|Clan Bell*
| || || '''Motto:''' I beir the bell || '''Chief:''' [[Someone Bell]]<br />'''Historic seat:''' [[Old Bell Tower]]
|
|-
| Too || few || cells
|}

Text after the table.`;

describe("parseClanList", () => {
  const rows = parseClanList(LIST);

  test("reads every full row and skips short ones", () => {
    expect(rows.map((r) => r.displayName)).toEqual(["Donald", "Abernethy", "Clan Bell"]);
  });

  test("a chiefed Highland clan with an article", () => {
    expect(rows[0]).toEqual({
      displayName: "Donald",
      link: "Clan Donald",
      crestFile: "Clan Donald crest.svg",
      motto: "Per mare per terras",
      mottoTranslation: "By sea and by land",
      warCry: "Fraoch Eilean",
      plantBadge: "Heather",
      chief: "The Lord Macdonald",
      chiefed: true,
      seat: "Armadale Castle",
      seatLink: "Armadale Castle",
      historicSeat: undefined,
      region: "Highlands and Islands",
    });
  });

  test("an armigerous Lowland clan without an article", () => {
    expect(rows[1]).toMatchObject({
      displayName: "Abernethy",
      link: undefined,
      crestFile: undefined,
      motto: "Salus per Christum",
      mottoTranslation: "Salvation through Christ",
      chiefed: false,
      chief: undefined,
      seat: "Abernethy, Perth and Kinross",
      region: "Lowlands and Borders",
    });
  });

  test("inline '||' cells, a trailing '*', a historic seat and no region colour", () => {
    expect(rows[2]).toMatchObject({
      displayName: "Clan Bell",
      motto: "I beir the bell",
      chief: "Someone Bell",
      chiefed: true,
      historicSeat: "Old Bell Tower",
      region: undefined,
    });
  });
});

describe("splitMotto", () => {
  test("motto [Language, 'translation']", () => {
    expect(splitMotto("Ne obliviscaris [Latin, 'Do not forget']")).toEqual({
      motto: "Ne obliviscaris",
      translation: "Do not forget",
    });
  });

  test("motto (translation)", () => {
    expect(splitMotto("Je suis prest (I am ready)")).toEqual({ motto: "Je suis prest", translation: "I am ready" });
  });

  test("motto, meaning 'translation'", () => {
    expect(splitMotto("Virtutis gloria merces, meaning 'Glory is the reward of valour'")).toEqual({
      motto: "Virtutis gloria merces",
      translation: "Glory is the reward of valour",
    });
  });

  test("a bracketed language name is not a translation", () => {
    expect(splitMotto("Stand fast (Latin)")).toEqual({ motto: "Stand fast (Latin)" });
  });

  test("strips wrapping quotes but keeps a leading apostrophe", () => {
    expect(splitMotto('"Stand fast"')).toEqual({ motto: "Stand fast" });
    expect(splitMotto("'S Rioghal mo dhream")).toEqual({ motto: "'S Rioghal mo dhream" });
  });

  test("empty input", () => {
    expect(splitMotto("   ")).toEqual({});
  });
});

describe("emptyish", () => {
  test("placeholders become undefined", () => {
    for (const s of [undefined, "", "  ", "none", "None.", "N/A", "unknown", "vacant", "-", "–", "—", "?"])
      expect(emptyish(s)).toBeUndefined();
  });

  test("real values are trimmed", () => {
    expect(emptyish("  Armadale Castle ")).toBe("Armadale Castle");
  });
});
