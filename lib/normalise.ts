/** Normalise a name for matching: case, accents, punctuation, and Mac/Mc/M' → "mac". */
export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:mac|mc|m['’‘])\s?(?=[a-z])/gi, "mac")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
