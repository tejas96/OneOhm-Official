'use client';

import { PAGE_SIZE, type Page } from '@oneohm/api-contracts';
import type { QueryKey } from '@tanstack/react-query';
import { useNumberedPage } from './use-numbered-page';
import { usePagedList } from './use-paged-list';

/**
 * How a long list moves through its rows: `more` adds the next rows below ("Show more",
 * and on its own while scrolling); `numbers` shows one page at a time with page buttons.
 */
export type PagingMode = 'more' | 'numbers';

export interface ListPagingOptions {
  readonly mode: PagingMode;
  readonly pageSize?: number;
  readonly enabled?: boolean;
  readonly refetchInterval?: number | false;
  /** `numbers` only: the address key for the page (`?page=`). */
  readonly pageParam?: string;
}

/** What a list screen needs from its paging, the same shape in both modes. */
export interface ListPaging<TItem> {
  readonly mode: PagingMode;
  readonly items: readonly TItem[];
  readonly total: number;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
  readonly more: {
    readonly hasMore: boolean;
    readonly loading: boolean;
    readonly load: () => void;
  };
  readonly numbers: {
    readonly page: number;
    readonly pageCount: number;
    readonly pageSize: number;
    readonly fetching: boolean;
    readonly setPage: (page: number) => void;
  };
}

/**
 * A long list read a page at a time from a paged API (`Page<T>`, offset cursors). Pick the
 * mode per screen; the screen renders `<ListPager paging={...} />` under its rows.
 * `fetchPage` gets the cursor and the page size to ask for. The query key must hold every
 * filter and the search: when it changes, a numbered list goes back to page 1.
 */
export function useListPaging<TItem>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined, limit: number) => Promise<Page<TItem>>,
  { mode, pageSize = PAGE_SIZE, enabled = true, refetchInterval, pageParam }: ListPagingOptions,
): ListPaging<TItem> {
  const fetchWithSize = (cursor: string | undefined) => fetchPage(cursor, pageSize);
  const more = usePagedList<TItem, Page<TItem>>([...queryKey, 'more', pageSize], fetchWithSize, {
    enabled: enabled && mode === 'more',
    refetchInterval: refetchInterval ?? false,
  });
  const numbered = useNumberedPage<TItem, Page<TItem>>(queryKey, fetchWithSize, {
    pageSize,
    enabled: enabled && mode === 'numbers',
    refetchInterval: refetchInterval ?? false,
    resetKey: JSON.stringify(queryKey),
    ...(pageParam ? { param: pageParam } : {}),
  });
  const active = mode === 'more' ? more.query : numbered.query;

  return {
    mode,
    items: mode === 'more' ? more.items : numbered.items,
    total: mode === 'more' ? more.total : numbered.total,
    isPending: active.isPending,
    isError: active.isError,
    error: active.error,
    refetch: () => void active.refetch(),
    more: { hasMore: more.hasMore, loading: more.loadingMore, load: more.loadMore },
    numbers: {
      page: numbered.page,
      pageCount: numbered.pageCount,
      pageSize,
      fetching: numbered.fetching,
      setPage: numbered.setPage,
    },
  };
}
