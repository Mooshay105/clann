"use client";

import { useId, useMemo, useState } from "react";
import type { Clan } from "@/lib/types";
import { SOURCE_LABELS, tartanLabel } from "@/lib/tartan/labels";
import TartanCloth from "./TartanCloth";

type Tartans = Clan["tartans"];

/** Short label per tartan, unique within the list: variant, then name or source if they differ, then a number. */
export function labels(tartans: Tartans): string[] {
  const dedupe = (ls: string[], extra: (i: number) => string) =>
    ls.map((l, i) => {
      const group = ls.flatMap((x, j) => (x === l ? [extra(j)] : []));
      return group.length > 1 && new Set(group).size > 1 ? `${l} (${extra(i)})` : l;
    });
  let ls = tartans.map((t) => (t.variant ? (t.variant.startsWith("#") ? `Standard ${t.variant}` : t.variant) : "Standard"));
  ls = dedupe(ls, (i) => tartans[i].name);
  ls = dedupe(ls, (i) => SOURCE_LABELS[tartans[i].source] ?? tartans[i].source);
  return ls.map((l, i) => (ls.filter((x) => x === l).length > 1 ? `${l} ${ls.slice(0, i).filter((x) => x === l).length + 1}` : l));
}

export default function Tartan({
  tartans,
  size = 320,
  initialVariant,
}: {
  tartans: Tartans;
  size?: number;
  initialVariant?: string;
}) {
  const uid = useId();
  const optionLabels = useMemo(() => labels(tartans), [tartans]);
  const [index, setIndex] = useState(() => {
    if (!initialVariant) return 0;
    const want = initialVariant.toLowerCase();
    const i = tartans.findIndex((t) => (t.variant ?? "standard").toLowerCase() === want || t.name.toLowerCase() === want);
    return i === -1 ? 0 : i;
  });

  if (tartans.length === 0) return <p className="note">No tartan on record.</p>;

  const tartan = tartans[Math.min(index, tartans.length - 1)];
  const selectId = `${uid}-variant`;

  return (
    <figure className="tartan" style={{ maxWidth: size }}>
      {tartans.length > 1 && (
        <p className="tartan-pick">
          <label htmlFor={selectId}>Variant</label>
          <select id={selectId} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {tartans.map((t, i) => (
              <option key={i} value={i}>
                {optionLabels[i]}
              </option>
            ))}
          </select>
        </p>
      )}
      <TartanCloth
        threadcount={tartan.threadcount}
        palette={tartan.palette}
        label={tartanLabel(tartan)}
        width={size}
        height={size}
        settPx={size * 0.8}
        idPrefix={`${uid}-${index}`}
        className="tartan-cloth"
      />
      <figcaption>
        <strong>{tartan.name}</strong>
        {tartan.variant && !tartan.name.toLowerCase().includes(tartan.variant.toLowerCase()) && `, ${tartan.variant}`}
        <br />
        From the {SOURCE_LABELS[tartan.source] ?? tartan.source}
        <span className="threadcount">{tartan.threadcount}</span>
      </figcaption>
    </figure>
  );
}
