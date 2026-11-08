import type { ClanTartan } from "../types";
import { parseSett } from "./sett";

export const SOURCE_LABELS: Record<string, string> = {
	"register-of-tartans": "Scottish Register of Tartans",
	"tartans-authority": "Scottish Tartans Authority",
	"house-of-tartan": "House of Tartan",
	"weddslist": "Weddslist",
};

/** "MacDonald Modern tartan" */
export function tartanLabel(t: Pick<ClanTartan, "name" | "variant">) {
	const variant = t.variant?.replace(/\s*#\d+$/, "");
	const name =
		variant && !t.name.toLowerCase().includes(variant.toLowerCase())
			? `${t.name} ${variant}`
			: t.name;
	return `${name.replace(/,/g, "")} tartan`;
}

/**
 * The sett as a hard-stop CSS gradient: a thin "selvedge" strip that costs one element.
 * Used next to every clan in lists.
 */
export function selvedge(
	t: Pick<ClanTartan, "threadcount" | "palette"> | undefined,
): string | undefined {
	const sett = t && parseSett(t.threadcount);
	if (!t || !sett) return undefined;
	let at = 0;
	const stops = sett.stripes.map((s) => {
		const from = (at / sett.total) * 100;
		at += s.count;
		const to = (at / sett.total) * 100;
		const c = t.palette[s.color] ?? "#808080";
		return `${c} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
	});
	return `linear-gradient(90deg, ${stops.join(", ")})`;
}
