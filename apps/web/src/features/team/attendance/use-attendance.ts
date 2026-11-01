'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { WORKFORCE_KEYS } from '../workforce-keys';

/** Every staff member on one day: check-in, check-out, place and leave. */
export function useTeamAttendance(date: string) {
  return useQuery({
    queryKey: WORKFORCE_KEYS.teamDay(date),
    queryFn: () => expectStatus(api.workforce.teamAttendance({ query: { date } }), 200),
  });
}

/** Corrections waiting for a decision (people with leave.approve). */
export function usePendingCorrections(enabled: boolean) {
  return useQuery({
    queryKey: WORKFORCE_KEYS.corrections,
    queryFn: () =>
      expectStatus(api.workforce.listCorrections({ query: { status: 'pending' } }), 200),
    enabled,
  });
}

/** Approves or declines a correction, then refreshes the days it may change. */
export function useDecideCorrection() {
  const queryClient = useQueryClient();
  return useCallback(
    async (id: string, approve: boolean, note: string | null) => {
      const decided = await expectStatus(
        api.workforce.decideCorrection({ params: { id }, body: { approve, note } }),
        200,
      );
      await queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.attendance });
      return decided;
    },
    [queryClient],
  );
}
