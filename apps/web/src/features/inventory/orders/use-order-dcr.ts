'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

const dcrKey = (orderId: string) => ['inventory', 'order-dcr', orderId] as const;

/** An order's DCR papers: which lines are DCR panels, cell details and certificates. */
export function useOrderDcr(orderId: string | null | undefined) {
  return useQuery({
    queryKey: dcrKey(orderId ?? ''),
    queryFn: () =>
      expectStatus(api.inventory.receiptPapers.orderDcr({ params: { id: orderId ?? '' } }), 200),
    enabled: Boolean(orderId),
  });
}

export function useRefreshOrderDcr() {
  const client = useQueryClient();
  return useCallback(
    (orderId: string) => client.invalidateQueries({ queryKey: dcrKey(orderId) }),
    [client],
  );
}
