'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { FINANCE_KEY, useInvalidateFinance } from '../use-finance';

/** Every payment made on one bill, newest first, with whether the viewer may undo it. */
export function useBillPayments(billId: string | null) {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'bill-payments', billId],
    queryFn: () =>
      expectStatus(api.finance.listPayablePayments({ params: { id: billId ?? '' } }), 200),
    enabled: billId !== null,
  });
}

/** Undoes a payment recorded by hand; the bill and its payments are fetched again. */
export function useUndoPayment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { billId: string; paymentId: string; reason: string }) =>
      expectStatus(
        api.finance.undoPayablePayment({
          params: { id: input.billId, paymentId: input.paymentId },
          body: { reason: input.reason },
        }),
        200,
      ),
    onSettled: () => invalidate(),
  });
}
