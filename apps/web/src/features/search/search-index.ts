import type { LucideIcon } from 'lucide-react';

/** Result groups, in the order the palette shows them. */
export const SEARCH_GROUPS = ['pages', 'projects', 'customers', 'leads', 'quotations'] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface SearchEntry {
  /** Unique across groups, e.g. `projects:<id>`. */
  readonly id: string;
  readonly group: SearchGroup;
  readonly title: string;
  /** The short second line: code, phone, place, status. */
  readonly detail: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Lower-cased text that every word of the query must appear in. */
  readonly haystack: string;
  /** Lower-cased names and codes; a query they start with ranks first. */
  readonly keys: readonly string[];
}

export interface ResultGroup {
  readonly group: SearchGroup;
  readonly entries: readonly SearchEntry[];
}

/** Records shown per group; enough to find one, few enough to scan. Pages are never cut. */
const PER_GROUP = 5;

export function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Searchable text for an entry: the fields as written, plus phone numbers as bare
 * digits and codes without dashes, so "98765 43210", "+919876543210" and
 * "oh2026002" all find their record.
 */
export function haystackOf(fields: readonly (string | null | undefined)[]): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (!field) continue;
    parts.push(field.toLowerCase());
    const digits = field.replace(/\D/g, '');
    if (digits.length >= 6) parts.push(digits);
    if (/[-/]/.test(field)) parts.push(field.toLowerCase().replace(/[-/\s]/g, ''));
  }
  return parts.join(' \u0000 ');
}

/** 0: a name or code starts with the query; 1: it contains it; 2: a word starts with it; 3: the rest. */
function rank(entry: SearchEntry, query: string): number {
  if (entry.keys.some((key) => key.startsWith(query))) return 0;
  if (entry.keys.some((key) => key.includes(query))) return 1;
  if (` ${entry.haystack}`.includes(` ${query.split(' ')[0]}`)) return 2;
  return 3;
}

function matches(entry: SearchEntry, words: readonly string[]): boolean {
  return words.every((word) => entry.haystack.includes(word));
}

/**
 * The palette's results for a query, grouped and ranked. With no query only pages
 * show; records appear once the person starts typing.
 */
export function searchEntries(entries: readonly SearchEntry[], rawQuery: string): ResultGroup[] {
  const query = normalise(rawQuery);
  const words = query ? query.split(' ') : [];
  const groups: ResultGroup[] = [];
  for (const group of SEARCH_GROUPS) {
    const inGroup = entries.filter((entry) => entry.group === group);
    if (!query) {
      if (group === 'pages' && inGroup.length > 0) groups.push({ group, entries: inGroup });
      continue;
    }
    const found = inGroup
      .filter((entry) => matches(entry, words))
      .map((entry, index) => ({ entry, index, score: rank(entry, query) }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map(({ entry }) => entry);
    const shown = group === 'pages' ? found : found.slice(0, PER_GROUP);
    if (shown.length > 0) groups.push({ group, entries: shown });
  }
  return groups;
}
