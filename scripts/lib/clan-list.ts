// Parses the big sortable table in [[List of Scottish clans]].
// Columns: clan name | crest badge | tartan image | crest & motto (+ war cry, plant badge) | chief & seat | notes

import { firstLink, splitTopLevel, stripNoise, toPlain, tokenize } from "./wikitext";

export type ListRow = {
  displayName: string;
  /** Link target of the clan name cell, if the row links to an article. */
  link?: string;
  crestFile?: string;
  motto?: string;
  mottoTranslation?: string;
  warCry?: string;
  plantBadge?: string;
  chief?: string;
  chiefed: boolean;
  seat?: string;
  seatLink?: string;
  historicSeat?: string;
  region?: "Highlands and Islands" | "Lowlands and Borders";
};

/** Split a cell into `'''Label:''' value` sections. */
function labelled(cell: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /'''\s*([A-Za-z ]+?)\s*:\s*'''|'''\s*([A-Za-z ]+?)\s*'''\s*:/g;
  const marks = [...cell.matchAll(re)];
  marks.forEach((m, i) => {
    const key = (m[1] ?? m[2]).toLowerCase().replace(/s$/, "");
    const end = i + 1 < marks.length ? marks[i + 1].index : cell.length;
    const value = cell.slice(m.index + m[0].length, end).trim();
    if (!(key in out)) out[key] = value;
  });
  return out;
}

/** "Ne obliviscaris [Latin, 'Do not forget']" → motto + translation. Also handles "Motto (Translation)". */
export function splitMotto(plain: string): { motto?: string; translation?: string } {
  const text = plain.replace(/\s+/g, " ").trim();
  if (!text) return {};
  let m = /^(.*?)\s*\[\s*(?:[^\],'"‘“]+,\s*)?['"‘“]?(.+?)['"’”]?\s*\]\s*\.?$/.exec(text);
  if (m && m[1]) return clean(m[1], m[2]);
  m = /^(.*?)\s*\(\s*(?:[A-Z][a-z]+(?: Gaelic)?:\s*)?['"‘“]?(.+?)['"’”]?\s*\)\s*\.?$/.exec(text);
  if (m && m[1] && !/^(latin|gaelic|scottish gaelic|scots|french|english|norse|old french)$/i.test(m[2])) {
    return clean(m[1], m[2]);
  }
  m = /^(.*?)[,;]?\s*(?:meaning|translat(?:ed|ion)|lit\.?)[:\s]+['"‘“]?(.+?)['"’”]?\.?$/i.exec(text);
  if (m && m[1]) return clean(m[1], m[2]);
  return { motto: unquote(text.replace(/\.$/, "")) };

  function clean(a: string, b: string) {
    const motto = unquote(a.replace(/[,;:.\s]+$/, ""));
    const translation = b
      .replace(/^(latin|gaelic|scottish gaelic|scots|french|english|old french)\s*[:=]\s*/i, "")
      .replace(/^["“'‘]|["”'’]$/g, "")
      .trim();
    return { motto: motto || undefined, translation: translation || undefined };
  }
}

/** Strip quotes only when they wrap the whole string, so "'S Rioghal mo dhream" keeps its apostrophe. */
function unquote(s: string) {
  const t = s.trim();
  return /^["“'‘].*["”'’]$/.test(t) ? t.slice(1, -1).trim() : t;
}

export function emptyish(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t || /^(none|n\/a|unknown|vacant|-+|–|—|\?)\.?$/i.test(t)) return undefined;
  return t;
}

export function parseClanList(wikitext: string): ListRow[] {
  const start = wikitext.indexOf('{| class="wikitable');
  const end = wikitext.indexOf("\n|}", start);
  const table = wikitext.slice(start, end);
  // Each row keeps its "|- style=…" line first: the background colour there gives the region.
  const rowsRaw = table.split(/\n(?=\|-)/).slice(1);
  const rows: ListRow[] = [];

  for (const rowRaw of rowsRaw) {
    // Cells start at a line beginning with "|" ("||" also separates cells inline).
    const cells: string[] = [];
    for (const line of rowRaw.split("\n")) {
      if (/^\|(?![-}])/.test(line)) {
        for (const c of splitTopLevel(line.slice(1), "||")) cells.push(c);
      } else if (cells.length) cells[cells.length - 1] += "\n" + line;
    }
    if (cells.length < 5) continue;
    const [nameCell, crestCell, , mottoCell, chiefCell] = cells;
    const region = /d0e5f5/i.test(rowRaw.split("\n")[0])
      ? "Highlands and Islands"
      : /faecc8/i.test(rowRaw.split("\n")[0])
        ? "Lowlands and Borders"
        : undefined;

    const nameTok = tokenize(nameCell);
    const nameLink = /^\s*\u0001(\d+)\u0002/.exec(nameTok.text);
    const displayName = toPlain(nameCell).replace(/\s*\*$/, "");
    if (!displayName) continue;

    const crest = /\[\[\s*(?:File|Image)\s*:\s*([^|\]]+)/i.exec(stripNoise(crestCell));
    const m = labelled(stripNoise(mottoCell));
    const c = labelled(stripNoise(chiefCell));
    const mottoParts = splitMotto(toPlain(m["motto"] ?? ""));
    const chiefRaw = c["chief"] ?? "";
    const chiefPlain = toPlain(chiefRaw);
    const chiefed = !!chiefPlain && !/armigerous|^none\b|^no chief|^vacant/i.test(chiefPlain);

    rows.push({
      displayName,
      link: nameLink ? nameTok.links[Number(nameLink[1])].target : undefined,
      crestFile: crest?.[1].trim(),
      motto: emptyish(mottoParts.motto),
      mottoTranslation: emptyish(mottoParts.translation),
      warCry: emptyish(toPlain(m["war cry"] ?? m["slogan"] ?? "")),
      plantBadge: emptyish(toPlain(m["plant badge"] ?? "")),
      chief: chiefed ? emptyish(chiefPlain) : undefined,
      chiefed,
      seat: emptyish(toPlain(c["seat"] ?? "")),
      seatLink: c["seat"] ? firstLink(c["seat"]) : undefined,
      historicSeat: emptyish(toPlain(c["historic seat"] ?? "")),
      region,
    });
  }
  return rows;
}
