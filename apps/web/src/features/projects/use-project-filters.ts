'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';
import {
  DEFAULT_FILTERS,
  HEALTH_FILTERS,
  LAYOUTS,
  type ProjectFilters,
  SORTS,
  STATUS_FILTERS,
  TYPE_FILTERS,
} from './project-filters';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const PARAMS: Readonly<Record<keyof ProjectFilters, string>> = {
  search: 'q',
  status: 'status',
  health: 'health',
  type: 'type',
  sort: 'sort',
  view: 'view',
};

/**
 * The list's filters, order and layout live in the URL (`?status=all&view=table`), so a
 * filtered list can be bookmarked or shared and Cards / Table is remembered.
 */
export function useProjectFilters(): [ProjectFilters, (patch: Partial<ProjectFilters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo<ProjectFilters>(
    () => ({
      search: params.get(PARAMS.search) ?? '',
      status: pick(params.get(PARAMS.status), STATUS_FILTERS, DEFAULT_FILTERS.status),
      health: pick(params.get(PARAMS.health), HEALTH_FILTERS, DEFAULT_FILTERS.health),
      type: pick(params.get(PARAMS.type), TYPE_FILTERS, DEFAULT_FILTERS.type),
      sort: pick(params.get(PARAMS.sort), SORTS, DEFAULT_FILTERS.sort),
      view: pick(params.get(PARAMS.view), LAYOUTS, DEFAULT_FILTERS.view),
    }),
    [params],
  );

  // A change made before the URL has caught up with the previous one builds on that one,
  // so quick changes (Clear filters, then the search box settling) never undo each other.
  const pending = useRef<{ from: ProjectFilters; next: ProjectFilters } | null>(null);

  const update = useCallback(
    (patch: Partial<ProjectFilters>) => {
      const base = pending.current?.from === filters ? pending.current.next : filters;
      const next: ProjectFilters = { ...base, ...patch };
      pending.current = { from: filters, next };
      const query = new URLSearchParams();
      for (const key of Object.keys(PARAMS) as (keyof ProjectFilters)[]) {
        const value = next[key].trim();
        if (value && value !== DEFAULT_FILTERS[key]) query.set(PARAMS[key], value);
      }
      const suffix = query.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  return [filters, update];
}
