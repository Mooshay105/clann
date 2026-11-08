// A clan in a list: selvedge strip of its tartan, name, motto. Server-renderable.
import Link from "next/link";
import type { ClanSummary } from "@/lib/clans";
import { selvedge } from "@/lib/tartan/labels";

export function ClanEntry({ clan }: { clan: ClanSummary }) {
  const strip = selvedge(clan.tartan);
  return (
    <li>
      <Link href={`/clans/${clan.slug}`} className="entry">
        <span className="selvedge" style={strip ? { backgroundImage: strip } : undefined} aria-hidden="true" />
        <span className="entry-name">{clan.name}</span>
        {clan.motto && <span className="entry-meta">{clan.motto}</span>}
      </Link>
    </li>
  );
}

export function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
