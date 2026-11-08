// Minimal wikitext helpers: just enough for {{Infobox clan}} and the clan list table.
//
// Approach: links and templates are replaced with placeholders, innermost first, so
// that pipes inside them never confuse the splitting of template params or table cells.

export type Link = { target: string; text: string };

const OPEN = "\u0001";
const CLOSE = "\u0002";
const PH = /\u0001(\d+)\u0002/g;

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—",
  thinsp: " ", hairsp: "", zwj: "", shy: "", ensp: " ", emsp: " ", minus: "−", times: "×",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Remove comments, <ref>s and <nowiki/> markers. */
export function stripNoise(s: string): string {
  return s
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, "")
    .replace(/<nowiki\s*\/>/gi, "")
    .replace(/<\/?nowiki>/gi, "");
}

/** Find a template by name (case-insensitive, `_`≈space) and return its inner text, without the braces. */
export function findTemplate(text: string, names: string[]): string | undefined {
  const wanted = new Set(names.map(normName));
  for (let i = text.indexOf("{{"); i !== -1; i = text.indexOf("{{", i + 2)) {
    const head = /^\{\{\s*([^|{}\n]+?)\s*(\||\}\}|\n)/.exec(text.slice(i, i + 200));
    if (!head || !wanted.has(normName(head[1]))) continue;
    let depth = 0;
    for (let j = i; j < text.length - 1; j++) {
      if (text[j] === "{" && text[j + 1] === "{") { depth++; j++; }
      else if (text[j] === "}" && text[j + 1] === "}") {
        depth--; j++;
        if (depth === 0) return text.slice(i + 2, j - 1);
      }
    }
    return text.slice(i + 2);
  }
  return undefined;
}

function normName(s: string) {
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Split on `sep` at top level (outside [[ ]] and {{ }}). */
export function splitTopLevel(s: string, sep = "|"): string[] {
  const out: string[] = [];
  let cur = "";
  let sq = 0;
  let br = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[") { sq++; cur += two; i++; continue; }
    if (two === "]]" && sq > 0) { sq--; cur += two; i++; continue; }
    if (two === "{{") { br++; cur += two; i++; continue; }
    if (two === "}}" && br > 0) { br--; cur += two; i++; continue; }
    if (sq === 0 && br === 0 && s.startsWith(sep, i)) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

/** Named params of a template's inner text. Keys lower-cased, `_` → space. */
export function templateParams(inner: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of splitTopLevel(inner).slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = normName(part.slice(0, eq));
    const value = part.slice(eq + 1).trim();
    if (key && value && !(key in params)) params[key] = value;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Placeholder-based conversion

type Doc = { text: string; links: Link[] };

const LIST_TEMPLATES = new Set([
  "ubl", "unbulleted list", "plainlist", "plain list", "flatlist", "flat list", "hlist",
  "bulleted list", "bulleted", "ublist", "unbulleted", "collapsible list", "endplainlist", "endflatlist",
]);
const DROP_TEMPLATES = /^(sfn|sfnp|harvnb|harv|efn|refn|r|rp|cn|citation needed|fact|dubious|clarify|when|who|which|by whom|according to whom|vague|better source|failed verification|page needed|lang-rtl|ref|reflist|cite .*|citation|webarchive|clear|anchor|update needed|circa|c\.)$/;

function expandTemplate(inner: string): string {
  const parts = splitTopLevel(inner).map((p) => p.trim());
  const name = normName(parts[0]);
  const positional = parts.slice(1).filter((p) => !/^[\w\s-]+=/.test(p));
  if (DROP_TEMPLATES.test(name)) return "";
  if (name === "br" || name === "break" || name === "-") return "\n";
  if (name === "lang" || name === "lang2") return positional[1] ?? "";
  if (/^lang-/.test(name) || name === "langx") return positional[name === "langx" ? 1 : 0] ?? "";
  if (name === "transl" || name === "transliteration") return positional[positional.length - 1] ?? "";
  if (/^(nowrap|nobr|small|smaller|big|nobold|noitalic|nowrap begin|resize|sc|smallcaps|small caps|abbr|lang-en|ipa|script|native name)$/.test(name)) {
    return (name === "native name" ? positional[1] : name === "resize" ? positional[positional.length - 1] : positional[0]) ?? "";
  }
  if (name === "ill" || name === "interlanguage link") return positional[0] ? `[[${positional[0]}]]` : "";
  if (name === "snd" || name === "spaced ndash" || name === "spnd") return " – ";
  if (name === "ndash") return "–";
  if (name === "mdash") return "—";
  if (name === "'") return "'";
  if (LIST_TEMPLATES.has(name)) {
    return "\n" + positional.join("\n") + "\n";
  }
  if (name === "nbsp") return " ";
  return "";
}

/** Replace links with placeholders and expand templates (innermost first). */
export function tokenize(wikitext: string): Doc {
  const links: Link[] = [];
  let text = stripNoise(wikitext);

  for (let guard = 0; guard < 50; guard++) {
    const before = text;
    // Innermost links first: no [ ] inside.
    text = text.replace(/\[\[([^[\]]*)\]\]/g, (_m, body: string) => {
      const pipe = body.indexOf("|");
      let target = (pipe === -1 ? body : body.slice(0, pipe)).trim().replace(/^:/, "");
      if (/^(file|image|category|media):/i.test(target)) return "";
      let label = pipe === -1 ? target : body.slice(pipe + 1).trim();
      if (pipe !== -1 && label === "") label = target.replace(/\s*\(.*\)$/, "");
      target = decodeEntities(target.replace(/_/g, " ")).replace(/\s+/g, " ");
      // Display text may itself contain placeholders (nested links in File captions).
      label = label.replace(PH, (_x, n: string) => links[Number(n)].text);
      links.push({ target, text: label });
      return `${OPEN}${links.length - 1}${CLOSE}`;
    });
    // Innermost templates.
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => expandTemplate(inner));
    if (text === before) break;
  }
  // Table-ish leftovers / parser functions that never closed.
  text = text.replace(/\{\{|\}\}/g, "");
  return { text, links };
}

/** Convert inline markup (not links) to plain text, keeping placeholders. */
function inlinePlain(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|li|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/'''''|'''|''/g, "")
      .replace(/\[(https?:)?\/\/[^\s\]]+\s+([^\]]+)\]/g, "$2")
      .replace(/\[(https?:)?\/\/[^\s\]]+\]/g, "")
  );
}

function linksToText(s: string, links: Link[]) {
  return s.replace(PH, (_m, n: string) => inlinePlain(links[Number(n)].text));
}

function tidy(s: string) {
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/^[\s,;:*•·]+|[\s,;:*•·]+$/g, "")
    .trim();
}

/** Wikitext → plain text. Newlines kept only between "lines" (br, list items). */
export function toPlain(wikitext: string, lineJoin = ", "): string {
  const { text, links } = tokenize(wikitext);
  const plain = tidy(linksToText(inlinePlain(text), links))
    .replace(/^\*\s*/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(lineJoin);
  return plain.replace(/,\s*,/g, ",").trim();
}

export type ListItem = { text: string; link?: string };

/**
 * Split a list-ish field (septs, branches, allies…) into items, keeping link targets.
 * Separators: line breaks, bullets, commas, semicolons, " and ", "·", and sentence-ending full stops.
 */
export function toItems(wikitext: string): ListItem[] {
  const { text, links } = tokenize(wikitext);
  const s = inlinePlain(text).replace(/\s+(?:and|or|&)\s+/gi, ",").replace(/[•·]/g, ",");
  // Split at top level of parentheses.
  const pieces: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    if ((c === ")" || c === "]") && depth > 0) depth--;
    const fullStop =
      c === "." && depth === 0 && /(\s|$)/.test(s[i + 1] ?? "") && !/\b(St|Mt|Dr|Mr|Jr|Sr|Rev|Hon|[A-Z])$/.test(cur);
    if (depth === 0 && (c === "," || c === ";" || c === "\n" || c === "/" || fullStop)) {
      pieces.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  pieces.push(cur);

  const items: ListItem[] = [];
  for (const raw of pieces) {
    const p = raw.replace(/^\s*[*#:]+\s*/, "");
    if (/:\s*$/.test(p)) continue; // "See also:" headings
    const ids = [...p.matchAll(PH)].map((m) => Number(m[1]));
    const t = tidy(linksToText(p, links)).replace(/^(and|or)\s+/i, "").replace(/\s+etc\.?$/i, "");
    if (!t || /^(see also|etc\.?|others?|none|n\/a|unknown|various)$/i.test(t) || t.length > 120) continue;
    items.push(ids.length === 1 ? { text: t, link: links[ids[0]].target } : { text: t });
  }
  return items;
}

/** The first link target in a piece of wikitext, if any. */
export function firstLink(wikitext: string): string | undefined {
  const { text, links } = tokenize(wikitext);
  const m = /\u0001(\d+)\u0002/.exec(text);
  return m ? links[Number(m[1])].target : undefined;
}
