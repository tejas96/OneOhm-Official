'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const PAYOUT_SETUP_KEY = ['settings', 'payout-setup'] as const;
export const PAYMENT_SETTINGS_KEY = ['settings', 'payments'] as const;

/** The RazorpayX setup check (what is set, last webhook and check, open transfers). */
export function usePayoutSetup() {
  return useQuery({
    queryKey: PAYOUT_SETUP_KEY,
    queryFn: () => expectStatus(api.bankPayouts.payoutSetup(), 200),
    staleTime: 30_000,
  });
}
