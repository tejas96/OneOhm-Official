'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

/** Query keys for the month sheet; the prefix lets one change refresh the sheet and every panel. */
export const MONTH_KEYS = {
  all: ['month-sheet'],
  sheet: (month: string) => ['month-sheet', 'sheet', month] as const,
  person: (month: string, userId: string) => ['month-sheet', 'person', month, userId] as const,
} as const;

/** Everyone the caller may see for the month, amber rows first. */
export function useMonthSheet(month: string) {
  return useQuery({
    queryKey: MONTH_KEYS.sheet(month),
    queryFn: () => expectStatus(api.monthSheet.monthSheet({ query: { month } }), 200),
  });
}

/** One person's month, day by day; waits until a person is chosen. */
export function useMonthPerson(month: string, userId: string | null) {
  return useQuery({
    queryKey: MONTH_KEYS.person(month, userId ?? ''),
    queryFn: () =>
      expectStatus(
        api.monthSheet.monthSheetPerson({ params: { userId: userId ?? '' }, query: { month } }),
        200,
      ),
    enabled: userId !== null,
  });
}

/** Lock, unlock and refresh a row; each refreshes the sheet and the open panels. */
export function useMonthActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MONTH_KEYS.all }),
    [queryClient],
  );
  return {
    lock: useCallback(
      async (month: string) => {
        const sheet = await expectStatus(api.monthSheet.lockMonth({ body: { month } }), 200);
        await refresh();
        return sheet;
      },
      [refresh],
    ),
    unlock: useCallback(
      async (month: string, reason: string) => {
        const sheet = await expectStatus(
          api.monthSheet.unlockMonth({ body: { month, reason } }),
          200,
        );
        await refresh();
        return sheet;
      },
      [refresh],
    ),
    refreshRow: useCallback(
      async (month: string, userId: string) => {
        const person = await expectStatus(
          api.monthSheet.refreshMonthRow({ params: { userId }, body: { month } }),
          200,
        );
        await refresh();
        return person;
      },
      [refresh],
    ),
  };
}
