'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { WORKFORCE_KEYS } from '../workforce-keys';

export interface LeaveWindow {
  readonly leaveType: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly halfDay: boolean;
}

/** The signed-in person's day, balances included (needs attendance.mark). */
export function useMyWorkday(enabled: boolean) {
  return useQuery({
    queryKey: WORKFORCE_KEYS.workday,
    queryFn: () => expectStatus(api.workforce.myWorkday(), 200),
    enabled,
    retry: false,
  });
}

export function useMyLeave(enabled: boolean) {
  return useQuery({
    queryKey: WORKFORCE_KEYS.myLeave,
    queryFn: () => expectStatus(api.workforce.myLeave(), 200),
    enabled,
  });
}

/** Everyone's leave, every status (approvers); the queue and history filter it. */
export function useAllLeave(enabled: boolean) {
  return useQuery({
    queryKey: WORKFORCE_KEYS.allLeave,
    queryFn: () => expectStatus(api.workforce.listLeave({ query: {} }), 200),
    enabled,
  });
}

/** What a window of leave would cost and touch, once the dates stop changing. */
export function useLeaveImpact(window: LeaveWindow | null) {
  const settled = useDebouncedValue(window, 300);
  return useQuery({
    queryKey: ['leave', 'impact', settled],
    queryFn: () => {
      if (!settled) throw new Error('No window');
      return expectStatus(api.workforce.leaveImpact({ body: settled }), 200);
    },
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Leave changes balances, attendance and tasks: refresh all of them after a change. */
export function useRefreshLeave() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.leave }),
        queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.workday }),
        queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.attendance }),
      ]),
    [queryClient],
  );
}

export function useCancelLeave() {
  const refresh = useRefreshLeave();
  return useCallback(
    async (id: string) => {
      const cancelled = await expectStatus(api.workforce.cancelLeave({ params: { id } }), 200);
      await refresh();
      return cancelled;
    },
    [refresh],
  );
}

export function useDecideLeave() {
  const refresh = useRefreshLeave();
  return useCallback(
    async (id: string, approve: boolean, note: string | null) => {
      const decided = await expectStatus(
        api.workforce.decideLeave({ params: { id }, body: { approve, note } }),
        200,
      );
      await refresh();
      return decided;
    },
    [refresh],
  );
}
