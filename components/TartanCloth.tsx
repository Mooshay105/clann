// Woven tartan as SVG. No hooks, so it renders in Server and Client Components alike.
// Weft stripes lie underneath; warp stripes show through a 2/2 twill mask, so where two
// colours cross they alternate in diagonal steps like real cloth.

import { parseSett } from "@/lib/tartan/sett";

export type ClothProps = {
  threadcount: string;
  palette: Record<string, string>;
  /** Accessible name, e.g. "MacDonald Modern tartan". */
  label: string;
  width: number | string;
  height: number;
  /** Roughly how many px one full sett should take. */
  settPx: number;
  idPrefix: string;
  className?: string;
};

export default function TartanCloth({ threadcount, palette, label, width, height, settPx: target, idPrefix, className }: ClothProps) {
  const sett = parseSett(threadcount);
  if (!sett || sett.total === 0) {
    return (
      <div role="img" aria-label={label} className={className} style={{ width, height, background: "var(--rule)" }} />
    );
  }

  const k = Math.min(8, target / sett.total);
  const widths = sett.stripes.map((s) => Math.max(1, Math.round(s.count * k)));
  // Twill cell: keep it 2px or more, or the weave disappears into a flat grid.
  const t = Math.max(2, Math.min(4, Math.round(k)));
  // Nudge the widest stripe so one sett is a whole number of twill repeats (seamless tiles).
  const period = 4 * t;
  const widest = widths.indexOf(Math.max(...widths));
  const over = widths.reduce((a, b) => a + b, 0) % period;
  if (over) widths[widest] += over <= period / 2 && widths[widest] > over ? -over : period - over;
  const settW = widths.reduce((a, b) => a + b, 0);
  const reps = period / gcd(settW, period);
  const tile = settW * reps;

  const stripes: { pos: number; width: number; color: string }[] = [];
  let pos = 0;
  for (let r = 0; r < reps; r++)
    sett.stripes.forEach((s, i) => {
      stripes.push({ pos, width: widths[i], color: palette[s.color] ?? "#808080" });
      pos += widths[i];
    });

  const id = idPrefix.replace(/[^a-zA-Z0-9_-]/g, "");
  const warpCells: [number, number][] = [];
  const weftCells: [number, number][] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ((x + y) % 4 < 2 ? warpCells : weftCells).push([x, y]);

  return (
    <svg role="img" aria-label={label} width={width} height={height} shapeRendering="crispEdges" className={className}>
      <title>{label}</title>
      <defs>
        <pattern id={`${id}-tw`} width={period} height={period} patternUnits="userSpaceOnUse">
          {warpCells.map(([x, y]) => (
            <rect key={`${x}${y}`} x={x * t} y={y * t} width={t} height={t} fill="#fff" />
          ))}
        </pattern>
        <pattern id={`${id}-sh`} width={period} height={period} patternUnits="userSpaceOnUse">
          {weftCells.map(([x, y]) => (
            <rect key={`${x}${y}`} x={x * t} y={y * t} width={t} height={t} fill="#000" />
          ))}
        </pattern>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={tile} height={tile}>
          <rect width={tile} height={tile} fill={`url(#${id}-tw)`} />
        </mask>
        <pattern id={`${id}-c`} width={tile} height={tile} patternUnits="userSpaceOnUse">
          {stripes.map((s, i) => (
            <rect key={`h${i}`} x={0} y={s.pos} width={tile} height={s.width} fill={s.color} />
          ))}
          <g mask={`url(#${id}-m)`}>
            {stripes.map((s, i) => (
              <rect key={`v${i}`} x={s.pos} y={0} width={s.width} height={tile} fill={s.color} />
            ))}
          </g>
          <rect width={tile} height={tile} fill={`url(#${id}-sh)`} opacity={0.12} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-c)`} />
    </svg>
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
