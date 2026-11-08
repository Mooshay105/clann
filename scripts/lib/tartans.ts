// Tartan data from thetartan/tartan-database (formerly kravets-levko/tartan-database).
// Code there is MIT; the data/ CSVs are CC BY-NC-ND 4.0 (see data/NOTICE.md).

import type { ClanTartan } from "../../lib/types";
import { parseSett, parseTokens, colorsInThreadcount } from "../../lib/tartan/sett";
import { fetchText } from "./http";
import { normName } from "../../lib/normalise";

export const TARTAN_DB_COMMIT = "55adcebed4c68c717fbf714d7619da95da6a70db"; // 2017-01-10, last data update
const RAW = `https://raw.githubusercontent.com/thetartan/tartan-database/${TARTAN_DB_COMMIT}`;

/** Higher priority first. tartans-of-scotland is skipped: it has no threadcounts. */
export const TARTAN_SOURCES = ["register-of-tartans", "tartans-authority", "house-of-tartan", "weddslist"] as const;
type Source = (typeof TARTAN_SOURCES)[number];

export const tartanSourceUrls = TARTAN_SOURCES.map((s) => `${RAW}/data/${s}/data.csv`);

// ---------------------------------------------------------------------------
// CSV

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// ---------------------------------------------------------------------------
// Names

export { normName };

const VARIANT_ORDER = [
  "royal", "hunting", "dress", "old", "black", "red", "green", "blue", "grey", "white", "mourning",
  "arisaid", "early", "dark", "light", "muted", "modern", "ancient", "weathered", "reproduction", "faded",
  "artefact",
];
const VARIANT_WORDS = new Set([...VARIANT_ORDER, "gray", "artifact"]);
const ABBREV: Record<string, string> = {
  htg: "hunting", hunt: "hunting", anc: "ancient", mod: "modern", wthd: "weathered", wea: "weathered",
  rep: "reproduction", repro: "reproduction", drs: "dress", gray: "grey", artifact: "artefact",
};
/** Categories that can be a clan's own tartan. Others (corporate, fashion, personal…) are ignored. */
const OK_CATEGORIES = new Set([
  "clan", "family", "name", "royal", "artifact", "artefact", "portrait", "other", "clan/family", "family/clan",
]);
const HOT_CATEGORY_WORDS = new Set([
  "clan", "family", "clan/family", "family/clan", "corporate", "district", "name", "personal", "fashion", "trade",
  "commemorative", "artifact", "artefact", "fancy", "county", "regimental", "weavers", "canadian", "portrait",
  "universal", "general", "sport", "sports", "design", "canada", "unidentified", "plaid", "royal", "school",
  "mini", "u.s.a.", "international", "check",
]);
// "(Artefact)" is not neutral: it becomes the "Artefact" variant (a museum sample, not the usual sett).
const NEUTRAL_PARENS = /^(clan\??|family|name|royal|clan\/family|family\/clan|clan; family)$/i;

type ParsedName = { display: string; words: string[]; number?: number } | { reject: string };

function parseName(source: Source, row: Record<string, string>): ParsedName {
  let name = row["Name"] ?? "";
  let cats = (row["Category"] ?? "").split(";").map((c) => c.trim().toLowerCase()).filter(Boolean);

  if (source === "house-of-tartan") {
    name = name.split(/\s+Tartan Number:/)[0].replace(/\s+Tartan$/i, "").replace(/\.{2,}/g, "").trim();
    // "<name> <category…> Tartan", category can be two words ("Royal Family").
    cats = [];
    for (let m = /^(.*\S)\s+(\S+)$/.exec(name); m && HOT_CATEGORY_WORDS.has(m[2].toLowerCase()); m = /^(.*\S)\s+(\S+)$/.exec(name)) {
      name = m[1];
      cats.push(m[2].toLowerCase());
    }
    if (!cats.length) cats = ["other"];
  } else if (source === "weddslist") {
    name = name.replace(/^\(\d+\)\s*/, "");
    cats = ["other"];
  }

  if (!cats.some((c) => OK_CATEGORIES.has(c))) return { reject: "category" };
  if (/\((error\??|.*\berror\b.*)\)/i.test(name)) return { reject: "error" };

  let work = name;
  let number: number | undefined;
  work = work.replace(/#\s*(\d+)/g, (_m, n: string) => {
    number = Number(n);
    return " ";
  });
  // "Stewart of Ardshiel - 1816 (Clan)" → drop the date suffix
  work = work.replace(/\s+-\s+(c\.?\s*|pre\s+|post\s+)?\d{4}s?\b[^()]*/i, " ");
  const extra: string[] = [];
  work = work.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    const t = inner.trim();
    if (NEUTRAL_PARENS.test(t)) return " ";
    const ws = normName(t).split(" ").map((w) => ABBREV[w] ?? w);
    if (ws.length && ws.every((w) => VARIANT_WORDS.has(w))) {
      extra.push(...ws);
      return " ";
    }
    return ` ${t} `; // keeps unknown qualifiers in the name, so it won't match a bare clan name
  });
  const words = [...normName(work).split(" ").filter(Boolean).map((w) => ABBREV[w] ?? w), ...extra];
  const display = name.replace(/\s*\((clan\??|family|name|clan\/family)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  return { display, words, number };
}

function titleCase(w: string) {
  return w[0].toUpperCase() + w.slice(1);
}

// ---------------------------------------------------------------------------

export type TartanMatchReport = {
  ambiguous: { slug: string; variant: string; setts: number }[];
  multiClan: { tartan: string; slugs: string[] }[];
  stats: Record<string, { rows: number; matched: number; invalid: number; skippedCategory: number }>;
};

/**
 * Download the CSVs and match tartans to clans.
 * `clanKeys` maps a normalised clan name (see normName) to the slugs that use it.
 */
export async function matchTartans(
  clanKeys: Map<string, string[]>,
  /** Loads one source CSV. Defaults to the cached download; tests pass their own. */
  loadCsv: (source: Source, url: string) => Promise<string> = (_source, url) => fetchText({ url }),
) {
  const sources: { source: Source; rows: Record<string, string>[] }[] = [];
  for (const source of TARTAN_SOURCES) {
    const text = await loadCsv(source, `${RAW}/data/${source}/data.csv`);
    sources.push({ source, rows: parseCsv(text) });
  }

  // Fallback colours for codes a row uses but doesn't define: the most common hex for that code.
  const votes = new Map<string, Map<string, number>>();
  for (const { rows } of sources)
    for (const r of rows)
      for (const [code, hex] of parsePalette(r["Palette"] ?? "")) {
        const m = votes.get(code) ?? new Map<string, number>();
        m.set(hex, (m.get(hex) ?? 0) + 1);
        votes.set(code, m);
      }
  const fallback = new Map<string, string>();
  for (const [code, m] of votes) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    fallback.set(code, best[0]);
  }

  type Candidate = ClanTartan & { variantKey: string; number: number; sett: string; priority: number };
  const byClan = new Map<string, Candidate[]>();
  const multiClan = new Map<string, Set<string>>();
  const stats: TartanMatchReport["stats"] = {};

  sources.forEach(({ source, rows }, priority) => {
    const st = (stats[source] = { rows: rows.length, matched: 0, invalid: 0, skippedCategory: 0 });
    for (const row of rows) {
      const threadcount = (row["Threadcount"] ?? "").trim().replace(/\s+/g, " ");
      const parsed = parseName(source, row);
      if ("reject" in parsed) {
        st.skippedCategory++;
        continue;
      }
      // 1) exact name, no variant; 2) strip variant words.
      let slugs = clanKeys.get(parsed.words.join(" "));
      let variantWords: string[] = [];
      if (!slugs) {
        const base = parsed.words.filter((w) => !VARIANT_WORDS.has(w));
        variantWords = parsed.words.filter((w) => VARIANT_WORDS.has(w)).map((w) => ABBREV[w] ?? w);
        if (base.length) slugs = clanKeys.get(base.join(" "));
      }
      if (!slugs) continue;

      const sett = parseSett(threadcount);
      const tokens = parseTokens(threadcount);
      const own = new Map(parsePalette(row["Palette"] ?? ""));
      const palette: Record<string, string> = {};
      let ok = Boolean(sett && tokens && sett.total > 0);
      for (const code of colorsInThreadcount(threadcount)) {
        const hex = own.get(code) ?? fallback.get(code);
        if (!hex) ok = false;
        else palette[code] = hex;
      }
      if (!ok) {
        st.invalid++;
        continue;
      }
      st.matched++;

      const uniq = [...new Set(variantWords)].sort((a, b) => VARIANT_ORDER.indexOf(a) - VARIANT_ORDER.indexOf(b));
      const variantKey = uniq.map(titleCase).join(" ");
      const variant = [variantKey, parsed.number && parsed.number > 1 ? `#${parsed.number}` : ""].filter(Boolean).join(" ");
      if (slugs.length > 1) {
        const k = `${source}: ${parsed.display}`;
        multiClan.set(k, new Set([...(multiClan.get(k) ?? []), ...slugs]));
      }
      for (const slug of slugs) {
        const list = byClan.get(slug) ?? [];
        list.push({
          name: parsed.display,
          ...(variant ? { variant } : {}),
          threadcount,
          palette: sortKeys(palette),
          source,
          variantKey,
          number: parsed.number ?? 1,
          sett: tokens!.map((t) => `${t.color}${t.pivot ? "/" : ""}${t.count}`).join(" "),
          priority,
        });
        byClan.set(slug, list);
      }
    }
  });

  const result = new Map<string, ClanTartan[]>();
  const ambiguous: TartanMatchReport["ambiguous"] = [];
  for (const [slug, list] of byClan) {
    list.sort(
      (a, b) =>
        variantRank(a.variantKey) - variantRank(b.variantKey) ||
        a.variantKey.localeCompare(b.variantKey) ||
        a.priority - b.priority ||
        a.number - b.number ||
        a.name.localeCompare(b.name) ||
        a.threadcount.localeCompare(b.threadcount)
    );
    // Dedupe across sources: the same named tartan (variant + "#n") is kept once, from the
    // highest-priority source. Within that source, identical setts are collapsed; if it still
    // has several different setts under one name, all are kept and the clan is reported as ambiguous.
    const bestSource = new Map<string, number>();
    for (const t of list) {
      const k = `${t.variantKey}|${t.number}`;
      if (!bestSource.has(k)) bestSource.set(k, t.priority);
    }
    const seen = new Set<string>();
    const perName = new Map<string, number>();
    const kept = list.filter((t) => {
      const k = `${t.variantKey}|${t.number}`;
      if (t.priority !== bestSource.get(k) || seen.has(`${k}|${t.sett}`)) return false;
      seen.add(`${k}|${t.sett}`);
      perName.set(k, (perName.get(k) ?? 0) + 1);
      return true;
    });
    for (const [k, setts] of perName)
      if (setts > 1) {
        const [variant, n] = k.split("|");
        ambiguous.push({ slug, variant: [variant || "(plain)", n !== "1" ? `#${n}` : ""].filter(Boolean).join(" "), setts });
      }
    result.set(
      slug,
      kept.map(({ name, variant, threadcount, palette, source }) => ({
        name,
        ...(variant ? { variant } : {}),
        threadcount,
        palette,
        source,
      }))
    );
  }

  const report: TartanMatchReport = {
    ambiguous: ambiguous.sort((a, b) => a.slug.localeCompare(b.slug) || a.variant.localeCompare(b.variant)),
    multiClan: [...multiClan]
      .map(([tartan, s]) => ({ tartan, slugs: [...s].sort() }))
      .sort((a, b) => a.tartan.localeCompare(b.tartan)),
    stats,
  };
  return { tartans: result, report };
}

function variantRank(key: string) {
  if (key === "") return 0;
  if (key === "Modern") return 1;
  if (key === "Ancient") return 2;
  if (key === "Weathered") return 3;
  if (key === "Muted") return 4;
  if (key === "Hunting") return 5;
  if (key === "Dress") return 6;
  return 10;
}

function parsePalette(s: string): [string, string][] {
  return [...s.matchAll(/([A-Z]+)#([0-9A-Fa-f]{6})/g)].map((m) => [m[1], `#${m[2].toLowerCase()}`]);
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
