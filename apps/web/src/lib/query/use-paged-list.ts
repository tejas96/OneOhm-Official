'use client';

import type { Page } from '@oneohm/api-contracts';
import { type QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * A long list a page at a time (PRD 9.3): the first page shows at once, more arrive as
 * the person scrolls or asks. While new filters load, the rows already shown stay.
 * `first` carries the page's totals and counts (they describe every match, not one page).
 */
export function usePagedList<TItem, TPage extends Page<TItem>>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<TPage>,
  options: { readonly enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last: TPage) => last.nextCursor ?? undefined,
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
  });
  const pages = query.data?.pages;
  const items = useMemo(() => pages?.flatMap((page) => page.items) ?? [], [pages]);
  return {
    query,
    items,
    first: pages?.[0] ?? null,
    total: pages?.[0]?.total ?? 0,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

export type PagedList<TItem> = Pick<
  ReturnType<typeof usePagedList<TItem, Page<TItem>>>,
  'items' | 'total' | 'hasMore' | 'loadingMore' | 'loadMore'
>;
