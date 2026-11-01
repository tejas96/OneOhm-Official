'use client';

import type { SearchHit } from '@oneohm/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** The server needs two letters; one letter would match half the business. */
export const MIN_QUERY = 2;
const NONE: readonly SearchHit[] = [];

export interface SearchRecords {
  readonly hits: readonly SearchHit[];
  /** A search is on its way for what was typed (or still settling). */
  readonly loading: boolean;
  /** The search could not run; pages still match. */
  readonly failed: boolean;
}

/**
 * Universal search (PRD 10): what was typed, once it settles for 200 ms, goes to the
 * server, which searches every kind of record the person may open and narrows
 * resellers and crews to their own. Earlier results stay while the next ones arrive.
 */
export function useSearchRecords(query: string): SearchRecords {
  const typed = query.trim();
  const settled = useDebouncedValue(typed, 200);
  const asks = settled.length >= MIN_QUERY;
  const result = useQuery({
    queryKey: ['search', settled],
    queryFn: () => expectStatus(api.search.search({ query: { q: settled, limit: 5 } }), 200),
    enabled: asks,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const waiting = typed.length >= MIN_QUERY && (typed !== settled || result.isFetching);
  return {
    hits: asks && typed.length >= MIN_QUERY ? (result.data?.hits ?? NONE) : NONE,
    loading: waiting,
    failed: asks && result.isError,
  };
}
