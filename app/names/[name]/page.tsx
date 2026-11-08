import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClanEntry, listNames } from "@/components/ClanEntry";
import { getName, getNameSlugs, getSummaries } from "@/lib/clans";

export async function generateStaticParams() {
  return (await getNameSlugs()).map((name) => ({ name }));
}

export async function generateMetadata({ params }: PageProps<"/names/[name]">): Promise<Metadata> {
  const entry = await getName((await params).name);
  if (!entry) return {};
  return {
    title: `${entry.name} surname`,
    description: `${entry.name} is associated with ${listNames(entry.clans.map((c) => c.name))}.`,
  };
}

export default async function NamePage({ params }: PageProps<"/names/[name]">) {
  const entry = await getName((await params).name);
  if (!entry) notFound();
  const summaries = new Map((await getSummaries()).map((s) => [s.slug, s]));
  const others = entry.spellings.filter((s) => s !== entry.name);
  const own = entry.clans.filter((c) => c.as === "clan");
  const septOf = entry.clans.filter((c) => c.as === "sept");

  return (
    <article className="surname">
      <h1>{entry.name}</h1>
      {others.length > 0 && <p className="lede">Also spelled {listNames(others)}.</p>}

      {own.length > 0 && (
        <section aria-labelledby="own">
          <h2 id="own">A clan in its own right</h2>
          <ul className="entries">
            {own.map((c) => {
              const s = summaries.get(c.slug);
              return s ? <ClanEntry key={c.slug} clan={s} /> : null;
            })}
          </ul>
        </section>
      )}

      {septOf.length > 0 && (
        <section aria-labelledby="sept">
          <h2 id="sept">Listed as a sept of</h2>
          <p className="note">
            {septOf.length > 1
              ? `${septOf.length} clans list ${entry.name} as one of their septs. Families took a clan's protection for different reasons, so the right one for you depends on where your ${entry.name} ancestors lived.`
              : `People named ${entry.name} have traditionally been counted among this clan. It is a tradition, not proof of descent.`}
          </p>
          <ul className="entries">
            {septOf.map((c) => {
              const s = summaries.get(c.slug);
              return s ? <ClanEntry key={c.slug} clan={s} /> : null;
            })}
          </ul>
        </section>
      )}

      <p className="note">
        <Link href={`/?q=${encodeURIComponent(entry.name)}`}>Search again</Link>
      </p>
    </article>
  );
}
