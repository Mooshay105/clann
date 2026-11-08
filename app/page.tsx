import { ClanEntry } from "@/components/ClanEntry";
import Finder from "@/components/Finder";
import { getSummaries, getSurnames, sortName } from "@/lib/clans";

export default async function Home() {
  const [clans, surnames] = await Promise.all([getSummaries(), getSurnames()]);

  // A–Z: group by the first letter of the name without "Clan".
  const letters = new Map<string, typeof clans>();
  for (const c of clans) {
    const letter = sortName(c.name)[0]?.toUpperCase() ?? "#";
    letters.set(letter, [...(letters.get(letter) ?? []), c]);
  }

  return (
    <>
      <Finder clans={clans} surnames={surnames} defaultSlug="campbell" />

      <section id="index" className="index" aria-labelledby="index-title">
        <h2 id="index-title">All {clans.length} clans</h2>
        <p className="lede">
          Chiefed clans have a chief recognised by the Lord Lyon. Armigerous clans have registered arms but no chief. The
          strip by each name is its tartan, laid flat.
        </p>
        <nav aria-label="Jump to letter" className="letters">
          {[...letters.keys()].map((l) => (
            <a key={l} href={`#letter-${l}`}>
              {l}
            </a>
          ))}
        </nav>
        {[...letters].map(([letter, list]) => (
          <section key={letter} id={`letter-${letter}`} className="letter" aria-label={`Clans beginning with ${letter}`}>
            <h3>{letter}</h3>
            <ul className="entries">
              {list.map((c) => (
                <ClanEntry key={c.slug} clan={c} />
              ))}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
