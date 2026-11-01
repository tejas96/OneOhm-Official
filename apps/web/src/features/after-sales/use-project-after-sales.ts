'use client';

import type { ProjectAfterSales } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const afterSalesKey = (projectId: string) => ['projects', projectId, 'after-sales'] as const;

export function useProjectAfterSales(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: afterSalesKey(projectId),
    queryFn: () =>
      expectStatus(api.afterSales.projectAfterSales({ params: { id: projectId } }), 200),
    enabled,
  });
}

/** Puts a fresh read in the cache, or refetches when the change came back without one. */
export function useRefreshAfterSales(projectId: string) {
  const queryClient = useQueryClient();
  return (next?: ProjectAfterSales) =>
    next
      ? queryClient.setQueryData(afterSalesKey(projectId), next)
      : queryClient.invalidateQueries({ queryKey: afterSalesKey(projectId) });
}

/** "31 Oct 2036" for a calendar date. */
export const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;
export const dateOf = (value: string) => new Date(value);
