'use client';

import type { PaymentPage, ReceivedPayment } from '@oneohm/api-contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { usePagedList } from '@/lib/query/use-paged-list';

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

/** Money received, newest first, 30 at a time (more as the person scrolls; PRD 9.3). */
export const usePaymentsReceived = (q = '') =>
  usePagedList<ReceivedPayment, PaymentPage>([...FINANCE_KEY, 'payments', 'page', q], (cursor) =>
    expectStatus(
      api.lists.payments({
        query: { limit: 30, ...(cursor ? { cursor } : {}), ...(q ? { q } : {}) },
      }),
      200,
    ),
  );

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

/** The journal, newest first, a page at a time; `q` searches every entry on the server. */
export const useJournal = (q = '') =>
  useInfiniteQuery({
    queryKey: [...FINANCE_KEY, 'journal', q],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      expectStatus(
        api.finance.listJournal({
          query: { limit: PAGE, ...(pageParam ? { before: pageParam } : {}), ...(q ? { q } : {}) },
        }),
        200,
      ),
    placeholderData: keepPreviousData,
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
