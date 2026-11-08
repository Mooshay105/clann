// Fallback for clans whose {{Infobox clan}} has no septs: read the article's "Septs" section
// (e.g. Clan Gregor keeps the Clan Gregor Society's list there). Conservative on purpose:
// only bullet items, the "Name(s)" column of tables, and comma lists are taken, and every
// item must look like a surname.

import { splitTopLevel, stripNoise, toItems, toPlain, type ListItem } from "./wikitext";

/** Headings like "Septs", "Clan septs", "Associated names and septs". Not "As a sept of other clans". */
const HEADING = /^(=+)\s*([^=\n]*\bsepts\b[^=\n]*?)\s*=+\s*$/gim;
/** Sections that say there are no septs, or only list names from a region. */
const NO_SEPTS = /\bno (official )?septs?\b|\bno sept families\b|linked to the \w+ region/i;

export function septsFromSection(article: string): ListItem[] {
  const text = stripNoise(article);
  const out: ListItem[] = [];
  for (const m of text.matchAll(HEADING)) {
    if (/\bas a sept\b/i.test(m[2])) continue;
    const level = m[1].length;
    const rest = text.slice(m.index + m[0].length);
    const end = new RegExp(`^={1,${level}}[^=]`, "m").exec(rest);
    const section = rest.slice(0, end ? end.index : undefined);
    if (NO_SEPTS.test(toPlain(section))) continue;
    out.push(...parseSection(section));
  }
  const seen = new Set<string>();
  return out.filter((it) => {
    const k = it.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseSection(section: string): ListItem[] {
  const items: ListItem[] = [];
  const lines = section.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("{|")) {
      const tableEnd = lines.findIndex((l, j) => j > i && l.startsWith("|}"));
      const stop = tableEnd === -1 ? lines.length : tableEnd;
      items.push(...parseTable(lines.slice(i + 1, stop)));
      i = stop;
    } else if (/^[*#]/.test(line)) {
      // "*Macaldowie || Macara ||Macaree" (Clan Gregor) or "* Calhoun, Cahoon, …"
      const body = line.replace(/^[*#]+\s*/, "");
      if (/^asterisk/i.test(body)) continue;
      items.push(...toItems(body.split("||").join(", ")));
    } else if ((line.match(/,/g) ?? []).length >= 3) {
      // "The septs of Clan Skene include: Cariston, Dyce, Hallyard and Carnie."
      const colon = line.lastIndexOf(":");
      const include = /\binclude[sd]?\b/.exec(line);
      const start = colon !== -1 ? colon + 1 : include ? include.index + include[0].length : 0;
      items.push(...toItems(line.slice(start)));
    }
  }
  return items.map(clean).filter((it): it is ListItem => it !== null);
}

/** Take the "Name"/"Names" column of a wikitable. */
function parseTable(lines: string[]): ListItem[] {
  const rows: string[][] = [[]];
  let header: string[] = [];
  for (const line of lines) {
    if (line.startsWith("|-")) rows.push([]);
    else if (line.startsWith("!")) header.push(...splitTopLevel(line.slice(1), "!!").map((h) => toPlain(h.replace(/^[^|[]*\|(?!\|)/, ""))));
    else if (line.startsWith("|")) rows[rows.length - 1].push(...splitTopLevel(line.slice(1), "||"));
    else if (rows[rows.length - 1].length) rows[rows.length - 1][rows[rows.length - 1].length - 1] += "\n" + line;
  }
  header = header.map((h) => h.trim().toLowerCase());
  const col = header.findIndex((h) => /^names?$/.test(h));
  if (col === -1) return [];
  return rows.flatMap((r) => (r[col] ? toItems(r[col].replace(/^[^|[\]{}]*\|(?!\|)/, "")) : []));
}

function clean(it: ListItem): ListItem | null {
  const text = it.text
    .replace(/\*+$/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+[–—-]\s+.*$/, "")
    .trim();
  const words = text.split(/\s+/);
  if (!/^[A-Z][A-Za-z'’.\- ]*$/.test(text) || words.length > 3 || text.length < 3 || text.length > 30) return null;
  // Every word capitalised (bar particles): rejects prose like "Several possible clans".
  if (!words.every((w) => /^[A-Z]/.test(w) || /^(of|de|la|le|du|von|van)$/.test(w))) return null;
  if (/^(Mac|Mc|M')$/i.test(text)) return null;
  if (/^(The|And|Or|Clan|Septs?|Names?|Notes?|See)$/i.test(words[0])) return null;
  return { ...it, text };
}
