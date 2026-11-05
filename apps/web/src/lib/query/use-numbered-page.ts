'use client';

import type { Page } from '@oneohm/api-contracts';
import { keepPreviousData, type QueryKey, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { pageCountOf, pageFromParam } from './page-numbers';

export interface NumberedPageOptions {
  readonly pageSize: number;
  /** The address key that holds the page number (`?page=`). */
  readonly param?: string;
  readonly enabled?: boolean;
  readonly refetchInterval?: number | false;
  /** Changes when the filters or search change; the list then goes back to page 1. */
  readonly resetKey?: string;
}

/**
 * One numbered page of a long list. The page lives in the address, so a link or a reload
 * opens the same page. Page N asks the API for the rows from (N - 1) × pageSize.
 */
export function useNumberedPage<TItem, TPage extends Page<TItem>>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<TPage>,
  {
    pageSize,
    param = 'page',
    enabled = true,
    refetchInterval = false,
    resetKey = '',
  }: NumberedPageOptions,
) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = pageFromParam(params.get(param));
  // After new filters or a new search the list shows page 1 at once, and keeps it until the
  // address says page 1 too: the address updates later, and the old page must not load.
  const [seenKey, setSeenKey] = useState(resetKey);
  const [backToFirst, setBackToFirst] = useState(false);
  const resetting = seenKey !== resetKey;
  const page = resetting || backToFirst ? 1 : asked;

  const writePage = useCallback(
    (next: number) => {
      const search = new URLSearchParams(params);
      if (next <= 1) search.delete(param);
      else search.set(param, String(next));
      router.replace(`${pathname}${search.size ? `?${search.toString()}` : ''}`, { scroll: false });
    },
    [param, params, pathname, router],
  );
  const setPage = useCallback(
    (next: number) => {
      setBackToFirst(false);
      writePage(next);
    },
    [writePage],
  );

  useEffect(() => {
    if (!resetting) return;
    setSeenKey(resetKey);
    if (asked > 1) {
      setBackToFirst(true);
      writePage(1);
    }
  }, [resetting, resetKey, asked, writePage]);
  useEffect(() => {
    if (backToFirst && asked === 1) setBackToFirst(false);
  }, [backToFirst, asked]);

  const offset = (page - 1) * pageSize;
  const query = useQuery({
    queryKey: [...queryKey, 'page', page],
    queryFn: () => fetchPage(offset > 0 ? String(offset) : undefined),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval,
  });
  const total = query.data?.total ?? 0;
  const pageCount = pageCountOf(total, pageSize);

  // A page past the end (rows were removed, or an old link) moves to the last page.
  const settled = enabled && query.data && !query.isPlaceholderData && !resetting && !backToFirst;
  useEffect(() => {
    if (settled && page > pageCount) writePage(pageCount);
  }, [settled, page, pageCount, writePage]);

  return {
    query,
    items: (query.data?.items ?? []) as TItem[],
    total,
    page,
    pageCount,
    pageSize,
    setPage,
    fetching: query.isFetching,
  };
}
