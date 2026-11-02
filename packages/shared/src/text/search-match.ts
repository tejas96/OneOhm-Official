/** Lower-case words, with numbers and letters apart: "INV-5K" → ["inv", "5", "k"]. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
}

/**
 * True when every word typed starts a word of `text`, in any order and case. "5kw hyb"
 * finds "Hybrid inverter 5 kW" but not "25 kW"; "5 kw" and "5kw" are the same search.
 */
export function matchesSearch(text: string, query: string): boolean {
  const typed = searchWords(query);
  if (typed.length === 0) return true;
  const words = searchWords(text);
  return typed.every((word) => words.some((candidate) => candidate.startsWith(word)));
}
