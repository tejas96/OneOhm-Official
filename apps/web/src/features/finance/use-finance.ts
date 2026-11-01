'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const FINANCE_KEY = ['finance'] as const;
export type PayableFilter = 'open' | 'pending' | 'approved' | 'paid' | 'all';

export const useFinanceOverview = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'overview'],
    queryFn: () => expectStatus(api.finance.getOverview(), 200),
  });

export const useReceivables = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'receivables'],
    queryFn: () => expectStatus(api.finance.listReceivables(), 200),
  });

export const usePaymentsReceived = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'payments'],
    queryFn: () => expectStatus(api.finance.listPayments({ query: { limit: 50 } }), 200),
  });

export const usePayables = (status: PayableFilter) =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'payables', status],
    queryFn: () => expectStatus(api.finance.listPayables({ query: { status } }), 200),
  });

export const useLoans = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'loans'],
    queryFn: () => expectStatus(api.finance.listLoans(), 200),
  });

export const useLenders = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'lenders'],
    queryFn: () => expectStatus(api.finance.listLenders(), 200),
  });

export const useTrialBalance = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'trial-balance'],
    queryFn: () => expectStatus(api.finance.trialBalance(), 200),
  });

const PAGE = 30;

/** The journal, newest first, a page at a time. */
export const useJournal = () =>
  useInfiniteQuery({
    queryKey: [...FINANCE_KEY, 'journal'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      expectStatus(
        api.finance.listJournal({
          query: { limit: PAGE, ...(pageParam ? { before: pageParam } : {}) },
        }),
        200,
      ),
    getNextPageParam: (last) => (last.length === PAGE ? last.at(-1)?.number : undefined),
  });

/** After any money change: finance, the owner's command centre and open projects. */
export function useInvalidateFinance() {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: FINANCE_KEY }),
        client.invalidateQueries({ queryKey: ['command-center'] }),
        client.invalidateQueries({ queryKey: ['project'] }),
      ]),
    [client],
  );
}
