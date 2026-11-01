'use client';

import type { PurchaseRequestStatus } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export type AdvanceFilter = 'open' | 'pending' | 'approved' | 'paid' | 'cancelled' | 'all';

export const PURCHASING_KEYS = {
  all: ['purchasing'] as const,
  requests: (status?: PurchaseRequestStatus) =>
    ['purchasing', 'requests', status ?? 'all'] as const,
  request: (id: string) => ['purchasing', 'request', id] as const,
  advances: (status: AdvanceFilter, orderId?: string) =>
    ['purchasing', 'advances', status, orderId ?? 'any'] as const,
  // Under `inventory` so stock and receipt changes (and vendor edits) refresh them too.
  scorecards: ['inventory', 'vendor-scorecards'] as const,
  profile: (id: string) => ['inventory', 'vendor-profile', id] as const,
};

export function useRequests(status?: PurchaseRequestStatus) {
  return useQuery({
    queryKey: PURCHASING_KEYS.requests(status),
    queryFn: () =>
      expectStatus(api.purchasing.requests.list({ query: status ? { status } : {} }), 200),
  });
}

export function useRequest(id: string | null) {
  return useQuery({
    queryKey: PURCHASING_KEYS.request(id ?? 'none'),
    queryFn: () => expectStatus(api.purchasing.requests.get({ params: { id: id ?? '' } }), 200),
    enabled: id !== null,
  });
}

export function useAdvances(status: AdvanceFilter, purchaseOrderId?: string, enabled = true) {
  return useQuery({
    queryKey: PURCHASING_KEYS.advances(status, purchaseOrderId),
    queryFn: () =>
      expectStatus(
        api.purchasing.advances.list({
          query: purchaseOrderId ? { status, purchaseOrderId } : { status },
        }),
        200,
      ),
    enabled,
  });
}

export function useScorecards() {
  return useQuery({
    queryKey: PURCHASING_KEYS.scorecards,
    queryFn: () => expectStatus(api.purchasing.vendorPerformance.scorecards(), 200),
  });
}

export function useVendorProfile(id: string) {
  return useQuery({
    queryKey: PURCHASING_KEYS.profile(id),
    queryFn: () => expectStatus(api.purchasing.vendorPerformance.profile({ params: { id } }), 200),
  });
}

/** After any buying change: requests, advances, orders, stock, bills and the books. */
export function useRefreshPurchasing() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PURCHASING_KEYS.all }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['finance'] }),
    ]);
  }, [queryClient]);
}

/** Basis points as a whole percentage, e.g. 8333 → "83%". */
export const percentOf = (bp: number) => `${Math.round(bp / 100)}%`;
