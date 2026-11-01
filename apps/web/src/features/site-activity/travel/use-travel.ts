'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const travelKeys = {
  all: ['travel-claims'] as const,
  list: ['travel-claims', 'list'] as const,
  day: (id: string) => ['travel-claims', 'day', id] as const,
};

/** Waiting, approved, paid and declined: the four states a claim shows. */
export type ClaimState = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export const claimState = (claim: TravelClaim): ClaimState =>
  claim.status === 'approved' && claim.paid ? 'paid' : claim.status;

/** Everyone's travel claims, newest day first (approvers and finance). */
export function useTravelClaims(enabled: boolean) {
  return useQuery({
    queryKey: travelKeys.list,
    queryFn: () => expectStatus(api.siteActivity.listTravelClaims({ query: {} }), 200),
    enabled,
  });
}

/** The day behind a claim: its site check-ins and the route as it is now. */
export function useClaimDay(id: string | null) {
  return useQuery({
    queryKey: travelKeys.day(id ?? ''),
    queryFn: () => expectStatus(api.siteActivity.travelClaimDay({ params: { id: id ?? '' } }), 200),
    enabled: id !== null,
  });
}

/** Approve or decline; approving creates the payable, so Finance refreshes too. */
export function useDecideClaim() {
  const client = useQueryClient();
  return useCallback(
    async (id: string, approve: boolean, note: string | null) => {
      const decided = await expectStatus(
        api.siteActivity.decideTravelClaim({ params: { id }, body: { approve, note } }),
        200,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: travelKeys.all }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
      return decided;
    },
    [client],
  );
}
