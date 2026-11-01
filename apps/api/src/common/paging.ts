import type { Page, PageQuery } from '@oneohm/api-contracts';

/** Where a page starts: the offset the last page's cursor carries (0 for the first). */
export function offsetOf(query: Pick<PageQuery, 'cursor'>): number {
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

/** A page of rows already cut from the whole result, with the cursor for the next one. */
export function pageFrom<T>(items: T[], total: number, offset: number, limit: number): Page<T> {
  const end = offset + items.length;
  return { items, total, nextCursor: items.length === limit && end < total ? String(end) : null };
}

/** A page cut from a list the API ordered and filtered itself (computed health, SLA). */
export function slicePage<T>(all: readonly T[], query: PageQuery): Page<T> {
  const offset = offsetOf(query);
  return pageFrom(all.slice(offset, offset + query.limit), all.length, offset, query.limit);
}

/** `%term%` for ILIKE, with the user's own % and _ taken literally. */
export function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** The words of a search, lower-cased, at most six (more words only narrow the same rows). */
export function searchWords(query: string | undefined): string[] {
  return (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
}
