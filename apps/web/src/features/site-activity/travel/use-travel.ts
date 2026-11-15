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

/**
 * What a claim shows: waiting, approved, paid, declined, withdrawn by the worker, or voided
 * after approval by finance or HR (S9), which reads differently from a worker's cancel.
 */
export type ClaimState = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled' | 'voided';

export const claimState = (claim: TravelClaim): ClaimState => {
  if (claim.status === 'cancelled' && claim.voidedAt) return 'voided';
  return claim.status === 'approved' && claim.paid ? 'paid' : claim.status;
};

/** Decide buttons show only for who may decide a waiting claim (manager, HR, finance; S10). */
export const canDecideClaim = (claim: TravelClaim): boolean =>
  claim.status === 'pending' && claim.canDecide;

/** Void shows for an approved claim that is not paid, to finance and HR only (S9, S10). */
export const canVoidClaim = (claim: TravelClaim): boolean =>
  claim.status === 'approved' && !claim.paid && claim.canVoid;

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

/** Voids an approved, unpaid claim; its bill is cancelled, so Finance refreshes too. */
export function useVoidClaim() {
  const client = useQueryClient();
  return useCallback(
    async (id: string, reason: string) => {
      const voided = await expectStatus(
        api.siteActivity.voidTravelClaim({ params: { id }, body: { reason } }),
        200,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: travelKeys.all }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
      return voided;
    },
    [client],
  );
}
