// Server-side access to data/clans.json and data/names.json.
// Every exported function is cached so pages can be prerendered (cacheComponents is on).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normName } from "./normalise";
import type { Clan, ClansFile, NameEntry, NamesFile } from "./types";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "data", file), "utf8")) as T;
}

export async function getClan(slug: string): Promise<Clan | undefined> {
  "use cache";
  return (await readJson<ClansFile>("clans.json")).clans.find((c) => c.slug === slug);
}

export async function getSlugs(): Promise<string[]> {
  "use cache";
  return (await readJson<ClansFile>("clans.json")).clans.map((c) => c.slug);
}

/** Small per-clan summary for lists and search. */
export type ClanSummary = {
  slug: string;
  name: string;
  motto?: string;
  region?: string;
  chiefed: boolean;
  /** First tartan, enough to weave it or draw its selvedge. */
  tartan?: { name: string; variant?: string; threadcount: string; palette: Record<string, string> };
};

export async function getSummaries(): Promise<ClanSummary[]> {
  "use cache";
  const { clans } = await readJson<ClansFile>("clans.json");
  return clans
    .map((c) => {
      const t = c.tartans[0];
      return {
        slug: c.slug,
        name: c.name,
        ...(c.motto ? { motto: c.motto } : {}),
        ...(c.region ? { region: c.region } : {}),
        chiefed: c.chiefed,
        ...(t ? { tartan: { name: t.name, ...(t.variant ? { variant: t.variant } : {}), threadcount: t.threadcount, palette: t.palette } } : {}),
      };
    })
    .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)));
}

/** "Clan MacDonald" → "macdonald", for alphabetical order. */
export function sortName(name: string) {
  return normName(name.replace(/^clan\s+/i, ""));
}

/** Surnames claimed as septs (associated names). Own clan names are left out: clans are searched directly. */
export type SurnameHit = { key: string; name: string; spellings: string[]; clans: string[] };

export async function getSurnames(): Promise<SurnameHit[]> {
  "use cache";
  const { names } = await readJson<NamesFile>("names.json");
  return names
    .filter((n) => n.clans.some((c) => c.as === "sept"))
    .map((n) => ({
      key: n.key,
      name: n.name,
      spellings: n.spellings.filter((s) => s !== n.name),
      clans: n.clans.map((c) => c.slug),
    }));
}

export function nameSlug(key: string) {
  return key.replace(/ /g, "-");
}

export async function getName(slug: string): Promise<NameEntry | undefined> {
  "use cache";
  const { names } = await readJson<NamesFile>("names.json");
  return names.find((n) => nameSlug(n.key) === slug);
}

export async function getNameSlugs(): Promise<string[]> {
  "use cache";
  const { names } = await readJson<NamesFile>("names.json");
  return names.filter((n) => n.clans.some((c) => c.as === "sept")).map((n) => nameSlug(n.key));
}

/** Look up a surname (any spelling, e.g. "McGrouther") → the clans that claim it. */
export async function lookupName(name: string): Promise<NameEntry | undefined> {
  "use cache";
  const { names } = await readJson<NamesFile>("names.json");
  const key = normName(name);
  return names.find((n) => n.key === key || n.spellings.some((s) => normName(s) === key));
}
