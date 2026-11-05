'use client';

import type { BankPayout } from '@oneohm/api-contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { FINANCE_KEY, useInvalidateFinance } from '../../use-finance';
import { payoutIsOpen } from './payout-status';

/** How often a screen asks again while a transfer is with the bank. */
const POLL_MS = 20_000;

export function usePayoutOptions(billId: string | null) {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'payout-options', billId],
    queryFn: () =>
      expectStatus(api.bankPayouts.payoutOptions({ params: { id: billId ?? '' } }), 200),
    enabled: billId !== null,
    refetchInterval: (query) => (payoutIsOpen(query.state.data?.latest) ? POLL_MS : false),
  });
}

/**
 * Bank transfers of the last 60 days, for the status of each bill in the list. Asks again
 * every 20 s while one is open, and refreshes the bills when the last open one settles.
 */
export function useRecentPayouts() {
  const invalidate = useInvalidateFinance();
  const query = useQuery({
    queryKey: [...FINANCE_KEY, 'payouts'],
    queryFn: () => expectStatus(api.bankPayouts.recentPayouts(), 200),
    refetchInterval: (q) => (q.state.data?.some(payoutIsOpen) ? POLL_MS : false),
  });
  const open = (query.data ?? []).filter(payoutIsOpen).length;
  const before = useRef(open);
  useEffect(() => {
    if (open < before.current) void invalidate();
    before.current = open;
  }, [open, invalidate]);
  return query;
}

/** RazorpayX setup facts; the low-balance banner reads them. Only for people who can send. */
export function usePayoutSetup(enabled: boolean) {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'payout-setup'],
    queryFn: () => expectStatus(api.bankPayouts.payoutSetup(), 200),
    enabled,
  });
}

/** Sends a bank transfer: all that is left, or a part of it. */
export function useSendPayout() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { billId: string; amountPaise: number }) =>
      expectStatus(
        api.bankPayouts.sendPayout({
          params: { id: input.billId },
          body: { amountPaise: input.amountPaise },
        }),
        201,
      ),
    onSettled: () => invalidate(),
  });
}

export function useAskToSend() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { billId: string; amountPaise: number }) =>
      expectStatus(
        api.bankPayouts.requestPayout({
          params: { id: input.billId },
          body: { amountPaise: input.amountPaise },
        }),
        201,
      ),
    onSettled: () => invalidate(),
  });
}

export function useWithdrawRequest() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (billId: string) =>
      expectStatus(api.bankPayouts.withdrawPayoutRequest({ params: { id: billId } }), 204),
    onSettled: () => invalidate(),
  });
}

/** Practice mode only: ends a practice payout the way a real webhook would. */
export function usePracticePayout() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { payout: BankPayout; outcome: 'processed' | 'failed' | 'reversed' }) =>
      expectStatus(
        api.bankPayouts.practicePayout({
          params: { id: input.payout.id },
          body: { outcome: input.outcome },
        }),
        200,
      ),
    onSettled: () => invalidate(),
  });
}
