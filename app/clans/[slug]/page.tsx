import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tartan from "@/components/Tartan";
import TartanCloth from "@/components/TartanCloth";
import { getClan, getSlugs, getSurnames, nameSlug } from "@/lib/clans";
import { normName } from "@/lib/normalise";
import { tartanLabel } from "@/lib/tartan/labels";
import type { ClanRef } from "@/lib/types";

export async function generateStaticParams() {
  return (await getSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/clans/[slug]">): Promise<Metadata> {
  const clan = await getClan((await params).slug);
  if (!clan) return {};
  return {
    title: clan.name,
    description: [clan.motto && `Motto: ${clan.motto}.`, clan.seat && `Seat: ${clan.seat}.`, `${clan.chiefed ? "Chiefed" : "Armigerous"} clan.`]
      .filter(Boolean)
      .join(" "),
  };
}

function Refs({ refs }: { refs: ClanRef[] }) {
  return (
    <ul className="refs">
      {refs.map((r) => (
        <li key={r.slug ?? r.name}>{r.slug ? <Link href={`/clans/${r.slug}`}>{r.name}</Link> : r.name}</li>
      ))}
    </ul>
  );
}

export default async function ClanPage({ params }: PageProps<"/clans/[slug]">) {
  const { slug } = await params;
  const clan = await getClan(slug);
  if (!clan) notFound();

  // Sept spellings → surname pages.
  const surnames = await getSurnames();
  const surnameKey = new Map<string, string>();
  for (const s of surnames) for (const sp of [s.name, ...s.spellings]) surnameKey.set(normName(sp), s.key);

  const band = clan.tartans[0];
  const linkedBranches = clan.branches.filter((b) => b.slug);
  const otherBranches = clan.branches.filter((b) => !b.slug);
  const hasFamily = clan.parents.length + clan.branches.length + clan.allies.length + clan.rivals.length > 0;

  const particulars: [string, React.ReactNode][] = [];
  if (clan.motto) particulars.push(["Motto", <q key="m" lang="">{clan.motto}</q>]);
  if (clan.mottoTranslation) particulars.push(["Meaning", clan.mottoTranslation]);
  if (clan.warCry) particulars.push(["War cry", clan.warCry]);
  if (clan.plantBadge) particulars.push(["Plant badge", clan.plantBadge]);
  particulars.push(["Chief", clan.chiefed ? (clan.chief ?? "Recognised, name not recorded") : "None. This is an armigerous clan."]);
  if (clan.seat)
    particulars.push([
      "Seat",
      <>
        {clan.seat}
        {clan.seatCoords && (
          <>
            {" "}
            <a
              href={`https://www.openstreetmap.org/?mlat=${clan.seatCoords.lat}&mlon=${clan.seatCoords.lon}#map=13/${clan.seatCoords.lat}/${clan.seatCoords.lon}`}
            >
              (map)
            </a>
          </>
        )}
      </>,
    ]);
  if (clan.historicSeat) particulars.push(["Historic seat", clan.historicSeat]);
  if (clan.region) particulars.push(["Region", clan.region]);
  if (clan.district) particulars.push(["District", clan.district]);
  if (clan.inception) particulars.push(["Founded", clan.inception]);

  return (
    <article className="clan">
      <header className="clan-head">
        {band ? (
          <TartanCloth
            threadcount={band.threadcount}
            palette={band.palette}
            label={tartanLabel(band)}
            width="100%"
            height={220}
            settPx={300}
            idPrefix={`head-${clan.slug}`}
            className="band-cloth"
          />
        ) : (
          <div className="band-cloth band-empty" />
        )}
        <div className="plate">
          <h1>
            {clan.name.split("/").map((part, i) => (
              <span key={i}>
                {i > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </span>
            ))}
          </h1>
          <p className="plate-help">
            {clan.chiefed ? "Chiefed clan" : "Armigerous clan, without a chief"}
          </p>
        </div>
      </header>

      <div className="clan-body">
        <aside className="particulars" aria-label="Particulars">
          {clan.crestImage && (
            // Hotlinked from Wikipedia/Commons; next/image would need a redirecting remote pattern.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clan.crestImage.url} alt={`Crest badge of ${clan.name}`} width={160} height={160} loading="lazy" />
          )}
          <dl>
            {particulars.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <div className="clan-main">
          <section aria-labelledby="tartans">
            <h2 id="tartans">Tartans</h2>
            {clan.tartans.length > 1 && (
              <p className="note">{clan.tartans.length} setts are recorded under this name. Pick one to weave it.</p>
            )}
            <Tartan tartans={clan.tartans} size={300} />
          </section>

          {hasFamily && (
            <section aria-labelledby="family">
              <h2 id="family">Kin and feuds</h2>
              {clan.parents.length > 0 && (
                <>
                  <h3>Listed as a branch or sept of</h3>
                  <Refs refs={clan.parents} />
                </>
              )}
              {linkedBranches.length > 0 && (
                <>
                  <h3>Branches with their own entry</h3>
                  <Refs refs={linkedBranches} />
                </>
              )}
              {otherBranches.length > 0 && (
                <>
                  <h3>Other branches</h3>
                  <Refs refs={otherBranches} />
                </>
              )}
              {clan.allies.length > 0 && (
                <>
                  <h3>Allies</h3>
                  <Refs refs={clan.allies} />
                </>
              )}
              {clan.rivals.length > 0 && (
                <>
                  <h3>Rivals</h3>
                  <Refs refs={clan.rivals} />
                </>
              )}
            </section>
          )}

          {clan.septs.length > 0 && (
            <section aria-labelledby="septs">
              <h2 id="septs">Associated names</h2>
              <p className="note">
                These surnames are listed as septs of the clan. Sept lists are disputed and overlap between clans, so a
                name here does not prove descent.
              </p>
              <ul className="septs">
                {clan.septs.map((s) => {
                  const key = s.slug ? undefined : surnameKey.get(normName(s.name));
                  return (
                    <li key={s.name}>
                      {s.slug ? (
                        <Link href={`/clans/${s.slug}`}>{s.name}</Link>
                      ) : key ? (
                        <Link href={`/names/${nameSlug(key)}`}>{s.name}</Link>
                      ) : (
                        s.name
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {clan.notablePeople.length > 0 && (
            <section aria-labelledby="people">
              <h2 id="people">People of the clan</h2>
              <ul className="people">
                {clan.notablePeople.map((p) => (
                  <li key={p.wikidataId}>
                    {p.wikipediaUrl ? <a href={p.wikipediaUrl}>{p.name}</a> : p.name}
                    {(p.born || p.died) && (
                      <span className="years">
                        {" "}
                        ({p.born ?? "?"}–{p.died ?? ""})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="sources" className="sources">
            <h2 id="sources">Sources</h2>
            <ul>
              <li>
                <a href={clan.wikipediaUrl}>{clan.wikipediaUrl.includes("List_of_Scottish_clans") ? "List of Scottish clans" : clan.name}</a>{" "}
                on Wikipedia, CC BY-SA 4.0
              </li>
              {clan.wikidataId && (
                <li>
                  <a href={`https://www.wikidata.org/wiki/${clan.wikidataId}`}>{clan.wikidataId}</a> on Wikidata
                </li>
              )}
              {clan.tartans.length > 0 && (
                <li>
                  Threadcounts via <a href="https://github.com/thetartan/tartan-database">tartan-database</a>, CC BY-NC-ND 4.0
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </article>
  );
}
