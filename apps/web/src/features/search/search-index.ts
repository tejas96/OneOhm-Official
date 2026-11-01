import { SEARCH_TYPES, type SearchType } from '@oneohm/api-contracts';
import type { LucideIcon } from 'lucide-react';

/** Result groups, in the order the palette shows them: pages, then every kind of record. */
export const SEARCH_GROUPS = ['pages', ...SEARCH_TYPES] as const;
export type SearchGroup = 'pages' | SearchType;

export interface SearchEntry {
  /** Unique across groups, e.g. `projects:<id>`. */
  readonly id: string;
  readonly group: SearchGroup;
  readonly title: string;
  /** The short second line: code, phone, place, status. */
  readonly detail: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Lower-cased text that every word of the query must appear in (pages only). */
  readonly haystack: string;
  /** Lower-cased names; a query they start with ranks first (pages only). */
  readonly keys: readonly string[];
}

export interface ResultGroup {
  readonly group: SearchGroup;
  readonly entries: readonly SearchEntry[];
}

export function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Searchable text for a page: its name, its group and its key. */
export function haystackOf(fields: readonly (string | null | undefined)[]): string {
  return fields
    .filter((field): field is string => Boolean(field))
    .map((field) => field.toLowerCase())
    .join(' \u0000 ');
}

/** 0: a name starts with the query; 1: it contains it; 2: a word starts with it; 3: the rest. */
function rank(entry: SearchEntry, query: string): number {
  if (entry.keys.some((key) => key.startsWith(query))) return 0;
  if (entry.keys.some((key) => key.includes(query))) return 1;
  if (` ${entry.haystack}`.includes(` ${query.split(' ')[0]}`)) return 2;
  return 3;
}

function matchingPages(pages: readonly SearchEntry[], query: string): SearchEntry[] {
  const words = query.split(' ');
  return pages
    .filter((entry) => words.every((word) => entry.haystack.includes(word)))
    .map((entry, index) => ({ entry, index, score: rank(entry, query) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * The palette's results. With no query only pages show. With one, the pages that match
 * come first, then the records the server found (already matched, ranked and limited to
 * what the person may open), grouped by kind in a fixed order.
 */
export function searchEntries(
  pages: readonly SearchEntry[],
  records: readonly SearchEntry[],
  rawQuery: string,
): ResultGroup[] {
  const query = normalise(rawQuery);
  if (!query) return pages.length > 0 ? [{ group: 'pages', entries: pages }] : [];
  const groups: ResultGroup[] = [];
  const found = matchingPages(pages, query);
  if (found.length > 0) groups.push({ group: 'pages', entries: found });
  for (const group of SEARCH_TYPES) {
    const entries = records.filter((entry) => entry.group === group);
    if (entries.length > 0) groups.push({ group, entries });
  }
  return groups;
}
