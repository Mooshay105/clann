"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ClanSummary, SurnameHit } from "@/lib/clans";
import { normName } from "@/lib/normalise";
import { tartanLabel } from "@/lib/tartan/labels";
import { ClanEntry, listNames } from "./ClanEntry";
import TartanCloth from "./TartanCloth";

const sortKey = (name: string) => normName(name.replace(/^clan\s+/i, ""));

// ?q= in the URL, read without a setState-in-effect round trip. Empty during prerender.
const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const urlQuery = () => new URLSearchParams(window.location.search).get("q") ?? "";
const noQuery = () => "";

type Result =
  | { kind: "clan"; score: number; clan: ClanSummary }
  | { kind: "surname"; score: number; hit: SurnameHit };

export function search(q: string, clans: ClanSummary[], surnames: SurnameHit[]): Result[] {
  if (!q) return [];
  const out: Result[] = [];
  for (const clan of clans) {
    const key = sortKey(clan.name);
    let score = 0;
    if (key === q) score = 100;
    else if (key.startsWith(q)) score = 80;
    else if (key.split(" ").some((w) => w.startsWith(q))) score = 60;
    else if (q.length >= 3 && key.includes(q)) score = 40;
    else if (q.length >= 4 && clan.motto && normName(clan.motto).includes(q)) score = 10;
    if (score) out.push({ kind: "clan", score, clan });
  }
  for (const hit of surnames) {
    const keys = [hit.key, ...hit.spellings.map(normName)];
    let score = 0;
    if (keys.includes(q)) score = 90;
    else if (q.length >= 3 && keys.some((k) => k.startsWith(q))) score = 50;
    if (score) out.push({ kind: "surname", score, hit });
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      (a.kind === "clan" ? sortKey(a.clan.name) : a.hit.key).localeCompare(b.kind === "clan" ? sortKey(b.clan.name) : b.hit.key)
  );
}

export default function Finder({
  clans,
  surnames,
  defaultSlug,
}: {
  clans: ClanSummary[];
  surnames: SurnameHit[];
  defaultSlug: string;
}) {
  const router = useRouter();
  const fromUrl = useSyncExternalStore(subscribe, urlQuery, noQuery);
  const [typed, setTyped] = useState<string | null>(null);
  const input = typed ?? fromUrl;
  const q = normName(input);

  const bySlug = useMemo(() => new Map(clans.map((c) => [c.slug, c])), [clans]);
  const results = useMemo(() => search(q, clans, surnames), [q, clans, surnames]);
  const clanResults = results.filter((r) => r.kind === "clan").slice(0, 12);
  const surnameResults = results.filter((r) => r.kind === "surname").slice(0, 8);

  // The band shows the cloth of the best match that has a tartan.
  const shown = useMemo(() => {
    for (const r of results) {
      const candidates = r.kind === "clan" ? [r.clan] : r.hit.clans.map((s) => bySlug.get(s)!).filter(Boolean);
      const withTartan = candidates.find((c) => c.tartan);
      if (withTartan) return withTartan;
    }
    return bySlug.get(defaultSlug);
  }, [results, bySlug, defaultSlug]);

  const top = results[0];
  const topHref = top ? (top.kind === "clan" ? `/clans/${top.clan.slug}` : `/names/${top.hit.key.replace(/ /g, "-")}`) : undefined;

  function update(value: string) {
    setTyped(value);
    const url = value ? `?q=${encodeURIComponent(value)}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  return (
    <section className="finder" aria-labelledby="finder-title">
      <div className="band">
        {shown?.tartan && (
          <TartanCloth
            key={shown.slug}
            threadcount={shown.tartan.threadcount}
            palette={shown.tartan.palette}
            label={tartanLabel(shown.tartan)}
            width="100%"
            height={300}
            settPx={340}
            idPrefix={`band-${shown.slug}`}
            className="band-cloth"
          />
        )}
        <form
          className="plate"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (topHref) router.push(topHref);
          }}
        >
          <h1 id="finder-title">Find your clan</h1>
          <label htmlFor="finder-q" className="plate-help">
            Type a clan or a surname. Many surnames belong to a clan as a sept.
          </label>
          <input
            id="finder-q"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="MacDonald, Grant, McGrouther…"
            value={input}
            onChange={(e) => update(e.target.value)}
          />
        </form>
      </div>
      {shown?.tartan && (
        <p className="band-caption">
          The cloth above is the <Link href={`/clans/${shown.slug}`}>{tartanLabel(shown.tartan)}</Link>.
        </p>
      )}

      <div className="results" aria-live="polite">
        {q && results.length === 0 && (
          <p className="note">
            No clan or surname matches “{input}”. Try another spelling: Mc and Mac are treated the same, but MacGrouther
            and MacGruther are not.
          </p>
        )}
        {clanResults.length > 0 && (
          <>
            <h2>Clans</h2>
            <ul className="entries">
              {clanResults.map((r) =>
                r.kind === "clan" ? <ClanEntry key={r.clan.slug} clan={r.clan} /> : null
              )}
            </ul>
          </>
        )}
        {surnameResults.length > 0 && (
          <>
            <h2>Surnames</h2>
            <ul className="entries">
              {surnameResults.map((r) =>
                r.kind === "surname" ? (
                  <li key={r.hit.key}>
                    <Link href={`/names/${r.hit.key.replace(/ /g, "-")}`} className="entry entry-surname">
                      <span className="entry-name">{r.hit.name}</span>
                      <span className="entry-meta">
                        Associated with {listNames(r.hit.clans.map((s) => bySlug.get(s)?.name ?? s))}
                      </span>
                    </Link>
                  </li>
                ) : null
              )}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
