'use client';

import { useMutation } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

/** Compares our RazorpayX transfers of the last days with RazorpayX's own list. */
export function usePayoutMatch() {
  return useMutation({
    mutationFn: (days: number) =>
      expectStatus(api.bankPayouts.payoutMatch({ query: { days } }), 200),
  });
}
