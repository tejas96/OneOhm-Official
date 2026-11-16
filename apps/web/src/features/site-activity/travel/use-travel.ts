'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

export const travelKeys = {
  all: ['travel-claims'] as const,
  list: ['travel-claims', 'list'] as const,
  day: (id: string) => ['travel-claims', 'day', id] as const,
};

/**
 * What a claim shows: waiting, approved, paid, declined, withdrawn by the worker, or voided
 * after approval by finance or HR (S9), which reads differently from a worker's cancel.
 */
export type ClaimState =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'cancelled'
  | 'voided'
  | 'withdrawn';

export const claimState = (claim: TravelClaim): ClaimState => {
  if (claim.status === 'cancelled' && claim.withdrawn) return 'withdrawn';
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
    async (id: string, approve: boolean, note: string | null, expectedAmountPaise?: number) => {
      const decided = await expectStatus(
        api.siteActivity.decideTravelClaim({
          params: { id },
          body: {
            approve,
            note,
            ...(expectedAmountPaise === undefined ? {} : { expectedAmountPaise }),
          },
        }),
        200,
      ).catch(async (error: unknown) => {
        // The amount moved while the sheet was open: show the claim as it is now.
        if (changedAmountPaise(error) !== null)
          await client.invalidateQueries({ queryKey: travelKeys.all });
        throw error;
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: travelKeys.all }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
      return decided;
    },
    [client],
  );
}

/** The new amount a refused decision says the claim has now, when it was refused for that. */
export const changedAmountPaise = (error: unknown): number | null => {
  if (!(error instanceof ApiError) || error.code !== 'amount_changed') return null;
  const amount = error.details.amountPaise;
  return typeof amount === 'number' ? amount : null;
};

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
