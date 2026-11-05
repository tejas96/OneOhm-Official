'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { WORKFORCE_KEYS } from '../workforce-keys';

/** Approved points per person, this month and all time, highest first. */
export function useStandings() {
  return useQuery({
    queryKey: WORKFORCE_KEYS.standings,
    queryFn: () => expectStatus(api.rewards.standings(), 200),
  });
}

/** Every points entry, newest first; suggestions are the pending ones. */
export function usePointsEntries() {
  return useQuery({
    queryKey: WORKFORCE_KEYS.pointsList,
    queryFn: () => expectStatus(api.rewards.listPoints({ query: {} }), 200),
  });
}

/**
 * Every entry still waiting for a yes. Asked for on its own: the full list holds only the
 * newest few hundred, so an old suggestion could drop out of it.
 */
export function usePendingPoints() {
  return useQuery({
    queryKey: WORKFORCE_KEYS.pendingPoints,
    queryFn: () => expectStatus(api.rewards.listPoints({ query: { status: 'pending' } }), 200),
  });
}

function useRefreshPoints() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.points }),
        queryClient.invalidateQueries({ queryKey: WORKFORCE_KEYS.workday }),
      ]),
    [queryClient],
  );
}

export function useDecidePoints() {
  const refresh = useRefreshPoints();
  return useCallback(
    async (id: string, approve: boolean) => {
      const decided = await expectStatus(
        api.rewards.decidePoints({ params: { id }, body: { approve } }),
        200,
      );
      await refresh();
      return decided;
    },
    [refresh],
  );
}

export function useGivePoints() {
  const refresh = useRefreshPoints();
  return useCallback(
    async (body: { userId: string; points: number; reason: string }) => {
      const given = await expectStatus(api.rewards.givePoints({ body }), 201);
      await refresh();
      return given;
    },
    [refresh],
  );
}
