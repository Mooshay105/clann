// Pure helpers for scripts/pull-data.ts, kept here so they can be tested without running the script.

import type { Clan, ClanRef } from "../../lib/types";
import { normName } from "../../lib/normalise";

export const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/")}`;

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export const qid = (uri: string) => uri.replace("http://www.wikidata.org/entity/", "");

/** Format a Wikidata time value to its stated precision. */
export function formatTime(value: string, precision: number): string {
  const m = /^([+-]?)(\d+)-(\d\d)-(\d\d)/.exec(value);
  if (!m) return value;
  const bc = m[1] === "-";
  const year = Number(m[2]);
  const suffix = bc ? " BC" : "";
  if (precision >= 11) return `${bc ? "-" : ""}${m[2].padStart(4, "0")}-${m[3]}-${m[4]}`;
  if (precision === 10) return `${bc ? "-" : ""}${m[2].padStart(4, "0")}-${m[3]}`;
  if (precision === 9) return `${year}${suffix}`;
  if (precision === 8) return `${Math.floor(year / 10) * 10}s${suffix}`;
  if (precision === 7) {
    const c = Math.floor((year - 1) / 100) + 1;
    const ord = c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th";
    return `${c}${ord} century${suffix}`;
  }
  if (precision === 6) return `${Math.floor((year - 1) / 1000) + 1}. millennium${suffix}`;
  return `${year}${suffix}`;
}

export const round = (n: number) => Math.round(n * 1e5) / 1e5;

export function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Clan-name key for matching: drops a leading "Clan " and any "(disambiguation)". */
export function clanKey(s: string) {
  return normName(s.replace(/\s*\([^)]*\)\s*$/, "").replace(/^clan\s+/i, ""));
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export const KEY_ORDER: (keyof Clan)[] = [
  "slug", "name", "wikipediaUrl", "wikidataId", "motto", "mottoTranslation", "warCry", "plantBadge",
  "region", "district", "seat", "historicSeat", "seatCoords", "inception", "chief", "chiefed", "crestImage",
  "parents", "descendants", "septs", "branches", "allies", "rivals", "notablePeople", "tartans",
];

/** Stable key order; drops undefined. Unknown keys (from overrides) go last, sorted. */
export function ordered(c: Clan): Clan {
  const out: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c).sort()) if (!(k in out) && (c as Record<string, unknown>)[k] !== undefined) out[k] = (c as Record<string, unknown>)[k];
  return out as Clan;
}

/** Resolved refs (with a slug) first, by slug; then unresolved ones by name. */
export const refSort = (a: ClanRef, b: ClanRef) =>
  Number(!a.slug) - Number(!b.slug) || (a.slug ?? "").localeCompare(b.slug ?? "") || a.name.localeCompare(b.name);

export function dedupeRefs(refs: ClanRef[]): ClanRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = r.slug ?? `name:${r.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
