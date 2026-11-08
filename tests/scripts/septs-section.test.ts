import { describe, expect, test } from "bun:test";
import { septsFromSection } from "@/scripts/lib/septs-section";

const texts = (article: string) => septsFromSection(article).map((s) => s.text);

describe("septsFromSection", () => {
  test("comma lists, '||' bullets and linked bullets; subsections included; other sections ignored", () => {
    const article = `Intro.
== History ==
* Notasept
== Septs ==
The septs of Clan Skene include: Cariston, Dyce, Hallyard, Carnie and Skeen.
*Macaldowie || Macara ||Macaree
* [[Black (surname)|Black]] (Lamont)
=== More ===
* Several possible clans
== As a sept of other clans ==
* Shouldnotappear
== References ==
* Alsonot`;
    expect(septsFromSection(article)).toEqual([
      { text: "Cariston" },
      { text: "Dyce" },
      { text: "Hallyard" },
      { text: "Carnie" },
      { text: "Skeen" },
      { text: "Macaldowie" },
      { text: "Macara" },
      { text: "Macaree" },
      { text: "Black", link: "Black (surname)" },
    ]);
  });

  test("takes the Names column of a table", () => {
    const article = `== Septs ==
{| class="wikitable"
! Names !! Notes
|-
| Allan || from somewhere
|-
| [[Brown (surname)|Brown]] || Lowercase notes here
|}`;
    expect(septsFromSection(article)).toEqual([{ text: "Allan" }, { text: "Brown", link: "Brown (surname)" }]);
  });

  test("ignores tables without a Names column", () => {
    expect(texts("== Septs ==\n{|\n! Place !! Notes\n|-\n| Perth || x\n|}")).toEqual([]);
  });

  test("skips a section that says there are no septs", () => {
    expect(texts("== Clan septs ==\nThere are no official septs.\n* Allan, Brown, Cook, Dunn")).toEqual([]);
  });

  test("rejects prose, lone prefixes and headings; dedupes across sections", () => {
    const article = `== Septs ==
* Mac
* The Others
* Allan
== Associated names and septs ==
* allan
* Allan`;
    expect(texts(article)).toEqual(["Allan"]);
  });

  test("no septs heading means nothing", () => {
    expect(texts("== History ==\n* Allan")).toEqual([]);
  });
});
