// npm run pull-data [-- --fresh]
//
// Builds data/clans.json and data/report.json from:
//   - Wikipedia: List of Scottish clans + each clan article's {{Infobox clan}}
//   - Wikidata: inception (P571), seat coordinates (P625), people with family (P53) = clan
//   - thetartan/tartan-database: tartan threadcounts
// then deep-merges data/overrides.json (keyed by slug).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clan, ClanRef, ClansFile, NameEntry, NamesFile, NotablePerson } from "../lib/types";
import { parseClanList, splitMotto, emptyish, type ListRow } from "./lib/clan-list";
import { fetchJson, setFresh, stats } from "./lib/http";
import { matchTartans, normName, tartanSourceUrls, TARTAN_DB_COMMIT } from "./lib/tartans";
import { septsFromSection } from "./lib/septs-section";
import { findTemplate, firstLink, templateParams, toItems, toPlain, type ListItem } from "./lib/wikitext";

const API = "https://en.wikipedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const LIST_PAGE = "List of Scottish clans";
const DATA_DIR = path.resolve(process.cwd(), "data");

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/")}`;

// ---------------------------------------------------------------------------
// MediaWiki

type QueryPage = {
  title: string;
  missing?: boolean;
  invalid?: boolean;
  pageprops?: { wikibase_item?: string };
  revisions?: { slots: { main: { content: string } } }[];
};
type QueryResponse = {
  error?: { info: string };
  continue?: Record<string, string>;
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string; tofragment?: string }[];
    pages?: QueryPage[];
  };
};

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function api<T>(params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  const res = await fetchJson<T & { error?: { info: string } }>({
    url: API,
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (res.error) throw new Error(`MediaWiki API: ${res.error.info}`);
  return res;
}

type Resolved = { title?: string; fragment?: string; wikidataId?: string; content?: string; missing?: boolean };

/**
 * Resolve titles (normalisation + redirects), 50 per request.
 * With `content`, also returns the current wikitext (handles rvcontinue).
 */
async function resolveTitles(titles: string[], content: boolean): Promise<Map<string, Resolved>> {
  const out = new Map<string, Resolved>();
  const unique = [...new Set(titles.filter(Boolean))].sort();
  for (const batch of chunk(unique, 50)) {
    const pages = new Map<string, QueryPage>();
    const norm = new Map<string, string>();
    const redir = new Map<string, { to: string; fragment?: string }>();
    let cont: Record<string, string> | undefined = {};
    while (cont) {
      const res: QueryResponse = await api<QueryResponse>({
        action: "query",
        titles: batch.join("|"),
        redirects: "1",
        prop: content ? "pageprops|revisions" : "pageprops",
        ppprop: "wikibase_item",
        ...(content ? { rvprop: "content", rvslots: "main" } : {}),
        ...cont,
      });
      for (const n of res.query?.normalized ?? []) norm.set(n.from, n.to);
      for (const r of res.query?.redirects ?? []) redir.set(r.from, { to: r.to, fragment: r.tofragment });
      for (const p of res.query?.pages ?? []) {
        const prev = pages.get(p.title);
        pages.set(p.title, { ...prev, ...p, revisions: p.revisions ?? prev?.revisions, pageprops: p.pageprops ?? prev?.pageprops });
      }
      cont = res.continue && Object.keys(res.continue).length ? res.continue : undefined;
    }
    for (const t of batch) {
      let title = norm.get(t) ?? t;
      let fragment: string | undefined;
      for (let i = 0; i < 5 && redir.has(title); i++) {
        const r = redir.get(title)!;
        fragment = r.fragment ?? fragment;
        title = r.to;
      }
      const page = pages.get(title);
      if (!page || page.missing || page.invalid) {
        out.set(t, { missing: true });
        continue;
      }
      out.set(t, {
        title: page.title,
        fragment,
        wikidataId: page.pageprops?.wikibase_item,
        content: page.revisions?.[0]?.slots.main.content,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wikidata

type SparqlResponse = { results: { bindings: Record<string, { value: string; datatype?: string }>[] } };

async function sparql(query: string) {
  const res = await fetchJson<SparqlResponse>({
    url: SPARQL,
    method: "POST",
    body: new URLSearchParams({ query, format: "json" }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return res.results.bindings;
}

const qid = (uri: string) => uri.replace("http://www.wikidata.org/entity/", "");

/** Format a Wikidata time value to its stated precision. */
function formatTime(value: string, precision: number): string {
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

async function wikidata(clanIds: string[], seatIds: string[]) {
  const inception = new Map<string, string>();
  const coords = new Map<string, { lat: number; lon: number }>();
  const people = new Map<string, NotablePerson[]>();

  for (const ids of chunk([...new Set(clanIds)].sort(), 150)) {
    const values = ids.map((id) => `wd:${id}`).join(" ");
    const rows = await sparql(`
      SELECT ?clan ?time ?precision WHERE {
        VALUES ?clan { ${values} }
        ?clan p:P571 ?st . ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
        ?st psv:P571 [ wikibase:timeValue ?time ; wikibase:timePrecision ?precision ] .
      }`);
    // Prefer the most precise, then earliest, statement.
    const best = new Map<string, { time: string; precision: number }>();
    for (const r of rows) {
      const id = qid(r.clan.value);
      const cand = { time: r.time.value, precision: Number(r.precision.value) };
      const prev = best.get(id);
      if (!prev || cand.precision > prev.precision || (cand.precision === prev.precision && cand.time < prev.time))
        best.set(id, cand);
    }
    for (const [id, b] of best) inception.set(id, formatTime(b.time, b.precision));

    const prow = await sparql(`
      SELECT ?clan ?person (SAMPLE(?label) AS ?name) (MIN(?b) AS ?born) (MIN(?d) AS ?died) (SAMPLE(?article) AS ?wp) WHERE {
        VALUES ?clan { ${values} }
        ?person wdt:P53 ?clan .
        OPTIONAL { ?person rdfs:label ?label . FILTER(LANG(?label) = "en") }
        OPTIONAL { ?person wdt:P569 ?bt . BIND(YEAR(?bt) AS ?b) }
        OPTIONAL { ?person wdt:P570 ?dt . BIND(YEAR(?dt) AS ?d) }
        OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> . }
      } GROUP BY ?clan ?person`);
    for (const r of prow) {
      const id = qid(r.clan.value);
      const pid = qid(r.person.value);
      const list = people.get(id) ?? [];
      list.push({
        name: r.name?.value ?? pid,
        wikidataId: pid,
        ...(r.born ? { born: Number(r.born.value) } : {}),
        ...(r.died ? { died: Number(r.died.value) } : {}),
        ...(r.wp ? { wikipediaUrl: decodeURI(r.wp.value).replace(/ /g, "_") } : {}),
      });
      people.set(id, list);
    }
  }

  for (const ids of chunk([...new Set(seatIds)].sort(), 200)) {
    const rows = await sparql(`
      SELECT ?item (SAMPLE(?c) AS ?coord) WHERE {
        VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }
        ?item wdt:P625 ?c .
      } GROUP BY ?item`);
    for (const r of rows) {
      const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(r.coord.value);
      if (m) coords.set(qid(r.item.value), { lat: round(Number(m[2])), lon: round(Number(m[1])) });
    }
  }

  for (const list of people.values())
    list.sort((a, b) => (a.born ?? 99999) - (b.born ?? 99999) || a.name.localeCompare(b.name) || a.wikidataId.localeCompare(b.wikidataId));
  return { inception, coords, people };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

// ---------------------------------------------------------------------------
// Helpers

function slugify(s: string) {
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
function clanKey(s: string) {
  return normName(s.replace(/\s*\([^)]*\)\s*$/, "").replace(/^clan\s+/i, ""));
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const KEY_ORDER: (keyof Clan)[] = [
  "slug", "name", "wikipediaUrl", "wikidataId", "motto", "mottoTranslation", "warCry", "plantBadge",
  "region", "district", "seat", "historicSeat", "seatCoords", "inception", "chief", "chiefed", "crestImage",
  "parents", "descendants", "septs", "branches", "allies", "rivals", "notablePeople", "tartans",
];

/** Stable key order; drops undefined. Unknown keys (from overrides) go last, sorted. */
function ordered(c: Clan): Clan {
  const out: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c).sort()) if (!(k in out) && (c as Record<string, unknown>)[k] !== undefined) out[k] = (c as Record<string, unknown>)[k];
  return out as Clan;
}

const refSort = (a: ClanRef, b: ClanRef) => (a.slug ?? "~").localeCompare(b.slug ?? "~") || a.name.localeCompare(b.name);

function dedupeRefs(refs: ClanRef[]): ClanRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = r.slug ?? `name:${r.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const fresh = process.argv.includes("--fresh");
  setFresh(fresh);
  console.log(`Pulling clan data${fresh ? " (fresh, ignoring cache)" : ""}…`);

  // 1. Clan list ------------------------------------------------------------
  const list = await api<{ parse: { wikitext: string } }>({ action: "parse", page: LIST_PAGE, prop: "wikitext" });
  const rows = parseClanList(list.parse.wikitext);
  console.log(`  list: ${rows.length} rows, ${rows.filter((r) => r.link).length} linked to an article`);

  // Infobox template + its redirects.
  const tplRedirects = await api<{ query: { backlinks?: { title: string }[] } }>({
    action: "query",
    list: "backlinks",
    bltitle: "Template:Infobox clan",
    blfilterredir: "redirects",
    blnamespace: "10",
    bllimit: "max",
  });
  const infoboxNames = ["Infobox clan", ...(tplRedirects.query.backlinks ?? []).map((b) => b.title.replace(/^Template:/, ""))];

  // 2. Articles (wikitext + Wikidata IDs, 50 per request) -------------------
  const articles = await resolveTitles(rows.flatMap((r) => (r.link ? [r.link] : [])), true);

  type Draft = {
    row: ListRow;
    slug: string;
    title?: string;
    wikidataId?: string;
    infobox?: Record<string, string>;
    content?: string;
  };
  const drafts: Draft[] = [];
  const byTitle = new Map<string, Draft>();
  const usedSlugs = new Set<string>();
  const duplicateRows: string[] = [];
  const brokenLinks: string[] = [];

  // Rows with an article first, so an unlinked duplicate row ("Robertson") folds into the article's clan.
  const linkedFirst = [...rows.filter((r) => r.link), ...rows.filter((r) => !r.link)];
  const articleKeys = new Map<string, string>();
  for (const row of linkedFirst) {
    const art = row.link ? articles.get(row.link) : undefined;
    if (!row.link && articleKeys.has(clanKey(row.displayName))) {
      duplicateRows.push(`${row.displayName} (unlinked row; same name as ${articleKeys.get(clanKey(row.displayName))})`);
      continue;
    }
    if (row.link && (!art || art.missing)) brokenLinks.push(`${row.displayName} → [[${row.link}]]`);
    const title = art && !art.missing && !art.fragment ? art.title : undefined;
    if (title && byTitle.has(title)) {
      duplicateRows.push(`${row.displayName} (same article as ${byTitle.get(title)!.slug}: ${title})`);
      continue;
    }
    // Prefer the article title ("Clan MacGregor" → macgregor) over the list's display text ("Gregor").
    const base = slugify(title && /^clan\s/i.test(title) ? title.replace(/^clan\s+/i, "").replace(/\s*\([^)]*\)$/, "") : row.displayName);
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    const inner = art?.content && !art.fragment ? findTemplate(art.content, infoboxNames) : undefined;
    const d: Draft = {
      row,
      slug,
      title,
      wikidataId: title ? art?.wikidataId : undefined,
      infobox: inner ? templateParams(inner) : undefined,
      content: art?.content && !art.fragment ? art.content : undefined,
    };
    drafts.push(d);
    if (title) {
      byTitle.set(title, d);
      if (/^clan\s/i.test(title)) articleKeys.set(clanKey(title), slug);
    }
  }
  drafts.sort((a, b) => rows.indexOf(a.row) - rows.indexOf(b.row));

  // Name keys → slugs (for tartans and unlinked allies/rivals).
  const keys = new Map<string, string[]>();
  const addKey = (k: string, slug: string) => {
    if (!k) return;
    const list = keys.get(k) ?? [];
    if (!list.includes(slug)) list.push(slug);
    keys.set(k, list);
  };
  for (const d of drafts) {
    addKey(clanKey(d.row.displayName), d.slug);
    if (d.title && /^clan\s/i.test(d.title)) addKey(clanKey(d.title), d.slug);
    const ibName = d.infobox?.["clan name"] ? toPlain(d.infobox["clan name"]) : "";
    if (ibName && /^clan\s/i.test(ibName)) addKey(clanKey(ibName), d.slug);
  }
  // "Clan Donald" / "Clan Gregor" are known by their Mac- form (MacDonald, MacGregor) in tartan
  // names. Add that alias only where no other clan already uses it.
  for (const d of drafts) {
    const k = d.title && /^clan\s/i.test(d.title) ? clanKey(d.title) : "";
    if (k && !k.startsWith("mac") && !k.includes(" ") && !keys.has(`mac${k}`)) addKey(`mac${k}`, d.slug);
  }

  // Resolve relationship link targets + seat links (redirects, Wikidata IDs).
  const relFields = { septs: ["septs"], branches: ["branches"], allies: ["allied clans", "allies"], rivals: ["rival clans", "rivals"] } as const;
  type RelKey = keyof typeof relFields;
  const items = new Map<Draft, Record<RelKey, ListItem[]>>();
  const septsFromSections: string[] = [];
  const seatLinks = new Map<Draft, string | undefined>();
  const toResolve: string[] = [];
  for (const d of drafts) {
    const ib = d.infobox ?? {};
    const rec = {} as Record<RelKey, ListItem[]>;
    for (const k of Object.keys(relFields) as RelKey[]) {
      const raw = relFields[k].map((f) => ib[f]).find(Boolean);
      rec[k] = raw ? toItems(raw) : [];
      // No septs in the infobox: fall back to the article's "Septs" section (e.g. Clan Gregor).
      if (k === "septs" && rec[k].length === 0 && d.content) {
        rec[k] = septsFromSection(d.content);
        if (rec[k].length) septsFromSections.push(`${d.slug} (${rec[k].length})`);
      }
      for (const it of rec[k]) if (it.link && !it.link.includes("#")) toResolve.push(it.link);
    }
    items.set(d, rec);
    const seatLink = (ib["seat"] ? firstLink(ib["seat"]) : undefined) ?? (ib["seat"] ? undefined : d.row.seatLink);
    seatLinks.set(d, seatLink);
    if (seatLink) toResolve.push(seatLink);
  }
  const linkInfo = await resolveTitles(toResolve, false);

  // 3. Wikidata ------------------------------------------------------------
  const seatQ = new Map<Draft, string>();
  for (const [d, link] of seatLinks) {
    const info = link ? linkInfo.get(link) : undefined;
    if (info?.wikidataId && !info.fragment) seatQ.set(d, info.wikidataId);
  }
  const wd = await wikidata(
    drafts.flatMap((d) => (d.wikidataId ? [d.wikidataId] : [])),
    [...seatQ.values()]
  );

  // 4. Relationships ---------------------------------------------------------
  const unresolved: { slug: string; field: RelKey; name: string; link?: string }[] = [];
  const resolveItem = (d: Draft, field: RelKey, it: ListItem): ClanRef => {
    let slug: string | undefined;
    if (it.link && !it.link.includes("#")) {
      const info = linkInfo.get(it.link);
      if (info?.title && !info.fragment) slug = byTitle.get(info.title)?.slug;
    }
    if (!slug && !it.link && (field === "allies" || field === "rivals")) {
      const hit = keys.get(clanKey(it.text));
      if (hit?.length === 1) slug = hit[0];
    }
    if (!slug) unresolved.push({ slug: d.slug, field, name: it.text, ...(it.link ? { link: it.link } : {}) });
    return slug ? { slug, name: it.text } : { name: it.text };
  };

  const clans: Clan[] = [];
  for (const d of drafts) {
    const ib = d.infobox ?? {};
    const pick = (...names: string[]) => {
      for (const n of names) {
        const v = emptyish(ib[n] ? toPlain(ib[n]) : undefined);
        if (v) return v;
      }
      return undefined;
    };
    const mottoInfobox = ib["chiefs motto"] || ib["motto"] ? splitMotto(toPlain(ib["chiefs motto"] || ib["motto"])) : {};
    const motto = emptyish(mottoInfobox.motto) ?? d.row.motto;
    const sameMotto = motto && d.row.motto && normName(motto) === normName(d.row.motto);
    const mottoTranslation = emptyish(mottoInfobox.translation) ?? (sameMotto || !mottoInfobox.motto ? d.row.mottoTranslation : undefined);

    const crestFile = (ib["image badge"] ? toPlain(ib["image badge"]).replace(/^(file|image):/i, "").trim() : "") || d.row.crestFile;
    const rel = items.get(d)!;
    const refs = Object.fromEntries(
      (Object.keys(relFields) as RelKey[]).map((k) => [k, dedupeRefs(rel[k].map((it) => resolveItem(d, k, it)))])
    ) as Record<RelKey, ClanRef[]>;

    const seatQid = seatQ.get(d);
    clans.push({
      slug: d.slug,
      name: (ib["clan name"] ? emptyish(toPlain(ib["clan name"], "\n").split("\n")[0]) : undefined) ?? (/^clan\s/i.test(d.title ?? "") ? d.title!.replace(/\s*\([^)]*\)$/, "") : `Clan ${d.row.displayName}`),
      wikipediaUrl: d.title ? wikiUrl(d.title) : wikiUrl(LIST_PAGE),
      wikidataId: d.wikidataId,
      motto,
      mottoTranslation,
      warCry: pick("war cry", "chiefs slogan", "slogan") ?? d.row.warCry,
      plantBadge: pick("plant badge", "clan badge") ?? d.row.plantBadge,
      region: pick("region") ?? d.row.region,
      district: pick("district"),
      seat: pick("seat") ?? d.row.seat,
      historicSeat: pick("historic seat") ?? d.row.historicSeat,
      seatCoords: seatQid ? wd.coords.get(seatQid) : undefined,
      inception: d.wikidataId ? wd.inception.get(d.wikidataId) : undefined,
      chief: d.row.chiefed ? (pick("chiefs name") ?? d.row.chief) : undefined,
      chiefed: d.row.chiefed,
      crestImage: crestFile
        ? { file: crestFile, url: `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(crestFile.replace(/ /g, "_"))}` }
        : undefined,
      parents: [],
      descendants: [],
      septs: refs.septs,
      branches: refs.branches,
      allies: refs.allies,
      rivals: refs.rivals,
      notablePeople: d.wikidataId ? (wd.people.get(d.wikidataId) ?? []) : [],
      tartans: [],
    });
  }

  const bySlug = new Map(clans.map((c) => [c.slug, c]));
  for (const c of clans) {
    c.descendants = dedupeRefs([...c.branches, ...c.septs].filter((r) => r.slug && r.slug !== c.slug)).map((r) => ({
      slug: r.slug,
      name: bySlug.get(r.slug!)!.name,
    }));
    for (const r of c.descendants) bySlug.get(r.slug!)!.parents.push({ slug: c.slug, name: c.name });
  }
  for (const c of clans) {
    c.parents = dedupeRefs(c.parents).sort(refSort);
    c.descendants.sort(refSort);
    // Allies/rivals pointing at the clan itself are noise.
    c.allies = c.allies.filter((r) => r.slug !== c.slug);
    c.rivals = c.rivals.filter((r) => r.slug !== c.slug);
  }

  // 5. Tartans --------------------------------------------------------------
  const { tartans, report: tartanReport } = await matchTartans(keys);
  for (const c of clans) c.tartans = tartans.get(c.slug) ?? [];

  // 6. Overrides ------------------------------------------------------------
  await mkdir(DATA_DIR, { recursive: true });
  const overridesPath = path.join(DATA_DIR, "overrides.json");
  let overrides: Record<string, unknown> = {};
  try {
    overrides = JSON.parse(await readFile(overridesPath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") await writeFile(overridesPath, "{}\n");
    else throw e;
  }
  const unknownOverrides = Object.keys(overrides).filter((s) => !bySlug.has(s));
  const final = clans.map((c) => ordered(overrides[c.slug] ? deepMerge(c, overrides[c.slug]) : c));
  final.sort((a, b) => a.slug.localeCompare(b.slug));

  // 7. Output -----------------------------------------------------------------
  const file: ClansFile = {
    generatedFrom: [wikiUrl(LIST_PAGE), "https://query.wikidata.org/", ...tartanSourceUrls],
    licences: {
      wikipedia: "Text from English Wikipedia, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)",
      wikidata: "Wikidata, CC0 1.0",
      tartans: `Tartan threadcounts from thetartan/tartan-database @ ${TARTAN_DB_COMMIT.slice(0, 7)} (code MIT; data CC BY-NC-ND 4.0, see data/NOTICE.md)`,
    },
    notes: {
      septs: "Associated names. Sept lists are disputed and do not prove descent.",
      descendants: "Branches and septs that resolve to another clan in this file.",
      parents: "Reverse lookup: clans whose branches or septs list this clan.",
      inception: "Wikidata P571 formatted to its stated precision; never guessed.",
    },
    clans: final,
  };
  await writeFile(path.join(DATA_DIR, "clans.json"), JSON.stringify(file, null, 2) + "\n");

  // 7b. Name index: surname → clans (own name or sept), with hand-grouped spelling variants.
  const variantsPath = path.join(DATA_DIR, "name-variants.json");
  let variantGroups: Record<string, string[]> = {};
  try {
    variantGroups = JSON.parse(await readFile(variantsPath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") await writeFile(variantsPath, "{}\n");
    else throw e;
  }
  const groupOf = new Map<string, string>(); // normalised spelling → group key
  for (const [display, spellings] of Object.entries(variantGroups))
    for (const sp of [display, ...spellings]) groupOf.set(normName(sp), normName(display));
  const names = new Map<string, { name?: string; spellings: Set<string>; clans: Map<string, NameEntry["clans"][number]> }>();
  const addName = (spelling: string, clan: Clan, as: "clan" | "sept") => {
    const own = normName(spelling);
    // Only name-shaped strings: sept lists sometimes leak citations ("1900", "94 pp").
    if (!own || !/^\p{L}[\p{L}'’ .-]*$/u.test(spelling) || spelling.split(/\s+/).length > 3) return;
    const key = groupOf.get(own) ?? own;
    const e = names.get(key) ?? { spellings: new Set<string>(), clans: new Map() };
    e.spellings.add(spelling);
    const prev = e.clans.get(clan.slug);
    if (!prev || (prev.as === "sept" && as === "clan")) e.clans.set(clan.slug, { slug: clan.slug, name: clan.name, as });
    names.set(key, e);
  };
  for (const c of final) {
    addName(c.name.replace(/^clan\s+/i, ""), c, "clan");
    for (const s of c.septs) addName(s.name, c, "sept");
  }
  for (const [display, spellings] of Object.entries(variantGroups)) {
    const e = names.get(normName(display));
    if (!e) continue;
    e.name = display;
    for (const sp of spellings) e.spellings.add(sp);
  }
  const unmatchedVariantGroups = Object.keys(variantGroups).filter((d) => !names.has(normName(d)));
  const nameEntries: NameEntry[] = [...names]
    .map(([key, e]) => {
      const spellings = [...e.spellings].sort((a, b) => a.localeCompare(b));
      return {
        key,
        name: e.name ?? spellings[0],
        spellings,
        clans: [...e.clans.values()].sort((a, b) => (a.as === b.as ? 0 : a.as === "clan" ? -1 : 1) || a.slug.localeCompare(b.slug)),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const namesFile: NamesFile = {
    notes: {
      purpose: "Surname lookup: which clans claim a name, as their own name or as a sept (associated name).",
      septs: "Sept links are disputed and do not prove descent; a name can be claimed by several clans.",
      variants: "Spellings grouped by hand in data/name-variants.json are merged into one entry.",
    },
    names: nameEntries,
  };
  await writeFile(path.join(DATA_DIR, "names.json"), JSON.stringify(namesFile, null, 2) + "\n");

  // 8. Report -----------------------------------------------------------------
  const withArticle = final.filter((c) => c.wikipediaUrl !== wikiUrl(LIST_PAGE));
  const report = {
    counts: {
      clans: final.length,
      withArticle: withArticle.length,
      chiefed: final.filter((c) => c.chiefed).length,
      armigerous: final.filter((c) => !c.chiefed).length,
      withTartan: final.filter((c) => c.tartans.length).length,
      tartans: final.reduce((n, c) => n + c.tartans.length, 0),
      withParents: final.filter((c) => c.parents.length).length,
      withInception: final.filter((c) => c.inception).length,
      withSeatCoords: final.filter((c) => c.seatCoords).length,
      notablePeople: final.reduce((n, c) => n + c.notablePeople.length, 0),
    },
    noArticle: final.filter((c) => !withArticle.includes(c)).map((c) => c.slug),
    noInfobox: drafts.filter((d) => d.title && !d.infobox).map((d) => `${d.slug} (${d.title})`).sort(),
    noWikidataId: final.filter((c) => !c.wikidataId).map((c) => c.slug),
    noTartan: final.filter((c) => !c.tartans.length).map((c) => c.slug),
    ambiguousTartans: tartanReport.ambiguous,
    tartansMatchingSeveralClans: tartanReport.multiClan,
    tartanSourceStats: tartanReport.stats,
    unresolvedRelationships: unresolved.sort(
      (a, b) => a.slug.localeCompare(b.slug) || a.field.localeCompare(b.field) || a.name.localeCompare(b.name)
    ),
    septsFromArticleSection: septsFromSections.sort(),
    listRowsSharingAnArticle: duplicateRows.sort(),
    brokenListLinks: brokenLinks.sort(),
    unknownOverrideSlugs: unknownOverrides.sort(),
    nameVariantGroupsWithNoClan: unmatchedVariantGroups.sort(),
  };
  await writeFile(path.join(DATA_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");

  const ambiguousClans = new Set(report.ambiguousTartans.map((a) => a.slug));
  console.log(`
Wrote data/clans.json, data/names.json (${nameEntries.length} names) and data/report.json
  clans:                 ${report.counts.clans} (${report.counts.withArticle} with an article; ${report.counts.chiefed} chiefed, ${report.counts.armigerous} armigerous)
  no article:            ${report.noArticle.length}
  no infobox:            ${report.noInfobox.length} (of those with an article)
  no Wikidata ID:        ${report.noWikidataId.length}
  no tartan match:       ${report.noTartan.length}
  ambiguous tartans:     ${ambiguousClans.size} clans (${report.ambiguousTartans.length} variant groups with >1 distinct sett)
  unresolved relations:  ${report.unresolvedRelationships.length} names
  with parents:          ${report.counts.withParents}
  requests:              ${stats.network} network, ${stats.cached} cached`);
  if (unknownOverrides.length) console.warn(`  ! overrides for unknown slugs: ${unknownOverrides.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
