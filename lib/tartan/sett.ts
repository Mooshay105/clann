// Threadcount → sett parsing. Written for this project (not ported), covering the
// notation used in thetartan/tartan-database:
//   symmetric (pivots marked with "/"):  B/24 W4 B24 R2 K24 G24 W/2
//   asymmetric (no pivots, repeats as-is): G24 A12 G12 R30 K2 R2 K4

export type Stripe = { color: string; count: number };

export type Sett = {
  /** One full repeat of the sett, already reflected if symmetric. */
  stripes: Stripe[];
  symmetric: boolean;
  /** Total thread count of one full repeat. */
  total: number;
};

const TOKEN = /^([A-Z]+)(\/)?(\d+(?:\.\d+)?)$/;

/** Parse the raw tokens. Returns null if any token is not "<COLOUR>[/]<count>". */
export function parseTokens(threadcount: string): { color: string; count: number; pivot: boolean }[] | null {
  const raw = threadcount.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (raw.length === 0) return null;
  const out: { color: string; count: number; pivot: boolean }[] = [];
  for (const t of raw) {
    const m = TOKEN.exec(t);
    if (!m) return null;
    const count = Number(m[3]);
    if (!Number.isFinite(count) || count <= 0) return null;
    out.push({ color: m[1], count, pivot: Boolean(m[2]) });
  }
  return out;
}

export function parseSett(threadcount: string): Sett | null {
  const tokens = parseTokens(threadcount);
  if (!tokens) return null;
  const symmetric = tokens.length > 1 && (tokens[0].pivot || tokens[tokens.length - 1].pivot);
  let stripes: Stripe[] = tokens.map(({ color, count }) => ({ color, count }));
  if (symmetric) {
    // Reflect around both pivots; the pivot stripes themselves appear once per half.
    stripes = [...stripes, ...stripes.slice(1, -1).reverse()];
  }
  // Merge neighbouring stripes of the same colour (also across the wrap seam).
  const merged: Stripe[] = [];
  for (const s of stripes) {
    const last = merged[merged.length - 1];
    if (last && last.color === s.color) last.count += s.count;
    else merged.push({ ...s });
  }
  if (merged.length > 1 && merged[0].color === merged[merged.length - 1].color) {
    merged[0].count += merged.pop()!.count;
  }
  const total = merged.reduce((n, s) => n + s.count, 0);
  return { stripes: merged, symmetric, total };
}

/** Colour codes used by a threadcount, in first-seen order. */
export function colorsInThreadcount(threadcount: string): string[] {
  const tokens = parseTokens(threadcount) ?? [];
  return [...new Set(tokens.map((t) => t.color))];
}
