import { describe, expect, test } from "bun:test";
import {
  decodeEntities,
  findTemplate,
  firstLink,
  splitTopLevel,
  stripNoise,
  templateParams,
  toItems,
  toPlain,
  tokenize,
} from "@/scripts/lib/wikitext";

describe("decodeEntities", () => {
  test("named, decimal and hex entities", () => {
    expect(decodeEntities("a&nbsp;b &amp; &#65;&#x42; &ndash;")).toBe("a b & AB –");
  });

  test("leaves unknown entities alone", () => {
    expect(decodeEntities("&bogus;")).toBe("&bogus;");
  });
});

describe("stripNoise", () => {
  test("removes comments, refs and nowiki markers", () => {
    expect(stripNoise("a<!-- c -->b<ref name=x/>c<ref name=\"y\">foo {{cite}}</ref>d<nowiki/>e<nowiki>f</nowiki>")).toBe(
      "abcdef",
    );
  });

  test("removes an unclosed comment to the end", () => {
    expect(stripNoise("keep<!-- never closed")).toBe("keep");
  });
});

describe("findTemplate", () => {
  const text = "intro {{Other|x=1}} {{Infobox clan|name={{lang|gd|Dòmhnall}}|motto=Y}} after";

  test("finds a template by name, case- and underscore-insensitively, keeping nested templates", () => {
    expect(findTemplate(text, ["infobox_Clan"])).toBe("Infobox clan|name={{lang|gd|Dòmhnall}}|motto=Y");
  });

  test("accepts any of several names (redirects)", () => {
    expect(findTemplate(text, ["Clan infobox", "Other"])).toBe("Other|x=1");
  });

  test("undefined when missing; the rest of the text when unclosed", () => {
    expect(findTemplate(text, ["Nope"])).toBeUndefined();
    expect(findTemplate("{{Infobox clan|name=X", ["Infobox clan"])).toBe("Infobox clan|name=X");
  });
});

describe("splitTopLevel", () => {
  test("ignores separators inside links and templates", () => {
    expect(splitTopLevel("a|[[b|c]]|{{d|e}}|f")).toEqual(["a", "[[b|c]]", "{{d|e}}", "f"]);
  });

  test("supports multi-character separators", () => {
    expect(splitTopLevel("a || [[b||c]] || d", "||")).toEqual(["a ", " [[b||c]] ", " d"]);
  });
});

describe("templateParams", () => {
  test("named params only, keys normalised, first value wins, empty values skipped", () => {
    expect(templateParams("Infobox clan| Name = X |motto_translation=Y|empty=|name=dup|positional")).toEqual({
      name: "X",
      "motto translation": "Y",
    });
  });

  test("values may contain links and templates with pipes", () => {
    expect(templateParams("T|seat=[[Armadale Castle|Armadale]]|x={{a|b}}")).toEqual({
      seat: "[[Armadale Castle|Armadale]]",
      x: "{{a|b}}",
    });
  });
});

describe("tokenize", () => {
  test("pipe trick drops the bracketed part from the label", () => {
    const { links } = tokenize("[[Clan Donald (disambiguation)|]]");
    expect(links).toEqual([{ target: "Clan Donald (disambiguation)", text: "Clan Donald" }]);
  });

  test("drops File and Category links, normalises targets", () => {
    const { links } = tokenize("[[File:x.png|thumb]] [[Category:Clans]] [[:Clan_Grant|Grant]]");
    expect(links).toEqual([{ target: "Clan Grant", text: "Grant" }]);
  });
});

describe("toPlain", () => {
  test("links, language templates and refs", () => {
    expect(toPlain("[[Clan Donald|Donald]] and {{lang|gd|Fraoch Eilean}}<ref>x</ref>")).toBe("Donald and Fraoch Eilean");
  });

  test("line breaks join with ', ' by default, or a given string", () => {
    expect(toPlain("a<br/>b{{br}}c")).toBe("a, b, c");
    expect(toPlain("a<br />b", " / ")).toBe("a / b");
  });

  test("bold, italics, external links and images", () => {
    expect(toPlain("'''bold''' ''it'' [https://example.com Site] [[File:x.png|thumb|cap]] end")).toBe("bold it Site end");
  });

  test("list templates become lines; citation templates vanish", () => {
    expect(toPlain("{{ubl|A|B}}{{citation needed|date=May 2020}}")).toBe("A, B");
  });

  test("tidies spaces before punctuation", () => {
    expect(toPlain("Armadale Castle , Skye .")).toBe("Armadale Castle, Skye.");
  });
});

describe("toItems", () => {
  test("splits on commas, semicolons and 'and', keeping link targets", () => {
    expect(toItems("[[Clan Brown|Brown]], Black and [[White (surname)|White]]; Green")).toEqual([
      { text: "Brown", link: "Clan Brown" },
      { text: "Black" },
      { text: "White", link: "White (surname)" },
      { text: "Green" },
    ]);
  });

  test("does not split inside brackets or after abbreviations like 'St.'", () => {
    expect(toItems("Smith (of Glen, Ross), St. Clair")).toEqual([{ text: "Smith (of Glen, Ross)" }, { text: "St. Clair" }]);
  });

  test("skips filler like 'etc.' and 'others'", () => {
    expect(toItems("Allan, others, etc.")).toEqual([{ text: "Allan" }]);
  });

  test("bullets and line breaks", () => {
    expect(toItems("* Allan\n* Brown<br>Cook")).toEqual([{ text: "Allan" }, { text: "Brown" }, { text: "Cook" }]);
  });
});

describe("firstLink", () => {
  test("returns the first link target", () => {
    expect(firstLink("see [[Foo_bar|x]] and [[Baz]]")).toBe("Foo bar");
  });

  test("undefined with no links", () => {
    expect(firstLink("plain text")).toBeUndefined();
  });
});
