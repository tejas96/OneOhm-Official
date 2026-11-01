'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { FINANCE_KEY, useInvalidateFinance } from '../../use-finance';

export function usePayoutOptions(billId: string | null) {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'payout-options', billId],
    queryFn: () =>
      expectStatus(api.bankPayouts.payoutOptions({ params: { id: billId ?? '' } }), 200),
    enabled: billId !== null,
  });
}

/** Bank transfers of the last 60 days, for the status of each bill in the list. */
export function useRecentPayouts() {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'payouts'],
    queryFn: () => expectStatus(api.bankPayouts.recentPayouts(), 200),
  });
}

export function useSendPayout(onSent: () => void) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (billId: string) =>
      expectStatus(api.bankPayouts.sendPayout({ params: { id: billId }, body: {} }), 201),
    onSuccess: async () => {
      await invalidate();
      onSent();
    },
  });
}
