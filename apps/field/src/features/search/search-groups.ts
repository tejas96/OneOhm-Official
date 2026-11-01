import type { SearchHit } from '@oneohm/api-contracts';

/** What the field app searches, in the order the results show. */
export const FIELD_SEARCH_TYPES = ['projects', 'customers', 'leads', 'tasks'] as const;
export type FieldSearchType = (typeof FIELD_SEARCH_TYPES)[number];

export interface HitGroup {
  readonly type: FieldSearchType;
  readonly hits: readonly SearchHit[];
}

/** The server's hits by kind, in a fixed order, each kind keeping the server's ranking. */
export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  return FIELD_SEARCH_TYPES.map((type) => ({
    type,
    hits: hits.filter((hit) => hit.type === type),
  })).filter((group) => group.hits.length > 0);
}

/** The second line of a row: the facts and the worded state, parts that are present only. */
export function detailLine(hit: SearchHit, state: string | null): string {
  return [...hit.facts, state].filter((part): part is string => Boolean(part)).join(' · ');
}

/** A search the server can answer: two letters or more, spaces trimmed. */
export function searchable(query: string): boolean {
  return query.trim().length >= 2;
}
