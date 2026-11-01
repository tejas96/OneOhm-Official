'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const REFERRAL_PROGRAM_KEY = ['settings', 'referrals'] as const;

/** The refer-and-earn programme with what the campaign has committed so far. */
export function useReferralProgram() {
  return useQuery({
    queryKey: REFERRAL_PROGRAM_KEY,
    queryFn: () => expectStatus(api.referrals.program(), 200),
  });
}
